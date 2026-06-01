# Red Flag Taxonomy (S-03) — Implementation Plan

## Overview

Implementacja FR-007: red flagi pojawiają się po zakończeniu analizy całego dokumentu, każda powiązana z wpisem w zamkniętej taksonomii kategorii ryzyka. Taksonomia wdrożona jako Java enum `RedFlagCategory` z 6 seed-kategoriami z PRD (bank podmieni je bez zmiany architektury). LLM produkuje pola (streamed) i red flagi (na końcu dokumentu) w jednym wywołaniu. Backend akumuluje red flagi i emituje je jako jeden SSE event `RedFlagsFound` przed `AnalysisComplete`. Frontend wyświetla read-only sekcję z red flagami poniżej ExtractionForm, widoczną dopiero po `AnalysisComplete`.

## Current State Analysis

- `ExtractionEvent` (sealed interface): 3 typy — `FieldExtracted`, `AnalysisComplete`, `AnalysisError`. Brak `RedFlagsFound`.
- `ExtractionService.SYSTEM_PROMPT`: instruuje LLM o ekstrakcji `companyName`, `directors`, `UBOs`. Brak instrukcji red flag.
- `ExtractionService.streamAnalysis`: parsuje każdą linię NDJSON jako `FieldExtracted`; `concatWith(AnalysisComplete)` na końcu. Brak akumulacji red flag.
- `finalization-v0.2.json`: pola `caseId`, `analystIdentity`, `decision`, `finalizedAt`, `fields[]`. Brak `red_flags`.
- Frontend `extraction.models.ts`: brak `RedFlagItem` i `RedFlagsFound` event.
- Frontend `CaseStore`: brak sygnału `redFlags`.
- Frontend: brak komponentu `RedFlagListComponent`.

## Desired End State

Analityk po zakończeniu analizy widzi sekcję "Red Flags" poniżej formularza ekstrakcji. Każda flaga pokazuje kategorię (z taksonomii), opis wygenerowany przez LLM i odznaki cytowań (klikalne — nawigują do strony w PDF). Sekcja jest niewidoczna podczas streamingu pól, pojawia się jednorazowo gdy backend wyemituje `RedFlagsFound`. Rekord finalizacji (v0.3) zawiera opcjonalne pole `red_flags[]`.

### Key Discoveries:

- `ExtractionEvent` jest `sealed interface` z `permits` listą — dodanie nowego typu wymaga dopisania do `permits` i `implements ExtractionEvent`.
- `ExtractionController` używa `event.getClass().getSimpleName()` jako SSE event name — `RedFlagsFound` będzie automatycznie serializowane z właściwym typem bez zmian w kontrolerze.
- `parseSSEMessage` w `extraction-stream.service.ts` już obsługuje discriminację po stringu `eventType` — wystarczy dodać `case 'RedFlagsFound'`.
- `CaseStore.reset()` musi czyścić `redFlags` — wzorzec znany z poprzednich pól.
- `ExtractionFormComponent.startAnalysis` subskrybuje SSE stream i dispatches do store — tu dodajemy obsługę `RedFlagsFound`.

## What We're NOT Doing

- Nie implementujemy per-flag dismiss / override (v2).
- Nie dodajemy severity / confidence do red flagi (v2).
- Nie robimy drugiego call LLM (dwa passy) — jeden pass.
- Nie migrujemy istniejących rekordów v0.1/v0.2 — v0.3 schema jest addytywna (red_flags opcjonalne).
- Nie implementujemy zamkniętego katalogu taksonomii banku — seed enum jest placeholderem.
- Nie streamujemy red flag na bieżąco — emitujemy je jednorazowo po analizie.

## Implementation Approach

**Single-pass LLM z NDJSON discriminacja po kluczu.** System prompt rozszerzony o instrukcję emitowania red flag linii na KOŃCU dokumentu (po wszystkich polach), w formacie `{"category":"<ENUM>","description":"...","citations":[...]}`. Backend parsuje każdą linię: linie z `fieldName` → `FieldExtracted` (bez zmian); linie z `category` → `RedFlagItem` (akumulowane). Gdy stream LLM się kończy, backend emituje `ExtractionEvent.RedFlagsFound(accumulator)` przed `AnalysisComplete` przez `concatWith(Flux.defer(...))`.

Discriminacja parsera: sprawdź obecność klucza `"category"` w raw JSON zanim spróbujesz parsowania — unika potrzeby `try-catch` dwóch typów.

## Critical Implementation Details

