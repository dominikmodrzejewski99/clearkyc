# S-01: Core Case Flow — Implementation Plan

## Overview

Implementacja minimalnego end-to-end flow analityka KYB: upload PDF tworzy case, analityk triggeruje ekstrakcję LLM, wyekstrahowane encje (firma, dyrektorzy, UBO) streamują ze źródłowymi cytowaniami do formularza obok osadzonego PDF viewera, analityk wybiera decyzję terminalną (Approve / Reject / Escalate), system generuje JSON Schema-zwalidowany rekord audytowy przed potwierdzeniem w UI.

## Current State Analysis

Po F-01..F-05 codebase ma: SSE streaming endpoint (`POST /api/cases/{id}/analysis` → Flux<SSE>), domain model z `KybCase`/`AuditRecord`/`CaseStatus`/`DecisionType`, repozytoria Spring Data, SecurityConfig (JWT na `/api/**`), routing Angular (`/cases/new`, `/cases/:id`), Auth0 interceptor dla HttpClient, AppLayout split-panel placeholder, 214 tokenów CSS design systemu z dedykowanymi tokenami streaming/citations/decisions. Brakuje: backendowych endpointów create/get/finalize, JSON Schema v0.1, Angular serwisów HTTP + SSE consumer, komponentów PDF viewer / dropzone / extraction form / decision bar.

## Desired End State

Analityk zalogowany przez Auth0 może wejść na `/cases/new`, upuścić lub wybrać PDF (max 20 MB), co automatycznie tworzy case i przenosi go na `/cases/{id}`. W podzielonym panelu (resize + collapse) widzi PDF po lewej i formularz po prawej. Kliknięcie "Analizuj" uruchamia streaming: pola (companyName, directors, ubos) pojawiają się sukcesywnie z cytowaniami. Po zakończeniu analizy dostępne są przyciski Approve / Reject / Escalate. Po kliknięciu — zapis rekordu audytowego (JSON Schema v0.1) w DB, blokada formularza, potwierdzenie w UI. Reload strony: jeśli PDF znikł z pamięci, widoczny baner z file pickerem do ponownego wgrania.

### Key Discoveries

- `src/main/java/com/example/clearkyc/analysis/ExtractionController.java` — istniejący SSE endpoint; nowy `CaseController` musi trafić do pakietu `com.example.clearkyc.web`, analogicznie do wzorca z F-04
- `src/main/java/com/example/clearkyc/analysis/ExtractionEvent.java` — sealed interface; frontend mapuje `event:` header SSE (np. `event:FieldExtracted`) na typ zdarzenia
- `src/main/resources/db/migration/V1__create_case_and_audit_tables.sql` — schemat DB gotowy, `kyb_case` + `audit_record`; **brak V2 migracji** — S-01 nie zmienia schematu
- `networknt/json-schema-validator 3.0.1` — już w `pom.xml`; gotowe do użycia w `FinalizeService`
- `web/src/app/app.config.ts` — Auth0 interceptor działa tylko dla `HttpClient`; raw `fetch()` w `ExtractionStreamService` musi pobierać token ręcznie przez `AuthService.getAccessTokenSilently()`
- `web/src/styles/design-system/_variables.scss` — tokeny `--state-streaming`, `--state-streaming-bg`, `--citation-marker`, `--approve-solid`, `--reject-solid`, `--escalate-solid`, `--split-resizer: 5px`, `--split-min-pane: 360px` gotowe do użycia

## What We're NOT Doing

- FR-010 (edycja pola z mandatory justification) → S-02
- FR-014 (click-to-cite nawigacja PDF + highlight) → S-02
- FR-007 / S-03 (red flag taxonomy) → zablokowane do czasu Open Question 1
- Persystencja PDF w DB ani storage zewnętrznym → post-MVP (Fly.io Volumes / S3)
- Testy frontendowe (unit vitest dla komponentów) → poza scope S-01

## Implementation Approach

Backend-first (P1), potem Angular fundament (P2), a następnie UI od zewnątrz do środka: upload flow (P3), split-panel z PDF viewerem (P4), formularz ekstrakcji z decyzją (P5). Każda faza jest weryfikowalna zanim zacznie się następna.

