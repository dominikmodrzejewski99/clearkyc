---
date: 2026-06-22T20:10:00+02:00
researcher: Claude Sonnet 4.6 (6x parallel sub-agents)
git_commit: e7349cb3cbf5e52a5d9281070c9aa55782a06228
branch: main
repository: clearkyc
topic: "Refactor opportunities - ranking kandydatów z analizy post-flow"
tags: [research, refactor, sse, extraction-form, case-store, codec, exhaustiveness, field-labels]
status: complete
last_updated: 2026-06-22
last_updated_by: Claude Sonnet 4.6
source_document: context/changes/extraction-form-states/research.md
---

# Research: Refactor opportunities

**Data**: 2026-06-22
**Git Commit**: `e7349cb`
**Źródło**: `context/changes/extraction-form-states/research.md` - analiza maszyny stanów, długu
technicznego i blast radius dla modułu ekstrakcji.

---

## Klasyfikacja problemów ze źródłowego raportu

> Lista audytowalna: każdy problem odnotowany w raporcie bazowym, podzielony na KANDYDATÓW
> (naprawa zmienia strukturę kodu) i nie-kandydatów (zachowane jako wejście do oceny kosztu).

### KANDYDACI (zmiana strukturalna kodu)

| ID | Problem | Źródło w raporcie |
|----|---------|-------------------|
| **K1** | Brak codec layer: `parseSSEMessage()` konsumuje surowy JSON Jacksona bez transformacji ani walidacji | §Architecture Insights #2 |
| **K2** | `fieldLabel()` jako izolowane miejsce wiedzy domenowej: polskie etykiety w metodzie komponentu, zduplikowane z Java SYSTEM_PROMPT | §Architecture Insights #3, §S6 |
| **K3** | `case.store` jako nad-sprzężony hub: Ca=6 konsumentów, 11 sygnałów, brak selektorów ani fasad | §Architecture Insights #1, §S1 |
| **K4** | `getSimpleName()` jako SSE discriminator: nazwa klasy Java = wire name protokołu SSE | §Punkty sprzężenia #1 |
| **K5** | `parseSSEMessage()` if-chain bez exhaustiveness check: nieznany wariant = silent drop | §Punkty sprzężenia #2, §Architecture Insights #2 |
| **K6** | `FinalizeRequest.red_flags: List<Object>`: luźny typ na backendzie; schema waliduje, ale Java traci bezpieczeństwo typów | §Punkty sprzężenia #5 |
| **K7** | Dwa niezależne mechanizmy anulowania: `cancelStream$` (RxJS) + `AbortController` (fetch) | §Architecture Insights #4 |

### Nie-kandydaci (nie-strukturalne - input do oceny wykonalności)

| Problem | Etykieta | Rola w ocenie |
|---------|---------|---------------|
| 12 brakujących przypadków testowych (SSE flow, edit workflow, DecisionBar, re-analiza) | dług | zwiększa koszt każdej migracji - brak siatki bezpieczeństwa |
| Brak mock infrastructure dla `fetch`/`ReadableStream` i `AuthService` | dług | prererekwizyt dla testów integracyjnych K1/K5 |
| U1: Deadlock statusu bazy przy zerwaniu SSE w połowie streamu | ryzyko behawioralne | nie struktura kodu, odrębna sesja analizy |
| U3: Synchronizacja `caseStatus` frontend/backend po analizie | ryzyko behawioralne | odrębna sesja analizy |
| U4: Case z `status=ANALYZING` otwarty po awarii pokazuje idle UI | ryzyko behawioralne | odrębna sesja analizy |
| `Citation.page: int` zakłada non-null bez udokumentowanego kontraktu | luka dokumentacji | nie zmienia struktury kodu |
| Blast radius `RedFlagItem` = 13 plików (nie 8 jak pierwotnie) | wskaźnik | miernik kosztu zmiany, nie problem do naprawy |

---

## Szczegółowa analiza per kandydat

---

### K1: Brak codec layer

#### Obecny kształt (evidence)

`parseSSEMessage()` w `extraction-stream.service.ts:69-91` wykonuje:
1. `JSON.parse(dataLine)` → `unknown` (dowód: `:81`)
2. bezpośredni cast do member union przez if-chain (`:82-85`)
3. brak walidacji kształtu, wersji, wymaganych pól

Konkretna luka: `AnalysisError` w Java (`ExtractionEvent.java:18`) ma dwa pola: `errorCode` i `message`.
TypeScript obsługuje tylko `message` (`extraction.models.ts:34`). Pole `errorCode` jest cicho
porzucane na `:84`: `{ type: 'AnalysisError', message: payload.message ?? String(payload) }`.

