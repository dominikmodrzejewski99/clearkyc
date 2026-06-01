---
date: 2026-06-01T08:54:00+02:00
researcher: Claude Sonnet 4.6
git_commit: 132e9382f23004ce3db3ab83297812049306e173
branch: main
repository: 10xdevs
topic: "F-04 LLM Streaming Backend - architektura i integracja z istniejacym kodem"
tags: [research, f-04, spring-ai, sse, streaming, anthropic, extraction]
status: complete
last_updated: 2026-06-01
last_updated_by: Claude Sonnet 4.6
---

# Research: F-04 LLM Streaming Backend

**Date**: 2026-06-01T08:54:00+02:00
**Git Commit**: 132e9382f23004ce3db3ab83297812049306e173
**Branch**: main
**Repository**: 10xdevs

## Research Question

Jakie sa wymagania, punkty integracji i decyzje architektoniczne dla F-04 (LLM Streaming Backend) w kontekscie istniejacego kodu ClearKYC?

## Summary

F-04 jest gotowe do planowania. Wszystkie prerequisity sa ukonczone (F-01: auth, F-02: data layer). Codebase ma dojrzaly fundament: Spring Boot 4.0.6 + Spring MVC + OAuth2 Resource Server + Spring Data JPA. Spring AI 2.0 GA wyszlo 2026-05-28 i jest w pelni kompatybilne z Spring Boot 4.0.x.

Kluczowe ustalenia:
1. Endpoint SSE (`Flux<ServerSentEvent<ExtractionEvent>>`) dziala w Spring MVC 6 bez WebFlux - Spring AI przynosi `reactor-core` jako zaleznosc transitive.
2. `KybCase` nie ma pola PDF - F-04 przyjmuje PDF w `multipart/form-data` request, nie persystuje go. Persystencja PDF to S-01.
3. Statusy `ANALYZING` i `ANALYZED` sa juz zdefiniowane w `CaseStatus` enum - gotowe do uzycia.
4. Endpoint musi byc pod `/api/**` - `SecurityConfig` wymaga JWT dla tej przestrzeni.
5. Format zdarzen SSE musi byc zdefiniowany jako sealed Java 21 records z polami `fieldName`, `value`, `citations`.

---

## Detailed Findings

### 1. Stan aktualny pom.xml

**Plik**: `pom.xml`

Istniejace zaleznosci (bez wersji - BOM-managed):
- `spring-boot-starter-webmvc` - serwer Tomcat, Spring MVC
- `spring-boot-starter-security` + `spring-boot-starter-oauth2-resource-server` - JWT auth
- `spring-boot-starter-data-jpa` + `postgresql` + `spring-boot-starter-flyway` + `flyway-database-postgresql`
- `frontend-maven-plugin` - buduje Angular z `web/`
- Test: `spring-boot-starter-webmvc-test`, `spring-boot-starter-data-jpa-test`, `h2`, `spring-security-test`

**Czego brakuje dla F-04:**
```xml
<!-- W <dependencyManagement> -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-bom</artifactId>
    <version>2.0.0</version>
    <type>pom</type>
    <scope>import</scope>
</dependency>

<!-- W <dependencies> -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-model-anthropic</artifactId>
</dependency>
```

Spring AI BOM nie jest zarządzany przez Spring Boot BOM - musi byc importowany osobno. Nie dodajemy `spring-boot-starter-webflux` - nie jest potrzebny.

**Uwaga krytyczna**: Spring AI 2.0 GA wyszlo 2026-05-28 (3 dni przed ta sesja). Przed implementacja: `./mvnw dependency:resolve` i weryfikacja dostepnosci `2.0.0` w Maven Central. Backup: `2.0.0-RC1` z repo.spring.io/milestone.

### 2. SecurityConfig - ograniczenia dla SSE endpointu

**Plik**: `src/main/java/com/example/clearkyc/config/SecurityConfig.java:23-34`

```java
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/actuator/health").permitAll()
    .requestMatchers("/api/**").authenticated()   // <-- SSE musi byc tutaj
    .anyRequest().permitAll()
)
```

