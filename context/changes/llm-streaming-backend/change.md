---
change_id: llm-streaming-backend
roadmap_id: F-04
status: implemented
created: 2026-06-01
updated: 2026-06-01
implemented: 2026-06-01
---

# F-04: LLM Streaming Backend

**Outcome:** endpoint SSE strumieniuje zdarzenia ekstrakcji w ustrukturyzowanym formacie; klient Anthropic podlaczony i wywolujacy model z pelnym dokumentem PDF; format zdarzenia strumieniowego zdefiniowany.

**PRD refs:** FR-005, FR-006, FR-008

**Unlocks:** S-01, S-03

**Prerequisites:** F-02

## Decyzja: SDK LLM

**Wybor: Spring AI 2.0 + `spring-ai-starter-model-anthropic`**

Zbadane opcje (web_search_exa, 2026-06-01):

| Opcja | Status | Spring Boot 4 | Uwagi |
|---|---|---|---|
| Spring AI 2.0 + Anthropic starter | GA od 2026-05-28 | natywny (2.x branch) | **rekomendowany** |
| LangChain4j 1.13.x-boot4 | beta (`1.13.0-beta23`) | modul `-boot4` (merged kwiecien 2026) | wymaga WebFlux do SSE |
| Anthropic Java SDK bezposrednio | stable 1.3.0 | framework-agnostic | brak auto-konfiguracji, wysoki boilerplate |

**Uzasadnienie wyboru Spring AI 2.0:**

1. Spring AI 2.x jest budowany na Spring Boot 4.x jako baseline - projekt jest juz na 4.0.6, zero migracji.
2. Najbardziej idiomatyczne: `ChatModel` / `ChatClient` jako beany Spring, konfiguracja przez `application.properties`.
3. PDF first-class: modul Anthropic przepisany na oficjalnym `com.anthropic:anthropic-java` SDK (od M3); przesylanie PDF przez `Media(new MimeType("application","pdf"), resource)`.
4. SSE bez WebFlux: `ChatModel.stream(Prompt)` zwraca `Flux<ChatResponse>`; kontroler Spring MVC 6 moze bezposrednio zwracac `Flux<ServerSentEvent<T>>` - framework robi bridging bez dodawania WebFlux do stacku.
5. Wymiana providera: jesli bank zablokuje zewnetrzny Anthropic (Open Question 3 z roadmapy), zmiana na Azure OpenAI = swap startera + properties, bez przepisywania kodu serwisowego.

## Zaleznosci Maven

W `<dependencyManagement>`:

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-bom</artifactId>
    <version>2.0.0</version>
    <type>pom</type>
    <scope>import</scope>
</dependency>
```

W `<dependencies>`:

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-model-anthropic</artifactId>
</dependency>
```

W `application.properties`:

```properties
spring.ai.anthropic.api-key=${ANTHROPIC_API_KEY}
spring.ai.anthropic.chat.options.model=claude-sonnet-4-6
```

## Uwaga wdrozeniowa

Spring AI 2.0 GA wyszlo 2026-05-28 (3 dni przed ta sesja). Przed dodaniem zaleznosci uruchomic `./mvnw dependency:resolve` i potwierdzic dostepnosc wersji `2.0.0` w Maven Central. Jesli jeszcze nie trafila do Central - tymczasowo uzyc `2.0.0-RC1` z repozytorium Spring milestone i zaktualizowac gdy GA bedzie dostepne.

## Powiazane zrodla

- Spring AI 2.0 Anthropic docs: https://docs.spring.io/spring-ai/reference/api/chat/anthropic-chat.html
- Spring AI 2.0 migration note (Anthropic module): https://docs.spring.io/spring-ai/reference/2.0/api/chat/anthropic-migration.html
- LangChain4j Spring Boot 4 PR: https://github.com/langchain4j/langchain4j-spring/pull/175
- Anthropic Java SDK (bezposrednio): https://platform.claude.com/docs/en/api/sdks/java
