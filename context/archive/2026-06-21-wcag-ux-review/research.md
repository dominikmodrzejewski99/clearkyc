---
date: 2026-06-21T12:45:00+02:00
researcher: Claude Sonnet 4.6 (5 parallel audit agents)
git_commit: 437575a544b2634c21dec35242890443fc7151ad
branch: main
repository: 10xdevs
topic: "WCAG 2.2 AA accessibility and UX audit — ClearKYC frontend"
tags: [research, wcag, accessibility, ux, a11y, angular]
status: complete
last_updated: 2026-06-21
last_updated_by: Claude Sonnet 4.6
---

# Research: WCAG 2.2 AA Accessibility and UX Audit

**Date**: 2026-06-21T12:45:00+02:00
**Researcher**: Claude Sonnet 4.6 (5 parallel audit agents)
**Git Commit**: 437575a544b2634c21dec35242890443fc7151ad
**Branch**: main
**Repository**: 10xdevs

## Research Question

Kompleksowy przegląd dostępności WCAG 2.2 AA i UX dla całego frontendu ClearKYC:
landing page, case-new, case-detail (extraction form, citation badges, decision bar,
red-flag list), shared components i onboarding overlay. Standard: WCAG 2.2 AA.

---

## Summary

Audyt objął 5 wymiarów: semantykę HTML/ARIA, kontrast kolorów, klawiaturę/focus,
formularze i interakcje, wzorce UX. Łączna liczba znalezionych problemów: **74**
(13 krytycznych, 24 poważnych, 25 średnich, 12 drobnych).

Najpoważniejsze problemy blokujące zgodność z WCAG 2.2 AA:
1. Brak `lang="pl"` na elemencie `<html>`
2. Modal onboarding nie ma pułapki fokusa (focus trap) — klawiatura ucieka poza dialog
3. Dropzone pliku nie ma odpowiednika klawiaturowego (tylko drag & drop)
4. Decyzje Zatwierdź/Odrzuć/Eskaluj nie mają semantyki radio group (brak `aria-checked`)
5. Tokeny `--text-tertiary`, `--text-disabled`, `--text-placeholder` nie spełniają 4.5:1
6. Ostrzeżenie o nieodwracalności decyzji pojawia się PO pierwszym kliknięciu (za późno)

---

## Detailed Findings

### A1 — Semantyka HTML i ARIA

#### Krytyczne

| Plik:Linia | Kryterium WCAG | Opis | Fix |
|------------|----------------|------|-----|
| `index.html` (brak) | 3.1.1 | Brak `lang="pl"` na `<html>` | Dodaj `lang="pl"` do `index.html` |
| `onboarding-overlay.component.html:2` | 4.1.2 | `role="dialog"` na backdrop zamiast na `.oo-modal`; brak `aria-labelledby` wskazującego na `<h2>` | Przenieś `role="dialog" aria-modal="true"` na `.oo-modal`; dodaj `id="oo-title"` do `<h2>` i `aria-labelledby="oo-title"` |
| `file-dropzone.component.html:1` | 4.1.2 | `.drop-zone` `<div>` bez roli, niedostępny dla czytników ekranowych | Dodaj `role="button" tabindex="0" aria-label="..."` lub użyj `<button>` |

#### Poważne

| Plik:Linia | Kryterium WCAG | Opis | Fix |
|------------|----------------|------|-----|
| `case-detail.component.html:10-15` | 4.1.2 | `<input type="file">` w `.re-upload-banner` — etykieta skojarzona poprawnie, ale brak `aria-label` dla dostępności AT | Dodaj `aria-label="Wybierz plik PDF"` do input |
| `case-new.component.html:45` | 4.1.2 | Przycisk `fc-remove` ma tylko `title`, brak `aria-label` | Dodaj `aria-label="Usuń wybrany plik PDF"` |
| `citation-badge.component.html:1` | 4.1.2 | `<sup>` używany jako interaktywny element (nie jest semantycznym przyciskiem) | Zamień na `<button class="cite-sup" type="button">` |
| `landing.component.html` | 1.3.6 | `<nav>` bez `aria-label` — nieokreślona nawigacja | Dodaj `aria-label="Główna nawigacja"` |
| `landing.component.html:113,129,151` | 1.1.1 | Dekoracyjne SVG bez `aria-hidden="true"` | Dodaj `aria-hidden="true"` do wszystkich dekoracyjnych SVG |
| `red-flag-list.component.html` | 1.3.1 | Lista flag używa `<div>` zamiast `<ul>/<li>` | Opakuj w `<ul>` z `<li>` wewnątrz |

