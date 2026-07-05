---
title: ClearKYC — Anti-Corruption Layer: Spring AI
created: 2026-06-24
type: refactor-plan
source-distillation: context/domain/01-domain-distillation.md
---

# ClearKYC — Plan ACL dla Spring AI w warstwie ekstrakcji

## KROK 0 — Kontekst

**Stack:** Spring Boot 4 + Java 21 + Angular SPA. Logika biznesowa żyje w:
- `src/.../analysis/` — ekstrakcja LLM (tu jest problem)
- `src/.../domain/` — encje JPA, enumy, typy domenowe
- `src/.../service/` — serwisy aplikacyjne
- `src/.../web/` — kontrolery + DTO

**Klucz z dokumentów:** CLAUDE.md (projekt) cytuje explicite:

> *"LLM client SDK choice — not pinned in pom.xml. PRD calls for streaming extraction (FR-005–008) but the specific SDK (Anthropic, OpenAI via Spring AI, LangChain4j, etc.) hasn't been selected. Confirm with the owner before adding the dependency."*
> — `CLAUDE.md:sekcja "What's actually in the repo right now"`

Ta deklaracja oznacza: SDK LLM miał być wymienny. Kod tej wymienialności nie realizuje.

**Manifest zależności zewnętrznych (kluczowe dla tej analizy):**

| Zależność | Pakiet | Warstwy gdzie żyje (przed refaktorem) |
|---|---|---|
| Spring AI | `org.springframework.ai.*` | `analysis/ExtractionService.java` (serwis) |
| Jackson 3 | `tools.jackson.*` | `analysis/ExtractionService.java` (serwis) |
| Jackson 2 | `com.fasterxml.jackson.*` | `service/FinalizeService.java` (serwis, tech debt) |
| Auth0 Angular | `@auth0/auth0-angular` | `auth.guard.ts`, `extraction-stream.service.ts`, `app.config.ts` |
| Project Reactor | `reactor.core.publisher.Flux` | `analysis/ExtractionService.java`, `analysis/ExtractionController.java` |

---

## KROK 1 — Przeciekające zależności (kompletna lista)

### Kandydat A: Spring AI (`org.springframework.ai.*`)

Wszystkie pliki, które dziś "znają" Spring AI:

```
analysis/ExtractionService.java:9    import org.springframework.ai.chat.messages.SystemMessage;
analysis/ExtractionService.java:10   import org.springframework.ai.chat.messages.UserMessage;
analysis/ExtractionService.java:11   import org.springframework.ai.chat.model.ChatModel;
analysis/ExtractionService.java:12   import org.springframework.ai.chat.prompt.Prompt;
analysis/ExtractionService.java:13   import org.springframework.ai.content.Media;
analysis/ExtractionService.java:67   private final ChatModel chatModel;
analysis/ExtractionService.java:71   public ExtractionService(ChatModel chatModel, ...)
analysis/ExtractionService.java:98   Media pdfMedia = Media.builder()...
analysis/ExtractionService.java:103  UserMessage userMessage = UserMessage.builder()...
analysis/ExtractionService.java:108  SystemMessage systemMessage = new SystemMessage(SYSTEM_PROMPT);
analysis/ExtractionService.java:109  Prompt prompt = new Prompt(List.of(systemMessage, userMessage));
analysis/ExtractionService.java:115  chatModel.stream(prompt)
```

Tandem z tym przeciekiem: **system prompt** (wiedza domenowa co i jak ekstrahoać) jest zakopany wewnątrz `ExtractionService.java:37-65` razem z wywołaniem SDK. Są to dwa odrębne kontraty (co — domena, jak — adapter) w jednym pliku.

Dodatkowy przeciek w tej samej warstwie — **Jackson 3** jako narzędzie parsowania odpowiedzi LLM:

```
analysis/ExtractionService.java:6    import tools.jackson.databind.json.JsonMapper;
analysis/ExtractionService.java:69   private final JsonMapper jsonMapper;
analysis/ExtractionService.java:133  jsonMapper.readValue(line, RedFlagItem.class);
analysis/ExtractionService.java:137  jsonMapper.readValue(line, ExtractionEvent.FieldExtracted.class);
```

