# Onboarding Implementation Plan

## Overview

Hybrid onboarding dla ClearKYC case-detail: zawsze widoczne affordance hints przy trzech konkretnych lukach UX (citation badges, workflow sequence, decision warning) + jednorazowy overlay przy pierwszej wizycie w widoku case-detail.

## Current State Analysis

Widok case-detail składa się z: topbar (runState: idle/running/complete), dwupanelowego layoutu (PDF viewer lewy, extraction form prawy), decision-bar na dole. Istniejące elementy:

- `.cite-sup` ma `cursor: pointer` i `hover: underline`, ale kolor `--citation-marker` (szary/muted) nie sygnalizuje klikalnoścy. `[title]` pokazuje tekst cytatu, nie informuje o nawigacji.
- Decision-bar ma już dwukrokowy flow (pick → confirm), ale brak ostrzeżenia o terminalności.
- Topbar mówi "Oczekuje na analizę / Analizowanie… / Ekstrakcja zakończona", ale nie prowadzi przez kroki po analizie.
- Żaden komponent nie śledzi "pierwszej wizyty". Brak żadnej biblioteki product-tour.

## Desired End State

Po wdrożeniu:
1. Citation badges wyglądają jak interaktywne linki (kolor `--accent`) i hover tooltip mówi "Kliknij → str. N w PDF".
2. Gdy użytkownik wybierze decyzję compliance, pomiędzy przyciskami a "Potwierdź" pojawia się ostrzeżenie o nieodwracalności.
3. Po przejściu stanu do ANALYZED pojawia się w extraction form zamykalny callout prowadzący do decision-bar.
4. Użytkownik otwierający case-detail po raz pierwszy widzi 3-krokowy overlay wyjaśniający layout, cytacje i decyzję; kolejne wizyty go nie pokazują.

### Key Discoveries

- `citation-badge.component.scss:4` — `color: var(--citation-marker)` należy zmienić na `var(--accent)`, `cursor: pointer` i `underline` już są.
- `citation-badge.component.html:6` — `[title]="citation().quote"` pokazuje cytat ale nie kontekst nawigacji; zamienić na binding łączący stronę i hint.
- `decision-bar.component.html:39-44` — "Potwierdź decyzję" commit button; ostrzeżenie wstawić jako `@if (pendingDecision())` element przed tym buttonem.
- `extraction-form.component.ts:22-26` — pattern sygnałów lokalnych (`signal<boolean>`) jest już używany (`showReanalyzeWarning`, `editingField`); callout korzysta z tego samego wzorca.
- `case-detail.component.ts:15` — `imports: [...]` lista do rozszerzenia o `OnboardingOverlayComponent`.

## What We're NOT Doing

- Żadna zewnętrzna biblioteka product-tour (Shepherd.js, Intro.js, Driver.js).
- Brak spotlight/overlay wskazującego konkretne elementy DOM (za duża złożoność dla 3 punktów).
- Overlay nie jest synchronizowany przez backend ani Auth0 profile — tylko localStorage.
- Nie ruszamy landing page (już tłumaczy CO robi apka).
- Nie dodajemy onboardingu do case-new — ten widok jest czytelny (dropzone z hintem już istnieje).

## Implementation Approach

Dwie fazy sekwencyjnie: najpierw zawsze-widoczne inline hints (bez stanu, bez localStorage), potem jednorazowy overlay. Faza 1 daje wartość niezależnie od Fazy 2 i może być zweryfikowana niezależnie. Overlay jest standalone Angular component, standalone: true, integrowany w case-detail.component przez import + template tag.

## Critical Implementation Details

- **localStorage w Angular SSR/zoneless**: case-detail renderuje się po stronie klienta (lazy-loaded route), więc dostęp do `localStorage` w `ngOnInit` jest bezpieczny bez dodatkowych warunków. Nie używać `PLATFORM_ID` — aplikacja nie ma SSR.
- **Klucz localStorage**: `'clearkyc_onboarding_v1'` — sufix `v1` pozwala wymusić ponowne pokazanie po gruntownej zmianie onboardingu (zmiana na `v2`).
- **Callout w extraction form**: lokalna sygnał `calloutDismissed` nie jest persystowana — pokazuje się przy każdym nowym załadowaniu komponentu po ANALYZED. To celowe — analityk który wraca do sprawy już zakończonej (LOCKED) callout nie zobaczy.

---

## Phase 1: Inline affordance hints

### Overview