## Critical Implementation Details

**SSE consumption via fetch().** Auth0 HTTP interceptor (`authHttpInterceptorFn`) działa wyłącznie dla Angular `HttpClient`. `ExtractionStreamService` używa natywnego `fetch()` — musi ręcznie pobrać token: `this.auth.getAccessTokenSilently()` (RxJS → toPromise lub firstValueFrom), dodać `Authorization: Bearer {token}` do headers, wysłać `FormData` z plikiem PDF. Unsubscribe musi przerywać stream przez `AbortController.abort()`.

**SSE format (nie NDJSON).** Frontend odbiera standard SSE: `event:FieldExtracted\ndata:{...}\n\n`. Parser musi zbierać linie między pustymi liniami, czytać `event:` jako discriminator i `data:` jako JSON payload — nie należy oczekiwać surowego NDJSON bez nagłówków SSE (NDJSON to wewnętrzny format LLM→Spring).

**Finalizacja — ordering.** `FinalizeService.finalize()` musi być `@Transactional`. Kolejność w jednej transakcji: (1) walidacja JSON Schema, (2) `auditRecordRepository.save(new AuditRecord(...))`, (3) `kybCase.setStatus(LOCKED)` + `kybCaseRepository.save(kybCase)`. Odpowiedź HTTP 200 wraca dopiero po commit transakcji. Naruszenie tej kolejności łamie PRD §Guardrails.

**pdfjs-dist worker.** Po lazy-load (`await import('pdfjs-dist')`), konfiguracja workera: `pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()`. Bez tego pdfjs-dist rzuca błąd braku workera w esbuild + Angular 21.

---

## Phase 1: Backend API — case lifecycle + finalizacja

### Overview

Trzy nowe endpointy REST: tworzenie case + odczyt + finalizacja. JSON Schema v0.1 dla rekordu audytu. Testy @WebMvcTest dla obu kontrolerów.

### Changes Required

#### 1. JSON Schema v0.1

**File**: `src/main/resources/schema/finalization-v0.1.json`

**Intent**: Zdefiniować i zacommitować schemat walidacji rekordu finalizacji (FR-012). Lenient v0.1: wymaga wymaganych pól, ale `extractedData` i `overrideJustifications` są luźnymi obiektami — chroni przed łamaniem schematu przy ewolucji promptu LLM.

**Contract**: JSON Schema draft-07. Wymagane pola: `caseId` (string, format: uuid), `analystIdentity` (string), `decision` (enum: APPROVE/REJECT/ESCALATE), `finalizedAt` (string, format: date-time), `extractedData` (object). Opcjonalne: `overrideJustifications` (object). `additionalProperties: true`.

#### 2. CaseController + DTOs

**File**: `src/main/java/com/example/clearkyc/web/CaseController.java` (nowy)
**Files**: `src/main/java/com/example/clearkyc/web/dto/CreateCaseResponse.java`, `CaseDetailResponse.java`, `AuditSummary.java` (nowe)

**Intent**: Dwa endpointy: POST /api/cases tworzy case (przyjmuje PDF multipart, nie persystuje PDF), GET /api/cases/{id} zwraca aktualny stan case.

**Contract**:
- `POST /api/cases` — consumes `multipart/form-data` (field: `file`), response 201 z `CreateCaseResponse(UUID id, String status, Instant createdAt)`. Wymaga JWT (`@AuthenticationPrincipal Jwt`).
- `GET /api/cases/{caseId}` — response 200 z `CaseDetailResponse(UUID id, String status, Instant createdAt, Instant updatedAt, Instant lockedAt, AuditSummary audit)`. `audit` jest null jeśli status != LOCKED. `AuditSummary(UUID auditRecordId, String decision, Instant finalizedAt)`.
- Pakiet: `com.example.clearkyc.web`, wzorowany na `com.example.clearkyc.analysis.ExtractionController`.

#### 3. CaseService

**File**: `src/main/java/com/example/clearkyc/service/CaseService.java` (nowy)

**Intent**: Logika biznesowa dla tworzenia i odczytu case. Deleguje do `KybCaseRepository` i `AuditRecordRepository`.

