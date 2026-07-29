# Batch Processing — Implementation Plan

## Overview

Rozszerzenie ClearKYC o masowe przetwarzanie dokumentów KYB. Analityk uploaduje 1–20 plików PDF jednocześnie, system tworzy case per plik, uruchamia równoległą ekstrakcję SSE z kontrolowaną współbieżnością (max 3), i prezentuje dashboard postępu. Decyzja per case pozostaje ręczna w istniejącym widoku case-detail. Zmiana jest wyłącznie frontendowa — backend API nie jest modyfikowany.

## Current State Analysis

Pełny single-case flow działa end-to-end. Kluczowe elementy:

- **Backend API**: `POST /api/cases` (multipart, single file → CreateCaseResponse), `POST /api/cases/:id/analysis` (multipart, SSE stream), `GET /api/cases/:id` (CaseDetail), `GET /api/cases` (CaseSummary[]), `POST /api/cases/:id/finalize` (FinalizePayload → FinalizeResponse)
- **CaseStore**: singleton, signal-based, trzyma stan dokładnie jednego case'a (caseId, status, fields, redFlags, overrides)
- **ExtractionStreamService**: otwiera single fetch() SSE stream per invocation, parsuje eventy przez `extraction.codec`
- **FileDropzoneComponent**: akceptuje dokładnie 1 plik (`files[0]`), walidacja PDF + 50MB
- **PdfStorageService**: IndexedDB cache per caseId (blob storage)
- **Routing**: `/` (landing), `/cases/new` (upload), `/cases/:id` (detail)

## Desired End State

Nowy lazy-loaded moduł `/batch/*` z dwoma widokami:
1. `/batch/new` — multi-file dropzone (1–20 PDF, ≤50MB each), przycisk "Przetwórz wszystkie"
2. `/batch/:batchId` — dashboard z tabelą per-case (status badge, entity name, actions), summary bar ("12/20 done, 2 errors"), przyciski retry/cancel

Batch state persystowany w localStorage (manifest: batchId → caseIds[]). Statusy per-case odtwarzane z `GET /api/cases/:id` po refresh. Max 3 równoległe SSE streams (FIFO queue). Nawigacja do case-detail z batch dashboard nie modyfikuje istniejącego flow.

### Key Discoveries

- `ExtractionStreamService` jest reusable bez zmian — wystarczy wywołać `streamAnalysis()` N razy z concurrency control
- `CaseService.createCase(file)` jest reusable — sequential upload per file
- `PdfStorageService` (IndexedDB) nadaje się do batch PDF cache — save per caseId po create
- HTTP/2 na `ng serve --proxy` → backend localhost:8081 — multiplexing, ale backend może mieć limity (Spring Boot default: 200 threads)
- `CaseStore.recentCases` automatycznie odświeży się po batch (wywołuje `listCases()`) — dashboard po nawigacji do `/cases/new` pokaże nowe case'y
- Angular 22 lazy-loaded routes via `loadChildren` — standard pattern w projekcie

## What We're NOT Doing

- **Backend batch API** — brak nowych endpointów; frontend orchestruje N × single-case calls
- **Bulk decision** — decyzja Approve/Reject/Escalate nadal per-case, ręczna
- **Cross-case synthesis** — brak korelacji między case'ami w batchu
- **Batch export** — brak zbiorczego JSON/CSV ze wszystkich case'ów batchu
- **Batch history** — brak listy zakończonych batchy; tylko aktywny batch w localStorage
- **Modyfikacja case-detail** — zero zmian w istniejącym `/cases/:id` flow
- **Modyfikacja CaseStore** — nowy BatchStore obok, nie rozszerzenie istniejącego
- **Backend rate limiting** — zakładamy że backend obsłuży 3 concurrent SSE; jeśli nie, to osobna zmiana

## Implementation Approach

Frontend-only, bottom-up: najpierw modele i store (warstwa danych), potem orchestration service (logika), potem UI (upload + dashboard), na końcu integracja i testy. Każda faza jest weryfikowalna niezależnie.

## Critical Implementation Details

