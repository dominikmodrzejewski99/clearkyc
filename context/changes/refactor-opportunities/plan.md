# Refactor Opportunities — Plan Implementacji

## Overview

Trzy niezależne, minimalne refaktory eliminujące zidentyfikowany dług techniczny z analizy
`extraction-form-states`. Każda faza zamknięta w osobnym PR, odwracalna, bez prererekwizytów
między fazami (K5 jest prererekwizytem dla przyszłego K1, ale nie blokuje K2 ani K6).

Zakres: **K5** (exhaustiveness check) → **K2** (centralizacja etykiet UI) → **K6** (typed red_flags).

## Current State Analysis

- `parseSSEMessage()` w `extraction-stream.service.ts:82-90`: if-chain z 4 gałęziami + `return null`
  jako silent drop. Discriminated union w `extraction.models.ts:31-35` jest już poprawnie
  zdefiniowany — prererekwizyt exhaustiveness check jest spełniony.
- `fieldLabel()` w `extraction-form.component.ts:90-103`: 4 regex-wzorce mapujące angielskie klucze
  SSE na polskie etykiety UI, inline w komponencie. Analogiczne mapowania w `decision-bar.component.ts:33-39`
  (3 reguły) i `case-new.component.ts:83-92` (4 reguły) — łącznie 11 polskich stringów w 3 komponentach.
- `FinalizeRequest.java:10`: `List<Object> red_flags` jako workaround dla Jackson 3.x; `RedFlagItem.java`
  istnieje w codebase od tamtego czasu — workaround może być nieaktualny.

### Key Discoveries

- `extraction-stream.service.ts:90`: `return null` + subscriber `if (event)` na `:52` — nowy wariant SSE
  z backendu daje 0 błędów, 0 logów, 0 efektu w UI
- `extraction-form.component.ts:129-133`: symetryczny if-else chain bez `else` — identyczna luka
- `ExtractionEvent` (TS) jest discriminated union z `type` field — switch+never działa bez zmian modelu
- `field-labels.ts` nie istnieje: `grep -r "field-labels\|ui-labels" web/src` — zero wyników
- Brak bibliotek walidacyjnych: `package.json` nie zawiera Zod, ajv, valibot, io-ts — type guards
  ręczne, nie biblioteka (K5 nie potrzebuje zewnętrznej biblioteki)
- `RedFlagItem.java` w `domain/` ma pola pasujące do schematu `finalization-v0.3.json`
- `fly-deploy.yml` nie uruchamia testów przed deployem — K6 wymaga lokalnej weryfikacji `./mvnw test`
  przed commitem

## Desired End State

Po implementacji:

1. Nieznany typ zdarzenia SSE powoduje błąd kompilacji TypeScript, nie silent drop w runtime.
2. Wszystkie polskie etykiety UI (`fieldLabel`, `lockedDecisionLabel`, `getCaseBadgeLabel`) importują
   z jednego pliku `ui-labels.ts` — dodanie nowej etykiety = jedna zmiana w jednym miejscu.
3. `FinalizeRequest.java` przyjmuje `List<RedFlagItem>` — Jackson waliduje kształt przy deserializacji,
   a nie dopiero przy schema validation z generycznym 422.

Weryfikacja: `npm run build` + `./mvnw test` przechodzą bez zmian; UI wyświetla identyczne etykiety.

## What We're NOT Doing

- **K1 (codec layer)**: wydzielenie `parseSSEMessage` do `extraction.codec.ts` i dodanie runtime type guards
  wymaga K5 jako prererekwizytu — zaplanowane jako osobna sesja po zamknięciu K5.
- **K3 (case.store split)**: store ma 65 wierszy, brak wymagania biznesowego uzasadniającego podział
  na `MetadataStore` + `ExtractionStore`.
- **K4 (explicit SSE enum)**: atomowa zmiana Java+TypeScript bez kroku testowego w CI — zbyt ryzykowna
  bez CI test gate. Prererekwizyt: dodanie `./mvnw test` do `fly-deploy.yml`.
- **K7 (dual cancel comment)**: `cancelStream$` + `AbortController` działają poprawnie (zweryfikowane
  przez ast-grep). Komentarz dokumentacyjny, nie refaktor strukturalny.
- **Testy integracyjne**: brak mock infrastructure dla `fetch`/`ReadableStream` i `AuthService` — osobna
  sesja po infrastrukturze mock.
- **i18n**: aplikacja pozostaje monolingual Polish. `ui-labels.ts` używa prostych funkcji/stałych,
  bez `@ngx-translate` ani kluczy translacyjnych.

## Implementation Approach

Każda faza jest niezależna i może być zreviewowana osobno. Kolejność K5 → K2 → K6 wynika z:
1. K5 nie ma prererekwizytów i jest prererekwizytem dla przyszłego K1.
2. K2 jest czysto frontendowa, niezależna od K5.
3. K6 jest czysto backendowa z nieweryfikowalnym ryzykiem Jackson — izolacja ułatwia diagnozę.

---

## Phase 1: K5 — Exhaustiveness check dla parseSSEMessage()

### Overview