Trzy targeted zmiany w istniejących komponentach. Zero nowych komponentów. Wszystkie zmiany są addytywne (nowe CSS, nowe `@if` bloki, zmiana jednego atrybutu).

### Changes Required

#### 1. Citation badge — kolor linku i tooltip nawigacyjny

**File**: `web/src/app/shared/components/citation-badge/citation-badge.component.scss`

**Intent**: Zmień kolor `.cite-sup` z `var(--citation-marker)` na `var(--accent)` żeby badge wyglądał jak interaktywny link, nie jak szary przypis.

**Contract**: Tylko jedna zmiana: `color: var(--citation-marker)` → `color: var(--accent)`. Reszta selektora (font-family, font-size, vertical-align, cursor, hover, focus-visible) bez zmian.

---

**File**: `web/src/app/shared/components/citation-badge/citation-badge.component.html`

**Intent**: Zastąp `[title]` bindingiem który komunikuje cel nawigacji, a nie tylko tekst cytatu. Dodaj `aria-label` opisujący akcję dla screen readerów.

**Contract**: 
- `[title]` zmienia się na template expression: `"'Kliknij → str. ' + citation().page + ' w PDF'"` (lub z pierwszymi słowami cytatu: `"'Kliknij → str. ' + citation().page + ' · ' + citation().quote.slice(0,60) + '…'"`).
- Dodaj `[attr.aria-label]="'Cytat ' + index() + ': przejdź do str. ' + citation().page + ' w PDF'"`.

---

#### 2. Decision bar — ostrzeżenie o terminalności

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.html`

**Intent**: Gdy użytkownik wybrał decyzję (pendingDecision() truthy), pokaż tekst ostrzegający o nieodwracalności, widoczny na drodze do "Potwierdź decyzję".

**Contract**: Wewnątrz `<div class="decision-bar__buttons">`, po trzech buttonach Zatwierdź/Odrzuć/Eskaluj, przed commit-btn — wstaw:
```
@if (pendingDecision()) {
  <p class="decision-bar__warning">⚠ Po potwierdzeniu sprawa zostanie zablokowana — tej operacji nie można cofnąć.</p>
}
```

---

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.scss`

**Intent**: Ostyluj `.decision-bar__warning` tak, żeby był czytelny ale nie dominował nad przyciskami — muted amber lub muted text.

**Contract**: Nowa klasa `.decision-bar__warning` z: `font-size: var(--text-xs)`, `color: var(--escalate-solid)` (amber z palety design systemu), `margin: var(--space-2) 0 0`, `font-weight: var(--weight-medium)`, `text-align: center`.

---

#### 3. Extraction form — callout po przejściu w ANALYZED

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts`

**Intent**: Dodaj lokalny sygnał `calloutDismissed` który pozwala użytkownikowi zamknąć callout na czas sesji.

**Contract**: Nowy signal obok istniejących sygnałów lokalnych (linie 22-26): `protected readonly calloutDismissed = signal<boolean>(false);`. Dodaj metodę `protected dismissCallout(): void { this.calloutDismissed.set(true); }`.

---

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html`

**Intent**: Pokaż callout-info-bar gdy status stał się ANALYZED i callout nie był jeszcze zamknięty. Callout prowadzi wzrok do dolnego paska decyzji.

**Contract**: Wstaw na początku głównej zawartości formularza (za sprawdzeniem statusu, przed pętlą pól), warunkowo na `caseStore.caseStatus() === 'ANALYZED' && !calloutDismissed()`:
```
<div class="ef-callout">
  <span>✓ Analiza zakończona — przejrzyj wartości i cytacje, następnie wybierz decyzję w dolnym pasku.</span>
  <button type="button" (click)="dismissCallout()" aria-label="Zamknij wskazówkę">×</button>
</div>
```

