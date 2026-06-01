# S-02: Field Verification & Export — Implementation Plan

## Overview

Implementacja trzech powiązanych PRD features budujących na fundamencie S-01: edycja pól ekstrakcji z obowiązkowym uzasadnieniem (FR-010), klikalne cytowania z best-effort text highlight w PDF viewerze (FR-014) i ewolucja payloadu audytowego do JSON Schema v0.2 zawierającego cytowania + override justifications per pole (FR-012/FR-013).

## Current State Analysis

Po S-01 codebase ma:
- `ExtractionField` z `citations: Citation[]`, ale w `FinalizePayload` cytowania są tracone — `DecisionBar` wysyła tylko `{fieldName: value}`
- `Override` type w `extraction.models.ts:14` — zdefiniowany, ale nikt go nie używa
- `overrideJustifications: {}` w `DecisionBar.submit()` — zawsze puste
- `CitationBadge` nawiguje do strony (activePage signal) — page navigation działa; text highlight nie istnieje
- `FinalizeRequest.java` ma `Map<String,Object> extractedData` + `Map<String,String> overrideJustifications` — flat, niezgodne z FR-013
- `finalization-v0.1.json` — lenient schema, `additionalProperties: true`, v0.2 musi być nowym plikiem

## Desired End State

Analityk w stanie ANALYZED może kliknąć ikonę ołówka przy dowolnym polu, wpisać nową wartość i obowiązkowe uzasadnienie, zapisać override. Kliknięcie badge cytowania nawiguje do strony + best-effort podświetla fragment tekstu (lub pokazuje snippet panel). Po kliknięciu Approve/Reject/Escalate payload zawiera pełną tablicę `fields` z cytowaniami, wartościami i override justifications per pole, zwalidowaną przez v0.2 schema przed zapisem do DB.

### Key Discoveries

- `FinalizeRequest.java` musi być przepisany: `Map<String,Object> extractedData` → `List<FieldRecord>` (nowy DTO)
- `ExtractionEvent.FieldExtracted` w backendu ma `List<Citation>` z `quote` i `pageNumber` — frontend musi je przepuszczać do FinalizePayload
- pdfjs-dist 6.0.227 — brak pre-built text layer file; text layer budowany programatycznie przez `page.getTextContent()` + pozycjonowane div overlay nad canvas
- `SnippetPanelComponent` — overlay na dole PDF pane (position: absolute, only when activeQuote != null)
- `CaseStore` potrzebuje dwóch nowych signals: `fieldOverrides` (Record<string, FieldOverride>) + `activeQuote` (ActiveCitation | null)

## What We're NOT Doing

- FR-007 / S-03 (red flag taxonomy) — zablokowane przez Open Question 1
- Click-to-cite na polach red flag — nie ma jeszcze S-03
- Per-edit audit logging — PRD explicite wyklucza w v1
- Taxonomy-bound field dropdowns — w S-02 wszystkie pola ekstrakcji są free-text (red flags taxonomy S-03 brak)
- Persystencja overrides na backend przed finalizacją — in-memory only
- Migracja istniejących rekordów audytu do v0.2 — additionalProperties:true w v0.1 nie blokuje żadnych operacji

## Implementation Approach

Backend-first (P1): nowe DTO + v0.2 schema + FinalizeService update. Następnie Angular data model (P2): types + CaseStore + DecisionBar. Potem UI (P3): inline edit. Na końcu (P4): text highlight + snippet panel — izolowane w PdfViewerComponent i nowym SnippetPanelComponent.

## Critical Implementation Details

**FinalizeRequest breaking change.** `FinalizeRequest.java` zmienia sygnaturę z `(decision, extractedData, overrideJustifications)` na `(decision, fields)`. `DecisionControllerTest` i `DecisionBarComponent` muszą być zaktualizowane w tej samej fazie (P1 backend + P2 Angular — te dwa commity muszą lądować zanim aplikacja zostanie uruchomiona ręcznie).

**pdfjs text layer nad canvas.** Canvas i text layer muszą być rodzeństwem wewnątrz `position: relative` kontenera. Div overlay na highlight ma `position: absolute` z `pointer-events: none` żeby nie blokować klikania canvas. Współrzędne z pdfjs `TextItem.transform` są w PDF space — `viewport.convertToViewportPoint(x, y)` przelicza na CSS space.

