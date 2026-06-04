# Workstation Case-Detail Fidelity — Implementation Plan

## Overview

Doprowadza widok `case-detail` do wierności projektu workstation z `context/foundation/design-system/ck-app.jsx`. Cztery niezależnie testowalnie fazy: backend entityName, nowy WorkstationTopbarComponent, nagłówek panelu PDF, dwuetapowy commit decyzji.

## Current State Analysis

- `CaseDetailComponent` nie ma topbara — widok zaczyna się od `<app-layout>` (split panel).
- `app-layout.component.scss` używa `height: 100vh` — blokuje umieszczenie topbara ponad layoutem bez przepełnienia.
- `DecisionBarComponent` to jednoetapowy submit — klik Approve/Reject/Escalate natychmiast wywołuje API `finalize`.
- `PdfViewerComponent` nie ma nagłówka pane-head; `pageCount` jest prywatnym sygnałem niedostępnym z zewnątrz.
- Backend: `kyb_case` nie ma kolumny `entity_name`; `CaseDetailResponse` nie zwraca nazwy encji; Angular `CaseSummary` ma `entityName?: string | null`, ale `CaseDetail` — nie.
- 61 testów zielonych (5 plików spec); testy `DecisionBarComponent` testują jednoetapowy flow i wymagają aktualizacji.

## Desired End State

Analityk widzi topbar workstation z logo CK, nazwą encji (z pliku PDF), ID sprawy i wskaźnikiem stanu analizy (idle / running z animowanym pulsem / complete z zieloną kropką). Wybiera decyzję terminalną dwuetapowo — klik Approve/Reject/Escalate aktywuje przycisk (solid fill), dopiero klik "Commit decision" wysyła zapis. Belka decyzji pokazuje ostrzeżenie w amber gdy jakiekolwiek pole ma wartość "Not Disclosed / Inferred Missing" bez override'a. Panel PDF ma nagłówek z tytułem "Source document" i liczbą stron.

Weryfikacja: `cd web && npx ng test --watch=false` — 60+ testów zielonych (DecisionBar spec zaktualizowany).

### Key Discoveries

- Design reference: `context/foundation/design-system/ck-app.jsx` (TopBar, DocViewer pane-head, DecisionBar z `pendingDecision`/`onCommit`).
- `app-layout.component.scss:8` — `height: 100vh` trzeba zmienić na `height: 100%` i dostarczyć kontekst wysokości z case-detail.
- `ExtractionField` nie ma flagi `required` — warning bazuje na proxy: pola z wartością `Not Disclosed / Inferred Missing` i bez override'a.
- Backend `CaseService.createCase()` ignoruje plik (`@RequestPart("file") MultipartFile` jest dostępny w kontrolerze, ale nie przekazywany do serwisu) — filename jako entityName wymaga przepięcia.
- V1 migration (`src/main/resources/db/migration/V1__create_case_and_audit_tables.sql`) — nowa migracja to V2.
- `DecisionBarComponent.spec.ts:97-121` — testy `isSubmitting` zakładają, że przyciski wyboru są disabled; po refaktorze tylko "Commit decision" jest disabled podczas submittowania.

## What We're NOT Doing

- Blokowanie Approve gdy są missing fields (tylko warning, nie blokada).
- Awatar analityka w topbarze (nie ma danych analityka w CaseStore; opcjonalny element designu).
- Chip cytowania w nagłówku panelu PDF (zakres S-05 to tylko tytuł + strony).
- Refaktor topbara case-new na WorkstationTopbarComponent (case-new ma inną zawartość topbara).
- Endpoint `GET /api/cases` (lista spraw) — tylko `GET /api/cases/{id}` dostaje entityName.

## Implementation Approach

Cztery fazy w kolejności zależności: backend (źródło entityName) → topbar Angular (konsumuje entityName) → PDF header (niezależny) → DecisionBar (niezależny, ale wymaga aktualizacji testów na końcu by nie blokować iteracji).

---

## Phase 1: Backend — entityName chain

### Overview

