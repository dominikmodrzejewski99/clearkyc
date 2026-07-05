---
title: ClearKYC — Domain Distillation
created: 2026-06-24
type: domain-distillation
sources:
  - context/foundation/prd.md
  - context/foundation/tech-stack.md
  - src/main/java/com/example/clearkyc/**
  - web/src/app/**
  - src/main/resources/schema/finalization-v0.3.json
---

# ClearKYC — Domain Distillation

## KROK 0 — Kontekst projektu

**Produkt:** ClearKYC — narzędzie wspomagające Senior KYB Analityków bankowych przy weryfikacji skomplikowanych dokumentów B2B (trust deeds, akty założycielskie, wyciągi rejestrowe). Rdzeń produktu: LLM czyta PDF, strumieniuje ustrukturyzowane dane z proweniencją (cytaty), analityk weryfikuje i zatwierdza. Produkt NIE zastępuje istniejących narzędzi KYC (Actimize, Lexis Bridger) — jest warstwą nad dokumentami narracyjnymi.

**Źródła wymagań:** `context/foundation/prd.md` (kompletny PRD, status draft v1), `context/foundation/tech-stack.md`.

**Stack:** Spring Boot 4.0.6 + Java 21 + PostgreSQL + Angular SPA (`web/`). Deployment: Fly.io. Auth: OAuth2 JWT (Auth0).

**Struktura warstw:**

| Warstwa | Pakiet / katalog | Co tam jest |
|---|---|---|
| Domena | `src/.../domain/` | `KybCase`, `AuditRecord`, `CaseStatus`, `DecisionType` |
| Analiza/LLM | `src/.../analysis/` | `ExtractionService`, `ExtractionEvent` (sealed), `Citation`, `RedFlagItem`, `RedFlagCategory` |
| Aplikacja | `src/.../service/` | `CaseService`, `FinalizeService` |
| API | `src/.../web/` | Kontrolery + DTOs |
| Frontend store | `web/.../core/store/` | `CaseStore` (Angular signals) |
| Frontend modele | `web/.../core/models/` | `extraction.models.ts` |

---

## KROK 1 — Ubiquitous Language

Dla każdego pojecia: definicja, cytat ze zrodla, lokalizacja w kodzie lub adnotacja BRAK.

### 1.1 Pojecia z PRD (odkryte, nie wymyslone)

| # | Pojecie | Definicja | Cytat (plik:linia) | Kod (plik:linia) |
|---|---|---|---|---|
| 1 | **KYB Case** | Pojedynczy dokument B2B w trakcie lub po weryfikacji | `prd.md:52` "create a new case by attaching a complex B2B PDF" | `domain/KybCase.java:12` — @Entity `kyb_case` |
| 2 | **Senior KYB Analyst** | Jedyna rola w MVP; weryfikuje, nadpisuje, podejmuje decyzje | `prd.md:28` "Primary persona: Senior KYB Analyst" | `SecurityConfig.java:30` — JWT OAuth2; brak modelu roli w kodzie |
| 3 | **Entity** | Ustrukturyzowany fakt wyekstrahowany z dokumentu: nazwa firmy, dyrektorzy, UBO | `prd.md:55` "extracted entities (company name, directors, UBOs)" | `ExtractionEvent.FieldExtracted:11` — `fieldName`, `value`, `citations` |
| 4 | **Citation** | Verbatim cytat z dokumentu z numerem strony | `prd.md:57` "verbatim quoted-snippet citations" | `analysis/Citation.java:3` — `record Citation(String quote, int page)` |
| 5 | **Not Disclosed / Inferred Missing (NDI)** | Pierwszorzedna wartosc pola gdy model nie znalazl danych — nie puste pole, lecz jawny marker | `prd.md:64` "explicit 'Not Disclosed / Inferred Missing' marker rather than an empty value" | `ExtractionService.java:49` — string literal w system prompt; `extraction-form.component.ts:97` — `isMissing()` |
| 6 | **Red Flag** | Wskaznik ryzyka powiazany z taksonomia, emitowany PO pelnej analizie dokumentu | `prd.md:85` "red flags appear at end-of-analysis bound to the closed risk taxonomy" | `analysis/RedFlagItem.java:5` — `record RedFlagItem(RedFlagCategory, String, List<Citation>)` |
| 7 | **Red Flag Taxonomy** | Zamkniety zbior kategorii ryzyka (Open Question 1 w PRD) | `prd.md:145` "Block: yes — FR-007 cannot be implemented without it" | `analysis/RedFlagCategory.java:3` — enum z 6 wartosciami (SANCTIONS_EXPOSURE, SHELL_COMPANY_INDICATORS, JURISDICTION_RISK, OPAQUE_OWNERSHIP, PEP_LINKAGE, SECTOR_SPECIFIC_RISK) |
| 8 | **Terminal Decision** | Jedna z trzech decyzji zamykajacych sprawe: Approve / Reject / Escalate | `prd.md:97` "lock a case by selecting one of three terminal decisions" | `domain/DecisionType.java:3` — enum APPROVE, REJECT, ESCALATE |
| 9 | **Finalization Record** | Schema-validated JSON z: danymi, cytatami, uzasadnieniami nadpisow, decyzja | `prd.md:99` "machine-readable JSON record...strictly validated against a versioned JSON Schema" | `resources/schema/finalization-v0.3.json`; `FinalizeService.java:52` — `@PostConstruct loadSchema()` |
| 10 | **Override Justification** | Obowiazkowa nota tekstowa przy kazda nadpisie wartosci AI | `prd.md:92` "mandatory short override-justification note required for any override" | `web/dto/FieldOverride.java:3` — `record FieldOverride(originalValue, newValue, justification)` |
| 11 | **Audit Record** | Jeden wiersz na finalizacje: tozsamosc, timestamp, decyzja, JSON payload | `prd.md:103` "the system records the locked case state as a single audit record" | `domain/AuditRecord.java:13` — @Entity `audit_record` z JSONB payload |
| 12 | **Trust Contract** | Kazde wyswietlone pole ma cytat LUB marker NDI — nigdy pusta pewna odpowiedz | `prd.md:111` "every populated field shown in the UI is justifiable" | BRAK egzekucji w backendzie (patrz KROK 4, rozjazd #1) |
| 13 | **Click-to-Cite** | Klikniecie pola nawiguje PDF viewer do cytowanej strony z podswietleniem tekstu | `prd.md:93` FR-014 "clicks a field and the embedded source-document view navigates to the relevant page" | `extraction-form.component.ts:100` — `navigateToCitation()`; `case.store.ts:15` — `activePage`, `activeQuote` signals |
| 14 | **Analysis Trigger** | Jawna akcja analityka uruchamiajaca model — celowy "bezpiecznik" przed kosztowna inferencia | `prd.md:79` "explicit 'Analyze' action...deliberate safety latch" | `ExtractionController` (brak listingu — plik nie odczytany bezposrednio); `ExtractionService.java:77` — `streamAnalysis()` |
| 15 | **Case Lifecycle** | Stany: CREATED -> ANALYZING -> ANALYZED -> LOCKED | PRD implicit w FR-004 do FR-011 | `domain/CaseStatus.java:4` — enum CREATED, ANALYZING, ANALYZED, LOCKED |

### 1.2 Pojecia tylko w kodzie (odkryte, nie w PRD)

| Pojecie | Definicja kodowa | Plik:linia | Status |
|---|---|---|---|
| `ExtractionEvent` (sealed) | Polimorficzny typ zdarzenia SSE; podtypy: FieldExtracted, RedFlagsFound, AnalysisComplete, AnalysisError | `analysis/ExtractionEvent.java:5` | Dobre odwzorowanie domeny — brak odpowiednika w PRD bo to szczegol implementacyjny |
| `CaseStore` | Angular signals store; centralizuje mutacje stanu analizy w warstwie UI | `core/store/case.store.ts:5` | Brak odpowiednika w PRD — architektoniczna decyzja frontendowa |
| `entityName` | Nazwa encji wyprowadzona z nazwy pliku PDF (bez `.pdf`) | `KybCase.java:35`, `CaseController.java:46` | Niejawne zalozenie: PRD nie specyfikuje jak pozyskac nazwe |
| `pdfData` (BLOB) | PDF przechowywany jako `byte[]` w PostgreSQL | `KybCase.java:38` | PRD nie specyfikuje storage — wybor implementacyjny z ryzykiem (patrz KROK 4, rozjazd #4) |

---

## KROK 2 — Subdomeny: Core / Supporting / Generic

Kryterium podzalu: PRD "The high-density real-time UI that surfaces extracted facts with provenance — not the model call itself — is the durable advantage" (`prd.md:24`).

| Obszar | Kategoria | Uzasadnienie |
|---|---|---|
| **Streaming ekstrakcji LLM + parsowanie NDJSON** | Core | Rdzen przewagi — strumieniowanie jako wskaznik postepu buduje zaufanie analityka (`prd.md:84`). Bez tego produkt jest zwyklym form-fillerem. |
| **Trust Contract: Citation linkage + NDI marker** | Core | "The trust-contract integrity" to NFR i primary success criteria (`prd.md:111`). Kazde pole bez proweniencji niszczy propozycje wartosci. |
| **Click-to-cite (FR-014)** | Core | Bezposrednia weryfikacja AI przez analityka w jednym widoku — to co inkumbenci (Actimize) nie maja (`prd.md:24`). |
| **Red Flag classification (taksonomia)** | Core | Taksonomia to "Block: yes" (`prd.md:145`); bez niej analityk nie moze ufac wynikom — czerwone flagi bez kategorii to szum. |
| **Finalization z JSON Schema + Audit Record** | Core | Regulator wymaga atrybuowanego, niemutowalnego zapisu (`prd.md:103`). To jedyne co pozostaje po sesji. |
| **Override justification** | Core | Mechanizm ktory rozroznia produkt od "AI pisze, czlowiek podpisuje" — analityk zostaje autorem decyzji, nie tylko podpisujacym (`prd.md:91`). |
| **Case lifecycle management (CREATED..LOCKED)** | Supporting | Niezbedny kontener dla Core workflow, ale nie rozrozniajacy — typowe dla compliance toolow. |
| **PDF storage i retrieval** | Supporting | Konieczny do click-to-cite i re-analizy, ale to czysto infrastrukturalna odpowiedzialnosc. |
| **Autentykacja OAuth2/JWT** | Generic | Managed IdP (Auth0), konfiguracyjna sciezka do SSO banku (`prd.md:73`). Standardowy wzorzec, zero innowacji domenowej. |
| **Persistencja JPA/PostgreSQL** | Generic | Infrastruktura. Spring Data JPA. |

---

## KROK 3 — Kandydaci na agregaty i ich niezmienniki

### 3.1 Agregat: KybCase

**Granica:** Jeden przypadek weryfikacji B2B — od zalaczenia PDF do zamkniecia decyzja.

**Niezmienniki:**

| # | Niezmiennik | Zrodlo (cytat) | Status w kodzie |
|---|---|---|---|
| I-1 | LOCKED case nie moze byc modyfikowany | `prd.md:97` "lock a case"; implied by FR-011 | **Egzekwowany** — `CaseService.java:36-38` (update) + `FinalizeService.java:64` (finalize) + `ExtractionService.java:85-87` (re-analyze) |
| I-2 | AuditRecord musi byc zapisany PRZED zmiana statusu na LOCKED | `prd.md:47` "finalization record is written before the UI confirms the decision" | **Egzekwowany** — `FinalizeService.java:96-101`: `auditRecordRepository.save()` przed `kybCase.setStatus(LOCKED)` w jednej transakcji |
| I-3 | Finalization payload musi przejsc walidacje JSON Schema PRZED zapisem | `prd.md:99` "strictly validated against a versioned, explicitly defined JSON Schema" | **Egzekwowany** — `FinalizeService.java:81-87`: Schema validation, HTTP 422 on failure |
| I-4 | Kazde wyswietlone pole musi miec niepusty array cytatow LUB wartosc NDI | `prd.md:46` "No extracted field is ever displayed without an accompanying source citation" | **IGNOROWANY** — `finalization-v0.3.json` nie wymaga `citations` min 1 element dla pol bez NDI; backend przyjmuje puste tablice |
| I-5 | Override wymaga niepustego uzasadnienia | `prd.md:92` "mandatory short override-justification note" | **Deklarowany** — frontend: `extraction-form.component.ts:62` wymusza niepusty string; backend JSON Schema: `justification` wymagany ale brak `minLength:1` w `finalization-v0.3.json` |

### 3.2 Agregat: ExtractionField (Value Object w KybCase)

**Uwaga:** ExtractionField nie jest persystowany miedzy sesjami — zyje tylko w `CaseStore` i docelowo w payload `AuditRecord`.

| # | Niezmiennik | Zrodlo | Status |
|---|---|---|---|
| I-6 | Pole musi miec cytaty LUB wartosc NDI — nigdy pewna wartosc bez proweniencji | `prd.md:64,111` | **IGNOROWANY** w backendzie; **Deklarowany** czesciowo w frontend `isMissing()` (`extraction-form.component.ts:96`) |

### 3.3 Value Object: Citation

| # | Niezmiennik | Zrodlo | Status |
|---|---|---|---|
| I-7 | `quote` musi byc verbatim tekstem z dokumentu | `prd.md:57` "verbatim quoted-snippet citations" | **IGNOROWANY** — walidacja niemozliwa bez cross-referencji z PDF; trust-based (model) |
| I-8 | `page` jest best-effort (0 jesli nieznana) | `ExtractionService.java:55` "page is best-effort (0 if unknown)" | **Egzekwowany** przez konwencje — `Citation.java:3` `int page` default 0 |

---

## KROK 4 — Rozjazdy: MODEL vs KOD

| # | Dokument mowi | Kod robi | Dowod (plik:linia) |
|---|---|---|---|
| R-1 | **Trust Contract**: zadne pole nie moze byc wyswietlone bez cytatu lub markera NDI | Backend przyjmuje `FieldRecord` z `citations: []` i bez NDI jako `value` bez bledu; JSON Schema nie narzuca `minItems:1` ani warunku `if value != NDI then citations non-empty` | `finalization-v0.3.json:23-32` — `citations` jest opcjonalne, brak `minItems`; `FieldRecord.java:5` — brak @NotEmpty |
| R-2 | **Taksonomia** jest "Open Question, Block: yes" — nie mozna implementowac bez formalnego katalogu banku | Taksonomia jest zaimplementowana jako hardcoded Java enum z 6 wartosciami kandydackimi z PRD | `analysis/RedFlagCategory.java:3-10` vs `prd.md:145` |
| R-3 | **Override justification** jest obowiazkowe i musi byc niepuste | Backend JSON Schema wymaga pola `justification` (string) ale nie `minLength:1` — pusty string przejdzie walidacje | `finalization-v0.3.json:52` — `"justification": {"type":"string"}` brak `minLength`; frontend `extraction-form.component.ts:62` chroni przez UI |
| R-4 | **Pola ekstrakcji** musza przezyc przeladowanie strony ("reloading the page returns same locked values") | ExtractionField nie jest persystowany w bazie przed finalizacja — zyje wylacznie jako Angular signal w pamieci przegladarki | `case.store.ts:11` — `extractionFields = signal<ExtractionField[]>([])`; brak JPA entity dla ExtractionField; dane docieraja do DB tylko przez `AuditRecord.payload` (JSON blob) |
| R-5 | **analystIdentity** to uwierzytelniona tozsamosc z IdP | Kod ma fallback `"dev-user"` gdy JWT jest null; moze wyleciec przez warunki gdzie JWT jest obecny ale sub claim pusty | `DecisionController.java:29` — `jwt != null ? jwt.getSubject() : "dev-user"` |
| R-6 | **PDF storage** — PRD nie specyfikuje mechanizmu, NFR "data containment" po finalizacji | PDF jest przechowywany jako BLOB (`byte[]`) w tabeli `kyb_case` w PostgreSQL — potencjalnie ogromne wiersze, brak dedykowanego object storage | `KybCase.java:38` — `@Column(name = "pdf_data") private byte[] pdfData` |
| R-7 | **CaseStatus lifecycle** ma implikowana sekwencje CREATED -> ANALYZING -> ANALYZED -> LOCKED | `CaseService.updateCase()` blokuje modyfikacje tylko dla LOCKED — mozna edytowac case w stanie ANALYZING | `CaseService.java:36-38` — blok tylko na LOCKED; brak blokady na ANALYZING dla `updateCase` |
| R-8 | **Red Flags emitowane TYLKO po pelnej analizie** — wymaganie czasowe ("only after full-document context") | `ExtractionService` scala flagi i emituje `RedFlagsFound` w `.concatWith()` na koniec strumienia — ale brak mechanizmu weryfikacji ze LLM nie wyemituje flagi za wczesnie | `ExtractionService.java:143-148` — `Flux.defer()` po zakonczeniu strumienia; linia 132 — `if (line.contains("\"category\":"))` jako heurystyka |

---

## KROK 5 — Ranking refaktoru

Kryterium: **Wartosc** = jak rdzenowy jest niezmiennik dla propozycji wartosci produktu; **Ryzyko** = jak slabo jest dzis egzekwowany.

| Rank | Kandydat | Niezmiennik | Wartosc | Ryzyko | Uzasadnienie |
|---|---|---|---|---|---|
| **#1** | **Trust Contract enforcement** (R-1, I-4) | Kazde pole ma cytat lub NDI | Maksymalna — to propozycja wartosci | Wysokie — backend akceptuje naruszen bez bledu | Backend musi walidowac: `if value != "Not Disclosed / Inferred Missing" then citations.length >= 1`. Dzis analityk moze zafinalizowac case z polami bez proweniencji — niszczac jedyna rzecz ktora rozroznia ClearKYC od Excela. Wymaga zmiany JSON Schema + `FinalizeService`. |
| **#2** | **ExtractionField persistence** (R-4) | Pola przezyja przeladowanie strony | Wysoka — UX krytyczny | Wysokie — BRAK persistencji miedzy finalizacja | Analityk traci caly wynik analizy przy odswiezeniu strony przed finalizacja. Wymaga nowej encji JPA `ExtractionFieldRecord` lub persystencji pola po kazdym `FieldExtracted` evencie. To rowniez wartosc audit trail (mozliwosc odtworzenia co model wyekstrahowal). |
| **#3** | **Override justification w backendzie** (R-3, I-5) | Uzasadnienie musi byc niepuste | Wysoka — regulatory requirement | Srednie — frontend chroni, backend nie | JSON Schema nalezy uzupelnic o `"minLength": 1` dla `justification`. Dziura: ktos moze wywolac API bezposrednio z pustym stringiem i audit record nie bedzie zawierac uzasadnienia. |
| **#4** | **CaseStatus state machine** (R-7, I-1) | Sekwencja stanow jest nieprzekraczalna | Srednia | Srednie — mozliwy czesciowy corruption | `KybCase` powinien byc agregatem ze `setStatus()` egzekwujacym maszyne stanow zamiast pozwalac serwisowi modyfikowac `status` bezposrednio przez setter. Wzorzec: `lock()`, `startAnalysis()`, `completeAnalysis()` jako metody domenowe zamiast `setStatus(CaseStatus)`. |
| **#5** | **Red Flag Taxonomy formalizacja** (R-2) | Taksonomia pochodzi z banku, nie z kodu | Srednia | Niskie (dziala, ale moze sie rozminac) | Hardcoded enum to decyzja unilateralna — bank moze miec inny katalog. Nalezy udokumentowac ze `RedFlagCategory.java` jest placeholder i wymaga walidacji z design-partnerem przed produkcja. |

### Kandydat #1 do refaktoru

**Trust Contract enforcement w `FinalizeService`/JSON Schema.**

Powod: PRD nazywa to wprost "Guardrail" i "Trust-contract integrity" jako NFR (`prd.md:111`). Naruszenie tego niezmiennika nie jest defektem technicznym — to zniszczenie propozycji wartosci produktu. Jesli analityk widzi pole bez cytatu i bez markera NDI, traci podstawe do weryfikacji, a caly "analyst-in-the-loop" model sie sypie. Poprawka jest lokalna (JSON Schema + walidacja w FinalizeService) i wysoko-skuteczna.

---

## Podsumowanie artefaktu

Dokument identyfikuje **15 pojec domenowych** z Ubiquitous Language, powiazanych ze zrodlem (PRD) i kodem. Subdomeny sklasyfikowane: **6 Core** (streaming ekstrakcji, Trust Contract, click-to-cite, taksonomia red flag, finalizacja z audytem, override justification), **2 Supporting**, **2 Generic**. Zidentyfikowano **2 agregaty** (KybCase, ExtractionField-jako-VO) z **8 niezmiennikami** — z czego **3 egzekwowane**, **2 czesciowo deklarowane**, **3 ignorowane** przez kod. Krytyczny rozjazd: **Trust Contract** — rdzen propozycji wartosci produktu — nie jest egzekwowany po stronie backendu; backend przyjmuje pola bez cytatow i bez markera NDI. Kandydat #1 do refaktoru: dodanie warunkowej walidacji w JSON Schema i `FinalizeService`, co zamknie luke regulacyjna i techniczna jednoczesnie.