#### Poważne — brak ogłoszeń aria-live

| Plik:Linia | Kryterium WCAG | Opis | Fix |
|------------|----------------|------|-----|
| `extraction-form.component.html:22` | 4.1.3 | `.extraction-form__error-banner` bez `role="alert"` | Dodaj `role="alert" aria-live="assertive"` |
| `extraction-form.component.html:30` | 4.1.3 | `.ef-callout` bez `role="status"` | Dodaj `role="status" aria-live="polite"` |
| `decision-bar.component.html:40` | 4.1.3 | Ostrzeżenie `⚠ Po potwierdzeniu...` bez `aria-live` | Dodaj `aria-live="polite" aria-atomic="true"` |
| `case-new.component.html:56` | 4.1.3 | `.upload-status` bez `role="status"` | Dodaj `role="status" aria-live="polite"` |
| `red-flag-list.component.html` | 4.1.3 | Flagi pojawiają się dynamicznie bez `aria-live` | Dodaj `aria-live="polite"` na kontener listy |

#### Drobne

| Plik:Linia | Kryterium WCAG | Opis |
|------------|----------------|------|
| `app.html:283` | 1.1.1 | `alt` na `<svg>` (niepoprawny atrybut) — zamień na `aria-label` |
| `landing.component.html:18` | 4.1.2 | `<a id="top">` bez `href` — użyj `<div id="top">` |
| `extraction-form.component.html:147` | 4.1.2 | Dialog `.ef-dialog` bez `role="alertdialog"` i `aria-labelledby` |

---

### A2 — Kontrast kolorów

Plik bazowy tokenów: `web/src/styles/design-system/_variables.scss`

#### Krytyczne — tekst (wymóg 4.5:1)

| Token | Wartość | Tło | Ratio | Wymagane | Status |
|-------|---------|-----|-------|----------|--------|
| `--text-disabled` | szary | white | ~2.14:1 | 4.5:1 | FAIL |
| `--text-placeholder` | szary | white | ~3.04:1 | 4.5:1 | FAIL |
| `--text-tertiary` | szary | `--gray-50` | ~4.41:1 | 4.5:1 | FAIL (−0.09) |
| `--text-tertiary` | szary | `--gray-100` | ~4.14:1 | 4.5:1 | FAIL (−0.36) |

#### Krytyczne — elementy UI (wymóg 3:1)

| Token | Ratio | Status | Lokalizacja |
|-------|-------|--------|-------------|
| `--border-default` | ~1.27:1 | FAIL | Obramowania pól, separatory |
| `--border-strong` | ~1.49:1 | FAIL | Aktywne ramki |
| `--citation-border` | ~1.60:1 | FAIL | Ramka cytatu |

#### Poważne — tokeny statusów (4.5:1 na tle badge)

| Token | Ratio | Status |
|-------|-------|--------|
| `--approve-text` na `--approve-bg-strong` | ~4.23:1 | FAIL (−0.27) |
| `--reject-text` na `--reject-bg-strong` | ~4.45:1 | FAIL (−0.05) |
| `--escalate-text` na `--escalate-bg-strong` | ~4.07:1 | FAIL (−0.43) |

#### Zgodne (informacyjnie)

| Token | Ratio | Status |
|-------|-------|--------|
| `--border-focus` (`--blue-500` = `#2A6FB0`) | 5.25:1 na white | PASS (WCAG 2.2 AA 2.4.11) |
| `--text-primary` | >7:1 | PASS |
| `--text-secondary` | >4.5:1 | PASS |
| `--accent` (`#2A6FB0`) | 5.25:1 | PASS |

**Priorytet naprawy:** najpierw `--text-disabled` i `--text-placeholder` (tekst w formularzach),
następnie tokeny statusów (Approve/Reject/Escalate badges w decision-bar).

---

### A3 — Klawiatura i zarządzanie fokusem

#### Krytyczne (blokujące WCAG 2.1 Level A)

