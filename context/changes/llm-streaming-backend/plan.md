# LLM Streaming Backend (F-04) — Plan Implementacji

## Overview

Implementacja endpointu SSE `POST /api/cases/{caseId}/analysis`, który przyjmuje PDF jako `multipart/form-data`, wywołuje Claude via Spring AI 2.0 i strumieniuje wyekstrahowane encje KYB (nazwa firmy, dyrektorzy, UBO) z cytowaniami do klienta Angular. Fundament dla S-01. Używa podejścia NDJSON (jedno pole = jedna linia JSON), co spełnia NFR 5s (pierwsze pole widoczne w ~3-5s).

## Current State Analysis

- `pom.xml`: Spring Boot 4.0.6 + Spring MVC + OAuth2 Resource Server + Spring Data JPA. Brak Spring AI BOM i startera Anthropic.
- `SecurityConfig.java`: `/api/**` wymaga JWT — endpoint analizy trafia tutaj automatycznie. CORS skonfigurowany dla `localhost:1999`.
- `KybCase.java`: pola `status` (`CREATED | ANALYZING | ANALYZED | LOCKED`) gotowe do użycia. Brak pola PDF — PDF przyjmowany w request body, nie persystowany w F-04.
- `CaseStatus.java`: enum z `ANALYZING` i `ANALYZED` — bez zmian schematu (V1 SQL CHECK obejmuje już wszystkie wartości).
- Brak `context/foundation/lessons.md` — brak wcześniejszych reguł projektowych do uwzględnienia.
- Testy: wzorzec `@WebMvcTest` + `@MockitoBean JwtDecoder` ustalony w F-01.

## Desired End State

`./mvnw verify` przechodzi. Endpoint `POST /api/cases/{caseId}/analysis` z JWT i PDF multipart:
- zwraca `200 text/event-stream` z sekwencją `FieldExtracted` + `AnalysisComplete` SSE events
- zwraca `401` bez JWT, `404` jeśli case nie istnieje, `409` jeśli case nie w stanie CREATED
- case przechodzi `CREATED → ANALYZING → ANALYZED`
- `@SpringBootTest` z `@EnabledIfEnvironmentVariable(named = "ANTHROPIC_API_KEY")` przechodzi z prawdziwym kluczem i realnym PDF

### Key Discoveries

- `src/main/java/com/example/clearkyc/domain/CaseStatus.java:3` — enum z ANALYZING i ANALYZED gotowy; V1 SQL CHECK obejmuje je — zero migracji Flyway
- `src/main/java/com/example/clearkyc/config/SecurityConfig.java:28-32` — `/api/**` authenticated; CORS allowedMethods zawiera POST; brak zmian
- `src/test/java/com/example/clearkyc/security/SecurityConfigTest.java:17` — wzorzec: `@WebMvcTest` + `@Import(SecurityConfig.class)` + `@MockitoBean JwtDecoder` + `.with(jwt())`
- `context/changes/data-layer/reviews/impl-review.md:21` — używać `@MockitoBean` (SB4), nie `@MockBean`
- Spring AI 2.0 przynosi `reactor-core` transitively — `Flux<ServerSentEvent<T>>` w Spring MVC bez WebFlux
- Spring AI `AnthropicAutoConfiguration` wymaga ważnego klucza API — test properties muszą wyłączyć autoconfigurację i dostarczyć `@MockitoBean ChatModel` w `ClearkycApplicationTests`

## What We're NOT Doing

- Persystencja PDF w bazie danych (BYTEA / S3 / Fly.io Volumes) — S-01
- Walidacja formatu pliku (PDF magic bytes, korupcja) — S-01
- Re-analiza już przeanalizowanych cases (ANALYZED → CREATING nowego case) — S-01
- Angular klient SSE / UI split-panel — S-01 (F-03 already done)
- Prompt engineering iteration — iteracyjna po F-04; prompt w F-04 to szkielet
- Flyway V2 migration — brak nowych kolumn w F-04
- Testcontainers — H2 + @MockitoBean wystarczają dla F-04; Testcontainers w S-01

## Implementation Approach

Trzy sekwencyjne fazy z weryfikacją po każdej:

1. **Faza 1** (tylko konfiguracja, zero nowego kodu Java): dodanie Spring AI BOM i Anthropic startera, konfiguracja properties, adaptacja testów do obecności Spring AI na classpath. Bramka: `./mvnw test` zielony (9 testów).

2. **Faza 2** (model domenowy + serwis): `ExtractionEvent` (sealed records), `Citation`, `ExtractionService` z NDJSON streaming, logiką stanu i obsługą błędów. Bramka: kompilacja + 9 testów zielonych (serwis nie ma własnych unit testów — weryfikowany przez Fazę 3).

3. **Faza 3** (kontroler + testy): `ExtractionController`, `ExtractionControllerTest` (@WebMvcTest dla 5 scenariuszy), opcjonalny `ExtractionLiveTest` (@SpringBootTest + @EnabledIfEnvironmentVariable). Bramka: `./mvnw verify` zielony.

## Critical Implementation Details

**NDJSON line scanning w Reactor**: Claude emituje tokeny po kilka znaków. Linie JSON nie kończą się na granicy tokenu. Serwis musi akumulować tokeny w buforze i emitować kompletne linie gdy `\n` zostanie wykryte. Wzorzec z `AtomicReference<StringBuilder>` + `flatMap` jest poprawny dla Spring MVC (Reactor subscribe jest single-threaded tutaj):

```java
AtomicReference<StringBuilder> buf = new AtomicReference<>(new StringBuilder());
return tokenFlux
    .flatMapIterable(token -> {
        buf.get().append(token);
        String s = buf.get().toString();
        int nl = s.lastIndexOf('\n');
        if (nl < 0) return List.of();
        List<String> lines = Arrays.asList(s.substring(0, nl).split("\n"));
        buf.set(new StringBuilder(s.substring(nl + 1)));
        return lines.stream().filter(l -> !l.isBlank()).toList();
    });
```

**doFinally dla statusu końcowego**: `kybCase.setStatus(ANALYZED); caseRepository.save(kybCase)` w `doFinally` (nie `doOnComplete`) — `doFinally` gwarantuje wykonanie zarówno przy normalnym zakończeniu jak i błędzie. `save()` Spring Data JPA jest `@Transactional` wewnętrznie — wywołanie z wątku Reactora jest bezpieczne.

**SSE event type jako discriminator**: używać `.event(event.getClass().getSimpleName())` w `ServerSentEvent.builder()`. Angular klient (S-01) może używać tego pola do typowania zdarzenia bez parsowania `data` — `event: FieldExtracted` vs `event: AnalysisComplete`.

**Spring AI autoconfiguration w testach**: `AnthropicAutoConfiguration` tworzy `AnthropicChatModel` bean, który wymaga ważnego klucza API (Anthropic SDK waliduje prefix). W testach: wykluczyć autoconfigurację w `src/test/resources/application.properties` i dostarczyć `@MockitoBean ChatModel` w `ClearkycApplicationTests` (żeby `ExtractionService` mógł być wstrzyknięty w pełnym kontekście).

---

## Phase 1: Maven Dependencies + Configuration

### Overview

Dodanie Spring AI 2.0 BOM i Anthropic startera do `pom.xml`, konfiguracja kluczy API i limitów multipart w properties, adaptacja testów. Zero nowych klas Java. Bramka: istniejące 9 testów przechodzi.

### Changes Required

#### 1. Spring AI BOM + Anthropic starter

**File**: `pom.xml`

**Intent**: Dodać Spring AI Bill of Materials do `<dependencyManagement>` i Anthropic starter do `<dependencies>`. Spring AI BOM nie jest zarządzany przez Spring Boot BOM — wymaga osobnego importu.

**Contract**: W `<dependencyManagement>`, dodać import `org.springframework.ai:spring-ai-bom:2.0.0-M8` (type `pom`, scope `import`). W `<dependencies>` dodać `org.springframework.ai:spring-ai-starter-model-google-genai` bez wersji (zarządzana przez BOM). Nie dodawać `spring-boot-starter-webflux` — nie jest potrzebny. **Adaptacja**: użyto Google GenAI (klucz AI Studio) zamiast Anthropic; BOM 2.0.0-M8 (GA 2.0.0 niedostępne w Maven Central na dzień implementacji).