Fallback `payload.caseId ?? payload` na `:83` zwróciłby cały obiekt jako string, gdyby Java
zmieniła nazwę pola `caseId` na `id` - bez błędu kompilacji, bez testu, który by to wykrył.

Brak jakichkolwiek wzorców codec-like w codebase (`fromJSON`, `toModel`, `adapter`, `mapper` -
grep zero wyników w `web/src`).

Jedyny test (`extraction-stream.service.spec.ts`) pokrywa wyłącznie wariant `FieldExtracted`.

**Tagowanie:** dowody - evidence; wniosek o fallbackach - inference.

#### Historia i intencjonalność

Wprowadzono w `740341d` (2026-06-01). Plan `core-case-flow/plan.md` §3.6 wskazuje
`parseSSEMessage()` jako punkt rozszerzenia dla nowych wariantów zdarzeń (dodano `RedFlagsFound`
w fazie 4 w `a23e41a`). Decyzja "bez warstwy codec" nie jest wprost uzasadniona w planie
- wynika ze sposobu, w jaki funkcja jest zbudowana: jak najtańszy dispatcher dla SSE.

**Werdykt: świadome ograniczenie** - funkcja działa jako parser minimalny, bez overhead walidacji.
Luka z `errorCode` jest efektem ubocznym pragmatycznego podejścia, nie zamierzoną asymetrią.

#### Wykonalność migracji

- Brak bibliotek walidacyjnych w `package.json` (brak Zod, ajv, yup, valibot, io-ts).
- `parseSSEMessage()` żyje inline w `ExtractionStreamService` - nie ma własnego modułu,
  trudna do przetestowania w izolacji.
- Najmniejsza inkrementalna ścieżka: wydzielenie `parseSSEMessage` do `extraction.codec.ts`
  (blast radius: 1 import w service, 1 nowy plik), a następnie dodanie type guards per wariant.
- Blast radius zmiany nazwy klasy Java (dziś niechroniony): frontend parsuje tylko 4 stringi
  w `parseSSEMessage` - zmiana wymaga równoczesnej aktualizacji frontendu i backendu.
- **Prererekwizyt K5 przed K1**: Union jest już discriminated (`type` field w `extraction.models.ts:31`),
  ale exhaustiveness check nie istnieje. Dodanie switch+never (K5) jako pierwsze utwardza
  punkt, do którego K1 dodaje walidację.

**Pierwszy krok-prererekwizyt**: Zrób K5 (switch+never), potem wydziel `parseSSEMessage`
do `extraction.codec.ts`, dodaj unit testy funkcji w izolacji, potem dodaj runtime type guards.

---

### K2: fieldLabel() jako izolowane miejsce wiedzy domenowej

#### Obecny kształt (evidence)

`extraction-form.component.ts:90-103` (evidence):

```typescript
protected fieldLabel(fieldName: string): string {
  if (fieldName === 'companyName') return 'Nazwa firmy';

  const dirName = fieldName.match(/^directors\[(\d+)\]\.name$/);
  if (dirName) return `Dyrektor ${+dirName[1] + 1} - imie i nazwisko`;

  const uboName = fieldName.match(/^ubos\[(\d+)\]\.name$/);
  if (uboName) return `UBO ${+uboName[1] + 1} - imie i nazwisko`;

  const uboOwn = fieldName.match(/^ubos\[(\d+)\]\.ownershipPercentage$/);
  if (uboOwn) return `UBO ${+uboOwn[1] + 1} - udzial (%)`;

  return fieldName;
}
```

Metoda jest `protected`, wywoływana wyłącznie z szablonu. Grep po `fieldLabel` w `*.ts`
zwraca tylko definicję - wywołania są niewidoczne dla narzędzi szukających po TypeScript.

Backend `ExtractionService.java:45-47` definiuje identyczny katalog pól (evidence):
```
"companyName", "directors[0].name", "directors[1].name",
"ubos[0].name", "ubos[0].ownershipPercentage", ...
```

Dwa niezależne źródła prawdy bez żadnego wspólnego importu ani stałej.

Powiązane znalezisko: 8 reguł polskich etykiet w 3 komponentach:
- `extraction-form.component.ts:90-103` - 4 reguły pól KYB
- `decision-bar.component.ts:35-37` - 3 reguły statusów decyzji
- `case-new.component.ts:84-88` - 4 reguły statusów badge

Brak infrastruktury i18n (zero importów `@ngx-translate`, brak folderu `assets/`). Aplikacja
jest hardcoded monolingual Polish.

**Tagowanie:** kod - evidence; reguły decision-bar/case-new - evidence; rozproszenie - inference.

#### Historia i intencjonalność