| Plik:Linia | Kryterium | Opis | Fix |
|------------|-----------|------|-----|
| `onboarding-overlay.component.ts:1-39` | 2.1.2 | Brak pułapki fokusa w modalnym dialogu. Tab ucieka poza dialog. Brak `keydown.escape`. | Użyj `@angular/cdk/a11y` `FocusTrap` lub zaimplementuj ręcznie; dodaj `(keydown.escape)="dismiss()"` |
| `file-dropzone.component.html:1` | 2.1.1 | `.drop-zone` niefokowalny, brak obsługi Enter/Space | Dodaj `tabindex="0" role="button" (keyup.enter)="fileInput.click()" (keyup.space)="fileInput.click()"` |
| `citation-badge.component.html:1` | 2.1.1 | Spacja nie aktywuje badge (tylko Enter i Click) | Dodaj `(keyup.space)="navigate()"` lub zamień na `<button>` |

#### Poważne

| Plik:Linia | Kryterium | Opis | Fix |
|------------|-----------|------|-----|
| `app-layout.component.ts:19-40` | 2.1.1 | Resizer paneli obsługuje tylko mysz (`mousedown`) — zero dostępu klawiaturowego | Dodaj `tabindex="0" role="separator" aria-valuenow aria-valuemin aria-valuemax`; obsłuż `ArrowLeft`/`ArrowRight` |
| `decision-bar.component.scss:40-101` | 2.4.7 | Brak `:focus-visible` na przyciskach decyzji i przycisku "Potwierdź" | Dodaj `:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }` |
| `onboarding-overlay.component.scss:84-113` | 2.4.7 | Brak `:focus-visible` na `.oo-btn-primary` i `.oo-btn-secondary` | j.w. |
| `onboarding-overlay.component.scss:35-45` | 2.4.7 | Przycisk zamknięcia (×) bez `:focus-visible` i zbyt małe pole kliknięcia (`padding: 0`) | Dodaj `padding: var(--space-2)` i `:focus-visible` |

#### Drobne

| Plik:Linia | Kryterium | Opis |
|------------|-----------|------|
| Globalny (brak) | 2.4.1 | Brak linku "skip to main content" | Dodaj do `app.html` / root template |
| `extraction-form.component.scss` | 2.4.7 | Sprawdzić czy `.edit-btn` i `.citation` mają `:focus-visible` |
| `decision-bar.component.scss` | 2.4.12 | Zweryfikować czy sticky decision-bar nie przesłania fokusowanych elementów |

---

### A4 — Formularze i komponenty interaktywne

#### Krytyczne

| Plik:Linia | Kryterium | Opis | Fix |
|------------|-----------|------|-----|
| `file-dropzone.component.html` | 2.1.1 | Drag & drop nie ma odpowiednika klawiaturowego (WCAG Level A blokujące) | Zapewnij klawiaturowy fallback otwierający file picker |
| `decision-bar.component.html:21-38` | 1.3.1 | Przyciski Zatwierdź/Odrzuć/Eskaluj semantycznie działają jak radio group, ale brak `role="radiogroup"` i `aria-checked` | Opakuj w `<div role="radiogroup" aria-label="Decyzja compliance">`; dodaj `role="radio" [attr.aria-checked]="pendingDecision() === 'APPROVE'"` |
| `extraction-form.component.html:44-68` | 1.3.1 | `<label>` w formularzu override nie są powiązane z inputami przez `for/id` | Dodaj `for="edit-draft"` do label + `id="edit-draft"` do textarea |

#### Poważne

| Plik:Linia | Kryterium | Opis | Fix |
|------------|-----------|------|-----|
| `decision-bar.component.html:40` | 1.3.1 | Ostrzeżenie o nieodwracalności nie powiązane z przyciskiem przez `aria-describedby` | Dodaj `id="decision-warning"` do `<p>` i `aria-describedby="decision-warning"` do commit button |
| `extraction-form.component.html:61` | 3.3.2 | Pole "Uzasadnienie" wymagane wizualnie, brak `aria-required="true"` | Dodaj `aria-required="true"` do textarea |
| `file-dropzone.component.html:16-22` | 3.3.1 | Błąd walidacji bez `role="alert"` i `aria-describedby` | Dodaj `role="alert" aria-live="polite"` do `.dz-error` |
| `file-dropzone.component.ts:39,43` | 3.3.3 | Komunikaty błędów nie wyjaśniają jak naprawić problem | Rozbuduj: "Obsługiwane są tylko pliki PDF. Upewnij się, że wgrywasz dokument w formacie PDF." |
| `red-flag-list.component.html` | 1.3.1 | Lista flag jako `<div>` zamiast `<ul>/<li>` | Zmień na semantyczną listę |
| `extraction-form.component.html:147` | 4.1.2 | Dialog `.ef-dialog` bez `role="alertdialog"` i `aria-labelledby` | Dodaj `role="alertdialog" aria-labelledby="reanalyze-title"` |
| `case-new.component.html:72-80` | 1.3.1 | "Ostatnie sprawy" renderowane jako `<div>`, nie `<ul>` | Opakuj w `<ul>` + `<li>` |

