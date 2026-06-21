# Extraction Streaming UX — Implementation Plan

## Overview

Dodanie skeleton placeholder i animacji shimmer w panelu ekstrakcji, żeby użytkownik zawsze miał
feedback wizualny: przed analizą (pusty stan z instrukcją), podczas startu streamu (shimmer) i
gdy pola pojawiają się ze streamu (fade-in). Żadnych zmian backendowych ani w serwisach.

## Current State Analysis

- `extraction-form.component.html` — gdy `extractionFields().length === 0 && !isAnalyzing()`: widoczny
  tylko nagłówek + przycisk; poniżej biała pustka. Brak wskazówki co zrobić.
- Luka startu: po kliknięciu "Uruchom analizę" przycisk znika (`!isAnalyzing()` staje się false),
  ale pierwsze pole ze streamu pojawia się z opóźnieniem — przez chwilę formularz jest pusty.
- Podczas streamu istnieje już `.cursor` z `animation: blink` per-pole. Pola nie mają żadnej
  animacji wejścia.
- Istniejące wzorce animacji: `@keyframes blink` (extraction-form.component.scss:192),
  `@keyframes pulse` (workstation-topbar.component.scss:110), `.skel`/`.viz-cursor`
  (landing.component.scss:53,90) — można czerpać wzorce bez duplikowania tokenów design systemu.

## Desired End State

- Gdy formularz jest pusty (status CREATED, brak pól):
  - bez PDF: 8 szarych rzędów szkieletowych + tekst "Wgraj plik PDF aby rozpocząć analizę"
  - z PDF: 8 szarych rzędów szkieletowych + tekst "Kliknij ▶ Uruchom analizę"
- Gdy `isAnalyzing() && extractionFields().length === 0` (luka startu): te same 8 rzędów z
  animacją shimmer (przesuwający się gradient) sygnalizującą ładowanie
- Gdy pola pojawiają się ze streamu: każdy nowy wiersz wlatuje z `fadeIn` 150ms (opacity 0→1,
  translateY -3px→0); istniejący blink cursor pozostaje bez zmian
- Skeleton chowa się automatycznie gdy `extractionFields().length > 0`

### Key Discoveries:

- Sygnały do kontrolowania widoczności już istnieją w template: `caseStore.pdfBlob()`,
  `caseStore.isAnalyzing()`, `caseStore.extractionFields().length`, `caseStore.caseStatus()`
  (`extraction-form.component.html:1`)
- `.field-row` używa `grid-template-columns: 168px 1fr` (`extraction-form.component.scss:122`) —
  skeleton musi naśladować ten układ
- Brak tokenów CSS dla `duration`/`easing` w `_variables.scss` — hardkodować wartości bezpośrednio
  w komponentach SCSS (zgodnie z istniejącym wzorcem)
- Klasa `.ef-callout` (`extraction-form.component.scss:11`) pokazuje się po `caseStatus === 'ANALYZED'` —
  skeleton znika zanim ta klasa się pojawi, więc nie ma konfliktu

## What We're NOT Doing

- Brak zmian w `ExtractionStreamService` ani `CaseStore`
- Brak animacji typewriter znak-po-znaku dla wartości pól (wybrana opcja: fade-in + blink cursor)
- Brak zmian w TypeScript (żadnych nowych sygnałów, metod ani logiki)
- Brak nowych tokenów animacji w `_variables.scss` (zgodnie z istniejącym wzorcem hardkodowania)
- Brak staggered/sekwencyjnych opóźnień dla fade-in (zbyt duża komplikacja, 150ms flat)

## Implementation Approach

Czysty CSS + HTML. Dodajemy blok `<div class="ef-skeleton">` widoczny gdy
`extractionFields().length === 0 && caseStatus !== 'LOCKED'`. Shimmer włącza się przez dodatkową
klasę `ef-skeleton--shimmer` gdy `isAnalyzing()`. Fade-in pól to `animation: rowAppear 150ms ease both`
na `.field-row` — działa przy każdym dodaniu nowego węzła DOM przez `@for`.

