# Batch Processing — Plan Brief

> Full plan: `context/changes/batch-processing/plan.md`
> Research: `context/changes/batch-processing/research.md`

## What & Why

Rozszerzenie ClearKYC o masowe przetwarzanie dokumentów. Analityk uploaduje N plików PDF jednocześnie → system tworzy N case'ów i uruchamia równoległą analizę SSE z kontrolowaną współbieżnością → dashboard batch pokazuje postęp (queued / analyzing / done / error) → analityk wchodzi w każdy case osobno do ręcznej decyzji. Motywacja: real-world KYB review to 5–20 podmiotów w jednej fali onboardingowej; single-file upload wymusza ręczne powtarzanie tego samego flow, co jest friction na drodze do adopcji.

## Starting Point

Pełny single-case flow działa end-to-end: upload → create case → SSE extraction → decision → audit. Backend API: `POST /api/cases` (single file), `POST /api/cases/:id/analysis` (SSE), `GET /api/cases`, `GET /api/cases/:id`. Frontend: `CaseStore` (singleton, single-case), `ExtractionStreamService` (single SSE stream), `FileDropzoneComponent` (single file), routes `/cases/new` i `/cases/:id`.

## Desired End State

Analityk wchodzi na `/batch/new`, dropuje 1–20 plików PDF. System waliduje per-file (PDF, ≤50MB). Klika "Przetwórz wszystkie" → progress view: per-file status (uploading → created → queued → analyzing → done / error). Max 3 równoległe analizy, reszta w queue FIFO. Po zakończeniu batch — summary (N done, M errors). Każdy wiersz ma link "Otwórz case" → nawigacja do istniejącego `/cases/:id` z normalnym case-detail flow. Decyzja per case nadal ręczna. Batch state przeżywa refresh strony (localStorage manifest + re-fetch statusów z API).

## Key Decisions

| Decision | Choice | Why | Alternative considered |
|----------|--------|-----|----------------------|
| Backend changes | Brak — frontend orchestration | Backend nie jest dojrzały, brak batch domain concept; dodanie go to osobna zmiana | Nowy `POST /api/batches` endpoint — odroczony |
| Batch state management | Nowy `BatchStore` (signal-based, `providedIn: 'root'`) | CaseStore jest single-case; mieszanie batch + single state łamie SRP | Rozszerzenie CaseStore o array — zbyt inwazyjne |
| Concurrency control | Max 3 równoległe SSE streams, FIFO queue | HTTP/1.1 limit 6 conn/domain; zostawiamy 3 na inne requesty; LLM backend load | Unlimited (crash na 20 files), max 1 (za wolne) |
| Persistence | localStorage: `{batchId, caseIds[], createdAt}` | Przeżywa refresh; status per-case odtwarzany z `GET /api/cases/:id` | sessionStorage (ginie z tabem), IndexedDB (overkill na metadata) |
| PDF blob storage | IndexedDB via istniejący `PdfStorageService` | Blobs >50MB nie pasują do localStorage; service już istnieje | Memory-only (lost on refresh) |
| Multi-file dropzone | Nowy `BatchDropzoneComponent` | Istniejący emituje single File; zmiana kontraktu złamie case-new | Parametryzacja istniejącego z `[multi]="true"` — możliwe ale ryzyko regresji |
| Routing | `/batch/new`, `/batch/:batchId` — lazy-loaded | Separacja od single-case flow; nie łamie istniejących routes | Nested under `/cases/batch/...` — semantycznie gorsze |
| Batch ID generation | `crypto.randomUUID()` po stronie frontendu | Brak backendu batch — ID tylko do localStorage key | Backend-generated — wymaga nowego API |
| Retry failed | Per-case retry (re-POST analysis) | Granularne; nie trzeba re-uploadować | Retry whole batch — wasteful |
| Case-detail integration | Nawigacja do `/cases/:id` z batch dashboard | Zero zmian w case-detail; CaseStore.reset() + load nowego case'a | Embedded case-detail w batch view — za złożone |

## Scope

