# S-01: Core Case Flow — Plan Brief

> Full plan: `context/changes/core-case-flow/plan.md`
> Research: `context/changes/core-case-flow/research.md`

## What & Why

Implementacja minimalnego end-to-end flow KYB zgodnie z PRD North Star (S-01): upload PDF tworzy case, analityk triggeruje ekstrakcję LLM przez SSE stream, wyekstrahowane encje pojawiają się ze źródłowymi cytowaniami w formularzu obok PDF viewera, terminal decision (Approve/Reject/Escalate) generuje JSON Schema-zwalidowany rekord audytowy zapisany w DB zanim UI potwierdzi. To pierwszy slice widoczny dla użytkownika — dowód hipotezy produktowej ClearKYC.

## Starting Point

Wszystkie pięć foundations (F-01..F-05) zaimplementowanych. Backend ma: SSE streaming endpoint (`POST /api/cases/{id}/analysis`), domain model (`KybCase`, `AuditRecord`, `CaseStatus`, `DecisionType`), repozytoria, SecurityConfig. Frontend ma: routing (`/cases/new`, `/cases/:id`), Auth0 interceptor, AppLayout split-panel placeholder, 214 tokenów CSS design systemu. Brakuje 3 backendowych endpointów, JSON Schema, i całej warstwy UI.

## Desired End State

Analityk wchodzi na `/cases/new`, uploaduje PDF, trafia na `/cases/{id}` z PDF viewerem po lewej i pustym formularzem po prawej. Klika "Analizuj" — pola (companyName, directors, ubos) streamują z cytowaniami (verbatim quotes). Po zakończeniu: przyciski Approve / Reject / Escalate. Kliknięcie → zapis audytu w DB, blokada formularza, potwierdzenie. Reload strony: baner z file pickerem do ponownego wgrania PDF (blob nie jest persystowany w DB).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| PDF viewer library | pdfjs-dist (lazy-loaded) | Pełna kontrola nad text layer potrzebna dla FR-014 (click-to-cite) w S-02 | Plan |
| Split pane resizer | Pure JS mousedown/move | Zero nowych deps; korzysta z istniejących tokenów `--split-resizer`, `--split-min-pane` | Plan |
| Pane collapsibility | Tak (per PRD FR-009) | PRD jawnie wymaga "resizable, collapsible" | Plan |
| SSE consumption | fetch() + ReadableStream | EventSource nie obsługuje custom headers (JWT); Auth0 interceptor działa tylko dla HttpClient | Research |
| Edit scope S-01 | Read-only (edit = S-02) | FR-010 z mandatory justification to scope S-02; S-01 nie wchodzi w override state management | Plan |
| SSE error UX | Inline baner + retry | Backend resetuje status na CREATED po błędzie — retry jest natywnie obsługiwany | Plan |
| JSON Schema FR-012 | Lenient v0.1 (extractedData: object) | Odporne na zmiany nazw pól przy ewolucji promptu LLM | Plan |
| Refresh UX (brak PDF) | Baner re-upload z file pickerem | PDF nie jest persystowany w DB (F-04 decyzja) — in-memory signal reset na reload | Plan |
| Finalizacja ordering | AuditRecord save przed HTTP 200 | PRD §Guardrails: "persisted *before* the UI confirms" | Research |

## Scope

**In scope:**
- FR-004: Upload PDF (drag-drop + file picker), tworzy case
- FR-005: Explicit "Analizuj" trigger
- FR-006: Streaming ekstrakcji (companyName, directors, ubos)
- FR-008: Cytowania per pole (read-only display)
- FR-009: Resizable + collapsible split-pane z embedded PDF viewer
- FR-011: Terminal decision (Approve/Reject/Escalate)
- FR-012: JSON Schema-validated finalization record
- FR-013: AuditRecord w DB przy finalizacji

**Out of scope:**
- FR-010 (edycja pola z mandatory justification) → S-02
- FR-014 (click-to-cite nawigacja PDF + highlight) → S-02
- FR-007 / red flag taxonomy → S-03 (blocked)
- Persystencja PDF w storage → post-MVP
- Frontend unit tests → poza scope S-01

## Architecture / Approach

```
Angular (/cases/new)                Angular (/cases/:id)
FileDropzoneComponent               CaseDetailComponent
       │                                    │
       │ POST /api/cases                    │ GET /api/cases/:id
       ▼                                    ▼
CaseService (HttpClient)         ←─ CaseStore (Signals)
       │                                    │
       │ redirect                           ├─ PdfViewerComponent (pdfjs-dist)
       ▼                                    │     left pane
/cases/:id + blob in CaseStore             └─ ExtractionFormComponent
                                                  │ fetch() + SSE
                            POST /api/cases/:id/analysis
                            POST /api/cases/:id/finalize
                                          │
                            Spring MVC (FinalizeService @Transactional)
                            JSON Schema → AuditRecord → LOCKED
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend API | POST /api/cases, GET, POST /api/cases/{id}/finalize, JSON Schema, @WebMvcTest | FinalizeService ordering (@Transactional musi obejmować obie operacje) |
| 2. Angular services + store | ExtractionStreamService (Fetch API), CaseStore (Signals), CaseService, DecisionService | fetch() + AbortController unsubscription; Auth0 token retrieval |
| 3. CaseNew upload | FileDropzone, redirect do /cases/{id}, PDF in CaseStore | Walidacja multipart (type + size) po stronie frontendu |
| 4. AppLayout + PDF viewer | split resizer, collapse, PdfViewerComponent (pdfjs-dist lazy) | pdfjs-dist worker config w esbuild; bundle budget (500kB warning) |
| 5. ExtractionForm + decision | Streaming SSE consumer, field list, citation badges, error/retry, decision bar, locked view | Pełny end-to-end flow zależy od działającego GOOGLE_GENAI_API_KEY |

**Prerequisites:** F-01..F-05 done (sprawdzone); PostgreSQL Docker Compose uruchomiony; Spring Boot dev profile z ważnym GOOGLE_GENAI_API_KEY dla weryfikacji E2E (lub akceptować AnalysisError)
**Estimated effort:** ~4-6 sesji po 1-2h, 5 faz z weryfikacją manualną między fazami

## Open Risks & Assumptions

- **GOOGLE_GENAI_API_KEY quota**: aktualny klucz ma `limit: 0` na free tier. E2E test streamingu w P5 wymaga ważnego klucza lub zaakceptowania testu przez AnalysisError path.
- **pdfjs-dist bundle size**: ~1MB lazy-loaded; jeśli przekroczy 1MB error budget w `angular.json`, trzeba będzie skonfigurować `allowedCommonJsDependencies` lub dostosować budget.
- **Auth0 JWT w fetch()**: `getAccessTokenSilently()` może rzucić wyjątek jeśli token wygasł i refresh nie powiedzie się — `ExtractionStreamService` musi obsłużyć ten edge case.

## Success Criteria (Summary)

- Analityk może przejść pełny flow od uploadu PDF do decyzji "Approve" w jednej sesji bez opuszczania aplikacji
- `SELECT * FROM audit_record` po finalizacji zwraca wiersz z payload JSONB i statusem LOCKED w kyb_case
- Reload `/cases/{id}` po analizie: baner re-upload → po wyborze PDF pola ekstrakcji są widoczne