**Implikacje dla F-04:**
- Endpoint `/api/cases/{caseId}/analysis` jest pod `/api/**` - wymaga JWT automatycznie.
- Metody CORS: `["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]` - POST dla SSE trigger jest juz dozwolony.
- `allowedHeaders("*")` - Authorization header przechodzi.
- `allowCredentials(true)` - sesje cookie sa dozwolone (nie uzywane, ale nie blokuje).
- CORS origin default: `http://localhost:1999` (Angular dev server).

**Lekcja z F-01 plan.md:48**: "Kazdy przyszly endpoint wymagajacy uwierzytelnienia MUSI byc zarejestrowany pod `/api/**` - inaczej bedzie domyslnie publiczny".

**SSE + JWT w przegladarce**: natywny `EventSource` API nie obsluguje custom headers (nie moze wyslac `Authorization: Bearer ...`). Angular klient (S-01 concern) bedzie musial uzyc `fetch` API z ReadableStream zamiast `EventSource`. Backend Spring Security nie wymaga zadnych zmian - standardowy Bearer token auth dziala niezaleznie od tego czy klient uzywa EventSource czy fetch.

### 3. KybCase entity - analiza luk

**Plik**: `src/main/java/com/example/clearkyc/domain/KybCase.java`

**Dostepne pola:**
- `id: UUID` - identyfikator case
- `status: CaseStatus` - `CREATED | ANALYZING | ANALYZED | LOCKED`
- `createdAt, updatedAt, lockedAt: Instant`

**Czego brakuje:**
- Pole `pdfData: byte[]` lub `pdfPath: String` - nie istnieje.

**Decyzja dla F-04**: PDF przyjmowany w ciele zadania HTTP (`multipart/form-data`), nie persystowany w bazie. Nie wymaga V2 Flyway migration. S-01 zdecyduje o strategii przechowywania (BYTEA w DB / Fly.io Volumes / externa Object Storage).

**Status transitions dla F-04:**
```
CREATED -> ANALYZING  (trigger analysis)
ANALYZING -> ANALYZED (streaming complete)
ANALYZING -> ANALYZED + error event (streaming failed)
```

`KybCase.setStatus()` jest publiczna (`public void setStatus(CaseStatus status)`) - gotowe do uzycia przez `ExtractionService`.

**V2 Flyway migration**: F-04 NIE wymaga. Zmiany: tylko nowe kolumny w F-04 bylyby PDF storage - odlozone do S-01.

**Testowanie F-04 z JPA**: `@WebMvcTest` z `@MockitoBean KybCaseRepository` - nie potrzeba bazy. `@DataJpaTest` lub Testcontainers dla S-01 (wzorzec z F-02 impl-review F2).

### 4. Konwencje pakietow i testow

**Istniejaca struktura**:
```
com.example.clearkyc/
  config/           - SecurityConfig.java
  domain/           - KybCase, AuditRecord, CaseStatus, DecisionType
  repository/       - KybCaseRepository, AuditRecordRepository
  web/              - SpaController.java
```

**Proponowana nowa struktura dla F-04**:
```
com.example.clearkyc/
  analysis/         - [NEW]
    ExtractionController.java   - REST controller: POST /api/cases/{id}/analysis
    ExtractionService.java      - service: orchestruje wywolanie LLM
    ExtractionEvent.java        - sealed record hierarchy dla zdarzen SSE
    Citation.java               - value record: quote + page
    ExtractionResult.java       - record dla BeanOutputConverter (wynik LLM)
```