**Re-analyze warning.** `ExtractionFormComponent.tryStartAnalysis()` sprawdza `Object.keys(caseStore.fieldOverrides()).length > 0` przed wywołaniem `startAnalysis()`. Potwierdzenie resetu kasuje `caseStore.fieldOverrides.set({})` i `caseStore.activeQuote.set(null)` przed startem.

---

## Phase 1: Backend — JSON Schema v0.2 + payload evolution

### Overview

Nowe DTOs odzwierciedlające strukturę `fields` array. Nowy plik `finalization-v0.2.json`. Aktualizacja `FinalizeService` do ładowania v0.2 i budowania payloadu z `List<FieldRecord>`. Testy zaktualizowane do nowej sygnatury.

### Changes Required

#### 1. Nowe DTOs

**Files**: `src/main/java/com/example/clearkyc/web/dto/CitationRecord.java`, `FieldOverride.java`, `FieldRecord.java`

**Intent**: Zdefiniować hierarchię DTO odzwierciedlającą per-pole strukturę payloadu v0.2. Każde pole niesie swoją wartość, cytowania i opcjonalny override.

**Contract**:
- `CitationRecord(int page, String quote)` — immutable record
- `FieldOverride(String originalValue, String newValue, String justification)` — immutable record
- `FieldRecord(String fieldName, String value, List<CitationRecord> citations, FieldOverride override)` — `override` jest nullable; `citations` może być pustą listą

#### 2. Zaktualizowany FinalizeRequest

**File**: `src/main/java/com/example/clearkyc/web/dto/FinalizeRequest.java`

**Intent**: Zastąpić flat `extractedData` + `overrideJustifications` przez `List<FieldRecord> fields` które jest jedynym nośnikiem danych ekstrakcji.

**Contract**: `record FinalizeRequest(DecisionType decision, List<FieldRecord> fields)`. Stara sygnatura jest usunięta — breaking change względem v0.1 klientów.

#### 3. JSON Schema v0.2

**File**: `src/main/resources/schema/finalization-v0.2.json`

**Intent**: Zdefiniować contract v0.2 z wymaganą tablicą `fields`, każdy element z wymaganymi `fieldName` i `value`, opcjonalnymi `citations` i `override`.

**Contract**: Draft-07. Required top-level: `caseId`, `analystIdentity`, `decision`, `finalizedAt`, `fields`. `fields[*]`: required `fieldName` (string) + `value` (string); optional `citations` (array of `{page: integer, quote: string}`); optional `override` ({required: `originalValue`, `newValue`, `justification` — all strings}). `additionalProperties: true`.

#### 4. FinalizeService update

**File**: `src/main/java/com/example/clearkyc/service/FinalizeService.java`

**Intent**: Załadować `finalization-v0.2.json` w `@PostConstruct` zamiast v0.1. Zbudować `payloadMap` z `fields` list zamiast flat `extractedData`. Usunąć zależność od `overrideJustifications`.

**Contract**: `loadSchema()` ładuje `schema/finalization-v0.2.json`. `payloadMap.put("fields", request.fields())` — Jackson serializuje listę FieldRecord do JSON array. Reszta payloadu (caseId, analystIdentity, decision, finalizedAt) bez zmian.

#### 5. Aktualizacja testów

**Files**: `src/test/java/com/example/clearkyc/web/DecisionControllerTest.java`, `src/test/java/com/example/clearkyc/web/CaseControllerTest.java`

**Intent**: Zaktualizować `VALID_JSON` w `DecisionControllerTest` do nowej sygnatury `fields` array. Dodać test dla: payload z `fields` zawierającym override → 200; payload bez `fields` → 422.

**Contract**: `VALID_JSON` zmienia się na `{"decision":"APPROVE","fields":[{"fieldName":"companyName","value":"Acme","citations":[]}]}`. Istniejące testy 401/409/422 (z mock exception) pozostają bez zmian — mockowany FinalizeService ignoruje request body.

### Success Criteria

#### Automated Verification

- `./mvnw compile` — zero błędów
- `./mvnw test` — wszystkie testy zielone (istniejące + zaktualizowane)
- `./mvnw verify` — clean build

