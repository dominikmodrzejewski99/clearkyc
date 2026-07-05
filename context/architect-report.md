---
title: ClearKYC — Raport architektoniczny (Moduł 4 / 10xArchitect)
created: 2026-06-24
type: architect-report
artefakty:
  L2: context/map/repo-map.md
  L3: context/changes/refactor-opportunities/research.md
  L4: context/changes/refactor-opportunities/plan.md
  L5: context/domain/01-domain-distillation.md / 02-invariant-aggregate-refactor.md / 03-anti-corruption-layer.md
---

# ClearKYC — Raport architektoniczny

## 1. Opisane projekty

Wszystkie cztery artefakty (L2–L5) dotyczą jednego repozytorium.

| Repo | Stack | Skala | Artefakty |
|---|---|---|---|
| **ClearKYC** | Spring Boot 4 + Java 21 + Angular 21 + PostgreSQL + Auth0 + Spring AI | 1 dev, 90 commitów / 5 tyg., ~40 modułów FE | L2, L3, L4, L5 |

---

## 2. Mapa projektu (L2)

**Centrum grafu:** `case.store.ts` (Ca=6) — sześć konsumentów ze wspólnym sprzężeniem przez stan sygnałów. Zmiana kształtu stanu synchronicznie wymusza aktualizację w `shared/` i `features/` przez dwie warstwy architektoniczne jednocześnie. `extraction.models.ts` (Ca=8) to największy "contractual hub" typów.