#### 2. Spring AI API key + multipart limits

**File**: `src/main/resources/application.properties`

**Intent**: Dodać klucze konfiguracyjne Spring AI (model, limit tokenów, klucz API z env var) oraz zwiększyć limity multipart Spring MVC — domyślne 1MB jest za małe dla 50-stronicowych PDF.

**Contract**: Dołączyć poniższe klucze (po istniejących wpisach datasource). **Adaptacja**: Google GenAI zamiast Anthropic:
```properties
spring.ai.google.genai.api-key=${GOOGLE_GENAI_API_KEY}
spring.ai.google.genai.chat.model=gemini-2.5-pro
spring.servlet.multipart.max-file-size=20MB
spring.servlet.multipart.max-request-size=25MB
```

#### 3. Klucz API w profilu dev

**File**: `src/main/resources/application-dev.properties` (gitignored, istniejący)

**Intent**: Udostępnić klucz Anthropic API w lokalnym profilu dev bez commitowania go do repo.

**Contract**: Dołączyć linię `GOOGLE_GENAI_API_KEY=<twój-klucz-ai-studio>` (wartość: klucz z Google AI Studio).

#### 4. Przykładowy klucz w szablonie

**File**: `src/main/resources/application-dev.properties.example` (istniejący szablon)

**Intent**: Zaktualizować szablon dev properties tak, by deweloper wiedział, że potrzebuje klucza Anthropic.

**Contract**: Dołączyć linię `GOOGLE_GENAI_API_KEY=your-google-ai-studio-api-key-here`.

#### 5. Wyłączenie Spring AI autoconfiguration w testach

**File**: `src/test/resources/application.properties`

**Intent**: Zapobiec próbie inicjalizacji `AnthropicChatModel` w testach (Anthropic SDK waliduje klucz — `test-key` nie przejdzie walidacji formatu). Testy klas usług używają `@MockitoBean ChatModel`.

**Contract**: Dołączyć klucze. **Adaptacja**: klasa wykluczenia zmieniona na Google GenAI:
```properties
spring.ai.google.genai.api-key=test-key
spring.autoconfigure.exclude=org.springframework.ai.model.google.genai.autoconfigure.chat.GoogleGenAiChatAutoConfiguration
```

#### 6. @MockitoBean ChatModel w teście kontekstu

**File**: `src/test/java/com/example/clearkyc/ClearkycApplicationTests.java`

**Intent**: `@SpringBootTest` ładuje pełny kontekst — po Fazie 2 będzie w nim `ExtractionService` wymagający `ChatModel`. Bez beanów Spring AI (wykluczone w pkt. 5) kontekst nie wystartuje. `@MockitoBean ChatModel` dostarcza mock bean.

**Contract**: Dodać jedno pole w klasie: `@MockitoBean private ChatModel chatModel;`. Nie modyfikować testu `contextLoads()`.

### Success Criteria

#### Automated Verification

- Spring AI BOM 2.0.0 dostępny: `./mvnw dependency:resolve -Dincludes=org.springframework.ai:spring-ai-bom` (brak błędu `not found`). Jeśli `2.0.0` niedostępny — zmienić wersję na `2.0.0-RC1` i dodać repo milestone do `pom.xml`
- Kompilacja: `./mvnw compile` — zero błędów
- Testy: `./mvnw test` — wszystkie 9 testów zielone (SecurityConfigTest x3 + contextLoads + KybCaseRepositoryTest x3 + AuditRecordRepositoryTest x2)

#### Manual Verification

- `./mvnw spring-boot:run -Dspring.profiles.active=dev` startuje bez błędu Spring AI (dopiero po dodaniu prawdziwego klucza w `application-dev.properties`)

**Implementation Note**: Po przejściu Automated Verification tej fazy — potwierdź przed przejściem do Fazy 2.

---

## Phase 2: ExtractionEvent + Citation + ExtractionService

### Overview

