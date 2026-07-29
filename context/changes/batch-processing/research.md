---
date: 2026-07-24T08:25:00+02:00
researcher: Kiro CLI
git_commit: HEAD
branch: main
repository: 10xdevs
topic: "batch-processing — analiza architektury i ograniczeń przed planowaniem"
tags: [research, batch, multi-upload, sse, concurrency, angular, spring-boot]
status: complete
last_updated: 2026-07-24
last_updated_by: Kiro CLI
---

# Research: batch-processing — analiza architektury i ograniczeń

**Date**: 2026-07-24T08:25:00+02:00
**Researcher**: Kiro CLI
**Branch**: main

## Research Question

Jak wygląda obecna architektura single-case flow i jakie ograniczenia techniczne/architektoniczne istnieją dla masowego przetwarzania dokumentów? Jakie wzorce batch processing są dostępne w Angular/Spring Boot ekosystemie?

## Summary

Obecna architektura jest ściśle single-case: jeden upload → jeden POST → jeden SSE stream → jeden CaseStore (singleton). Główne wyzwania dla batch: (1) CaseStore jest singletonem trzymającym stan jednego case'a, (2) ExtractionStreamService otwiera jeden fetch/SSE per invocation, (3) backend API nie ma batch endpointu, (4) file-dropzone akceptuje jeden plik. Rozwiązanie wymaga: nowego batch store'a (niezależnego od single-case CaseStore), batch API endpointu na backendzie (lub orchestracji N×POST po stronie frontendu), concurrent SSE connections (max ~6 per domain w HTTP/1.1, nieograniczone w HTTP/2), i nowego UI modułu (batch dashboard + batch upload). Istniejący case-detail flow pozostaje niezmieniony — batch tworzy case'y i monitoruje, ale decyzja per-case nadal odbywa się w istniejącym widoku.

---

## Detailed Findings

### 1. Obecne API i flow

#### Backend endpoints (znane z proxy.conf.json → localhost:8081):
| Method | Path | Body | Response | Uwagi |
|--------|------|------|----------|-------|
| POST | `/api/cases` | multipart (file) | `CreateCaseResponse {id, status, createdAt}` | Tworzy case + upload PDF |
| GET | `/api/cases` | — | `CaseSummary[]` | Lista case'ów |
| GET | `/api/cases/:id` | — | `CaseDetail` | Szczegóły case'a |
| GET | `/api/cases/:id/document` | — | Blob (PDF) | Pobranie PDF |
| POST | `/api/cases/:id/analysis` | multipart (file) | SSE stream | Uruchamia ekstrakcję |
| POST | `/api/cases/:id/finalize` | FinalizePayload | FinalizeResponse | Zamyka case |

#### Flow single-case:
1. User wybiera/dropuje PDF → `CaseService.createCase(file)` → POST `/api/cases`
2. Router nawiguje do `/cases/:id`
3. `CaseDetailComponent.ngOnInit()` → `CaseService.getCase(id)` + `CaseService.getPdfDocument(id)`
4. User klika "Analyze" → `ExtractionStreamService.streamAnalysis(caseId, pdfFile)` → POST SSE
5. SSE events parsowane przez `extraction.codec` → `CaseStore` signals update
6. User robi review pól, override'y → klika decision → `DecisionService.finalize()`

### 2. CaseStore — singleton, single-case design

```typescript
@Injectable({ providedIn: 'root' })
export class CaseStore {
  readonly caseId = signal<string | null>(null);
  readonly caseStatus = signal<CaseStatus>('CREATED');
  readonly extractionFields = signal<ExtractionField[]>([]);
  // ... inne signale per single case
}
```

**Ograniczenie**: Store trzyma stan dokładnie jednego case'a. Przełączanie case'ów wymaga `reset()`. Batch wymaga osobnego mechanizmu śledzenia N case'ów jednocześnie.

**Decyzja**: CaseStore zostaje niezmieniony. Batch dodaje nowy `BatchStore` do śledzenia batch metadata (lista case IDs, per-case status, progress). Nawigacja do konkretnego case'a z batch dashboardu nadal używa istniejącego CaseStore + case-detail.

### 3. ExtractionStreamService — SSE per case

```typescript
streamAnalysis(caseId: string, pdfFile: File): Observable<ExtractionEvent>
```

Otwiera `fetch()` z `AbortController`. Czyta `response.body` jako ReadableStream. Parsuje SSE eventy.

**Ograniczenie**: Jeden stream per invocation. Dla batch trzeba otworzyć N streamów równolegle.

**Limit przeglądarki**: HTTP/1.1 — max 6 concurrent connections per domain. HTTP/2 — multiplexing, limit ~100 streams. `ng serve` z proxy → backend na localhost:8081 — zależy od konfiguracji backendu.

**Decyzja**: Frontend orchestruje batch concurrency (np. max 3 równoległy streams), kolejkuje resztę. Nie wymaga zmian w ExtractionStreamService — wystarczy wywołać go N razy z throttlingiem.

### 4. FileDropzoneComponent — single file

```typescript
onDrop(event: DragEvent): void {
  const file = event.dataTransfer?.files[0]; // ← tylko pierwszy plik
}
```

**Ograniczenie**: Akceptuje dokładnie 1 plik (`.files[0]`). Walidacja: tylko PDF, max 50MB.

**Decyzja**: Nowy `BatchDropzoneComponent` (lub parametryzacja istniejącego) akceptujący `files` (FileList) zamiast single file. Walidacja per-file zachowana (PDF + 50MB), ale dopuszcza N plików.

