<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: LLM Streaming Backend (F-04)

- **Plan**: context/changes/llm-streaming-backend/plan.md
- **Scope**: Wszystkie 3 fazy
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION (naprawiono podczas triage)
- **Findings**: 1 critical, 5 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (11/11 MATCH, 5 autoryzowanych adaptacji) |
| Scope Discipline | PASS |
| Safety & Quality | FAIL → naprawione |
| Architecture | PASS |
| Pattern Consistency | WARNING → naprawione |
| Success Criteria | PASS (14/14 testów, verify BUILD SUCCESS) |

## Kluczowe adaptacje (autoryzowane, nie drift)

1. Provider: Google GenAI zamiast Anthropic (klucz AI Studio użytkownika)
2. Spring AI BOM: 2.0.0-M8 (GA 2.0.0 niedostępne w Maven Central)
3. Jackson 3.x: `tools.jackson.databind.json.JsonMapper` (Spring Boot 4 nie używa com.fasterxml)
4. Autoconfiguration exclusion: `GoogleGenAiChatAutoConfiguration`
5. `SecurityConfigTest`: dodano `@MockitoBean ExtractionService` (wymagane gdy @WebMvcTest ładuje wszystkie kontrolery)

## Findings

### F1 — doFinally zawsze ustawia ANALYZED na ścieżce błędu

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: ExtractionService.java:118
- **Detail**: `onErrorResume` konwertuje błąd na `AnalysisError` event i sygnał zmienia się na ON_COMPLETE. `doFinally` zawsze ustawiał ANALYZED. Case po błędzie LLM był permanentnie stuck w ANALYZED bez możliwości ponownego zgłoszenia.
- **Fix**: Dodano `AtomicBoolean hadError`, ustawiane w `onErrorResume`, sprawdzane w `doFinally` — powrót do CREATED na błąd.
- **Decision**: FIXED

### F2 — pdfFile.getBytes() wywołane po przejściu do ANALYZING

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality (Reliability)
- **Location**: ExtractionService.java:72-79
- **Detail**: Jeśli `getBytes()` rzuci wyjątkiem, case utknął w ANALYZING bez cleanup (doFinally nie był dołączony do tego Flux.error).
- **Fix**: Przeniesiono `pdfFile.getBytes()` przed `kybCase.setStatus(ANALYZING)`.
- **Decision**: FIXED

### F3 — getOriginalFilename() bez sanityzacji trafia do LLM

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality (Security)
- **Location**: ExtractionService.java:84
- **Detail**: Niezaufane wejście z nagłówków HTTP przekazywane do kontekstu LLM.
- **Fix**: Zamieniono na stałą `"document.pdf"`.
- **Decision**: FIXED

### F4 — Brak ograniczenia rozrostu bufora NDJSON

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality (Performance)
- **Location**: ExtractionService.java:95-106
- **Detail**: Brak `\n` w odpowiedzi LLM powodował nieograniczony rozrost StringBuilder.
- **Fix**: Dodano `MAX_LINE_BYTES = 512_000`; przekroczenie rzuca wyjątek → `onErrorResume` → `AnalysisError`.
- **Decision**: FIXED

### F5 — JwtAuthenticationToken jako parametr kontrolera

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: ExtractionController.java:32
- **Detail**: Wiązanie do konkretnej klasy Spring Security zamiast idiomatycznego `@AuthenticationPrincipal Jwt`.
- **Fix**: Zmieniono parametr na `@AuthenticationPrincipal Jwt jwt` i `jwt.getSubject()`.
- **Decision**: FIXED

### F6 — Klucz API Google widoczny w outputach narzędzi AI

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality (Security)
- **Location**: application-dev.properties (gitignored)
- **Detail**: Klucz pojawił się w outputach sub-agentów AI podczas przeglądu.
- **Decision**: ACCEPTED — sesja prywatna, klucz dev-only

### F7 — Brak komentarza o założeniu single-analyst

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality (Reliability)
- **Location**: ExtractionService.java:67-73
- **Detail**: Nieatomowy check-then-act nie jest zabezpieczony, ale PRD definiuje single-analyst per case.
- **Fix**: Dodano komentarz `// PRD: single analyst per case`.
- **Decision**: FIXED

### F8 — Dwa testy 409 funkcjonalnie identyczne

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: ExtractionControllerTest.java:84-103
- **Decision**: SKIPPED — dwa testy dokumentują dwie różne intencje biznesowe

### F9 — Plan stale: Anthropic → Google GenAI niezaktualizowane

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence (documentation)
- **Location**: context/changes/llm-streaming-backend/plan.md
- **Detail**: Phase 1 contracts i live test section wymieniały Anthropic/claude/ANTHROPIC_API_KEY.
- **Fix**: Zaktualizowano plan na Google GenAI / gemini-2.5-pro / GOOGLE_GENAI_API_KEY.
- **Decision**: FIXED