Definicja modelu zdarzeń SSE jako Java 21 sealed records oraz implementacja `ExtractionService` z NDJSON parsowaniem, wywoływaniem Spring AI, zarządzaniem stanem case i obsługą błędów.

### Changes Required

#### 1. ExtractionEvent — sealed hierarchy zdarzeń SSE

**File**: `src/main/java/com/example/clearkyc/analysis/ExtractionEvent.java` (nowy plik)

**Intent**: Zamknięty zbiór typów zdarzeń SSE emitowanych przez serwer do Angular SPA. Sealed interface gwarantuje że kontrakt API jest wyczerpujący — żaden inny typ zdarzenia nie może być emitowany.

**Contract**: Interfejs `ExtractionEvent` w pakiecie `com.example.clearkyc.analysis`, `public sealed interface` z `permits`:
- `FieldExtracted(String fieldName, String value, List<Citation> citations)` — wyekstrahowane pole z cytowaniami; `value` może być `"Not Disclosed / Inferred Missing"` per FR-008
- `AnalysisComplete(String caseId)` — kończy strumień w happy path
- `AnalysisError(String errorCode, String message)` — kończy strumień w error path; po nim brak kolejnych zdarzeń

Każdy rekord implementuje `ExtractionEvent`. Rekordy są `public` (Spring Jackson musi je serializować). Importy z `java.util.List`.

#### 2. Citation — wartościowy rekord cytowania

**File**: `src/main/java/com/example/clearkyc/analysis/Citation.java` (nowy plik)

**Intent**: Reprezentacja pojedynczego cytowania źródłowego dla pola ekstrakcji. `pageNumber` jest best-effort (Claude może nie zwrócić dokładnych numerów stron z binarnego PDF; wartość `0` = nieznany).

**Contract**: `public record Citation(String quote, int pageNumber)` w `com.example.clearkyc.analysis`. Bez adnotacji Jackson — domyślna serializacja rekordów Java jest wystarczająca.

#### 3. ExtractionService — serwis ekstrakcji

**File**: `src/main/java/com/example/clearkyc/analysis/ExtractionService.java` (nowy plik)

**Intent**: Serwis Spring zarządzający wywołaniem LLM, parsowaniem NDJSON, tranzycjami stanu case i obsługą błędów. Zwraca `Flux<ServerSentEvent<ExtractionEvent>>` — Spring MVC subskrybuje Flux asynchronicznie przez ReactiveAdapterRegistry.

**Contract**: Klasa `@Service ExtractionService` w `com.example.clearkyc.analysis`. Konstruktor przyjmuje: `ChatModel chatModel`, `KybCaseRepository caseRepository`, `ObjectMapper objectMapper` (wszystkie Spring-managed beans).

Metoda publiczna: `streamAnalysis(UUID caseId, MultipartFile pdfFile, String analystIdentity): Flux<ServerSentEvent<ExtractionEvent>>`

Logika wewnątrz `Flux.defer()` (lazy — nie wykonuje się do subskrypcji):

1. **Walidacja i tranzycja**: `caseRepository.findById(caseId)` — jeśli brak: `Flux.error(ResponseStatusException(NOT_FOUND))`; jeśli status != CREATED: `Flux.error(ResponseStatusException(CONFLICT, "Case must be in CREATED state"))`; ustaw status ANALYZING i zapisz.

2. **Wywołanie LLM**: zbuduj `UserMessage` z PDFem jako `Media(new MimeType("application","pdf"), new ByteArrayResource(pdfFile.getBytes()) { getFilename() → pdfFile.getOriginalFilename() })` i tekstem promptu ekstrakcji. Zbuduj `Prompt` z listą `[new SystemMessage(SYSTEM_PROMPT), userMessage]`. Wywołaj `chatModel.stream(prompt)` — zwraca `Flux<ChatResponse>`.

3. **NDJSON parsing**: z `Flux<ChatResponse>` wyciągnij tokeny przez `mapNotNull(r -> r.getResult().getOutput().getText())`. Akumuluj tokeny za pomocą wzorca ze sekcji Critical Implementation Details. Każdą kompletną (zakończoną `\n`) linię JSON parsuj przez `objectMapper.readValue(line, ExtractionEvent.FieldExtracted.class)`. Linie, których nie udało się sparsować (malformed) — pomiń (loguj WARN).

