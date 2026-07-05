# ClearKYC Landing Page — Plan Brief

> Full plan: `context/changes/landing-page/plan.md`
> Frame brief: `context/changes/landing-page/frame.md`

## What & Why

Design brief dla Claude Design + plan implementacji Angular dla publicznej
landing page ClearKYC. Faktyczny problem do zaplanowania: zaprojektowanie
design briefu (sekcje + treść + tokeny) który Claude Design może zamienić
w mockup, a potem `/10x-implement` może zamienić w Angular component.

## Starting Point

Wszystkie trasy aplikacji są chronione `authGuard` (Auth0). Root `/` redirekcjonuje
na `/cases/new` bez żadnego kontekstu produktu. Niezalogowany odwiedzający
(evaluator kursu, rekruter) trafia prosto na ekran logowania i nie rozumie
co to za produkt.

## Desired End State

Landing page w języku polskim dostępna pod `/` bez auth-guarda, z 5 sekcjami:
nawigacja, hero, problem statement, 3-krokowy flow, feature cards. CTA "Zaloguj
się" kieruje do Auth0. Zalogowany użytkownik wchodzący na `/` jest automatycznie
przekierowany do `/cases/new`.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
|---|---|---|---|
| Język copy | Polski | UI aplikacji jest po polsku; evaluatorzy kursu są polskojęzyczni | Frame |
| Styl hero | Claude Design decyduje | User świadomie pozostawił tę decyzję Claude Design | Frame |
| CTA action | "Zaloguj się" → Auth0 | Najprostsze UX bez dodatkowej infrastruktury demo | Plan |
| Sekcje | Nav + Hero + Problem + HowItWorks + Features | User wybrał 3 z 4 opcji; tech stack pominięty | Plan |
| Tokeny CSS | Istniejące z design systemu | Reuse bez nowych tokenów; design system kompletny | Frame |
| Routing | Nowa trasa `/` bez guard; redirect dla auth | Catch-all `**` zostaje; guard na cas routes bez zmian | Plan |
| Tech stack section | Wykluczone | Nie wybrano w scope | Plan |

## Scope

**In scope:**
- Design brief ze wszystkimi sekcjami, draft copy po polsku, tokeny CSS
- `LandingComponent` (Angular standalone)
- Update `app.routes.ts` (zamiana redirect `/` na LandingComponent)
- Logika redirect auth'd user → `/cases/new`
- Responsywność (1 kolumna mobile, 2 kolumny desktop dla feature cards)

**Out of scope:**
- Tech stack showcase section
- Animacje / microinterakcje
- Nowe tokeny CSS
- Tryb ciemny
- Wersja angielska copy
- Galeria / video demo

## Architecture / Approach

```
/ (public, no guard)
  └── LandingComponent
        ├── subscribes auth.isAuthenticated$
        │     └── true → Router.navigate(['cases/new'])
        ├── nav: "ClearKYC" + "Zaloguj się" (outline button)
        ├── hero: heading + tagline + primary CTA button
        ├── problem: copy + opcjonalne stat-boxy
        ├── how-it-works: 3 numerowane kroki z--blue-500 circles
        └── features: 2×2 grid kart (--surface-raised, --shadow-sm)
```

Istniejące tokeny: `--blue-500` akcent, IBM Plex Sans, `--surface-raised`/
`--surface-canvas` naprzemiennie, `--shadow-sm` dla kart, `--radius-md` (5px).

## Phases at a Glance

| Faza | Co dostarcza | Kluczowe ryzyko |
|---|---|---|
| 1. Design Brief | Kompletny brief wejściowy dla Claude Design | Claude Design może potrzebować dodatkowego doprecyzowania layoutu |
| 2. Angular Route | Public `/` route, LandingComponent, redirect auth | Auth0 redirect może nie działać bez skonfigurowanego env |

**Prerequisites:** Design system wire (done), Angular scaffold (done)
**Estimated effort:** Phase 1 — sesja z Claude Design (mockup). Phase 2 — ~1 sesja implementacji.

## Open Risks & Assumptions

- Claude Design może zinterpretować brief różnie — review mockupu wymagany
  przed Phase 2
- Auth0 CTA button na landing page wymaga `AuthService` injectable — sprawdzić
  czy to nie powoduje problemów na publicznej trasie (service jest opcjonalny
  w innych miejscach)
- `environment.skipAuth` w dev: CTA button powinien mimo wszystko działać
  w trybie skipAuth (przekieruj bezpośrednio do `/cases/new`)

## Success Criteria (Summary)

- Claude Design wygenerował zatwierdzony mockup z 5 sekcji
- Niezalogowany użytkownik na `http://localhost:4201/` widzi landing page (nie redirect do Auth0)
- Zalogowany użytkownik na `/` jest automatycznie przekierowany do `/cases/new`