**Wzorzec testow** (z `SecurityConfigTest.java:17-45`):
```java
@WebMvcTest(ExtractionController.class)
@Import(SecurityConfig.class)
class ExtractionControllerTest {

    @Autowired MockMvc mockMvc;
    @MockitoBean JwtDecoder jwtDecoder;          // @MockitoBean (SB4 API, nie @MockBean)
    @MockitoBean ExtractionService extractionService;

    @Test
    void triggerAnalysis_withoutJwt_returns401() throws Exception {
        mockMvc.perform(multipart("/api/cases/{caseId}/analysis", UUID.randomUUID())
            .file("file", "pdf content".getBytes()))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void triggerAnalysis_withJwt_returnsEventStream() throws Exception {
        var caseId = UUID.randomUUID();
        when(extractionService.streamAnalysis(eq(caseId), any()))
            .thenReturn(Flux.just(ServerSentEvent.builder(
                new ExtractionEvent.AnalysisComplete(caseId.toString())).build()));

        mockMvc.perform(multipart("/api/cases/{caseId}/analysis", caseId)
            .file("file", "pdf content".getBytes())
            .with(jwt()))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type",
                containsString("text/event-stream")));
    }
}
```

**Lekcja z F-02 impl-review**: uzyj `@MockitoBean` (nie `@MockBean`) - Spring Boot 4.x deprecuje stara wersje.

### 5. Spring AI streaming w Spring MVC (bez WebFlux)

**Kluczowy fakt**: Spring MVC 6 (w Spring Boot 4) obsluguje `Flux<ServerSentEvent<T>>` jako typ zwracany z kontrolera. Spring MVC uzywa `ReactiveAdapterRegistry` do subskrypcji Fluxa asynchronicznie. Spring AI przynosi `reactor-core` jako zaleznosc transitive - WebFlux NIE jest potrzebny.

**Wzorzec kontrolera**:
```java
@PostMapping(
    value = "/api/cases/{caseId}/analysis",
    produces = MediaType.TEXT_EVENT_STREAM_VALUE,
    consumes = MediaType.MULTIPART_FORM_DATA_VALUE
)
public Flux<ServerSentEvent<ExtractionEvent>> streamAnalysis(
        @PathVariable UUID caseId,
        @RequestPart("file") MultipartFile pdfFile,
        JwtAuthenticationToken authentication) {

    return extractionService.streamAnalysis(caseId, pdfFile, authentication.getName());
}
```

`JwtAuthenticationToken authentication` - Spring Security wstrzykuje automatycznie z kontekstu gdy endpoint jest pod `/api/**`.

**Wzorzec serwisu**:
```java
public Flux<ServerSentEvent<ExtractionEvent>> streamAnalysis(
        UUID caseId, MultipartFile pdfFile, String analystIdentity) {

    return Flux.defer(() -> {
        KybCase kybCase = caseRepository.findById(caseId)
            .orElseThrow(() -> new ResponseStatusException(NOT_FOUND));
        kybCase.setStatus(CaseStatus.ANALYZING);
        caseRepository.save(kybCase);

        byte[] pdfBytes = pdfFile.getBytes();
        Resource pdfResource = new ByteArrayResource(pdfBytes) {
            @Override public String getFilename() { return pdfFile.getOriginalFilename(); }
        };

        UserMessage userMessage = UserMessage.builder()
            .text(EXTRACTION_PROMPT + outputConverter.getFormat())
            .media(List.of(new Media(new MimeType("application", "pdf"), pdfResource)))
            .build();

        return chatModel.stream(new Prompt(
                List.of(new SystemMessage(SYSTEM_PROMPT), userMessage),
                AnthropicChatOptions.builder()
                    .model("claude-sonnet-4-6")
                    .maxTokens(8192)
                    .build()))
            .map(response -> response.getResult().getOutput().getText())
            .collectList()
            .flatMapMany(tokens -> {
                String fullContent = String.join("", tokens);
                ExtractionResult result = outputConverter.convert(fullContent);
                return Flux.fromIterable(buildEvents(result, caseId));
            })
            .doOnComplete(() -> {
                kybCase.setStatus(CaseStatus.ANALYZED);
                caseRepository.save(kybCase);
            })
            .map(event -> ServerSentEvent.builder(event).build());
    });
}
```

**Wzorzec PDF (z spring-ai-reference.md)**:
```java
var pdfResource = new ByteArrayResource(pdfBytes) {
    @Override public String getFilename() { return originalFilename; }
};
UserMessage.builder()
    .text("Extract entities...")
    .media(List.of(new Media(new MimeType("application", "pdf"), pdfResource)))
    .build();
```

