---
title: ClearKYC — Invariant Aggregate Refactor Plan
created: 2026-06-24
type: refactor-plan
source-distillation: context/domain/01-domain-distillation.md
---

# ClearKYC — Plan refaktoru agregatu-straznika Trust Contract

## KROK 0 — Kontekst (skrot)

**Stack:** Spring Boot 4 + Java 21 + PostgreSQL + Angular SPA (`web/`). Logika biznesowa zyje w:
- `src/.../domain/` (encje JPA, enumy)
- `src/.../service/` (serwisy aplikacyjne — tam dzieje sie logika)
- `src/.../web/dto/` + `resources/schema/` (walidacja na granicy API)
- `web/src/app/core/` (store + modele — jedyna dziś warstwa z logiką domenową)

Dokumenty wymagań: `context/foundation/prd.md` (PRD v1 draft). Sekcje krytyczne: Success Criteria (`prd.md:40-48`), Guardrails (`prd.md:46-47`), FR-008 (`prd.md:87`), NFR "Trust-contract integrity" (`prd.md:111`).

---

## KROK 1 — Niezmienniki biznesowe (kompletna lista)

| ID | Niezmiennik | Źródło | Warstwy egzekucji |
|---|---|---|---|
| **INV-1** | Każde wyświetlone pole ma `citations.length >= 1` LUB `value == NDI` — nigdy pewna wartość bez proweniencji | `prd.md:46,64,111` FR-008 | Frontend: częściowa (wizualna); Backend: BRAK |
| INV-2 | LOCKED case nie może być modyfikowany ani re-analizowany | `prd.md:97`, FR-011 | Backend: CaseService:36-38, FinalizeService:64, ExtractionService:85-87 — pełna egzekucja |
| INV-3 | AuditRecord zapisany PRZED zmianą statusu na LOCKED (atomowość) | `prd.md:47` Guardrail | Backend: FinalizeService:96-101 — jedna transakcja |
| INV-4 | Finalization payload walidowany przez JSON Schema v0.x przed zapisem | `prd.md:99` FR-012 | Backend: FinalizeService:81-87 — pełna egzekucja |
| INV-5 | Override justification jest niepuste (minLength > 0) | `prd.md:92` FR-010 | Frontend: extraction-form:62; Backend JSON Schema: brak minLength |
| INV-6 | Red flagi emitowane TYLKO po pełnej analizie dokumentu | `prd.md:85` FR-007 | Backend: ExtractionService:143-148 — trust-based (heurystyka kolejności linii LLM) |
| INV-7 | Jeden AuditRecord per case (jeden zapis finalizacji) | `prd.md:103` FR-013 | Backend: AuditRecord:21 `@OneToOne @JoinColumn unique=true` — constraint na poziomie DB |
| INV-8 | Analiza możliwa tylko w stanach CREATED lub ANALYZED (nie ANALYZING, nie LOCKED) | `prd.md:79` FR-005 | Backend: ExtractionService:82-87 — pełna egzekucja |

---

## KROK 2 — Klasyfikacja i wybór #1

| ID | (a) Rdzeniowość | (b) Rozmazanie | (c) Egzekucja | Priorytet |
|---|---|---|---|---|
| **INV-1** | **MAKSYMALNA** — to definicja propozycji wartości ("analyst-in-the-loop" ma sens tylko gdy każda wartość jest uzasadniona) | **3 warstwy** (PRD, frontend, JSON Schema) — nigdzie spójnie | **NARUSZALNY** — backend i JSON Schema nie sprawdzają; możliwe wywołanie API z polami bez cytatów | **#1** |
| INV-5 | Wysoka — audit record bez uzasadnienia nadpisania jest bezużyteczny dla regulatora | 2 warstwy | Naruszalny przez API (minLength brak w Schema) | #2 |
| INV-6 | Wysoka — false alarms na wczesnych flagach niszczą zaufanie | 1 warstwa (backend) | Trust-based (kolejność LLM output) | #3 |
| INV-2 | Wysoka | 3 pliki backendu | Egzekwowany | OK |
| INV-3 | Wysoka | 1 metoda | Egzekwowany | OK |
| INV-4 | Wysoka | 1 metoda | Egzekwowany | OK |
| INV-7 | Wysoka | DB constraint | Egzekwowany (DB) | OK |
| INV-8 | Średnia | 1 metoda | Egzekwowany | OK |

