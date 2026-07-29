# Frame Brief: Powrót ze sprawy do źródłowego batchu

> Framing step before /ai-plan. Dokument oddziela obserwację od założonego
> rozwiązania.

## Reported Observation

Po otwarciu dokumentu z dashboardu wielu dokumentów i zatwierdzeniu decyzji
link „Sprawy” prowadzi do głównego widoku zamiast do dashboardu batchu.

## Initial Framing (preserved)

- **User's stated cause or approach**: case otwarty z batchu powinien pamiętać kontekst batchu.
- **User's proposed direction**: „Wróć po decyzji”, czyli link „Sprawy”, ma prowadzić do widoku przetwarzania wielu dokumentów.
- **Pre-dispatch narrowing**: problem dotyczy linku „Sprawy” po decyzji.

## Dimension Map

Obserwacja mogła powstać w trzech miejscach:

1. **Wejście z dashboardu** — nawigacja może nie przekazywać źródła.
2. **Case detail** — komponent może nie odczytywać kontekstu źródłowego.
3. **Wyjście po decyzji / topbar** — cel powrotu może być zahardkodowany.

## Hypothesis Investigation

| Hipoteza | Dowód | Werdykt |
| --- | --- | --- |
| Dashboard nie przekazuje źródła | `batch-dashboard.component.ts`: `router.navigate(['/cases', caseId])` bez parametrów | STRONG |
| Case detail nie zna źródła | `case-detail.component.ts` czyta tylko parametr `id` | STRONG |
| Powroty są stałe | `onDecided()` prowadzi do `/cases/new`; topbar ma `routerLink="/cases"` | STRONG |

## Narrowing Signals

- Użytkownik wskazał link „Sprawy” widoczny po decyzji.
- Ten sam ekran ma też automatyczny redirect po zdarzeniu `decided`.
- Oba cele ignorują źródło wejścia.

## Cross-System Convention

Widok szczegółów otwierany z kontekstowej kolejki powinien zachować jawny,
odświeżalny kontekst powrotu. Zwykłe wejście bez tego kontekstu powinno zachować
dotychczasowy fallback.

## Reframed (or Confirmed) Problem Statement

> **Rzeczywisty problem**: nawigacja dashboard batch → case detail traci
> informację o źródłowym batchu, więc case detail nie może wybrać poprawnego
> celu powrotu.

Pierwotne framing jest poprawne. Naprawa musi objąć przekazanie kontekstu wejścia
oraz oba wyjścia: link „Sprawy” i redirect po decyzji. Zwykłe wejście do case
nie może zmienić zachowania.

## Confidence

- **HIGH** — pełny przepływ ma bezpośrednie, zgodne dowody w kodzie.

## What Changes for /ai-plan

Plan powinien opisać trwałe przekazanie źródłowego `batchId`, użycie go przez
topbar i `onDecided()`, fallback do listy spraw oraz testy obu ścieżek.

## References

- `web/src/app/features/batch/batch-dashboard/batch-dashboard.component.ts`
- `web/src/app/features/case-detail/case-detail.component.ts`
- `web/src/app/shared/components/workstation-topbar/workstation-topbar.component.html`