#### Manual Verification

- `POST /api/cases/{id}/finalize` z `{decision:"APPROVE", fields:[{fieldName:"companyName",value:"Acme Corp",citations:[{page:1,quote:"Acme Corp Ltd"}],override:null}]}` → 200 z auditRecordId
- Payload bez `fields` klucza → 422
- Ponowne finalize → 409

**Implementation Note**: Pauza po Phase 1 dla manualnego potwierdzenia zanim przejdziemy do P2.

---

## Phase 2: Angular — Models + CaseStore + FinalizePayload

### Overview

Nowe typy TypeScript. CaseStore rozszerzony o override state i active citation. DecisionBar przebudowany do budowania `fields` array. DecisionService aktualizuje FinalizePayload.

### Changes Required

#### 1. Nowe typy w extraction.models.ts

**File**: `web/src/app/core/models/extraction.models.ts`

**Intent**: Dodać `FieldOverride`, `FieldRecord` (dla FinalizePayload) i `ActiveCitation` (dla snippet panel). Zaktualizować `FinalizePayload` zastępując `extractedData` + `overrideJustifications` przez `fields: FieldRecord[]`.

**Contract**:
- `FieldOverride { originalValue: string; newValue: string; justification: string }`
- `FieldRecord { fieldName: string; value: string; citations: Citation[]; override?: FieldOverride }`
- `ActiveCitation { page: number; quote: string }`
- `FinalizePayload { decision: 'APPROVE'|'REJECT'|'ESCALATE'; fields: FieldRecord[] }` — stare pola `extractedData` i `overrideJustifications` usunięte

#### 2. CaseStore — override signals + activeQuote

**File**: `web/src/app/core/store/case.store.ts`

**Intent**: Dodać dwa nowe signals + metody. `fieldOverrides` trzyma override per fieldName. `activeQuote` trzyma aktualnie klikany cytat dla snippet panel + highlight.

**Contract**: Nowe signals:
- `fieldOverrides = signal<Record<string, FieldOverride>>({})` — klucz = fieldName
- `activeQuote = signal<ActiveCitation | null>(null)`

Nowe metody:
- `setOverride(fieldName: string, override: FieldOverride): void` — `this.fieldOverrides.update(m => ({...m, [fieldName]: override}))`
- `clearOverride(fieldName: string): void` — `this.fieldOverrides.update(m => { const n = {...m}; delete n[fieldName]; return n; })`

`reset()` czyści oba nowe signals.

#### 3. DecisionBarComponent — budowanie fields array

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.ts`

**Intent**: `submit()` buduje `fields: FieldRecord[]` łącząc `extractionFields` z `fieldOverrides`. Wartość pola to override.newValue jeśli istnieje, inaczej field.value.

**Contract**:
```typescript
const overrides = this.caseStore.fieldOverrides();
const fields: FieldRecord[] = this.caseStore.extractionFields().map(f => ({
  fieldName: f.fieldName,
  value: overrides[f.fieldName]?.newValue ?? f.value,
  citations: f.citations,
  override: overrides[f.fieldName],
}));
this.decisionService.finalize(caseId, { decision, fields })
```

### Success Criteria

#### Automated Verification

- `cd web && ng build` — zero błędów TypeScript strict

#### Manual Verification

- DevTools Console — brak błędów po otwarciu `/cases/{id}`
- Angular DevTools — `fieldOverrides` i `activeQuote` widoczne jako signals w CaseStore

**Implementation Note**: Pauza przed P3.

---

## Phase 3: Angular — Inline field edit UI (FR-010)

### Overview

`ExtractionFormComponent` z przyciskiem edycji per wiersz, inline formularzem (wartość + obowiązkowe uzasadnienie), override indicator, locked state z expandable original + justification. Re-analyze warning dialog gdy są aktywne overrides.

### Changes Required

#### 1. ExtractionFormComponent — TS

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts`

**Intent**: Dodać edit state signals i metody zarządzające edycją inline. Rozdzielić logikę startAnalizy na `tryStartAnalysis()` (z warningiem) i `startAnalysis()` (faktyczna logika).