### Wybór: INV-1 — Trust Contract

**Uzasadnienie:** PRD traktuje to jako "Guardrail" (nie feature), a nie jako NFR — tzn. jest warunkiem koniecznym, nie opcjonalnym (`prd.md:46`). PRD dosłownie: *"No extracted field is ever displayed to the analyst without an accompanying source citation. If the model cannot produce a citation for a value, the field remains empty and is surfaced to the analyst as an explicit gap, not a confident answer."*

Jednocześnie jest to jedyna reguła, którą **jedynym strażnikiem jest UI** — ktokolwiek wywoła `POST /api/cases/{id}/finalize` bezpośrednio lub przez test może zafinalizować case z polami bez cytatów. Audit Record zapisany w takim stanie jest nieważny z perspektywy compliance.

---

## KROK 3 — Diagnoza: gdzie dziś żyje INV-1

### Warstwa PRD (wymaganie, nie kod)

```
prd.md:46   "No extracted field is ever displayed to the analyst without
             an accompanying source citation."
prd.md:64   "fields where the model determined absence-of-evidence show
             an explicit 'Not Disclosed / Inferred Missing' marker rather
             than an empty value"
prd.md:111  NFR "Trust-contract integrity: every populated field shown
             in the UI is justifiable — either by an array of verbatim
             source citations, or by an explicit NDI marker"
```

### Warstwa Frontend — jedyny strażnik (słaby)

**Wizualny wskaźnik — nie blokuje:**
```
extraction-form.component.ts:96-98
  isMissing(field: ExtractionField): boolean {
    if (this.caseStore.fieldOverrides()[field.fieldName]) return false;
    return field.value === 'Not Disclosed / Inferred Missing'
        || (field.citations?.length ?? 0) === 0;
  }
```
Wynik: pole jest wizualnie oznaczone jako "brakujące" — ale nic nie blokuje finalizacji.

**Decision bar — brak warunku bloków:**
`shared/components/decision-bar/decision-bar.component.ts` — brak weryfikacji czy wszystkie pola spełniają Trust Contract przed pokazaniem przycisku "Commit decision".

### Warstwa Backend — BRAK egzekucji

**FieldRecord DTO — brak walidacji:**
```
web/dto/FieldRecord.java:5-10
  public record FieldRecord(
          String fieldName,
          String value,
          List<CitationRecord> citations,   // nullable, może być empty
          FieldOverride override) {
  }
```

**FinalizeService — schemat nie egzekwuje warunku:**
```
FinalizeService.java:81-87
  Set<ValidationMessage> errors = jsonSchema.validate(payloadNode);
  if (!errors.isEmpty()) {
      throw new ResponseStatusException(HTTP 422, "Schema validation failed");
  }
```
Schemat jest walidowany — ale schemat nie zawiera reguły Trust Contract.

**JSON Schema (finalization-v0.3.json) — brak warunku warunkowego:**
```json
finalization-v0.3.json:23-32
  "citations": {
    "type": "array",
    "items": { "type": "object", "required": ["page", "quote"] }
  }
  // citations: brak minItems; brak if/then dla value != NDI
```

### Gdzie błąd jest "połykany"

Backend nie rzuca żadnego błędu gdy `citations` jest pustą tablicą a `value` nie jest NDI. Operacja finalizacji przechodzi bez ostrzeżenia. Audit Record zapisywany z naruszonym niezmiennikiem.

### Mapa luk

```
Warstwa          Reguła          Akcja gdy naruszona
---------------------------------------------------------
PRD              Opisana         n/d
Frontend UI      Wizualna        Pomarańczowy badge — można zignorować
Frontend guard   BRAK            Brak blokady przycisku "Commit"
Backend DTO      BRAK            Przyjmuje wszystko
JSON Schema      BRAK warunku    Walidacja przechodzi
FinalizeService  BRAK            Zapisuje naruszony stan
AuditRecord DB   BRAK            Persystuje naruszony stan
```

---

