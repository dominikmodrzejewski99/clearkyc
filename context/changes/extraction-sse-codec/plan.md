# Extraction SSE Codec Layer (K1) — Plan Implementacji

## Overview

Wydzielenie `parseSSEMessage()` z `ExtractionStreamService` do dedykowanego modułu
`extraction.codec.ts` z type guards per wariant SSE, zamykające dwie znane luki:
brak `errorCode` w `AnalysisError` i niebezpieczny fallback `caseId ?? payload`
w `AnalysisComplete`. Jedna faza, bez prererekwizytów technicznych — K5
(exhaustiveness check) jest już wdrożony w `context/changes/refactor-opportunities/`.

## Current State Analysis

- `parseSSEMessage()` żyje inline w `web/src/app/core/services/extraction-stream.service.ts:69-98`.
  Ma już `switch` z `default: never` (K5 wdrożony) — nieznany `event:` string zwraca `null`
  bezpiecznie, ale brakuje modułu, walidacji kształtu i pełnego pokrycia testami.
- `AnalysisError` w Javie (`src/main/java/com/example/clearkyc/analysis/ExtractionEvent.java:18`)
  to `record AnalysisError(String errorCode, String message)`. TS union w
  `extraction.models.ts:34` ma tylko `{ type: 'AnalysisError'; message: string }` —
  `errorCode` jest cicho odrzucane na `extraction-stream.service.ts:86`.
- `AnalysisComplete` case (`:85`): `payload.caseId ?? payload` — gdyby backend nie wysłał
  `caseId`, `caseId` przyjmie wartość całego obiektu payload jako fallback. Brak testu,
  który by to złapał.
- Jedyny istniejący test (`extraction-stream.service.spec.ts`) pokrywa wyłącznie
  wariant `FieldExtracted` (2 przypadki: NDI i non-NDI wartość).
- Brak bibliotek walidacyjnych w `web/package.json` (brak Zod/ajv/valibot/io-ts) —
  guardy pisane ręcznie, bez zależności zewnętrznej.

## Desired End State

Po implementacji:

1. `parseSSEMessage()` i guardy per wariant żyją w `extraction.codec.ts`, importowane
   przez `extraction-stream.service.ts`.
2. `AnalysisError` niesie `errorCode` od parsowania SSE aż do konsumenta w komponencie.
3. Brak `caseId` w payloadzie `AnalysisComplete` nie podstawia cichego fallbacku —
   zachowanie jawne (log ostrzeżenia + `null`/rzucony błąd, do ustalenia w Phase 1).
4. Wszystkie 4 warianty SSE mają dedykowany test w `extraction.codec.spec.ts`,
   włącznie ze ścieżkami brzegowymi (brak wymaganego pola, nieznany `event:` string).

Weryfikacja: `npm run build` + `npx vitest run extraction.codec.spec.ts` przechodzą;
manualny przebieg analizy z symulowanym `AnalysisError` pokazuje `errorCode` w konsoli/logu.

## What We're NOT Doing

- **Biblioteka walidacyjna (Zod i podobne)**: guardy ręczne, zgodnie z ustaleniem
  z `refactor-opportunities/research.md` — brak w `package.json`, dodanie zależności
  to osobna decyzja.
- **UI dla `errorCode`**: jeśli formularz ekstrakcji nie ma dziś miejsca na kod błędu,
  ta faza dodaje pole do modelu i loguje je; dedykowany UI (np. mapowanie errorCode →
  komunikat PL) to potencjalna kontynuacja, nie część tego planu.
- **Zmiana kontraktu backendu**: `ExtractionEvent.java` pozostaje bez zmian — Java
  już wysyła `errorCode`, tylko TS go gubi.
- **Testy integracyjne pełnego strumienia** (mock `fetch`/`ReadableStream`): poza
  zakresem, jak odnotowano w `refactor-opportunities/plan.md` Testing Strategy —
  osobna sesja po infrastrukturze mock.