**In scope:**
- Multi-file dropzone (1–20 plików, PDF, ≤50MB each)
- Batch upload phase (sequential POST /api/cases per file)
- Batch analysis phase (concurrent SSE, max 3, FIFO queue)
- Batch dashboard (per-case status, progress bar, summary)
- Persist batch manifest (localStorage) + restore on refresh
- Navigation: batch dashboard → case-detail (existing)
- Retry failed analyses
- Cancel queued analyses

**Out of scope:**
- Backend batch API (follow-up)
- Bulk decision (Approve/Reject all) — decyzja ręczna per case
- Cross-case synthesis / deduplication
- Batch export (JSON/CSV ze wszystkich case'ów)
- Batch notifications (email/push po zakończeniu)
- Batch history (lista zakończonych batchy) — minimum viable: only active batch

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  /batch/new                         /batch/:batchId             │
│  BatchUploadComponent               BatchDashboardComponent     │
│       │                                    │                    │
│       │ files[]                             │ batchId            │
│       ▼                                    ▼                    │
│  BatchOrchestrationService ◄──────── BatchStore (signals)       │
│       │                                    │                    │
│       │ 1. createCase() × N                │ per-case status    │
│       │ 2. streamAnalysis() × N (pool=3)   │ progress signals   │
│       ▼                                    │                    │
│  CaseService ──── POST /api/cases          │                    │
│  ExtractionStreamService ── POST SSE       │                    │
│       │                                    │                    │
│       │ events                             │                    │
│       ▼                                    ▼                    │
│  BatchStore.updateCaseStatus(id, status, fields?)               │
│                                                                 │
│  localStorage: { batchId → caseIds[] }                          │
│  IndexedDB: PDF blobs per caseId (via PdfStorageService)        │
└─────────────────────────────────────────────────────────────────┘

Navigation: BatchDashboard row "Open case" → router.navigate(['/cases', caseId])
            → existing CaseDetailComponent (no changes)
```

## New Files (estimated)

| File | Type | Purpose |
|------|------|---------|
| `src/app/features/batch/batch.routes.ts` | Routes | Lazy-loaded batch routes |
| `src/app/features/batch/batch-upload/batch-upload.component.ts` | Component | Multi-file selection + start |
| `src/app/features/batch/batch-dashboard/batch-dashboard.component.ts` | Component | Status dashboard |
| `src/app/features/batch/components/batch-dropzone/batch-dropzone.component.ts` | Component | Multi-file dropzone |
| `src/app/features/batch/components/batch-progress-row/batch-progress-row.component.ts` | Component | Per-case row with status |
| `src/app/core/store/batch.store.ts` | Store | Batch state (signal-based) |
| `src/app/core/services/batch-orchestration.service.ts` | Service | Upload + analysis coordination, concurrency pool |
| `src/app/core/models/batch.models.ts` | Models | BatchItem, BatchStatus, BatchManifest |

## Phases (high-level)

1. **Models + Store** — `batch.models.ts`, `BatchStore` z signals i localStorage persistence
2. **Orchestration Service** — `BatchOrchestrationService` z concurrency pool, reuse CaseService + ExtractionStreamService
3. **UI: Batch Upload** — `BatchDropzoneComponent` + `BatchUploadComponent` + routing
4. **UI: Batch Dashboard** — `BatchDashboardComponent` + `BatchProgressRowComponent` + status polling/restore
5. **Integration** — nawigacja batch→case-detail, retry, cancel, edge cases
6. **Testing** — unit tests dla store + orchestration, e2e dla happy path

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Browser memory (20 PDFs) | Stream PDF blobs to IndexedDB immediately after upload response, don't hold in memory |
| Lost batch on refresh | localStorage manifest + status re-derived from `GET /api/cases/:id` per case |
| Backend overload (LLM cost) | Frontend concurrency pool, configurable max |
| Upload partial failure | Per-file error state, continue with successful ones, retry button |
| SSE connection drops | Timeout detection + auto-retry with exponential backoff (limit 3 retries) |
