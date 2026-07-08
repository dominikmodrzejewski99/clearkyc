# CI Test Gate + Explicit SSE Wire-Type Contract (K4) — Plan Implementacji

## Overview

Dwie zależne fazy: najpierw domykamy prererekwizyt (krok testowy w CI blokujący
deploy), potem wykonujemy właściwy refaktor K4 — zastąpienie
`event.getClass().getSimpleName()` jawnym, wyczerpującym mappingiem nazwa-klasy
→ wire-type, chronionym testem który złapie przyszły rename klasy zanim trafi
na produkcję.

## Current State Analysis

- `.github/workflows/fly-deploy.yml` ma jeden job (`deploy`) z jednym krokiem:
  `flyctl deploy --local-only`. Zero testów przed deployem na `main`.
- `lefthook.yml` (pre-commit, lokalnie) uruchamia `cd web && ng test --no-watch`
  tylko gdy staged pliki pasują do `web/src/**/*.spec.ts`, i `./mvnw test` **wcale**
  — backend nie ma lokalnego pre-commit gate'u ani CI gate'u.
- `ExtractionService.java:189`: `.event(event.getClass().getSimpleName())` —
  czysta refleksja, zero stałych. Cztery wire names (`FieldExtracted`,
  `AnalysisComplete`, `AnalysisError`, `RedFlagsFound`) to dokładnie nazwy klas
  z sealed interface `ExtractionEvent.java:5-23`.
- `ExtractionControllerTest.java` (np. `analysisEmitsRedFlagsFound`, linie
  ok. 118-150) mockuje `ExtractionService` i **hardkoduje** `.event("FieldExtracted")`
  wprost w builderze mocka — nie wywołuje nigdy prawdziwego
  `getClass().getSimpleName()`. Rename klasy `FieldExtracted` → cokolwiek innego
  nie złamałby żadnego istniejącego testu.
- `web/src/app/core/services/extraction.codec.ts` (po `extraction-sse-codec`,
  fazie K1) ma `switch (typedEventType)` z 4 literałami stringowymi identycznymi
  z nazwami klas Java, plus `default: never` (K5) — ale to działa tylko na
  wartości, które faktycznie dotarły; nie chroni przed tym, że backend zacznie
  wysyłać inną nazwę.
- Testy backendowe działają na H2 in-memory (`src/test/resources/application.properties`),
  bez zależności od żywego Postgresa — krok `./mvnw test` w CI nie wymaga
  dodatkowych usług/kontenerów.
- `RedFlagCategory.java` (`analysis/`) pokazuje istniejący, znany wzorzec enum
  w tym module — ale K4 nie musi go kopiować: sealed interface `ExtractionEvent`
  już wymusza zamknięty zbiór 4 typów, więc `switch` bez `default` (wyczerpujący
  z mocy kompilatora, Java 21 pattern matching) jest bardziej idiomatyczny niż
  osobny enum wymagający ręcznej synchronizacji z sealed hierarchy.

## Desired End State

Po implementacji:

1. Push na `main` uruchamia testy backendu (`./mvnw test`) i frontendu
   (`npm test -- --watch=false`) **przed** `flyctl deploy` — czerwony test
   blokuje deploy.
2. Test backendowy przypina 4 wire names jako literały (nie przez odbicie
   `getClass().getSimpleName()` na tej samej wartości, którą testujemy) —
   rename klasy `ExtractionEvent.FieldExtracted` łamie ten test.
3. `ExtractionService.java` nie używa już `.getClass().getSimpleName()` —
   wire-type pochodzi z jawnego, wyczerpującego `switch` po sealed interface,
   który kompilator odmówi skompilować, jeśli ktoś doda nowy wariant do
   `ExtractionEvent` bez obsługi w tym switchu.
4. Frontend (`extraction.codec.ts`) niezmieniony w tej fazie co do wartości
   stringów (kontrakt wire pozostaje identyczny) — zmiana jest czysto
   wewnętrzna dla backendu, chroniona nowym testem.

Weryfikacja: `./mvnw test` (lokalnie i w CI) zielone, `npm test -- --watch=false`
zielone, workflow `fly-deploy.yml` pokazuje job `test` przed `deploy` na GitHub
Actions.

## What We're NOT Doing

- **Osobny `SseEventType` enum**: sealed interface już wymusza zamknięty zbiór
  typów; enum wymagałby ręcznej synchronizacji przy każdym nowym wariancie
  zdarzenia, podczas gdy `switch` bez `default` daje tę samą gwarancję za darmo
  od kompilatora. Nie dodajemy enuma, żeby nie duplikować źródła prawdy.