### 6. Format zdarzen ExtractionEvent (Java 21 sealed records)

Sealed hierarchy zamknieta na trzy typy zdarzen - zadne inne typy nie moga byc emitowane:

```java
// com.example.clearkyc.analysis.ExtractionEvent
public sealed interface ExtractionEvent
        permits ExtractionEvent.FieldExtracted,
                ExtractionEvent.AnalysisComplete,
                ExtractionEvent.AnalysisError {

    record FieldExtracted(
        String fieldName,          // np. "companyName", "directors[0].name"
        String value,              // wyekstrahowana wartosc lub "Not Disclosed / Inferred Missing"
        List<Citation> citations   // co najmniej jeden element (lub pusta lista przy "Not Disclosed")
    ) implements ExtractionEvent {}

    record AnalysisComplete(String caseId) implements ExtractionEvent {}

    record AnalysisError(String errorCode, String message) implements ExtractionEvent {}
}
```

```java
// com.example.clearkyc.analysis.Citation
public record Citation(
    String quote,      // verbatim fragment tekstu zrodlowego (FR-008)
    int pageNumber     // numer strony (dla click-to-cite FR-014 w S-01)
) {}
```

**Record dla BeanOutputConverter**:
```java
record ExtractionResult(
    ExtractedField companyName,
    List<ExtractedDirector> directors,
    List<ExtractedUbo> ubos
) {
    record ExtractedField(String value, List<String> citations) {}
    record ExtractedDirector(String name, List<String> citations) {}
    record ExtractedUbo(String name, String ownershipPercentage, List<String> citations) {}
}
```

**Uwaga**: BeanOutputConverter generuje JSON Schema z record i wstrzykuje `{format}` instrukcje do promptu. Claude zwraca JSON zgodny ze schema.

### 7. Konfiguracja application.properties

**Do dodania** w `src/main/resources/application.properties`:
```properties
spring.ai.anthropic.api-key=${ANTHROPIC_API_KEY}
spring.ai.anthropic.chat.options.model=claude-sonnet-4-6
spring.ai.anthropic.chat.options.max-tokens=8192
spring.servlet.multipart.max-file-size=20MB
spring.servlet.multipart.max-request-size=25MB
```

**Do dodania** w `src/main/resources/application-dev.properties` (gitignored):
```properties
ANTHROPIC_API_KEY=your-api-key-here
```

**Do dodania** w `src/main/resources/application-dev.properties.example`:
```properties
ANTHROPIC_API_KEY=your-anthropic-api-key
```

**Do dodania** w `src/test/resources/application.properties` - wylaczenie Spring AI auto-config:
```properties
spring.ai.anthropic.api-key=test-key
spring.autoconfigure.exclude=org.springframework.ai.autoconfigure.anthropic.AnthropicAutoConfiguration
```

Alternatywa dla testow: `@MockitoBean ChatModel chatModel` w klasie testowej - pomija auto-config bez wylaczania globalnego.

**Multipart limit**: Spring Boot default to 1MB. 50-stronicowy PDF moze miec 5-15MB. Nalezy ustawic wyzszy limit.

### 8. NFR 5s pierwsze pole - analiza wykonalnosci

**PRD NFR**: pierwsze wyekstrahowane pole widoczne w ciagu 5s od triggera na 50-stronicowym PDF.

**Latencja Anthropic API**: typowo 1-3s do pierwszego tokenu (TTFT - time to first token) dla Claude Sonnet.

**Wyzwanie F-04 foundation**: aktualny wzorzec (akumuluj wszystkie tokeny, parsuj JSON, emituj zdarzenia) sprawia ze uzytkownik czeka na CALY czas odpowiedzi (~30-60s dla 50 stron) zanim zobaczyl pierwsze zdarzenie. To NIE spelnia NFR 5s.