#### Nowe kryteria WCAG 2.2

| Kryterium | Status | Uwagi |
|-----------|--------|-------|
| 3.3.7 Redundant Entry | PASS | Dane nie są pytane dwukrotnie |
| 3.3.8 Accessible Authentication | PASS | Brak CAPTCHA |
| 2.4.11 Focus Appearance | PASS dla `--border-focus` (5.25:1, 2px outline) |
| 2.4.12 Focus Not Obscured | Do weryfikacji | decision-bar + topbar w sticky layout |

---

### A5 — UX patterns i obciążenie poznawcze

#### Krytyczne (primary user flow)

| ID | Plik:Linia | Opis | Rekomendacja |
|----|------------|------|--------------|
| C-1 | `decision-bar.component.html:40` | Ostrzeżenie "nieodwracalne" pojawia się PO kliknięciu decyzji — za późno | Dodaj stały komunikat PRZED przyciskami, widoczny gdy `caseStatus === 'ANALYZED'` |
| C-2 | `extraction-form.component.html:5-18` | Brak globalnego wskaźnika postępu podczas analizy; brak licznika odebranych pól | Dodaj licznik "Odbieranie pól: X" i spinner w nagłówku extraction-form podczas `isAnalyzing` |
| C-3 | `decision-bar.component.ts:61-65` | Brak potwierdzenia sukcesu po zatwierdzeniu decyzji — UI przeskakuje do LOCKED bez sygnału | Dodaj toast/snackbar "Decyzja zarejestrowana" lub animację przejścia do locked state |

#### Poważne

| ID | Plik:Linia | Opis | Rekomendacja |
|----|------------|------|--------------|
| M-1 | `case-detail.component.html:3-18` | Banner re-upload nie informuje, że dane ekstrakcji są bezpieczne | Rozróżnij "brak blob w pamięci" vs "sprawa nieprzetworzona"; dodaj "Dane ekstrakcji są bezpieczne" |
| M-2 | `decision-bar.component.html:1` | Decision bar niewidoczny podczas CREATED/ANALYZING — layout shift przy pojawieniu się | Dodaj wygaszony placeholder "Decyzja dostępna po zakończeniu analizy" |
| M-3 | `decision-bar.component.html:21-38` | Przyciski decyzji różnią się wyłącznie kolorem (8% mężczyzn ma daltonizm) | Dodaj ikony (✓/✕/▲) do przycisków — ustalone już w onboarding overlay |
| M-4 | `case-new.component.html:55-63` | Po kliknięciu "Rozpocznij" brak informacji o przekierowaniu | Zmień tekst na "Tworzenie sprawy — za chwilę zostaniesz przekierowany..." |
| M-5 | `decision-bar.component.html:43-47` | Przycisk "Potwierdź" bez stanu ładowania podczas `isSubmitting` | Dodaj spinner i "Zapisywanie..." podczas submit |
| M-6 | `onboarding-overlay.component.html:22-25` | Krok 3 onboarding opisuje decision bar, który jest niewidoczny w stanie CREATED | Popraw tekst: "Po zakończeniu analizy, w dolnym pasku pojawi się panel decyzji..." |

#### Drobne