## Phase 1: Skeleton placeholder + shimmer

### Overview

Dodanie bloku szkieletowego do `extraction-form.component.html` i odpowiednich styli SCSS.
Obejmuje static skeleton (empty state), shimmer (luka startu), oraz dwuwariantowy hint text.

### Changes Required:

#### 1. Skeleton HTML

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html`

**Intent**: Dodać blok `<div class="ef-skeleton">` pod blokiem `.pane-head` (przed blokiem `@if analysisError`),
widoczny tylko gdy `extractionFields().length === 0` i caseStatus !== 'LOCKED'. Klasa
`ef-skeleton--shimmer` ma być aktywna gdy `isAnalyzing()` jest true.

**Contract**: Warunek widoczności:
```html
@if (caseStore.extractionFields().length === 0 && caseStore.caseStatus() !== 'LOCKED') {
  <div class="ef-skeleton" [class.ef-skeleton--shimmer]="caseStore.isAnalyzing()">
    <div class="ef-skel-row" *ngFor or 8 inline divs></div>
    ...
    @if (!caseStore.isAnalyzing()) {
      <p class="ef-skel-hint">
        @if (!caseStore.pdfBlob()) { Wgraj plik PDF aby rozpocząć analizę }
        @else { Kliknij ▶ Uruchom analizę w prawym górnym rogu }
      </p>
    }
  </div>
}
```
Każdy `ef-skel-row` zawiera dwa elementy: `ef-skel-bar ef-skel-bar--label` i
`ef-skel-bar ef-skel-bar--value`. 8 rzędów zakodowanych statycznie. Różne długości `ef-skel-bar--value`
co drugi rząd przez klasy `ef-skel-bar--value-short`.

#### 2. Skeleton SCSS

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.scss`

**Intent**: Dodać style dla `.ef-skeleton`, `.ef-skel-row`, `.ef-skel-bar`, `.ef-skel-hint`
oraz `@keyframes shimmer`. Wstawić sekcję po `.extraction-form__error-banner` (ok. linia 113).

**Contract**:
- `.ef-skeleton`: `border-top: 1px solid var(--border-default);`
- `.ef-skel-row`: `display: grid; grid-template-columns: 168px 1fr; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-subtle);` — identyczny grid jak `.field-row`
- `.ef-skel-bar`: `height: 14px; border-radius: var(--radius-xs); background: var(--gray-200);`
- `.ef-skel-bar--label`: `width: 72px;`
- `.ef-skel-bar--value`: `width: 100%;`
- `.ef-skel-bar--value-short`: `width: 55%;` (naprzemiennie)
- `.ef-skel-hint`: styl jak `.form-footnote` (text-2xs, text-tertiary, padding space-3)
- `@keyframes shimmer`: gradient 90deg od `var(--gray-200)` przez `var(--gray-100)` do `var(--gray-200)`, `background-size: 200%`, `animation-duration: 1.5s linear infinite`
- `.ef-skeleton--shimmer .ef-skel-bar`: aplikuje shimmer animation

### Success Criteria:

#### Automated Verification:

- Typecheck przechodzi: `cd web && npx tsc --noEmit`
- Lint przechodzi: `cd web && npx ng lint` (lub ekwiwalent jeśli skonfigurowany)

#### Manual Verification:

- Bez PDF: skeleton 8 rzędów widoczny, hint "Wgraj plik PDF"
- Z PDF ale przed kliknięciem: skeleton 8 rzędów, hint "Kliknij ▶ Uruchom analizę"
- Po kliknięciu Uruchom (isAnalyzing=true, 0 pól): shimmer przesuwa się przez rzędy
- Po pojawieniu się pierwszego pola: skeleton chowa się, field-list widoczny
- Status LOCKED: skeleton nie widoczny (zamiast tego .extraction-form__locked)
- Po zakończeniu analizy i refresh strony: skeleton nie widoczny (pola załadowane)