**God component:** `case-detail.component.ts` (Ce=12, I=92%, churn #1-2) importuje `AppLayoutComponent` bezpośrednio — potwierdzone naruszenie granic warstw niewychwycone przez reguły dependency-cruiser.

**Folder #1 churn:** `extraction-form/` — 26 zmian w 5 tygodniach. SSE stream + RxJS + store + maszyna stanów (idle/streaming/complete/error) bez żadnej dokumentacji stanów pośrednich.

**Ukryte naruszenie warstw:** `shared/decision-bar` i `citation-badge` czytają `case.store.ts` bezpośrednio — komponenty opisane jako "reużywalne" są domenowo zabetonowane.

**Unknown #1:** Graf zależności backendu Java — brak odpowiednika dependency-cruiser. Powiązania `CaseService ↔ FinalizeService ↔ ExtractionService` wnioskowane wyłącznie z `git log` (co-change), nie z analizy statycznej.

---

## 3. Analiza ficzera (L3)

**Badany przepływ:** maszyna stanów SSE w `ExtractionFormComponent` + `ExtractionStreamService`. Wybór wynika bezpośrednio ze strefy ryzyka #5 z mapy: folder #1 churn, brak dokumentacji stanów, brak mock infrastructure.

**Feature overview:** Analityk klika "Analyze" → `extraction-stream.service.ts` otwiera SSE przez Fetch API z tokenem Auth0 → parser `parseSSEMessage()` dekoduje zdarzenia NDJSON → `CaseStore` akumuluje sygnały (`extractionFields`, `redFlags`, `caseStatus`). Stan powraca przez bindingi szablonu i `pdf-viewer`.

**Technical debt (top 3):**

1. **Silent drop przy nieznanym wariancie SSE (K5) — potwierdzony ast-grepem:** `parseSSEMessage()` w `extraction-stream.service.ts:82-90` używa if-chain; brak exhaustiveness check → nowy typ zdarzenia = zero błędów, zero logów, zero efektu w UI. Symetryczna luka w handlerze `extraction-form.component.ts:129-133`.

2. **Brak codec layer (K1, odłożony):** `JSON.parse()` → bezpośredni cast bez runtime validation. Pole `errorCode` z `ExtractionEvent.AnalysisError` jest cicho porzucane (`extraction-stream.service.ts:84`). Fallback `payload.caseId ?? payload` zwróciłby cały obiekt jako string przy zmianie nazwy pola w Java — bez błędu kompilacji.

3. **11 polskich etykiet UI w 3 komponentach (K2):** `fieldLabel()` w `extraction-form`, etykiety decyzji w `decision-bar`, badge-labels w `case-new` — zduplikowane i niezsynchronizowane z `SYSTEM_PROMPT` w Java.

---

## 4. Plan refaktoryzacji (L4)

**Co refaktoryzowane:** trzy minimalne, niezależne zmiany (K5 → K2 → K6). Wszystkie trzy zostały zaimplementowane i zamknięte.

**Wybrany zakres (i co świadomie pominięto):**
- **K3** (podział `case.store`): store ma 65 linii, brak wymagania biznesowego — odrzucony.
- **K1** (codec layer): wymaga K5 jako prererekwizytu + mock infrastructure dla fetch — odłożony na osobną sesję.
- **K4** (explicit SSE enum): atomowa zmiana Java+TypeScript bez CI test gate — zbyt ryzykowna.

**Fazy:**

| Faza | Co | Weryfikacja |
|---|---|---|
| K5 (p1) | Exhaustiveness check (`switch` + `never`) w `parseSSEMessage` i handlerze subskrypcji | `npm run build` (kompilacja), `ng test` |
| K2 (p2) | Centralizacja etykiet UI do `ui-labels.ts`; 3 komponenty importują zamiast definiować | `ng test`, grep po `directors\[` |
| K6 (p3) | `FinalizeRequest.red_flags: List<Object>` → `List<RedFlagItem>` w Javie | `./mvnw test` |

---

## 5. Domena wg DDD (L5)

**Ubiquitous Language — 5 kluczowych pojęć:**

| Pojęcie | Definicja | Rozjazd model vs. kod |
|---|---|---|
| **Trust Contract** | Każde pole ma cytat LUB marker NDI — nigdy pewna wartość bez proweniencji | PRD Guardrail; backend nie egzekwuje — `finalization-v0.3.json` nie ma warunku `if value != NDI then citations minItems:1` |
| **Citation** | Verbatim cytat z dokumentu + numer strony | `Citation.java:3` poprawny; historyczny bug: pole nazwane `pageNumber` zamiast `page` — naprawiony w `citation-scroll-fix` |
| **NDI Marker** | "Not Disclosed / Inferred Missing" — pierwszorzędna wartość, nie brak danych | Obecny jako string literal w `SYSTEM_PROMPT:49` i `extraction-form.component.ts:97`; brak typowanego wariantu w `ExtractionEvent` |
| **Terminal Decision** | Approve / Reject / Escalate — zamyka case | `DecisionType.java:3` — poprawnie zaimplementowany |
| **KYB Case** | Jedna sprawa weryfikacji B2B — od uploadu PDF do decyzji | `KybCase.java:12` — JPA entity; brak metod domenowych (settery publiczne, logika w serwisach) |

**Niezmiennik #1 i agregat:** INV-1 (Trust Contract) należy do agregatu `KybCase`. Propozycja: Value Object `CitedField.of()` rzuca `TrustContractViolationException` przy naruszeniu (non-NDI + puste citations); `KybCase.finalize(List<CitedField>, Instant)` jako jedyne wejście do stanu LOCKED. Dziś: FinalizeService bezpośrednio mutuje `setStatus()` przez public setter; backend przyjmuje pola bez cytatów bez błędu.

**Anti-Corruption Layer:** Spring AI (`org.springframework.ai.*`) przecieka przez 12 linii w `ExtractionService.java` — jedyny serwis, który łączy trzy odpowiedzialności: zarządzanie stanem KybCase, wywołania Spring AI SDK i parsowanie NDJSON. CLAUDE.md deklaruje SDK jako niewybrany ("confirm before adding dependency"). Propozycja: port `DocumentAnalysisPort` + adapter `SpringAiDocumentAnalysisAdapter` — po refaktorze `grep -rn "springframework.ai" src/` zwraca wyłącznie plik adaptera.

---

## 6. Decyzje, które należą do mnie

**Spring AI jako SDK LLM:** Wybrałem Spring AI świadomie, nie dlatego że był "najlepszy" dla tego projektu — PRD zostawiło SDK jako niewybrany. Wybrałem go bo chcę rozwijać znajomość Spring, a stack bankowy w Polsce to Java i Angular. To decyzja edukacyjna, nie architektoniczna. Wiem, że wiąże mnie z konkretnym providerem bardziej niż powinno, i że trzeba będzie to odseparować przez ACL zanim wymienię model.

**Taksonomia red flag:** Zaimplementowałem 6 kategorii ze swojej głowy, bo PRD wskazało je jako kandydatów. Nie mam jeszcze design-partnera — przed produkcją kategorie muszą zostać zwalidowane przez kogoś ze świata compliance bankowego. Plan: przy pierwszym kontrahenciku zapytać ich analityków o używaną taksonomię ryzyka; ewentualnie znaleźć aktywnych analityków KYB na LinkedIn i przeprowadzić krótki wywiad. Hardcoded enum to świadome przyjęcie ryzyka biznesowego na czas MVP.

**PDF jako BLOB:** Świadoma decyzja na MVP — jeden analityk, dokumenty testowe, żadnego ruchu produkcyjnego. Na razie upraszcza deployment (zero zewnętrznych usług). Gdy pojawi się pierwszy prawdziwy klient z prawdziwymi dokumentami, przeniosę pliki poza bazę — bo wtedy zaczną się liczyć rozmiar wierszy, backup i GDPR (prawo do usunięcia danych osobowych jest prostsze gdy plik leży na zewnętrznym storage, a nie w środku tabeli biznesowej).
