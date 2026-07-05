# Frame Brief: Extraction result lost on page refresh

> Framing step before /ai-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Po odświeżeniu strony `/cases/:id` znika cały widok wyekstrahowanych danych
(company name, directors, UBO, red flagi). Dotyczy to zarówno spraw w trakcie
przeglądu (ANALYZED, przed decyzją) **jak i spraw już zablokowanych (LOCKED)**,
niezależnie czy odświeżenie to F5 w tej samej karcie zaraz po analizie, czy
wejście z nowej karty/po dłuższym czasie.

## Initial Framing (preserved)

- **User's stated cause**: "powinno pamiętać stan, bo jest to bez sensu, że
  potem nie można wrócić" — założenie, że to jednorodny problem: stan
  ekstrakcji powinien przetrwać odświeżenie strony.
- **User's proposed direction**: (dorozumiany) trwałe zapamiętywanie stanu
  analizy tak, żeby refresh go nie kasował.
- **Pre-dispatch narrowing**: problem dotyczy również spraw LOCKED (nie tylko
  spraw w trakcie/po analizie przed decyzją); występuje zarówno przy F5 w tej
  samej karcie, jak i przy wejściu po dłuższym czasie/z innej karty.

## Dimension Map

Obserwacja mogła mieć źródło w jednym z tych wymiarów:

1. **LOCKED-state rehydration path** — czy dane zablokowanej sprawy są w ogóle
   trwale zapisane, a jeśli tak, czy API/frontend je odczytuje z powrotem.
2. **Pre-decision (ANALYZING/ANALYZED) rehydration path** — czy backend
   kiedykolwiek trwale zapisuje wynik ekstrakcji przed momentem finalizacji.
   ← wstępne założenie użytkownika traktowało to razem z (1) jako jeden problem
3. **Frontend CaseStore reset behavior** — czy `CaseStore.reset()` kasuje dane
   bezwarunkowo nawet gdy istnieje ścieżka do ich odtworzenia.
4. **Zamierzony zakres PRD/v1** — czy przetrwanie odświeżenia przed decyzją
   było świadomie wyłączone z v1 (jak inne udokumentowane scope-cuts), czy to
   przeoczenie.
5. **Wcześniej zaprojektowany, ale niedokończony mechanizm** — czy poprzednia
   zmiana (`core-case-flow`, S-01) już projektowała jakiś sposób odzyskiwania
   pól ekstrakcji po refreshu dla stanu ANALYZED.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| (1) LOCKED: dane istnieją w `audit_record.payload`, ale nie są odczytywane z powrotem do UI | `FinalizeService.java:70-78` zapisuje pełne `fields` (z cytowaniami) + `red_flags` do `AuditRecord.payload` (kolumna JSON, `AuditRecord.java:35-37`). `CaseService.getCase()` (`CaseService.java:93-97`) jawnie mapuje audit tylko na `id/decision/finalizedAt`, ignorując `getPayload()`. `AuditSummary`/`CaseDetailResponse` DTO nigdy nie eksponują payloadu. Frontend (`case-detail.component.ts:33-48`, `case.store.ts:18-30`) całkowicie resetuje store i nie próbuje niczego odtworzyć; `extraction-form.component.html:167-171` i `red-flag-list.component.html:1-5` renderują dla LOCKED puste/mylące stany ("Brak zidentyfikowanych red flag" zamiast realnych danych z audytu). PRD `prd.md:66` (US-01 AC) explicite wymaga: "reloading the page in a fresh session returns the same locked values". | **STRONG** |
| (2) Pre-decision: backend nigdy nie zapisuje wyniku ekstrakcji przed finalizacją | `ExtractionService.java` trzyma wynik tylko w `AtomicReference` na czas jednego SSE requestu (linie ~108-109); `doFinally` zapisuje tylko `status`. Brak kolumny/tabeli w `KybCase`/migracjach V1-V4 na dane pośrednie. Potwierdzone niezależnie przez oba sub-agenty. | **STRONG** |
| (4) Pre-decision brak persystencji to świadomy, zaakceptowany scope-cut v1 | PRD `Non-Goals` (`prd.md:132-141`) dokumentuje 7 innych świadomych wykluczeń z rationale — **żadne nie dotyczy resumable sessions/draft persistence**, mimo że autorzy PRD konsekwentnie spisywali takie kompromisy. Roadmap `Parked`/`Open Questions` (`roadmap.md:238-253`) też tego nie wymienia. US-01 AC (`prd.md:66`) wiąże gwarancję "survives reload" wyłącznie z momentem *po* finalizacji, nie przed. | **WEAK** (przeciw hipotezie — brak dokumentacji tego jako świadomej decyzji sugeruje raczej przeoczenie niż celowy scope-cut) |
| (5) `core-case-flow` (S-01) już zaprojektował mechanizm odzyskiwania pól dla ANALYZED po refreshu | Zarchiwizowany `plan.md:465` ma odhaczony krok "Reload na ANALYZED case: baner re-upload → pola widoczne po wgraniu PDF", ale pełna treść planu/research/brief pokazuje, że kontrakt dotyczył **wyłącznie odzyskania PDF blob** (`caseStore.pdfBlob.set(blob)`, `plan.md:280-282`) — nigdzie nie ma specyfikacji re-run analizy ani persystencji `extractionFields`. To odhaczone stwierdzenie w planie jest nieścisłe/aspiracyjne, nie odzwierciedla żadnej faktycznie zaimplementowanej ścieżki. | **NONE** (mechanizm nie istniał, mimo zapisu w planie) |