Dodaje kolumnę `entity_name` do `kyb_case`, przepina `CaseController.createCase()` żeby przekazywał nazwę pliku (bez rozszerzenia `.pdf`) do serwisu, i zwraca entityName w `CaseDetailResponse`.

### Changes Required

#### 1. Flyway V2 migration

**File**: `src/main/resources/db/migration/V2__add_entity_name_to_kyb_case.sql`

**Intent**: Dodaje nullable kolumnę `entity_name TEXT` do istniejącej tabeli. Nullable — istniejące rekordy nie mają nazwy encji.

**Contract**: Nowy plik SQL wykonany przez Flyway przy starcie aplikacji. Nie modyfikuje V1.

```sql
ALTER TABLE kyb_case ADD COLUMN entity_name TEXT;
```

#### 2. KybCase entity

**File**: `src/main/java/com/example/clearkyc/domain/KybCase.java`

**Intent**: Dodaje pole `entityName` do encji JPA z mapowaniem na kolumnę `entity_name`.

**Contract**: Pole `@Column(name = "entity_name") private String entityName;` z getterem i setterem. Konstruktor `KybCase(CaseStatus status)` rozszerzony o `KybCase(CaseStatus status, String entityName)`.

#### 3. CaseController — przekaż nazwę pliku

**File**: `src/main/java/com/example/clearkyc/web/CaseController.java`

**Intent**: Przekazuje nazwę przesłanego pliku do serwisu jako entityName — usuwa `.pdf` z końca, jeśli present.

**Contract**: `caseService.createCase(entityName)` zamiast `caseService.createCase()`, gdzie `entityName = file.getOriginalFilename()` po stripowaniu suffixu `.pdf` (case-insensitive, z fallbackiem na pustą nazwę gdy null).

#### 4. CaseService — przyjmij i zapisz entityName

**File**: `src/main/java/com/example/clearkyc/service/CaseService.java`

**Intent**: Zmienia sygnaturę `createCase()` na `createCase(String entityName)` i zapisuje entityName w nowej encji.

**Contract**: `new KybCase(CaseStatus.CREATED, entityName)` zamiast `new KybCase(CaseStatus.CREATED)`.

#### 5. CaseDetailResponse — dodaj entityName

**File**: `src/main/java/com/example/clearkyc/web/dto/CaseDetailResponse.java`

**Intent**: Dodaje pole `entityName` do rekordu DTO zwracanego przez `GET /api/cases/{id}`.

**Contract**: `record CaseDetailResponse(UUID id, String status, Instant createdAt, Instant updatedAt, Instant lockedAt, AuditSummary audit, String entityName)`. W `CaseService.getCase()` — uzupełnić mapowanie: `kybCase.getEntityName()` jako ostatni argument.

### Success Criteria

#### Automated Verification

- Backend kompiluje się bez błędów: `./mvnw compile`
- Testy Spring Boot przechodzą: `./mvnw test`
- Migracja V2 nie koliduje z V1 w lokalnym H2 (testy integracyjne)

#### Manual Verification

- `POST /api/cases` (multipart z plikiem `ACME_Corp.pdf`) → `GET /api/cases/{id}` zwraca `"entityName": "ACME_Corp"`
- Istniejące przypadki (bez `entity_name` w DB) zwracają `"entityName": null` bez błędu

**Implementation Note**: Po ukończeniu tej fazy i weryfikacji automatycznej — poczekaj na potwierdzenie manualnego testu przed przejściem do fazy 2.

---

## Phase 2: WorkstationTopbarComponent + CaseDetail wiring

### Overview

Tworzy nowy `WorkstationTopbarComponent`, dodaje `entityName` do `CaseStore` i `CaseDetail` modelu, wpina topbar do `case-detail.component.html` ponad split-layoutem. Wymaga zmiany `app-layout.scss` z `100vh` na `100%`.

### Changes Required

#### 1. WorkstationTopbarComponent — nowy komponent

**File**: `web/src/app/shared/components/workstation-topbar/workstation-topbar.component.ts`

**Intent**: Standalone komponent displayujący topbar workstation — logo CK, nazwę encji z caseId jako fallback, badge stanu analizy z animowanym pulsem.