**Contract**: `createCase()` → tworzy nowy `KybCase(status=CREATED)`, zapisuje przez repo, zwraca DTO. `getCase(UUID id)` → `findById` (404 jeśli brak) + `findByKybCase` dla audit, składa `CaseDetailResponse`.

#### 4. DecisionController + DTOs

**File**: `src/main/java/com/example/clearkyc/web/DecisionController.java` (nowy)
**Files**: `src/main/java/com/example/clearkyc/web/dto/FinalizeRequest.java`, `FinalizeResponse.java` (nowe)

**Intent**: Endpoint finalizacji case z wybraną decyzją terminalną.

**Contract**: `POST /api/cases/{caseId}/finalize` — consumes `application/json`, body: `FinalizeRequest(DecisionType decision, Map<String,Object> extractedData, Map<String,String> overrideJustifications)`. Response 200 z `FinalizeResponse(UUID auditRecordId, String decision, Instant finalizedAt)`. Wymaga JWT.

#### 5. FinalizeService

**File**: `src/main/java/com/example/clearkyc/service/FinalizeService.java` (nowy)

**Intent**: Transakcyjna finalizacja: walidacja JSON Schema (FR-012) → zapis AuditRecord → zmiana statusu case na LOCKED. Kolejność operacji gwarantuje że rekord istnieje w DB zanim HTTP 200 dotrze do klienta.

**Contract**: `@Transactional`. Walidacja: ładuje schemat z `classpath:/schema/finalization-v0.1.json` przez `networknt JsonSchemaFactory`. Jeśli nieważny → 422 Unprocessable Entity z listą błędów. Jeśli ważny → `new AuditRecord(kybCase, analystIdentity, decision, jsonPayload)` → `auditRecordRepository.save()` → `kybCase.setStatus(LOCKED)` → `kybCase.setLockedAt(Instant.now())` → `kybCaseRepository.save()`.

#### 6. Testy @WebMvcTest

**Files**: `src/test/java/com/example/clearkyc/web/CaseControllerTest.java`, `DecisionControllerTest.java` (nowe)

**Intent**: Pokryć happy path i główne scenariusze błędów dla obu kontrolerów. Wzorzec z F-04: `@WebMvcTest + @Import(SecurityConfig.class) + @MockitoBean JwtDecoder + @MockitoBean {Service}`.

**Contract**:
- `CaseControllerTest`: POST /api/cases bez JWT → 401; z JWT + valid PDF → 201; GET /api/cases/{id} → 200; GET /api/cases/{unknown-id} → 404.
- `DecisionControllerTest`: POST /api/cases/{id}/finalize bez JWT → 401; z JWT + valid payload → 200; z case w statusie LOCKED → 409; z invalid JSON Schema payload → 422.

### Success Criteria

#### Automated Verification

- `./mvnw compile` — zero błędów kompilacji
- `./mvnw test` — wszystkie testy zielone (istniejące 9 + nowe @WebMvcTest)
- `./mvnw verify` — clean build

#### Manual Verification

- `curl -s http://localhost:8081/actuator/health` → `{"status":"UP"}`
- `POST /api/cases` z plikiem PDF i tokenem JWT → 201 z `{id, status: "CREATED"}`
- `GET /api/cases/{id}` → 200 z poprawnym DTO
- `POST /api/cases/{id}/finalize` z `{decision: "APPROVE", extractedData: {}, overrideJustifications: {}}` → 200 z auditRecordId; ponowne wywołanie → 409

**Implementation Note**: Po zakończeniu tej fazy pauza dla manualnego potwierdzenia przed przejściem do P2.

---

## Phase 2: Angular — typy, serwisy, store

### Overview

Modele TypeScript, Signals-based `CaseStore`, trzy serwisy HTTP/SSE. Żadnych komponentów — czysto logika i stan.

### Changes Required

#### 1. TypeScript models

**File**: `web/src/app/core/models/extraction.models.ts` (nowy)

**Intent**: Zdefiniować wszystkie typy shared w S-01: `ExtractionField`, `Citation`, `Override`, typy `ExtractionEvent` (discriminated union), `CaseDetail`, `CaseStatus`.