4. **Terminalne zdarzenia i status**: po wszystkich `FieldExtracted` evenach — `concatWith(Flux.just(new AnalysisComplete(caseId.toString())))`. Błędy z LLM lub parsowania — `onErrorResume(e -> Flux.just(new AnalysisError("EXTRACTION_ERROR", e.getMessage())))`. Status ANALYZED — `doFinally(s -> { kybCase.setStatus(ANALYZED); caseRepository.save(kybCase); })`.

5. **SSE wrapping**: `map(event -> ServerSentEvent.<ExtractionEvent>builder().event(event.getClass().getSimpleName()).data(event).build())`.

Stałe prywatne w klasie:

`SYSTEM_PROMPT` — instrukcja dla Claude:
```
You are a KYB (Know Your Business) analyst assistant.
Extract structured entities from the PDF document provided.

Emit one JSON line per extracted field, immediately when found (do not wait for full document):
{"fieldName":"<name>","value":"<value>","citations":[{"quote":"<verbatim text>","pageNumber":<n>}]}

Fields to extract:
- "companyName": registered name of the company
- "directors[0].name", "directors[1].name", ...: full names of directors/board members
- "ubos[0].name", "ubos[0].ownershipPercentage", "ubos[1].name", ...: ultimate beneficial owners

If a field cannot be found: {"fieldName":"<name>","value":"Not Disclosed / Inferred Missing","citations":[]}

Rules:
- Emit exactly one JSON object per line. Use only \\n as separator.
- Do not emit markdown, code blocks, or any text outside of JSON lines.
- "quote" must be verbatim text from the document (copy-paste, not paraphrase).
- "pageNumber" is best-effort (0 if unknown).
```

### Success Criteria

#### Automated Verification

- Kompilacja: `./mvnw compile` — zero błędów
- Testy: `./mvnw test` — wszystkie 9 testów zielone (kontekst ładuje się z nowym ExtractionService)

#### Manual Verification

- IDE: brak błędów importu w nowych klasach (`jakarta.persistence`, `org.springframework.ai`, `reactor.core`)
- Spring Boot devtools: `./mvnw spring-boot:run -Dspring.profiles.active=dev` restartuje bez błędów po dodaniu Fazy 2 klas

**Implementation Note**: Po przejściu Automated Verification tej fazy — potwierdź przed przejściem do Fazy 3.

---

## Phase 3: ExtractionController + Tests

### Overview

Implementacja kontrolera REST eksponującego endpoint SSE i komplet testów: 5 scenariuszy @WebMvcTest + opcjonalny test z prawdziwym Anthropic API.

### Changes Required

#### 1. ExtractionController — REST endpoint SSE

**File**: `src/main/java/com/example/clearkyc/analysis/ExtractionController.java` (nowy plik)

**Intent**: Cienki adapter HTTP → serwis. Przyjmuje multipart PDF + JWT, deleguje do `ExtractionService`. Nie zawiera logiki biznesowej.

**Contract**: `@RestController` w `com.example.clearkyc.analysis`. Konstruktor przyjmuje `ExtractionService extractionService` (wstrzykiwany przez Springa).

Metoda publiczna:
```
@PostMapping(
    value = "/api/cases/{caseId}/analysis",
    produces = MediaType.TEXT_EVENT_STREAM_VALUE,
    consumes = MediaType.MULTIPART_FORM_DATA_VALUE
)
public Flux<ServerSentEvent<ExtractionEvent>> streamAnalysis(
    @PathVariable UUID caseId,
    @RequestPart("file") MultipartFile pdfFile,
    JwtAuthenticationToken authentication)
```

Ciało metody: `return extractionService.streamAnalysis(caseId, pdfFile, authentication.getName())`. Bez `try-catch` — Spring MVC + `ResponseStatusException` z serwisu mapują na właściwe kody HTTP.

#### 2. ExtractionControllerTest — testy @WebMvcTest

**File**: `src/test/java/com/example/clearkyc/analysis/ExtractionControllerTest.java` (nowy plik)