Zastąpienie if-chain z `return null` na switch z blokiem `default: never`, który powoduje błąd
kompilacji TypeScript przy nieobsłużonym wariancie union. Przy tej okazji — identyczna zmiana
w symetrycznym handler w `extraction-form.component.ts`.

### Changes Required

#### 1. parseSSEMessage() — switch z exhaustiveness guard

**File**: `web/src/app/core/services/extraction-stream.service.ts`

**Intent**: Zastąp 4 if-instrukcje switch-em na `eventType`. Dodaj blok `default` z typem `never`
jako gwarancją kompilacji. Istniejący `return null` na końcu pozostaje jako fallback po narrowing,
ale nigdy nie powinien zostać osiągnięty.

**Contract**: Sygnatura `parseSSEMessage(eventType: string, payload: unknown): ExtractionEvent | null`
pozostaje bez zmian. Wewnętrznie: każdy case switch odpowiada jednej gałęzi starego if-chain. Blok
`default` używa wzorca `const _exhaustive: never = eventType as never; return null;` — gwarantuje błąd
kompilacji przy dodaniu nowego wariantu do union bez obsługi w switch.

#### 2. Event dispatch handler — switch z exhaustiveness guard

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts`

**Intent**: Zastąp if-else chain w handlerze subskrypcji (`:129-133`) switch-em na `event.type`
z blokiem `default: never`. Zachowanie runtime identyczne — zmiana wyłącznie kompilacyjna.

**Contract**: Handler operuje na `ExtractionEvent` (discriminated union) — switch działa na polu
`type`. Blok `default` z wzorcem `never` identyczny jak w punkcie 1.

### Success Criteria

#### Automated Verification

- `npm run build` przechodzi bez błędów TypeScript
- Tymczasowe dodanie nowego wariantu do union `ExtractionEvent` w `extraction.models.ts` powoduje błąd
  kompilacji w obu zmienionych plikach (weryfikacja manualna przed commitem, cofnąć po)

#### Manual Verification

- Uruchom analizę dokumentu w UI — pola ekstrakcji pojawiają się strumieniowo bez regresji
- Konsola przeglądarki wolna od błędów i ostrzeżeń podczas analizy

**Implementation Note**: Po przejściu automated verification, wykonaj weryfikację manualną. Potwierdź
ją przed przejściem do Phase 2.

---

## Phase 2: K2 — Centralizacja polskich etykiet UI

### Overview

Wydzielenie 11 hardcoded polskich stringów z 3 komponentów do jednego pliku `ui-labels.ts`.
Komponenty zamieniają inline logikę na import czystych funkcji. Zachowanie UI identyczne.

### Changes Required

#### 1. Nowy plik z etykietami

**File**: `web/src/app/core/models/ui-labels.ts` (nowy plik)

**Intent**: Eksportuj trzy czyste funkcje bez zależności zewnętrznych:
- `getFieldLabel(fieldName: string): string` — mapowanie kluczy SSE na polskie etykiety pól KYB
  (4 wzorce: exact match + 3 regex dla `directors[N]` i `ubos[N]`)
- `getDecisionLabel(decision: 'APPROVE' | 'REJECT' | 'ESCALATE' | ''): string` — polskie nazwy
  statusów decyzji (3 wartości + pusty fallback)
- `getCaseBadgeLabel(badgeClass: string): string` — polskie etykiety badge'y na liście spraw
  (4 wartości: approved, rejected, escalated, pending)

**Contract**: Regex logika z `fieldLabel()` przeniesiona bez zmian. Każda funkcja zwraca surowy
`fieldName`/`decision`/`badgeClass` jako fallback gdy brak dopasowania — zachowanie identyczne z oryginałem.

#### 2. extraction-form.component.ts

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts`

**Intent**: Zaimportuj `getFieldLabel` z `ui-labels.ts`. Zastąp ciało metody `fieldLabel()` delegacją
do `getFieldLabel(fieldName)`. Metoda `protected fieldLabel()` i jej sygnatura zostają — zmiana tylko
wewnątrz ciała.

