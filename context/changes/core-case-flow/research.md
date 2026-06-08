---
date: 2026-06-01T13:45:00+02:00
researcher: Claude Sonnet 4.6
git_commit: bd47c2fa81fe2cd6a56b980928acf7626f37ee9f
branch: main
repository: 10xdevs
topic: "S-01 core-case-flow — codebase baseline before planning"
tags: [research, codebase, s-01, core-case-flow, angular, spring-boot, sse, pdf-viewer, extraction]
status: complete
last_updated: 2026-06-01
last_updated_by: Claude Sonnet 4.6
---

# Research: S-01 core-case-flow — codebase baseline

**Date**: 2026-06-01T13:45:00+02:00
**Researcher**: Claude Sonnet 4.6
**Git Commit**: bd47c2fa81fe2cd6a56b980928acf7626f37ee9f
**Branch**: main
**Repository**: 10xdevs

## Research Question

Co dokładnie istnieje w codebase po zamknięciu F-01..F-05, co trzeba zbudować w S-01 (core-case-flow), i jakie decyzje architektoniczne z poprzednich faz są wiążące?

## Summary

Wszystkie pięć foundations (F-01..F-05) jest zaimplementowanych i zreviewowanych. S-01 buduje na czystym, spójnym fundamencie. Backend ma już SSE streaming (`ExtractionController`, `ExtractionService`), domain model (`KybCase`, `AuditRecord`, enums), repozytoria i security. Frontend ma routing, Auth0, design system i split-panel placeholder. Brakuje: 3 backendowych endpointów (create case, get case, finalize), serwisów Angular (HTTP + SSE consumer + finalization), komponentu PDF viewera i formularza ekstrakcji z obsługą streamingu. JSON Schema dla rekordu FR-012 musi być zdefiniowany jako część S-01. Kluczowe wiążące decyzje: NDJSON transport, Flux<SSE> bez WebFlux, Fetch API zamiast EventSource, zona-less Angular 21 ze Signals.

---

## Detailed Findings

### Backend — co istnieje

#### Endpointy (ExtractionController)
- `src/main/java/com/example/clearkyc/analysis/ExtractionController.java`
  - `POST /api/cases/{caseId}/analysis` — multipart/form-data (field: `file`) → `text/event-stream`
  - Wymaga JWT (`@AuthenticationPrincipal Jwt jwt`), `jwt.getSubject()` jako analystIdentity
  - Deleguje do `ExtractionService.streamAnalysis(UUID, MultipartFile, String)`
  - Status codes: 200 OK stream, 401 no JWT, 404 case not found, 409 case not in CREATED state

#### ExtractionEvent hierarchy (Java 21 sealed)
- `src/main/java/com/example/clearkyc/analysis/ExtractionEvent.java`
  ```
  sealed interface ExtractionEvent {
    record FieldExtracted(String fieldName, String value, List<Citation> citations)
    record AnalysisComplete(String caseId)
    record AnalysisError(String errorCode, String message)
  }
  ```
- `src/main/java/com/example/clearkyc/analysis/Citation.java`
  ```
  record Citation(String quote, int pageNumber)
  ```
  Uwaga: `pageNumber = 0` oznacza nieznany numer strony (best-effort)

#### ExtractionService (logika streamingu)
- `src/main/java/com/example/clearkyc/analysis/ExtractionService.java`
  - Waliduje: case musi być w `CREATED`; zwraca 409 jeśli inny status
  - Przejście statusów: `CREATED → ANALYZING` na start, `ANALYZING → ANALYZED` na sukces, `ANALYZING → CREATED` na błąd (revert)
  - Akumuluje tokeny LLM w buforze `StringBuilder`, emituje kompletne linie JSON gdy wykryje `\n`
  - Limit linii: 512 000 bajtów (`MAX_LINE_BYTES`) — zabezpieczenie przed nieformatowaną odpowiedzią modelu
  - `doFinally` gwarantuje zapis statusu niezależnie od wyniku (reactor hook)