**Concurrency pool pattern.** `BatchOrchestrationService` zarządza pool of active SSE subscriptions. Implementacja: `Subject<BatchItem>` jako queue, `mergeMap(item => processOne(item), MAX_CONCURRENT)` z RxJS. Gdy stream kończy się (complete/error), slot zwalnia się automatycznie i następny item z queue startuje.

**localStorage persistence.** Manifest format: `clearkyc-batch-{batchId}` → `{ batchId: string, caseIds: string[], createdAt: string, status: 'active' | 'completed' }`. Na refresh: load manifest → per-case `GET /api/cases/:id` → derive status (CREATED=queued, ANALYZING=analyzing, ANALYZED/LOCKED=done). Nie persist per-case extraction fields — to odtworzy case-detail po nawigacji.

**Batch lifecycle.** States: `selecting` (user wybiera pliki) → `uploading` (POST /api/cases per file) → `analyzing` (SSE streams active) → `completed` (all done/error). Per-case states: `pending` → `uploading` → `created` → `queued` → `analyzing` → `done` | `error`.

**AbortController per stream.** Każdy aktywny SSE stream ma swój AbortController. Cancel z UI → `controller.abort()` → stream completes z AbortError → slot zwalnia się → następny z queue.

---

## Phase 1: Models + BatchStore

### Overview

Definicja typów domenowych dla batch processing i signal-based store z localStorage persistence. Fundament danych dla całego modułu.

### Changes Required

#### 1. Batch models

**File**: `web/src/app/core/models/batch.models.ts` (nowy)

**Intent**: Typy opisujące batch i per-case item w batch.

**Contract**:
```typescript
export type BatchItemStatus = 'pending' | 'uploading' | 'created' | 'queued' | 'analyzing' | 'done' | 'error';
export type BatchStatus = 'selecting' | 'uploading' | 'analyzing' | 'completed';

export interface BatchItem {
  file: File;           // source file (transient, not persisted)
  caseId: string | null; // null until POST /api/cases succeeds
  status: BatchItemStatus;
  entityName: string | null;
  error: string | null;
  fieldsCount: number;  // how many fields extracted so far
}

export interface BatchManifest {
  batchId: string;
  caseIds: string[];    // only non-null caseIds persisted
  createdAt: string;    // ISO
}

export interface BatchSummary {
  total: number;
  done: number;
  error: number;
  analyzing: number;
  queued: number;
}
```

#### 2. BatchStore

**File**: `web/src/app/core/store/batch.store.ts` (nowy)

**Intent**: Signal-based store zarządzający stanem batchu. Oddzielony od CaseStore. Persystuje manifest w localStorage.

**Contract**:
```typescript
@Injectable({ providedIn: 'root' })
export class BatchStore {
  // State
  readonly batchId = signal<string | null>(null);
  readonly items = signal<BatchItem[]>([]);
  readonly batchStatus = signal<BatchStatus>('selecting');

  // Computed
  readonly summary = computed<BatchSummary>(() => { /* derive from items */ });
  readonly isComplete = computed(() => this.items().every(i => i.status === 'done' || i.status === 'error'));

  // Actions
  initBatch(files: File[]): void;           // generate batchId, create items[], persist manifest
  updateItem(index: number, patch: Partial<BatchItem>): void;
  setCaseId(index: number, caseId: string): void;
  markItemStatus(index: number, status: BatchItemStatus, error?: string): void;
  incrementFields(index: number): void;
  persistManifest(): void;                  // save to localStorage
  loadManifest(batchId: string): boolean;   // restore from localStorage, returns false if not found
  reset(): void;
}
```

**localStorage key**: `clearkyc-batch-{batchId}`
**localStorage value**: JSON `BatchManifest`

Active batch pointer: `clearkyc-active-batch` → `batchId` string (allows finding active batch on app reload).

### Success Criteria

#### Automated Verification

- `ng build` — compiles without errors
- Unit test `batch.store.spec.ts`: initBatch creates items, persistManifest writes to localStorage, loadManifest restores caseIds, summary computed correctly

#### Manual Verification

- N/A (no UI yet)

---

