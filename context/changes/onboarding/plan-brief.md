# Onboarding — Plan Brief

> Full plan: `context/changes/onboarding/plan.md`
> Frame brief: `context/changes/onboarding/frame.md`

## What & Why

Trzy konkretne affordance gaps w widoku case-detail czynią kluczowe funkcje niewidocznymi dla nowych użytkowników: citation badges wyglądają jak szare przypisy (nie jak klikalne linki do PDF), sekwencja po zakończeniu analizy nie jest komunikowana, a terminal nature decyzji compliance nie jest sygnalizowana przed potwierdzeniem. Cel: nowy użytkownik (ewaluator kursu lub analityk KYB) rozumie kluczowe funkcje bez zewnętrznej instrukcji.

## Starting Point

Case-detail ma już topbar ze statusem analizy ("Oczekuje / Analizowanie / Zakończona"), dwukrokowy decision-flow (pick → confirm) i klasy CSS `.of-help` / `.form-footnote` jako wzorzec inline hints. Brak jakiegokolwiek onboardingu, product-tour library, ani localStorage tracking.

## Desired End State

Citation badges są niebieskie i na hover pokazują "Kliknij → str. N w PDF". Po zakończeniu analizy pojawia się zamykalny info-callout prowadzący do decyzji. Przed potwierdzeniem decyzji widoczne jest ostrzeżenie o nieodwracalności. Przy pierwszej wizycie w case-detail wyświetla się 3-krokowy overlay wyjaśniający layout, cytacje i decyzję — przy kolejnych nie.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| Mechanizm | Hybrid: inline hints + first-use overlay | Hints działają zawsze (także przy powrocie), overlay daje prowadzenie pierwszemu użytkownikowi | Plan |
| Citation affordance | Zmiana koloru na `--accent` + tooltip z nr strony | cursor:pointer i hover underline już były; brakuje tylko koloru linku i kontekstu nawigacyjnego w title | Frame |
| Decision warning | Inline tekst `@if (pendingDecision())` | Pojawia się dokładnie na drodze do commit-btn; nie blokuje jak modal | Plan |
| Workflow callout | Banner po ANALYZED, zamykalny × | Stan ANALYZED to jedyny moment gdy callout jest potrzebny; lokalny signal bez persistence | Plan |
| Overlay persistence | localStorage `clearkyc_onboarding_v1` | Brak SSR — localStorage bezpieczny; sufix v1 umożliwia reset po redesignie onboardingu | Plan |
| Biblioteka tour | Żadna (custom) | Enterprise tools tej klasy budują własne minimalne overlaye; trzy punkty nie uzasadniają pełnej biblioteki | Frame |

## Scope

**In scope:**
- Citation badge: kolor + tooltip
- Decision bar: ostrzeżenie terminalności
- Extraction form: callout ANALYZED
- OnboardingOverlayComponent: 3-krokowy modal, localStorage, integracja w case-detail

**Out of scope:**
- Landing page (już tłumaczy CO robi apka)
- Case-new (dropzone ma już jasne hints)
- Backend / auth changes
- Spotlight tour wskazujący konkretne elementy DOM
- Onboarding dla innych ról / flow

## Architecture / Approach

Dwie niezależne warstwy: (1) inline hints — addytywne zmiany w 3 istniejących komponentach, żadnego nowego stanu globalnego; (2) overlay — nowy standalone `OnboardingOverlayComponent` w `web/src/app/shared/components/onboarding-overlay/`, zintegrowany przez import w `CaseDetailComponent`. Każda faza może być wdrożona i zweryfikowana niezależnie.

## Phases at a Glance

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Inline affordance hints | Citation badge (kolor+tooltip), decision warning, ANALYZED callout | Kolor `--accent` musi być czytelny jako link na tle ciemnego `.cite-sup` kontekstu |
| 2. First-use overlay | OnboardingOverlayComponent + localStorage tracking + integracja | Overlay musi mieć z-index powyżej AppLayout resizera i PDF viewer |

**Prerequisites:** Działający dev server (`npm start` w `web/`), dostęp do istniejącej sprawy z PDF i statusem ANALYZED do testów manualnych.

**Estimated effort:** ~1 sesja (2 fazy, 8 plików, żaden backend).

## Open Risks & Assumptions

- Kolor `--accent` (niebieski) na citation badge może kolidować z innymi elementami używającymi tego tokenu — do zweryfikowania wizualnie po wdrożeniu.
- `z-index: 1000` overlay może wymagać korekty jeśli któryś z paneli layoutu ma wyższy stacking context.
- localStorage `clearkyc_onboarding_v1` nie jest synchronizowany cross-tab — oba tab pokażą overlay przy pierwszym otwarciu case-detail (acceptable).

## Success Criteria (Summary)

- Nowy użytkownik klika badge `[1]` bez zastanawiania się co robi (kolor + tooltip komunikują akcję).
- Nowy użytkownik rozumie że "Potwierdź decyzję" jest nieodwracalne (widzi ostrzeżenie zanim kliknie).
- Po raz pierwszy w aplikacji użytkownik dostaje 3-krokowe prowadzenie bez potrzeby szukania dokumentacji.