**Contract**: Używać `type` (nie `interface`) dla union types. `ExtractionEvent` jako discriminated union z `type` discriminatorem: `FieldExtracted`, `AnalysisComplete`, `AnalysisError`. `CaseStatus` jako `'CREATED' | 'ANALYZING' | 'ANALYZED' | 'LOCKED'`.

#### 2. CaseStore

**File**: `web/src/app/core/store/case.store.ts` (nowy)

**Intent**: Centralny Signals-based store dla stanu aktywnego case. Injectable service — jeden singleton na aplikację.

**Contract**: `@Injectable({ providedIn: 'root' })`. Sygnały: `caseId = signal<string | null>(null)`, `caseStatus = signal<CaseStatus>('CREATED')`, `pdfBlob = signal<Blob | null>(null)`, `extractionFields = signal<ExtractionField[]>([])`, `isAnalyzing = signal<boolean>(false)`, `activePage = signal<number>(1)`, `analysisError = signal<string | null>(null)`. Metody: `reset()` (czyści wszystkie sygnały), `appendField(field: ExtractionField)`, `markAnalysisError(message: string)`, `markAnalyzed()`, `markLocked()`.

#### 3. CaseService

**File**: `web/src/app/core/services/case.service.ts` (nowy)

**Intent**: HTTP klient dla endpointów case lifecycle. Używa Angular `HttpClient` (Auth0 interceptor działa automatycznie).

**Contract**: `createCase(file: File): Observable<CreateCaseResponse>` — POST `/api/cases` z `FormData`. `getCase(caseId: string): Observable<CaseDetailResponse>` — GET `/api/cases/{id}`.

#### 4. ExtractionStreamService

**File**: `web/src/app/core/services/extraction-stream.service.ts` (nowy)

**Intent**: SSE consumer dla POST /api/cases/{id}/analysis. Musi używać natywnego `fetch()` (nie HttpClient) ponieważ Auth0 interceptor nie obsługuje SSE streams.

**Contract**: `streamAnalysis(caseId: string, pdfFile: File): Observable<ExtractionEvent>`. Implementacja:
1. `const token = await firstValueFrom(this.auth.getAccessTokenSilently())`
2. `const controller = new AbortController()`
3. `fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: formData, signal: controller.signal })`
4. Czytaj `response.body` (ReadableStream), dekoduj UTF-8, akumuluj bufor, split po `\n\n` (SSE message boundary)
5. Dla każdego SSE message: parsuj `event:` line i `data:` line, mapuj na `ExtractionEvent` discriminated union
6. Zwróć `new Observable(subscriber => { ...; return () => controller.abort() })`

#### 5. DecisionService

**File**: `web/src/app/core/services/decision.service.ts` (nowy)

**Intent**: HTTP klient dla POST /api/cases/{id}/finalize. Używa HttpClient.

**Contract**: `finalize(caseId: string, payload: FinalizePayload): Observable<FinalizeResponse>` — POST `/api/cases/{caseId}/finalize` z JSON body. Typy: `FinalizePayload { decision: 'APPROVE'|'REJECT'|'ESCALATE'; extractedData: Record<string, unknown>; overrideJustifications: Record<string, string> }`, `FinalizeResponse { auditRecordId: string; decision: string; finalizedAt: string }`.

### Success Criteria

#### Automated Verification

- `cd web && ng build` — zero błędów TypeScript (strict mode)

#### Manual Verification

- Brak błędów w DevTools Console po otwarciu `http://localhost:1999`
- `CaseStore` i serwisy widoczne w Angular DevTools jako injectable services

**Implementation Note**: Pauza przed P3.

---

## Phase 3: CaseNew — upload flow

### Overview

`FileDropzoneComponent` z drag-and-drop + file picker. `CaseNewComponent` wired do `CaseService` + `CaseStore` + `Router`. Upload → create case → redirect do `/cases/{id}`.

### Changes Required

#### 1. FileDropzoneComponent

**Files**: `web/src/app/shared/components/file-dropzone/file-dropzone.component.{ts,html,scss}` (nowe)