## Phase 2: Batch Orchestration Service

### Overview

Serwis koordynujący upload N plików i równoległą analizę z concurrency pool (max 3). Reusuje istniejące `CaseService` i `ExtractionStreamService` bez modyfikacji.

### Changes Required

#### 1. BatchOrchestrationService

**File**: `web/src/app/core/services/batch-orchestration.service.ts` (nowy)

**Intent**: Orchestracja dwóch faz: (1) sequential upload (POST /api/cases per file), (2) concurrent analysis (SSE streams, max 3 parallel).

**Contract**:
```typescript
@Injectable({ providedIn: 'root' })
export class BatchOrchestrationService {
  private readonly caseService = inject(CaseService);
  private readonly extractionStream = inject(ExtractionStreamService);
  private readonly batchStore = inject(BatchStore);
  private readonly pdfStorage = inject(PdfStorageService);

  private readonly MAX_CONCURRENT = 3;
  private activeControllers = new Map<number, AbortController>();

  // Phase 1: Upload all files sequentially (create cases)
  startUpload(): void;
  // - Iterates batchStore.items()
  // - For each: mark 'uploading' → POST /api/cases → mark 'created', setCaseId
  // - On error: mark 'error', continue with next
  // - After all: persist manifest, start analysis phase

  // Phase 2: Analyze with concurrency pool
  startAnalysis(): void;
  // - Collect items with status 'created' → mark 'queued'
  // - Feed into Subject, mergeMap(item => analyzeOne(item), MAX_CONCURRENT)
  // - Per item: mark 'analyzing' → streamAnalysis(caseId, file) → on FieldExtracted: incrementFields
  // - On AnalysisComplete: mark 'done', set entityName from first field
  // - On error: mark 'error'
  // - When all complete: batchStatus → 'completed'

  // Cancel a queued/analyzing item
  cancelItem(index: number): void;

  // Retry a failed item (re-run analysis)
  retryItem(index: number): void;

  // Cancel all remaining
  cancelAll(): void;

  // Restore batch after refresh (load manifest, re-fetch statuses)
  restoreBatch(batchId: string): Observable<void>;
}
```

**Upload strategy**: Sequential, not parallel. Reason: upload to `/api/cases` is fast (no LLM), and sequential avoids overwhelming backend with N simultaneous multipart requests. The expensive part (SSE analysis) is where concurrency control matters.

**Analysis concurrency**: RxJS `from(queuedItems).pipe(mergeMap(item => analyzeOne(item), this.MAX_CONCURRENT))`. Each `analyzeOne()` returns an Observable that completes when SSE stream ends.

**Entity name detection**: First `FieldExtracted` event with `fieldName === 'companyName'` → store as `entityName` on the batch item (for display in dashboard).

#### 2. Unit tests

**File**: `web/src/app/core/services/batch-orchestration.service.spec.ts` (nowy)

**Intent**: Test concurrency control, error handling, cancel behavior.

**Contract**:
- `startUpload` calls `caseService.createCase` for each item
- `startAnalysis` respects MAX_CONCURRENT (only 3 active at a time)
- `cancelItem` aborts the SSE stream for that item
- `retryItem` re-queues a failed item
- Upload failure marks item as error but continues with others

### Success Criteria

#### Automated Verification

- `ng build` — compiles without errors
- `ng test` — orchestration tests pass (mock CaseService + ExtractionStreamService)

#### Manual Verification

- N/A (no UI yet, but can verify via console if injected manually)

---

## Phase 3: UI — Batch Upload

### Overview

Nowy widok `/batch/new` z multi-file dropzone, listą wybranych plików, i przyciskiem start. Lazy-loaded routing.

### Changes Required

#### 1. Batch routes

**File**: `web/src/app/features/batch/batch.routes.ts` (nowy)

**Intent**: Lazy-loaded routes dla batch module.

**Contract**:
```typescript
export const batchRoutes: Routes = [
  {
    path: 'new',
    loadComponent: () => import('./batch-upload/batch-upload.component').then(m => m.BatchUploadComponent),
    canActivate: [authGuard],
  },
  {
    path: ':batchId',
    loadComponent: () => import('./batch-dashboard/batch-dashboard.component').then(m => m.BatchDashboardComponent),
    canActivate: [authGuard],
  },
];
```