## KROK 4 — Projekt agregatu-strażnika

### Zasada projektowania

Agregat `KybCase` staje się jedynym miejscem egzekucji Trust Contract przy finalizacji. Metoda domenowa `finalize()` sprawdza każde pole — jeśli niezmiennik jest naruszony, rzuca named domain exception, a transakcja nigdy się nie commituje.

### 4.1 Value Object: `CitedField`

Reprezentuje pole ekstrakcji z egzekwowanym Trust Contract. Niewalidy obiekt nie może powstać.

```java
// Nowy plik: src/.../domain/CitedField.java

public record CitedField(String fieldName, String value, List<CitationRecord> citations) {

    private static final String NDI_MARKER = "Not Disclosed / Inferred Missing";

    // Primary factory — rzuca domenowy błąd, nie cicho aktualizuje
    public static CitedField of(String fieldName, String value, List<CitationRecord> citations) {
        if (fieldName == null || fieldName.isBlank()) {
            throw new TrustContractViolationException("fieldName must not be blank");
        }
        if (value == null || value.isBlank()) {
            throw new TrustContractViolationException(
                "field '" + fieldName + "': value must not be blank");
        }
        boolean isNdi = NDI_MARKER.equals(value);
        boolean hasCitations = citations != null && !citations.isEmpty();
        if (!isNdi && !hasCitations) {
            throw new TrustContractViolationException(
                "field '" + fieldName + "': non-NDI value requires at least one citation. " +
                "Found value='" + value + "' with empty citations array.");
        }
        return new CitedField(fieldName, value, citations == null ? List.of() : List.copyOf(citations));
    }
}
```

### 4.2 Domain Exception: `TrustContractViolationException`

Named exception — nigdy nie jest RuntimeException anonimowe ani catch-all.

```java
// Nowy plik: src/.../domain/TrustContractViolationException.java

public class TrustContractViolationException extends RuntimeException {
    private final String fieldName;   // null jeśli błąd globalny

    public TrustContractViolationException(String message) {
        super(message);
        this.fieldName = null;
    }

    public TrustContractViolationException(String fieldName, String reason) {
        super("Trust contract violated for field '" + fieldName + "': " + reason);
        this.fieldName = fieldName;
    }

    public Optional<String> fieldName() { return Optional.ofNullable(fieldName); }
}
```

### 4.3 Metoda domenowa na `KybCase`

`KybCase` dostaje metodę `finalize()` zamiast serwis bezpośrednio mutujący status.

```java
// Modyfikacja: src/.../domain/KybCase.java

public class KybCase {

    // ... istniejące pola i konstruktory ...

    /**
     * Finalizuje case: weryfikuje Trust Contract dla wszystkich pól,
     * ustawia status LOCKED i lockedAt. Rzuca wyjątek domenowy zanim
     * stan się zmieni — fail-fast, nie log-and-continue.
     *
     * Preconditions:
     *   - status != LOCKED (sprawdzone przed wywołaniem w FinalizeService)
     *   - każde pole: value == NDI || citations non-empty  ← Trust Contract
     *
     * @param fields  lista pól do weryfikacji (musi być non-null, może być empty)
     * @param now     timestamp finalizacji (przekazywany, nie Instant.now() — testowalność)
     * @throws TrustContractViolationException jeśli którekolwiek pole narusza niezmiennik
     */
    public void finalize(List<CitedField> fields, Instant now) {
        // CitedField.of() już weryfikuje — tu wystarczy spróbować zbudować listę.
        // Walidacja odbywa się w fabryce CitedField, nie tutaj ponownie.
        // Metoda istnieje żeby zmiana stanu była atomowa z weryfikacją.

        this.status = CaseStatus.LOCKED;
        this.lockedAt = now;
    }
}
```

**Uwaga:** `CitedField.of()` jest wywoływany w `FinalizeService` podczas mapowania `FieldRecord -> CitedField` — to jest moment weryfikacji. `KybCase.finalize()` przyjmuje już zwalidowane obiekty i tylko mutuje stan agregatu.

### 4.4 Repozytorium (bez zmian interfejsu, komentarz)