### Kandydat B: Auth0 Angular (`@auth0/auth0-angular`) — frontend

Wszystkie pliki, które "znają" Auth0:

```
web/src/app/core/guards/auth.guard.ts:3         import { AuthService } from '@auth0/auth0-angular'
web/src/app/core/guards/auth.guard.ts:11        inject(AuthService)
web/src/app/core/services/extraction-stream.service.ts:3   import { AuthService } from '@auth0/auth0-angular'
web/src/app/core/services/extraction-stream.service.ts:10  inject(AuthService, { optional: true })
web/src/app/core/services/extraction-stream.service.ts:20  auth.getAccessTokenSilently()
web/src/app/app.config.ts:8    import { authHttpInterceptorFn, provideAuth0 } from '@auth0/auth0-angular'
web/src/app/app.config.ts:24-29  provideAuth0({...})
web/src/environments/environment.ts:4-5   auth0: { domain, clientId, audience }
web/src/environments/environment.prod.ts:4  auth0: { ... }
```

### Kandydat C: Jackson split (tech debt)

```
analysis/ExtractionService.java:6    tools.jackson (Jackson 3) — parsing LLM NDJSON
service/FinalizeService.java:10-12   com.fasterxml.jackson (Jackson 2) — JSON Schema validation
service/FinalizeService.java:37-38   TODO komentarz: "networknt incompatible with Jackson 3.x"
```

---

## KROK 2 — Klasyfikacja i wybór #1

| Kandydat | (a) Warstwy / pliki | (b) Koszt wymiany dziś | (c) Deklaracja wymienialności w dok. | Wynik |
|---|---|---|---|---|
| **A: Spring AI** | 1 plik, ale miesza 3 odpowiedzialności: state management + SDK calls + NDJSON parsing | **Wysoki** — cały `ExtractionService` wymaga przepisania | **TAK** — CLAUDE.md wprost: "SDK hasn't been selected, confirm before adding" | **#1** |
| B: Auth0 Angular | 5 plików (guard + service + config + 2x env) | Średni — wymiana IdP to zmiana w kilku miejscach | TAK — prd.md:73 "configuration-only upgrade path to enterprise SSO" | #2 |
| C: Jackson split | 2 pliki serwisowe | Niski — już dokumentowany jako TODO | NIE — nie pojawia się w wymaganiach | #3 |

### Wybór: Kandydat A — Spring AI

**Uzasadnienie:** Rozjazd intencja-vs-kod jest najsilniejszy: CLAUDE.md deklaruje SDK LLM jako _niewybrany i wymagający potwierdzenia_, a kod ma go wbudowanego bezpośrednio w serwis aplikacyjny bez żadnej abstrakcji. Wymiana na Anthropic SDK, LangChain4j lub inny provider wymaga dziś przepisania `ExtractionService` — serwisu który zarządza też stanem sprawy (`kybCase.setStatus(ANALYZING/ANALYZED/CREATED)`). To dwie niezależne odpowiedzialności splecione razem. Jednocześnie system prompt (wiedza domenowa o tym CO i W JAKIM FORMACIE LLM ma zwracać) jest zakopany w tym samym pliku co API calls — każda zmiana formatu NDJSON wymaga rozumienia Spring AI API.

---

## KROK 3 — Diagnoza

### Trzy odpowiedzialności w jednym pliku

`ExtractionService.java` pełni dziś trzy role:

**Rola 1: Zarządzanie stanem KybCase** (odpowiedzialność aplikacyjna):
```
ExtractionService.java:79-96   findById, sprawdzenie statusu, setStatus(ANALYZING), save
ExtractionService.java:154-157  doFinally: setStatus(CREATED lub ANALYZED), save
```

**Rola 2: Wywołanie LLM przez Spring AI** (odpowiedzialność adaptera):
```
ExtractionService.java:98-115   Media.builder(), UserMessage.builder(),
                                  SystemMessage, Prompt, chatModel.stream(prompt)
```

**Rola 3: Parsowanie NDJSON odpowiedzi LLM i dyspozycja zdarzeń** (odpowiedzialność adaptera):
```
ExtractionService.java:115-148  flatMapIterable token→lines, mapNotNull line→ExtractionEvent,
                                  jsonMapper.readValue, accumulatedFlags, concatWith
```