**Contract**:
- Signals: `editingField = signal<string|null>(null)`, `editDraft = signal<string>('')`, `editJustification = signal<string>('')`, `showReanalyzeWarning = signal<boolean>(false)`
- `startEdit(field: ExtractionField)`: sets editingField + editDraft to current effective value (override.newValue ?? field.value)
- `saveEdit()`: validates `editJustification().trim().length > 0`; jeśli valid — `caseStore.setOverride(fieldName, {originalValue: field.value, newValue: editDraft(), justification: editJustification()})`, resetuje edit signals
- `cancelEdit()`: `editingField.set(null)`
- `tryStartAnalysis()`: `Object.keys(caseStore.fieldOverrides()).length > 0` → `showReanalyzeWarning.set(true)`; else `startAnalysis()`
- `confirmReanalyze()`: `caseStore.fieldOverrides.set({})`, `caseStore.activeQuote.set(null)`, `showReanalyzeWarning.set(false)`, `startAnalysis()`

#### 2. ExtractionFormComponent — HTML

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html`

**Intent**: Dodać edit button per wiersz (visible on hover, disabled gdy LOCKED/isAnalyzing). Gdy editingField === field.fieldName: zamienić `<td>` wartości na inline form. Override indicator + toggle w normalnym widoku.

**Contract**:
- Edit button: `<button *ngIf="caseStore.caseStatus() === 'ANALYZED'" class="field-edit-btn" (click)="startEdit(field)">✏</button>` — tylko gdy nie isAnalyzing i nie editingField (innego pola)
- Inline edit: `@if (editingField() === field.fieldName) { <td colspan="2"><input [(ngModel)]="..." /><textarea placeholder="Uzasadnienie (wymagane)" ...></textarea><button (save)><button (cancel)> </td> }`
- Override indicator: `@if (caseStore.fieldOverrides()[field.fieldName]) { <span class="override-badge">✏</span> }` — kliknięcie toggleuje expandable z `originalValue` + `justification`
- Re-analyze warning: `@if (showReanalyzeWarning()) { <dialog> ... </dialog> }`
- Przycisk "Analizuj" wyzwala `tryStartAnalysis()` zamiast `startAnalysis()`

#### 3. ExtractionFormComponent — SCSS

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.scss`

**Intent**: Style dla inline edit state, override indicator badge, expandable original/justification, re-analyze warning dialog.

**Contract**: `.field-edit-btn` — visible on row hover; `.override-badge` — małe ✏ z `--citation-marker` kolorem; `.override-detail` — collapsed by default, transition height; `.reanalyze-warning` — modal overlay z `.confirm-danger` button.

### Success Criteria

#### Automated Verification

- `cd web && ng build` — zero błędów

#### Manual Verification

- ANALYZED: kliknij ołówek → inline form pojawia się; wpisz wartość bez uzasadnienia → save disabled; wpisz uzasadnienie → save active; zapisz → pole pokazuje override value + badge ✏
- Widok LOCKED: badge ✏ → kliknięcie expanduje `Oryginał LLM: X • Uzasadnienie: Y`
- Kliknij "Analizuj" gdy są overrides → warning dialog; potwierdź → analiza reset; anuluj → brak restartu
- Pole "Not Disclosed / Inferred Missing" — edytowalne z uzasadnieniem

**Implementation Note**: Pauza przed P4.

---

## Phase 4: Angular — Snippet panel + text highlight (FR-014)

### Overview

`CitationBadgeComponent` ustawia `activeQuote` w store przy kliknięciu. Nowy `SnippetPanelComponent` (overlay na dole PDF pane) pokazuje quote + stronę gdy `activeQuote != null`. `PdfViewerComponent` próbuje text highlight przez `page.getTextContent()` + pozycjonowane div overlay; przy niepowodzeniu snippet panel jest jedynym fallbackiem.

### Changes Required

#### 1. CitationBadgeComponent — ustawia activeQuote

**File**: `web/src/app/shared/components/citation-badge/citation-badge.component.ts`

**Intent**: Przy kliknięciu poza nawigacją strony — ustawić `caseStore.activeQuote` żeby snippet panel i text highlight wiedziały co podświetlić.

**Contract**: `navigate()` zmienia się na: `this.caseStore.activePage.set(this.citation().page); this.caseStore.activeQuote.set({ page: this.citation().page, quote: this.citation().quote });`