**Contract**:
```typescript
readonly entityName = input<string | null>(null);
readonly caseId = input<string | null>(null);
readonly runState = input<'idle' | 'running' | 'complete'>('idle');
```
Brak logiki poza interpolacją inputów. Standalone, bez serwisów.

**File**: `web/src/app/shared/components/workstation-topbar/workstation-topbar.component.html`

**Intent**: Markup topbara zgodny z `ck-app.jsx TopBar` — `.topbar > .tb-left (.brand-mark + .tb-doc (.tb-entity + .tb-meta)) + .tb-right (.run-state)`.

**Contract**: `[class.running]="runState() === 'running'"` i `[class.complete]="runState() === 'complete'"` na `.run-state`. Gdy `entityName()` jest null — wyświetla `caseId()`. `.tb-meta` zawiera tylko caseId (brak docName — nie mamy tej danej).

**File**: `web/src/app/shared/components/workstation-topbar/workstation-topbar.component.scss`

**Intent**: Style topbara z tokenów design systemu, zgodne z `workstation.html`.

**Contract**: `.topbar { height: 52px; display: flex; align-items: center; ... }`. Animacja pulse dla `.run-state.running .rs-dot`: `@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }`. Tokeny: `--surface-raised`, `--border-default`, `--accent-text`, `--accent-muted`, `--state-streaming-bg`, `--approve-solid`, `--approve-bg`, `--approve-border`.

#### 2. CaseDetail Angular model

**File**: `web/src/app/core/models/extraction.models.ts`

**Intent**: Dodaje `entityName` do interfejsu `CaseDetail` żeby Angular poprawnie typował odpowiedź API po zmianie backendu.

**Contract**: `entityName?: string | null;` w interface `CaseDetail`.

#### 3. CaseStore — entityName signal

**File**: `web/src/app/core/store/case.store.ts`

**Intent**: Dodaje signal `entityName` do store, czyści go w `reset()`.

**Contract**: `readonly entityName = signal<string | null>(null);` na poziomie pól klasy; `this.entityName.set(null)` w `reset()`.

#### 4. CaseDetailComponent — wiring

**File**: `web/src/app/features/case-detail/case-detail.component.ts`

**Intent**: Importuje `WorkstationTopbarComponent`, dodaje computed `runState`, zasilata `caseStore.entityName` z odpowiedzi API.

**Contract**:
- Import `WorkstationTopbarComponent` w tablicy `imports`
- `protected readonly runState = computed(() => { if (this.caseStore.isAnalyzing()) return 'running'; const s = this.caseStore.caseStatus(); return (s === 'ANALYZED' || s === 'LOCKED') ? 'complete' : 'idle'; });`
- W `ngOnInit` subscribe: `this.caseStore.entityName.set(response.entityName ?? null);` obok istniejącego `caseStore.caseStatus.set()`

**File**: `web/src/app/features/case-detail/case-detail.component.html`

**Intent**: Dodaje topbar ponad `<app-layout>`, owija całość w `<div class="case-detail-wrap">`.

**Contract**:
```html
<div class="case-detail-wrap">
  <app-workstation-topbar
    [entityName]="caseStore.entityName()"
    [caseId]="caseStore.caseId()"
    [runState]="runState()"
  />
  <app-layout>...</app-layout>
</div>
```
Re-upload-banner pozostaje poza wrapperem (jest `position: fixed`).

**File**: `web/src/app/features/case-detail/case-detail.component.scss`

**Intent**: Dodaje `.case-detail-wrap` jako flex kontener viewport-height, żeby topbar + layout zajmowały dokładnie 100dvh.

**Contract**: `.case-detail-wrap { display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }`. `app-layout` wewnątrz dostaje `flex: 1 1 0; min-height: 0; overflow: hidden;` przez selektor potomny lub klasę.

#### 5. AppLayout — height 100% zamiast 100vh

**File**: `web/src/app/layout/app-layout/app-layout.component.scss`

**Intent**: Zmienia `height: 100vh` na `height: 100%` żeby layout wypełniał swój kontener, a nie bezpośrednio viewport — umożliwia umieszczenie topbara ponad layoutem.

**Contract**: Linia 8: `height: 100vh;` → `height: 100%;`. Brak innych zmian.