#### Domain model
- `src/main/java/com/example/clearkyc/domain/KybCase.java`
  - Pola: `id` (UUID, auto), `status` (CaseStatus), `createdAt`, `updatedAt` (@Timestamp), `lockedAt` (nullable)
- `src/main/java/com/example/clearkyc/domain/AuditRecord.java`
  - Pola: `id`, `kybCase` (@OneToOne LAZY, unique), `analystIdentity` (JWT subject), `decision` (DecisionType), `finalizedAt` (@CreationTimestamp), `payload` (@JdbcTypeCode(JSON) → JSONB)
- `src/main/java/com/example/clearkyc/domain/CaseStatus.java` — `CREATED, ANALYZING, ANALYZED, LOCKED`
- `src/main/java/com/example/clearkyc/domain/DecisionType.java` — `APPROVE, REJECT, ESCALATE`

#### Repozytoria
- `src/main/java/com/example/clearkyc/repository/KybCaseRepository.java` — `JpaRepository<KybCase, UUID>`, metody `findById()`, `save()`
- `src/main/java/com/example/clearkyc/repository/AuditRecordRepository.java` — dodatkowa metoda `findByKybCase(KybCase)`

#### SecurityConfig
- `src/main/java/com/example/clearkyc/config/SecurityConfig.java`
  - `/actuator/health` → permitAll
  - `/api/**` → authenticated (JWT wymagany)
  - Reszta → permitAll (SPA routing)
  - CORS: origins z `ALLOWED_ORIGINS` env lub domyślnie `http://localhost:1999`; methods: GET, POST, PUT, PATCH, DELETE; credentials: true

#### Flyway (Tabele DB)
- `src/main/resources/db/migration/V1__create_case_and_audit_tables.sql`
  ```sql
  kyb_case: id UUID PK, status TEXT CHECK(...), created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, locked_at TIMESTAMPTZ
  audit_record: id UUID PK, case_id UUID UNIQUE FK→kyb_case, analyst_identity TEXT, decision TEXT CHECK(...), finalized_at TIMESTAMPTZ, payload JSONB
  ```

#### pom.xml — obecne zależności
- `spring-boot-starter-webmvc`, `spring-boot-starter-security`, `spring-boot-starter-oauth2-resource-server`
- `spring-boot-starter-data-jpa`, `postgresql`, `spring-boot-starter-flyway`
- `spring-ai-starter-model-google-genai` (ściąga `reactor-core` transitive)
- `spring-boot-starter-actuator`
- `networknt/json-schema-validator 3.0.1` (już w pom.xml — FR-012 validation gotowe do użycia)
- Multipart limits: `spring.servlet.multipart.max-file-size=20MB`, `spring.servlet.multipart.max-request-size=25MB`

---

### Backend — czego brakuje dla S-01

#### POST /api/cases (FR-004: create case + receive PDF)
Nowe klasy do napisania:
- `com.example.clearkyc.web.CaseController` — `@RestController`
- `com.example.clearkyc.web.dto.CreateCaseResponse` — `record CreateCaseResponse(UUID id, String status, Instant createdAt)`
- `com.example.clearkyc.service.CaseService` — tworzy `KybCase(CREATED)`, zapis przez repo
- Endpoint: `POST /api/cases` (multipart: pole `file` z PDF), response: 201 Created z `CreateCaseResponse`
- Uwaga PRD FR-004: "akt załączenia PDF tworzy case" — PDF i case powstają w jednym żądaniu

#### GET /api/cases/{id} (odczyt stanu case)
- W `CaseController`: `GET /api/cases/{caseId}` → `CaseDetailResponse`
- `com.example.clearkyc.web.dto.CaseDetailResponse` — zawiera status, daty, opcjonalnie audit (jeśli LOCKED)
- Repozytorium już istnieje