**Intent**: Weryfikacja reguł bezpieczeństwa i ścieżek HTTP bez zależności od bazy ani LLM.

**Contract**: Klasa `@WebMvcTest(ExtractionController.class)` + `@Import(SecurityConfig.class)`. Pola: `@Autowired MockMvc mockMvc`, `@MockitoBean JwtDecoder jwtDecoder`, `@MockitoBean ExtractionService extractionService`.

Pięć testów (wzorzec z `SecurityConfigTest.java`):

1. `triggerAnalysis_withoutJwt_returns401` — `multipart("/api/cases/{id}/analysis", uuid).file("file", bytes)` bez `.with(jwt())` → `status().isUnauthorized()`

2. `triggerAnalysis_withJwt_validCase_returnsOkWithEventStream` — mock `extractionService.streamAnalysis(eq(caseId), any(), any())` zwraca `Flux.just(ServerSentEvent.builder(new ExtractionEvent.AnalysisComplete(id)).build())`; request `.with(jwt())` → `status().isOk()` + `header().string("Content-Type", containsString("text/event-stream"))`

3. `triggerAnalysis_withJwt_caseNotFound_returns404` — mock serwisu rzuca `new ResponseStatusException(NOT_FOUND)` → `status().isNotFound()`

4. `triggerAnalysis_withJwt_caseAlreadyAnalyzing_returns409` — mock serwisu rzuca `new ResponseStatusException(CONFLICT)` → `status().isConflict()`

5. `triggerAnalysis_withJwt_caseIsLocked_returns409` — jak wyżej, inny caseId, ten sam mock

#### 3. ExtractionLiveTest — opcjonalny test z prawdziwym LLM

**File**: `src/test/java/com/example/clearkyc/analysis/ExtractionLiveTest.java` (nowy plik)

**Intent**: Weryfikacja że Spring AI + Anthropic naprawdę strumieniują zdarzenia z realnego PDF. Odpala się tylko gdy `ANTHROPIC_API_KEY` jest ustawiony w środowisku — nie blokuje CI.

**Contract**: Klasa `@SpringBootTest(webEnvironment = RANDOM_PORT)` + `@EnabledIfEnvironmentVariable(named = "ANTHROPIC_API_KEY")`. Jeden test: wczytaj małą próbkę PDF z `classpath:/test-sample.pdf` (plik do dodania: kilku-stronicowy PDF testowy, nie zawierający danych osobowych), wykonaj `POST /api/cases/{id}/analysis` przez `WebTestClient` z JWT-mock lub bez security (aktywować profil `test-no-security`). Zweryfikuj że stream zawiera co najmniej jedno `event: FieldExtracted` zdarzenie w ciągu 10s.

**Uwaga implementacyjna**: `test-sample.pdf` to publiczny dokument (np. wyciąg z rejestr publicznego). Jeśli trudny do pobrania — zastąpić testem który tworzy PDF programatycznie (biblioteka `iText` lub PDFBox) lub pominąć ten test w F-04 i dodać w S-01.

### Success Criteria

#### Automated Verification

- Kompilacja: `./mvnw compile`
- Testy: `./mvnw test` — wszystkie testy zielone (9 istniejących + 5 nowych @WebMvcTest)
- Build: `./mvnw verify` — compile + test + package

#### Manual Verification

- `./mvnw spring-boot:run -Dspring.profiles.active=dev` — aplikacja startuje
- `curl` test lokalny z prawdziwym JWT i PDF: `curl -X POST http://localhost:8081/api/cases/{caseId}/analysis -H "Authorization: Bearer <jwt>" -F "file=@test.pdf"` — strumieniuje zdarzenia SSE (wymaga utworzonego case w DB i prawdziwego klucza Anthropic)
- Opcjonalny live test: `ANTHROPIC_API_KEY=sk-ant-... ./mvnw test -Dtest=ExtractionLiveTest` — przechodzi zielony

**Implementation Note**: Po przejściu wszystkich Automated Verification — commit, push, zamknięcie F-04.

---

## Testing Strategy

### Unit / Integration Tests (@WebMvcTest)