### Success Criteria

#### Automated Verification

- Build Angular: `cd web && npx ng build --configuration=development` — bez błędów TypeScript
- Testy: `cd web && npx ng test --watch=false` — wszystkie zielone

#### Manual Verification

- Topbar widoczny ponad split-panelanemi na `/cases/:id`
- Nazwena encji wyświetlana w topbarze (lub caseId jako fallback gdy brak)
- Run-state badge: "Awaiting analysis" przed analizą, pulsujący "Analysing…" podczas analizy, "Extraction complete" po zakończeniu
- Brak pionowego przepełnienia viewport (layout + topbar mieszczą się w 100dvh)
- Panel PDF i form zajmują dokładnie resztę ekranu po odjęciu topbara (52px)

---

## Phase 3: PDF pane header

### Overview

Dodaje nagłówek pane-head do `PdfViewerComponent` z tytułem "Source document" i liczbą stron dokumentu.

### Changes Required

#### 1. PdfViewerComponent — expose pageCount

**File**: `web/src/app/shared/components/pdf-viewer/pdf-viewer.component.ts`

**Intent**: Udostępnia liczbę stron dokumentu jako publiczny signal, żeby template mógł go wyświetlić w pane-head.

**Contract**: `readonly pageCount = signal<number>(0);` na poziomie pól klasy (publiczny). Ustawiany po załadowaniu dokumentu: `this.pageCount.set(doc.numPages)` w `renderAllPages` po render loop (przy `generation === this.renderGeneration`). Czyszczony do 0 w metodzie `clearContainer()`.

#### 2. PdfViewerComponent — pane-head w template

**File**: `web/src/app/shared/components/pdf-viewer/pdf-viewer.component.html`

**Intent**: Dodaje nagłówek pane-head z tytułem "Source document" i wskaźnikiem liczby stron, identycznie jak w `ck-app.jsx DocViewer`.

**Contract**:
```html
<div class="pdf-viewer" #pdfViewer>
  <div class="pane-head">
    <span class="ph-title">Source document</span>
    <div class="ph-tools">
      @if (pageCount() > 0) {
        <span class="ph-pages mono">{{ pageCount() }} pp</span>
      }
    </div>
  </div>
  <div #pagesContainer class="pdf-viewer__pages"></div>
  ...
</div>
```

#### 3. PdfViewerComponent — style pane-head

**File**: `web/src/app/shared/components/pdf-viewer/pdf-viewer.component.scss`

**Intent**: Dodaje style dla `.pane-head`, `.ph-title`, `.ph-tools`, `.ph-pages` — identyczne z extraction-form.component.scss (kopiuje wzorzec, nie importuje).

**Contract**: `.pane-head { flex: 0 0 auto; height: 38px; display: flex; ... }`. Tokeny jak w extraction-form. Widok `.pdf-viewer` zmienia na `display: flex; flex-direction: column;` żeby pane-head przykleił się na górze.

### Success Criteria

#### Automated Verification

- Build Angular bez błędów TypeScript
- Testy: wszystkie zielone (PdfViewer nie ma spec — tylko build weryfikacja)

#### Manual Verification

- Nagłówek "Source document" widoczny nad panelem PDF po otwarciu sprawy
- Liczba stron (np. "3 pp") pojawia się po załadowaniu pliku PDF
- Przed załadowaniem pliku: nagłówek widoczny, licznik stron ukryty
- Pane-head nie przepełnia layoutu — PDF body scrolluje niezależnie poniżej

---

## Phase 4: Decision bar — two-step commit + tests

### Overview

Refaktoruje `DecisionBarComponent` do dwuetapowego commitowania decyzji zgodnie z projektem workstation. Aktualizuje spec pod nowy flow.

### Changes Required

#### 1. DecisionBarComponent — two-step logic

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.ts`

**Intent**: Wprowadza `pendingDecision` signal do separacji "wyboru" od "commitu". Dodaje computed `missingFieldsCount` jako proxy dla nierozwiązanych pól.

**Contract**:
```typescript
protected readonly pendingDecision = signal<Decision | null>(null);

