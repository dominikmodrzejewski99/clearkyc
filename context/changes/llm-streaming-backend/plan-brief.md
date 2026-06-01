# LLM Streaming Backend (F-04) — Plan Brief

> Full plan: `context/changes/llm-streaming-backend/plan.md`
> Research: `context/changes/llm-streaming-backend/research.md`

## What & Why

Implementujemy endpoint SSE `POST /api/cases/{caseId}/analysis` który przyjmuje PDF w `multipart/form-data`, wywołuje Claude (Anthropic) przez Spring AI 2.0 i strumieniuje wyekstrahowane encje KYB (nazwa firmy, dyrektorzy, UBO) z cytowaniami do Angular SPA. F-04 to ostatni fundament przed S-01 (minimalny rdzeń przypadku); bez działającego LLM streaming reszta produktu jest niesprawdzalną hipotezą.

## Starting Point

Spring Boot 4.0.6 + Spring MVC + OAuth2 Resource Server + Spring Data JPA są w pełni działające (F-01 + F-02 + F-03 done). `pom.xml` nie zawiera Spring AI; `KybCase` ma statusy `CREATING/ANALYZING/ANALYZED/LOCKED` gotowe do użycia; brak pola PDF w encji (decyzja: PDF przyjmowany w request, nie persystowany w F-04).

## Desired End State

`./mvnw verify` zielony. Endpoint zwraca `text/event-stream` z sekwencją `FieldExtracted` (jedno na pole KYB) zakończoną `AnalysisComplete`. Case przechodzi `CREATED → ANALYZING → ANALYZED`. Pierwsze pole widoczne ~3-5s po triggerze (NFR 5s). `401` bez JWT, `404` nieznany case, `409` case nie-CREATED.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
|---|---|---|---|
| SDK LLM | Spring AI 2.0 + spring-ai-starter-model-anthropic | Natywny Boot 4.x, auto-config, model-agnostic API | Research |
| Streaming JSON | NDJSON (jedna linia = jedno pole) | Spełnia NFR 5s; brak inkrementalnego parsera JSON | Plan |
| Zakres pól | companyName + directors + UBOs | Pełen PRD scope od razu; pola proste | Plan |
| PDF storage | W request body (multipart), nie persystowany | Brak V2 migracji; S-01 zdecyduje o storage | Research |
| WebFlux | Nie dodajemy | Spring MVC 6 + ReactiveAdapterRegistry obsługuje Flux | Research |
| Błąd LLM | Emit AnalysisError, complete Flux, status → ANALYZED | Klient zawsze dostaje sygnał końca; proste testy | Plan |
| Concurrent guard | 409 jeśli status != CREATED | Prosta semantyka; re-analiza nie w PRD | Plan |
| Testy | @WebMvcTest + opcjonalny @SpringBootTest (env-gated) | CI zawsze zielone; dev weryfikuje LLM lokalnie | Plan |
| Spring AI 2.0.0 | Weryfikacja w Fazie 1, fallback RC1 | GA 28 maja — 3 dni; Maven Central może być opóźniony | Plan |

## Scope

**In scope:**
- Spring AI BOM + Anthropic starter w pom.xml
- SSE endpoint `POST /api/cases/{caseId}/analysis`
- `ExtractionEvent` (sealed: FieldExtracted, AnalysisComplete, AnalysisError), `Citation`
- `ExtractionService` z NDJSON parsing, state machine, error handling
- `ExtractionController` — cienki adapter HTTP
- @WebMvcTest (5 scenariuszy), opcjonalny live test (env-gated)
- System prompt dla ekstrakcji KYB z cytowaniami

**Out of scope:**
- Persystencja PDF w DB / Object Storage (S-01)
- Walidacja formatu pliku i obsługa PDF z błędami (S-01)
- Angular klient SSE / split panel UI (S-01)
- Re-analiza już przeanalizowanych cases (S-01)
- Prompt engineering iteration (iteracyjna po MVP)
- Flyway V2 migration (brak nowych kolumn)

## Architecture / Approach

```
Angular SPA
  --POST /api/cases/{id}/analysis (multipart, Bearer JWT)-->
    ExtractionController (@RestController)
      --> ExtractionService (@Service)
            |-- KybCaseRepository: validate state, CREATED→ANALYZING
            |-- ChatModel (Spring AI): stream(prompt + PDF via Media)
            |       |-- NDJSON parser: tokens → lines → FieldExtracted events
            |-- doFinally: ANALYZING→ANALYZED (always)
            Flux<ServerSentEvent<ExtractionEvent>>
  <--text/event-stream: FieldExtracted, FieldExtracted, ..., AnalysisComplete--
```

Spring MVC 6 obsługuje `Flux<ServerSentEvent<T>>` przez `ReactiveAdapterRegistry` — Tomcat pozostaje serwerem, WebFlux niepotrzebny.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Maven + Config | Spring AI na classpath; 9 istniejących testów zielonych | Spring AI 2.0.0 może nie być w Maven Central — fallback RC1 |
| 2. Model + Service | ExtractionEvent, Citation, ExtractionService z NDJSON | NDJSON scan pattern wymaga starannej implementacji Reactor |
| 3. Controller + Tests | Endpoint działa end-to-end; @WebMvcTest x5 | contextLoads z Spring AI wymaga @MockitoBean ChatModel |

**Prerequisites:** F-01 (auth), F-02 (KybCase entity + repo), ANTHROPIC_API_KEY dla testu live
**Estimated effort:** ~2-3 sesje kodowania w 3 fazach; Faza 2 jest najdłuższa (logika serwisu)

## Open Risks & Assumptions

- Spring AI 2.0.0 w Maven Central: GA 28 maja — weryfikacja jako pierwszy krok Fazy 1
- NDJSON z Claude: Claude może generować nieregularne `\n` lub otaczać JSON blokami markdown — prompt musi to jednoznacznie zabraniać
- NFR 5s: zakłada że Claude zaczyna emitować NDJSON od początku dokumentu; dla bardzo dużych PDF (100+ stron) może być przekroczone
- `pageNumber` w cytowaniach: Claude otrzymuje PDF binarnie — numery stron są best-effort; wartość `0` = nieznany jest akceptowalna w F-04

## Success Criteria (Summary)

- `./mvnw verify` zielony z nowymi 5 testami kontrolera
- `curl` lokalny z JWT + prawdziwym PDF strumieniuje zdarzenia SSE z polami KYB
- Status case w DB po analizie: `ANALYZED`