**System prompt (wiedza domenowa) osadzony w adapterze:**
```
ExtractionService.java:37-65   private static final String SYSTEM_PROMPT = """
    You are a KYB analyst assistant...
    Fields to extract: companyName, directors[n].name, ubos[n]...
    If not found: "Not Disclosed / Inferred Missing"
    ...Red flag categories: SANCTIONS_EXPOSURE, SHELL_COMPANY_INDICATORS...
    """
```

System prompt zawiera dwie rzeczy: (1) kontrakt domenowy (nazwy pól, marker NDI, kategorie red flag) i (2) instrukcje formatowania NDJSON — to drugie jest odpowiedzialnością adaptera.

### Przeciek do ExtractionController

```
analysis/ExtractionController.java:4    import org.springframework.http.codec.ServerSentEvent;
analysis/ExtractionController.java:12   import reactor.core.publisher.Flux;
analysis/ExtractionController.java:30   public Flux<ServerSentEvent<ExtractionEvent>> streamAnalysis(...)
```

`ExtractionController` zwraca `Flux<ServerSentEvent<...>>` — to typowy Spring WebFlux/Reactor pattern. Po refaktorze kontroler nadal będzie używał Reactor (jest to webowa warstwa HTTP), ale zależność od Spring AI pozostaje tylko w adapterze.

### Groźność przecieku

Wymiana Spring AI na Anthropic SDK (natywny) wymaga dziś:
- Przepisania całego `ExtractionService.java` (wszystkie 3 role)
- Zmiany `pom.xml` (dependency swap)
- Potencjalnie zmiany `ExtractionController` jeśli nowy SDK ma inny model strumieniowania

**Nie ma możliwości zamiany LLM providera bez ruszania logiki zarządzania stanem sprawy.**

---

## KROK 4 — Projekt ACL

### 4.1 Port domenowy: `DocumentAnalysisPort`

Interfejs domenowy — jedyna rzecz którą `ExtractionService` zna o LLM.

```java
// Nowy plik: src/.../analysis/DocumentAnalysisPort.java
// package: com.example.clearkyc.analysis

public interface DocumentAnalysisPort {
    /**
     * Analizuje dokument PDF i zwraca strumień zdarzeń ekstrakcji.
     * Implementacja jest odpowiedzialna za wywołanie LLM, parsowanie odpowiedzi
     * i mapowanie na typy domenowe ExtractionEvent.
     *
     * @param pdfBytes  surowe bajty PDF
     * @return  Flux<ExtractionEvent> kończący się AnalysisComplete lub AnalysisError
     */
    Flux<ExtractionEvent> analyze(byte[] pdfBytes);
}
```

Typowy zwrot: `ExtractionEvent.FieldExtracted` (streamowane), `ExtractionEvent.RedFlagsFound` (na końcu), `ExtractionEvent.AnalysisComplete` (terminacja).

**Kluczowa decyzja:** port zwraca `ExtractionEvent` (typ domenowy — `analysis/ExtractionEvent.java`) — adapter musi mapować odpowiedź LLM na ten typ. Port NIE zwraca typów Spring AI ani surowego JSON.

### 4.2 Adapter: `SpringAiDocumentAnalysisAdapter`

Jedyne miejsce w kodzie które "zna" Spring AI. Przechowuje: import SDK, system prompt (format NDJSON), logikę parsowania.