```java
// Istniejące: src/.../repository/KybCaseRepository.java
// Brak zmian w interfejsie — metody findById + save wystarczą.
// FinalizeService używa save() po KybCase.finalize() — dirty-checking JPA.
```

### 4.5 Serwis aplikacyjny `FinalizeService` — przepisanie logiki finalizacji

```java
// Modyfikacja: src/.../service/FinalizeService.java

@Transactional
public FinalizeResponse finalize(UUID caseId, FinalizeRequest request, String analystIdentity) {

    KybCase kybCase = kybCaseRepository.findById(caseId)
            .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Case not found"));

    if (kybCase.getStatus() == CaseStatus.LOCKED) {
        throw new ResponseStatusException(CONFLICT, "Case is already locked");
    }

    Instant now = Instant.now();

    // ① Mapuj FieldRecord -> CitedField — rzuca TrustContractViolationException jeśli naruszenie
    List<CitedField> citedFields = request.fields().stream()
            .map(f -> CitedField.of(f.fieldName(), f.value(), f.citations()))
            .toList();
    // Jeśli dotarliśmy tu: każde pole spełnia Trust Contract.

    // ② Buduj payload (bez zmiany istniejącej logiki JSON)
    Map<String, Object> payloadMap = buildPayloadMap(caseId, analystIdentity, request, now);

    // ③ JSON Schema validation (INV-4 — pozostaje bez zmian)
    JsonNode payloadNode = objectMapper.valueToTree(payloadMap);
    Set<ValidationMessage> errors = jsonSchema.validate(payloadNode);
    if (!errors.isEmpty()) {
        String msg = errors.stream().map(ValidationMessage::getMessage)
                .collect(Collectors.joining("; "));
        throw new ResponseStatusException(UNPROCESSABLE_ENTITY, "Schema validation failed: " + msg);
    }

    String payloadJson = serialize(payloadMap);

    // ④ Zapisz AuditRecord PRZED zmianą statusu (INV-3 — bez zmian)
    AuditRecord auditRecord = new AuditRecord(kybCase, analystIdentity, request.decision(), payloadJson);
    auditRecordRepository.save(auditRecord);

    // ⑤ Deleguj do agregatu — atomowa zmiana stanu
    kybCase.finalize(citedFields, now);
    // JPA dirty-checking commituje zmianę KybCase razem z AuditRecord w jednej transakcji

    return new FinalizeResponse(auditRecord.getId(), request.decision().name(), now);
}
```

### 4.6 Cienkie API — mapowanie błędu domenowego na HTTP 422

```java
// Dodać do istniejącego @ControllerAdvice lub jako @ExceptionHandler w DecisionController:

@ExceptionHandler(TrustContractViolationException.class)
@ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
public ProblemDetail handleTrustContractViolation(TrustContractViolationException ex) {
    ProblemDetail detail = ProblemDetail.forStatusAndDetail(
            HttpStatus.UNPROCESSABLE_ENTITY,
            ex.getMessage());
    detail.setTitle("Trust Contract Violation");
    ex.fieldName().ifPresent(fn -> detail.setProperty("field", fn));
    return detail;
}
```

HTTP 422 Unprocessable Entity — ten sam status co dla JSON Schema failure, odróżniany przez `title`.

### 4.7 JSON Schema — uzupełnienie (defensywnie)

Dodać do `finalization-v0.3.json` conditional constraint jako drugi strażnik (fail-safe, nie primary):

```json
"fields": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["fieldName", "value"],
    "properties": {
      "fieldName": { "type": "string", "minLength": 1 },
      "value": { "type": "string", "minLength": 1 },
      "citations": {
        "type": "array",
        "items": { "type": "object", "required": ["page", "quote"] }
      },
      "override": { ... }
    },
    "if": {
      "not": { "properties": { "value": { "const": "Not Disclosed / Inferred Missing" } } }
    },
    "then": {
      "properties": {
        "citations": { "minItems": 1 }
      },
      "required": ["citations"]
    }
  }
}
```

Jednocześnie uzupełnić `minLength: 1` dla `justification` w override (INV-5):
```json
"justification": { "type": "string", "minLength": 1 }
```

---

## KROK 5 — Before/After, plan faz, testy

### 5.1 Before/After per warstwa