- **Zmiana wire names**: `FieldExtracted`, `AnalysisComplete`, `AnalysisError`,
  `RedFlagsFound` zostają identyczne — to migracja mechanizmu produkującego te
  stringi, nie zmiana kontraktu.
- **Frontend `extraction.codec.ts`**: bez zmian w tej fazie — wire-type stringi
  po stronie TS zostają hardkodowane w `switch`, tak jak dziś (K1 już dał im
  guard + exhaustiveness). Współdzielona stała Java/TS (np. generowany plik)
  to osobna, większa decyzja architektoniczna poza zakresem K4.
- **Testy e2e / lint w CI**: krok CI dodany w tej fazie ogranicza się do
  `./mvnw test` i `npm test` — nie dodajemy Playwright, ESLint ani innych bram
  jakości do `fly-deploy.yml`. To osobna decyzja (Moduł 3 Lekcja 4/5 wg
  `web/CLAUDE.md`).
- **Cache'owanie zależności w CI**: `setup-java`/`setup-node` bez konfiguracji
  cache w tej fazie — optymalizacja czasu builda to osobna, nieblokująca
  poprawka.

## Implementation Approach

Dwie fazy w twardej kolejności: Faza 1 (CI gate) musi wylądować i zostać
zweryfikowana na GitHub Actions (push testowy) zanim Faza 2 (atomowa zmiana
backend+test) zostanie zmergowana — inaczej Faza 2 ląduje bez siatki
bezpieczeństwa, którą miała otrzymać.

---

## Phase 1: CI test gate (prererekwizyt)

### Overview

Dodanie joba `test` do `fly-deploy.yml`, uruchamiającego testy backendu i
frontendu na każdy push do `main`, z jobem `deploy` zależnym od jego
powodzenia (`needs: test`).

### Changes Required

#### 1. `.github/workflows/fly-deploy.yml`

**File**: `.github/workflows/fly-deploy.yml`

**Intent**: Dodaj job `test` przed istniejącym `deploy`, z krokami:
`actions/checkout@v4` → `actions/setup-java@v4` (`distribution: temurin`,
`java-version: '21'`, zgodnie z `<java.version>21</java.version>` w `pom.xml`)
→ `./mvnw test` → `actions/setup-node@v4` (`node-version: '22'`, zgodnie z
lokalnym `node -v`) → `npm ci` w `web/` → `npm test -- --watch=false` w `web/`.
Job `deploy` dostaje `needs: test`, bez innych zmian w swoich krokach.

```yaml
name: Fly Deploy

on:
  push:
    branches:
      - main

concurrency:
  group: fly-deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  test:
    name: Run tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
      - name: Backend tests
        run: ./mvnw test
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Frontend tests
        working-directory: web
        run: |
          npm ci
          npm test -- --watch=false

  deploy:
    name: Deploy to Fly.io
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --local-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

**Incydent podczas weryfikacji (2026-07-07)**: pierwsza wersja tego joba nie miała
`if: github.ref == 'refs/heads/main'`. Podczas weryfikacji 1.2 (push na branch
`ci/sse-explicit-event-type-p1` z tymczasowo rozszerzonym `on.push.branches`)
job `deploy` uruchomił się i **faktycznie zdeployował na produkcję Fly.io**,
mimo że push nie dotyczył `main`. Deploy zakończył się bez błędu i bez
funkcjonalnej różnicy (jedyna zmiana w tym commicie to linia triggera w YAML,
kod aplikacji identyczny z `main`), ale to nieautoryzowana akcja — `needs: test`
gwarantuje *kolejność*, nie *warunek gałęzi*. Dodano `if:` jako trwałe
zabezpieczenie: `deploy` uruchamia się tylko dla `main`, niezależnie od tego,
jakie inne branch'e kiedykolwiek trafią do `on.push.branches` (np. przy
przyszłych testach CI na branchach roboczych).

**Contract**: Backend testy używają H2 in-memory (`src/test/resources/application.properties`)
— żadna dodatkowa usługa (Postgres kontener) nie jest potrzebna w runnerze.
Frontend testy (`ng test --no-watch` przez `npm test -- --watch=false`) nie
wymagają przeglądarki poza tą już skonfigurowaną przez Angular/Vitest builder
w `node_modules` (headless domyślnie w CI).

### Success Criteria

#### Automated Verification

- Plik `fly-deploy.yml` parsuje się jako poprawny YAML (`yamllint .github/workflows/fly-deploy.yml`
  lub `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/fly-deploy.yml'))"`)