## Implementation Approach

Jedna faza, bo zmiana jest spójna (jeden plik źródłowy dzielony na dwa + testy) i
nie ma naturalnego punktu przerwania w połowie.

---

## Phase 1: Wydzielenie codec layer + guardy + testy

### Changes Required

#### 1. `extraction.models.ts`

**File**: `web/src/app/core/models/extraction.models.ts`

**Intent**: Rozszerz wariant `AnalysisError` o `errorCode: string`:
```typescript
| { type: 'AnalysisError'; errorCode: string; message: string }
```

#### 2. Nowy plik `extraction.codec.ts`

**File**: `web/src/app/core/services/extraction.codec.ts` (nowy)

**Intent**: Przenieś `parseSSEMessage()` z `extraction-stream.service.ts` bez zmian
w parsingu nagłówków (`event:`/`data:` split, `JSON.parse` w `try/catch`). Rozbij
ciało `switch` na guardy per wariant:

- `toFieldExtracted(payload: unknown): ExtractionField` — dzisiejsze zachowanie
  (`{ fieldName, value, citations }` z payloadu), bez zmian kontraktu.
- `toAnalysisComplete(payload: unknown): { caseId: string }` — usuwa fallback
  `?? payload` (gdyby backend nie wysłał `caseId`, string całego obiektu nie trafi
  już do `caseId`), ale **nigdy nie zwraca `null`** dla tego wariantu: `caseId`
  jest polem martwym (zweryfikowano: `case.store.ts:97` `markAnalyzed(): void`
  nie przyjmuje argumentów, `extraction-form.component.ts:123` woła
  `markAnalyzed()` ignorując event), więc blokowanie emisji terminalnego eventu
  z powodu brakującego, nieużywanego pola zamieniłoby dzisiejszy nieszkodliwy
  fallback w regresję (flow zawiśnie w `isAnalyzing`, bo `markAnalyzed()` nigdy
  się nie wywoła). Gdy `payload.caseId` nie jest stringiem: `console.warn` i
  ustaw `caseId: ''`, ale zwróć event.
- `toAnalysisError(payload: unknown): { errorCode: string; message: string }` — czyta
  `payload.errorCode` i `payload.message`; gdy `errorCode` brak, fallback na pusty
  string z `console.warn` (nie blokuj wyświetlenia `message`).
- `toRedFlagsFound(payload: unknown): RedFlagItem[]` — zachowaj istniejący fallback
  `?? []` (bezpieczny, nie maskuje błędu backendu — pusta lista red flags jest
  poprawnym stanem).

`parseSSEMessage()` w nowym pliku wywołuje guard odpowiedni dla `case` w `switch`
(struktura `switch`+`default: never` z K5 zostaje identyczna, tylko ciało każdego
`case` deleguje do guarda zamiast budować obiekt inline).

#### 3. `extraction-stream.service.ts`

**File**: `web/src/app/core/services/extraction-stream.service.ts`

**Intent**: Usuń definicję `parseSSEMessage` (linie 69-98) i guardy — zaimportuj
`parseSSEMessage` z `./extraction.codec`. `streamAnalysis()` niezmieniony poza
importem.

#### 4. Konsument `AnalysisError.errorCode`

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts`

**Intent**: W handlerze `case 'AnalysisError':` (`extraction-form.component.ts:124`,
dziś: `case 'AnalysisError': this.caseStore.markAnalysisError(event.message); break;`)
dodaj log `errorCode` przed istniejącym wywołaniem, bez zmiany sygnatury
`markAnalysisError(message: string)`:

```typescript
case 'AnalysisError':
  console.error('[extraction]', event.errorCode, event.message);
  this.caseStore.markAnalysisError(event.message);
  break;