**Ordering w `concatWith`**: `Flux.defer(() -> Flux.just(RedFlagsFound, AnalysisComplete))` musi odczytać akumulator przez `Flux.defer` (leniwa ewaluacja) — bez `defer` akumulator byłby czytany przed zakończeniem streamu LLM.

**Jackson serialization `RedFlagsFound`**: `ExtractionController` serializuje `ExtractionEvent` przez Jackson. `RedFlagsFound(List<RedFlagItem>)` będzie serializowane jako `{"flags":[...]}`. Frontend musi parsować `payload.flags` (nie `payload` bezpośrednio).

---

## Phase 1: Backend — domain types

### Overview

Definiuje taksonomię i model danych red flagi na poziomie Java, bez dotykania logiki streamingu. Fundamenty których Phase 2 wymaga do kompilacji.

### Changes Required:

#### 1. RedFlagCategory enum

**File**: `src/main/java/com/example/clearkyc/analysis/RedFlagCategory.java`

**Intent**: Definiuje zamkniętą taksonomię kategorii ryzyka jako Java enum. 6 seed-wartości z PRD Open Question 1 — bank podmieni je bez zmiany architektury.

**Contract**: Public enum z wartościami: `SANCTIONS_EXPOSURE`, `SHELL_COMPANY_INDICATORS`, `JURISDICTION_RISK`, `OPAQUE_OWNERSHIP`, `PEP_LINKAGE`, `SECTOR_SPECIFIC_RISK`. Jackson serializuje enum jako string nazwy (domyślne zachowanie — nie potrzeba adnotacji).

#### 2. RedFlagItem record

**File**: `src/main/java/com/example/clearkyc/analysis/RedFlagItem.java`

**Intent**: DTO dla pojedynczego red flaga — kategoria z taksonomii, opis LLM i cytowania źródłowe.

**Contract**: `public record RedFlagItem(RedFlagCategory category, String description, List<Citation> citations)`. `Citation` to istniejący typ z pakietu `analysis`.

#### 3. ExtractionEvent — dodanie RedFlagsFound

**File**: `src/main/java/com/example/clearkyc/analysis/ExtractionEvent.java`

**Intent**: Rozszerza sealed hierarchy o nowy typ dla batch red flag event, emitowanego jednorazowo po zakończeniu analizy.

**Contract**: Dodaj `ExtractionEvent.RedFlagsFound` do `permits` listy i jako `public record RedFlagsFound(List<RedFlagItem> flags) implements ExtractionEvent`. Umieść jako 4. inner record (po `AnalysisError`).

### Success Criteria:

#### Automated Verification:

- Backend kompiluje się bez błędów: `./mvnw compile`
- Testy przechodzą (żadne nie dotyczą nowych typów jeszcze): `./mvnw test`

---

## Phase 2: Backend — LLM extraction pipeline

### Overview

Rozszerza `ExtractionService` o instrukcję red flag w system prompt, NDJSON discriminator w parserze, akumulator red flag i emisję `RedFlagsFound` przed `AnalysisComplete`. Aktualizuje test kontrolera.

### Changes Required:

#### 1. ExtractionService — rozszerzony system prompt

**File**: `src/main/java/com/example/clearkyc/analysis/ExtractionService.java` (linia 36–55)

**Intent**: Dodaje do system prompt instrukcję emitowania red flag NDJSON linii na końcu dokumentu, po wszystkich liniach pól ekstrakcji.

**Contract**: Rozszerz `SYSTEM_PROMPT` o sekcję:

```
After ALL field lines, emit red flags (one JSON line each):
{"category":"<CATEGORY>","description":"<sentence>","citations":[{"quote":"<text>","pageNumber":<n>}]}

Available categories: SANCTIONS_EXPOSURE, SHELL_COMPANY_INDICATORS, JURISDICTION_RISK,
OPAQUE_OWNERSHIP, PEP_LINKAGE, SECTOR_SPECIFIC_RISK

Emit red flag lines ONLY after all field lines. If no red flags: emit nothing (no red flag lines).
A "Not Disclosed / Inferred Missing" field value MAY chain into a red flag — use your judgment.
```

#### 2. ExtractionService — akumulator i discriminator parsera

**File**: `src/main/java/com/example/clearkyc/analysis/ExtractionService.java` (linia 98–123)

**Intent**: Dodaje `AtomicReference<List<RedFlagItem>>` jako akumulator red flag, oraz discriminuje parsing NDJSON: linie z `"category":` → `RedFlagItem` (do akumulatora), reszta → `FieldExtracted` (bez zmian).