- Push na branch testowy (nie `main`, żeby nie wymusić deployu) i ręczne
  potwierdzenie na GitHub Actions, że job `test` się uruchamia i przechodzi

#### Manual Verification

- Sprawdź na GitHub Actions (zakładka Actions), że po pushu na `main` job
  `test` uruchamia się przed `deploy` i `deploy` faktycznie czeka na jego
  wynik (widoczne w grafie jobów)
- Celowo zepsuj jeden test lokalnie (nie commituj), potwierdź że `./mvnw test`
  / `npm test -- --watch=false` faktycznie zwraca kod błędu — upewnia to, że
  krok CI rzeczywiście zablokuje deploy przy czerwonych testach, nie tylko je
  "uruchomi"

**Implementation Note**: Ta faza dotyka wyłącznie CI config — brak zmian w
kodzie aplikacji. Uruchom `./mvnw test` i `npm test -- --watch=false` lokalnie
przed commitem, żeby upewnić się, że oba zestawy testów są dziś zielone (jeśli
nie, Faza 1 sama w sobie zablokuje przyszłe deploye do czasu naprawy —
potwierdź to świadomie przed mergem).

**Bramka potwierdzenia przed push**: Kryterium 1.2 wymaga realnego pusha na
branch testowy (nie `main`) i obserwacji GitHub Actions — to akcja widoczna
na zdalnym repo (może wyzwolić powiadomienia, zużywa minuty CI), nie lokalny
commit. Przed wykonaniem tego pusha implementator **musi** zapytać użytkownika
o jawną zgodę (nazwa brancha, potwierdzenie że to nie `main`) — nie traktować
jako rutynowy krok automatycznej weryfikacji analogiczny do lokalnego
`./mvnw test`.

---

## Phase 2: K4 — Jawny, wyczerpujący mapping wire-type zamiast getSimpleName()

### Overview

Przypięcie testu na obecne wire names jako literały, potem zastąpienie
`.getClass().getSimpleName()` jawnym `switch` po sealed interface
`ExtractionEvent`, wyczerpującym z mocy kompilatora (bez `default`).

### Changes Required

#### 1. Test przypinający wire names

**File**: `src/test/java/com/example/clearkyc/analysis/ExtractionServiceTest.java`
(nowy, jeśli nie istnieje — sprawdź przed utworzeniem, czy testy `ExtractionService`
już gdzieś żyją)

**Intent**: Dodaj test wywołujący prawdziwy `ExtractionService` (nie mock) i
weryfikujący, że wyemitowany `ServerSentEvent.event()` dla każdego z 4
wariantów `ExtractionEvent` równa się oczekiwanemu literałowi (`"FieldExtracted"`,
`"AnalysisComplete"`, `"AnalysisError"`, `"RedFlagsFound"`) — assercja na
literale, nie na `event.getClass().getSimpleName()` (co byłoby tautologią).
Jeśli pełne uruchomienie `streamAnalysis()` wymaga zbyt dużo setupu (LLM
client, DB), test może wywołać bezpośrednio nową metodę `wireType()` z punktu
2 poniżej z instancją każdego rekordu — to wystarcza jako przypięcie kontraktu.

#### 2. `ExtractionService.java`

**File**: `src/main/java/com/example/clearkyc/analysis/ExtractionService.java`

**Intent**: Zastąp `.event(event.getClass().getSimpleName())` (linia 189)
wywołaniem nowej prywatnej metody statycznej `wireType(ExtractionEvent)`:

```java
private static String wireType(ExtractionEvent event) {
    return switch (event) {
        case ExtractionEvent.FieldExtracted e -> "FieldExtracted";
        case ExtractionEvent.AnalysisComplete e -> "AnalysisComplete";
        case ExtractionEvent.AnalysisError e -> "AnalysisError";
        case ExtractionEvent.RedFlagsFound e -> "RedFlagsFound";
    };
}
```

Wywołanie na `:189` zmienia się na `.event(wireType(event))`. Sealed interface
`ExtractionEvent` (`permits FieldExtracted, AnalysisComplete, AnalysisError,
RedFlagsFound`) wymusza wyczerpujący `switch` bez `default` — dodanie nowego
wariantu do sealed interface bez obsługi w tym switchu **nie skompiluje się**,
analogicznie do `default: never` w `extraction.codec.ts` (K5) po stronie
frontendu.