Wprowadzono w `120d669` (2026-06-21, "feat(extraction-streaming-ux): rowAppear fade-in + fieldLabel
Polish names"). Brak planu technicznego dla tej decyzji - zmiana wyszła z potrzeby UI bez
architektonicznego planu dla katalogu pól. Raport bazowy §4 (linia ~320) pyta: "Czy fieldLabel()
if-chain powinien być ekstrapolowany do słownika/modelu?" - sygnał, że autor zidentyfikował
to jako dług, nie jako decyzję projektową.

**Werdykt: przypadkowa złożoność** - jedyny taki werdykt w zestawie 7 kandydatów. Brak planu,
brak uzasadnienia, duplikacja z Java. Kod powstał jako najszybsze rozwiązanie potrzeby UI,
bez właściciela architektonicznego.

#### Wykonalność migracji

- Blast radius: 1 import w `extraction-form.component.ts` + 1 nowy plik `field-labels.ts`
  w `web/src/app/core/models/`.
- Zero testów dla `fieldLabel()` - żadnych regresji, które mogłyby się złamać.
- Metoda `protected` wywoływana wyłącznie z szablonu - zmiana sygnatury jest lokalna.
- Cel: stały obiekt/record w `field-labels.ts`, komponent importuje i robi lookup. Regex-logika
  dla wzorców `directors[N]` i `ubos[N]` pozostaje, ale jako czysta funkcja bez stanu.
- Nie wymaga zmian backendu ani wspólnego źródła z SYSTEM_PROMPT (wystarczy single source
  po stronie frontendu; backend i tak definiuje kontrakt przez SSE).

**Pierwszy krok-prererekwizyt**: Utwórz `field-labels.ts` w `core/models/`, przenieś logikę
z komponentu, podmień wywołanie na import. Całość w jednym PR bez ryzyka regresji.

---

### K3: case.store jako nad-sprzężony hub

#### Obecny kształt (evidence)

`case.store.ts:1-65` - `@Injectable({ providedIn: 'root' })` singleton. 11 sygnałów publicznych
(readonly):

```
caseId, caseStatus, entityName, pdfBlob, extractionFields,
isAnalyzing, activePage, analysisError, fieldOverrides, activeQuote, redFlags
```

8 publicznych metod mutacji: `reset, appendField, setOverride, clearOverride, setRedFlags,
markAnalysisError, markAnalyzed, markLocked`.

Brak: computed signals, selektorów, fasad, granic modułowych.

6 konsumentów z różnymi profilami dostępu (evidence):
- `extraction-form`: ~10 reads + 6 method calls - główny hub mutacji
- `case-detail`: 4 reads + 6 direct signal writes - metadata lifecycle
- `case-new`: 0 reads + 3 writes - tylko reset+init
- `decision-bar`: 4 reads + 1 method call - read-heavy finalizacja
- `red-flag-list`: 1 read (`redFlags`) - minimal
- `citation-badge`: 0 reads + 2 direct signal writes (`activePage`, `activeQuote`) - asymetryczny wzorzec

`citation-badge` wstrzykuje store, nie czyta żadnego sygnału, pisze bezpośrednio do dwóch - to
najsilniejszy sygnał niespójnego modelu własności sygnałów (inference).

Jedyny store w całej aplikacji (`find web/src -name "*.store.ts"` zwraca wyłącznie `case.store.ts`).

#### Historia i intencjonalność

Zaprojektowany w `740341d` (2026-06-01), udokumentowany w `core-case-flow/plan.md` §Desired End State
jako "Signals-based singleton". Dodano sygnał `redFlags` w `a23e41a`. Decyzja "jeden centralny store"
jest świadomym wyborem architektonicznym, nie przypadkową akumulacją.

**Werdykt: świadome ograniczenie** - load-bearing, udokumentowany w planie. Store jest tylko 65
wierszy kodu. Spójny z Angular 21 Signals best practices.

#### Wykonalność migracji

Store jest małym, dobrze zarządzanym modułem. Potencjalny podział na 2 store:
- `MetadataStore`: `caseId, caseStatus, entityName, pdfBlob`
- `ExtractionStore`: `extractionFields, isAnalyzing, analysisError, fieldOverrides, redFlags, activePage, activeQuote`

Problem: `extraction-form` i `decision-bar` używają sygnałów z obu domen - podział nie redukuje
ich coupling, tylko wymaga wstrzyknięcia 2 store zamiast 1. Brak zysku przy dodanym koszcie
(6 plików komponentów + 2 pliki store, bez żadnej redukcji kompleksowości).

**Wniosek: brak uzasadnienia do podziału dziś.** Prererekwizyt do przyszłego podziału: nowe
wymaganie, które wymusza separację (np. osobny komponent `PdfViewer` jako właściciel `pdfBlob`,
albo `activePage`/`activeQuote` przeniesione do osobnego "UI coordination store"). Bez takiego
wymagania podział jest prematurową abstrakcją.

---

### K4: getSimpleName() jako SSE discriminator

#### Obecny kształt (evidence)

`ExtractionService.java:161` (evidence):
```java
.event(event.getClass().getSimpleName())
```

Czysta refleksja - zero stałych, zero enum, zero jawnego mappingu. Cztery nazwy wire:
`FieldExtracted`, `AnalysisComplete`, `AnalysisError`, `RedFlagsFound` - dokładnie nazwy klas
Java z `ExtractionEvent.java:11-21`.

`ExtractionControllerTest.java:116,120,125,140-142` (evidence) - hardcoded strings asercji:
```java
int fieldIdx = body.indexOf("FieldExtracted");
int flagsIdx = body.indexOf("RedFlagsFound");
int completeIdx = body.indexOf("AnalysisComplete");
```

Ale testy mockują `ExtractionService` - nie weryfikują, że `.getClass().getSimpleName()` produkuje
te stringi. Rename klasy złamałby test po stronie backendu, ale CI nie uruchamia testów przed
deploym (`fly-deploy.yml` zawiera wyłącznie `flyctl deploy`).

Frontend `extraction-stream.service.ts:82-85` hardcodes te same 4 stringi bez żadnej wspólnej
stałej z backendem.

#### Historia i intencjonalność

Wprowadzono w `62e36a7` (2026-06-01). Plan `llm-streaming-backend/plan.md:73` (evidence):

> "SSE event type jako discriminator: używać `.event(event.getClass().getSimpleName())` w
> ServerSentEvent.builder(). Angular klient (S-01) może używać tego pola do typowania zdarzenia
> bez parsowania `data`."

Decyzja była świadoma i udokumentowana. Sealed interface jako gwarancja zamkniętego zbioru
typów był uzasadnieniem dla braku explicit enum.

**Werdykt: świadome ograniczenie** - udokumentowany w planie. Coupling klasy Java do wire name
był akceptowalnym trade-offem przy sealed hierarchy (tylko 4 dozwolone typy).

#### Wykonalność migracji

Zmiana wymaga równoczesnej atomowej aktualizacji backendu (explicit enum/constant) i frontendu
(aktualizacja stringów w `parseSSEMessage`). Nie można jej staging-ować.

Prererekwizyt, którego brakuje: test weryfikujący, że `event.getClass().getSimpleName()` producuje
oczekiwany string dla każdego wariantu. Bez tego testu przyszły rename nie zostanie wykryty przez CI
(które i tak nie uruchamia testów).

Istniejąca abstrakcja: `RedFlagCategory.java` enum w `analysis/` pokazuje, że wzorzec enum jest
znany i używany. Nowy `SseEventType.java` enum byłby analogiczny.

Blast radius: 2 pliki (ExtractionService.java + extraction-stream.service.ts). Atomowa zmiana,
lokalna, ale ryzykowna bez CI test gate.

**Pierwszy krok-prererekwizyt**: Najpierw dodaj CI test step (lub lokalny pre-deploy hook), potem
napisz test weryfikujący `getSimpleName()` output per wariant. Dopiero wtedy wprowadź explicit enum.

---

### K5: parseSSEMessage() if-chain bez exhaustiveness check

#### Obecny kształt (evidence)

`extraction-stream.service.ts:82-90` (evidence):
```typescript
if (eventType === 'FieldExtracted') return { type: 'FieldExtracted', field: payload };
if (eventType === 'AnalysisComplete') return { type: 'AnalysisComplete', caseId: payload.caseId ?? payload };
if (eventType === 'AnalysisError') return { type: 'AnalysisError', message: payload.message ?? String(payload) };
if (eventType === 'RedFlagsFound') return { type: 'RedFlagsFound', flags: payload.flags ?? [] };
return null;  // :90 - silent drop
```

Subscriber na `:52`: `if (event) subscriber.next(event)` - null jest po cichu porzucany.

`ExtractionEvent` w `extraction.models.ts:31-35` jest już discriminated union z polem `type` (evidence):
```typescript
export type ExtractionEvent =
  | { type: 'FieldExtracted'; field: ExtractionField }
  | { type: 'AnalysisComplete'; caseId: string }
  | { type: 'AnalysisError'; message: string }
  | { type: 'RedFlagsFound'; flags: RedFlagItem[] };
```

Grep `assertNever\|never\|exhaustive` w `web/src/*.ts` - zero wyników (evidence). Brak
exhaustiveness pattern w całym codebase.

`extraction-form.component.ts:129-133` ma symetryczny if-else chain bez fallbacku `else` -
nowy wariant przeszedłby przez bez żadnego efektu i bez błędu kompilacji.

#### Historia i intencjonalność

If-chain jest wzorcem rozszerzalnym - plan §3.6 jawnie wskazuje `parseSSEMessage()` jako punkt
dodania nowych wariantów. `RedFlagsFound` został dodany w `a23e41a` przez dopisanie if-a. Brak
exhaustiveness check jest pominięciem, nie świadomym wyborem dokumentowanym w planie.

**Werdykt: świadome ograniczenie** (rozszerzalność przez if-chain), ale missing compile-time safety
jest luką w jego implementacji - nie projektową decyzją.

#### Wykonalność migracji

Union jest już discriminated (prererekwizyt spełniony). Wystarczy zamienić if-chain na `switch`
z `default: const _exhaustive: never = eventType;` lub equivalentem. Zero zmian w backendzie,
zero zmian w signatury funkcji, zero test rewrites.

Ta zmiana jest prererekwizytem dla K1 (codec layer) - gdy switch+never jest na miejscu, każde
dodanie nowego wariantu do union natychmiast wskazuje brakujący handler.

Blast radius: wyłącznie `parseSSEMessage()` w `extraction-stream.service.ts` (1 funkcja, 1 plik).
Symetryczny handler w `extraction-form.component.ts:129-133` może zostać zaktualizowany przy tej
samej okazji - 2 pliki łącznie.

**Pierwszy krok-prererekwizyt**: Brak - to jedyna zmiana z kandydatów, która nie ma prererekwizytów
technicznych. Możliwa do wdrożenia natychmiast.

---

### K6: FinalizeRequest.red_flags List\<Object\>

#### Obecny kształt (evidence)

`FinalizeRequest.java:10` (evidence):
```java
public record FinalizeRequest(
    DecisionType decision,
    List<FieldRecord> fields,
    List<Object> red_flags)
```

`FinalizeService.java:76-78` (evidence):
```java
if (request.red_flags() != null) {
    payloadMap.put("red_flags", request.red_flags());
}
```

Serwis nie inspekcjonuje pól, nie transformuje, nie waliduje - czyste pass-through do JSON Schema
validator (linia ~81). Walidacja jest zdelegowana do `finalization-v0.3.json:51-72`.

`RedFlagItem.java` istnieje w codebase (evidence) i ma dokładnie ten kształt, który schema wymaga:
`RedFlagCategory category, String description, List<Citation> citations`.

Frontend `extraction.models.ts:74-78` (evidence):
```typescript
export interface FinalizePayload {
  decision: 'APPROVE' | 'REJECT' | 'ESCALATE';
  fields: FieldRecord[];
  red_flags?: RedFlagItem[];
}
```

`decision-bar.component.ts:66`: `red_flags: this.caseStore.redFlags()` - frontend wysyła
poprawnie typowany `RedFlagItem[]`.

Asymetria: frontend jest mocno typowany (`RedFlagItem[]`), backend jest luźny (`List<Object>`).

#### Historia i intencjonalność

Wprowadzono w `a23e41a` (2026-06-01). Commit message (evidence): "Dodaje red_flags do FinalizeRequest
(fix Jackson 3.x unknown field)". Plan `red-flag-taxonomy/plan.md:212-219`: "FinalizeService
przechodzi przez payload bez modyfikacji - red_flags będą w payloadzie od frontendu i trafią
do rekordu audytu."

`List<Object>` był workaroundem dla problemu deserializacji Jackson 3.x przy nowym typie.
Architektonicznie intencją było schema jako source of truth, nie Java type.

**Werdykt: świadome ograniczenie** - Jackson workaround z dokumentowanym uzasadnieniem. Ale
`RedFlagItem.java` istnieje dziś w codebase - pierwotny powód luźnego typowania mógł zostać
usunięty przez późniejsze zmiany.

#### Wykonalność migracji

Jeśli `RedFlagItem.java` jest już poprawnie zdefiniowany, zmiana `List<Object>` → `List<RedFlagItem>`
jest bezpieczna: Jackson deserializuje identycznie (camelCase → snake_case przez `@JsonProperty`
lub konwencję), `FinalizeService` nie wymaga zmian logicznych.

Dodatkowy zysk: błędnie ustrukturyzowany red_flag z frontendu wygeneruje błąd przy deserializacji
Jackson (zamiast 422 ze schema validation bez wskazania pola).

Blast radius: 1 plik Java (`FinalizeRequest.java`) + opcjonalnie 1 test case. Frontend bez zmian.

Ryzyko: jeśli Jackson 3.x nadal ma problem z `List<RedFlagItem>` (co skłoniło do `List<Object>`
w pierwszej kolejności), zmiana wymaga weryfikacji przez uruchomienie testów backendowych lokalnie.

**Pierwszy krok-prererekwizyt**: Sprawdź w testach backendu, czy `DecisionControllerTest` przechodzi
z `List<RedFlagItem>` w payloadzie. Brak prererekwizytów architektonicznych.

---

### K7: Dwa niezależne mechanizmy anulowania

#### Obecny kształt (evidence)

`extraction-form.component.ts:120,127` (evidence):
```typescript
this.cancelStream$.next(); // cancel any in-flight stream
this.streamService.streamAnalysis(caseId, pdfBlob as File)
  .pipe(takeUntil(this.cancelStream$), takeUntilDestroyed(this.destroyRef))
  .subscribe({ ... });
```

`extraction-stream.service.ts:14,30,64` (evidence):
```typescript
const controller = new AbortController();
// ...
signal: controller.signal,
// ...
return () => controller.abort();
```

Weryfikacja §S7 z raportu bazowego: mechanizm działa poprawnie. Teardown chain:
`cancelStream$.next()` → `takeUntil` unsubscribes → `return () => controller.abort()` fires
→ fetch przerwany.

Komponent NIE implementuje `OnDestroy` - używa `takeUntilDestroyed(this.destroyRef)` (evidence).

Oba mechanizmy są komplementarne, nie redundantne: `cancelStream$` obsługuje re-analizę przez
użytkownika; `takeUntilDestroyed` obsługuje lifecycle destruction. Żaden nie może zastąpić drugiego.

#### Historia i intencjonalność

Wprowadzono w `740341d`. Plan nie uzasadnia explicite podwójnego mechanizmu - pattern wyłonił się
jako pragmatyczna implementacja Angular best practices. Raport bazowy §S7 pierwotnie oznaczył
jako U2 ("possible race condition"), ale sam go obalił przez ast-grep verification.

**Werdykt: świadome ograniczenie** - load-bearing pattern, zweryfikowany jako poprawny. Brak
dokumentacji kontraktu jest jedynym defektem.

#### Wykonalność migracji

Brak uzasadnienia dla refaktoru strukturalnego. Oba mechanizmy są konieczne. Jedyna zasadna
akcja to dodanie komentarza dokumentującego kontrakt w `extraction-form.component.ts`.

Blast radius: 0 plików zmiennych. Comment-only.

**Pierwszy krok-prererekwizyt**: Brak. To nie jest kandydat do refaktoru strukturalnego.

---

## Refactor Opportunities

> Ranking 3 najmocniejszych kandydatów według trade-off: koszt długu vs koszt zmiany.
> Dowody przed interpretacją. Ocena na podstawie 6 równoległych sub-agentów badających
> kod, historię gita i wykonalność. To jest propozycja dla sesji planowania - nie decyzja.

---

### #1: K5 - Exhaustiveness check dla parseSSEMessage()

**Obecny kształt**: if-chain z 4 gałęziami + `return null` jako fallback. Nieznany wariant
zdarzenia SSE jest cicho porzucany. Brak compile-time gwarancji.

**Docelowy kształt**: `switch` na `eventType` z blokiem `default: const _exhaustive: never = eventType`
(lub `assertNever(eventType)`). Kompilator wymusza obsługę każdego wariantu union. Nowy wariant
SSE z backendu powoduje błąd kompilacji, nie silent drop.

**Dlaczego zasługuje na #1:**

*Koszt długu*: Niewidoczne ryzyko produkcyjne. Każdy nowy wariant SSE z backendu (lub zmiana
istniejącego) jest cicho porzucany bez logu, bez alertu, bez testu który by to wykrył. Mechanizm
jest aktywny przy każdej analizie dokumentu.

*Koszt zmiany*: Najniższy z kandydatów. 1 funkcja, 1 plik, zero zmian backendu, zero test rewrites.
Discriminated union jest już poprawnie ustrukturyzowany w `extraction.models.ts:31-35` - prererekwizyt
jest spełniony.

*Dodatkowy zysk*: Prererekwizyt dla K1 (codec layer). Gdy switch+never jest na miejscu, każde
rozszerzenie protokołu SSE jest wymuszane przez kompilator.

**Blast radius**: `extraction-stream.service.ts` (parseSSEMessage, 1 funkcja) + opcjonalnie
`extraction-form.component.ts:129-133` (symetryczny handler - warto zaktualizować przy tej
samej okazji). 2 pliki maksymalnie.

**Inkrementalna ścieżka**:
1. Zamień if-chain na switch w `parseSSEMessage()`.
2. Dodaj `default: const _exhaustive: never = eventType; return null;`.
3. Opcjonalnie: zaktualizuj symetryczny handler w `extraction-form.component.ts:129-133`.
4. Uruchom `npm run build` - jeśli kompiluje, zmiana jest bezpieczna.

**Pierwszy krok-prererekwizyt**: Brak. Natychmiastowe.

---

### #2: K2 - fieldLabel() wydzielony do shared constants

**Obecny kształt**: Metoda `protected fieldLabel()` w `extraction-form.component.ts:90-103`
z 4 regex wzorcami mapującymi angielskie nazwy pól KYB na polskie etykiety UI. Niezależna
od `SYSTEM_PROMPT` w `ExtractionService.java:45-47`, który definiuje identyczny katalog.

**Docelowy kształt**: Stały obiekt/record `FIELD_LABELS` w `web/src/app/core/models/field-labels.ts`
zawierający czyste mapowanie i logic regex dla wzorców dynamicznych. Komponent importuje i
deleguje: `protected fieldLabel(f: string): string { return getFieldLabel(f); }`.

**Dlaczego zasługuje na #2:**

*Koszt długu*: Jedyna przypadkowa złożoność (werdykt: **przypadkowa złożoność** - wszystkie
pozostałe kandydaty to świadome ograniczenia). Dodanie nowego pola KYB wymaga 2 równoległych zmian
bez żadnego mechanizmu wymuszającego ich spójność: Java SYSTEM_PROMPT i TypeScript fieldLabel().
Przemilczane pominięcie (nowe pole → fallback do surowego fieldName) jest gorzej widoczne niż błąd.

*Koszt zmiany*: Najniższy po K5. 1 import w komponencie + 1 nowy plik. Zero regresji (brak
testów fieldLabel(), które mogłyby się złamać). Czysta ścieżka refaktoru bez ryzyka.

*Dodatkowy zysk*: Otwiera drogę do analogicznego wydzielenia etykiet z `decision-bar.component.ts`
i `case-new.component.ts` w przyszłości (8 polskich reguł w 3 komponentach - naturalny kolejny krok).

**Blast radius**: 1 komponent (`extraction-form.component.ts`) + 1 nowy plik (`field-labels.ts`).
Zero zmian w backendzie, zero zmian w testach.

**Inkrementalna ścieżka**:
1. Utwórz `web/src/app/core/models/field-labels.ts` z funkcją `getFieldLabel(fieldName: string): string`.
2. Przenieś regex logikę z komponentu do nowego pliku.
3. W komponencie: zamień ciało metody na `return getFieldLabel(fieldName)`.
4. Weryfikacja przez `ng build` bez błędów.

**Pierwszy krok-prererekwizyt**: Brak. Niezależne od K5 i K4.

---

### #3: K6 - FinalizeRequest.red_flags: List\<RedFlagItem\>

**Obecny kształt**: `FinalizeRequest.java:10` deklaruje `List<Object> red_flags`. Jackson 3.x
deserializuje payload frontendu do listy `LinkedHashMap` zamiast `RedFlagItem`. Błąd walidacji
schematu wraca jako 422 bez wskazania pola.

**Docelowy kształt**: `List<RedFlagItem> red_flags` w `FinalizeRequest`. Jackson deserializuje
do typed records. Błąd strukturalny jest wykrywany przy deserializacji z precyzyjnym komunikatem.

**Dlaczego zasługuje na #3:**

*Koszt długu*: Asymetria typów między warstwami. Frontend wysyła `RedFlagItem[]` (strongly typed),
backend przyjmuje `List<Object>` (untyped). `FinalizeService` nie waliduje kształtu - wszystko
delegowane do JSON Schema. Błąd walidacji schematu zwraca 422 bez wskazania pola (schema error
message jest generyczny). Dla analityka debugującego: zły UX.

*Koszt zmiany*: Bardzo niski. `RedFlagItem.java` już istnieje - brak nowej klasy. `FinalizeService`
nie wymaga zmian logicznych (Jackson zajmuje się deserializacją). Frontend bez zmian.

*Ryzyko*: `List<Object>` był workaroundem dla "Jackson 3.x unknown field". Jeśli `RedFlagItem.java`
jest poprawnie skonfigurowany (public record z `@JsonProperty` lub konwencją camelCase), problem
może już nie istnieć. Wymaga weryfikacji przez uruchomienie testów.

**Blast radius**: 1 plik Java (`FinalizeRequest.java`) + 1 test case (optional). Frontend bez zmian.
Atomowe, niezależne od innych kandydatów.

**Inkrementalna ścieżka**:
1. Zmień `List<Object>` na `List<RedFlagItem>` w `FinalizeRequest.java`.
2. Uruchom `./mvnw test` lokalnie.
3. Jeśli testy przechodzą: gotowe. Jeśli Jackson zgłasza problem deserializacji: dodaj
   `@JsonProperty` lub dostosuj nazwy pól w `RedFlagItem`.

**Pierwszy krok-prererekwizyt**: `./mvnw test` weryfikacyjny przed commitem.

---

## Kandydaci rozważeni i odrzuceni

### K1: Codec layer (odrzucony jako niezależna akcja)

**Dlaczego poniżej top 3:** Brak biblioteki walidacyjnej w `package.json`. `parseSSEMessage()`
nie ma własnego modułu - dodanie codec wymaga najpierw K5 (switch+never), potem wydzielenia
do `extraction.codec.ts`, potem dopiero walidacji. Trójfazowa ścieżka z rosnącym blast radius.
Zysk (runtime type safety) jest realny, ale koszt jest najwyższy z grupy. Właściwa akcja:
zaplanować jako fazę po K5.

### K4: getSimpleName() explicit enum (odrzucony bez CI test gate)

**Dlaczego poniżej top 3:** Zmiana atomowa backend+frontend bez siatki bezpieczeństwa.
CI (`fly-deploy.yml`) nie uruchamia testów przed deploym. Testy backendowe mockują `ExtractionService`
- nie weryfikują, że `getSimpleName()` producuje oczekiwany string. Rename klasy mógłby przejść
do produkcji niezauważony. Prererekwizyt: dodanie kroku testowego w CI przed deployem. Bez tego
K4 jest zmianą wysokiego ryzyka mimo lokalnego blast radius.

### K3: case.store split (odrzucony - brak uzasadnienia)

**Dlaczego odrzucony:** Store ma 65 wierszy, 11 sygnałów, 8 metod. Potencjalny podział na
`MetadataStore` + `ExtractionStore` nie redukuje coupling głównego konsumenta (`extraction-form`
używa sygnałów z obu domen). Podział zwiększa złożoność DI bez redukcji odpowiedzialności
komponentów. Brak wymagania biznesowego, które by uzasadniało rozdzielenie.

### K7: Dual cancel mechanism (odrzucony - not a structural refactor)

**Dlaczego odrzucony:** Oba mechanizmy są konieczne i działają poprawnie (zweryfikowane w §S7
raportu bazowego). Jedyny defekt: brak dokumentacji kontraktu. Odpowiedź to komentarz w kodzie,
nie refaktor strukturalny.

---

## Open Questions

1. **K6**: Czy Jackson 3.x nadal wymaga `List<Object>` dla `RedFlagItem`? Wymaga weryfikacji
   przez `./mvnw test` po zmianie - wynik nieznany bez uruchomienia testów.

2. **K4**: Kiedy dodamy krok testowy w CI? Bez tego K4 jest nieuzasadnienie ryzykowny.

3. **K1**: Czy Zod lub lekka alternatywa (czyste type guards) powinna być prererekwizytualnie
   dodana do `package.json`, czy wystarczy `assertNever` + ręczne guards? Decyzja należy do
   sesji planowania.

4. **Powiązanie K2 ze strategią i18n**: Wydzielenie `field-labels.ts` to krok w stronę
   centralizacji polskich etykiet. Czy docelowo aplikacja ma pozostać monolingual, czy jest
   plan na i18n? Odpowiedź wpływa na docelowy kształt (record vs `@ngx-translate`).

---

## Code References

- `web/src/app/core/services/extraction-stream.service.ts:69-91` - parseSSEMessage (K1, K5)
- `web/src/app/core/models/extraction.models.ts:31-35` - ExtractionEvent discriminated union
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts:90-103` - fieldLabel (K2)
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts:129-133` - event dispatch
- `web/src/app/core/store/case.store.ts:1-65` - signals hub (K3)
- `src/main/java/com/example/clearkyc/analysis/ExtractionService.java:161` - getSimpleName (K4)
- `src/main/java/com/example/clearkyc/analysis/ExtractionEvent.java:5-23` - sealed interface
- `src/main/java/com/example/clearkyc/web/dto/FinalizeRequest.java:10` - List<Object> (K6)
- `src/main/java/com/example/clearkyc/domain/RedFlagItem.java` - existing typed record (K6)
- `web/src/app/core/services/extraction-stream.service.ts:14,30,64` - AbortController (K7)
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts:120,127` - cancelStream$ (K7)
- `.github/workflows/fly-deploy.yml` - CI (brak kroku testowego)

## Historical Context

- `context/changes/extraction-form-states/research.md` - źródło; analiza maszyny stanów, blast radius, coupling
- `context/changes/llm-streaming-backend/plan.md` - decyzja getSimpleName() (K4), NDJSON format (K1)
- `context/changes/core-case-flow/plan.md` - decyzja CaseStore Signals singleton (K3), parseSSEMessage (K1)
- `context/changes/red-flag-taxonomy/plan.md` - FinalizeRequest workaround Jackson 3.x (K6)
- Commit `62e36a7` - introduce ExtractionService + getSimpleName()
- Commit `740341d` - introduce ExtractionStreamService, CaseStore, parseSSEMessage if-chain
- Commit `a23e41a` - introduce RedFlagsFound + FinalizeRequest.red_flags List<Object>
- Commit `120d669` - introduce fieldLabel() Polish names