**Contract**:
- Zadeklaruj `AtomicReference<List<RedFlagItem>> accumulatedFlags = new AtomicReference<>(new ArrayList<>())` obok istniejących `AtomicReference<StringBuilder> buf` i `AtomicBoolean hadError`.
- W `mapNotNull` (linia 116–123): przed próbą `readValue(..., FieldExtracted.class)` sprawdź `line.contains("\"category\":")`. Jeśli tak — parsuj jako `RedFlagItem`, dodaj do `accumulatedFlags` i zwróć `null` (nie emituj zdarzenia dla pojedynczej flagi). Jeśli nie — istniejąca ścieżka `FieldExtracted`.

#### 3. ExtractionService — emisja RedFlagsFound przed AnalysisComplete

**File**: `src/main/java/com/example/clearkyc/analysis/ExtractionService.java` (linia 124)

**Intent**: Zastępuje `concatWith(Flux.just(AnalysisComplete))` na `concatWith(Flux.defer(...))` który emituje `RedFlagsFound` (jeśli zebrano flagi) a następnie `AnalysisComplete`.

**Contract**: Zamień:
```java
.concatWith(Flux.just(new ExtractionEvent.AnalysisComplete(caseId.toString())))
```
na:
```java
.concatWith(Flux.defer(() -> {
    List<RedFlagItem> flags = accumulatedFlags.get();
    ExtractionEvent complete = new ExtractionEvent.AnalysisComplete(caseId.toString());
    if (flags.isEmpty()) return Flux.just(complete);
    return Flux.just(new ExtractionEvent.RedFlagsFound(flags), complete);
}))
```

#### 4. ExtractionControllerTest — test RedFlagsFound

**File**: `src/test/java/com/example/clearkyc/analysis/ExtractionControllerTest.java`

**Intent**: Dodaje test weryfikujący że gdy mock `ChatModel` zwraca red flag linię, SSE stream zawiera event `RedFlagsFound` z właściwą kategorią przed `AnalysisComplete`.

**Contract**: Dodaj test `analysisEmitsRedFlagsFound()`. Mock `ChatModel` zwraca Flux z: jedną linią `FieldExtracted` (company name), jedną linią red flag (`{"category":"OPAQUE_OWNERSHIP","description":"test","citations":[]}`), a następnie pusty Flux. Verify: stream zawiera `event: FieldExtracted`, `event: RedFlagsFound`, `event: AnalysisComplete` w tej kolejności.

### Success Criteria:

#### Automated Verification:

- Backend kompiluje: `./mvnw compile`
- Wszystkie testy przechodzą: `./mvnw test`

#### Manual Verification:

- Upload testowego PDF przez UI, trigger analyze — w logach Spring widać `RedFlagsFound` event wysłany przed `AnalysisComplete`.

---

## Phase 3: Backend — JSON Schema v0.3 + FinalizeService

### Overview

Dodaje `red_flags` jako opcjonalne pole do finalization schema (v0.3, backward-compatible). Aktualizuje `FinalizeService` do walidacji przeciwko v0.3.

### Changes Required:

#### 1. finalization-v0.3.json

**File**: `src/main/resources/schema/finalization-v0.3.json`

**Intent**: Nowa wersja schematu finalizacji z opcjonalnym polem `red_flags[]` — addytywna zmiana, stare rekordy v0.1/v0.2 bez `red_flags` pozostają poprawne.

**Contract**: Skopiuj `finalization-v0.2.json`, zmień `title` na `"Finalization Record v0.3"`, dodaj do `properties`:
```json
"red_flags": {
  "type": "array",
  "items": {
    "type": "object",
    "required": ["category", "description"],
    "properties": {
      "category": { "type": "string" },
      "description": { "type": "string" },
      "citations": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["page", "quote"],
          "properties": {
            "page": { "type": "integer" },
            "quote": { "type": "string" }
          }
        }
      }
    }
  }
}
```
Pole `red_flags` NIE trafia do `required` — zachowana backward-compatibility.

#### 2. FinalizeService — update schema version

**File**: `src/main/java/com/example/clearkyc/finalize/FinalizeService.java`

**Intent**: Przestawia walidację schematu JSON z v0.2 na v0.3, żeby rekord z `red_flags` był akceptowany.

**Contract**: Zmień odwołanie do zasobu schematu z `"schema/finalization-v0.2.json"` na `"schema/finalization-v0.3.json"`. Brak innych zmian — `FinalizeService` przechodzi przez payload bez modyfikacji (red_flags będą w payloadzie od frontendu i trafią do rekordu audytu).

### Success Criteria:

#### Automated Verification:

- Backend kompiluje: `./mvnw compile`
- Wszystkie testy przechodzą: `./mvnw test`

---

## Phase 4: Frontend — modele + CaseStore + RedFlagListComponent + wiring

### Overview

Dodaje TypeScript model `RedFlagItem`, rozszerza `ExtractionEvent` union type, aktualizuje SSE parser, dodaje sygnał `redFlags` do `CaseStore`, obsługuje event `RedFlagsFound` w `ExtractionFormComponent`, tworzy `RedFlagListComponent` i wdraża go w `CaseDetailComponent`. Aktualizuje `FinalizePayload`.

### Changes Required:

#### 1. extraction.models.ts — nowe typy

**File**: `web/src/app/core/models/extraction.models.ts`

**Intent**: Dodaje `RedFlagItem` typ i `RedFlagsFound` event do istniejących typów modelu.

**Contract**:
- Dodaj: `export type RedFlagItem = { category: string; description: string; citations: Citation[]; };`
- Rozszerz `ExtractionEvent` union: `| { type: 'RedFlagsFound'; flags: RedFlagItem[] }`
- Rozszerz `FinalizePayload`: dodaj opcjonalne pole `red_flags?: RedFlagItem[]`

#### 2. ExtractionStreamService — parseSSEMessage

**File**: `web/src/app/core/services/extraction-stream.service.ts` (`parseSSEMessage` function)

**Intent**: Obsługuje nowy event type `RedFlagsFound` w parserze SSE.

**Contract**: W bloku `if (eventType === ...)` dodaj:
```typescript
if (eventType === 'RedFlagsFound') return { type: 'RedFlagsFound', flags: payload.flags ?? [] };
```

#### 3. CaseStore — sygnał redFlags

**File**: `web/src/app/core/store/case.store.ts`

**Intent**: Dodaje sygnał `redFlags` przechowujący red flagi otrzymane po analizie oraz metodę `setRedFlags`. Czyści w `reset()`.

**Contract**:
- Dodaj pole: `readonly redFlags = signal<RedFlagItem[]>([]);`
- Dodaj metodę: `setRedFlags(flags: RedFlagItem[]): void { this.redFlags.set(flags); }`
- W `reset()`: dodaj `this.redFlags.set([]);`
- Import `RedFlagItem` z `extraction.models`.