---

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.scss`

**Intent**: Ostyluj `.ef-callout` jako niebieski info-banner w duchu istniejącego `.of-help`.

**Contract**: Nowa klasa `.ef-callout` z: `display: flex; justify-content: space-between; align-items: center; padding: var(--space-3) var(--space-4); background: var(--accent-subtle, #eff6ff); border-left: 3px solid var(--accent); border-radius: var(--radius-sm); margin-bottom: var(--space-4); font-size: var(--text-sm); color: var(--text-secondary)`. Button zamykający: `background: none; border: none; cursor: pointer; font-size: var(--text-lg); color: var(--text-tertiary)`.

---

### Success Criteria

#### Automated Verification

- Typecheck przechodzi: `cd web && npx tsc --noEmit`
- Build kompiluje się bez błędów: `cd web && npm run build`

#### Manual Verification

- Citation badge `[1]` jest niebieski (kolor `--accent`), hover pokazuje tooltip z "Kliknij → str. N w PDF", kliknięcie nawiguje PDF.
- Po wybraniu decyzji (Zatwierdź/Odrzuć/Eskaluj) pojawia się ostrzeżenie ⚠ nad przyciskiem "Potwierdź decyzję".
- Po uruchomieniu analizy i jej zakończeniu w extraction form pojawia się niebieski callout z tekstem, klawisz × go zamyka.

**Pause dla manualnej weryfikacji Fazy 1 przed przejściem do Fazy 2.**

---

## Phase 2: First-use onboarding overlay

### Overview

Nowy standalone component `OnboardingOverlayComponent` wyświetlający 3-krokowy modal przy pierwszej wizycie w case-detail. Stan persystowany w localStorage pod kluczem `clearkyc_onboarding_v1`.

### Changes Required

#### 1. Utwórz OnboardingOverlayComponent

**File**: `web/src/app/shared/components/onboarding-overlay/onboarding-overlay.component.ts`

**Intent**: Standalone component który sprawdza localStorage przy init, pokazuje overlay (3 kroki nawigowalne Next/Prev/Close), po zamknięciu ustawia localStorage i chowa overlay.

**Contract**:
```typescript
@Component({
  selector: 'app-onboarding-overlay',
  standalone: true,
  imports: [],
  templateUrl: './onboarding-overlay.component.html',
  styleUrl: './onboarding-overlay.component.scss',
})
export class OnboardingOverlayComponent implements OnInit {
  protected visible = signal(false);
  protected step = signal(1);
  protected readonly TOTAL_STEPS = 3;

  ngOnInit(): void {
    if (!localStorage.getItem('clearkyc_onboarding_v1')) {
      this.visible.set(true);
    }
  }

  protected next(): void {
    if (this.step() < this.TOTAL_STEPS) this.step.update(s => s + 1);
    else this.dismiss();
  }

  protected prev(): void {
    if (this.step() > 1) this.step.update(s => s - 1);
  }

  protected dismiss(): void {
    localStorage.setItem('clearkyc_onboarding_v1', '1');
    this.visible.set(false);
  }
}
```

---

**File**: `web/src/app/shared/components/onboarding-overlay/onboarding-overlay.component.html`

**Intent**: Trzy kroki wyjaśniające: (1) layout dwupanelowy, (2) citation badges jako interaktywne linki PDF, (3) decision-bar jako terminal action. Każdy krok ma tytuł, treść i licznik kroków (1/3).

**Contract**: Struktura:
- `@if (visible())` wrapper na cały overlay
- Backdrop `.oo-backdrop` + modal `.oo-modal`
- Header z tytułem kroku i przyciskiem × (dismiss)
- Body `.oo-body` z ikoną (unicode), tytułem, opisem — zmieniającym się `@switch (step())`
- Footer: licznik "1 / 3", przyciski Wstecz (disabled na kroku 1) i Dalej (lub "Rozumiem" na ostatnim kroku)

Treść kroków:
- Krok 1 (📄): "Twój obszar roboczy" — "PDF ze sprawą wyświetla się po lewej. Formularz ekstrakcji po prawej. Możesz przeciągać środkowy separator, żeby dopasować proporcje."
- Krok 2 (🔗): "Cytowania prowadzą do źródła" — "Niebieskie znaczniki [1] [2] przy wartościach to cytaty ze źródłowego PDF. Kliknij dowolny — przeglądarka po lewej przewinie do odpowiedniego fragmentu i go podświetli."
- Krok 3 (⚖️): "Decyzja compliance jest nieodwracalna" — "W dolnym pasku wybierz Zatwierdź, Odrzuć lub Eskaluj, następnie kliknij 'Potwierdź decyzję'. Po potwierdzeniu sprawa zostaje zablokowana i nie można jej edytować."

---

**File**: `web/src/app/shared/components/onboarding-overlay/onboarding-overlay.component.scss`

**Intent**: Centered modal nad ciemnym backdrop. Design tokens z projektu. Minimalistyczny styl spójny z resztą UI.

**Contract**: 
- `.oo-backdrop`: `position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 1000; display: flex; align-items: center; justify-content: center`
- `.oo-modal`: `background: var(--surface-base); border-radius: var(--radius-lg); padding: var(--space-8); max-width: 420px; width: 90%; box-shadow: 0 20px 60px rgba(0,0,0,0.3)`
- Footer buttons: `.oo-btn-primary` z `background: var(--accent)` (Dalej/Rozumiem), `.oo-btn-secondary` bez wypełnienia (Wstecz), licznik kroków `var(--text-sm) var(--text-tertiary)`

---

#### 2. Integracja w CaseDetailComponent

**File**: `web/src/app/features/case-detail/case-detail.component.ts`

**Intent**: Zaimportuj `OnboardingOverlayComponent` do listy imports.

**Contract**: Dodaj `OnboardingOverlayComponent` do `imports: [...]` w dekoratorze `@Component` (obok istniejących komponentów, linia 15).

---

**File**: `web/src/app/features/case-detail/case-detail.component.html`

**Intent**: Wyrenderuj overlay w widoku case-detail. Musi być na zewnątrz layoutu (nie w środku paneli) żeby mógł przykryć całość.

**Contract**: Dodaj `<app-onboarding-overlay />` jako pierwszy element w template (przed lub po istniejących `@if` blokach).

---

### Success Criteria

#### Automated Verification

- Typecheck przechodzi: `cd web && npx tsc --noEmit`
- Build kompiluje się: `cd web && npm run build`

#### Manual Verification

- Wyczyszczenie `localStorage.removeItem('clearkyc_onboarding_v1')` i wejście w dowolną sprawę pokazuje overlay.
- Nawigacja Dalej/Wstecz działa poprawnie między 3 krokami.
- Kliknięcie × lub "Rozumiem" na kroku 3 zamyka overlay i ustawia localStorage.
- Ponowna wizyta (bez czyszczenia localStorage) nie pokazuje overlay.
- Overlay jest wyśrodkowany, backdrop przykrywa cały widok, modal jest czytelny.

---

## Testing Strategy

### Unit Tests

Nie dodajemy unit testów dla tej zmiany — onboarding jest czystą warstwą UI bez logiki biznesowej poza localStorage check. Ryzyko regressionu jest niskie.

### Manual Testing Steps

1. Otwórz case-detail dla istniejącej sprawy (CREATED lub ANALYZED).
2. Sprawdź overlay (krok 1→2→3→zamknij).
3. Odśwież stronę — overlay nie powraca.
4. W DevTools: `localStorage.removeItem('clearkyc_onboarding_v1')` i odśwież — overlay wraca.
5. Uruchom analizę: sprawdź callout po ANALYZED.
6. Kliknij citation badge — sprawdź kolor i tooltip.
7. Wybierz decyzję — sprawdź ostrzeżenie ⚠.
8. Potwierdź decyzję — sprawa LOCKED, decision-bar zmienia się w locked state.

## References

- Frame brief: `context/changes/onboarding/frame.md`
- Citation badge: `web/src/app/shared/components/citation-badge/`
- Decision bar: `web/src/app/shared/components/decision-bar/`
- Extraction form: `web/src/app/features/case-detail/components/extraction-form/`
- Case detail: `web/src/app/features/case-detail/case-detail.component.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` gdy krok ląduje. Nie zmieniaj tytułów kroków.

### Phase 1: Inline affordance hints

#### Automated

- [x] 1.1 Typecheck przechodzi po zmianach Fazy 1 (`cd web && npx tsc --noEmit`)
- [x] 1.2 Build kompiluje się (`cd web && npm run build`)

#### Manual

- [x] 1.3 Citation badge jest niebieski, tooltip mówi "Kliknij → str. N w PDF", klik nawiguje
- [x] 1.4 Ostrzeżenie ⚠ pojawia się po wybraniu decyzji, znika po LOCKED
- [x] 1.5 Callout ANALYZED pojawia się po analizie, × zamyka go

### Phase 2: First-use onboarding overlay

#### Automated

- [ ] 2.1 Typecheck przechodzi po zmianach Fazy 2 (`cd web && npx tsc --noEmit`)
- [ ] 2.2 Build kompiluje się (`cd web && npm run build`)

#### Manual

- [ ] 2.3 Overlay pojawia się przy pierwszej wizycie (po wyczyszczeniu localStorage)
- [ ] 2.4 Nawigacja kroków 1→2→3 działa, Wstecz działa
- [ ] 2.5 Zamknięcie overlay ustawia localStorage, kolejna wizyta overlay nie pokazuje