protected readonly missingFieldsCount = computed(() =>
  this.caseStore.extractionFields().filter(f =>
    (f.value === 'Not Disclosed / Inferred Missing' || !f.value) &&
    !this.caseStore.fieldOverrides()[f.fieldName]
  ).length
);

protected pickDecision(d: Decision): void {
  this.pendingDecision.set(d);
}

protected commit(): void {
  const d = this.pendingDecision();
  if (!d) return;
  this.submit(d);
}
```
Metoda `submit()` pozostaje bez zmian (przyjmuje Decision, wywołuje API).

#### 2. DecisionBarComponent — two-step template

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.html`

**Intent**: Zmienia przyciski Approve/Reject/Escalate z bezpośredniego `submit()` na `pickDecision()`. Dodaje "Commit decision" button. Dodaje amber warning gdy `missingFieldsCount() > 0`.

**Contract**:
- Przyciski decyzji: `(click)="pickDecision('APPROVE')"`, `[class.decision-bar__btn--active]="pendingDecision() === 'APPROVE'"` — analogicznie dla REJECT i ESCALATE. Wyłączone tylko podczas `isSubmitting()`.
- "Commit decision" button: klasa `commit-btn`, `[disabled]="!pendingDecision() || isSubmitting()"`, `(click)="commit()"`.
- Amber warning: wewnątrz `.decision-meta__sub`, `@if (missingFieldsCount() > 0)` — `<span class="decision-meta__warn">▲ {{ missingFieldsCount() }} field{{ missingFieldsCount() > 1 ? 's' : '' }} with missing data — review before deciding</span>`.