**Implementation Note**: Po przejściu automated, pauza na manual. Dopiero po potwierdzeniu
człowieka przechodzimy do Phase 2.

---

## Phase 2: Fade-in animation dla wierszy pól

### Overview

Dodanie animacji wejścia `rowAppear` do `.field-row` w SCSS. Każdy nowy wiersz pojawiający się
podczas streamu wlatuje płynnie (opacity 0→1, drobne przesunięcie w górę). Bez zmian w HTML ani TS.

### Changes Required:

#### 1. rowAppear SCSS

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.scss`

**Intent**: Dodać `@keyframes rowAppear` i aplikować animację na `.field-row`. Wstawić obok
istniejącego `@keyframes blink` (linia 192).

**Contract**:
```scss
@keyframes rowAppear {
  from { opacity: 0; transform: translateY(-3px); }
  to   { opacity: 1; transform: translateY(0); }
}
```
Dodać do reguły `.field-row` (linia 121): `animation: rowAppear 150ms ease both;`

Nie dodawać `animation-delay` ani stagger. `animation-fill-mode: both` (skrót `both`) zapewnia
że wiersz startuje z opacity:0 zanim animacja się zacznie.

### Success Criteria:

#### Automated Verification:

- Typecheck przechodzi: `cd web && npx tsc --noEmit`

#### Manual Verification:

- Podczas aktywnego streamu: każde nowe pole wlatuje z subtelnym fade+slide (150ms)
- Przy ładowaniu zakończonej analizy (odświeżenie strony): wszystkie pola pojawiają się płynnie
  w ciągu 150ms (nie są widoczne z opóźnieniem sekwencyjnym — to OK)
- Animacja nie powoduje "migotania" ani przeskoku layoutu
- `prefers-reduced-motion`: weryfikacja czy fade-in jest akceptowalny (150ms to krótko — można
  zostawić bez media query, ale sprawdzić wizualnie)

---

## Testing Strategy

### Manual Testing Steps:

1. Otwórz sprawę w stanie CREATED bez wgranego PDF — sprawdź skeleton + hint "Wgraj plik PDF"
2. Wgraj PDF (nie uruchamiając analizy) — sprawdź zmianę hintu na "Kliknij ▶ Uruchom analizę"
3. Kliknij Uruchom analizę — sprawdź shimmer podczas luki startu (chwila przed pierwszym polem)
4. Obserwuj pojawianie się pól — sprawdź fade-in każdego nowego wiersza
5. Po zakończeniu analizy — sprawdź że skeleton nie jest widoczny
6. Odśwież stronę ze sprawą ANALYZED — sprawdź że skeleton nie pojawia się (pola ładują się)
7. Przejdź do sprawy LOCKED — sprawdź że skeleton nie pojawia się

## References

- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html`
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.scss`
- `web/src/app/features/landing/landing.component.scss` — wzorce `.skel` i `.mf-cursor`
- `web/src/styles/design-system/_variables.scss` — tokeny `--gray-*`, `--border-*`, `--space-*`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Skeleton placeholder + shimmer

#### Automated

- [x] 1.1 Typecheck przechodzi po dodaniu skeleton HTML i SCSS

#### Manual

- [x] 1.2 Skeleton bez PDF: 8 rzędów + hint "Wgraj plik PDF"
- [x] 1.3 Skeleton z PDF: 8 rzędów + hint "Kliknij ▶ Uruchom analizę"
- [x] 1.4 Shimmer podczas luki startu (isAnalyzing=true, 0 pól)
- [x] 1.5 Skeleton chowa się gdy pojawia się pierwsze pole
- [x] 1.6 Skeleton niewidoczny dla LOCKED i po refresh ANALYZED

### Phase 2: Fade-in animation dla wierszy pól

#### Automated

- [ ] 2.1 Typecheck przechodzi po dodaniu rowAppear

#### Manual

- [ ] 2.2 Fade-in widoczny podczas aktywnego streamu (nowe pole wlatuje 150ms)
- [ ] 2.3 Brak migotania layoutu podczas animacji