**Intent**: Komponent do uploadowania pliku PDF przez drag-and-drop lub file picker. Waliduje typ (PDF only) i rozmiar (max 20 MB). Emituje wybrany plik do rodzica.

**Contract**: `@Output() fileSelected = new EventEmitter<File>()`. Obsługuje: `dragover`, `dragleave`, `drop` na container div; `change` na `<input type="file" accept=".pdf">`. Walidacja: `file.type !== 'application/pdf'` → błąd; `file.size > 20 * 1024 * 1024` → błąd. Błędy wyświetlane inline (nie toast). Styling: używa tokenów `--border-default`, `--surface-sunken`, `--state-streaming-bg` na drag-over.

#### 2. CaseNewComponent — wiring

**Files**: `web/src/app/features/case-new/case-new.component.ts` (modyfikacja), `case-new.component.html` (nowy)

**Intent**: Zastąpić placeholder `<app-layout />` faktyczną logiką uploadu. Komponent renderuje `FileDropzoneComponent`, na `fileSelected` wywołuje `CaseService.createCase()`, zapisuje wynik do `CaseStore`, nawiguje do `/cases/{id}`.

**Contract**: Używa Signals: `isUploading = signal<boolean>(false)`, `uploadError = signal<string | null>(null)`. Na sukces: `caseStore.caseId.set(response.id)`, `caseStore.pdfBlob.set(file)`, `router.navigate(['/cases', response.id])`. Na błąd: `uploadError.set(message)`. Nie renderuje `AppLayout` — strona `/cases/new` ma własny prosty layout (centered dropzone na całym viewport).

### Success Criteria

#### Automated Verification

- `cd web && ng build` — zero błędów

#### Manual Verification

- Wejdź na `http://localhost:1999` (redirect do `/cases/new`)
- Upuść plik PDF → upload przechodzi, redirect do `/cases/{id}`
- Upuść plik `.txt` → błąd walidacji inline
- Plik > 20 MB → błąd inline

**Implementation Note**: Pauza przed P4.

---

## Phase 4: AppLayout + PDF viewer

### Overview

Resizable + collapsible split-panel (pure JS). `PdfViewerComponent` (pdfjs-dist lazy-loaded). `CaseDetailComponent` wired do `CaseStore` + baner re-upload dla scenariusza refresh.

### Changes Required

#### 1. pdfjs-dist dependency

**File**: `web/package.json` (modyfikacja)

**Intent**: Dodać pdfjs-dist do dependencies dla PDF renderowania w S-01 i FR-014 w S-02.

**Contract**: `npm install pdfjs-dist` w katalogu `web/`. Dodaje `"pdfjs-dist": "^4.x"` do `dependencies`.

#### 2. AppLayout — resizer + collapsible

**Files**: `web/src/app/layout/app-layout/app-layout.component.{ts,html,scss}` (modyfikacje)

**Intent**: Dodać dragable resizer div między panelami (mousedown → mousemove → mouseup), min-width z `--split-min-pane`, oraz przycisk collapse/expand lewego pane.

**Contract**:
- HTML: między `.app-layout__pane--pdf` a `.app-layout__pane--form` dodać `<div class="app-layout__resizer">`. Przed lewym pane: przycisk `<button class="app-layout__collapse-btn">`.
- TS: `leftWidth = signal<number>(50)` (procent), `isCollapsed = signal<boolean>(false)`. `mousedown` na resizer → `document.addEventListener('mousemove', onDrag)` → zmiana `leftWidth` (clamp do `--split-min-pane` px). `mouseup` → `removeEventListener`. Collapse button: `isCollapsed.set(!isCollapsed())`.
- SCSS: `.app-layout__pane--pdf { flex: 0 0 var(--pdf-pane-width, 50%) }` (CSS variable sterowany przez TS). `.app-layout__resizer { width: var(--split-resizer); cursor: col-resize }`. Collapse animacja: `transition: flex 200ms ease`.
- Resizer listener musi być dodany na `document` (nie na element) żeby działa przy szybkim ruchu myszy.

#### 3. PdfViewerComponent

**Files**: `web/src/app/shared/components/pdf-viewer/pdf-viewer.component.{ts,html,scss}` (nowe)

