---
date: 2026-07-10T19:03:15+02:00
researcher: Claude (Sonnet 5)
git_commit: e91564dff18f3920abf7670f9212d689f2c9b229
branch: main
repository: clearkyc
topic: "Jak działa obecny streaming ekstrakcji pól (FR-005–FR-008) i wybór SDK LLM"
tags: [research, codebase, streaming, sse, llm-sdk, extraction, citations, spring-ai]
status: complete
last_updated: 2026-07-10
last_updated_by: Claude (Sonnet 5)
last_updated_note: "Added follow-up research on landing-page typing animation vs. current extraction-form animation, and on the archived extraction-streaming-ux change that already addressed this exact request"
---

# Research: Jak działa obecny streaming ekstrakcji pól (FR-005–FR-008) i wybór SDK LLM

**Date**: 2026-07-10T19:03:15+02:00
**Researcher**: Claude (Sonnet 5)
**Git Commit**: e91564dff18f3920abf7670f9212d689f2c9b229
**Branch**: main
**Repository**: clearkyc

## Research Question

Zbadaj jak działa obecny streaming ekstrakcji pól (FR-005-008) i wybór SDK LLM.

## Summary

**Streaming ekstrakcji jest już w pełni zaimplementowany end-to-end** — backend (Spring Boot + Spring AI) i frontend (Angular + fetch-based SSE) — wbrew temu, co sugeruje przestarzała sekcja "What's actually in the repo right now" w `CLAUDE.md`. To rozbieżność między dokumentacją a stanem faktycznym repo, którą warto sprostować w `CLAUDE.md` przy okazji tej zmiany.

**Wybór SDK LLM**: **Spring AI 2.0.0-M8** + **`spring-ai-starter-model-google-genai`** (Google Gemini, model `gemini-3.1-flash-lite` w produkcji/`gemini-2.5-pro` opcjonalnie). To jest **odejście od pierwotnej decyzji** — `llm-streaming-backend/change.md` pierwotnie wybrało Anthropic (`spring-ai-starter-model-anthropic`), ale w trakcie implementacji przestawiono się na Google GenAI, ponieważ GA Spring AI 2.0.0 nie było jeszcze dostępne w Maven Central w dniu implementacji. Ta zmiana jest udokumentowana jako **autoryzowana adaptacja** (nie dryf) w `context/changes/llm-streaming-backend/reviews/impl-review.md`.

**Architektura streamu**: backend zwraca `Flux<ServerSentEvent<ExtractionEvent>>` z endpointu `POST /api/cases/{caseId}/analysis` (bez WebFlux — natywne wsparcie Spring MVC dla reaktywnych typów zwrotnych). LLM (Gemini) dostaje cały PDF jako multimodalny `Media` w promptcie i streamuje NDJSON (jeden JSON per linia = jedno pole). Backend buforuje tokeny do pełnych linii, parsuje każdą jako `FieldRecord` → `ExtractionEvent.FieldExtracted`, i emituje natychmiast. Red flagi są buforowane i wysyłane jako jedno zdarzenie `RedFlagsFound` dopiero po zakończeniu strumienia pól (zgodnie z FR-007: "red flags są NOT streamed").

Frontend konsumuje strumień przez **ręczny `fetch()` + `ReadableStream`** (nie `EventSource`, bo `EventSource` nie pozwala ustawić nagłówka `Authorization: Bearer`). Każde `FieldExtracted` ląduje jako kompletny obiekt (wartość + cytaty razem) w sygnale `CaseStore.extractionFields` — nie ma strumieniowania pod-pól/tokenów, tylko całych pól na raz. Cytaty (`page`, `quote`) są widoczne od razu przy polu (nie trzeba klikać, żeby zobaczyć treść cytatu) — kliknięcie tylko przewija podgląd PDF do właściwej strony i podświetla dopasowanie.

**Kluczowe luki/ryzyka znalezione**:
1. Red flagi nie są streamowane inkrementalnie mimo że pola są — to zgodne z FR-007, ale warto to świadomie odnotować w planie tej zmiany.
2. Backend cicho odrzuca niesparsowalne linie NDJSON (`ExtractionService.java:154-157`) — brak `AnalysisError`, brak retry, analityk nie wie, że pole mogło zniknąć.
3. Frontendowy `toFieldExtracted` w `extraction.codec.ts:3-5` robi **niesprawdzony cast** (`payload as ExtractionField`) — jedyny z czterech koderów bez walidacji kształtu w runtime.
4. Zduplikowana logika nawigacji do cytatu między `CitationBadgeComponent.navigate()` i `ExtractionFormComponent.navigateToCitation()`.
5. Zamknięta taksonomia red-flag (PRD Open Question 1) **wciąż nierozwiązana** — istniejący enum `RedFlagCategory` to jawnie oznaczony placeholder (6 kategorii-kandydatów z PRD), nie prawdziwy katalog banku.
6. Brak testów integracyjnych dla właściwego pipeline'u NDJSON/streamingu — istniejące testy backendu mockują `ExtractionService` całkowicie lub sprawdzają tylko trywialny `switch` na `wireType`.
7. Nieprzetestowany white-spot: czy `doFinally()` na backendzie wywoła się poprawnie, gdy klient przerwie połączenie w trakcie streamu (zależne od konfiguracji Tomcat) — odnotowane w `extraction-form-states/research.md`, niezweryfikowane.