#### 2. SnippetPanelComponent (nowy)

**Files**: `web/src/app/shared/components/snippet-panel/snippet-panel.component.{ts,html,scss}`

**Intent**: Overlay na dole lewego pane (PDF viewer). Wyświetla verbatim quote + numer strony gdy `activeQuote != null`. Zamknięcie kasuje `activeQuote` w store.

**Contract**: `@Component({ standalone: true, selector: 'app-snippet-panel' })`. Wstrzykuje `CaseStore`. Template: `@if (caseStore.activeQuote()) { <div class="snippet-panel"> <button (click)="close()">×</button> <p class="snippet-panel__page">str. {{ caseStore.activeQuote()!.page }}</p> <blockquote class="snippet-panel__quote">{{ caseStore.activeQuote()!.quote }}</blockquote> </div> }`. `close()` wywołuje `caseStore.activeQuote.set(null)`.

SCSS: `position: absolute; bottom: 0; left: 0; right: 0; z-index: 20; max-height: 30%; overflow-y: auto; background: var(--surface-raised); border-top: 2px solid var(--citation-border)`.

#### 3. PdfViewerComponent — text layer + highlight

**File**: `web/src/app/shared/components/pdf-viewer/pdf-viewer.component.ts`

**Intent**: Nowy input `activeQuote`. Po renderowaniu strony — próba podświetlenia cytatu przez text layer overlay. Niepowodzenie jest ciche (snippet panel jest fallbackiem).

**Contract**: `activeQuote = input<ActiveCitation | null>(null)`. Nowy prywatny div ref: `@ViewChild('highlightLayer') private highlightLayerRef?: ElementRef<HTMLDivElement>`. 

Nowy effect: `effect(() => { const q = this.activeQuote(); if (q && this.pdfDocument()) this.attemptHighlight(q); else this.clearHighlight(); })`.

`attemptHighlight(citation)`:
1. `const page = await this.pdfDocument().getPage(citation.page || 1)`
2. `const textContent = await page.getTextContent()`
3. Złącz `textContent.items.map(i => i.str)` → joined text; normalize (lowercase, collapse whitespace)
4. Normalize `citation.quote`; sprawdź czy znormalizowany cytat jest substringiem joined text
5. Jeśli TAK: znajdź przedziały text items pokrywające match; dla każdego item utwórz `<div>` overlay z `position: absolute` używając `viewport.convertToViewportPoint(tx, ty)` z `item.transform`; dodaj do `highlightLayerRef`
6. Jeśli NIE lub wyjątek: `this.clearHighlight()` (snippet panel pokrywa fallback)

`clearHighlight()`: usuwa wszystkie children z `highlightLayerRef`.

HTML: dodać kontener `<div class="pdf-viewer__page-wrapper">` z `position: relative` owijający canvas + highlight layer `<div #highlightLayer class="pdf-viewer__highlight-layer"></div>`.

SCSS: `.highlight-layer { position: absolute; top: 0; left: 0; pointer-events: none; }` `.highlight-mark { position: absolute; background: rgba(255, 255, 0, 0.4); }`.

#### 4. AppLayout / CaseDetail — wiring SnippetPanel

**File**: `web/src/app/features/case-detail/case-detail.component.html`

**Intent**: Dodać `<app-snippet-panel>` wewnątrz `slot="pdf"` pane. Przekazać `activeQuote` do `PdfViewerComponent`.

**Contract**: `slot="pdf"` zawiera:
```html
<div class="pdf-pane-inner">
  <app-pdf-viewer [pdfBlob]="..." [targetPage]="..." [activeQuote]="caseStore.activeQuote()" />
  <app-snippet-panel />
</div>
```
`pdf-pane-inner` ma `position: relative; height: 100%; display: flex; flex-direction: column`.

`case-detail.component.ts` imports: dodać `SnippetPanelComponent`.

### Success Criteria

#### Automated Verification

- `cd web && ng build` — zero błędów + zero Angular warnings

#### Manual Verification

