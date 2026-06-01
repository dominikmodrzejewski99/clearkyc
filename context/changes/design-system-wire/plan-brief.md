# Design System Wire — Plan Brief

> Full plan: `context/changes/design-system-wire/plan.md`

## What & Why

Napraw dwa kategorie problemów w fundamencie design systemu Angular: (1) rozwiąż broken CSS variable references w `_mixins.scss` i `app-layout.component.scss` — tokeny z prefixem `--color-*` i nieistniejący `--surface-panel` cicho fallbackują do wartości przeglądarki; (2) migruj ładowanie czcionek IBM Plex z Google Fonts CDN do `@fontsource` npm — offline-capable, deterministyczne buildy. Naprawienie tego teraz jest prerequezytem S-01: komponenty S-01 będą używały tych samych miksyn i tokenów, więc budowanie na zepsutym fundamencie generuje dług.

## Starting Point

Design system jest zdefiniowany (`_variables.scss` — 100+ tokenów CSS) i zaimportowany w `styles.scss`. Bazowa typografia działa. Natomiast mixin `panel-placeholder` i `focus-ring` (używane przez przyszłe komponenty) referują tokeny które nie istnieją. AppLayout (`app-layout.component.scss`) używa `--surface-panel` zamiast `--surface-sunken`. IBM Plex ładuje się z CDN (wymaga internetu).

## Desired End State

Wszystkie referencje CSS custom properties w plikach design systemu rozwiązują się do tokenów zdefiniowanych w `_variables.scss`. Żadnych silent fallbacków. IBM Plex Sans i IBM Plex Mono bundlowane w buildzie Angular — zero requestów do `fonts.googleapis.com`, działające offline. AppLayout placeholder renderuje się z szarym tłem (gray-100) i widocznym dashed border.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| `--surface-panel` mapping | `--surface-sunken` (gray-100) | Placeholder to wizualnie "inset well" — pasuje do sunken semantyki lepiej niż raised (#FFF) | Plan |
| `app.html` welcome screen | Wykluczone z zakresu | Throwaway placeholder zastępowany w S-01 — migracja inline styles nie daje długoterminowej wartości | Plan |
| Font loading | `@fontsource` npm packages | Offline-capable, deterministyczne buildy bez zewnętrznego CDN | Plan |
| Nowe tokeny | Nie dodajemy | 4 poprawki to rename nie rozszerzenie — przedwczesne tokeny powiększają API bez potrzeby | Plan |

## Scope

**In scope:**
- `_mixins.scss` — 4 broken variable references (rename `--color-*` na canonical)
- `app-layout.component.scss` — 1 broken token (`--surface-panel` → `--surface-sunken`)
- `styles.scss` — usuń CDN `@import url(...)`
- `angular.json` — dodaj @fontsource CSS do styles array
- `web/package.json` — dodaj 2 npm deps (@fontsource/ibm-plex-sans, @fontsource/ibm-plex-mono)

**Out of scope:**
- `app.html` welcome screen
- Nowe komponenty
- Nowe design tokeny
- SCSS linter konfiguracja

## Architecture / Approach

Czysto mechaniczne korekty w dwóch fazach — brak nowych abstrakcji, brak nowych komponentów. Faza 1 (rename tokenów) i Faza 2 (font migration) są niezależne technicznie, ale lądują w tym samym PR dla spójności.

```
_variables.scss (canonical tokens)
       ↓ references fixed
_mixins.scss + app-layout.component.scss
       ↓ CDN removed
styles.scss + angular.json → @fontsource packages bundled at build time
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Fix broken CSS variables | 5 token renames, AppLayout placeholder renderuje poprawnie | Wizualny regres jeśli wybór --surface-sunken jest zbyt ciemny — weryfikacja manualna |
| 2. @fontsource migration | IBM Plex Sans/Mono bundled w buildzie, zero CDN | Nazwy plików w @fontsource pakietach trzeba sprawdzić po install — mogą się różnić od założeń |

**Prerequisites:** F-03 (Angular scaffold gotowy — jest done)
**Estimated effort:** ~1 sesja, 2 fazy mechaniczne

## Open Risks & Assumptions

- `@fontsource/ibm-plex-sans` i `@fontsource/ibm-plex-mono` muszą istnieć w npm registry i pokrywać potrzebne weight'y (400, 500, 600, 700) — sprawdź po install przed edycją `angular.json`
- `--surface-sunken` (gray-100 = `#EDF0F4`) jako tło placeholdera może być wizualnie zbyt ciemne lub zbyt jasne — weryfikacja manualna po Phase 1 rozstrzyga

## Success Criteria (Summary)

- `ng build` przechodzi bez błędów po obu fazach
- DevTools Network: zero requestów do `fonts.googleapis.com`
- DevTools Console: zero CSS variable resolution warnings