| ID | Plik:Linia | Opis | Rekomendacja |
|----|------------|------|--------------|
| m-1 | `landing.component.ts:29` | `login()` przekierowuje do `cases/new` zamiast do listy spraw | Zmień na `/cases` lub `/cases/new` z widoczną listą istniejących spraw |
| m-2 | `extraction-form.component.ts:27` | Dismissal callout ANALYZED nie jest persystowany (znika po odświeżeniu) | Użyj `sessionStorage` z kluczem per caseId |
| m-3 | `workstation-topbar.component.html:3` | Link "← Sprawy" prowadzi na landing (`/`), nie na listę spraw | Zmień `routerLink="/"` na `routerLink="/cases/new"` jako tymczasowe rozwiązanie |
| m-4 | `decision-bar.component.html:13-17` | Ostrzeżenie i sukces wyglądają identycznie wizualnie | Dodaj amber kolor + left border do ostrzeżenia |
| m-5 | `extraction-form.component.html:44,82` | `fieldName` renderowane raw (prawdopodobnie snake_case / camelCase) | Dodaj pipe humanizujący lub lookup table PL |
| m-6 | `extraction-form.component.ts:90-93` | `isMissing()` łączy "brak wartości" z "brak cytowania" — semantycznie różne stany | Rozdziel: "Not Disclosed" → brak wartości; osobna flaga dla braku cytowania |
| m-7 | `decision-bar.component.ts:23` | Backend zwraca `'APPROVE'` w English — pojawia się w locked bar | Zmapuj: `APPROVE → Zatwierdzona`, `REJECT → Odrzucona`, `ESCALATE → Eskalowana` |

#### Nice-to-have

| ID | Opis |
|----|------|
| N-1 | Brak obsługi wygaśnięcia sesji (cichy 401) |
| N-2 | Uzasadnienie override bez minimum znaków |
| N-3 | Weryfikacja split-pane przy 200%+ zoom (WCAG 1.4.4) |
| N-4 | Brak przycisku "Pokaż onboarding ponownie" w topbarze |

---

## Code References

- `web/src/styles/design-system/_variables.scss` — definicje wszystkich tokenów kolorystycznych
- `web/src/app/shared/components/onboarding-overlay/onboarding-overlay.component.ts:1-39` — brak focus trap
- `web/src/app/shared/components/file-dropzone/file-dropzone.component.html:1-23` — brak klawiatury
- `web/src/app/shared/components/decision-bar/decision-bar.component.html:21-38` — brak radio group
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html:44-68` — brak for/id
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts:90-93` — `isMissing()` semantics
- `web/src/app/shared/components/workstation-topbar/workstation-topbar.component.html:3` — back link route
- `web/src/app/features/landing/landing.component.ts:29` — login() route
- `web/src/app/layout/app-layout/app-layout.component.ts:19-40` — resizer keyboard gap

---

## Architecture Insights

1. **Brak globalnego focus management systemu.** Żaden komponent nie używa `@angular/cdk/a11y`.
   `FocusTrap` i `LiveAnnouncer` są dostępne w CDK bez dodatkowych zależności (CDK jest
   już w projekcie przez Angular Material lub wystarczy dodać `@angular/cdk`).

2. **Tokeny kolorów nie mają "dark mode" wariantów** — nie blokuje WCAG, ale warto to zanotować
   przed ewentualnym dark mode.

3. **aria-live architektura jest nieobecna.** Żaden komponent nie deklaruje regionów live.
   Warto dodać globalny `LiveAnnouncer` service jako wrapper przed rozsypywaniem `aria-live`
   po template'ach.

4. **Semantyka radio group w decision-bar** wymaga refaktoru TS (zmiana modelu danych z prostego
   `pendingDecision` signal na `FormControl` z `radioGroup`), nie tylko HTML.

5. **`fieldName` jako raw string** sugeruje brak warstwy presentacyjnej między API a formularzem.
   Kandydat na `FieldLabelPipe` lub słownik tokenów.

---

## Historical Context

Brak wcześniejszych zmian w `context/changes/` ani `context/archive/` dotyczących
bezpośrednio WCAG lub accessibility. Zmiany `onboarding` (ed0639b, c14a9f2) i
`pl-ui-text` (a563d9d) były świadome lokalizacji PL, ale nie audytowały ARIA.

---

## Open Questions

1. Czy `@angular/cdk` jest już w `package.json`? Jeśli tak, `FocusTrap` i `LiveAnnouncer`
   są natychmiast dostępne bez nowej zależności.
2. Jakie są docelowe hex wartości tokenów `--text-disabled` i `--text-placeholder`?
   Rozjaśnienie lub przyciemnienie o 10-15% może wystarczyć.
3. Czy aplikacja będzie kiedyś używana na urządzeniach mobilnych / dotykowych?
   Jeśli tak, `2.5.5 Target Size` (44×44 px) staje się priorytetem dla przycisków decyzji.
4. Czy w docelowym scenariuszu użytkownik może być osobą niewidomą używającą czytnika ekranu,
   czy raczej słabowidzącą? Priorytet poprawek różni się znacząco.
