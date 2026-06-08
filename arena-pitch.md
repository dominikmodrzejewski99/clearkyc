Moj pomysl to: **"ClearKYC - LLM czyta dokument, analityk podejmuje decyzje"**

Celem projektu jest skrocenie procesu weryfikacji zlozonych wnioskow onboardingowych B2B w bankach z 4-8 godzin pracy recznej do ponizej jednej godziny, bez oddawania decyzji modelowi jezykowemu. Analityk KYB pozostaje decydentem; LLM jest tylko warstwa, ktora czyta dokument i wystawia mu kandydatow na encje (nazwa spolki, czlonkowie zarzadu, UBO) razem z doslownym cytatem ze zrodla.

Kluczowe cechy:

- Pojedynczy, zlozony PDF B2B jako wejscie (statuty, akty zalozycielskie, wypisy z rejestrow handlowych) - swiadomie bez cross-document synthesis w v1.
- Strumieniowa ekstrakcja encji w czasie rzeczywistym; pola pojawiaja sie w formularzu w miare jak model czyta dokument, bez "czarnej skrzynki" w postaci spinnera na 30-60 sekund.
- Kazde wypelnione pole nosi tablice doslownych cytatow ze zrodla; jesli wartosc wynika z braku dowodu, pole dostaje jawny marker "Not Disclosed / Inferred Missing" zamiast pustki.
- Czerwone flagi (red flags) emitowane dopiero po pelnym przeczytaniu dokumentu, zwiazane z zamknieta taksonomia ryzyka (bez halucynowanych kategorii).
- Click-to-cite: kliknięcie w pole nawiguje wbudowany podglad PDF do odpowiedniej strony z best-effort highlightem; jesli highlight zawiedzie, snippet i tak laduje w panelu bocznym.
- Edycja pol z wymuszonym mechanizmem "override justification" - nadpisanie wartosci wyciagnietej przez model wymaga krotkiego uzasadnienia, ktore trafia do audytu.
- Terminalna decyzja (Approve / Reject / Escalate) zamyka case, generuje rekord JSON walidowany wersjonowanym JSON Schema i zapisuje wpis audytowy zanim UI potwierdzi finalizacje.

Aktualny stan projektu:

Projekt jest na bardzo wczesnym etapie. Backend (Spring Boot 4.0.6 + Java 21 + Maven) jest postawiony, wdrozony produkcyjnie na Fly.io (https://clearkyc.fly.dev), z CI/CD przez GitHub Actions auto-deployujace na merge do `main`. To jednak "smoke deployment" - aplikacja odpowiada, root URL zwraca Whitelabel 404, bo zaden endpoint produktowy jeszcze nie istnieje. Wszystkie kluczowe FR-y z PRD sa nadal niezaimplementowane: brak auth (FR-001), brak JPA + Postgresa, brak schematu JSON dla rekordu finalizacji (FR-012), brak SSE i klienta LLM dla streamingu (FR-005-008), brak Angularowego SPA w `web/`.

To moje pierwsze powazne podejscie do projektu prowadzonego w pelni przez chain skilli `/10x-*` z programu 10xDevs (`/10x-shape` -> `/10x-prd` -> `/10x-tech-stack-selector` -> `/10x-bootstrapper` -> `/10x-infra-research` -> Plan Mode deploy). Wczesniejsze projekty robilem ad-hoc, wiec dla mnie wartoscia jest tu nie tyle sam kod, co dyscyplina kontraktow (`context/foundation/prd.md`, `tech-stack.md`, `infrastructure.md`) i to, ze kazda decyzja stackowa i infrastrukturalna ma audyt w repo, do ktorego moge wrocic jak cos zacznie dryfowac.

Najwazniejsze wyzwania:

**1. Kontrakt zaufania: nigdy nie pokazuj wartosci bez proweniencji**

Najtrudniejszy wymog produktowy to: zadne pole widoczne dla analityka nie moze istniec bez cytatu albo bez jawnego markera "Inferred Missing". To wymaga zarowno dyscypliny promptowej (model nie ma prawa wygenerowac wartosci bez snippetu), jak i strict guard na warstwie serwera, ktory odrzuca eventy strumieniowe niespelniajace tego kontraktu. Strumieniowanie czesciowych struktur dodatkowo komplikuje rzecz: pole moze juz byc na ekranie, a citation jeszcze nie. Tu kluczowy bedzie reactive state model po stronie Angulara.

**2. Zamknieta taksonomia red-flagow jako zewnetrzna zaleznosc blokujaca**

FR-007 nie ruszy bez listy kategorii ryzyka z banku design-partnera (sanctions exposure, shell-company indicators, opaque ownership, PEP linkage itd.). To jest jedyny blocking Open Question w PRD i jesli bank nie dostarczy katalogu, cala warstwa red-flag detectora jest zatrzymana. Plan B: tymczasowa hardcoded taksonomia w sealed hierarchy (Java 21 sealed types), oznaczona w kodzie jako PROVISIONAL z TODO do zastapienia.

**3. Stream + click-to-cite + best-effort highlight na zeskanowanych PDF-ach**

NFR mowi: pierwsze pole < 5 s, click-to-cite < 500 ms. Ale dokumenty KYB w realnym swiecie to czesto skany z obcych rejestrow handlowych - warstwa tekstowa rozjezdza sie z layoutem, OCR ma warianty, koordynaty sie nie zgadzaja. Swiadomie wybralem graceful degradation: page-level nav jest niezawodny, span highlight jest best-effort, a fallback to verbatim snippet w panelu bocznym. Wyzwanie jest takie, zeby ten fallback nie wygladal jak awaria, tylko jak zaplanowane zachowanie.

**4. Audyt-jako-kontrakt, nie audyt-jako-log**

Zdecydowalem przeciwko per-edit audit logowi (GDPR redaction time-bomb na rejestrze pelnym PII). Zamiast tego jeden rekord audytowy per finalizacja, bundlujacy wszystkie override justifications z sesji. To wymaga, zeby UI commit-on-finalize byl atomowy: rekord audytowy musi byc zapisany **zanim** UI potwierdzi decyzje analitykowi. To inwersja zwyklego "fire and forget" loggingu i wymaga transactional boundary po stronie serwisu.

**5. Single-tenant design-partner scope vs. wieloletni roadmap**

Cala architektura v1 jest swiadomie single-tenant, single-role, single-document. To pomaga skupic sie na trust-building loop, ale ryzyko jest takie, ze jak design-partner powie "OK, teraz dorzuccie multi-tenancy + reviewer queue + cross-document graph", to refaktor bedzie bolesny. Mitigacja: trzymam te ograniczenia w PRD jako jawne Non-Goals z uzasadnieniem, zeby pozniej nie tlumaczyc dlaczego "to bylo zostawione na v2".
