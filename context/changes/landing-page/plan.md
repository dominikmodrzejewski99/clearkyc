# ClearKYC Landing Page — Design Brief & Implementation Plan

## Overview

Design brief dla Claude Design oraz plan implementacji Angular dla landing page
ClearKYC. Strona jest publicznie dostępna (bez auth-guarda), w języku polskim,
skierowana do evaluatorów kursu 10xDevs — osób spoza środowiska bankowego.

Cel strony: wyjaśnić czym jest ClearKYC, jaki problem rozwiązuje i jak działa,
zanim odwiedzający trafi do logowania.

## Current State Analysis

- `app.routes.ts:14` — root `/` to redirect do `/cases/new` (chronione authGuard)
- `app.routes.ts:3` — catch-all `**` też redirekcjonuje do chronionej trasy
- `auth.guard.ts:7` — guard sprawdza `isAuthenticated$` z Auth0; przy braku auth
  wywołuje `loginWithRedirect()` bez żadnego kontekstu produktu
- Brak komponentu landing page w całej aplikacji
- Design system: 100+ tokenów w `_variables.scss`, IBM Plex Sans/Mono, blue-500 akcent

## Desired End State

Landing page dostępna pod `/` bez auth-guarda. Niezalogowany użytkownik widzi
stronę wyjaśniającą produkt. Zalogowany użytkownik trafiający na `/` jest
automatycznie przekierowany do `/cases/new`. Strona używa istniejących tokenów
CSS z design systemu.

### Key Discoveries:

- Istniejący design system ma pełny zestaw tokenów - reuse bez dodawania nowych
- `authGuard` obsługuje skip dev (`environment.skipAuth`) - landing page nie
  potrzebuje własnej logiki skip
- `WorkstationTopbar` jest zbyt kontekstowy (pole entity, run-state) - landing
  potrzebuje własnej prostej nawigacji
- IBM Plex Sans już bundlowany przez `@fontsource` po zmianie design-system-wire

## What We're NOT Doing

- Tech stack showcase section — nie wybrano w scope
- Narzucanie stylu hero (ciemny/jasny/gradient) — Claude Design decyduje
- Treść po angielsku — cały copy po polsku
- Pełna implementacja w tej fazie (Phase 2 przychodzi po zatwierdzeniu mockupu)
- Nowe tokeny CSS — istniejące są wystarczające
- Animacje / microinterakcje — poza zakresem v1

---

## DESIGN BRIEF (Wejście dla Claude Design)

### Kontekst projektu