**Contract**: Wire names identyczne z dzisiejszymi (`getClass().getSimpleName()`
i literały w `wireType()` produkują te same 4 stringi) — zero zmiany
zachowania widocznej dla frontendu. Zmiana jest czysto wewnętrzna: odsprzęga
wire-type od nazwy klasy Java, więc przyszły rename klasy (np. refaktor
nazewnictwa) nie zmieni już kontraktu SSE.

#### 3. Aktualizacja istniejących testów (jeśli dotyczy)

**File**: `src/test/java/com/example/clearkyc/analysis/ExtractionControllerTest.java`

**Intent**: Bez zmian wymaganych — testy tego pliku mockują `ExtractionService`
i budują `ServerSentEvent` ręcznie z literałami `.event("FieldExtracted")` itd.,
niezależnie od implementacji `wireType()`. Potwierdź po zmianie, że nadal
przechodzą (powinny, bo nie testują ścieżki przez `wireType()`).

### Success Criteria

#### Automated Verification

- `./mvnw test` przechodzi bez błędów, włącznie z nowym testem przypinającym
  wire names
- Manualna weryfikacja mechanizmu: tymczasowo zmień jeden literał w `wireType()`
  (np. `"FieldExtracted"` → `"FieldExtractedX"`) i potwierdź, że nowy test z
  punktu 1 czerwienieje — potem cofnij zmianę. Dowodzi to, że test faktycznie
  łapie desynchronizację, a nie jest tautologią

#### Manual Verification

- Uruchom analizę dokumentu w UI (backend + frontend lokalnie) — pola
  ekstrakcji, red flagi i zakończenie analizy działają identycznie jak przed
  zmianą (SSE wire names niezmienione, więc `extraction.codec.ts` po stronie
  frontendu nie wymaga żadnej modyfikacji)

**Implementation Note**: Faza 2 może wylądować dopiero po zweryfikowaniu na
GitHub Actions, że Faza 1 (CI gate) faktycznie działa — inaczej ta faza ląduje
bez siatki bezpieczeństwa, którą miała otrzymać jako pierwsza w kolejności.

## Testing Strategy

Faza 1 nie dodaje testów aplikacji — tylko krok CI uruchamiający istniejące
zestawy. Faza 2 dodaje dokładnie jeden nowy test (przypięcie wire names),
zgodnie z minimalnym zakresem tego refaktoru — nie jest to okazja do
rozszerzania pokrycia testowego `ExtractionService` poza to, co K4 wymaga.

## References

- Kandydat i uzasadnienie: `context/changes/refactor-opportunities/research.md` §K4
  (linie ok. 238-296, 604-610)
- Decyzja pierwotna `getSimpleName()`: `context/changes/llm-streaming-backend/plan.md:73`
- Prererekwizyt K1 (już wdrożony, dostarcza `extraction.codec.ts` jako miejsce
  guard/exhaustiveness po stronie frontendu): `context/changes/extraction-sse-codec/plan.md`
- CI obecny stan: `.github/workflows/fly-deploy.yml`
- Pre-commit hooks (nie CI, ale pokrewne): `lefthook.yml`

---

## Progress

> Konwencja: `- [ ]` oczekujące, `- [x]` zrobione. Dopisz ` — <commit sha>` gdy krok ląduje.
> Nie zmieniaj tytułów kroków.

### Phase 1: CI test gate (prererekwizyt)

#### Automated

- [x] 1.1 `fly-deploy.yml` parsuje się jako poprawny YAML
- [x] 1.2 Push na branch testowy potwierdza, że job `test` uruchamia się i przechodzi na GitHub Actions

#### Manual

- [x] 1.3 Job `deploy` czeka na `test` w grafie jobów na GitHub Actions po pushu na `main`
- [x] 1.4 Celowo zepsuty test lokalnie potwierdza, że krok CI faktycznie zwróciłby błąd (zablokowałby deploy)

### Phase 2: K4 — Jawny, wyczerpujący mapping wire-type zamiast getSimpleName()

#### Automated

- [x] 2.1 `./mvnw test` przechodzi bez błędów, włącznie z nowym testem przypinającym wire names
- [x] 2.2 Tymczasowa zmiana literału w `wireType()` powoduje czerwony test (manualna weryfikacja mechanizmu, cofnięta przed commitem)

#### Manual

- [x] 2.3 Analiza dokumentu w UI działa identycznie jak przed zmianą (pola, red flagi, zakończenie analizy)