#### 2. App routes update

**File**: `web/src/app/app.routes.ts` (modify)

**Intent**: Dodanie lazy-loaded batch routes.

**Contract**: Add before wildcard route:
```typescript
{
  path: 'batch',
  loadChildren: () => import('./features/batch/batch.routes').then(m => m.batchRoutes),
},
```

#### 3. BatchDropzoneComponent

**File**: `web/src/app/features/batch/components/batch-dropzone/batch-dropzone.component.ts` (nowy)
**Files**: `...component.html`, `...component.scss`

**Intent**: Multi-file dropzone accepting 1–20 PDF files. Visual feedback for drag-over, validation errors per file.

**Contract**:
- Input: none
- Output: `@Output() filesSelected = new EventEmitter<File[]>()`
- Behavior: `ondrop` → `event.dataTransfer.files` (all files, not just [0])
- Validation per file: must be `application/pdf`, must be ≤50MB
- Validation batch: max 20 files total
- Error display: inline per-file errors (wrong type, too large), batch error (too many)
- Styling: reuse design tokens from existing dropzone, larger drop area with "Upuść pliki PDF lub kliknij" label
- Accessibility: `role="button"`, `aria-label`, keyboard accessible file picker (hidden input with `multiple`)

#### 4. BatchUploadComponent

**File**: `web/src/app/features/batch/batch-upload/batch-upload.component.ts` (nowy)
**Files**: `...component.html`, `...component.scss`

**Intent**: Main upload view — dropzone + file list + start button.

**Contract**:
- Uses `BatchDropzoneComponent` for file selection
- Displays selected files as a list: filename, size, remove button per file
- "Dodaj więcej" link to add additional files (up to 20 total)
- "Przetwórz wszystkie (N)" primary button — disabled if no files
- On click: `batchStore.initBatch(files)` → `orchestration.startUpload()` → `router.navigate(['/batch', batchId])`
- Shows validation summary if any files rejected
- Back link to `/cases/new`

### Success Criteria

#### Automated Verification

- `ng build` — compiles without errors
- Route `/batch/new` resolves (no 404)
- `ng test` — BatchDropzoneComponent emits files on valid drop

#### Manual Verification

- Navigate to `/batch/new` → see multi-file dropzone
- Drop 3 PDFs → see file list with names and sizes
- Remove a file → list updates
- Drop a .docx → see inline error
- Drop 21 files → see "max 20" error

---

## Phase 4: UI — Batch Dashboard

### Overview

Widok `/batch/:batchId` — tabela postępu per-case z status badges, summary bar, i akcjami (view, retry, cancel).

### Changes Required

#### 1. BatchProgressRowComponent

**File**: `web/src/app/features/batch/components/batch-progress-row/batch-progress-row.component.ts` (nowy)
**Files**: `...component.html`, `...component.scss`

**Intent**: Pojedynczy wiersz w tabeli batch — nazwa pliku, status badge, entity name (gdy dostępne), fields count, akcje.

**Contract**:
- Input: `@Input() item: BatchItem`, `@Input() index: number`
- Output: `@Output() retry = new EventEmitter<number>()`, `@Output() cancel = new EventEmitter<number>()`, `@Output() open = new EventEmitter<string>()`
- Status badge colors: pending (gray), uploading (blue), queued (yellow), analyzing (blue pulse), done (green), error (red)
- Entity name: shown when available (from first FieldExtracted companyName)
- Fields progress: "5 pól" counter (increments live during analysis)
- Actions:
  - `done` → "Otwórz case" link button
  - `error` → "Ponów" retry button
  - `queued` / `analyzing` → "Anuluj" cancel button
- Accessibility: status communicated via `aria-label` on badge

#### 2. BatchDashboardComponent

**File**: `web/src/app/features/batch/batch-dashboard/batch-dashboard.component.ts` (nowy)
**Files**: `...component.html`, `...component.scss`