```java
// Nowy plik: src/.../infrastructure/analysis/SpringAiDocumentAnalysisAdapter.java
// package: com.example.clearkyc.infrastructure.analysis

// WSZYSTKIE importy Spring AI trafiają TYLKO tutaj:
// import org.springframework.ai.chat.messages.SystemMessage;
// import org.springframework.ai.chat.messages.UserMessage;
// import org.springframework.ai.chat.model.ChatModel;
// import org.springframework.ai.chat.prompt.Prompt;
// import org.springframework.ai.content.Media;
// import tools.jackson.databind.json.JsonMapper;

@Component
public class SpringAiDocumentAnalysisAdapter implements DocumentAnalysisPort {

    // System prompt jako stała prywatna — tu należy, nie w ExtractionService
    private static final String SYSTEM_PROMPT = """
        You are a KYB analyst assistant.
        [cała treść systemu prompt z ExtractionService.java:37-65]
        """;

    private final ChatModel chatModel;
    private final JsonMapper jsonMapper;

    public SpringAiDocumentAnalysisAdapter(ChatModel chatModel, JsonMapper jsonMapper) { ... }

    @Override
    public Flux<ExtractionEvent> analyze(byte[] pdfBytes) {
        // Przeniesiona logika z ExtractionService.java:98-157:
        // - budowanie Media, UserMessage, SystemMessage, Prompt
        // - chatModel.stream(prompt)
        // - flatMapIterable token→lines
        // - mapNotNull line→ExtractionEvent (parsowanie NDJSON)
        // - accumulatedFlags + concatWith (RedFlagsFound + AnalysisComplete)
        // - onErrorResume → AnalysisError
        // Brak tu: findById, setStatus, save — to odpowiedzialność ExtractionService
    }
}
```

### 4.3 Oczyszczony `ExtractionService`

Po refaktorze — tylko zarządzanie stanem KybCase, bez żadnego importu Spring AI.

```java
// Modyfikacja: src/.../analysis/ExtractionService.java
// USUNĄĆ: wszystkie importy org.springframework.ai.*, tools.jackson
// DODAĆ: zależność od DocumentAnalysisPort

@Service
public class ExtractionService {

    private final DocumentAnalysisPort analysisPort;      // ← wstrzykiwany przez interfejs
    private final KybCaseRepository caseRepository;

    public ExtractionService(DocumentAnalysisPort analysisPort, KybCaseRepository caseRepository) { ... }

    public Flux<ServerSentEvent<ExtractionEvent>> streamAnalysis(
            UUID caseId, MultipartFile pdfFile, String analystIdentity) {
        return Flux.defer(() -> {
            KybCase kybCase = caseRepository.findById(caseId)...
            // guard: ANALYZING, LOCKED → throw
            byte[] pdfBytes = pdfFile.getBytes();
            kybCase.setStatus(CaseStatus.ANALYZING);
            caseRepository.save(kybCase);

            AtomicBoolean hadError = new AtomicBoolean(false);

            return analysisPort.analyze(pdfBytes)          // ← delegat do portu
                .onErrorResume(e -> {
                    hadError.set(true);
                    return Flux.just(new ExtractionEvent.AnalysisError("EXTRACTION_ERROR", e.getMessage()));
                })
                .doFinally(s -> {
                    kybCase.setStatus(hadError.get() ? CaseStatus.CREATED : CaseStatus.ANALYZED);
                    caseRepository.save(kybCase);
                })
                .map(event -> ServerSentEvent.<ExtractionEvent>builder()
                    .event(event.getClass().getSimpleName())
                    .data(event)
                    .build());
        });
    }
}
```

**Efekt:** `ExtractionService` nie ma żadnego importu `springframework.ai.*` ani `tools.jackson`.

### 4.4 Struktura pakietów po refaktorze

```
src/main/java/com/example/clearkyc/
├── analysis/
│   ├── DocumentAnalysisPort.java        ← NOWY (interfejs domenowy)
│   ├── ExtractionController.java        ← BEZ ZMIAN
│   ├── ExtractionEvent.java             ← BEZ ZMIAN
│   ├── ExtractionService.java           ← OCZYSZCZONY (usuwa Spring AI)
│   ├── Citation.java                    ← BEZ ZMIAN
│   ├── RedFlagItem.java                 ← BEZ ZMIAN
│   └── RedFlagCategory.java             ← BEZ ZMIAN
├── infrastructure/
│   └── analysis/
│       └── SpringAiDocumentAnalysisAdapter.java   ← NOWY (Spring AI tu)
├── domain/
│   ...
```

---

## KROK 5 — Dowód izolacji i before/after

### 5.1 Wymiana adaptera — co się zmienia

Scenariusz: właściciel decyduje się zastąpić Spring AI natywnym Anthropic SDK.

