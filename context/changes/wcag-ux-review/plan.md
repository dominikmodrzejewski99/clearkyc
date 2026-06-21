# WCAG 2.2 AA + UX Accessibility Fixes Implementation Plan

## Overview

Naprawa naruszeń WCAG 2.2 AA w całym frontendzie ClearKYC oraz kilku krytycznych luk UX.
Zakres: krytyczne i poważne naruszenia WCAG Level A/AA + proste poprawki UX (m-3, m-4, m-7).
Nie obejmuje: kompleksowego przeprojektowania tokenów border, pełnego redesignu palet kolorów,
obsługi błędów sieciowych, listy spraw jako pełnego komponentu.

## Current State Analysis

Audyt z 2026-06-21 (`context/changes/wcag-ux-review/research.md`) wykazał 74 problemy.
W zakresie planu: 35 krytycznych i poważnych naruszeń WCAG.

### Key Discoveries:

- `web/index.html` nie ma `lang="pl"` — blokuje WCAG 3.1.1 Level A
- `@angular/cdk` nie jest zainstalowany; `FocusTrap` wymaga go (`package.json` w `web/`)
- `--text-placeholder: #8B95A1` (3.1:1 na white) i `--text-tertiary: #6B7480` (4.41:1 na `--gray-50`) poniżej progu 4.5:1
- `--text-disabled` jest ZWOLNIONY z wymogów kontrastu (WCAG 1.4.3 wyłącza inactive UI components)
- Tokeny `--border-default/strong` mają niski kontrast, ale zmiana wpłynęłaby na cały projekt wizualny — deferujemy do osobnej zmiany
- `citation-badge` używa `<sup>` jako interaktywnego elementu — zamiana na `<button>` jest najprostszą naprawą semantyczną i automatycznie rozwiązuje problem klawisza Space
- `onboarding-overlay.component.scss` używa nieistniejącego tokenu `--control-height-md` — naprawiamy w Fazie 3
- `role="dialog"` jest na `.oo-backdrop` zamiast na `.oo-modal` — wymaga przeniesienia
- Brak `role="radiogroup"` w decision-bar — fix: ARIA roles na istniejących `<button>` (nie refaktor na `<input type="radio">`)
- Trasa `/cases` nie istnieje w `app.routes.ts` — dodajemy redirect do `/cases/new`

## Desired End State

Frontend ClearKYC przechodzi audyt WCAG 2.2 AA dla wszystkich krytycznych i poważnych kryteriów.
Wszystkie interaktywne elementy są obsługiwane z klawiatury i mają widoczne wskaźniki fokusa.
Dynamiczne zmiany treści (analiza, błędy, ostrzeżenia) są ogłaszane przez czytniki ekranowe.
Tokeny kolorów tekstu spełniają 4.5:1 na wszystkich używanych tłach.

### Key Discoveries:

- `onboarding-overlay.component.ts:17` — focus trap wejdzie przez CDK `FocusTrap` w `ngAfterViewInit`
- `decision-bar.component.html:20-38` — `<div role="radiogroup">` opakuje trzy `<button role="radio">`
- `web/src/styles/design-system/_variables.scss:82` — `--text-tertiary: #6B7480` → `#5F6773`; `--text-placeholder: #8B95A1` → `#6E7882`
- `web/src/app/app.routes.ts` — dodać `{ path: 'cases', redirectTo: 'cases/new', pathMatch: 'full' }`
- Angular CDK version musi pasować do Angular: `@angular/cdk@^21.0.0`

## What We're NOT Doing

- Tokeny `--border-default/strong` — zbyt duże ryzyko regresji wizualnej; osobna zmiana
- UX issues C-1/C-2/C-3 (progress indicator, success toast, warning before click) — osobna zmiana
- Pełna lista spraw pod `/cases` jako nowy komponent — tylko redirect
- Aria-live przez `LiveAnnouncer` (CDK) — używamy atrybutów HTML `aria-live` bezpośrednio (prostsze, brak zależności od DI)
- WCAG nice-to-have (N-1 do N-4 z researchu)
- Responsywność / zoom 400% (N-3)
- Testowanie czytnikiem ekranowym NVDA/VoiceOver — tylko DevTools + axe-core