## Detailed Findings

### Frontend: konsumpcja SSE i renderowanie pól z cytatami

**Transport**: `ExtractionStreamService.streamAnalysis(caseId, pdfFile)` ([extraction-stream.service.ts](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/core/services/extraction-stream.service.ts)) — **nie `EventSource`**, tylko ręczny `fetch()` do `POST /api/cases/{caseId}/analysis` z `AbortController` do anulowania. Powód: `EventSource` nie pozwala dołączyć nagłówka `Authorization: Bearer` (potwierdzone też w `core-case-flow/research.md` jako wiążąca decyzja architektoniczna).

- Odczyt strumienia: `response.body.getReader()` + `TextDecoder`, akumulacja w `buffer`, split po `\n\n` (delimiter wiadomości SSE) — extraction-stream.service.ts:39-49.
- Każda kompletna wiadomość trafia do `parseSSEMessage()` z `extraction.codec.ts` — extraction-stream.service.ts:52.
- `AbortError` jest cicho połykany (celowe anulowanie, nie błąd) — extraction-stream.service.ts:59.
- Auth token dociągany warunkowo (`environment.skipAuth`) przez `firstValueFrom(auth.getAccessTokenSilently())` — extraction-stream.service.ts:20-23.

**Wire-format (discriminated union)** — `extraction.models.ts:31-35`:

```typescript
export type ExtractionEvent =
  | { type: 'FieldExtracted'; field: ExtractionField }
  | { type: 'AnalysisComplete'; caseId: string }
  | { type: 'AnalysisError'; errorCode: string; message: string }
  | { type: 'RedFlagsFound'; flags: RedFlagItem[] };
```

`Citation { page: number; quote: string }`, `ExtractionField { fieldName, value, citations: Citation[] }` — extraction.models.ts:3-29.

**Kodek** (`extraction.codec.ts:32-61`, `parseSSEMessage`) parsuje linie `event:`/`data:`, `JSON.parse` z cichym catch przy błędnym JSON (linie 56-58 — **żadnego ostrzeżenia, żadnego błędu**, wiadomość po prostu ginie). Cztery koder-funkcje per typ zdarzenia:
- `toFieldExtracted` (codec.ts:3-5) — **niesprawdzony cast**, brak walidacji kształtu.
- `toAnalysisComplete` (codec.ts:7-14) — waliduje `caseId` jako string, domyślnie `''` z `console.warn`.
- `toAnalysisError` (codec.ts:16-25) — waliduje `errorCode`/`message`.
- `toRedFlagsFound` (codec.ts:27-30) — brak walidacji per-item.

**Stan UI** — `ExtractionFormComponent.startAnalysis()` (extraction-form.component.ts:105-135) subskrybuje strumień (`takeUntil(cancelStream$), takeUntilDestroyed(destroyRef)`) i przełącza na typ zdarzenia:
- `FieldExtracted` → `caseStore.appendField(event.field)` — **całe pole (wartość + cytaty) trafia atomowo**, nie ma strumieniowania po tokenach wewnątrz pola.
- `RedFlagsFound` → `caseStore.setRedFlags(event.flags)`.
- `AnalysisComplete` → `caseStore.markAnalyzed()` (ustawia `caseStatus: 'ANALYZED'`, odświeża listę ostatnich spraw).
- `AnalysisError` → `caseStore.markAnalysisError(event.message)`.
- Błąd transportowy (nie zdarzenie `AnalysisError`) → generyczny komunikat PL `'Błąd połączenia ze strumieniem analizy.'` (extraction-form.component.ts:133) — nie rozróżnia sieci/5xx/auth.

**Cytaty renderowane od razu, nie za klikiem** — `extraction-form.component.html:122-158`: superskrypt-badge (`app-citation-badge`) tuż przy wartości pola + pełny blok cytatu poniżej, z widocznym tekstem `"{{ citation.quote }}"` i numerem strony — kliknięcie (`navigateToCitation`) tylko ustawia `caseStore.activePage`/`activeQuote`, co poprzez `effect()` w `PdfViewerComponent` (pdf-viewer.component.ts:61-77) przewija PDF i podświetla dopasowanie via `ngx-extended-pdf-viewer`'s find controller. Logika duplikowana identycznie w `CitationBadgeComponent.navigate()` i `ExtractionFormComponent.navigateToCitation()`.