#### 4. ExtractionFormComponent — obsługa RedFlagsFound

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts`

**Intent**: Dodaje obsługę eventu `RedFlagsFound` w subskrypcji SSE stream — dispatches do `caseStore.setRedFlags`.

**Contract**: W `subscribe.next` callback (linia 93–98), dodaj branch:
```typescript
else if (event.type === 'RedFlagsFound') this.caseStore.setRedFlags(event.flags);
```

#### 5. RedFlagListComponent — nowy komponent

**File**: `web/src/app/features/case-detail/components/red-flag-list/red-flag-list.component.ts` (+ `.html` + `.scss`)

**Intent**: Wyświetla listę red flag po zakończeniu analizy. Read-only — każda flaga pokazuje kategorię (badge), opis i odznaki cytowań (klikalne). Sekcja jest ukryta podczas analizy.

**Contract**:
- Selector: `app-red-flag-list`
- Standalone component, imports: `CitationBadgeComponent`
- Injects: `CaseStore`
- Template: `@if (caseStore.caseStatus() === 'ANALYZED' || caseStore.caseStatus() === 'LOCKED')` wraps `@for (flag of caseStore.redFlags(); ...)`. Każdy flag: `<div class="red-flag-item"><span class="category-badge">{{flag.category}}</span><p>{{flag.description}}</p>` + `<app-citation-badge>` per citation.
- Klik cytowania: `caseStore.activeQuote.set({ page: citation.page, quote: citation.quote })` — identyczny mechanizm jak w ExtractionForm.
- Jeśli `caseStore.redFlags().length === 0` i status ANALYZED: wyświetl `<p class="no-flags">Brak zidentyfikowanych red flag.</p>`.
- Scss: styl `category-badge` z kolorem ostrzegawczym (np. `--color-warning` z design system).

#### 6. CaseDetailComponent — import i umieszczenie RedFlagList

**File**: `web/src/app/features/case-detail/case-detail.component.ts` i `.html`

**Intent**: Rejestruje `RedFlagListComponent` w imporcie CaseDetail i umieszcza go w template poniżej `ExtractionFormComponent`.

**Contract**:
- `case-detail.component.ts`: dodaj `RedFlagListComponent` do `imports` array.
- `case-detail.component.html`: dodaj `<app-red-flag-list />` bezpośrednio po `<app-extraction-form />`.

#### 7. Finalizacja — red_flags w payload

**File**: `web/src/app/core/services/case.service.ts` (lub gdzie budowany jest `FinalizePayload`)

**Intent**: Włącza `red_flags` z `CaseStore` do payloadu wysyłanego przy finalizacji.

**Contract**: W metodzie budującej `FinalizePayload`, dodaj `red_flags: this.caseStore.redFlags()` (lub ekwiwalent). Jeśli tablica jest pusta — pole zostanie wysłane jako `[]` (akceptowalne przez v0.3 schema jako opcjonalne).

### Success Criteria:

#### Automated Verification:

- Angular build przechodzi: `cd web && npm run build`
- Brak błędów TypeScript: `cd web && npm run typecheck` (jeśli skonfigurowane)

#### Manual Verification:

- Upload PDF, trigger analyze — sekcja "Red Flags" jest niewidoczna podczas streamingu pól.
- Po zakończeniu analizy sekcja pojawia się jednorazowo z flagami (lub komunikatem "Brak flag").
- Klik cytowania w red fladze → PDF naviguje do właściwej strony + snippet panel.
- Finalizacja (Approve) → rekord audytu zawiera `red_flags` w JSON (sprawdź w logach lub DB).
- Re-analyze (drugi upload) → red flags resetują się i pojawiają na nowo.
- Refresh strony po finalizacji → case zablokowany, brak sekcji Red Flags (LOCKED state obsługiwany).

---

## Testing Strategy

### Unit Tests:

- `ExtractionControllerTest.analysisEmitsRedFlagsFound()` — weryfikuje SSE sequence: FieldExtracted → RedFlagsFound → AnalysisComplete.
- Opcjonalnie: `RedFlagListComponent` spec — verify sekcja ukryta w CREATED/ANALYZING, widoczna w ANALYZED.

### Integration Tests:

- Mock LLM zwracający mix field + red flag linii → kompletna SSE sekwencja.

### Manual Testing Steps:

1. Start backend: `./mvnw spring-boot:run`
2. Start frontend: `cd web && npm start`
3. Zaloguj się, utwórz nowy case, wgraj PDF
4. Trigger analyze — obserwuj streaming pól (sekcja red flag niewidoczna)
5. Po `AnalysisComplete` — sekcja Red Flags pojawia się jednorazowo
6. Kliknij cytowanie w red fladze — PDF naviguje do strony
7. Finalizuj case — sprawdź payload w DevTools Network tab (red_flags obecne)
8. Wgraj nowy PDF do tego samego case (jeśli możliwe) lub utwórz nowy case — red flags resetują się

## References

- PRD: `context/foundation/prd.md` §FR-007, §US-01 Acceptance Criteria
- Roadmap: `context/foundation/roadmap.md` §S-03
- Powiązany plan (S-01): `context/archive/2026-06-01-core-case-flow/plan.md`
- Powiązany plan (S-02): `context/archive/2026-06-01-field-verification-export/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — domain types

#### Automated

- [x] 1.1 Backend kompiluje się bez błędów: `./mvnw compile` — 7d5a36f
- [x] 1.2 Testy przechodzą: `./mvnw test` — 7d5a36f

### Phase 2: Backend — LLM extraction pipeline

#### Automated

- [x] 2.1 Backend kompiluje: `./mvnw compile` — 3c0c4da
- [x] 2.2 Wszystkie testy przechodzą: `./mvnw test` — 3c0c4da

#### Manual

- [x] 2.3 Upload PDF przez UI, trigger analyze — w logach widać RedFlagsFound event przed AnalysisComplete — 3c0c4da

### Phase 3: Backend — JSON Schema v0.3 + FinalizeService

#### Automated

- [x] 3.1 Backend kompiluje: `./mvnw compile`
- [x] 3.2 Wszystkie testy przechodzą: `./mvnw test`

### Phase 4: Frontend — modele + CaseStore + RedFlagListComponent + wiring

#### Automated

- [ ] 4.1 Angular build przechodzi: `cd web && npm run build`

#### Manual

- [ ] 4.2 Sekcja Red Flags niewidoczna podczas streamingu pól
- [ ] 4.3 Sekcja pojawia się po AnalysisComplete z flagami lub komunikatem "Brak flag"
- [ ] 4.4 Klik cytowania w red fladze nawiguje PDF do właściwej strony
- [ ] 4.5 Finalizacja zawiera red_flags w payloadzie (DevTools Network)
- [ ] 4.6 Re-analyze resetuje red flags
