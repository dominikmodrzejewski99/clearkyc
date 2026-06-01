---
source: context7 (Spring AI 2.0-SNAPSHOT docs)
fetched: 2026-06-01
library_id: /websites/spring_io_spring-ai_reference_2_0-snapshot
---

# Spring AI 2.0 - Reference dla F-04

## 1. Maven - BOM i zaleznosci

```xml
<!-- W <dependencyManagement> -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-bom</artifactId>
    <version>2.0.0</version>
    <type>pom</type>
    <scope>import</scope>
</dependency>

<!-- W <dependencies> - starter Anthropic -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-model-anthropic</artifactId>
</dependency>
```

## 2. Konfiguracja application.properties

```properties
spring.ai.anthropic.api-key=${ANTHROPIC_API_KEY}
spring.ai.anthropic.chat.options.model=claude-sonnet-4-6
spring.ai.anthropic.chat.options.max-tokens=4096
spring.ai.anthropic.chat.options.temperature=0.2
```

Pelna lista wlasciwosci pod prefiksem `spring.ai.anthropic.*`:
- `api-key`, `base-url`, `timeout`, `max-retries`
- `chat.options.model`, `chat.options.max-tokens`, `chat.options.temperature`
- opcje cache'owania i thinking (Anthropic-specific)

## 3. SSE streaming w Spring MVC (bez WebFlux)

`chatModel.stream(Prompt)` zwraca `Flux<ChatResponse>`. Kontroler Spring MVC 6 moze
bezposrednio zwracac `Flux<ServerSentEvent<T>>` - Spring MVC robi bridging wewnetrznie.

```java
@RestController
public class ExtractionController {

    private final ChatClient chatClient;

    public ExtractionController(ChatClient.Builder builder) {
        this.chatClient = builder.build();
    }

    // Zwraca Flux<ChatResponse> - Spring MVC strumieniuje jako SSE
    @GetMapping(value = "/ai/generateStream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ChatResponse> generateStream(
            @RequestParam String message) {
        Prompt prompt = new Prompt(new UserMessage(message));
        return chatModel.stream(prompt);
    }
}
```

Lub przez ChatClient (wyzsza abstrakcja):

```java
@GetMapping(value = "/cases/{id}/analysis", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<String> streamAnalysis(@PathVariable String id) {
    return chatClient.prompt()
        .system("...")
        .user(u -> u.text("Analyze: {input}").param("input", ...))
        .stream()
        .content();
}
```

## 4. Wejscie PDF (multimodal)

Anthropic Claude 3.5+ obsluguje `application/pdf`. Zalacznik przez `Media`:

```java
var pdfResource = new ClassPathResource("/document.pdf");
// lub: new FileSystemResource(path), lub: new ByteArrayResource(bytes)

var userMessage = UserMessage.builder()
    .text("Extract company name, directors, UBOs with verbatim citations.")
    .media(List.of(new Media(new MimeType("application", "pdf"), pdfResource)))
    .build();

// Streaming z PDF
Flux<ChatResponse> stream = chatModel.stream(new Prompt(List.of(userMessage)));

// Lub synchronicznie
ChatResponse response = chatModel.call(new Prompt(List.of(userMessage)));
```

## 5. Opcje Anthropic-specific

```java
AnthropicChatOptions options = AnthropicChatOptions.builder()
    .model("claude-sonnet-4-6")
    .temperature(0.2)
    .maxTokens(4096)
    .topK(40)  // Anthropic-specific
    // .thinking(AnthropicApi.ThinkingType.ENABLED, 1000)  // extended thinking
    .build();

chatClient.prompt("...")
    .options(options)
    .call()
    .content();
```

## 6. System prompt + user message (wzorzec dla ekstrakcji KYB)

```java
chatClient.prompt()
    .system("""
        You are a KYB analyst assistant. Extract structured entities from the
        provided PDF document. Return JSON with citations.
        """)
    .user(u -> u
        .text("Extract all entities from this document. {format}")
        .param("format", outputConverter.getFormat())
        .media(new MimeType("application", "pdf"), pdfResource))
    .stream()
    .content();
```

## 7. Structured output - BeanOutputConverter (do formatu zdarzen)

Dla ustrukturyzowanego JSON z LLM (po zakonczeniu strumienia lub per-field):

```java
record ExtractionResult(
    String companyName,
    List<Director> directors,
    List<Ubo> ubos
) {}

var converter = new BeanOutputConverter<>(ExtractionResult.class);

Flux<String> flux = chatClient.prompt()
    .user(u -> u
        .text("Extract entities. {format}")
        .param("format", converter.getFormat()))
    .stream()
    .content();

// Agregacja po zakonczeniu strumienia
String fullContent = flux.collectList().block()
    .stream().collect(Collectors.joining());

ExtractionResult result = converter.convert(fullContent);
```

## 8. Auto-konfiguracja - bez migracji

Jezeli projekt uzywa `ChatClient` z auto-konfiguracja Spring Boota, nie wymaga migracji.
`spring-ai-starter-model-anthropic` automatycznie wstrzykuje `AnthropicChatModel`
jako bean `ChatModel` i `ChatClient.Builder`.

```java
@Autowired
ChatClient.Builder builder;
// lub
@Autowired
ChatModel chatModel;
```

## Zrodla

- https://docs.spring.io/spring-ai/reference/2.0-SNAPSHOT/getting-started.html
- https://docs.spring.io/spring-ai/reference/2.0-SNAPSHOT/api/chat/anthropic-chat.html
- https://docs.spring.io/spring-ai/reference/2.0-SNAPSHOT/api/chat/anthropic-migration.html
- https://docs.spring.io/spring-ai/reference/2.0-SNAPSHOT/api/chatclient.html