**Intent**: Główny widok batch — summary bar + table of items + navigation.

**Contract**:
- Reads `batchStore.items()`, `batchStore.summary()`, `batchStore.batchStatus()`
- Summary bar: "Przetwarzanie: 12/20 gotowych, 2 błędy, 6 w kolejce" (reactive, updates live)
- Overall progress bar (% done based on summary)
- Table/list of `BatchProgressRowComponent` instances
- Actions:
  - "Ponów wszystkie błędne" button (visible when summary.error > 0)
  - "Anuluj pozostałe" button (visible when summary.queued > 0 || summary.analyzing > 0)
  - "Nowy batch" link → `/batch/new` (visible when batch completed)
  - "Lista spraw" link → `/cases/new` (to see recent cases)
- On mount: if `batchStore.batchId()` !== route param `batchId` → attempt `orchestration.restoreBatch(batchId)`
- If restore fails (no manifest in localStorage) → redirect to `/batch/new`

#### 3. Navigation integration

**File**: `web/src/app/features/batch/batch-dashboard/batch-dashboard.component.ts`

**Intent**: Handle "Open case" action from row.

**Contract**: `onOpenCase(caseId: string)` → `router.navigate(['/cases', caseId])`. No changes to case-detail needed — it loads case by route param independently.

### Success Criteria

#### Automated Verification

- `ng build` — compiles without errors
- `ng test` — BatchDashboardComponent renders items from store, summary updates reactively

#### Manual Verification

- Navigate to `/batch/:batchId` → see dashboard with items
- Items show correct status badges (update live during analysis)
- Summary bar counts are correct and update as items progress
- "Otwórz case" navigates to `/cases/:id` (existing detail view loads correctly)
- "Ponów" retries a failed item
- "Anuluj" cancels a queued item
- Page refresh → dashboard restores from localStorage + API

---

## Phase 5: Integration & Edge Cases

### Overview

Połączenie wszystkich elementów, obsługa edge cases, nawigacja między batch a single-case flow, restore po refresh.

### Changes Required

#### 1. Batch restore logic

**File**: `web/src/app/core/services/batch-orchestration.service.ts` (modify)

**Intent**: Implementacja `restoreBatch()` — odtworzenie stanu batch po page refresh.

**Contract**:
- Load manifest from localStorage by batchId
- For each caseId in manifest: `GET /api/cases/:id` → derive status:
  - `CREATED` → `queued` (re-queue for analysis if user clicks "Resume")
  - `ANALYZING` → `analyzing` (stream may have ended — treat as `queued` for re-analysis)
  - `ANALYZED` → `done`
  - `LOCKED` → `done`
- Populate `batchStore.items()` with restored data (without File reference — file is gone after refresh)
- For items without File: analysis cannot be re-triggered (file needed for SSE POST); mark as "requires re-upload" or skip
- **Design decision**: After refresh, items that were not yet analyzed cannot be retried (file lost). Show "Plik niedostępny — prześlij ponownie" status. Items already analyzed (ANALYZED/LOCKED) show correct status.

#### 2. PDF blob persistence during upload

**File**: `web/src/app/core/services/batch-orchestration.service.ts` (modify)

**Intent**: Save PDF blob to IndexedDB immediately after successful case creation, so it survives refresh for potential retry.

**Contract**: After `caseService.createCase(file)` succeeds → `pdfStorageService.save(caseId, file)`. On retry after refresh: `pdfStorageService.load(caseId)` → if blob available, can retry analysis.

#### 3. Navigation guard — unsaved batch warning

**File**: `web/src/app/features/batch/batch.guard.ts` (nowy)

**Intent**: Warn user if navigating away from batch dashboard while analysis is in progress.

**Contract**: `canDeactivate` guard on batch-dashboard route. If `batchStore.batchStatus() === 'analyzing'` → `confirm('Analiza w toku. Opuścić stronę?')`. If confirmed → `orchestration.cancelAll()`.

#### 4. Landing page / case-new link to batch

**File**: `web/src/app/features/case-new/case-new.component.html` (modify)

**Intent**: Dodanie linku "Przetwarzanie masowe" z case-new do batch-new.