```

Nie dodawaj nowego UI w tej fazie — `errorCode` trafia do logu, nie do
`caseStore`/DOM.

#### 5. Testy — `extraction.codec.spec.ts`

**File**: `web/src/app/core/services/extraction.codec.spec.ts` (nowy)

**Intent**: Przenieś 2 istniejące testy `FieldExtracted` z
`extraction-stream.service.spec.ts` (aktualizując import na `./extraction.codec`).
Dodaj:

- `AnalysisComplete` happy path (`caseId` string obecny).
- `AnalysisComplete` z brakującym `caseId` → oczekuj **eventu z `caseId: ''`**,
  nie `null` i nie fallback na cały obiekt jako string. Event musi dotrzeć do
  subskrybenta w każdym przypadku — regresja na scenariusz z F1 przeglądu planu
  (guard blokujący event zawiesiłby `markAnalyzed()` w `isAnalyzing`).
- `AnalysisError` z `errorCode` i `message` obecnymi → oba pola trafiają do
  wyniku.
- `AnalysisError` z brakującym `errorCode` → `message` nadal dociera, `errorCode`
  pusty string, nie wyjątek.
- `RedFlagsFound` happy path + brak pola `flags` → `[]`.
- Nieznany `event:` string → `null` (regresja na zachowanie K5).
- Malformed JSON w `data:` → `null` (regresja na istniejący `catch`).

`extraction-stream.service.spec.ts` traci testy `parseSSEMessage` (przeniesione)
— jeśli po przeniesieniu plik jest pusty, usuń go; jeśli serwis ma inne testy
poza `parseSSEMessage`, zostaw plik z tym, co zostaje.

### Success Criteria

#### Automated Verification

- `npm run build` przechodzi bez błędów TypeScript
- `npx vitest run extraction.codec.spec.ts` — wszystkie przypadki (7+) zielone
- `npx vitest run` (pełny frontendowy suite) — bez regresji

#### Manual Verification

- Uruchom analizę dokumentu w UI — pola ekstrakcji pojawiają się strumieniowo
  bez regresji (identyczne zachowanie jak przed refaktorem)
- Wywołaj scenariusz z `AnalysisError` z backendu (lub zasymuluj payload w
  DevTools) — `errorCode` widoczny w logu konsoli, `message` nadal wyświetlany
  tam, gdzie dziś jest wyświetlany

**Implementation Note**: Uruchom `npm run build` i pełny `npx vitest run` PRZED
commitem. Potwierdź manualną weryfikację przed zamknięciem fazy.

## Testing Strategy

Ta faza kończy pokrycie testowe dla `parseSSEMessage()` (wcześniej tylko
`FieldExtracted`) — pozostałe 3 warianty + ścieżki brzegowe. Testy integracyjne
pełnego SSE stream (mock `fetch`/`ReadableStream`) pozostają poza zakresem,
zgodnie z `refactor-opportunities/plan.md` Testing Strategy.

## References

- Kandydat i uzasadnienie: `context/changes/refactor-opportunities/research.md` §K1
  (linie ok. 59-107)
- Prererekwizyt K5 (już wdrożony): `context/changes/refactor-opportunities/plan.md`
  Phase 1, commit `73bec65`
- Kontrakt backendu: `src/main/java/com/example/clearkyc/analysis/ExtractionEvent.java`

---

## Progress

> Konwencja: `- [ ]` oczekujące, `- [x]` zrobione. Dopisz ` — <commit sha>` gdy krok ląduje.
> Nie zmieniaj tytułów kroków.

### Phase 1: Wydzielenie codec layer + guardy + testy

#### Automated

- [x] 1.1 `npm run build` przechodzi bez błędów TypeScript
- [x] 1.2 `npx vitest run extraction.codec.spec.ts` — wszystkie przypadki zielone
- [x] 1.3 `npx vitest run` (pełny suite) bez regresji

#### Manual

- [x] 1.4 Analiza dokumentu w UI przebiega poprawnie, bez regresji
- [x] 1.5 `AnalysisError.errorCode` widoczny w logu przy symulowanym błędzie backendu