- **Produkt**: ClearKYC — narzędzie dla analityków compliance w bankach
- **Technologia**: Angular SPA, Spring Boot backend
- **Design system**: IBM Plex Sans, cool gray spine (gray-50 → gray-950),
  blue-500 (#2A6FB0) jako jedyny akcent, clinical/professional feel
- **Odbiorca tej strony**: evaluator kursu / rekruter / osoba bez wiedzy bankowej
- **Cel**: zrozumieć produkt w 60 sekund

### Globalne wskazówki wizualne

- Styl: professional, clean, authoritative — bliżej narzędzia enterprise niż startupu
- Typografia: `font-family: 'IBM Plex Sans'` (załadowana w projekcie)
- Akcent: `--blue-500` (#2A6FB0) — jedyny kolor CTA i wyróżnień
- Tło sekcji: naprzemienny `--surface-raised` (#FFF) i `--surface-canvas` (#F5F7F9)
- Karty: `--radius-md` (5px), `--shadow-sm`, border `--border-default` (#E0E5EB)
- Spacing między sekcjami: duży (64-80px) — landing page, nie workstation
- Responsywność: mobile-first; feature grid 2x2 na desktop, 1 kolumna na mobile

---

### Sekcja 0: Nawigacja (Sticky Header)

**Cel**: marka + CTA widoczne przy scrollowaniu

**Zawartość:**
- Po lewej: logotyp / brand mark "ClearKYC"
  - Font: IBM Plex Sans, `font-weight: 700`, kolor `--text-primary` (#1A1F26)
  - Opcjonalnie: mały kwadratowy badge 28×28px tło `--gray-900`, biały tekst "C"
    (spójne z WorkstationTopbar w aplikacji)
- Po prawej: button "Zaloguj się"
  - Styl: outlined (border `--blue-500`, tekst `--blue-500`, tło transparentne)
  - Hover: tło `--blue-50`, border `--blue-600`
  - Rozmiar: wysokość `--control-height-lg` (34px), `--radius-sm` (3px)
  - Na mobile: schowany lub zredukowany do ikony

**Tokeny:**
```
background: --surface-raised (#FFF)
border-bottom: 1px solid --border-default (#E0E5EB)
height: 52px (spójna z WorkstationTopbar w app)
position: sticky; top: 0; z-index: --z-sticky (100)
padding: 0 --space-8 (32px)
```

---

### Sekcja 1: Hero

**Cel**: w 5 sekund powiedzieć co to jest i dla kogo, dać CTA

**Heading (H1):**
```
Analiza dokumentów KYB wspomagana przez AI
```
- Font: IBM Plex Sans, semibold (600), duży (32-40px) — Claude Design dobiera size
- Kolor: `--text-primary` (#1A1F26)
- Tracking: `--tracking-tight` (-0.01em)

**Subheading (tagline):**
```
ClearKYC czyta złożone dokumenty korporacyjne, wyodrębnia kluczowe dane
z cytowaniami źródłowymi i umożliwia analitykowi weryfikację przed podjęciem
decyzji. Zamiast 4-8 godzin ręcznej pracy — jeden ustrukturyzowany przepływ.
```
- Font: IBM Plex Sans, regular (400), 16-18px
- Kolor: `--text-secondary` (#4A5360)
- Max-width: ~600px, centered lub left-aligned

**CTA button (Primary):**
```
Zaloguj się
```
- Tło: `--blue-500` (#2A6FB0), tekst: `--text-inverse` (#FFF)
- Hover: `--blue-600` (#225C92)
- Height: `--control-height-lg` (34px) lub większy dla hero
- Border-radius: `--radius-sm` (3px)
- Padding: 0 24px
- Font-weight: 600

**Opcjonalny element wizualny (Claude Design decyduje):**
- Screenshot / mockup interfejsu workstation (podgląd PDF + extraction form)
- Lub abstrakcyjna grafika sugerująca dokument + AI

**Tokeny sekcji hero:**
```
padding: --space-20 --space-8 (80px 32px)
background: --surface-raised (#FFF) lub --surface-canvas (#F5F7F9)
```

---

### Sekcja 2: Problem Statement

**Cel**: wyjaśnić problem KYB prostym językiem dla osoby spoza bankowości

**Heading (H2):**
```
Weryfikacja firm jest żmudna i podatna na błędy
```
- Font: IBM Plex Sans, semibold (600), 22-26px
- Kolor: `--text-primary`

**Body copy:**
```
Banki muszą dokładnie sprawdzić każdą firmę-klienta zanim ją obsłużą —
kto ją kontroluje, kto za nią stoi, czy nie ma podejrzanych powiązań.
To wymaga przeczytania setek stron dokumentów: aktów założycielskich,
rejestrów korporacyjnych, umów spółek.

Starsze narzędzia KYC sprawdzają listy sankcji, ale nie rozumieją treści
narracyjnej. Analityk musi czytać PDF-y ręcznie i przepisywać dane do
Excela. Jeden złożony wniosek — nawet 4 do 8 godzin pracy.
```
- Font: regular (400), 14-16px
- Kolor: `--text-secondary` (#4A5360)
- Line-height: `--leading-relaxed` (1.6)
- Max-width: ~640px

**Opcjonalne: 3 stat-boxy** (jeśli Claude Design uzna za dobre)
```
| 4-8h      | Setki stron  | Ryzyko błędów |
| na sprawę | dokumentów   | przy ręcznej  |
|           | PDF per case | weryfikacji   |
```
- Liczby: `--blue-500`, duże (28-32px), bold
- Label: `--text-secondary`, small

**Tokeny sekcji:**
```
background: --surface-canvas (#F5F7F9)
padding: --space-20 --space-8
```

---

### Sekcja 3: Jak to działa (3-krokowy flow)

**Cel**: pokazać prosty przepływ pracy produktu

**Heading (H2):**
```
Trzy kroki do decyzji
```

**Krok 1: Prześlij dokument**
```
Przeciągnij plik PDF lub wybierz z dysku. ClearKYC obsługuje
złożone dokumenty korporacyjne — akty założycielskie, wyciągi
z rejestrów, umowy spółek.
```

**Krok 2: AI analizuje i ekstrahuje**
```
Model czyta cały dokument i wyodrębnia kluczowe dane: nazwę firmy,
dyrektorów, właścicieli rzeczywistych. Każde pole pojawia się
w czasie rzeczywistym z cytatem ze źródła.
```

**Krok 3: Analityk weryfikuje i decyduje**
```
Sprawdź wyodrębnione dane. Kliknij cytat by przejść do fragmentu
w dokumencie. Popraw jeśli potrzeba (z obowiązkowym uzasadnieniem).
Zatwierdź, Odrzuć lub Eskaluj — decyzja jest zapisywana do rejestru.
```

**Wizualne wskazówki dla Claude Design:**
- Numerowane kroki: kółka z `--blue-500` tłem, biały numer
- Linia łącząca kroki: `--border-default` (pozioma lub pionowa)
- Ikony kroków (opcjonalnie): upload, robot/brain, checkmark
- Layout: 3 kolumny na desktop, 1 kolumna na mobile

**Tokeny sekcji:**
```
background: --surface-raised (#FFF)
padding: --space-20 --space-8
step-circle: background --blue-500, color --text-inverse, size 36px, radius --radius-full
step-title: --text-lg (16px), font-weight 600, --text-primary
step-body: --text-base (13px)--(text-md, 14px), --text-secondary, --leading-relaxed
connector: border-top 2px solid --border-default
```

---

### Sekcja 4: Feature Cards (Kluczowe możliwości)

**Cel**: 4 karty z kluczowymi funkcjami produktu

**Heading (H2):**
```
Wszystko co potrzebuje analityk
```

**Karta 1: Streaming w czasie rzeczywistym**
```
Tytuł: Ekstrakcja na żywo
Opis: Pola formularza wypełniają się w miarę jak AI czyta dokument.
Nie ma czekania na wynik — widzisz postęp w czasie rzeczywistym.
```
- Ikona sugestia: błyskawica, strumień, animacja pisania

**Karta 2: Cytowania ze źródłem**
```
Tytuł: Każde pole ma cytat
Opis: Każda wyodrębniona wartość jest powiązana z dokładnym
fragmentem dokumentu. Kliknij cytat — widok PDF przeskakuje
do właściwej strony.
```
- Ikona sugestia: link, zakładka, dokument z pinezką

**Karta 3: Korekta z uzasadnieniem**
```
Tytuł: Kontrola analityka
Opis: Analityk może poprawić każde pole — model nie jest
nieomylny. Każda zmiana wymaga krótkiego uzasadnienia,
które trafia do rejestru.
```
- Ikona sugestia: ołówek, edit, tarcza

**Karta 4: Rejestr decyzji**
```
Tytuł: Pełny ślad audytu
Opis: Zatwierdzenie, odrzucenie lub eskalacja jest zapisywana
z pełną historią: kto, kiedy, co zmienił i dlaczego.
```
- Ikona sugestia: dokumentacja, lock, historia

**Tokeny kart:**
```
card: background --surface-raised, border 1px solid --border-default,
      border-radius --radius-md (5px), box-shadow --shadow-sm
card padding: --space-6 (24px)
icon-box: background --blue-50, color --blue-500, size 40px,
          border-radius --radius-md
card-title: --text-md (14px), font-weight 600, --text-primary
card-body: --text-base (13px), --text-tertiary, --leading-normal (1.5)
grid: 2 kolumny desktop (gap --space-5), 1 kolumna mobile
```

**Tokeny sekcji:**
```
background: --surface-canvas (#F5F7F9)
padding: --space-20 --space-8
```

---

### Sekcja 5: Footer

**Zawartość:**
- Brand mark "ClearKYC" (mały, --text-secondary)
- Tekst: "Projekt zaliczeniowy — kurs 10xDevs"
- Opcjonalnie: link do GitHub repozytorium

**Tokeny:**
```
background: --surface-canvas (#F5F7F9)
border-top: 1px solid --border-default
padding: --space-8 (32px)
font-size: --text-sm (12px)
color: --text-tertiary
```

---

## Phase 1: Design Brief Complete

### Overview

Ta faza to sam dokument design briefu (sekcje powyżej). Faza jest kompletna
gdy Claude Design wygeneruje mockup na podstawie tego planu.

### Changes Required:

#### 1. Plan.md jako input do Claude Design

**File**: `context/changes/landing-page/plan.md`

**Intent**: Dokument ten IS artefaktem Phase 1. Przekazać sekcje design briefu
(Sekcje 0-5) do Claude Design jako prompt kontekstowy.

**Contract**: Claude Design otrzymuje opis sekcji + tokeny + copy i generuje
wizualny mockup. Mockup jest zatwierdzany przez użytkownika przed Phase 2.

### Success Criteria:

#### Manual Verification:

- Claude Design wygenerował wizualny mockup ze wszystkich 5 sekcji
- Mockup używa IBM Plex Sans i tokenów opisanych w planie
- Każda sekcja ma czytelne polskie copy
- CTA "Zaloguj się" jest wyraźnie widoczny w hero i nawigacji
- Mockup zatwierdzony przez użytkownika przed przejściem do Phase 2

---

## Phase 2: Angular Route Implementation

### Overview

Dodanie publicznej trasy `/` w Angular, komponentu `LandingPageComponent`
i logiki redirect dla zalogowanych użytkowników. Faza uruchamiana PO
zatwierdzeniu mockupu z Claude Design.

### Changes Required:

#### 1. LandingPageComponent

**File**: `web/src/app/features/landing/landing.component.ts` (nowy)

**Intent**: Standalone Angular component bez auth-guarda, implementujący
sekcje z zatwierdzonego mockupu Claude Design.

**Contract**: Komponent subskrybuje `AuthService.isAuthenticated$` na init
i przy wyniku `true` wywołuje `Router.navigate(['cases/new'])`. Brak
`canActivate` — dostępny publicznie.

#### 2. SCSS komponentu

**File**: `web/src/app/features/landing/landing.component.scss` (nowy)

**Intent**: Style landing page używające tokenów CSS z design systemu.
Zero hardcoded kolorów — tylko CSS custom properties.

**Contract**: Importuje `@use '../../../../styles/design-system/variables' as *`
(lub używa tokenów globalnie). Spacing sections: `--space-16`/`--space-20`.

#### 3. Routing update

**File**: `web/src/app/app.routes.ts`

**Intent**: Zamień redirect z `/` na `LandingPageComponent` bez `canActivate`.
Zachowaj guard na `/cases/new` i `/cases/:id`.

**Contract**: Zmiana linii 14:
```
// Było:
{ path: '', redirectTo: 'cases/new', pathMatch: 'full' }

// Będzie:
{
  path: '',
  loadComponent: () =>
    import('./features/landing/landing.component')
      .then(m => m.LandingComponent)
}
```
Catch-all `**` pozostaje bez zmian (redirekcjonuje na `/`).

#### 4. HTML template (5 sekcji)

**File**: `web/src/app/features/landing/landing.component.html` (nowy)

**Intent**: Implementacja 5 sekcji z mockupu: nawigacja, hero, problem,
how-it-works, feature cards, footer.

**Contract**: Struktura HTML bazuje na zatwierdzonym mockupie Claude Design.
CTA button wywołuje `auth.loginWithRedirect()` z `AuthService`.

### Success Criteria:

#### Automated Verification:

- Build przechodzi: `cd web && ng build --configuration=production`
- Brak TypeScript errors: `cd web && ng build` (type checking wbudowane)

#### Manual Verification:

- Niezalogowany użytkownik otwiera `http://localhost:4201/` — widzi landing page
- Zalogowany użytkownik otwiera `/` — jest automatycznie przekierowany do `/cases/new`
- CTA "Zaloguj się" otwiera Auth0 login popup/redirect
- Responsywność: weryfikacja na mobile (360px) i desktop (1280px)
- Brak regresji: `/cases/new` i `/cases/:id` nadal wymagają logowania

**Implementation Note**: Phase 2 nie zaczyna się dopóki mockup z Phase 1
nie zostanie zatwierdzony przez użytkownika.

---

## Testing Strategy

### Manual Testing Steps:

1. Otwórz `http://localhost:4201/` bez zalogowania — widoczna landing page
2. Kliknij "Zaloguj się" — otwiera Auth0 (lub redirect do /cases/new w dev z skipAuth)
3. Zaloguj się poprawnie — jesteś przekierowany do `/cases/new`
4. Wróć na `/` po zalogowaniu — automatyczny redirect do `/cases/new`
5. Sprawdź konsolę: zero błędów CSS variable resolution
6. Sprawdź mobile (DevTools 375px): sekcje układają się w 1 kolumnę

## References

- Frame brief: `context/changes/landing-page/frame.md`
- Routing: `web/src/app/app.routes.ts:3-17`
- Auth guard: `web/src/app/core/guards/auth.guard.ts:7-24`
- Design tokens: `web/src/styles/design-system/_variables.scss`
- Design system docs: `context/foundation/design-system/README.md`
- PRD problem statement: `context/foundation/prd.md:22-24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Design Brief Complete

#### Manual

- [ ] 1.1 Claude Design wygenerował wizualny mockup ze wszystkich 5 sekcji
- [ ] 1.2 Mockup używa IBM Plex Sans i tokenów opisanych w planie
- [ ] 1.3 Każda sekcja ma czytelne polskie copy
- [ ] 1.4 CTA "Zaloguj się" widoczny w hero i nawigacji
- [ ] 1.5 Mockup zatwierdzony przez użytkownika

### Phase 2: Angular Route Implementation

#### Automated

- [x] 2.1 Build przechodzi: `cd web && ng build --configuration=production`
- [x] 2.2 Brak TypeScript errors

#### Manual

- [ ] 2.3 Niezalogowany użytkownik na `/` widzi landing page
- [ ] 2.4 Zalogowany użytkownik na `/` jest przekierowany do `/cases/new`
- [ ] 2.5 CTA "Zaloguj się" otwiera Auth0 login
- [ ] 2.6 Responsywność zweryfikowana (360px i 1280px)
- [ ] 2.7 Brak regresji w `/cases/new` i `/cases/:id`