| Plik | PRZED (Spring AI wewnątrz) | PO (adapter ACL) |
|---|---|---|
| `pom.xml` | Zmiana zależności: spring-ai → anthropic-sdk | **TO SAMO** — zmiana wymagana |
| `SpringAiDocumentAnalysisAdapter.java` | Nie istnieje | **Usunięty / zastąpiony** `AnthropicDocumentAnalysisAdapter.java` |
| `AnthropicDocumentAnalysisAdapter.java` | Nie istnieje | **Nowy** — implementuje `DocumentAnalysisPort` |
| `ExtractionService.java` | **Musi być przepisany** — zawiera Spring AI API calls | **BEZ ZMIAN** — zna tylko `DocumentAnalysisPort` |
| `ExtractionController.java` | Potencjalnie zmiana (model strumieniowania) | **BEZ ZMIAN** — zna tylko `ExtractionService` |
| `ExtractionEvent.java` | BEZ ZMIAN | **BEZ ZMIAN** |
| `Citation.java`, `RedFlagItem.java` | BEZ ZMIAN | **BEZ ZMIAN** |
| `domain/KybCase.java` | BEZ ZMIAN | **BEZ ZMIAN** |
| `service/FinalizeService.java` | BEZ ZMIAN | **BEZ ZMIAN** |
| `web/dto/*.java` | BEZ ZMIAN | **BEZ ZMIAN** |
| Frontend (wszystkie pliki) | BEZ ZMIAN | **BEZ ZMIAN** |

### 5.2 Before/After dla zduplikowanych miejsc

**Przed — system prompt w serwisie:**
```
ExtractionService.java:37-65  private static final String SYSTEM_PROMPT = """
    You are a KYB analyst assistant...
    Emit one JSON line per extracted field...
    """
// Ten string jest wiedzą adaptera (format NDJSON) + wiedzą domenową (nazwy pól, NDI marker).
// Zmieniasz format → ruszasz serwis → ryzyko ruszenia logiki stanów.
```

**Po — system prompt w adapterze:**
```
SpringAiDocumentAnalysisAdapter.java:15  private static final String SYSTEM_PROMPT = """
    You are a KYB analyst assistant...
    """
// Serwis nic nie wie o formacie NDJSON ani o Spring AI.
```

**Przed — Spring AI objects w metodzie biznesowej:**
```
ExtractionService.java:98    Media pdfMedia = Media.builder()...
ExtractionService.java:103   UserMessage userMessage = UserMessage.builder()...
ExtractionService.java:108   SystemMessage systemMessage = new SystemMessage(SYSTEM_PROMPT);
ExtractionService.java:109   Prompt prompt = new Prompt(...)
ExtractionService.java:115   chatModel.stream(prompt)
// Logika stanu (findById, setStatus) sąsiaduje z SDK calls.
```

**Po — w oczyszczonym serwisie tylko port:**
```
ExtractionService.java:~30   return analysisPort.analyze(pdfBytes)
                                 .onErrorResume(...)
                                 .doFinally(...);
// Żadnego ChatModel, Prompt, UserMessage, Media.
```

### 5.3 Otwarte pytania rozstrzygnięte przez ACL

PRD (Open Question 3): *"Will the design-partner bank tolerate sending document content to an external model provider?"*
— Jeśli odpowiedź brzmi "nie", adapter można zastąpić implementacją on-premise (np. lokalna Llama przez Ollama). `ExtractionService` nie musi wiedzieć o tej zmianie. ACL enkapsuluje decyzję infrastrukturalną.

CLAUDE.md: *"LLM client SDK choice — not pinned in pom.xml"*
— Po ACL SDK jest pinned WYŁĄCZNIE w `infrastructure/analysis/` — zmiana to jeden plik + `pom.xml`.

---

## KROK 6 — Weryfikacja i plan faz

### 6.1 Kryterium sukcesu

```bash
# Przed refaktorem — Spring AI "zna" serwis:
grep -rn "springframework.ai" src/main/java/
# Wynik: analysis/ExtractionService.java (5 linii importów + użycia)

# Po refaktorze — Spring AI zna TYLKO adapter:
grep -rn "springframework.ai" src/main/java/
# Oczekiwany wynik: TYLKO infrastructure/analysis/SpringAiDocumentAnalysisAdapter.java
```

### 6.2 Pliki przed/po