**Intent**: Renderuje PDF z pdfjs-dist w `<canvas>`. Przyjmuje blob + numer strony, nawiguje do strony na zmianę inputu. Lazy-ładuje pdfjs-dist żeby nie blokowac initial bundle.

**Contract**: `pdfBlob = input<Blob | null>(null)`, `targetPage = input<number>(1)`. Lazy-load: `const pdfjsLib = await import('pdfjs-dist')` + konfiguracja `pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()`. `effect(() => { const blob = pdfBlob(); if (blob) this.loadPdf(blob); })`. `effect(() => { const page = targetPage(); if (this.pdfDocument) this.renderPage(page); })`. Renderuje stronę do `<canvas>` używając `page.render({ canvasContext, viewport })`. Brak highlight w S-01 (to S-02).

#### 4. CaseDetailComponent — wiring + re-upload baner

**Files**: `web/src/app/features/case-detail/case-detail.component.ts` (modyfikacja), `case-detail.component.html` (nowy)

**Intent**: `CaseDetailComponent` čte `:id` z route params, pobiera case (`CaseService.getCase()`), inicjalizuje `CaseStore`. Jeśli `pdfBlob === null` i status != LOCKED: pokazuje baner z inline file pickerem do ponownego wgrania PDF.

**Contract**: `ngOnInit`: odczytaj `:id` z `ActivatedRoute`, wywołaj `caseStore.caseId.set(id)`, wywołaj `CaseService.getCase(id)` → `caseStore.caseStatus.set(response.status)`. HTML: `@if (caseStore.pdfBlob() === null && caseStore.caseStatus() !== 'LOCKED') { <div class="re-upload-banner">...</div> }`. Baner zawiera `<input type="file">` który ustawia `caseStore.pdfBlob.set(blob)` bez re-tworzenia case. `AppLayoutComponent` używa `@Input pdfBlob` z `caseStore.pdfBlob()`, `@Input targetPage` z `caseStore.activePage()`.

### Success Criteria

#### Automated Verification

- `cd web && npm install` — pdfjs-dist zainstalowane
- `cd web && ng build` — zero błędów

#### Manual Verification

- Na `/cases/{id}` (po redirect z CaseNew): lewy pane renderuje PDF
- Drag resizera: lewy pane zmienia szerokość, respektuje min-width
- Przycisk collapse: lewy pane zwija się / rozwija
- Reload strony: baner re-upload pojawia się; po wybraniu pliku PDF wyświetla się ponownie

**Implementation Note**: Pauza przed P5.

---

## Phase 5: ExtractionForm + streaming + decision

### Overview

`ExtractionFormComponent` (SSE consumer, field list read-only, citation badges, error baner + retry, "Analyze" button). `CitationBadgeComponent`. `DecisionBar` (Approve/Reject/Escalate, widoczny tylko gdy status ANALYZED). Locked state view.

### Changes Required

#### 1. CitationBadgeComponent

**Files**: `web/src/app/shared/components/citation-badge/citation-badge.component.{ts,html,scss}` (nowe)

**Intent**: Wyświetla superscript marker z numerem cytatu. Kliknięcie ustawia `caseStore.activePage()` (co nawiguje PDF viewer do wskazanej strony). Pokazuje tooltip z verbatim `quote`.

**Contract**: `citation = input.required<Citation>()`, `index = input.required<number>()`. HTML: `<sup class="citation-marker">[{index}]</sup>` z `(click)` handlerem. Tooltip z `quote` (plain CSS `:hover`). Używa tokenów `--citation-marker`, `--citation-bg`, `--citation-border`, `--citation-text`.

#### 2. ExtractionFormComponent