| Warstwa | BEFORE | AFTER |
|---|---|---|
| `CitedField` (nowy VO) | Nie istnieje; `FieldRecord` to plain DTO bez logiki | `CitedField.of()` rzuca `TrustContractViolationException` przy naruszeniu; nielegalne obiekty nie powstają |
| `KybCase.finalize()` (nowa metoda) | Brak metody domenowej; `FinalizeService` bezpośrednio mutuje `setStatus(LOCKED)` | Metoda `finalize(List<CitedField>, Instant)` jest jedynym wejściem do stanu LOCKED |
| `FinalizeService.finalize()` | Mapuje DTO -> Map -> JSON bez weryfikacji Trust Contract | Mapuje `FieldRecord -> CitedField` (tu weryfikacja), następnie `kybCase.finalize()` |
| `JSON Schema v0.3` | `citations` opcjonalne, `minItems` brak, `justification` bez minLength | Dodany `if/then` dla non-NDI pól + `minLength:1` dla justification (v0.4) |
| `DecisionController` | Brak error handlera dla błędów domenowych | `@ExceptionHandler(TrustContractViolationException)` mapuje na HTTP 422 z `ProblemDetail` |
| Frontend `ExtractionForm.isMissing()` | Jedyny strażnik — wizualny, nie blokujący | Pozostaje jako UX helper; egzekucja przeniesiona na backend; frontend może opcjonalnie blokować przycisk "Commit" na podstawie tej samej logiki |

### 5.2 Plan faz refaktoru

Projekt ma dyscyplinę: Vitest jako runner dla frontendu (`web/.claude/skills` + `testing-frontend-critical-flows`), Spring Boot Test dla backendu (`./mvnw test`). Fazy idą test-first na backendzie.

---

**Faza 1: Fundament domenowy** (test-first, backend only)

Kroki:
1. Napisz test jednostkowy `CitedFieldTest` (patrz 5.3)
2. Zaimplementuj `CitedField.of()` + `TrustContractViolationException`
3. Zielone testy

Weryfikacja: `./mvnw test -Dtest=CitedFieldTest`

---

**Faza 2: Integracja w FinalizeService** (test-first)

Kroki:
1. Napisz `FinalizeServiceTrustContractTest` (patrz 5.3)
2. Zmodyfikuj `FinalizeService.finalize()` — dodaj mapowanie `FieldRecord -> CitedField`
3. Dodaj metodę `KybCase.finalize(List<CitedField>, Instant)`
4. Zielone testy

Weryfikacja: `./mvnw test -Dtest=FinalizeServiceTrustContractTest`

---

**Faza 3: HTTP error mapping**

Kroki:
1. Dodaj `@ExceptionHandler(TrustContractViolationException)` — HTTP 422
2. Test integracyjny: `MockMvc` / `@SpringBootTest` wywołuje `/finalize` z polem bez cytatów → oczekiwane 422

Weryfikacja: `./mvnw test` (pełna suita)

---

**Faza 4: JSON Schema v0.4** (defensywny layer)

Kroki:
1. Skopiuj `finalization-v0.3.json` → `finalization-v0.4.json`
2. Dodaj `if/then` constraint dla non-NDI pól + `minLength:1` dla justification
3. Zaktualizuj `FinalizeService.loadSchema()` na v0.4
4. Zaktualizuj wersję schematu w `AuditRecord` payloadzie (pole `schemaVersion`)
5. Test: istniejące `FinalizeServiceTest` musi pozostać zielony

Weryfikacja: `./mvnw test`

---

**Faza 5: Frontend (opcjonalna blokada przycisku)**

Kroki:
1. W `DecisionBarComponent` dodaj `@Input() hasUnverifiedFields: boolean`
2. W `CaseDetailComponent` oblicz `hasUnverifiedFields` na podstawie `extractionFields` + `isMissing()`
3. Disabled="hasUnverifiedFields" na przycisku "Commit decision"
4. Test Vitest: `ng test` z testem dla disabled state

Weryfikacja: `cd web && ng test --watch=false`

---

**Faza 6: Manualna weryfikacja end-to-end**