| Plik | Przed | Po |
|---|---|---|
| `analysis/ExtractionService.java` | Zna: `springframework.ai.*`, `tools.jackson` | Zna: `DocumentAnalysisPort` (interfejs domenowy) |
| `infrastructure/analysis/SpringAiDocumentAnalysisAdapter.java` | Nie istnieje | Zna: `springframework.ai.*`, `tools.jackson` |
| `analysis/DocumentAnalysisPort.java` | Nie istnieje | Zna: `Flux` (Reactor — akceptowalny w warstwie domeny przy WebFlux), `ExtractionEvent` |

### 6.3 Plan faz

Fazy zgodne z konwencją projektu (Conventional Commits, change folder, progress checkboxy).

---

**Faza 1: Port domenowy**

Kroki:
1. Stwórz `analysis/DocumentAnalysisPort.java` z sygnaturą `Flux<ExtractionEvent> analyze(byte[] pdfBytes)`
2. Napisz test jednostkowy mockujący port (jako wstępna weryfikacja sygnatury)

Commit: `refactor(llm-acl): dodaj DocumentAnalysisPort (p1)`

Weryfikacja: `./mvnw compile` (brak błędów kompilacji)

---

**Faza 2: Adapter Spring AI**

Kroki:
1. Stwórz `infrastructure/analysis/SpringAiDocumentAnalysisAdapter.java`
2. Przenieś do adaptera: import Spring AI, `JsonMapper`, `SYSTEM_PROMPT`, metody parsowania NDJSON, logikę `Flux` z `chatModel.stream`
3. Adapter implementuje `DocumentAnalysisPort`
4. Napisz test jednostkowy adaptera z `MockChatModel` (jeśli Spring AI dostarcza taki helper)

Commit: `refactor(llm-acl): SpringAiDocumentAnalysisAdapter (p2)`

Weryfikacja: `./mvnw test`

---

**Faza 3: Oczyszczenie ExtractionService**

Kroki:
1. Zmień `ExtractionService` — usuń Spring AI/Jackson importy, dodaj `DocumentAnalysisPort` jako dependency
2. Zrefaktoruj `streamAnalysis()` — delegacja do `analysisPort.analyze(pdfBytes)`, zachowanie logiki stanów
3. Usuń `SYSTEM_PROMPT` stałą z `ExtractionService`

Commit: `refactor(llm-acl): ExtractionService deleguje do portu (p3)`

Weryfikacja: `./mvnw test` (pełna suita) + `grep -rn "springframework.ai" src/main/java/` → tylko adapter

---

**Faza 4: Weryfikacja izolacji**

Kroki:
1. Uruchom: `grep -rn "springframework.ai" src/main/java/` — tylko `SpringAiDocumentAnalysisAdapter`
2. Uruchom: `grep -rn "tools.jackson" src/main/java/` — tylko `SpringAiDocumentAnalysisAdapter`
3. Pełna suita: `./mvnw test`
4. Manualna: uruchom backend + frontend, wykonaj analizę PDF, sprawdź streaming

Commit: `chore(llm-acl): close out plan (epilogue)`

---

## Podsumowanie

Dokument identyfikuje **Spring AI** jako najgroźniejszy przeciek zależności w ClearKYC: SDK LLM jest wbudowany bezpośrednio w `ExtractionService` — jedyny serwis, który jednocześnie zarządza stanem sprawy (`CaseStatus`), konstruuje zapytania do LLM przez Spring AI API i parsuje NDJSON odpowiedzi. Rozjazd intencja-vs-kod jest explicite udokumentowany: CLAUDE.md deklaruje SDK jako niewybrany i wymagający potwierdzenia, a kod nie pozostawia żadnej granicy izolacji. Plan ACL wprowadza `DocumentAnalysisPort` jako wąski interfejs domenowy i `SpringAiDocumentAnalysisAdapter` jako jedyne miejsce wiedzy o Spring AI — po refaktorze `grep -rn "springframework.ai" src/main/java/` zwraca wyłącznie plik adaptera. Wymiana providera LLM (Open Question 3 z PRD: "czy bank toleruje wysyłanie dokumentów do zewnętrznego providera?") sprowadza się do napisania nowego adaptera i zmiany `pom.xml` — bez ruszania logiki stanów, kontraktów API ani frontendu.