**Contract**: Below existing dropzone, add: `<a routerLink="/batch/new" class="batch-link">Przetwarzanie masowe (wiele plików)</a>`. Styled as secondary link, not competing with primary single-file flow.

#### 5. Error recovery — partial upload failure

**File**: `web/src/app/core/services/batch-orchestration.service.ts` (covered in Phase 2 but verified here)

**Intent**: Ensure upload failure for file N doesn't block files N+1..M.

**Contract**: `startUpload()` catches per-file errors, marks item as `error`, continues loop. At end: only items with `status === 'created'` enter analysis queue.

### Success Criteria

#### Automated Verification

- `ng build` — compiles without errors
- `ng test` — restore logic correctly derives status from API response
- `ng test` — canDeactivate guard shows confirm when analyzing

#### Manual Verification

- Start batch of 5 files → while analyzing, refresh page → dashboard restores with correct statuses
- Already-analyzed items show "done" after restore
- Not-yet-analyzed items without cached PDF show "Plik niedostępny"
- Items with cached PDF (IndexedDB) can be retried after refresh
- Navigate away during analysis → see confirmation dialog
- From `/cases/new` → click "Przetwarzanie masowe" → arrive at `/batch/new`

---

## Phase 6: Testing

### Overview

Unit testy dla store i orchestration, component tests dla kluczowych UI, opcjonalny e2e happy path.

### Changes Required

#### 1. BatchStore unit tests

**File**: `web/src/app/core/store/batch.store.spec.ts` (nowy)

**Intent**: Pokrycie logiki store: init, update, persist, restore, computed summary.

**Contract**:
- `initBatch(files)` → creates items with pending status, generates batchId
- `markItemStatus(i, 'done')` → summary.done increments
- `persistManifest()` → localStorage contains correct JSON
- `loadManifest(batchId)` → restores caseIds from localStorage
- `reset()` → clears all state

#### 2. BatchOrchestrationService integration tests

**File**: `web/src/app/core/services/batch-orchestration.service.spec.ts` (nowy)

**Intent**: Weryfikacja concurrency, error handling, cancel.

**Contract**:
- With 5 items and MAX_CONCURRENT=3: only 3 `streamAnalysis` calls active simultaneously
- When one completes → 4th starts
- `cancelItem(i)` → AbortController for that item is aborted
- Upload error for item 2 → items 1,3,4,5 still process
- `retryItem(i)` → item re-enters queue

#### 3. Component tests

**File**: `web/src/app/features/batch/components/batch-dropzone/batch-dropzone.component.spec.ts` (nowy)

**Intent**: Dropzone validation logic.

**Contract**:
- Drop valid PDF files → emits filesSelected with File[]
- Drop .docx → does not emit, shows error
- Drop 21 files → shows "max 20" error
- Drop file >50MB → shows size error for that file

#### 4. E2E test (optional, Playwright)

**File**: `web/e2e/batch-upload.spec.ts` (nowy)

**Intent**: Happy-path e2e: upload 2 PDFs → batch completes → navigate to case.

**Contract**:
- Navigate to `/batch/new`
- Upload 2 sample PDFs (from `public/demo/`)
- Click "Przetwórz wszystkie"
- Wait for batch dashboard to show 2/2 done
- Click "Otwórz case" on first item
- Verify case-detail loads with extracted fields

### Success Criteria

#### Automated Verification

- `ng test` — all new specs pass
- `npx playwright test batch-upload.spec.ts` — e2e passes (if backend available)

#### Manual Verification

- N/A (covered by automated tests)

---

## Testing Strategy

### Unit Tests

- `batch.store.spec.ts` — state management, persistence, computed signals
- `batch-orchestration.service.spec.ts` — concurrency pool, error recovery, cancel
- `batch-dropzone.component.spec.ts` — file validation, multi-file emission

### Integration Tests

- E2e Playwright: upload → batch dashboard → case navigation

### Manual Testing Steps

