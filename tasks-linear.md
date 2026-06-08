# ClearKYC - Linear Task Management

Dokument definiuje mapowanie `context/foundation/roadmap.md` na struktury Linear.
Zrodlo: roadmap v1 (2026-05-29). Aktualizuj razem z roadmapa.

---

## Workspace

| Pole        | Wartosc                  |
|-------------|--------------------------|
| Team        | Dominik Modrzejewski     |
| Project     | ClearKYC                 |

---

## Mapowanie statusow

| Status w roadmapie | Status Linear |
|--------------------|---------------|
| `ready`            | Todo          |
| `proposed`         | Backlog       |
| `blocked`          | Backlog       |

Pozycje `blocked` dostaja dodatkowo label **Blocked** i note o zaleznosci zewnetrznej w opisie.

---

## Mapowanie labelek

| Label Linear | Kiedy uzywac                                  |
|--------------|-----------------------------------------------|
| Feature      | wszystkie pozycje (foundations i slices)      |
| Improvement  | (zarezerwowane dla future refaktorow)         |
| Bug          | (zarezerwowane dla bugfixow)                  |

Dodatkowe labelki do utworzenia recznie lub przez CLI jesli potrzebne:
`foundation` (kolor #0EA5E9) i `slice` (kolor #8B5CF6) - rozrozniaja enablery od user-facing flow.

---

## Mapowanie priorytetow

| Roadmap status | Priorytet Linear | Uzasadnienie                                     |
|----------------|------------------|--------------------------------------------------|
| `ready`        | High (2)         | mozna zaczac teraz, blokuje kolejne pozycje      |
| `proposed`     | Medium (3)       | zaplanowane ale czeka na prerequisity            |
| `blocked`      | Low (4)          | zewnetrzna zaleznosc; nie wchodzi do sprintu     |

---

## Issues

### F-01 - auth-scaffold

| Pole        | Wartosc                                                  |
|-------------|----------------------------------------------------------|
| Tytul       | [F-01] Wdrozyc auth scaffold: Spring Security + IdP     |
| Status      | Todo                                                     |
| Priorytet   | High                                                     |
| Label       | Feature                                                  |
| PRD refs    | FR-001, Access Control                                   |

**Opis:**

Wynik: wszystkie trasy aplikacji poza logowaniem chronione przez zarzadzanego dostawce tozsamosci; tokeny weryfikowane przez Spring Security; nieuwierzytelnione zadania przekierowywane do logowania.

Zaleznosci: brak.
Rownolegle z: F-02, F-03.
Odblokowuje: S-01, S-02, S-03.

Kroki implementacji:
- Dodac `spring-boot-starter-oauth2-resource-server` + `spring-boot-starter-security` do `pom.xml`
- Wybrac zarzadzanego IdP (Auth0 / Clerk / Okta - kazdy OIDC-kompatybilny)
- Skonfigurowac `SecurityConfig` z fluent DSL (Spring Boot 4, nie WebSecurityConfigurerAdapter)
- Zabezpieczyc wszystkie trasy poza health-checkiem
- Napisac test integracyjny: nieuwierzytelniony GET zwraca 401

---

### F-02 - data-layer

| Pole        | Wartosc                                                      |
|-------------|--------------------------------------------------------------|
| Tytul       | [F-02] Wdrozyc warstwe danych: JPA + PostgreSQL + migracje  |
| Status      | Todo                                                         |
| Priorytet   | High                                                         |
| Label       | Feature                                                      |
| PRD refs    | FR-013, FR-011                                               |

**Opis:**

Wynik: tabele `case` i `audit_record` istnieja ze schematem migracji; encje JPA + repozytoria podlaczone; baza PostgreSQL wdrozona na Fly.io i dostepna ze srodowiska.

Zaleznosci: brak.
Rownolegle z: F-01, F-03.
Odblokowuje: S-01, S-02, F-04.

Kroki implementacji:
- Dodac `spring-boot-starter-data-jpa`, sterownik PostgreSQL (`postgresql`), Flyway do `pom.xml`
- Dodac sekret `DATABASE_URL` na Fly.io + Postgres addon
- Napisac migracje Flyway: `V1__create_case.sql`, `V2__create_audit_record.sql`
- Stworzyc encje JPA: `Case`, `AuditRecord` (pakiet `com.example.clearkyc.domain`)
- Stworzyc repozytoria Spring Data: `CaseRepository`, `AuditRecordRepository`
- Test: `@DataJpaTest` weryfikujacy zapis i odczyt encji

---

### F-03 - frontend-scaffold

| Pole        | Wartosc                                                      |
|-------------|--------------------------------------------------------------|
| Tytul       | [F-03] Wdrozyc scaffold Angular SPA w `web/`                |
| Status      | Todo                                                         |
| Priorytet   | High                                                         |
| Label       | Feature                                                      |
| PRD refs    | FR-009, FR-006, FR-004                                       |

**Opis:**

Wynik: Angular SPA skompilowany w `web/`, proxy do backendu Spring skonfigurowane, szkielet routingu + podstawowy layout z placeholderem podzielonego panelu gotowy.

Zaleznosci: brak.
Rownolegle z: F-01, F-02.
Odblokowuje: S-01, S-02.

Kroki implementacji:
- `ng new web --routing --style scss` z katalogu root projektu
- Skonfigurowac proxy (`proxy.conf.json`) do `http://localhost:8080`
- Stworzyc `AppLayoutComponent` z placeholderem split-panel (lewy: PDF viewer, prawy: form)
- Skonfigurowac routing: `/cases/new`, `/cases/:id`
- Dodac `ng build` do GitHub Actions workflow (lub osobny krok)
- Sprawdzic: `ng serve` + proxy dziala, backend odpowiada na `/actuator/health`

---

### F-04 - llm-streaming-backend

| Pole        | Wartosc                                                          |
|-------------|------------------------------------------------------------------|
| Tytul       | [F-04] Wdrozyc backend LLM streaming: endpoint SSE + klient     |
| Status      | Backlog                                                          |
| Priorytet   | Medium                                                           |
| Label       | Feature                                                          |
| PRD refs    | FR-005, FR-006, FR-008                                           |

**Opis:**

Wynik: endpoint SSE strumieniuje zdarzenia ekstrakcji w ustrukturyzowanym formacie; klient wybranego dostawcy LLM podlaczony i wywolujacy model z pelnym dokumentem PDF; format zdarzenia zdefiniowany i udokumentowany.

Zaleznosci: F-02 (przypadek musi istniec w DB przed wywolaniem analizy).
Rownolegle z: F-01, F-03 (tylko F-02 jako prerequisit).
Odblokowuje: S-01, S-03.

Otwarte pytanie: wybor SDK LLM (Anthropic SDK, Spring AI, LangChain4j). Potwierdz z ownerem przed dodaniem zaleznosci.

Kroki implementacji:
- Wybrac i dodac SDK klienta LLM do `pom.xml`
- Stworzyc `AnalysisController` z endpointem SSE (`SseEmitter` lub WebFlux `Flux<ServerSentEvent>`)
- Zdefiniowac format zdarzenia strumieniowego (JSON per pole: `{field, value, citation}`)
- Podlaczyc klienta LLM do serwisu `ExtractionService`
- Test: mock-klient LLM, sprawdzic ze SSE emituje wymagane zdarzenia

---

### S-01 - core-case-flow

| Pole        | Wartosc                                                                        |
|-------------|--------------------------------------------------------------------------------|
| Tytul       | [S-01] Dostarczyc minimalny rdzen przypadku (upload -> ekstrakcja -> decyzja)  |
| Status      | Backlog                                                                         |
| Priorytet   | Medium                                                                          |
| Label       | Feature                                                                         |
| PRD refs    | FR-001, FR-004, FR-005, FR-006, FR-008, FR-009, FR-011, FR-012, FR-013, US-01  |

**Opis:**

Wynik: analityk moze zaladowac PDF przez drag-and-drop, wyzwolic analize, zobaczyc wyekstrahowane encje (nazwa firmy, dyrektorzy, UBO) strumieniowane ze cytowaniami w podzielonym panelu obok osadzonego PDF, i finalnie wybrac decyzje terminalna (Approve / Reject / Escalate) z zapisem do rekordu audytu.

Zaleznosci: F-01, F-02, F-03, F-04 (wszystkie cztery foundations musza byc ukonczone).
Odblokowuje: S-02, S-03.

NFR: pierwsze pole strumieniowane w ciagu 5 sekund od wyzwolenia analizy.

Uwaga: schemat JSON dla rekordu FR-012 musi byc zdefiniowany i zacommitowany jako czesc tego wycinka (wersja v0.1).

---

### S-02 - field-verification-export

| Pole        | Wartosc                                                              |
|-------------|----------------------------------------------------------------------|
| Tytul       | [S-02] Dostarczyc weryfikacje pola + eksport JSON z walidacja        |
| Status      | Backlog                                                              |
| Priorytet   | Medium                                                               |
| Label       | Feature                                                              |
| PRD refs    | FR-010, FR-014, FR-012, US-01                                        |

**Opis:**

Wynik: analityk moze edytowac dowolne wyekstrahowane pole z obowiazkowym uzasadnieniem przy nadpisaniu, kliknac w cytowane pole i nawigowac do strony w PDF (lub snippet w bocznym panelu przy bledzie podswietlenia), a rekord finalizacji jest walidowany schematem JSON przed zapisem.

Zaleznosci: S-01.
Rownolegle z: S-03 (po rozwiazaniu Open Question 1 i ukonczeniu S-01).
Odblokowuje: S-03 (wspolnie z S-01).

NFR: nawigacja click-to-cite w ciagu 500ms (best-effort na skanowanych PDF).

---

### S-03 - red-flag-taxonomy

| Pole        | Wartosc                                                          |
|-------------|------------------------------------------------------------------|
| Tytul       | [S-03] Dostarczyc red flag z zamknieta taksonomia ryzyka        |
| Status      | Backlog                                                          |
| Priorytet   | Low                                                              |
| Label       | Feature                                                          |
| PRD refs    | FR-007, US-01                                                    |

**Opis:**

ZABLOKOWANE: wymaga zamknietej taksonomii red flag od banku-partnera (Open Question 1 z roadmapy).

Wynik: analityk widzi zidentyfikowane red flagi po zakonczeniu analizy, kazdy powiazany z wpisem w zamknietej taksonomii kategorii ryzyka; pola "Not Disclosed / Inferred Missing" moga laczyc sie w red flag z taksonomii.

Zaleznosci: S-01 + zamknieta taksonomia red flag (zewnetrzna decyzja banku-partnera).
Kandydaci z PRD: sankcje, wskazniki spolki-wydmuszki, ryzyko jurysdykcji, nieprzejrzysta wlasnosc, powiazania PEP, ryzyko sektorowe.

Bez zamknietej taksonomii LLM wymysla kategorie i zaufanie analityka sie wali. Nie wchodzi do sprintu az do rozwiazania Open Question 1.

---

## Milestony (opcjonalne)

Jezeli chcesz grupowac wizualnie w Linear:

| Nazwa           | Zawiera             | Kiedy "Done"                                    |
|-----------------|---------------------|-------------------------------------------------|
| Foundations     | F-01, F-02, F-03, F-04 | wszystkie cztery foundations Done            |
| North Star MVP  | S-01                | analityk moze wykonac pelny case end-to-end     |
| Full MVP        | S-02                | pole-weryfikacja + eksport JSON dziala          |
| Red Flag Module | S-03                | po rozwiazaniu Open Question 1 (taksonomia)     |

---

## Historia tworzenia

| Data       | Akcja                                        |
|------------|----------------------------------------------|
| 2026-05-29 | Plik utworzony; issues zaplanowane w Linear  |