- Spróbuj zafinalizować case z polem bez cytatu i bez NDI przez UI → backend zwraca 422, UI pokazuje błąd
- Zafinalizuj case z prawidłowymi polami → przechodzi
- Zafinalizuj case z polem NDI (puste citations) → przechodzi

---

### 5.3 Przypadki testowe dla INV-1

#### `CitedFieldTest` (JUnit 5, unit)

```java
// Legalne przejścia (powinny stworzyć CitedField bez wyjątku)
@Test void field_with_one_citation_is_valid()
@Test void field_with_multiple_citations_is_valid()
@Test void ndi_field_with_empty_citations_is_valid()
@Test void ndi_field_with_citations_is_also_valid()  // NDI z cytatem jest dopuszczalne

// Nielegalne operacje (powinny rzucić TrustContractViolationException)
@Test void non_ndi_field_with_empty_citations_throws()
@Test void non_ndi_field_with_null_citations_throws()
@Test void blank_fieldName_throws()
@Test void blank_value_throws()
@Test void null_value_throws()

// Boundary
@Test void ndi_marker_must_match_exactly()  // "Not Disclosed" bez "/ Inferred Missing" → throw
```

#### `FinalizeServiceTrustContractTest` (Spring @MockBean, integration-light)

```java
// Legalne
@Test void finalize_with_all_cited_fields_succeeds()
@Test void finalize_with_ndi_field_in_mix_succeeds()

// Nielegalne — fail-fast PRZED zapisem AuditRecord
@Test void finalize_with_uncited_field_throws_before_audit_record_is_saved()
    // sprawdź: auditRecordRepository.save() NIE był wywołany (Mockito verify(never))
@Test void finalize_with_multiple_violations_throws_on_first()

// Idempotentność i istniejące niezmienniki
@Test void finalize_locked_case_throws_conflict()  // INV-2 — regresja
@Test void finalize_schema_violation_throws_422()  // INV-4 — regresja
```

#### HTTP test (`@SpringBootTest` + `MockMvc`)

```java
@Test void POST_finalize_with_uncited_field_returns_422_with_trust_contract_title()
    // body: {"fieldName":"companyName","value":"ACME","citations":[]}
    // expected: 422, body.title == "Trust Contract Violation", body.field == "companyName"
```

---

### 5.4 Nowe nazwy kontraktowe

Jeśli projekt prowadzi rejestr kontraktów domenowych (np. w `context/foundation/`), zarejestrować:

| Nazwa | Typ | Plik docelowy |
|---|---|---|
| `CitedField` | Value Object | `src/.../domain/CitedField.java` |
| `TrustContractViolationException` | Domain Exception | `src/.../domain/TrustContractViolationException.java` |
| `KybCase.finalize(List<CitedField>, Instant)` | Domain Method | `src/.../domain/KybCase.java` |
| `finalization-v0.4.json` | JSON Schema version | `src/main/resources/schema/finalization-v0.4.json` |
| `Trust Contract Violation` | HTTP ProblemDetail title | `DecisionController` / `@ControllerAdvice` |

---

## Podsumowanie

Dokument identyfikuje **INV-1 (Trust Contract)** jako niezmiennik #1 do refaktoru: jest rdzeniowy dla propozycji wartości ClearKYC ("analyst-in-the-loop ma sens tylko gdy każda wartość jest uzasadniona"), rozmazany po czterech warstwach (PRD, UI badge, DTO, JSON Schema) i naruszalny przez bezpośrednie wywołanie API. Diagnoza wskazuje, że frontend jest jedynym strażnikiem — wizualnym, nieblokującym. Plan wprowadza Value Object `CitedField` z fabryką `of()` jako punkt kontrolny: nielegalna kombinacja (non-NDI + puste citations) rzuca `TrustContractViolationException` zanim `AuditRecord` zostanie zapisany. `FinalizeService` mapuje DTO na `CitedField` — błąd zatrzymuje transakcję, nie jest "połykany". JSON Schema v0.4 dodaje defensywny `if/then` constraint jako drugi strażnik. Refaktor jest podzielony na 6 faz (test-first dla backendu), bez zmian w istniejących API endpointach — zmienia się jedynie HTTP 422 response dla wcześniej cicho akceptowanych naruszeń.