1. `ng serve` → navigate to `/batch/new`
2. Drop 3–5 sample PDFs from `public/demo/`
3. Click "Przetwórz wszystkie" → observe upload phase → dashboard
4. Verify max 3 concurrent (network tab shows 3 active SSE)
5. Wait for completion → summary shows "5/5 done"
6. Click "Otwórz case" → case-detail loads correctly with extraction data
7. Go back → dashboard still shows completed batch
8. Refresh page → dashboard restores
9. Test error: stop backend mid-batch → affected items show error → retry works

## Performance Considerations

- **Memory**: PDF blobs stored in IndexedDB (not in-memory signals) to avoid OOM with 20 × 50MB files
- **Network**: Max 3 concurrent SSE streams; upload phase is sequential (one POST at a time)
- **DOM**: Virtual scroll not needed for ≤20 items; simple `@for` loop sufficient
- **Signals**: Batch items stored as single array signal with immutable updates (`update(items => [...items]`); per-item granularity not needed at ≤20 scale

## Migration Notes

Brak migracji danych. Nowy moduł dodawany obok istniejącego flow. Istniejące localStorage nie jest dotykane (nowy prefix `clearkyc-batch-`). Istniejące IndexedDB (`clearkyc-pdf-cache`) reusowane z nową konwencją klucza (caseId).

## References

- Research: `context/changes/batch-processing/research.md`
- Plan brief: `context/changes/batch-processing/plan-brief.md`
- Existing single-case flow: `src/app/features/case-new/`, `src/app/features/case-detail/`
- ExtractionStreamService: `src/app/core/services/extraction-stream.service.ts`
- CaseStore: `src/app/core/store/case.store.ts`
- PdfStorageService: `src/app/core/services/pdf-storage.service.ts`
- PRD: `context/foundation/prd.md` (FR-004 single-PDF expanded to batch)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Models + BatchStore

#### Automated

- [x] 1.1 `ng build` compiles with new models and store — 9a080e7
- [x] 1.2 `ng test` — batch.store.spec.ts passes (23 tests) — 9a080e7

### Phase 2: Batch Orchestration Service

#### Automated

- [x] 2.1 `ng build` compiles with orchestration service — 9a080e7
- [x] 2.2 `ng test` — batch-orchestration.service.spec.ts passes (19 tests) — 9a080e7

### Phase 3: UI — Batch Upload

#### Automated

- [x] 3.1 `ng build` compiles with batch-upload and batch-dropzone components — 9a080e7
- [x] 3.2 Route `/batch/new` resolves (lazy-loaded) — 9a080e7
- [x] 3.3 `ng test` — batch-dropzone.component.spec.ts passes (9 tests) — 9a080e7

#### Manual

- [ ] 3.4 Navigate to `/batch/new`, drop files, see file list, remove files
- [ ] 3.5 Validation errors display correctly (wrong type, too large, too many)

### Phase 4: UI — Batch Dashboard

#### Automated

- [x] 4.1 `ng build` compiles with batch-dashboard and progress-row components — 9a080e7
- [x] 4.2 `ng test` — dashboard renders items, summary updates — 9a080e7

#### Manual

- [ ] 4.3 Start batch → dashboard shows live progress with status badges
- [ ] 4.4 "Otwórz case" navigates to case-detail correctly
- [ ] 4.5 "Ponów" retries failed item, "Anuluj" cancels queued item

### Phase 5: Integration & Edge Cases

#### Automated

- [x] 5.1 `ng build` — full integration compiles — 9a080e7
- [x] 5.2 `ng test` — restore logic, canDeactivate guard tests pass — 9a080e7

#### Manual

- [ ] 5.3 Page refresh → batch restores from localStorage + API
- [ ] 5.4 Navigation guard fires during active analysis
- [ ] 5.5 Link "Przetwarzanie masowe" visible on `/cases/new`
- [ ] 5.6 Partial upload failure → remaining files continue

### Phase 6: Testing

#### Automated

- [x] 6.1 `ng test` — all batch-related specs pass (store 23, service 19, dropzone 9 = 51 tests) — 9a080e7
- [x] 6.2 Playwright e2e `batch-upload.spec.ts` passes (if backend available) — 9a080e7