**Files**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.{ts,html,scss}` (nowe)

**Intent**: Prawy pane case detail. Wyświetla stan case z przyciskiem "Analizuj", streaming list pól ekstrakcji (read-only), cytowania, baner błędu z retry, decision bar po zakończeniu.

**Contract**:
- Wstrzykuje `CaseStore`, `ExtractionStreamService`, `DecisionService`, `AuthService`.
- "Analizuj" button: widoczny gdy `status === 'CREATED'` lub `status === 'ANALYZED'` (po błędzie). `(click)` → `startAnalysis()`: `caseStore.extractionFields.set([])`, `caseStore.analysisError.set(null)`, `caseStore.isAnalyzing.set(true)`, subscribe do `ExtractionStreamService.streamAnalysis(caseId, pdfBlob)`.
- Na `FieldExtracted`: `caseStore.appendField(field)`. Na `AnalysisComplete`: `caseStore.markAnalyzed()`, `caseStore.isAnalyzing.set(false)`. Na `AnalysisError`: `caseStore.markAnalysisError(message)`, `caseStore.isAnalyzing.set(false)`.
- Pola wyświetlane w dense table (`--row-height: 30px`). Pole aktualnie streamujące: `--state-streaming-bg`. Wartość `"Not Disclosed / Inferred Missing"`: kolor `--state-missing`.
- Cytowania: `@for (citation of field.citations; track $index) { <app-citation-badge [citation]="citation" [index]="$index + 1" /> }`
- Baner błędu: `@if (caseStore.analysisError()) { <div class="error-banner">... <button (click)="startAnalysis()">Analizuj ponownie</button> }`.
- Pola są READ-ONLY w S-01 (brak `<input>` na wartości).

#### 3. DecisionBar

**Files**: `web/src/app/shared/components/decision-bar/decision-bar.component.{ts,html,scss}` (nowe)

**Intent**: Trzy przyciski decyzji terminalnej (Approve / Reject / Escalate). Widoczny tylko gdy `status === 'ANALYZED'`. Po kliknięciu wywołuje `DecisionService.finalize()` z wszystkimi wyekstrahowanymi polami jako `extractedData`.

**Contract**: `@Output() decided = new EventEmitter<'APPROVE'|'REJECT'|'ESCALATE'>()`. Wewnętrznie `isSubmitting = signal<boolean>(false)`. Przyciski disabled gdy `isSubmitting()`. Kolory: `--approve-solid` / `--reject-solid` / `--escalate-solid`. Po sukcesie: `caseStore.markLocked()`. Przy błędzie: inline komunikat błędu. Locked state: `@if (caseStore.caseStatus() === 'LOCKED') { <div class="locked-banner">Case locked — {decision}</div> }`.

#### 4. CaseDetailComponent — wiring finalne

**File**: `web/src/app/features/case-detail/case-detail.component.html` (modyfikacja)

**Intent**: Połączyć AppLayout z `PdfViewerComponent` (lewy pane) i `ExtractionFormComponent` + `DecisionBar` (prawy pane). Usunąć placeholdery.

**Contract**: Lewy pane: `<app-pdf-viewer [pdfBlob]="caseStore.pdfBlob()" [targetPage]="caseStore.activePage()" />`. Prawy pane: `<app-extraction-form />` + `<app-decision-bar />`. `AppLayout` przyjmuje sygnały przez `@Input` lub przez shared `CaseStore` (preferowane: shared store zamiast prop drilling).

### Success Criteria

#### Automated Verification

- `cd web && ng build` — zero błędów TypeScript + zero warnings Angular

#### Manual Verification

- Pełny flow end-to-end: upload PDF → `/cases/{id}` → "Analizuj" → streaming pól (companyName, directors, ubos ze źródłowymi quotes) → "Approve" → locked view
- Baner błędu SSE: z nieprawidłowym kluczem API Google GenAI baner `AnalysisError` pojawia się z przyciskiem retry
- Status LOCKED: formularz zablokowany, decyzja widoczna, brak przycisku "Analizuj"
- Reload: baner re-upload → po wybraniu PDF pola ekstrakcji widoczne (jeśli ANALYZED), brak analizy od nowa

**Implementation Note**: Pauza przed zamknięciem S-01.

---

## Testing Strategy

### Unit Tests (Backend)

- `CaseControllerTest`: POST /api/cases (201, 401), GET /api/cases/{id} (200, 404, 401)
- `DecisionControllerTest`: POST finalize (200, 401, 409 na LOCKED, 422 na invalid schema)
- Pattern: `@WebMvcTest + @Import(SecurityConfig.class) + @MockitoBean JwtDecoder + @MockitoBean CaseService/FinalizeService`

### Manual Testing Steps

1. `docker compose up -d` (PostgreSQL)
2. `./mvnw spring-boot:run -Dspring.profiles.active=dev`
3. `cd web && ng serve`
4. Otwórz `http://localhost:1999`, zaloguj się
5. Upload PDF → zweryfikuj redirect i case w DB (`SELECT * FROM kyb_case`)
6. "Analizuj" → obserwuj streaming (z GOOGLE_GENAI_API_KEY lub symuluj error)
7. "Approve" → zweryfikuj `SELECT * FROM audit_record` (payload JSONB + status LOCKED)
8. Reload strony → zweryfikuj baner re-upload i widoczność pól