- `ExtractionControllerTest` — 5 scenariuszy: auth (401), success (200 + SSE), 404, 409x2
- Wzorzec: `@MockitoBean ExtractionService` izoluje kontroler od Spring AI i JPA
- Nie testujemy logiki NDJSON w @WebMvcTest (to odpowiedzialność serwisu)

### Optional Live Tests (@SpringBootTest + @EnabledIfEnvironmentVariable)

- `ExtractionLiveTest` — weryfikacja end-to-end z prawdziwym Claude API
- Odpalany manualnie przez dewelopera przed F-04 PR, nie w CI

### Manual Testing Steps

1. Utwórz case w DB: `psql` INSERT lub POST API (S-01 dostarczy endpoint; tymczasowo można przez psql)
2. Zdobądź JWT z Auth0 dev tenant (devtools lub curl do /oauth/token)
3. `curl -X POST http://localhost:8081/api/cases/{uuid}/analysis -H "Authorization: Bearer {jwt}" -F "file=@sample.pdf" --no-buffer`
4. Obserwuj strumieniowanie zdarzeń SSE: `event: FieldExtracted`, `data: {"fieldName":...}`, ..., `event: AnalysisComplete`
5. Sprawdź status case w DB: `SELECT status FROM kyb_case WHERE id = '{uuid}'` — powinno być `ANALYZED`

## References

- Roadmap: `context/foundation/roadmap.md` (F-04)
- PRD: `context/foundation/prd.md` (FR-005, FR-006, FR-008; NFR 5s)
- Research: `context/changes/llm-streaming-backend/research.md`
- Spring AI docs: `context/changes/llm-streaming-backend/spring-ai-reference.md`
- Prior auth test pattern: `context/changes/auth-scaffold/plan.md`
- Prior @MockitoBean lesson: `context/changes/data-layer/reviews/impl-review.md`

---

## Progress

> Konwencja: `- [ ]` oczekujące, `- [x]` zrobione. Dołącz ` — <commit sha>` gdy krok jest committed.

### Phase 1: Maven Dependencies + Configuration

#### Automated

- [x] 1.1 `./mvnw dependency:resolve -Dincludes=org.springframework.ai:spring-ai-bom` — wersja 2.0.0 dostępna (lub fallback na RC1 z milestone repo) — a706315
- [x] 1.2 `./mvnw compile` — zero błędów po dodaniu spring-ai-starter-model-anthropic — a706315
- [x] 1.3 `./mvnw test` — 9 testów zielonych (Spring AI wyłączone w testach przez autoconfigure.exclude + @MockitoBean ChatModel) — a706315

#### Manual

- [x] 1.4 `./mvnw spring-boot:run -Dspring.profiles.active=dev` startuje bez błędu Spring AI autoconfiguration — a706315

### Phase 2: ExtractionEvent + Citation + ExtractionService

#### Automated

- [x] 2.1 `./mvnw compile` — zero błędów dla nowych klas Analysis — 62e36a7
- [x] 2.2 `./mvnw test` — 9 testów zielonych (contextLoads z ExtractionService w kontekście) — 62e36a7

#### Manual

- [x] 2.3 IDE: brak błędów importu w `ExtractionEvent.java`, `Citation.java`, `ExtractionService.java` — 62e36a7

### Phase 3: ExtractionController + Tests

#### Automated

- [x] 3.1 `./mvnw compile` — 54bfb80
- [x] 3.2 `./mvnw test` — wszystkie testy zielone (9 istniejących + 5 ExtractionControllerTest) — 54bfb80
- [x] 3.3 `./mvnw verify` — compile + test + package — 54bfb80

#### Manual

- [ ] 3.4 Lokalny `curl` test: `POST /api/cases/{id}/analysis` z JWT i PDF → strumieniuje `FieldExtracted` + `AnalysisComplete`
- [ ] 3.5 Status case po analizie: `SELECT status FROM kyb_case WHERE id = '...'` → `ANALYZED`
- [ ] 3.6 (Opcjonalny) `ANTHROPIC_API_KEY=... ./mvnw test -Dtest=ExtractionLiveTest` → zielony