## Narrowing Signals

- Użytkownik potwierdził, że problem dotyczy też LOCKED — to jest decydujące,
  bo dla LOCKED PRD ma explicit acceptance criterion (`prd.md:66`), a dane
  faktycznie już są zapisane w bazie. To odróżnia LOCKED od pre-decision
  jednoznacznie i sprawia, że to nie jest jeden jednorodny problem.
- Odhaczony krok w archiwalnym planie (`core-case-flow/plan.md:465`) okazał
  się nie odpowiadać żadnej realnej implementacji po weryfikacji pełnej
  treści planu — potwierdza, że pre-decision persystencja nigdy nie została
  faktycznie zaprojektowana, nie tylko "zapomniana".

## Cross-System Convention

Jedyny inny precedens efemeryczności w tym projekcie to PDF blob w S-01
(`core-case-flow/research.md:328`, "akceptowalne dla MVP", z jawnym,
udokumentowanym uzasadnieniem w `plan-brief.md` Key Decisions). Ten precedens
**został od tamtej pory nadpisany** — PDF jest już dziś trwale
persystowany (`KybCase.pdfData`, `CaseService.getPdfData()`), a baner
re-upload w kodzie jest już tylko fallbackiem dla starych spraw sprzed tej
zmiany. To pokazuje, że projekt ma zwyczaj *usuwania* efemeryczności w miarę
dojrzewania MVP, a nie utrzymywania jej trwale — co jest argumentem przeciw
traktowaniu utraty danych ekstrakcji jako trwale akceptowalnego stanu.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is dwa różne problemy o różnym
> koszcie i różnym statusie wymogu, błędnie potraktowane jako jeden.**

1. **LOCKED case reload = potwierdzony bug (regresja wobec PRD).** Dane już
   istnieją w `audit_record.payload`; brakuje tylko "drutu" — API musi
   zwrócić payload, a frontend musi nim zasilić `CaseStore` zamiast
   pokazywać mylący pusty stan. Niskie ryzyko, brak zmian schematu bazy.
2. **Pre-decision (ANALYZING/ANALYZED) reload = otwarta decyzja produktowa,
   nie bug.** PRD tego nie wymaga, ale też nigdy świadomie nie wykluczył (w
   przeciwieństwie do innych udokumentowanych scope-cuts) — i wbrew
   pozorom z archiwalnego planu, nigdy nie było tu żadnego działającego
   mechanizmu odzyskiwania. To wymaga świadomej decyzji: pełna persystencja
   serwerowa (koszt: nowa tabela/kolumna, zmiana kontraktu API) vs. lżejsze
   podejście (np. wykrycie utraty stanu + jawny komunikat/auto-re-run
   analizy) vs. zaakceptowanie status quo z jasnym UX (banner ostrzegawczy
   zamiast milczącej utraty).

Traktowanie obu jako jednego zadania groziłoby albo przewymiarowaniem prostej
naprawy buga (LOCKED) pełną architekturą persystencji, albo — gorzej —
zablokowaniem oczywistej naprawy buga na czekaniu na decyzję produktową o
znacznie droższym temacie.

## Confidence

**HIGH** — dla obu części reframe'u: silne dowody kodowe + jednoznaczny
zapis PRD dla (1), oraz potwierdzenie brakiem dokumentacji scope-cut i
obaleniem rzekomego istniejącego mechanizmu dla (2).

## What Changes for /ai-plan

Rekomendacja: rozdzielić na dwie osobne ścieżki.

- **/ai-plan dla naprawy LOCKED-state rehydration** (ten sam change-id,
  jasny bug fix) — może iść od razu, niska złożoność.
- **Osobna decyzja produktowa** (krótka rozmowa z użytkownikiem, nie pełny
  `/ai-plan`) co do pre-decision persistence, zanim ewentualnie otworzy się
  drugi change dla tego tematu — bo to jest wybór strategii (heavy/light/UX-only),
  nie oczywisty bug fix.

## References

- `src/main/java/com/example/clearkyc/service/FinalizeService.java:70-78`
- `src/main/java/com/example/clearkyc/domain/AuditRecord.java:35-37,54`
- `src/main/java/com/example/clearkyc/web/dto/AuditSummary.java:6`
- `src/main/java/com/example/clearkyc/web/dto/CaseDetailResponse.java:6-13`
- `src/main/java/com/example/clearkyc/service/CaseService.java:88-108`
- `web/src/app/features/case-detail/case-detail.component.ts:33-48`
- `web/src/app/core/store/case.store.ts:18-30`
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html:167-171`
- `web/src/app/features/case-detail/components/red-flag-list/red-flag-list.component.html:1-5`
- `context/foundation/prd.md:40,66,97-104,132-148`
- `context/foundation/roadmap.md:238-253`
- `context/archive/core-case-flow/plan.md:280-282,465` (archived — mechanizm okazał się nigdy nie istnieć)
- `context/archive/core-case-flow/research.md:328,351`
- `context/archive/core-case-flow/plan-brief.md:29,95`