- Kliknij [1] badge przy polu → PDF nawiguje do strony + snippet panel pojawia się z verbatim quote
- Jeśli text layer match: żółte podświetlenie widoczne na canvas overlay
- Jeśli brak match (np. scanned doc): snippet panel widoczny bez highlight, brak błędów w konsoli
- Zamknięcie snippet panel × → panel znika, highlight czyszczony
- NFR 500ms: kliknięcie → nawigacja strony < 500ms (highlight może być asynchroniczny)

**Implementation Note**: Pauza przed zamknięciem S-02.

---

## Testing Strategy

### Unit Tests (Backend)

- `DecisionControllerTest`: zaktualizowany VALID_JSON z `fields` array (już w P1)
- Nowy test: POST finalize z pełnym fields array z override i citations → 200 + auditRecordId
- Nowy test: POST finalize bez `fields` klucza → 422 schema validation error

### Manual Testing Steps

1. `docker compose up -d` + `./mvnw spring-boot:run -Dspring-boot.run.profiles=dev`
2. `cd web && ng serve`
3. Upload PDF → `/cases/{id}` → Analizuj → poczekaj na ANALYZED
4. Edytuj pole: kliknij ✏ → zmień wartość → wpisz uzasadnienie → Zapisz → sprawdź override badge
5. Kliknij badge [1] przy polu → sprawdź nawigację PDF + snippet panel + (opcjonalnie) highlight
6. Kliknij Approve → sprawdź `SELECT payload::jsonb->'fields' FROM audit_record` zawiera override i citations
7. Reload na LOCKED case → sprawdź override badge + expandable widok

## Performance Considerations

- Text layer (`page.getTextContent()`) jest asynchroniczny — nie blokuje page navigation (500ms NFR spełnione przez nawigację, highlight może przyjść po)
- `attemptHighlight` nie rzuca wyjątku na mismatch — silent fallback do snippet panel
- `highlightLayerRef` jest czyszczony przed każdym nowym highlight → brak memory leak

## References

- PRD: `context/foundation/prd.md` — FR-010, FR-014, FR-012, FR-013, US-01
- S-01 plan: `context/changes/core-case-flow/plan.md`
- ExtractionEvent.java: `src/main/java/com/example/clearkyc/analysis/ExtractionEvent.java` — Citation(quote, pageNumber)
- pdfjs-dist TextItem API: `transform[4]` = x, `transform[5]` = y w PDF user space; `viewport.convertToViewportPoint(x, y)` → CSS px

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — JSON Schema v0.2 + payload evolution

#### Automated

- [x] 1.1 `./mvnw compile` — zero błędów — b9dfd57
- [x] 1.2 `./mvnw test` — wszystkie testy zielone — b9dfd57
- [x] 1.3 `./mvnw verify` — clean build — b9dfd57

#### Manual

- [x] 1.4 POST /finalize z fields array → 200; payload bez fields → 422; ponowne finalize → 409 — b9dfd57

### Phase 2: Angular — Models + CaseStore + FinalizePayload

#### Automated

- [x] 2.1 `cd web && ng build` — zero błędów TypeScript strict — f24f324

#### Manual

- [x] 2.2 DevTools Console — brak błędów po zalogowaniu — f24f324
- [x] 2.3 Angular DevTools — fieldOverrides i activeQuote widoczne w CaseStore — f24f324

### Phase 3: Angular — Inline field edit UI

#### Automated

- [x] 3.1 `cd web && ng build` — zero błędów

#### Manual

- [x] 3.2 Edycja pola ANALYZED: inline form, walidacja uzasadnienia, override badge
- [x] 3.3 Widok LOCKED: override expandable z oryginałem LLM + uzasadnieniem
- [x] 3.4 Re-analyze warning gdy są aktywne overrides
- [x] 3.5 Pole "Not Disclosed / Inferred Missing" edytowalne z uzasadnieniem

### Phase 4: Angular — Snippet panel + text highlight

#### Automated

- [ ] 4.1 `cd web && ng build` — zero błędów + zero Angular warnings

#### Manual

- [ ] 4.2 Kliknięcie badge → nawigacja PDF + snippet panel z verbatim quote
- [ ] 4.3 Text layer highlight widoczny na dopasowanym dokumencie
- [ ] 4.4 Brak highlight (scanned doc / mismatch) → snippet panel widoczny, brak błędów konsoli
- [ ] 4.5 Payload po Approve zawiera fields array z citations i overrides (SELECT z DB)