**Anulowanie/retry**: brak reconnect/retry automatycznego — po błędzie transportowym pojawia się baner z przyciskiem "Ponów analizę" (`tryStartAnalysis()`), który startuje **całą analizę od zera** (brak wznowienia częściowo wystreamowanych pól).

### Backend: emisja SSE i wybór SDK LLM

**LLM SDK faktycznie użyty**: **Spring AI 2.0.0-M8** (`org.springframework.ai:spring-ai-bom`, pom.xml:36-43) + `spring-ai-starter-model-google-genai` (pom.xml:89-92). Konfiguracja: `application.properties:9-13` (`spring.ai.google.genai.api-key`, `spring.ai.google.genai.chat.model=gemini-3.1-flash-lite`); produkcyjny komentarz wskazuje że `gemini-2.5-pro` wymaga płatnego projektu GCP, więc darmowy fallback to `gemini-3.1-flash-lite`. **Brak** jakiejkolwiek zależności Anthropic/OpenAI/LangChain4j w `pom.xml` mimo że `llm-streaming-backend/change.md` pierwotnie wybrało Anthropic — patrz sekcja Historical Context.

**Endpoint**: `ExtractionController` (`src/main/java/com/example/clearkyc/analysis/ExtractionController.java:25-36`):

```java
@PostMapping(
        value = "/api/cases/{caseId}/analysis",
        produces = MediaType.TEXT_EVENT_STREAM_VALUE + ";charset=UTF-8",
        consumes = MediaType.MULTIPART_FORM_DATA_VALUE
)
public Flux<ServerSentEvent<ExtractionEvent>> streamAnalysis(
        @PathVariable UUID caseId,
        @RequestPart("file") MultipartFile pdfFile,
        @AuthenticationPrincipal Jwt jwt)
```

Guardy w `ExtractionService.streamAnalysis` (linie 84-93): 404 gdy case nie istnieje/nie należy do wołającego (IDOR-safe przez `findByIdAndAnalystIdentity`), 409 gdy już `ANALYZING`, 409 gdy `LOCKED`. Status case'a: `CREATED → ANALYZING` przed wywołaniem LLM, `→ ANALYZED` na sukces, `→ CREATED` na błąd (`doFinally`, linie 170-184) — analityk może ponowić po niepowodzeniu.

**Wire-format DTO** — `ExtractionEvent` jako **sealed interface** z czterema rekordami (`ExtractionEvent.java`):

```java
public sealed interface ExtractionEvent permits
        ExtractionEvent.FieldExtracted, ExtractionEvent.AnalysisComplete,
        ExtractionEvent.AnalysisError, ExtractionEvent.RedFlagsFound {
    record FieldExtracted(String fieldName, String value, List<Citation> citations) implements ExtractionEvent {}
    record AnalysisComplete(String caseId) implements ExtractionEvent {}
    record AnalysisError(String errorCode, String message) implements ExtractionEvent {}
    record RedFlagsFound(List<RedFlagItem> flags) implements ExtractionEvent {}
}
```

Nazwa `event:` w SSE ustalana jawnym, wyczerpującym `switch` (`ExtractionService.java:196-203`) — nie `getClass().getSimpleName()` (ta refleksyjna wersja była w pierwotnym planie i została zastąpiona przez zmianę `sse-explicit-event-type`, patrz Historical Context).

**Pipeline strumieniowania** (`ExtractionService.streamAnalysis`, linie 83-194):
1. PDF ładowany jako `Media` (multimodalny input) razem z promptem systemowym definiującym protokół NDJSON.
2. `chatModel.stream(prompt)` → `Flux` tokenów tekstu.
3. Ręczne buforowanie linii NDJSON (`.flatMapIterable`, linie 124-136) — akumulacja do `\n`, cap 512 000 bajtów (`IllegalStateException` jako guard przed runaway response).
4. Każda linia parsowana: `"category":` → `RedFlagItem` (buforowany, nieemitowany od razu); inne → `FieldRecord` → natychmiastowy `ExtractionEvent.FieldExtracted` (linie 137-158). **Niesparsowalne linie są logowane i cicho odrzucane** (linie 154-157) — brak `AnalysisError`, brak sygnału utraty danych.
5. `.concatWith` dokleja zbuforowane `RedFlagsFound` (jeśli niepuste), potem `AnalysisComplete` (linie 159-164) — **red flagi NIE są streamowane inkrementalnie**, zgodnie z FR-007 ("red flags are NOT streamed"), tylko jednym pakietem na końcu.
6. `.onErrorResume` (linie 165-168) zamienia wyjątek pipeline'u w terminalne zdarzenie `AnalysisError` zamiast zamykać połączenie błędem HTTP.
7. `.doFinally` (linie 170-184) zapisuje `extractionData` (pola + red flagi jako JSON, przez `tools.jackson.databind.json.JsonMapper` — pakiet Jackson 3.x, nie `com.fasterxml`) na encji `KybCase` i przełącza status.

