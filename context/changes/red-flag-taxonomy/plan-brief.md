# Red Flag Taxonomy (S-03) — Plan Brief

> Full plan: `context/changes/red-flag-taxonomy/plan.md`

## What & Why

FR-007 wymaga wyświetlania red flag po zakończeniu analizy dokumentu, każdej powiązanej z zamkniętą taksonomią kategorii ryzyka. Bez tego analityk nie ma ustrukturyzowanego sygnału ryzyka — LLM generowałby wolne opisy bez kategorii, a zaufanie do wyników by runęło. Taksonomia wdrożona jako Java enum (placeholder 6 kategorii z PRD), bank podmieni wartości bez zmiany architektury.

## Starting Point

Backend strumieniuje pola ekstrakcji (FieldExtracted SSE events) i emituje AnalysisComplete. Brak jakiegokolwiek mechanizmu red flag: zero instrukcji w system prompt, zero typów w sealed hierarchy, zero pól w JSON Schema, zero komponentów w Angular.

## Desired End State

Po zakończeniu analizy analityk widzi sekcję "Red Flags" poniżej formularza ekstrakcji. Każda flaga pokazuje kategorię z taksonomii (badge), opis wygenerowany przez LLM i klikalne cytowania nawigujące do strony w PDF. Rekord finalizacji v0.3 zawiera `red_flags[]` jako opcjonalne pole (backward-compatible z v0.1/v0.2).

## Key Decisions Made

| Decision | Choice | Why (1 zdanie) |
|----------|--------|----------------|
| Taksonomia jako | Java enum `RedFlagCategory` | Kompilator sprawdza poprawność; bank podmieni wartości przy nowym buildzie |
| LLM wywołanie | Single pass — pola + red flags w jednym prompcie | Jeden request = niższy koszt i spójność kontekstu między polami a flagami |
| Red flag model | category + description + citations | Spójne z istniejącym modelem Citation; click-to-cite działa od razu |
| Edytowalność flag | Read-only w v1 | Brak potrzeby rozszerzania audit trail o per-flag dismiss w MVP |
| UI placement | Sekcja poniżej ExtractionForm | FR-007: "appear after full analysis" — naturalna pozycja po formularz |
| Schema evolution | Addytywne `red_flags: []` nullable w v0.3 | Zero migration; stare rekordy v0.1/v0.2 pozostają poprawne |
| Seed taksonomia | 6 kategorii z PRD Open Question 1 | Uzasadnione biznesowo; LLM ma konkretne opcje zamiast halucynować |

## Scope

**In scope:**
- `RedFlagCategory` enum z 6 PRD seed wartościami
- `ExtractionEvent.RedFlagsFound` sealed type
- Rozszerzony system prompt + NDJSON discriminator + akumulator
- `finalization-v0.3.json` z opcjonalnym `red_flags[]`
- `RedFlagListComponent` (read-only, click-to-cite)
- `CaseStore.redFlags` sygnał + `FinalizePayload` evolution

**Out of scope:**
- Per-flag dismiss / override (v2)
- Severity / confidence na fladze (v2)
- Drugi pass LLM
- Migration istniejących rekordów audytu
- Zamknięty katalog taksonomii banku (placeholder enum)

## Architecture / Approach

Single-pass LLM z NDJSON discriminacją po kluczu JSON. System prompt instruuje model: najpierw emit field lines (streamed), potem red flag lines na końcu. Backend discriminuje po `"category":` w każdej linii — field lines → `FieldExtracted` (immediate emit), red flag lines → `RedFlagItem` (akumulowane). `Flux.defer()` na końcu streamu emituje `RedFlagsFound(accumulated)` + `AnalysisComplete`. Frontend: nowy event type w union + nowy CaseStore sygnał + nowy komponent renderowany po `AnalysisComplete`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Backend domain types | `RedFlagCategory` enum, `RedFlagItem` record, `ExtractionEvent.RedFlagsFound` | Niskie — czysta Java struktura |
| 2. Backend LLM pipeline | Rozszerzony prompt, parser discriminator, akumulator, `RedFlagsFound` emisja, test | LLM może nie przestrzegać kolejności field → flag; prompt musi być precyzyjny |
| 3. Schema v0.3 + FinalizeService | `finalization-v0.3.json`, update FinalizeService | Niskie — zmiana ścieżki zasobu |
| 4. Frontend end-to-end | Models, CaseStore, `RedFlagListComponent`, CaseDetail wiring, finalizacja | Komponent timing — sekcja musi pojawić się jednorazowo po AnalysisComplete |

**Prerequisites:** S-01 (`core-case-flow`) — done. S-02 (`field-verification-export`) — done. LLM API key aktywny.

**Estimated effort:** ~2 sesje przez 4 fazy.

## Open Risks & Assumptions

- LLM może emitować red flag linie przed końcem pól (jeśli zlekceważy kolejność w prompcie) — parser discriminuje po kluczu, więc kolejność nie psuje logiki, ale flagi pojawią się wcześniej niż oczekiwano. Mitigation: jasna instrukcja "AFTER ALL field lines".
- 6 seed kategorii z PRD może nie pasować do katalogu banku — enum jest placeholderem, LLM będzie dopasowywał do dostępnych wartości. Ryzyko akceptowane dla MVP.
- `Flux.defer()` na akumulatorze: jeśli `hadError` jest true, akumulator może być częściowo wypełniony — `onErrorResume` zastępuje cały remaining stream, więc `concatWith` nie wykona się. Bez zmian w tej logice.

## Success Criteria (Summary)

- Po analizie analityk widzi sekcję Red Flags z kategoriami z taksonomii i cytowaniami
- Klik cytowania w red fladze nawiguje PDF identycznie jak dla pól ekstrakcji
- Rekord finalizacji zawiera `red_flags[]` (DevTools lub logi DB)