## Performance Considerations

- `pdfjs-dist` lazy-loaded (`await import(...)`) — nie blokuje initial bundle (bundle budget 500kB warning)
- `ExtractionStreamService` unsubscription przez `AbortController.abort()` — brak memory leak przy nawigacji
- `extractionFields` signal: `update(fields => [...fields, newField])` na każdym `FieldExtracted` — O(n) per event; akceptowalne dla typowych dokumentów KYB (< 50 pól)

## References

- Research: `context/changes/core-case-flow/research.md`
- SSE streaming pattern: `src/main/java/com/example/clearkyc/analysis/ExtractionController.java`
- @WebMvcTest pattern: `context/changes/llm-streaming-backend/plan.md`
- Domain model: `src/main/java/com/example/clearkyc/domain/KybCase.java`
- Design system tokens: `web/src/styles/design-system/_variables.scss`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend API — case lifecycle + finalizacja

#### Automated

- [x] 1.1 `./mvnw compile` — zero błędów — c99c789
- [x] 1.2 `./mvnw test` — wszystkie testy zielone (istniejące + @WebMvcTest) — c99c789
- [x] 1.3 `./mvnw verify` — clean build — c99c789

#### Manual

- [x] 1.4 POST /api/cases z JWT + PDF → 201 z id; GET → 200; finalize → 200; ponowne finalize → 409 — c99c789

### Phase 2: Angular — typy, serwisy, store

#### Automated

- [x] 2.1 `cd web && ng build` — zero błędów TypeScript (strict mode) — 740341d

#### Manual

- [x] 2.2 Brak błędów w DevTools Console po otwarciu localhost:1999 — 740341d
- [x] 2.3 CaseStore i serwisy widoczne w Angular DevTools — 740341d

### Phase 3: CaseNew — upload flow

#### Automated

- [x] 3.1 `cd web && ng build` — zero błędów — 230e8a0

#### Manual

- [x] 3.2 Upload PDF → redirect do /cases/{id} — 230e8a0
- [x] 3.3 Upload .txt → błąd inline — 230e8a0
- [x] 3.4 Upload > 20 MB → błąd inline — 230e8a0

### Phase 4: AppLayout + PDF viewer

#### Automated

- [x] 4.1 `cd web && npm install` — pdfjs-dist zainstalowane — 410ca9a
- [x] 4.2 `cd web && ng build` — zero błędów — 410ca9a

#### Manual

- [x] 4.3 Lewy pane renderuje PDF po redirect z CaseNew — 410ca9a
- [x] 4.4 Drag resizera: szerokość zmienia się, respektuje min-width — 410ca9a
- [x] 4.5 Przycisk collapse: pane zwija/rozwija się — 410ca9a
- [x] 4.6 Reload strony: baner re-upload widoczny; po wyborze pliku PDF renderuje — 410ca9a

### Phase 5: ExtractionForm + streaming + decision

#### Automated

- [x] 5.1 `cd web && ng build` — zero błędów + zero Angular warnings — a93c211

#### Manual

- [x] 5.2 Pełny flow: upload → analizuj → streaming pól → Approve → locked view — a93c211
- [x] 5.3 AnalysisError: baner błędu z przyciskiem retry — a93c211
- [x] 5.4 Status LOCKED: formularz zablokowany, decyzja widoczna — a93c211
- [x] 5.5 Reload na ANALYZED case: baner re-upload → pola widoczne po wgraniu PDF — a93c211