#### POST /api/cases/{id}/finalize (FR-011 + FR-012 + FR-013)
Nowe klasy do napisania:
- `com.example.clearkyc.web.DecisionController` — `@RestController`
- `com.example.clearkyc.web.dto.FinalizeRequest` — `record FinalizeRequest(DecisionType decision, Object extractedData, Map<String, String> overrideJustifications)`
- `com.example.clearkyc.web.dto.FinalizeResponse` — `record FinalizeResponse(UUID auditRecordId, String decision, Instant finalizedAt)`
- `com.example.clearkyc.service.FinalizeService` — walidacja JSON Schema (FR-012), zapis `AuditRecord`, set `LOCKED`
- Kolejność operacji (per PRD §Guardrails): zapis `AuditRecord` PRZED odpowiedzią HTTP 200

#### JSON Schema (FR-012)
Musi być zdefiniowany i zacommitowany w S-01. Sugerowana ścieżka: `src/main/resources/schema/finalization-v0.1.json`. Validator: `networknt/json-schema-validator` (już w pom.xml). Szkielet schematu:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "version": "0.1",
  "properties": {
    "caseId": { "type": "string", "format": "uuid" },
    "analystIdentity": { "type": "string" },
    "decision": { "enum": ["APPROVE", "REJECT", "ESCALATE"] },
    "finalizedAt": { "type": "string", "format": "date-time" },
    "extractedData": { "type": "object" },
    "overrideJustifications": { "type": "object" }
  },
  "required": ["caseId", "analystIdentity", "decision", "finalizedAt", "extractedData"]
}
```

---

### Frontend — co istnieje

#### Routing
- `web/src/app/app.routes.ts`
  - `/cases/new` → `CaseNewComponent` (canActivate: authGuard)
  - `/cases/:id` → `CaseDetailComponent` (canActivate: authGuard)
  - `''` → redirect `/cases/new`
  - `**` → redirect `/cases/new`
  - **Gotowe do S-01, bez zmian**

#### CaseNewComponent i CaseDetailComponent
- `web/src/app/features/case-new/case-new.component.ts` — standalone, template: `<app-layout />`
- `web/src/app/features/case-detail/case-detail.component.ts` — standalone, template: `<app-layout />`
- Oba to puste opaki dla `AppLayout`. S-01 wstrzyknie logikę.

#### AppLayout
- `web/src/app/layout/app-layout/app-layout.component.html` — flex 100vh, dwa pane: `--pdf` (50%) i `--form` (flex:1), oba z placeholder div
- `web/src/app/layout/app-layout/app-layout.component.scss` — używa design system tokenów, `.app-layout__placeholder` ze styszem dashed-border
- **Split-panel scaffold gotowy, zawartość do zastąpienia**

#### Auth0 + HTTP Interceptor
- `web/src/app/app.config.ts` — `provideAuth0(...)`, `provideHttpClient(withInterceptors([authHttpInterceptorFn]))`
- Interceptor automatycznie dodaje `Authorization: Bearer {token}` do requestów pasujących do `/api/`
- Zone-less change detection (`provideZonelessChangeDetection()`)
- **Gotowe, bez zmian**

#### Design system
- 214 tokenów CSS custom properties w `web/src/styles/design-system/_variables.scss`
- Kluczowe tokeny dla S-01:
  - `--state-streaming`, `--state-streaming-bg` — animacja/kolor pola podczas streamingu
  - `--state-override`, `--state-override-bg` — pole z manualnym override
  - `--state-missing` — "Not Disclosed / Inferred Missing"
  - `--citation-marker`, `--citation-bg`, `--citation-border`, `--citation-text` — UI cytatów
  - `--approve-solid`, `--reject-solid`, `--escalate-solid` — przyciski decyzji
  - `--control-height-lg: 34px` — decision bar buttons
  - `--split-min-pane: 360px`, `--split-resizer: 5px` — split panel
  - `--row-height: 30px` — dense field rows

#### package.json — co jest
- `@angular/*` 21.2.0 (core, forms, router, common, platform-browser)
- `@auth0/auth0-angular` 2.9.0
- `rxjs` 7.8.0 (Observable, Subject, BehaviorSubject — kluczowe dla SSE consumer)
- `typescript` ~5.9.2, strict mode włączony
- `vitest` 4.0.8 (unit tests)

---

### Frontend — czego brakuje dla S-01

#### Biblioteka PDF
- ❌ `pdfjs-dist` (lub alternatywa) — **wymagana decyzja w S-01**
- Opcje: `pdfjs-dist` (oficjalny PDF.js od Mozilla, pełna kontrola), `ng2-pdf-viewer` (wrapper Angular, prostsza integracja ale starszy projekt)
- Rekomendacja: `pdfjs-dist` bezpośrednio — więcej kontroli nad highlight i page navigation (FR-014)
- Uwaga: `ng serve` bundle budget 500kB warning — `pdfjs-dist` jest ciężki (~1MB); rozważyć lazy loading

#### Komponenty do zbudowania
1. **`PdfViewerComponent`** (zastąpi placeholder w `app-layout__pane--pdf`)
   - Input: `@Input() pdfBlob: Blob | null` (przesłany PDF przechowywany w memory)
   - Input: `@Input() targetPage: number` (z click-to-cite)
   - Output: `@Output() pageLoaded: EventEmitter<number>` (aktualny numer strony)
   - Logika: renderuje PDF z pdfjs-dist, naviguje do strony na input change, próbuje highlight (best-effort)

2. **`ExtractionFormComponent`** (zastąpi placeholder w `app-layout__pane--form`)
   - Consumes: SSE stream z backendu jako `Observable<ExtractionEvent>`
   - Wyświetla: dynamicznie rosnące pola ekstrakcji w dense table (row-height: 30px)
   - Każde pole: name, value (editable), citations array (click → gotoPage)
   - `--state-streaming` na polu aktualnie aktualizowanym przez LLM
   - Override input z mandatory justification (FR-010)
   - Decision bar (Approve / Reject / Escalate) po zakończeniu analizy

3. **`FileDropzoneComponent`** (w `CaseNewComponent`)
   - Drag-and-drop + file picker (FR-004)
   - Validates: PDF only, max 20MB
   - Na upload: wywołuje `CaseService.createCase(file)` → redirect do `/cases/{id}`

4. **`CitationBadgeComponent`** (inline w ExtractionForm)
   - Wyświetla superscript marker + tooltip/inline block z `quote` i `pageNumber`
   - Click → emituje `gotoPage(pageNumber)` do PdfViewer

#### Serwisy Angular do napisania
1. **`CaseService`** (`web/src/app/core/services/case.service.ts`)
   - `createCase(file: File): Observable<{id: string, status: string}>` → POST `/api/cases` (multipart)
   - `getCase(caseId: string): Observable<CaseDetail>` → GET `/api/cases/{id}`

2. **`ExtractionStreamService`** (`web/src/app/core/services/extraction-stream.service.ts`)
   - `streamAnalysis(caseId: string, pdfFile: File): Observable<ExtractionEvent>` → POST `/api/cases/{id}/analysis` (SSE)
   - Używa `fetch` API + `ReadableStream` (nie `EventSource` — EventSource nie obsługuje custom headers potrzebnych dla JWT)
   - Parsuje NDJSON: akumuluje chunks, emituje kompletne JSON objects na `\n`
   - Mapuje `event:` type na odpowiedni subtyp `ExtractionEvent`

3. **`DecisionService`** (`web/src/app/core/services/decision.service.ts`)
   - `finalizeCase(caseId: string, payload: FinalizePayload): Observable<FinalizeResponse>` → POST `/api/cases/{id}/finalize`

#### State management (Signals)
- Angular 21 — używać `signal()`, `computed()`, `effect()` (zone-less)
- `CaseStore` (injectable service z Signals):
  - `caseId = signal<string | null>(null)`
  - `caseStatus = signal<CaseStatus>('CREATED')`
  - `pdfBlob = signal<Blob | null>(null)` — przechowuje PDF w pamięci dla viewera
  - `extractionFields = signal<ExtractionField[]>([])`
  - `isAnalyzing = signal<boolean>(false)`
  - `activePage = signal<number>(1)` — synchronizacja PDF viewer ↔ citation clicks
  - `overrides = signal<Map<string, Override>>(new Map())` — field overrides + justifications

#### Modele TypeScript
```typescript
interface ExtractionField {
  fieldName: string;
  value: string;          // includes "Not Disclosed / Inferred Missing"
  citations: Citation[];
  isStreaming: boolean;   // true gdy LLM aktualnie pisze to pole
  override?: Override;
}

interface Citation {
  quote: string;
  pageNumber: number;     // 0 = unknown
}

interface Override {
  newValue: string;
  justification: string;  // mandatory per FR-010
  originalValue: string;
}

type ExtractionEvent =
  | { type: 'FieldExtracted'; fieldName: string; value: string; citations: Citation[] }
  | { type: 'AnalysisComplete'; caseId: string }
  | { type: 'AnalysisError'; errorCode: string; message: string };
```

---

## Code References

- `src/main/java/com/example/clearkyc/analysis/ExtractionController.java` — POST /api/cases/{caseId}/analysis
- `src/main/java/com/example/clearkyc/analysis/ExtractionService.java` — Flux<SSE> streaming z NDJSON parsing
- `src/main/java/com/example/clearkyc/analysis/ExtractionEvent.java` — sealed interface z FieldExtracted, AnalysisComplete, AnalysisError
- `src/main/java/com/example/clearkyc/analysis/Citation.java` — record Citation(quote, pageNumber)
- `src/main/java/com/example/clearkyc/domain/KybCase.java` — entity z CREATED/ANALYZING/ANALYZED/LOCKED status
- `src/main/java/com/example/clearkyc/domain/AuditRecord.java` — entity z payload JSONB
- `src/main/java/com/example/clearkyc/domain/CaseStatus.java` — enum
- `src/main/java/com/example/clearkyc/domain/DecisionType.java` — enum APPROVE/REJECT/ESCALATE
- `src/main/java/com/example/clearkyc/repository/KybCaseRepository.java` — JpaRepository
- `src/main/java/com/example/clearkyc/repository/AuditRecordRepository.java` — findByKybCase()
- `src/main/java/com/example/clearkyc/config/SecurityConfig.java` — /api/** authenticated
- `src/main/resources/db/migration/V1__create_case_and_audit_tables.sql` — schemat DB
- `web/src/app/app.routes.ts` — routing /cases/new i /cases/:id
- `web/src/app/layout/app-layout/app-layout.component.html` — split-panel placeholder
- `web/src/app/features/case-new/case-new.component.ts` — placeholder
- `web/src/app/features/case-detail/case-detail.component.ts` — placeholder
- `web/src/app/app.config.ts` — Auth0 + HTTP interceptor
- `web/src/app/core/guards/auth.guard.ts` — functional auth guard
- `web/src/styles/design-system/_variables.scss` — 214 CSS tokens

---

## Architecture Insights

### Wiążące decyzje architektoniczne (nie zmieniać)

1. **NDJSON transport SSE** — jeden JSON object na linię, serwer emituje `\n` po każdym polu. Umożliwia NFR 5s do pierwszego pola. Frontend musi akumulować chunki i parsować na `\n`.

2. **Flux<ServerSentEvent> bez WebFlux** — Spring MVC + reactor-core transitive od Spring AI. Tomcat pozostaje serwerem. `ExtractionController` zwraca `Flux<ServerSentEvent<ExtractionEvent>>`.

3. **Fetch API zamiast EventSource** — natywny `EventSource` nie obsługuje custom headers (np. `Authorization: Bearer`). Frontend musi używać `fetch()` z `ReadableStream` do konsumpcji SSE.

4. **Java 21 sealed records** — `ExtractionEvent` jest sealed. Brak możliwości dodania nowych typów zdarzeń bez zmiany `ExtractionController`. SSE `event:` header = nazwa klasy.

5. **LOCKED finalizacja — zapis przed potwierdzeniem** — PRD §Guardrails: "Every terminal decision is persisted to the audit record *before* the UI confirms finalization." FinalizeService musi commit `AuditRecord` transakcyjnie przed odpowiedzią HTTP 200.

6. **Zone-less Angular 21** — `provideZonelessChangeDetection()`. Używać `signal()`, `computed()`, `effect()`. Nie używać `NgZone.run()` ani `ChangeDetectorRef.markForCheck()`.

7. **Multipart limit 20MB** — już w `application.properties`. POST /api/cases wysyła PDF w tym samym request co tworzy case.

8. **JWT subject jako analystIdentity** — `jwt.getSubject()` z Auth0 M2M lub user token. Trafia do `AuditRecord.analystIdentity`.

### Nowe decyzje wymagane w S-01

1. **PDF viewer library** — `pdfjs-dist` vs `ng2-pdf-viewer` vs `<embed>` tag. Rekomendacja: `pdfjs-dist` bezpośrednio dla pełnej kontroli nad FR-014 (highlight + page nav). Lazy-load przez Angular `import()` (duże bundle).

2. **Split pane resizer** — implementacja przeciąganego divider między panelami. Opcje: CSS `resize`, pure CSS `flex` z JS `mousedown/mousemove`, lub biblioteka (np. `split.js`). Design system ma `--split-resizer: 5px` i `--split-min-pane: 360px`.

3. **PDF storage** — PDF nie jest persystowany w DB (F-04 decyzja). Dla S-01 MVP: trzymać `Blob` w Angular `signal()` w pamięci. Reset na reload (akceptowalne dla MVP). Fly.io Volumes / S3 to post-MVP.

4. **Streaming SSE error handling** — co wyświetlić gdy `AnalysisError` event nadejdzie? Opcje: inline banner w formularzu, toast, modal retry.

---

## Historical Context

- `context/changes/llm-streaming-backend/plan.md` — pełna specyfikacja SSE API: format zdarzeń, NDJSON parsing, status transitions, system prompt dla LLM, limity (512KB/linia, 20MB multipart)
- `context/changes/data-layer/plan.md` — schemat DB, JPA entities, relacja 1:1 `KybCase`↔`AuditRecord`, Flyway V1 migracja
- `context/changes/auth-scaffold/plan.md` — SecurityConfig, `/api/**` authenticated, CORS, Auth0 issuer-uri
- `context/changes/frontend-scaffold/plan.md` — AppLayout placeholder, routing, Auth0 Angular integration

---

## Open Questions

1. **PDF viewer library** — `pdfjs-dist` bezpośrednio vs wrapper? Highlight best-effort: canvas overlay vs text layer selection?

2. **Split pane resizer** — pure CSS/JS vs biblioteka? Minimalny zakres dla MVP.

3. **SSE error recovery** — czy analityk może retriggernąć analizę po `AnalysisError`? Backend resetuje status na `CREATED` (tak, można). UI: przycisk "Spróbuj ponownie"?

4. **PDF memory vs re-upload** — czy po refresh `/cases/{id}` analityk musi ponownie wgrać PDF? MVP akceptuje ten kompromis (signal in-memory). Wyraźne info w UI?

5. **Prompt quality** — skeleton w F-04 wymaga iteracji na prawdziwych dokumentach KYB. Poza scope S-01 implementacji, ale warto mieć test PDF z firmą, dyrektorami i UBO do weryfikacji.

6. **Concurrent analysis guard** — frontend powinien blokować przycisk "Analizuj" gdy `status === 'ANALYZING'`. Backend i tak zwróci 409, ale UX bez blokady jest zły.
