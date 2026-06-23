# Refactor Opportunities — Plan Brief

> Pełny plan: `context/changes/refactor-opportunities/plan.md`
> Research: `context/changes/refactor-opportunities/research.md`
> Źródło analizy: `context/changes/extraction-form-states/research.md`

## What & Why

Trzy niezależne refaktory usuwające zidentyfikowany dług techniczny w module ekstrakcji KYB.
Każda zmiana jest mała (1-2 pliki), odwracalna i nie wymaga zmian kontraktu SSE ani schematu
finalizacji. Priorytet wynika z rankingu w `research.md`: najwyższy koszt długu przy najniższym
koszcie zmiany.

## Starting Point

Moduł ekstrakcji ma 3 konkretne problemy strukturalne: nieobsłużone warianty SSE są cicho porzucane
(brak compile-time guard), polskie etykiety UI są zduplikowane w 3 komponentach bez wspólnego
źródła, a `FinalizeRequest.java` przyjmuje `List<Object>` zamiast `List<RedFlagItem>` przez
workaround Jackson 3.x, który może już nie obowiązywać.

## Desired End State

Nowy wariant zdarzenia SSE z backendu powoduje błąd kompilacji TypeScript, nie ciche pominięcie.
Wszystkie polskie etykiety UI żyją w jednym pliku `ui-labels.ts`. Backend waliduje kształt red flags
przy deserializacji, z precyzyjnym komunikatem zamiast generycznego 422.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
|---------|-------|---------|--------|
| Które kandydaty | K5 + K2 + K6 (top 3) | Najwyższy koszt długu, najniższy koszt zmiany | Research |
| K2 zasięg | Wszystkie 3 komponenty (11 stringów) | Jeden PR zamyka wszystkie polskie etykiety | Plan |
| i18n kierunek | Monolingual - prosta funkcja | Brak planu i18n; ng-translate byłby over-engineering | Plan |
| K1 (codec layer) | Nie w tym planie | Wymaga K5 jako prererekwizytu; osobna sesja po K5 | Research |
| K4 (explicit SSE enum) | Nie w tym planie | CI nie uruchamia testów - zbyt ryzykowne bez gate | Research |
| Testy | Tylko zmiany strukturalne | Brak mock infra dla fetch/ReadableStream - osobna sesja | Plan |

## Scope

**W zakresie:**
- K5: switch+never w `parseSSEMessage()` i symetrycznym handlerze w `extraction-form.component.ts`
- K2: nowy plik `ui-labels.ts` + refactor w 3 komponentach
- K6: zmiana `List<Object>` na `List<RedFlagItem>` w `FinalizeRequest.java`

**Poza zakresem:**
- K1 codec layer (prererekwizyt: K5)
- K3 case.store split (brak uzasadnienia biznesowego)
- K4 explicit SSE enum (prererekwizyt: CI test gate)
- K7 dual cancel comment (comment-only, nie refaktor strukturalny)
- Nowe testy (brak mock infra — osobna sesja)

## Architecture / Approach

Zmiany są izolowane warstwowo: K5 i K2 to zmiany wyłącznie frontendowe w `web/src/app/`, K6
to zmiana wyłącznie backendowa w `src/main/java/`. Żadna zmiana nie narusza kontraktu API ani
SSE. Weryfikacja każdej fazy przez `npm run build` (frontend) lub `./mvnw test` (backend).

## Phases at a Glance

| Faza | Co dostarcza | Kluczowe ryzyko |
|------|-------------|----------------|
| 1. K5 - Exhaustiveness | switch+never w parseSSEMessage; nowy wariant SSE = błąd kompilacji | Żadne - discriminated union już istnieje, brak prererekwizytów |
| 2. K2 - Etykiety UI | `ui-labels.ts` centralizuje 11 polskich stringów z 3 komponentów | Żadne - pure refactor, zero zmian zachowania |
| 3. K6 - Typed red_flags | `List<RedFlagItem>` w FinalizeRequest; Jackson waliduje kształt | Jackson 3.x może wymagać `@JsonProperty` na RedFlagItem - weryfikacja przez `./mvnw test` |

**Prererekwizyty:** Żadnych zewnętrznych. K5 jest prererekwizytem dla przyszłego K1, nie dla K2/K6.

**Szacowany nakład:** 3 małe PR, każdy to jednosesyjna zmiana - 1-3 godziny łącznie.

## Open Risks & Assumptions

- K6: `List<Object>` był workaroundem dla "Jackson 3.x unknown field" (commit `a23e41a`). Czy
  `RedFlagItem.java` jest teraz poprawnie skonfigurowany? Nieznane bez `./mvnw test` po zmianie.
- K5: `extraction-form.component.ts:129-133` używa `ExtractionEvent` union — switch+never tam
  działa, o ile typ jest importowany. Weryfikacja przez build.

## Success Criteria (Summary)

- `npm run build` przechodzi po K5 i K2 bez zmian w runtime zachowaniu UI
- `./mvnw test` przechodzi po K6 potwierdzając kompatybilność Jackson z `List<RedFlagItem>`
- Analiza dokumentu w UI działa poprawnie od etapu do etapu (zero regresji)