### 5. Backend — brak batch API

Backend obsługuje wyłącznie `POST /api/cases` z jednym plikiem. Nie ma:
- Endpointu przyjmującego wiele plików
- Konceptu "batch" / "batch_id" grupującego case'y
- Statusu zbiorczego batch

**Dwa podejścia**:

| Podejście | Opis | Pros | Cons |
|-----------|------|------|------|
| A. Frontend orchestration | Frontend wysyła N × `POST /api/cases`, potem N × `POST /api/cases/:id/analysis`. Backend nie zmieniony. | Zero zmian w backendzie, prostota | Brak batch grouping w DB, brak retry po refresh, stan batch żyje tylko w pamięci przeglądarki |
| B. Backend batch API | Nowy endpoint `POST /api/batches` (multipart N plików) → zwraca `batchId` + listę case IDs. Backend tworzy case'y, orchestruje analizy, emituje batch SSE. | Persisted batch, retry, monitoring po stronie serwera | Wymaga pracy backend, nowy domain concept |

**Rekomendacja**: Podejście A (frontend orchestration) na start — backend nie istnieje jako gotowy serwis do modyfikacji (to Spring Boot z minimalnymi endpointami, patrz CLAUDE.md "everything PRD-mandated is unimplemented"). Batch grouping po stronie frontendu (localStorage/sessionStorage z batchId → caseIds mapping). Podejście B jako follow-up gdy backend dojrzeje.

### 6. Concurrent SSE — limity i strategie

**Problem**: Jeśli user uploaduje 20 plików i chce je analizować równolegle, 20 otwartych SSE streams może:
- Przekroczyć limit połączeń przeglądarki (HTTP/1.1: 6)
- Przeciążyć backend (LLM calls kosztują)
- Wyczerpać pamięć (20 × ReadableStream buffer)

**Strategia**: Controlled concurrency pool:
- `MAX_CONCURRENT_ANALYSES = 3` (konfigurowalne)
- Reszta czeka w queue (FIFO)
- Gdy stream kończy się (complete/error) → następny z queue startuje
- Angular: `mergeMap` z concurrency limit lub custom pool

### 7. Batch Dashboard — UX patterns

Wzorce z analogicznych produktów (Gmail attachment upload, Figma multi-file import, Dropbox batch upload):
- **Upload phase**: Lista plików z progress bar per file (upload do serwera)
- **Analysis phase**: Per-case status badge (Queued → Analyzing → Done / Error)
- **Summary bar**: "12/20 analyzed, 2 errors, 6 queued"
- **Actions**: "View case" link per row, "Retry failed" button, "Cancel queued"
- **Persistence**: Batch state survives page refresh (minimum: case IDs w localStorage, status re-fetched via GET /api/cases)

### 8. Routing — nowy moduł

Obecne routes:
```
/           → LandingComponent
/cases/new  → CaseNewComponent (single upload)
/cases/:id  → CaseDetailComponent
```

Batch potrzebuje:
```
/batch/new       → BatchUploadComponent (multi-file dropzone + start)
/batch/:batchId  → BatchDashboardComponent (status, progress, links to cases)
```

`/cases/:id` pozostaje bez zmian — batch dashboard linkuje do niego.

### 9. Istniejące wzorce w codebase godne reuse

| Element | Reuse w batch |
|---------|---------------|
| `FileDropzoneComponent` | Bazowy UX dropzone — rozszerzyć o multi lub stworzyć wariant |
| `ExtractionStreamService` | Bez zmian — wywoływany N razy z concurrency control |
| `CaseService.createCase()` | Bez zmian — wywoływany N razy |
| `CaseService.listCases()` | Do statusu batch case'ów (albo per-ID polling) |
| `extraction.codec` | Bez zmian — parsowanie SSE eventów |
| `CaseStore.recentCases` | Batch dashboard może refreshować recent cases po zakończeniu |
| Badge/status patterns z `case-new.component` | Reuse CSS classes i formatowanie |

### 10. Ograniczenia i ryzyka

| Ryzyko | Impact | Mitygacja |
|--------|--------|-----------|
| Browser memory (20 × PDF Blob w pamięci) | Crash na słabych maszynach | Stream-to-IndexedDB per case, nie trzymać w memory |
| Backend rate limiting / LLM cost | 20 równoległych LLM calls | Frontend concurrency pool (max 3) |
| Lost batch state on refresh | User traci widok progress | Persist batch manifest w localStorage, re-derive status z GET /api/cases per ID |
| Upload failure mid-batch | Część plików nie utworzy case | Per-file retry, partial success UI |
| SSE connection drop | Case stuck w ANALYZING | Timeout + retry logic (existing: brak) |

---

## Conclusions & Recommendations

1. **Nie modyfikować istniejącego single-case flow** — batch to nowy moduł obok, nie refactor.
2. **Frontend orchestration** (podejście A) — backend bez zmian, batch logic w Angular.
3. **Nowy `BatchStore`** (signal-based) — trzyma listę case IDs, per-case status, concurrency queue.
4. **Concurrency pool** — max 3 równoległe SSE streams, FIFO queue.
5. **Persist batch manifest** — localStorage z `{batchId, caseIds[], createdAt}` — umożliwia resume po refresh.
6. **Nowy route module** — `/batch/new` + `/batch/:batchId`, lazy-loaded.
7. **Multi-file dropzone** — nowy komponent lub parametryzacja istniejącego.
8. **Decyzje nadal per-case** — batch dashboard to "launch pad", nie zastępuje case-detail.