**Rozwiazanie dla planu F-04**: uzyc inkrementalnego strumieniowania:
1. LLM generuje JSON - tokeny strumienia sa parsowane inkrementalnie
2. Gdy pole `companyName` zostanie zamkniete w strumieniu JSON → emit `FieldExtracted("companyName", ...)`
3. Pierwsze pole powinno pojawic sie w ~3-5s od startu (Claude zaczyna od najlatwiejszych pol)

**Narzedzie**: Jackson `MappingIterator` lub `Flux<String>` z inkrementalnym parserem JSON (np. `jackson-dataformat-streaming`). Alternatywa: ustrukturyzowac prompt tak by Claude emitowal zdarzenia linia po linii (`one JSON object per line`) zamiast jednego wielkiego JSON bloku.

**Rekomendacja dla planu F-04**: zastosowac podejscie "newline-delimited JSON" (NDJSON):
- System prompt instruuje Claude: "emit one JSON object per field, one per line, as you discover each entity"
- Serwer parsuje kazda linie jako osobne zdarzenie (`Flux<String>` split po `\n` → `Flux<ExtractionEvent>`)
- To spelnia NFR 5s bez inkrementalnego parsera JSON

### 9. Bezpieczenstwo i CORS dla SSE

**Istniejaca konfiguracja CORS** (`SecurityConfig.java:38-52`) obsluguje SSE bez zmian:
- `allowedMethods` zawiera `GET` i `POST`
- `allowedHeaders("*")` - przepuszcza `Authorization`
- `allowedOrigins` czytane z `ALLOWED_ORIGINS` env var (default `http://localhost:1999`)

**Angular fetch pattern** (S-01 concern - tu tylko odnotowac):
```typescript
// AuthService z @auth0/auth0-angular jest juz skonfigurowany w F-01
// Angular HTTP interceptor dodaje Bearer token do wszystkich /api/** requestow
// fetch z ArrayBuffer dla streamu:
const response = await this.http.post(
  `/api/cases/${caseId}/analysis`,
  formData,
  { responseType: 'text', observe: 'events' } // lub fetch API
).toPromise();
```

**Nie wymaga zmian w F-04 backend.**

### 10. Wymagania Flyway V2

F-04 **nie wymaga** V2 migracji. Uzasadnienie:
- PDF nie jest persystowany w DB w F-04
- Statusy `ANALYZING` i `ANALYZED` juz istnieja w tabeli `kyb_case` (CHECK constraint w V1 obsluguje wszystkie wartosci `CaseStatus`)
- Zmiany tylko w: `pom.xml`, `application.properties`, nowe klasy Java

---

## Code References