**Testy**: `ExtractionServiceTest.java` pinuje tylko `switch` na `wireType` (4 trywialne asercje). `ExtractionControllerTest.java` mockuje `ExtractionService` całkowicie, sprawdza wyłącznie kontraktowe aspekty HTTP (401/404/409, content-type, kolejność zdarzeń przez ręcznie zbudowany `Flux.just(...)`). **Właściwa logika buforowania NDJSON, integracja z `ChatModel.stream()`, akumulacja red flag i logika `doFinally` nie mają bezpośredniego pokrycia testami.**

## Code References

- [`web/src/app/core/services/extraction-stream.service.ts`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/core/services/extraction-stream.service.ts) — fetch-based SSE transport, AbortController, token attachment
- [`web/src/app/core/services/extraction.codec.ts`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/core/services/extraction.codec.ts) — SSE message parsing, per-type coercers
- [`web/src/app/core/models/extraction.models.ts`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/core/models/extraction.models.ts) — `ExtractionEvent` discriminated union, `Citation`, `ExtractionField`
- [`web/src/app/core/store/case.store.ts`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/core/store/case.store.ts) — Angular signals state, `appendField`, `markAnalyzed`, `markAnalysisError`
- [`web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts) — stream subscription, event switch, cancel/retry
- [`web/src/app/shared/components/citation-badge/citation-badge.component.ts`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/shared/components/citation-badge/citation-badge.component.ts) — badge navigation logic (duplicated with form component)
- [`web/src/app/shared/components/pdf-viewer/pdf-viewer.component.ts`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/shared/components/pdf-viewer/pdf-viewer.component.ts) — citation-driven find/scroll/highlight via ngx-extended-pdf-viewer
- `pom.xml:36-43,89-92` — Spring AI BOM + Google GenAI starter dependency
- `src/main/java/com/example/clearkyc/analysis/ExtractionController.java:25-36` — SSE endpoint contract
- `src/main/java/com/example/clearkyc/analysis/ExtractionService.java:83-194` — NDJSON buffering, field/red-flag pipeline, status transitions
- `src/main/java/com/example/clearkyc/analysis/ExtractionEvent.java` — sealed record hierarchy (wire DTOs)
- `src/main/java/com/example/clearkyc/analysis/RedFlagCategory.java` — closed enum, 6 seed categories (placeholder)
- `src/main/resources/application.properties:9-13`, `application-dev.properties:9-12` — Google GenAI model config
- `src/test/java/com/example/clearkyc/analysis/ExtractionServiceTest.java`, `ExtractionControllerTest.java` — existing (shallow) test coverage

## Architecture Insights

- **Fetch zamiast EventSource jest wiążącą decyzją architektoniczną** (potwierdzoną w kilku miejscach: `llm-streaming-backend/research.md`, `core-case-flow/research.md`), bo `EventSource` nie obsługuje custom headers potrzebnych do `Authorization: Bearer`.
- **`Flux<ServerSentEvent<T>>` bez WebFlux** to świadomy wybór, żeby uniknąć dodawania `spring-boot-starter-webflux` obok istniejącego `spring-boot-starter-webmvc` — Spring MVC natywnie wspiera reaktywne typy zwrotne przez async dispatch (potwierdzone testem `request().asyncStarted()`).
- **NDJSON (jedna linia = jedno pole) zamiast przyrostowego parsowania JSON** — wybrane dla NFR 5s-do-pierwszego-pola; to spójna decyzja po obu stronach (backend emituje, frontend konsumuje po `\n\n`/`\n`).
- **Sealed interface + wyczerpujący `switch`** (Java 21) jako mechanizm kompilator-wymuszonej spójności między typami zdarzeń a ich serializacją — wzorzec powtórzony też we frontendowym TypeScript discriminated union z `_exhaustive: never` guardem.
- **Cytaty jako pierwszorzędna tablica, nie opcjonalne pole** — zgodne z FR-008 (multi-page synthesis, "Not Disclosed / Inferred Missing" jako explicit marker).
- **Red flagi celowo NIE są streamowane** — to nie ograniczenie techniczne, tylko wymóg FR-007 (uniknięcie fałszywych alarmów z częściowych parsowań).

## Historical Context (from prior changes)

- [`context/changes/llm-streaming-backend/change.md`](../llm-streaming-backend/change.md) — pierwotna decyzja: Spring AI 2.0 + `spring-ai-starter-model-anthropic`, uzasadniona natywną integracją Spring Boot 4.x, wsparciem multimodalnym PDF i elastycznością zmiany dostawcy (referencja do PRD Open Question 3: czy bank pozwoli wysyłać dokumenty do zewnętrznego dostawcy).
- [`context/changes/llm-streaming-backend/plan.md:93`](../llm-streaming-backend/plan.md) — **"Adaptacja"**: w trakcie implementacji przestawiono się na Google GenAI (klucz AI Studio) zamiast Anthropic, bo Spring AI 2.0.0 GA nie było dostępne w Maven Central w dniu implementacji; użyto BOM `2.0.0-M8`.
- [`context/changes/llm-streaming-backend/reviews/impl-review.md:21-27`](../llm-streaming-backend/reviews/impl-review.md) — ta adaptacja formalnie zalogowana jako **autoryzowana, nie dryf**; F9 odnotowuje, że `plan.md` był przestarzały (odwoływał się do Anthropic/`ANTHROPIC_API_KEY`) i został post-hoc poprawiony.
- [`context/changes/extraction-sse-codec/change.md`](../extraction-sse-codec/change.md) — wydzielenie `parseSSEMessage()` do dedykowanego `extraction.codec.ts`, naprawiając utratę `errorCode` przy `AnalysisError` i niebezpieczny fallback `payload.caseId ?? payload` przy `AnalysisComplete`. Celowo **nie dodano** biblioteki walidacyjnej (Zod/ajv/valibot) — ręczne guardy zgodnie z ustaleniem z `refactor-opportunities/research.md §K1`.
- [`context/changes/sse-explicit-event-type/plan.md`](../sse-explicit-event-type/plan.md) — zastąpienie `event.getClass().getSimpleName()` jawnym `switch` (obecny stan kodu). Wymagało najpierw dodania bramki CI (testy przed deployem) — bez tego zmiana nazwy klasy Javy mogłaby po cichu zerwać kontrakt frontend/backend. **Incydent**: pierwsza wersja CI bez `if: github.ref == 'refs/heads/main'` przypadkowo wdrożyła kod z brancha testowego na produkcję na Fly.io — naprawione dodaniem warunku brancha.
- [`context/changes/core-case-flow/research.md:304-320`](../core-case-flow/research.md) — lista "Wiążących decyzji architektonicznych (nie zmieniać)": NDJSON, `Flux<ServerSentEvent>` bez WebFlux, fetch zamiast EventSource, sealed records, LOCKED write-before-confirm, zoneless Angular + Signals, multipart limit 20MB, JWT subject jako `analystIdentity`.
- [`context/changes/red-flag-taxonomy/plan.md:35`](../red-flag-taxonomy/plan.md) — implementacja FR-007 jako enum `RedFlagCategory` (6 kategorii-kandydatów z PRD) jako **jawny placeholder**: "Nie implementujemy zamkniętego katalogu taksonomii banku — seed enum jest placeholderem." Ryzyko świadomie zaakceptowane dla MVP.
- [`context/changes/persist-extraction-state/frame.md:47-50`](../persist-extraction-state/frame.md) — rozróżnia dwa problemy: (1) potwierdzony regres — dane LOCKED case'ów nie są odczytywane z powrotem mimo że `AuditRecord.payload` je zawiera; (2) **nierozstrzygnięta kwestia produktowa** — czy stan pre-decyzyjny (ANALYZING/ANALYZED) powinien przetrwać odświeżenie strony (obecnie nie przetrwa, bo stan streamu jest tylko w pamięci backendu przez `AtomicReference`).
- [`context/changes/extraction-form-states/research.md:266-267,317`](../extraction-form-states/research.md) — nieprzetestowany white-spot: czy `doFinally()` backendu wywoła się poprawnie przy przerwaniu połączenia w trakcie streamu — zależne od konfiguracji Tomcat/Netty, niezweryfikowane w testach.
- [`context/changes/streaming-field-citations/change.md`](../streaming-field-citations/change.md) — bieżąca zmiana, na razie tylko notatka: "Każde pole pojawia się w czasie rzeczywistym z cytatem ze źródła" — brak wcześniejszego planu/researchu specyficznego dla tego change-id.

### PRD — dokładny tekst FR-005 do FR-008 (`context/foundation/prd.md:79-88`)

- **FR-005**: Senior KYB Analyst może wywołać analizę załączonego dokumentu jawną akcją "Analyze". Dopóki analityk nie wywoła analizy, case pokazuje potwierdzenie załączenia pliku (nazwa, liczba stron, rozmiar), ale żaden model nie został jeszcze wywołany. *Must-have.*
- **FR-006**: Senior KYB Analyst widzi wyekstrahowane encje (nazwa firmy, dyrektorzy, UBO) strumieniujące do ustrukturyzowanego formularza w czasie rzeczywistym w miarę postępu analizy, przy czym sam widok strumieniowy pełni funkcję wysokiej wierności wskaźnika postępu. *Must-have.*
- **FR-007**: Senior KYB Analyst widzi zidentyfikowane red flagi pojawiające się w ustrukturyzowanym formularzu **dopiero po** przetworzeniu pełnego kontekstu dokumentu (red flagi NIE są streamowane). Każda red flaga jest przypisana do predefiniowanej taksonomii ryzyka (patrz Open Questions — sama taksonomia jest nierozstrzygnięta). *Must-have.*
- **FR-008**: Każde wypełnione wyekstrahowane pole jest wyświetlane wraz z tablicą jednego lub więcej dosłownych cytatów-fragmentów ze źródłowego dokumentu (wspiera syntezę wielostronicową). Jeśli wartość pola wynika z braku dowodu, pole pokazuje jawny znacznik "Not Disclosed / Inferred Missing" zamiast pozostawać puste; taki znacznik jest sam w sobie prawidłowym wejściem do taksonomii red-flag z FR-007. *Must-have.*

**PRD Open Question 1** (`prd.md:145`): *"Jaka jest zamknięta taksonomia red-flag? — FR-007 wymaga, żeby każda flaga mapowała się na predefiniowaną kategorię (kandydaci: ekspozycja sankcyjna, wskaźniki spółki-wydmuszki, ryzyko jurysdykcyjne, nieprzejrzysta własność, powiązania PEP, ryzyko sektorowe). Bez tego model wymyśla kategorie i zaufanie analityka się załamuje. Owner: user. Block: yes."* — **wciąż nierozwiązane**; istniejący enum to placeholder z tymi samymi 6 kategoriami-kandydatami.

**PRD Open Question 3** (`prd.md:147`): czy bank-partner zaakceptuje wysyłanie treści dokumentów do zewnętrznego dostawcy modelu — właśnie to pytanie było uzasadnieniem dla wyboru Spring AI (elastyczność zmiany dostawcy) w `llm-streaming-backend/change.md:38`.

`tech-stack.md` **nie pinuje konkretnego SDK LLM** — tylko flaga `has_ai: true` we frontmatter; wybór faktycznego SDK został w całości delegowany do `research.md` zmiany `llm-streaming-backend`.

## Related Research

- `context/changes/llm-streaming-backend/research.md` i `plan.md` — pierwotna specyfikacja architektury SSE/NDJSON i wybór SDK
- `context/changes/extraction-sse-codec/research.md`, `plan.md` — refaktor kodeka SSE po stronie frontendu
- `context/changes/sse-explicit-event-type/research.md`, `plan.md` — zamiana `getClass().getSimpleName()` na jawny switch + bramka CI
- `context/changes/core-case-flow/research.md` — pełna lista wiążących decyzji architektonicznych
- `context/changes/red-flag-taxonomy/research.md`, `plan.md` — implementacja FR-007 jako placeholder enum
- `context/changes/persist-extraction-state/frame.md`, `research.md` — analiza trwałości stanu ekstrakcji
- `context/changes/extraction-form-states/research.md` — pełna rekonstrukcja maszyny stanów SSE i niezweryfikowane white-spoty

## Open Questions

1. **Zamknięta taksonomia red-flag banku (PRD Open Question 1)** — nadal nierozwiązana; wymaga danych od właściciela produktu/banku-partnera. Blokuje pełną zgodność z FR-007.
2. **Czy `doFinally()` backendu poprawnie się wywołuje przy przerwaniu połączenia w trakcie streamu** — niezweryfikowane w testach (`extraction-form-states/research.md`).
3. **Czy stan pre-decyzyjny (ANALYZING/ANALYZED) powinien przetrwać odświeżenie strony** — otwarta kwestia produktowa, nieobjęta żadnym Non-Goal w PRD (`persist-extraction-state/frame.md`).
4. **Czy `CLAUDE.md` powinien zostać zaktualizowany**, żeby usunąć nieaktualne stwierdzenia o niewpiętym SDK LLM, niewpiętej taksonomii red-flag i niewpiętym JPA/Postgres/Flyway — wszystkie trzy są już zaimplementowane.
5. ~~Czy planowana zmiana `streaming-field-citations` ma dodać coś nowego~~ — **rozstrzygnięte w follow-upie poniżej**: użytkownik chce animacji typewriter przy pojawianiu się wartości pól.

## Follow-up Research 2026-07-10T19:11:00+02:00

### Pytanie użytkownika

"Chodzi mi o poprawienie aplikacji żeby to wyglądało jak animacja na landingu pojawiania się tekstu jak na klawiaturze" — użytkownik chce, żeby wartości pól w panelu ekstrakcji pojawiały się z efektem "pisania na klawiaturze" (typewriter), wzorując się na landing page'u.

### Krytyczne odkrycie: to jest niemal dokładnie ta sama prośba, która była już zgłoszona i celowo NIE zaimplementowana wprost

Zarchiwizowana zmiana **`context/archive/2026-06-21-extraction-streaming-ux/`** (change_id: `extraction-streaming-ux`, status: `archived`, archived_at: `2026-06-21T18:23:16Z`) ma notatkę źródłową ([change.md:12](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/context/archive/2026-06-21-extraction-streaming-ux/change.md)) niemal identyczną do dzisiejszej prośby:

> "jak odpalam analize to powinna byc jakas animacja takiego pojawiania sie tekstu jak tekstu na klawiaturze, nie wiadomo co tam kliknac i jest puste pole"

Ta zmiana została **w pełni zaimplementowana i scommitowana** (`0d7f794`, oba fazy Progress w 100% odhaczone — `plan.md:206-226`), ale **plan świadomie odrzucił prawdziwy efekt typewriter znak-po-znaku**:

- `plan-brief.md:31` (tabela Key Decisions): *"Typewriter effect | fade-in 150ms + istniejący blink | Minimalna zmiana, **unika problemów CSS typewriter z flex-wrap**"*
- `plan.md:47` (What We're NOT Doing): *"Brak animacji typewriter znak-po-znaku dla wartości pól (wybrana opcja: fade-in + blink cursor)"*

Zamiast prawdziwego typewritera zaimplementowano: skeleton placeholder + shimmer (pusty stan), `rowAppear` fade-in+slide (350ms na cały wiersz przy pojawieniu się pola) i istniejący migający kursor (`@keyframes blink`, `steps(2)`, 1s cykl) — **to jest dokładnie to, co jest w kodzie dzisiaj** (potwierdzone bezpośrednim odczytem, patrz niżej). Innymi słowy: **to zadanie było już raz zrobione w duchu "wygląda jak landing page", ale nie w duchu "prawdziwe pisanie znak-po-znaku"**.

### Co faktycznie robi landing page — nie jest to prawdziwy typewriter

Pełny odczyt `landing.component.ts` (32 linie), `.html` (231 linii), `.scss` (140 linii, sekcje `.mf-cursor`/`.viz-cursor`) potwierdza: **landing page NIE ma nigdzie prawdziwego, znak-po-znaku odsłaniania tekstu**. Iluzja "AI pisze na żywo" to wyłącznie:

1. Statyczny, już-kompletny string w HTML — np. [`landing.component.html:64`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/features/landing/landing.component.html): `<div class="mf-val">82 King Street, Manchester<span class="mf-cursor"></span> <span class="mf-tag">● Streaming</span></div>` — cały adres jest zakodowany na sztywno.
2. Pusty `<span>` kursora obok tego tekstu, migający przez `@keyframes blink` ([`landing.component.scss:122`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/features/landing/landing.component.scss)): `0%,50% {opacity:1;} 51%,100% {opacity:0;}`, aplikowane jako `animation: blink 1s steps(2) infinite` na `.viz-cursor` (`.mf-cursor` w ogóle nie ma animacji — to statyczny prostokąt).
3. Żadnego `setInterval`/`setTimeout`, żadnego sygnału budującego podciąg, żadnej animacji CSS `steps()` z `width: 0→100%; overflow:hidden; white-space:nowrap` — czyli żadnej z dwóch standardowych technik prawdziwego typewritera.

`landing.component.ts:15-27` (`ngAfterViewInit`) zawiera tylko `IntersectionObserver` do fade-in przy scrollu (`.reveal`→`.in`) — nic związanego z tekstem.

### Stan obecny panelu ekstrakcji — identyczny wzorzec co landing, plus dodatki

Pełny odczyt `extraction-form.component.ts` (136 linii), `.html` (185 linii), `.scss` (sekcje 110-284 z 580) potwierdza obecność (aktualny kod, nie historia):

1. **Skeleton + shimmer** — `extraction-form.component.html:26-41`, `.scss:116-167` (`@keyframes shimmer`, gradient przesuwający się `background-position -200%→200%`, `1.5s linear infinite`).
2. **`rowAppear` fade+slide na cały wiersz** — `.scss:184-187` (`animation: rowAppear 350ms ease-out both` na `.field-row`), keyframes `.scss:261-264` (`opacity 0→1`, `translateY(-8px)→0`).
3. **Migający kursor** — identyczny mechanizm co landing: `.cursor` (`.scss:246-259`, `animation: blink 1s steps(2) infinite`, ten sam `@keyframes blink`). Renderowany w dwóch miejscach: `html:111` (pole bez wartości, w trakcie streamu — sam kursor, brak tekstu) i `html:125-128` (zaraz po już wyrenderowanej wartości, jako wskaźnik "wciąż streamuje").
4. **Wartość pola wstawiana jednym strzałem, nie znak-po-znaku** — `html:116-121`, zwykła interpolacja Angulara `{{ field.value }}`. Gdy przychodzi zdarzenie SSE `FieldExtracted`, `caseStore.appendField(event.field)` (`extraction-form.component.ts:121`) wrzuca **cały, już kompletny string** do sygnału w jednej atomowej operacji — nie ma pętli budującej podciąg, nie ma indeksu inkrementowanego przez `setInterval`, nie ma CSS `steps()`-reveal.

### Wniosek i napięcie do rozstrzygnięcia przed planowaniem

**Landing page i obecny panel ekstrakcji już używają identycznej iluzji** (statyczny tekst + migający kursor + fade-in wiersza) — więc w wąskim sensie "wygląda jak landing" **już jest spełnione**. Ale ewidentnie to nie to, o co chodzi użytkownikowi dzisiaj (skoro prosi ponownie) — najbardziej prawdopodobna interpretacja to: **wartość pola ma się faktycznie ujawniać znak-po-znaku** (prawdziwy typewriter), czego dziś nie ma nigdzie w aplikacji (ani na landing, ani w extraction-form) i co zostało **świadomie odrzucone przy poprzedniej próbie tego samego zadania** z powodu "problemów CSS typewriter z flex-wrap" — powód techniczny, który nie został opisany szczegółowo w żadnym z przeczytanych dokumentów (brak dalszej analizy w `plan.md`/`plan-brief.md` poza samym stwierdzeniem).

**Rozstrzygnięcie (użytkownik, 2026-07-10)**: chodzi o **prawdziwy typewriter znak-po-znaku** — wartość pola ma się faktycznie odsłaniać litera po literze, nie iluzja fade-in+cursor. To świadome obalenie decyzji z `extraction-streaming-ux/plan-brief.md:31`, więc plan tej zmiany musi:
1. Faktycznie rozwiązać problem "CSS typewriter z flex-wrap" wspomniany (ale nie rozwinięty) w poprzednim planie — najbardziej prawdopodobne podejście: JS/signal-driven substring reveal (np. `setInterval`/`requestAnimationFrame` budujący `displayedValue` sygnał per-pole, inkrementowany znak po znaku aż do `field.value.length`) zamiast czystego CSS `steps()`-width, który wymaga `white-space: nowrap` i faktycznie koliduje z zawijaniem długich wartości pól (np. adresów, nazw UBO wielosegmentowych) w gridzie `.field-row` (`grid-template-columns: 168px 1fr`).
2. Zdecydować, czy istniejący `rowAppear` (fade+slide całego wiersza) i `.cursor`/`@keyframes blink` zostają (jako komplementarne — kursor na końcu odsłanianego tekstu ma sens jako wskaźnik pozycji pisania) czy są zastępowane.
3. Rozważyć wydajność przy wielu polach streamujących jednocześnie/szybko po sobie (case KYB może mieć kilkanaście pól) — timer per-pole vs. jeden współdzielony `requestAnimationFrame` driver.
4. Rozważyć `prefers-reduced-motion` — poprzedni plan zostawił to jako nierozstrzygnięte ryzyko (`plan-brief.md:58`), realny znak-po-znaku reveal jest bardziej animacyjnie inwazyjny niż 350ms fade-in, więc to pytanie staje się bardziej istotne.
5. Zostać scope'owana z jawnym odniesieniem do `context/archive/2026-06-21-extraction-streaming-ux/` jako punktu wyjścia i listy wcześniej odrzuconych opcji, żeby plan świadomie obalał tamtą decyzję zamiast dryfować w tę samą ścianę bez wyjaśnienia.

### Code References (follow-up)

- `context/archive/2026-06-21-extraction-streaming-ux/change.md:12` — oryginalna notatka użytkownika, niemal identyczna do dzisiejszej prośby
- `context/archive/2026-06-21-extraction-streaming-ux/plan-brief.md:31` — decyzja "fade-in zamiast typewriter" i jej uzasadnienie (problemy CSS flex-wrap)
- `context/archive/2026-06-21-extraction-streaming-ux/plan.md:47` — explicit "What We're NOT Doing: brak animacji typewriter znak-po-znaku"
- `context/archive/2026-06-21-extraction-streaming-ux/plan.md:206-226` — Progress, w pełni zaimplementowane i scommitowane (`0d7f794`)
- [`web/src/app/features/landing/landing.component.html:64,142`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/features/landing/landing.component.html) — statyczne stringi + puste `<span>` kursora
- [`web/src/app/features/landing/landing.component.scss:59,90,122`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/features/landing/landing.component.scss) — `.mf-cursor` (statyczny, bez animacji), `.viz-cursor` (blink), `@keyframes blink`
- [`web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html:26-41,60-162,111,116-121,125-128`](https://github.com/dominikmodrzejewski99/clearkyc/blob/e91564dff18f3920abf7670f9212d689f2c9b229/web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html) — skeleton, pętla pól, kursor bez wartości, interpolacja wartości, kursor po wartości
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.scss:116-167,184-187,246-264` — shimmer, rowAppear, cursor/blink
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts:121` — `caseStore.appendField(event.field)`, wstawienie całego stringa jednym strzałem
