# Citation Scroll Fix — Plan Brief

> Full plan: `context/changes/citation-scroll-fix/plan.md`
> Research: `context/changes/citation-scroll-fix/research.md`

## What & Why

Kliknięcie cytatu w formularzu ekstrakcji powinno przewijać PDF do właściwej strony i podświetlać tekst. Nie działa, bo `citation.page` jest `undefined` w całym frontendzie — Java `Citation.java` serializuje pole jako `"pageNumber"`, a TypeScript oczekuje `"page"`. Drugi problem to martwy komponent SnippetPanel który nie pasuje do designu i nie jest renderowany.

## Starting Point

Mechanizm nawigacji jest kompletny i poprawnie zaprojektowany: `CaseStore` → `[page]` binding → page navigation, secondary find controller → text highlight. Brakuje tylko zgodności nazw pól na granicy SSE.

## Desired End State

Kliknięcie cytatu przewija PDF do właściwej strony i podświetla fragment tekstu. "str. N" przy cytacie pokazuje poprawny numer. Komponent SnippetPanel nie istnieje w codebase.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| Naprawa field name | Zmiana w Citation.java | Spójne z CitationRecord.java, czyste | Plan |
| System prompt | Zmiana `"pageNumber"` na `"page"` | Konieczne — ta sama klasa do deserializacji LLM i serializacji SSE | Plan |
| Find controller | Zostaje secondary controller | Podświetla bez findbar UI — intencja była poprawna | User |
| SnippetPanel | Usuń | Nie pasuje do designu, dead code | User |
| CSS hack na findbar | Nie | Niepotrzebne — secondary controller nie pokazuje findbar | User |

## Scope

**In scope:**
- Zmiana nazwy pola `pageNumber` -> `page` w `Citation.java`
- Aktualizacja systemu prompt w `ExtractionService.java` (3 miejsca)
- Usunięcie `web/src/app/shared/components/snippet-panel/` (3 pliki)

**Out of scope:**
- Koordynaty x/y cytatu (scroll do pozycji wewnątrz strony)
- Zmiany w CaseStore, PdfViewerComponent, ExtractionFormComponent
- CSS zmiany w bibliotece

## Architecture / Approach

Jednoczesna zmiana nazwy klucza w Java rekordzie i w systemie prompt zapewnia spójność na całej ścieżce: LLM emituje `"page"` → Jackson deserializuje na `Citation.page` → SSE wysyła `"page"` → TypeScript dostaje `citation.page`. Istniejący secondary find controller i `[page]` binding działają poprawnie bez żadnych zmian.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
|---|---|---|
| 1. Naprawa field name | Działające scrollowanie do cytatu | System prompt musi się zmienić razem z rekordem |
| 2. Usunięcie SnippetPanel | Czysty codebase | Minimalne — brak zewnętrznych importów |

**Prerequisites:** Backend uruchomiony, case z analizą dostępny do ręcznego testu
**Estimated effort:** ~30 minut (2 malutkie zmiany w kodzie + weryfikacja)

## Open Risks & Assumptions

- Secondary find controller musi załadować text layer strony docelowej zanim podświetli tekst. Przy dużych PDF pierwsze kliknięcie może nie podświetlić (ale nawigacja do strony zadziała). Po ponownym kliknięciu lub po załadowaniu strony podświetlenie powinno się pojawić.

## Success Criteria (Summary)

- Kliknięcie cytatu na stronie 3 → PDF scrolluje do strony 3
- Tekst cytatu jest podświetlony (żółte zaznaczenie)
- "str. N" przy cytacie pokazuje poprawny numer strony