- `pom.xml` - brakuje spring-ai-bom + spring-ai-starter-model-anthropic
- `src/main/java/com/example/clearkyc/config/SecurityConfig.java:28-32` - routing SSE pod /api/**
- `src/main/java/com/example/clearkyc/domain/KybCase.java:18-22` - CaseStatus + brak pola PDF
- `src/main/java/com/example/clearkyc/domain/CaseStatus.java:3` - ANALYZING + ANALYZED gotowe
- `src/main/resources/application.properties` - brak spring.ai.*, brak multipart limits
- `src/main/resources/db/migration/V1__create_case_and_audit_tables.sql:4` - CHECK constraint na status (wszystkie wartosci juz sa)
- `src/test/java/com/example/clearkyc/security/SecurityConfigTest.java:17-44` - wzorzec testow do replikacji
- `context/changes/llm-streaming-backend/spring-ai-reference.md` - kompletna dokumentacja Spring AI 2.0 API

---

## Architecture Insights

### Spring MVC + Flux bez WebFlux

Spring Boot 4 z `spring-boot-starter-webmvc` obsluguje `Flux<ServerSentEvent<T>>` jako return type kontrolera przez `ReactiveAdapterRegistry`. Spring AI 2.0 przynosi `reactor-core` transitive. Nie potrzeba dodawac `spring-boot-starter-webflux`. Tomcat (nie Netty) pozostaje serwerem. To zachowuje spojnosc stosu.

### Sealed records jako format zdarzen

Java 21 sealed interface dla `ExtractionEvent` jest idiomatycznym wyborem dla zamknietego zbioru typow zdarzen. Pattern matching switch (`instanceof ExtractionEvent.FieldExtracted fe -> ...`) zapewnia bezpieczenstwo typow po stronie klienta (Angular TypeScript) i serwera.

### NDJSON vs jednoczesne streamowanie JSON

Podejscie NDJSON (jedna linia JSON = jedno zdarzenie) zamiast jednego duzego JSON bloku pozwala:
1. Spelnic NFR 5s (pierwsze pole widoczne jak tylko Claude je wygeneruje)
2. Uniknac inkrementalnego parsera JSON (zlozonos implementacji)
3. Zachowac prostote testow (mockowanie Flux.just(event1, event2))

Wadą: wymaga odpowiednio skonstruowanego systemu promptu.

### Brak V2 migracji = mniejsze ryzyko

F-04 bez V2 migracji Flyway jest bezpieczniejszy. `spring.jpa.hibernate.ddl-auto=validate` (z F-02) zablokuje start jesli schemat nie zgadza sie z encjami. Skoro nie dodajemy pol do encji, walidacja przejdzie bez zmian.

---

## Historical Context (from prior changes)

- `context/changes/auth-scaffold/plan.md:50-51` - krytyczna lekcja: nowe endpointy MUSZĄ byc pod `/api/**`; wzorzec `@WebMvcTest` z `@MockitoBean JwtDecoder`
- `context/changes/data-layer/plan.md:46-47` - Flyway + H2 w testach: `MODE=PostgreSQL` + `DATABASE_TO_LOWER=TRUE`
- `context/changes/data-layer/reviews/impl-review.md:21-24` - uzywac `@MockitoBean` (SB4) nie `@MockBean`; fallback porty w `application.properties` musza zgadzac sie z docker-compose.yml
- `context/changes/llm-streaming-backend/change.md` - decyzja SDK: Spring AI 2.0 + Anthropic starter
- `context/changes/llm-streaming-backend/spring-ai-reference.md` - pełna dokumentacja Spring AI 2.0 API fetched z Context7

---

## Open Questions

1. **Maven Central dostepnosc Spring AI 2.0.0**: GA wyszlo 2026-05-28. Nalezy zweryfikowac `./mvnw dependency:resolve` przed startem implementacji. Backup: `2.0.0-RC1` z `repo.spring.io/milestone`.

2. **NDJSON vs akumulacja + batch emit**: Decyzja o podejsciu strumieniowania JSON wplywa na projekt systemu promptu i parser po stronie serwera. NDJSON jest prostszy do implementacji i spelnia NFR 5s; akumulacja jest latwiejsza w testowaniu ale NIE spelnia NFR.

3. **Multipart upload limit**: Domyslny Spring Boot 1MB jest za maly dla 50-stronicowych PDF. Wartosc 20MB powinna wystarczyc, ale nalezy potwierdzic ograniczenia Fly.io (czytaj: `fly.toml` timeout settings dla długich requestow).

4. **Prompt engineering dla KYB extraction**: Jalosé promptu wplywa na kompletnosc cytowań i poprawnosc ekstrakcji. F-04 dostarcza szkielet; prompt bedzie wymagal iteracyjnego dopracowania po uruchomieniu z prawdziwymi PDF-ami.

5. **Testcontainers vs H2 dla testow E2E F-04**: `@WebMvcTest` z `@MockitoBean` jest wystarczajace dla F-04 foundation. Testy integracyjne z prawdziwym Anthropic API sa opcjonalne i kosztowne (czas + pieniadze). Mozna dodac jeden `@SpringBootTest` z `@EnabledIfEnvironmentVariable(named = "ANTHROPIC_API_KEY")`.

6. **Locking pod concurrent requests**: Co jesli analyst wyzwoli analize dwa razy na tym samym case? Nalezy sprawdzic status `ANALYZING` na wejsciu i zwrocic 409 Conflict jesli case jest juz w trakcie analizy.