#### 3. decision-bar.component.ts

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.ts`

**Intent**: Zaimportuj `getDecisionLabel` z `ui-labels.ts`. Zastąp if-chain wewnątrz computed
`lockedDecisionLabel` wywołaniem `getDecisionLabel(d)`. Computed pozostaje bez zmian kształtu —
tylko logika wewnętrzna.

#### 4. case-new.component.ts

**File**: `web/src/app/features/case-new/case-new.component.ts`

**Intent**: Zaimportuj `getCaseBadgeLabel` z `ui-labels.ts`. Zastąp inline `Record<string, string>`
i lookup `labels[cls]` wywołaniem `getCaseBadgeLabel(cls)`. Metoda `getCaseBadgeLabel()` w komponencie
deleguje do importu.

### Success Criteria

#### Automated Verification

- `npm run build` przechodzi bez błędów TypeScript
- `grep -r "Zatwierdzona\|Odrzucona\|Eskalowana\|W toku\|Nazwa firmy\|Dyrektor\|UBO" web/src/app --include="*.ts"` zwraca wyniki wyłącznie z `ui-labels.ts`

#### Manual Verification

- Etykiety pól KYB wyświetlają się poprawnie w formularzu ekstrakcji (np. "Nazwa firmy", "Dyrektor 1 - imie i nazwisko")
- Badge statusów decyzji wyświetla się poprawnie w `decision-bar` po finalizacji
- Badge statusów wyświetla się poprawnie na liście spraw w `case-new`

**Implementation Note**: Po przejściu automated verification, wykonaj weryfikację manualną. Potwierdź
ją przed przejściem do Phase 3.

---

## Phase 3: K6 — FinalizeRequest.red_flags: List\<RedFlagItem\>

### Overview

Zastąpienie `List<Object>` typowaną listą `List<RedFlagItem>` w `FinalizeRequest.java`.
Jackson 3.x deserializuje payload z frontendu do konkretnych rekordów zamiast `LinkedHashMap<Object>`.
Błąd strukturalny w payloadzie generuje precyzyjny komunikat przy deserializacji, nie generyczny 422
ze schema validation.

### Changes Required

#### 1. FinalizeRequest.java

**File**: `src/main/java/com/example/clearkyc/web/dto/FinalizeRequest.java`

**Intent**: Zmień typ trzeciego pola record z `List<Object>` na `List<RedFlagItem>`. Dodaj import
`RedFlagItem` z `com.example.clearkyc.domain` jeśli jeszcze nie jest importowany.

**Contract**: Sygnatura record zmienia się wyłącznie w typie `red_flags`. `FinalizeService` nie
wymaga zmian logicznych — Jackson obsługuje deserializację. Jeśli `./mvnw test` zgłosi błąd
deserializacji Jackson (pierwotny powód workarounda), dodaj `@JsonProperty` do pól `RedFlagItem`
lub dostosuj konwencję nazewnictwa.

### Success Criteria

#### Automated Verification

- `./mvnw test` przechodzi bez błędów (weryfikacja zgodności Jackson 3.x z `List<RedFlagItem>`)

#### Manual Verification

- Złóż decyzję z red flags przez UI — endpoint `/api/cases/{id}/finalize` zwraca 200 OK
- Złóż decyzję bez red flags (opcjonalne pole) — endpoint zwraca 200 OK

**Implementation Note**: Uruchom `./mvnw test` PRZED commitem. Jeśli testy nie przechodzą z powodu
Jackson deserializacji, zbadaj konfigurację `RedFlagItem.java` przed eskalowaniem do commitu.

---

## Testing Strategy

Ten plan nie dodaje nowych testów — infrastruktura mock dla `fetch`/`ReadableStream`/`AuthService`
niezbędna do testów integracyjnych K5 nie istnieje i jest osobnym długiem technicznym z `research.md`.

**Następna sesja (po tym planie):** testy dla `getFieldLabel()` (izolowana czysta funkcja, łatwa
do pokrycia), testy dla `parseSSEMessage()` (wymaga mock ReadableStream), testy integracyjne K6
z payloadem red flags.

## References

- Research (źródło kandydatów): `context/changes/refactor-opportunities/research.md`
- Analiza maszyny stanów (pierwotna analiza): `context/changes/extraction-form-states/research.md`
- Mapa repozytorium: `context/map/repo-map.md`
- Decision log K6 (workaround Jackson): `context/changes/red-flag-taxonomy/plan.md:212-219`
- Decision log K4 (getSimpleName): `context/changes/llm-streaming-backend/plan.md:73`

---

## Progress

> Konwencja: `- [ ]` oczekujące, `- [x]` zrobione. Dopisz ` — <commit sha>` gdy krok ląduje.
> Nie zmieniaj tytułów kroków. Patrz `references/progress-format.md`.

### Phase 1: K5 — Exhaustiveness check dla parseSSEMessage()

#### Automated

- [x] 1.1 `npm run build` przechodzi bez błędów TypeScript — 73bec65
- [x] 1.2 Tymczasowy wariant union powoduje błąd kompilacji w obu zmienionych plikach (manualna weryfikacja mechanizmu) — 73bec65

#### Manual

- [x] 1.3 Analiza dokumentu w UI przebiega poprawnie, konsola wolna od błędów — 73bec65

### Phase 2: K2 — Centralizacja polskich etykiet UI

#### Automated

- [x] 2.1 `npm run build` przechodzi bez błędów TypeScript
- [x] 2.2 grep polskich stringów zwraca wyniki wyłącznie z `ui-labels.ts`

#### Manual

- [x] 2.3 Etykiety pól KYB poprawne w formularzu ekstrakcji
- [x] 2.4 Badge statusów decyzji poprawny w decision-bar po finalizacji
- [x] 2.5 Badge statusów poprawny na liście spraw w case-new

### Phase 3: K6 — FinalizeRequest.red_flags: List\<RedFlagItem\>

#### Automated

- [ ] 3.1 `./mvnw test` przechodzi bez błędów

#### Manual

- [ ] 3.2 Finalizacja z red flags — endpoint zwraca 200 OK
- [ ] 3.3 Finalizacja bez red flags — endpoint zwraca 200 OK