## Implementation Approach

4 fazy wg warstwy zmian, aby każda faza dawała izolowany, testowalny przyrost:
- Faza 1: Template-only — HTML/ARIA, brak TS ani SCSS
- Faza 2: Mix HTML + minimalny TS — drugorzędne ARIA + routing + UX 1-liners
- Faza 3: SCSS-only — tokeny kolorów + :focus-visible
- Faza 4: TS + nowa zależność — CDK focus trap + klawiatura resizera

## Critical Implementation Details

**`<button>` zamiast `<sup>` w citation-badge:** Po zmianie tagu, przeglądarka obsługuje Enter i Space natywnie.
Usuń `tabindex="0"` i `(keyup.enter)` — są zbędne dla `<button>`. Klasa `.cite-sup` zostaje;
dodaj CSS reset w SCSS (Faza 3): `background: none; border: none; padding: 0;`.

**`role="radio"` na `<button>`:** ARIA spec pozwala `role="radio"` na dowolnym elemencie.
`[attr.aria-checked]` musi być stringiem (`"true"/"false"`), nie boolean. Angular: `[attr.aria-checked]="pendingDecision() === 'APPROVE' ? 'true' : 'false'"`.

**`--text-tertiary` poprawka:** Token jest używany na tłach `--gray-50` i `--gray-100` (extraction-form sekcje).
Nowa wartość `#5F6773` osiąga ≥4.5:1 na `--gray-50` (#F5F7F9) i na białym.
Sprawdź kontrast przez DevTools → CSS → Color Contrast lub contrast-ratio.com.

**`@angular/cdk@^21.0.0`:** Wersja CDK musi zgadzać się z wersją Angular (21.x).
Sprawdź: `ng version` w katalogu `web/` przed instalacją. `FocusTrap` importuj z `@angular/cdk/a11y`.

---

## Phase 1: Krytyczne blokery WCAG — HTML i ARIA

### Overview

Poprawia wyłącznie pliki HTML (+ `index.html`). Zero zmian w TypeScript i SCSS.
Adresuje naruszenia WCAG Level A (lang, keyboard access, form labels) i poważne Level AA (ARIA roles, live regions).

### Changes Required:

#### 1. Język strony

**File**: `web/index.html`

**Intent**: Dodaj deklarację języka polskiego — blokuje WCAG 3.1.1 (Level A).

**Contract**: Na elemencie `<html>` dodaj atrybut `lang="pl"`.

---

#### 2. Onboarding overlay — poprawka role="dialog"

**File**: `web/src/app/shared/components/onboarding-overlay/onboarding-overlay.component.html`

**Intent**: `role="dialog"` musi być na samym dialogu (`.oo-modal`), nie na półprzezroczystym tle (`.oo-backdrop`). Heading `<h2 class="oo-title">` musi być podlinkowany przez `aria-labelledby`.

**Contract**:
- Przenieś `role="dialog" aria-modal="true" aria-label="..."` z `.oo-backdrop` na `.oo-modal` div
- Usuń `aria-label` z `.oo-modal` — zostanie zastąpiony przez `aria-labelledby`
- Dodaj `id="oo-title-1" aria-labelledby="oo-title-1"` do `.oo-modal`
- Dodaj `id="oo-title-1"` do `<h2 class="oo-title">` w każdym `@case`
- Zachowaj `(click)="dismiss()"` tylko na `.oo-backdrop` (klik w tło zamyka)

---

#### 3. File dropzone — dostępność klawiatury i ARIA

**File**: `web/src/app/shared/components/file-dropzone/file-dropzone.component.html`

**Intent**: `.drop-zone` jest niewidoczny dla AT i niedostępny z klawiatury. Błąd walidacji nie jest ogłaszany przez czytniki ekranu.

**Contract**:
- Na `.drop-zone` div dodaj: `role="button" tabindex="0" aria-label="Wgraj plik PDF — kliknij lub przeciągnij plik"` oraz `(keyup.enter)="fileInput.click()" (keyup.space)="fileInput.click()"`
- Na elemencie `.dz-error` (kontener błędu) dodaj: `role="alert" aria-live="assertive" aria-atomic="true"`
- Na ukrytym `<input type="file">` dodaj: `aria-label="Wybierz plik PDF (maks. 50 MB)"`

---

#### 4. Citation badge — zamiana `<sup>` na `<button>`

**File**: `web/src/app/shared/components/citation-badge/citation-badge.component.html`

**Intent**: `<sup>` nie jest semantycznym elementem interaktywnym. Zamiana na `<button>` eliminuje naruszenie 4.1.2 i automatycznie rozwiązuje problem klawisza Space.

**Contract**:
- Zamień `<sup class="cite-sup" (click)="navigate()" (keyup.enter)="navigate()" tabindex="0" ...>` na `<button class="cite-sup" type="button" (click)="navigate()" ...>`
- Usuń `tabindex="0"` i `(keyup.enter)` — `<button>` obsługuje oba natywnie
- Zachowaj `[title]`, `[attr.aria-label]` bez zmian
- Zawartość `[{{ index() }}]` pozostaje bez zmian

---

#### 5. Decision bar — semantyka radio group

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.html`

**Intent**: Trzy przyciski decyzji działają jak radio group (wzajemnie wykluczające się), ale AT nie wie o tej relacji. Ostrzeżenie o nieodwracalności powinno być ogłaszane automatycznie.

**Contract**:
- Opakuj trzy `<button class="decision-bar__btn ...">` w `<div role="radiogroup" aria-label="Decyzja compliance">`
- Na każdym z trzech przycisków dodaj `role="radio"` i `[attr.aria-checked]`:
  - Zatwierdź: `[attr.aria-checked]="pendingDecision() === 'APPROVE' ? 'true' : 'false'"`
  - Odrzuć: `[attr.aria-checked]="pendingDecision() === 'REJECT' ? 'true' : 'false'"`
  - Eskaluj: `[attr.aria-checked]="pendingDecision() === 'ESCALATE' ? 'true' : 'false'"`
- Na `<p class="decision-bar__warning">` dodaj: `id="decision-warning" aria-live="polite" aria-atomic="true"`
- Na `<button class="commit-btn">` dodaj: `[attr.aria-describedby]="pendingDecision() ? 'decision-warning' : null"`
- Na `<p class="decision-bar__error">` dodaj: `role="alert" aria-live="assertive"`

---

#### 6. Extraction form — ARIA dla komunikatów i pól formularza

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html`

**Intent**: Błędy analizy, callout powodzenia i dialog reanalysis nie są ogłaszane przez AT. Pola override form nie mają powiązanych etykiet.

**Contract**:
- Na `.extraction-form__error-banner` dodaj: `role="alert" aria-live="assertive" aria-atomic="true"`
- Na `.ef-callout` dodaj: `role="status" aria-live="polite" aria-atomic="true"`
- Na `.ef-dialog` (dialog reanalysis): zmień na `role="alertdialog"`, dodaj `aria-labelledby="ef-dialog-title"`, dodaj `id="ef-dialog-title"` do `<h3>` wewnątrz
- W formularzu override: dodaj `id="edit-value-input"` do `<input>` nowej wartości i `for="edit-value-input"` do jego `<label>`; dodaj `id="edit-justification-input"` do `<textarea>` uzasadnienia i `for="edit-justification-input"` do jego `<label>`; na textarea dodaj `aria-required="true"`

---

#### 7. Red flag list — semantyka listy + aria-live

**File**: `web/src/app/features/case-detail/components/red-flag-list/red-flag-list.component.html`

**Intent**: Lista flag używa `<div>` zamiast `<ul>/<li>`. Dynamicznie dodawane flagi nie są ogłaszane.

**Contract**:
- Kontener `.red-flag-items` zmień z `<div>` na `<ul>` z atrybutem `aria-live="polite" aria-atomic="false"`; jeśli `<section>` zawiera heading `<h3>`, dodaj do niego `id="red-flag-heading"` i `aria-labelledby="red-flag-heading"` do `<section>`
- Każdy `.red-flag-item` zmień z `<div>` na `<li>`

---

#### 8. Case-new — upload status i semantyka listy spraw

**File**: `web/src/app/features/case-new/case-new.component.html`

**Intent**: Status uploadu nie jest ogłaszany. Przycisk usuwania pliku nie ma dostępnej nazwy. Lista ostatnich spraw nie ma semantyki listy.

**Contract**:
- Na `.upload-status` span (komunikat "Tworzenie sprawy...") dodaj: `role="status" aria-live="polite" aria-atomic="true"`
- Na przycisku `.fc-remove` dodaj: `aria-label="Usuń wybrany plik PDF"`
- Kontener `.case-list` z linkami do spraw: opakuj w `<ul>`, każdy `.case-card` przenieś do `<li>`

---

#### 9. Landing page — nawigacja i SVG

**File**: `web/src/app/features/landing/landing.component.html`

**Intent**: Element `<nav>` bez etykiety jest niejednoznaczny dla AT. Dekoracyjne SVG powinny być ukryte przed AT.

**Contract**:
- Na `<nav class="nav">` dodaj: `aria-label="Główna nawigacja"`
- Na wszystkich dekoracyjnych SVG w sekcjach steps (linie ~113, 129, 151) dodaj: `aria-hidden="true"`
- Jeśli `<a id="top">` nie ma `href`, zmień na `<div id="top">` lub dodaj `id="top"` do pierwszej `<section>`

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `cd web && npx tsc --noEmit`
- Build passes: `cd web && npm run build`

#### Manual Verification:

- DevTools → Elements: `<html lang="pl">` widoczne w index.html
- `role="dialog"` widoczne na `.oo-modal`, nie na `.oo-backdrop`
- DevTools accessibility tree: dropdown dropzone ma role=button + accessible name
- citation-badge renderuje się jako `<button>` w DOM
- decision-bar: `role="radiogroup"` widoczne w accessibility tree, `aria-checked="true"` przełącza się po kliknięciu
- `role="alert"` widoczne na bannerze błędu extraction-form
- `role="alertdialog"` widoczne na ef-dialog
- Red flag items renderowane jako `<li>` wewnątrz `<ul>`
- axe DevTools: uruchom scan na `/cases/new` — brak nowych naruszeń Level A/AA

---

## Phase 2: Drugorzędne ARIA + proste UX fixes

### Overview

Mix drobnych ARIA poprawek i 1-linijkowych UX fixes. Dotyka HTML, minimalnego TS i routingu.

### Changes Required:

#### 1. Case detail — re-upload input label

**File**: `web/src/app/features/case-detail/case-detail.component.html`

**Intent**: Ukryty input pliku w re-upload banner nie ma dostępnej nazwy dla AT.

**Contract**: Na `<input type="file" class="re-upload-banner__input">` dodaj `aria-label="Wybierz plik PDF"`.

---

#### 2. Decision bar — mapowanie decyzji na PL (m-7)

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.ts`

**Intent**: W trybie LOCKED, `lockedDecision()` wyświetla angielską wartość `'APPROVE'/'REJECT'/'ESCALATE'` zamiast polskiej.

**Contract**: W komponencie dodaj computed signal lub metodę `lockedDecisionLabel()` która mapuje:
`'APPROVE' → 'Zatwierdzona'`, `'REJECT' → 'Odrzucona'`, `'ESCALATE' → 'Eskalowana'`, `null → ''`.
W template zamień `{{ lockedDecision() }}` na `{{ lockedDecisionLabel() }}`.

---

#### 3. Decision bar — wizualne wyróżnienie ostrzeżenia (m-4)

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.html`

**Intent**: `decision-meta__warn` i komunikat sukcesu mają identyczny wygląd — analityk nie odróżnia ich na pierwszy rzut oka.

**Contract**: Na `<span class="decision-meta__warn">` dodaj klasę `decision-meta__warn--alert` (stylowanie w Fazie 3 SCSS). Kontener sukcesu pozostaje bez zmian.

---

#### 4. Routing — trasa /cases

**File**: `web/src/app/app.routes.ts`

**Intent**: Link `← Sprawy` w topbarze prowadzi na `/` (landing), ale powinien prowadzić na listę spraw. Dodanie trasy `/cases` jako redirect pozwala zmienić cel linku bez nowego komponentu.

**Contract**: Przed istniejącą trasą `{ path: '' }` dodaj:
`{ path: 'cases', redirectTo: 'cases/new', pathMatch: 'full' }`

---

#### 5. Workstation topbar — poprawka back link (m-3)

**File**: `web/src/app/shared/components/workstation-topbar/workstation-topbar.component.html`

**Intent**: Link `← Sprawy` używa `routerLink="/"` (landing page) zamiast `/cases`.

**Contract**: Zmień `routerLink="/"` na `routerLink="/cases"`.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `cd web && npx tsc --noEmit`
- Build passes: `cd web && npm run build`

#### Manual Verification:

- W locked state decision-bar wyświetla "Sprawa zablokowana — decyzja: **Zatwierdzona**" (PL)
- `decision-meta__warn` ma wizualnie inny wygląd niż komunikat sukcesu (sprawdź w Fazie 3 po dodaniu SCSS)
- Kliknięcie `← Sprawy` w topbarze prowadzi na `/cases/new` (a nie na landing `/`)
- URL `/cases` przekierowuje do `/cases/new`

---

## Phase 3: System kolorów i :focus-visible

### Overview

Poprawki wyłącznie w SCSS. Koryguje niespełniające 4.5:1 tokeny tekstu, dodaje `:focus-visible`
na wszystkich interaktywnych elementach i naprawia brakujący token `--control-height-md`.

### Changes Required:

#### 1. Tokeny kolorów — text-placeholder i text-tertiary

**File**: `web/src/styles/design-system/_variables.scss`

**Intent**: `--text-placeholder: #8B95A1` (3.1:1) i `--text-tertiary: #6B7480` (4.41:1 na gray-50) poniżej WCAG 4.5:1. `--text-disabled` jest zwolniony (WCAG 1.4.3). Tokeny border są deferred.

**Contract**:
- Zmień `--text-placeholder` z `#8B95A1` na `#6E7882` (≥4.5:1 na white — zweryfikuj przez DevTools Contrast Checker przed commitem)
- Zmień `--text-tertiary` z `#6B7480` na `#5F6773` (≥4.5:1 na `--gray-50` #F5F7F9 i na white)
- Zaktualizuj komentarz przy `--text-tertiary` z `4.8:1` na realną wartość po zmianie
- Usuń komentarz `// Every text-on-surface pairing meets WCAG 2.1 AA` w nagłówku — po audycie jest nieprawdziwy
- Dodaj nowy token `--control-height-md: 32px;` po `--control-height: 28px` (naprawia bug w onboarding overlay)

---

#### 2. Decision bar — :focus-visible

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.scss`

**Intent**: Przyciski decyzji i "Potwierdź" nie mają wskaźnika fokusa — blokuje WCAG 2.4.7.

**Contract**: W bloku `&__btn` i `.commit-btn` dodaj:
```scss
&:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```
Dla `.decision-bar__btn--active` ze sobą-pokolorowanym tłem, `outline-color` może pozostać `--border-focus` (wystarczający kontrast 5.25:1 na white). Dodaj też `.decision-meta__warn--alert` styl:
```scss
.decision-meta__warn--alert {
  color: var(--escalate-solid);
  font-weight: var(--weight-medium);
}
```

---

#### 3. Onboarding overlay — :focus-visible + fix close button + fix --control-height-md

**File**: `web/src/app/shared/components/onboarding-overlay/onboarding-overlay.component.scss`

**Intent**: Przyciski overlaya nie mają `:focus-visible`. Przycisk zamknięcia ma `padding: 0` — zbyt mały obszar dotykowy. Token `--control-height-md` nie istnieje.

**Contract**:
- Na `.oo-btn-primary` i `.oo-btn-secondary` dodaj `:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; border-radius: var(--radius-sm); }`
- Na `.oo-close` zmień `padding: 0` na `padding: var(--space-2)`, dodaj `:focus-visible` z outline
- W `.oo-btn-primary` i `.oo-btn-secondary` zamień `height: var(--control-height-md)` na `height: var(--control-height-lg)` (token `--control-height-md` nie istniał — bug z Fazy onboarding)

---

#### 4. Citation badge — CSS reset po zmianie na `<button>`

**File**: `web/src/app/shared/components/citation-badge/citation-badge.component.scss`

**Intent**: Po zmianie `<sup>` na `<button>` (Faza 1) przeglądarka dodaje domyślne style przycisku — resetujemy je.

**Contract**: W bloku `.cite-sup` dodaj na początku:
```scss
background: none;
border: none;
padding: 0;
font: inherit;
cursor: pointer;
```
Usuń `cursor: pointer` jeśli duplikuje się z powyższym. Zachowaj wszystkie istniejące style (kolor, rozmiar, `vertical-align: super`, `font-family`, `font-size`, `:hover`, `:focus-visible`).

---

#### 5. Extraction form — :focus-visible na edit-btn i citation

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.scss`

**Intent**: Przyciski edit i citation w extraction form mogą nie mieć widocznych wskaźników fokusa.

**Contract**: Dodaj (jeśli nie istnieje) w blokach `.edit-btn` i `.citation`:
```scss
&:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```
Jeśli już istnieje, potwierdź że nie jest nadpisywane przez `outline: none`.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `cd web && npx tsc --noEmit`
- Build passes: `cd web && npm run build`

#### Manual Verification:

- DevTools: `--text-placeholder` nowa wartość i jej kontrast ≥4.5:1 na white (Elements → Styles → kliknij kwadrat koloru → Contrast Ratio)
- DevTools: `--text-tertiary` nowa wartość i jej kontrast ≥4.5:1 na `--gray-50` (#F5F7F9)
- Tab przez decision-bar: każdy przycisk ma widoczny niebieski outline przy fokusie
- Tab przez onboarding overlay (usuń localStorage key, odśwież): przyciski Dalej/Wstecz/× mają outline przy fokusie, obszar × jest powiększony
- Tab przez extraction form field: przycisk edit (✎) ma outline
- axe DevTools: uruchom scan na `/cases/new` i `/cases/<id>` — brak naruszeń contrast w Level AA

---

## Phase 4: Klawiatura i CDK focus trap

### Overview

Instalacja `@angular/cdk`, implementacja pułapki fokusa w onboarding overlay i obsługa klawiatury w reserze paneli (app-layout). Jedyna faza z nową zewnętrzną zależnością.

### Changes Required:

#### 1. Instalacja @angular/cdk

**File**: `web/package.json`

**Intent**: `@angular/cdk/a11y` jest wymagany przez `FocusTrap`. Wersja musi zgadzać się z Angular (21.x).

**Contract**: Uruchom `cd web && npm install @angular/cdk@^21.0.0 --save`. Sprawdź że `package.json` zawiera `"@angular/cdk": "^21.x.x"`. `package-lock.json` aktualizuje się automatycznie.

---

#### 2. Onboarding overlay — focus trap i Escape

**File**: `web/src/app/shared/components/onboarding-overlay/onboarding-overlay.component.ts`

**Intent**: Modal onboarding nie ma pułapki fokusa — Tab ucieka poza dialog. Brak obsługi Escape. Blokuje WCAG 2.1.2 (Level A).

**Contract**:
- Dodaj import: `import { A11yModule } from '@angular/cdk/a11y';` do listy `imports` komponentu
- Wstrzyknij `private readonly focusTrapFactory = inject(FocusTrapFactory);` i `private readonly elementRef = inject(ElementRef);`
- Zaimplementuj `ngAfterViewInit()`: utwórz focus trap na `.oo-modal` elemencie; focusTrap.focusInitialElement()
- Dodaj `@HostListener('keydown.escape', ['$event']) onEscape(e: KeyboardEvent): void { e.preventDefault(); this.dismiss(); }`
- Pamiętaj o `focusTrap.destroy()` w `ngOnDestroy()`

---

#### 3. Onboarding overlay HTML — cdkTrapFocus (alternatywnie przez dyrektywę)

**File**: `web/src/app/shared/components/onboarding-overlay/onboarding-overlay.component.html`

**Intent**: Jeśli implementacja TS z FocusTrapFactory jest zbyt złożona, `cdkTrapFocus` dyrektywa jest prostszą alternatywą.

**Contract**: Na `.oo-modal` dodaj `cdkTrapFocus cdkTrapFocusAutoCapture`. Wymaga `A11yModule` w `imports`. To jest alternatywa do FocusTrapFactory w punkcie 2 — wybierz jedną z metod. Dyrektywa jest prostsza i preferowana. Dodaj `(keydown.escape)="dismiss()"` na `.oo-backdrop`.

---

#### 4. App layout — klawiatura dla resizera paneli

**File**: `web/src/app/layout/app-layout/app-layout.component.ts`

**Intent**: Resizer paneli obsługuje tylko mysz. Użytkownicy klawiatury nie mogą zmieniać proporcji paneli. Blokuje WCAG 2.1.1 (Level A).

**Contract**: Dodaj metodę `onResizerKeyDown(event: KeyboardEvent): void`:
- `ArrowRight`: `this.leftWidth.update(w => Math.min(70, w + (event.shiftKey ? 5 : 1)))`, `event.preventDefault()`
- `ArrowLeft`: `this.leftWidth.update(w => Math.max(30, w - (event.shiftKey ? 5 : 1)))`, `event.preventDefault()`
- Shift+strzałka: krok 5%, bez Shift: krok 1%

---

#### 5. App layout HTML — dostępność resizera

**File**: `web/src/app/layout/app-layout/app-layout.component.html`

**Intent**: Resizer musi być fokusowalny i ogłaszać swój stan AT.

**Contract**: Na `.app-layout__resizer` dodaj:
- `tabindex="0"`
- `role="separator"`
- `aria-label="Zmień szerokość paneli (strzałki lewo/prawo)"`
- `[attr.aria-valuenow]="leftWidth()"`
- `aria-valuemin="30"`
- `aria-valuemax="70"`
- `(keydown)="onResizerKeyDown($event)"`

Dodaj `:focus-visible` w `app-layout.component.scss` na `.app-layout__resizer`.

### Success Criteria:

#### Automated Verification:

- `cd web && npm install` — brak błędów, `@angular/cdk` widoczne w `node_modules`
- Typecheck passes: `cd web && npx tsc --noEmit`
- Build passes: `cd web && npm run build`

#### Manual Verification:

- Otwórz sprawę, usuń `clearkyc_onboarding_v1` z localStorage, odśwież — overlay pojawia się
- Naciśnij Tab kilka razy z fokusem na overlay — Tab NIE wychodzi poza `.oo-modal` (pułapka fokusa działa)
- Naciśnij Escape — overlay znika
- Tab na resizer paneli (separator) — element dostaje fokus z widocznym outline
- ArrowRight / ArrowLeft — panel lewego PDF rozszerza się / kurczy
- Shift+Arrow — panel skacze o 5% na raz
- axe DevTools: uruchom scan na `/cases/<id>` z otwartym overlayem — brak naruszeń

---

## Testing Strategy

### Automated Verification per Phase:

- `cd web && npx tsc --noEmit` — zero błędów TS
- `cd web && npm run build` — build kompiluje się, tylko pre-existing budget warning dla landing.scss

### Manual Testing Steps:

1. Zainstaluj axe DevTools Chrome extension (https://www.deque.com/axe/devtools/)
2. Po każdej fazie uruchom scan axe na:
   - `/` (landing page)
   - `/cases/new`
   - `/cases/<istniejące-id>` — ze sprawą w stanie ANALYZED
3. Weryfikuj contrast ratio w Chrome DevTools → Elements → Computed → Color Contrast
4. Tab przez wszystkie interaktywne elementy na każdej stronie, sprawdź widoczność fokusa
5. Testuj onboarding overlay klawiaturą (po wyczyszczeniu localStorage)
6. Testuj decision bar klawiaturą: Tab → Zatwierdź → Tab → Odrzuć → Tab → Eskaluj → Tab → Potwierdź
7. Testuj resizer strzałkami

## References

- Research: `context/changes/wcag-ux-review/research.md`
- Design tokens: `web/src/styles/design-system/_variables.scss`
- Angular CDK A11y: https://material.angular.io/cdk/a11y/overview
- WCAG 2.2 AA quick reference: https://www.w3.org/WAI/WCAG22/quickref/?versions=2.2&levels=aaa

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Krytyczne blokery WCAG — HTML i ARIA

#### Automated

- [x] 1.1 Typecheck passes po zmianach Fazy 1 (`cd web && npx tsc --noEmit`) — 3d2f100
- [x] 1.2 Build passes po zmianach Fazy 1 (`cd web && npm run build`) — 3d2f100

#### Manual

- [x] 1.3 `<html lang="pl">` widoczne w DevTools — 3d2f100
- [x] 1.4 `role="dialog"` na `.oo-modal` (nie na backdrop) widoczne w accessibility tree — 3d2f100
- [x] 1.5 Dropzone ma `role="button"` i accessible name w accessibility tree — 3d2f100
- [x] 1.6 citation-badge renderuje się jako `<button>` w DOM — 3d2f100
- [x] 1.7 `role="radiogroup"` + `aria-checked` na decision-bar przełączają się po kliknięciu — 3d2f100
- [x] 1.8 `role="alert"` na error banner extraction-form widoczne w DOM — 3d2f100
- [x] 1.9 Red flag items są `<li>` wewnątrz `<ul>` — 3d2f100
- [x] 1.10 axe DevTools scan: brak nowych naruszeń Level A/AA na `/cases/new` — 3d2f100

### Phase 2: Drugorzędne ARIA + proste UX fixes

#### Automated

- [x] 2.1 Typecheck passes po zmianach Fazy 2 — 4a60b9b
- [x] 2.2 Build passes po zmianach Fazy 2 — 4a60b9b

#### Manual

- [x] 2.3 Locked decision bar wyświetla "Zatwierdzona" / "Odrzucona" / "Eskalowana" (PL) — 4a60b9b
- [x] 2.4 Link `← Sprawy` prowadzi na `/cases` → redirect do `/cases/new` — 4a60b9b
- [x] 2.5 URL `/cases` działa i przekierowuje (nie 404) — 4a60b9b

### Phase 3: System kolorów i :focus-visible

#### Automated

- [x] 3.1 Typecheck passes po zmianach Fazy 3
- [x] 3.2 Build passes po zmianach Fazy 3

#### Manual

- [x] 3.3 `--text-placeholder` nowa wartość kontrast ≥4.5:1 na white (DevTools Contrast Ratio)
- [x] 3.4 `--text-tertiary` nowa wartość kontrast ≥4.5:1 na `--gray-50` (#F5F7F9)
- [x] 3.5 Tab przez decision-bar: przyciski mają widoczny niebieski outline
- [x] 3.6 Tab przez onboarding overlay: wszystkie przyciski mają outline, × ma powiększony obszar
- [x] 3.7 citation-badge `<button>` wygląda identycznie jak poprzednio (bez domyślnych styli przycisków)
- [x] 3.8 axe DevTools: brak naruszeń kontrastu Level AA na `/cases/<id>`

### Phase 4: Klawiatura i CDK focus trap

#### Automated

- [ ] 4.1 `npm install` w `web/` bez błędów; `@angular/cdk` w `package.json`
- [ ] 4.2 Typecheck passes po zmianach Fazy 4
- [ ] 4.3 Build passes po zmianach Fazy 4

#### Manual

- [ ] 4.4 Tab przez overlay NIE wychodzi poza `.oo-modal` (focus trap działa)
- [ ] 4.5 Escape zamyka onboarding overlay
- [ ] 4.6 Tab na resizer — element ma fokus i widoczny outline
- [ ] 4.7 ArrowRight/ArrowLeft zmienia szerokość paneli; Shift+Arrow krok 5%
- [ ] 4.8 axe DevTools scan na `/cases/<id>` z overlayem — brak naruszeń