#### 3. DecisionBarComponent — styles

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.scss`

**Intent**: Dodaje style dla stanu `.active` przycisków decyzji, `.commit-btn` i `.decision-meta__warn`.

**Contract**:
- `.decision-bar__btn--approve.decision-bar__btn--active { background: var(--approve-solid); color: #fff; border-color: var(--approve-solid); }` — analogicznie reject i escalate z odpowiednimi tokenami.
- `.commit-btn { ... background: var(--gray-900); color: #fff; ... } .commit-btn:disabled { background: var(--gray-200); color: var(--gray-400); cursor: not-allowed; }`
- `.decision-meta__warn { color: var(--escalate-text); font-weight: var(--weight-medium); display: inline-flex; align-items: center; gap: 4px; }`

#### 4. DecisionBarComponent spec — aktualizacja testów

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.spec.ts`

**Intent**: Aktualizuje testy pod dwuetapowy flow. Istniejące testy obecności przycisków (ANALYZED/LOCKED) przechodzą bez zmian. Testy `isSubmitting` wymagają korekty: teraz wyłącza tylko "Commit decision", nie przyciski wyboru.

**Contract — testy do zmiany:**
- `describe('ANALYZED context with isSubmitting=true')` — zamiast sprawdzać `btn--approve.disabled` (teraz nie disabled), sprawdza że `commit-btn` jest disabled. Analogicznie reject i escalate.

**Contract — testy do dodania (nowe describe bloki):**
- `describe('ANALYZED context — commit flow')`:
  - `it('Commit decision button is initially disabled')` — `commit-btn` disabled gdy brak pendingDecision
  - `it('Commit decision button enabled after picking Approve')` — klik `.decision-bar__btn--approve` → `commit-btn` enabled
  - `it('Approve button gets active class after picking')` — `hasClass('decision-bar__btn--active')` na `--approve`

- `describe('ANALYZED context — missing fields warning')` (konfiguracja: `store.extractionFields.set([...])` z polem bez wartości):
  - `it('shows warning when fields are missing')` — `.decision-meta__warn` visible
  - `it('no warning when all fields have values')` — `.decision-meta__warn` null

### Success Criteria

#### Automated Verification

- Testy: `cd web && npx ng test --watch=false` — wszystkie zielone, w tym nowe i zaktualizowane testy DecisionBar
- Build Angular bez błędów

#### Manual Verification

- Klik "Approve" → przycisk zaznacza się (solid fill), "Commit decision" aktywuje się
- Klik "Reject" → zmienia zaznaczenie z Approve na Reject
- Klik "Commit decision" → API `finalize` wywołane, sprawa blokuje się
- Gdy pola mają "Not Disclosed / Inferred Missing" — amber warning widoczny w DecisionBar
- Gdy wszystkie pola mają wartości — brak warningu
- "Commit decision" disabled podczas submittowania (API call in progress)

---

## Testing Strategy

### Unit Tests

- `DecisionBarComponent.spec.ts` — zaktualizowane scenariusze dwuetapowego commitu + nowe dla warning
- Brak nowych spec dla `WorkstationTopbarComponent` i `PdfViewerComponent` (visual-only, bez logiki warunkowej)

### Manual Testing Steps

1. Uruchom backend (`./mvnw spring-boot:run`) i frontend (`cd web && npx ng serve`)
2. Prześlij plik PDF przez upload screen → przejdź do case-detail
3. Zweryfikuj topbar: logo CK, nazwa encji z pliku, ID sprawy, badge "Awaiting analysis"
4. Kliknij "Run analysis" → badge zmienia się na "Analysing…" z pulsującą kropką
5. Po zakończeniu → badge "Extraction complete" z zieloną kropką
6. Sprawdź nagłówek panelu PDF: "Source document · N pp"
7. Kliknij "Reject" w DecisionBar → przycisk zaznacza się solid, "Commit decision" aktywuje
8. Kliknij "Approve" → zaznaczenie zmienia się
9. Kliknij "Commit decision" → case blokuje się, pojawia się widok LOCKED

## Migration Notes

Flyway V2 migration jest additive (tylko ADD COLUMN nullable) — nie wymaga backfill ani restartu danych. Istniejące sprawy w DB dostaną `entity_name = NULL` i poprawnie zwracają `"entityName": null` przez API.

## References

- Design reference: `context/foundation/design-system/ck-app.jsx` (TopBar, DocViewer, DecisionBar)
- Design tokens: `context/foundation/design-system/tokens.css`
- Istniejący pane-head pattern: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.scss:10-34`
- V1 migration: `src/main/resources/db/migration/V1__create_case_and_audit_tables.sql`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — entityName chain

#### Automated

- [x] 1.1 Backend kompiluje się: `./mvnw compile` — aa69757
- [x] 1.2 Testy Spring Boot zielone: `./mvnw test` — aa69757

#### Manual

- [ ] 1.3 `POST /api/cases` z plikiem → `GET /api/cases/{id}` zwraca `entityName` bez `.pdf`
- [ ] 1.4 Stara sprawa (null entityName) nie rzuca błędu

### Phase 2: WorkstationTopbarComponent + CaseDetail wiring

#### Automated

- [x] 2.1 Build Angular bez błędów TypeScript
- [x] 2.2 Testy Angular zielone: `cd web && npx ng test --watch=false`

#### Manual

- [ ] 2.3 Topbar widoczny ponad layoutem na `/cases/:id`
- [ ] 2.4 Nazwa encji w topbarze (fallback: caseId gdy null)
- [ ] 2.5 Run-state badge przechodzi idle → running → complete poprawnie
- [ ] 2.6 Brak pionowego przepełnienia viewport

### Phase 3: PDF pane header

#### Automated

- [ ] 3.1 Build Angular bez błędów TypeScript

#### Manual

- [ ] 3.2 Nagłówek "Source document" widoczny nad panelem PDF
- [ ] 3.3 Liczba stron (np. "3 pp") pojawia się po załadowaniu pliku
- [ ] 3.4 PDF body scrolluje niezależnie poniżej nagłówka

### Phase 4: Decision bar — two-step commit + tests

#### Automated

- [ ] 4.1 Testy zielone: `cd web && npx ng test --watch=false`
- [ ] 4.2 Build Angular bez błędów TypeScript

#### Manual

- [ ] 4.3 Klik decyzji → solid fill, "Commit decision" aktywuje
- [ ] 4.4 Klik "Commit decision" → finalize API wywołane, sprawa locked
- [ ] 4.5 Amber warning widoczny gdy pola missing
- [ ] 4.6 "Commit decision" disabled podczas submittowania
