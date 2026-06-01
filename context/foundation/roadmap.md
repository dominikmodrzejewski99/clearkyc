---
project: ClearKYC
version: 1
status: draft
created: 2026-05-29
updated: 2026-05-29
prd_version: 1
main_goal: market-feedback
top_blocker: decisions
---

# Roadmap: ClearKYC

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Senior KYB Analysts w bankach spedzaja 4-8 godzin na manualnej weryfikacji kazdej zlozonej aplikacji B2B z niesformatowanych dokumentow narracyjnych. Starsze platformy KYC nie rozumieja tresci narracyjnych, zmuszajac analitykow do pracy na czytnikach PDF i arkuszach Excel. ClearKYC wypelnia te luke jako produkt analityk-w-petli (model - duzy model jezykowy, LLM - ekstrahuje czynniki ryzyka z pelna proweniencja zrodlowa, podczas gdy ludzki analityk pozostaje jedynym decydentem). Zaklad produktu polega na tym, ze gestosciowy interfejs w czasie rzeczywistym, ktory prezentuje wyekstrahowane fakty ze zrodlami - a nie samo wywolanie modelu - jest trwalym atutem konkurencyjnym wobec incumbentow, ktorzy nie postawia reputacji compliance na generatywnych modelach.

## North star

**S-01: Minimalny rdzen przypadku** - to najmniejszy end-to-end wycinek widoczny dla uzytkownika, ktory jesli zostanie dostarczony jako pierwszy, udowadnia rdzen hipotezy produktowej: ze ekstrakcja LLM z proweniencja jest wystarczajaco uzyteczna, by prawdziwy analityk compliance podejmowal auditowane decyzje bez opuszczania narzedzia.

> *Gwiazda przewodnia* to najmniejszy wycinek end-to-end, ktorego udane dostarczenie udowadnia rdzen hipotezy - umieszczony tak wczesnie, jak pozwalaja zaleznosci, poniewaz wszystko inne ma znaczenie tylko jesli to zadziala.

## At a glance

| ID   | Change ID              | Outcome (analityk moze ...)                                                                                                                       | Prerequisites                    | PRD refs                                                        | Status   |
|------|------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------|-----------------------------------------------------------------|----------|
| F-01 | auth-scaffold          | (foundation) trasy aplikacji chronione przez zarzadzanego IdP; tokeny weryfikowane przez Spring Security                                         | -                                | FR-001, Access Control                                          | done     |
| F-02 | data-layer             | (foundation) tabele `case` i `audit_record` istnieja ze schematem migracji; encje JPA + repozytoria podlaczone                                  | -                                | FR-013, FR-011                                                  | done     |
| F-03 | frontend-scaffold      | (foundation) Angular SPA w `web/` kompiluje sie i proxy'uje do backendu Spring; szkielet routingu i layoutu gotowy                               | -                                | FR-009, FR-006, FR-004                                          | done     |
| F-04 | llm-streaming-backend  | (foundation) endpoint SSE strumieniuje zdarzenia ekstrakcji; klient dostawcy LLM podlaczony i wywolujacy model                                   | F-02                             | FR-005, FR-006, FR-008                                          | proposed |
| F-05 | design-system-wire     | (foundation) tokeny `_variables.scss` zastosowane w istniejacych komponentach Angular; niespojnosc nazewnictwa `_mixins.scss` naprawiona; IBM Plex Sans/Mono zaladowane; typografia i spacing bazowy gotowe | F-03 | FR-009 | done     |
| S-01 | core-case-flow         | zaladowac PDF, wyzwolic analize, zobaczyc wyekstrahowane encje strumieniowane ze cytowaniami w podzielonym panelu i finalnie zatwierdzic decyzje z rekordem audytu | F-01, F-02, F-03, F-04, F-05 | FR-001, FR-004, FR-005, FR-006, FR-008, FR-009, FR-011, FR-012, FR-013, US-01 | proposed |
| S-02 | field-verification-export | edytowac dowolne pole z obowiazkowym uzasadnieniem, kliknac w cytowanie i nawigowac do strony w PDF, a rekord finalizacji byc walidowanym schematem JSON | S-01             | FR-010, FR-014, FR-012, US-01                                   | proposed |
| S-03 | red-flag-taxonomy      | zobaczyc red flagi po zakonczeniu analizy, kazdy powiazany z zamknieta taksonomia kategorii ryzyka                                               | S-01, zamknieta taksonomia red flag (Open Question 1) | FR-007, US-01                              | blocked  |

## Streams

Navigation aid - groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                 | Chain                                      | Note                                                                                                |
|--------|-----------------------|--------------------------------------------|-----------------------------------------------------------------------------------------------------|
| A      | Auth                  | `F-01` - dolacza do Stream B przy `S-01`   | Rownolegle startuje z B i C; sekwencjonowany wczesnie bo kazda trasa wymaga ochrony                 |
| B      | Dane + LLM streaming  | `F-02` -> `F-04` -> `S-01` -> `S-02`      | Sciezka krytyczna roadmapy; market-feedback sekwencjonuje tedy od danych do kompletnego przypadku  |
| C      | Frontend SPA          | `F-03` -> `F-05` - dolacza do Stream B przy `S-01` | Rownolegle startuje z A i B; F-05 aplikuje design system zanim powstana wycinki UI z prawdziwymi komponentami |
| D      | Red flag + taksonomia | `S-03`                                     | Samodzielny zablokowany wycinek; zalezy od decyzji zewnetrznej (Open Question 1)                   |

## Baseline

Stan codebase na 2026-05-29 (auto-zbadany + potwierdzony przez uzytkownika).
Foundations ponizej zakladaja obecnosc wymienionych warstw i ich nie re-scaffolduja.

- **Frontend:** absent - brak `web/`, `angular.json`, `package.json`; `static/` i `templates/` puste
- **Backend / API:** present - Spring Boot 4.0.6 + `spring-boot-starter-webmvc` (`src/main/java/com/example/clearkyc/ClearkycApplication.java`)
- **Data:** absent - brak `spring-data-jpa`, sterownika JDBC, Flyway/Liquibase
- **Auth:** absent - brak `spring-security`, OAuth2, `SecurityConfig`
- **Deploy / infra:** partial - `fly.toml` + `.github/workflows/fly-deploy.yml` (`--local-only`); brak `Dockerfile` (buildpack Paketo przez `fly.toml`)
- **Observability:** partial - Spring Actuator (`/actuator/health`); brak OTel/Sentry/Micrometer

## Foundations

### F-01: Managed-IdP auth scaffold

- **Outcome:** (foundation) wszystkie trasy aplikacji poza logowaniem chronione przez zarzadzanego dostawce tozsamosci; tokeny weryfikowane przez Spring Security; nieuwierzytelnione zadania przekierowywane do logowania.
- **Change ID:** auth-scaffold
- **PRD refs:** FR-001, sekcja Access Control
- **Unlocks:** S-01, S-02, S-03 (kazdy wycinek wymaga uwierzytelnionego uzytkownika)
- **Prerequisites:** -
- **Parallel with:** F-02, F-03
- **Blockers:** -
- **Unknowns:** Wybor zarzadzanego dostawcy IdP (np. Auth0, Clerk, Okta - kazdy kompatybilny z OIDC dziala z Spring Security). Owner: implementer. Block: no.
- **Risk:** sekwencjonowany jako pierwszy; kazdy endpoint bez tej warstwy jest dostepny bez uwierzytelnienia; latwiej zabezpieczyc calosc od razu niz backfillowac ochrone trasy po trasie.
- **Status:** done
- **Commits:** 4c15850 (p1: Spring Security Resource Server + CORS), 051be9c (p2: Angular @auth0/auth0-angular), 5740584 (p3: Spring Security integration tests), 1e1cfeb (epilogue), 43defa5 (impl-review fixes)

### F-02: Relational data layer

- **Outcome:** (foundation) tabele `case` i `audit_record` istnieja ze schematem migracji; encje JPA i repozytoria podlaczone; baza danych PostgreSQL wdrozona i dostepna ze srodowiska Fly.io.
- **Change ID:** data-layer
- **PRD refs:** FR-013 (rekord audytu), FR-011 (blokada przypadku)
- **Unlocks:** S-01 (trwalosc przypadku + zapis rekordu audytu), S-02 (trwalosc uzasadnien nadpisan), F-04 (analiza wymaga istniejacego przypadku w DB)
- **Prerequisites:** -
- **Parallel with:** F-01, F-03
- **Blockers:** -
- **Unknowns:** -
- **Risk:** sekwencjonowany wczesnie - migracje schematu sa kosztowne po tym, jak wycinki sa zaimplementowane; lepiej ustalic model danych przed budowa logiki biznesowej.
- **Status:** done
- **Commits:** baa7526 (data layer: JPA entities, repositories, Flyway migration)
- **Note:** Fly.io provisioning (fly pg create + attach) pending — billing blocked; execute before S-01.

### F-03: Frontend SPA scaffold

- **Outcome:** (foundation) Angular SPA skompilowany w `web/`, proxy do backendu Spring skonfigurowane, szkielet routingu i podstawowy layout z placeholderem podzielonego panelu gotowy.
- **Change ID:** frontend-scaffold
- **PRD refs:** FR-009 (podzielony panel wymaga bogatego SPA), FR-006 (formularz strumieniowy), FR-004 (drag-and-drop pliku)
- **Unlocks:** S-01, S-02 (wszystkie FRs UI buduja na tym scaffoldzie)
- **Prerequisites:** -
- **Parallel with:** F-01, F-02
- **Blockers:** -
- **Unknowns:** -
- **Risk:** Angular ma wlasna zlozonosc bootstrapowania (routing, proxy, build pipeline); wykonanie tego wczesnie unika sytuacji, gdy endpointy Spring sa gotowe, ale nie ma klienta SPA ktory je konsumuje.
- **Status:** done
- **Commits:** 5d57a3b (p1: Angular scaffold + design system), d82886f (p2: Maven Frontend Plugin), 06e9607 (p3: dev proxy + SPA routing), ccc9c39 (p4: routing + AppLayout + AuthGuard), e11a6ad (epilogue)

### F-04: LLM streaming backend

- **Outcome:** (foundation) endpoint SSE strumieniuje zdarzenia ekstrakcji w ustrukturyzowanym formacie; klient wybranego dostawcy LLM podlaczony i wywolujacy model z pelnym dokumentem PDF; format zdarzenia strumieniowego zdefiniowany i udokumentowany.
- **Change ID:** llm-streaming-backend
- **PRD refs:** FR-005 (trigger analizy), FR-006 (streaming ekstrakcji), FR-008 (cytowania per pole)
- **Unlocks:** S-01 (streaming ekstrakcji + cytowania), S-03 (ekstrakcja red flag po zakonczeniu analizy)
- **Prerequisites:** F-02 (przypadek musi istniec w DB przed wyzwoleniem analizy i strumieniowaniem wynikow)
- **Parallel with:** F-01, F-03 (tylko F-02 jako prerequisit)
- **Blockers:** -
- **Unknowns:** Wybor SDK LLM (Anthropic SDK, Spring AI, LangChain4j - CLAUDE.md flaguje jako wymagajacy potwierdzenia wlasciciela przed dodaniem zaleznosci). Owner: user. Block: no - implementer moze zdecydowac samodzielnie.
- **Risk:** najwyzsze ryzyko techniczne w projekcie; strumieniowanie czesciowego JSON z LLM do reaktywnego formularza Angular wymaga nowej integracji SSE + back-pressure; sekwencjonowany zaraz po F-02 by wyciagnac ryzyko integracji przed budowa UI.
- **Status:** proposed

### F-05: Design system wire

- **Outcome:** (foundation) tokeny CSS z `web/src/styles/design-system/_variables.scss` zastosowane w istniejacych komponentach Angular (`AppLayout`, header, trasy stub); niespojnosc nazewnictwa w `_mixins.scss` naprawiona (odwolania `--color-*` uzgodnione z rzeczywistymi nazwami zmiennych); IBM Plex Sans i IBM Plex Mono zaladowane przez `angular.json` lub `@fontsource`; bazowa typografia i spacing z tokenow wdrozoone w `styles.scss`; wszystkie komponenty renderuja sie bez broken-variable fallbackow.
- **Change ID:** design-system-wire
- **PRD refs:** FR-009 (gesty interfejs analityczny)
- **Unlocks:** S-01, S-02 (wycinki UI buduja na sprawdzonym fundamencie wizualnym zamiast naprawiac styl przy kazdym komponencie)
- **Prerequisites:** F-03
- **Parallel with:** F-04 (czysto frontendowy zakres, brak zaleznosci backendowej)
- **Blockers:** -
- **Unknowns:** -
- **Risk:** bez tego kroku S-01 bedzie budowalo komponenty na nienaprawionych zmiennych CSS, co prowadzi do rozproszonego dlugu stylistycznego trudnego do wysterolowania pozniej; naprawienie wczesnie jest tanie.
- **Status:** done
- **Commits:** 6bd4e62 (p1: broken CSS vars), 6ce1f8c (p2: @fontsource), ad70324 (epilog), c93beee (impl-review: latin-ext subsets)

## Slices

### S-01: Minimalny rdzen przypadku

- **Outcome:** analityk moze zaladowac PDF przez drag-and-drop lub file picker, wyzwolic analize, zobaczyc wyekstrahowane encje (nazwa firmy, dyrektorzy, UBO) strumieniowane ze cytowaniami w podzielonym panelu obok osadzonego PDF, i finalnie wybrac decyzje terminalna (Approve / Reject / Escalate) z zapisem do rekordu audytu przed potwierdzeniem w UI.
- **Change ID:** core-case-flow
- **PRD refs:** FR-001, FR-004, FR-005, FR-006, FR-008, FR-009, FR-011, FR-012, FR-013, US-01
- **Prerequisites:** F-01, F-02, F-03, F-04, F-05
- **Parallel with:** -
- **Blockers:** -
- **Unknowns:**
  - Schemat JSON dla rekordu FR-012 musi byc zdefiniowany i zacommitowany jako czesc tego wycinka (wersja v0.1). Owner: implementer. Block: no.
- **Risk:** strumieniowanie ekstrakcji + wyswietlanie cytowani + podzielony panel PDF to najgestsza czesc UI w produkcie; NFR 5s do pierwszego pola strumieniowego wymaga starannej konfiguracji back-pressure SSE.
- **Status:** proposed

### S-02: Weryfikacja pola i eksport JSON

- **Outcome:** analityk moze edytowac dowolne wyekstrahowane pole z obowiazkowym krotkim uzasadnieniem przy nadpisaniu wartosci LLM, kliknac w cytowane pole i zobaczyc nawigacje do strony w osadzonym PDF z proba podswietlenia tekstu (lub snippet w bocznym panelu przy bledzie podswietlenia), a rekord finalizacji jest walidowany schematem JSON przed zapisem.
- **Change ID:** field-verification-export
- **PRD refs:** FR-010, FR-014, FR-012, US-01
- **Prerequisites:** S-01
- **Parallel with:** -
- **Blockers:** -
- **Unknowns:**
  - Podswietlenie tekstu zrodlowego w PDF-ie jest mechanizmem best-effort; sposob implementacji (koordynaty tekstu, biblioteka PDF) zalezy od wyboru w F-03/S-01. Owner: implementer. Block: no.
- **Risk:** click-to-cite z nawigacja do strony + podswietlanie tekstu jest najtrudniejsza interakcja UI w produkcie; NFR 500ms jest ciasne na skanowanych dokumentach PDF; graceful degradation (snippet w bocznym panelu) musi byc wodoszczelna.
- **Status:** proposed

### S-03: Red flag i taksonomia ryzyka

- **Outcome:** analityk widzi zidentyfikowane red flagi po zakonczeniu analizy calego dokumentu, kazdy powiazany z wpisem w zamknietej taksonomii kategorii ryzyka; pola "Not Disclosed / Inferred Missing" moga laczyz sie w red flag z taksonomii.
- **Change ID:** red-flag-taxonomy
- **PRD refs:** FR-007, US-01
- **Prerequisites:** S-01, zamknieta taksonomia red flag (Open Question 1)
- **Parallel with:** S-02 (po rozwiazaniu Open Question 1 i ukonczeniu S-01, S-02 i S-03 moga biec rownoleglez)
- **Blockers:** Zamknieta taksonomia red flag. Owner: user / bank-partner. Zewnetrzna decyzja wymagana przed planowaniem.
- **Unknowns:**
  - Jaka jest zamknieta taksonomia kategorii ryzyka? (kandydaci z PRD: sankcje, wskazniki spolki-wydmuszki, ryzyko jurysdykcji, nieprzejrzysta wlasnosc, powiazania PEP, ryzyko sektorowe). Owner: user. Block: yes.
- **Risk:** definicja taksonomii jest wlasnoscia banku-partnera (zewnetrznego interesariusza); bez niej LLM wymysla kategorie i zaufanie analityka sie wali; caly wycinek jest zablokowany ta zewnetrzna zaleznoscia.
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID              | Sugerowany tytul zadania                                      | Gotowe do `/10x-plan` | Uwagi                                          |
|------------|------------------------|---------------------------------------------------------------|-----------------------|------------------------------------------------|
| F-01       | auth-scaffold          | Wdrozyc auth scaffold: Spring Security + zarzadzany IdP      | yes                   | Uruchom `/10x-plan auth-scaffold`              |
| F-02       | data-layer             | Wdrozyc warstwe danych: JPA + PostgreSQL + migracje          | yes                   | Uruchom `/10x-plan data-layer`                 |
| F-03       | frontend-scaffold      | Wdrozyc scaffold Angular SPA w `web/`                        | done                  | Zaimplementowane 2026-05-29; commity 5d57a3b-e11a6ad           |
| F-04       | llm-streaming-backend  | Wdrozyc backend LLM streaming: endpoint SSE + klient         | no                    | Wymaga F-02; zdecyduj SDK LLM wczesniej        |
| F-05       | design-system-wire     | Naprawic niespojnosc _mixins.scss i zastosowac tokeny design systemu w komponentach Angular | yes | Wymaga F-03; uruchom `/10x-plan design-system-wire` |
| S-01       | core-case-flow         | Dostarczyc minimalny rdzen przypadku (upload -> ekstrakcja -> decyzja) | no           | Wymaga F-01 + F-02 + F-03 + F-04              |
| S-02       | field-verification-export | Dostarczyc weryfikacje pola + eksport JSON z walidacja    | no                    | Wymaga S-01                                    |
| S-03       | red-flag-taxonomy      | Dostarczyc red flag z zamknieta taksonomia ryzyka            | no                    | Zablokowane: Open Question 1 (taksonomia)      |

## Open Roadmap Questions

1. **Jaka jest zamknieta taksonomia red flag?** - Kandydaci z PRD: sankcje, wskazniki spolki-wydmuszki, ryzyko jurysdykcji, nieprzejrzysta wlasnosc, powiazania PEP, ryzyko sektorowe. Owner: user (katalog compliance banku-partnera). Block: S-03, FR-007. Do czasu rozstrzygniecia ten wycinek nie moze wejsc do planowania.
2. **Jaka jest polityka retencji rekordow audytowych i model redakcji RODO?** - FR-013 zapisuje dane osobowe (nazwy UBO, tozsamosci dyrektorow). Owner: user (legal / DPO banku-partnera). Block: no dla demo MVP; yes przed pilotem z prawdziwymi danymi klientow.
3. **Czy bank-partner toleruje przesylanie tresci dokumentow do zewnetrznego dostawcy LLM?** - Wszystkie FR-y ekstrakcji (FR-005..FR-014) zakladaja ze LLM ma dostep do pelnego dokumentu. Owner: user (infosec banku). Block: yes dla wdrozenia produkcyjnego; demo v1 moze uzywac syntetycznych dokumentow.
4. **Wersja JSON Schema dla rekordu FR-012.** - Schema musi byc zdefiniowana i zacommitowana obok kodu; konsumenci downstream beda pinowac do wersji. Owner: implementer. Block: no jesli schema jest pinowana przy v0.1 jako czesc S-01.

## Parked

- **Wielodokumentowe odwolania krzyzowe / RAG** - Dlaczego odlozone: PRD §Non-Goals; budowanie cross-document reasoning przed udowodnieniem single-document UX odwraca profil ryzyka MVP.
- **Wspolpraca wielu analitykow w czasie rzeczywistym** - Dlaczego odlozone: PRD §Non-Goals; collaborative editing to oddzielna duza powierzchnia UX.
- **Role reviewer / approver / admin** - Dlaczego odlozone: PRD §Non-Goals; naturalny v2 po udowodnieniu petli single-analyst.
- **Interfejs kolejki przypadkow i backloga** - Dlaczego odlozone: PRD §Non-Goals; bank-partner ma juz narzedzia do zarzadzania kolejka.
- **Generowanie sformatowanego raportu PDF** - Dlaczego odlozone: PRD §Non-Goals; v1 emituje tylko JSON (FR-012); raport PDF to v2 nice-to-have.
- **Integracja SSO banku (SAML/OIDC do corporate IdP)** - Dlaczego odlozone: PRD §Non-Goals; v1 uzywa zarzadzanego IdP z FR-001; konfiguracyjne przejscie na SSO to rownolegly workstream v2.
- **Per-edit append-only audit logging** - Dlaczego odlozone: PRD §Non-Goals; v1 rejestruje jeden rekord finalizacji na przypadek (FR-013); logowanie kazdej edycji bez polityki retencji + redakcji RODO to ryzyko regulacyjne.

## Done

| ID   | Change ID         | Zamkniete     | Commity                                                               | Uwagi                                                                                    |
|------|-------------------|---------------|-----------------------------------------------------------------------|------------------------------------------------------------------------------------------|
| F-01 | auth-scaffold     | 2026-05-31    | 4c15850, 051be9c, 5740584, 1e1cfeb, 43defa5                          | Spring Security OAuth2 Resource Server + Auth0; Angular @auth0/auth0-angular z HTTP interceptorem; integracyjne testy security |
| F-02 | data-layer        | 2026-05-31    | baa7526                                                               | JPA entities (KybCase, AuditRecord) + Spring Data repos; Flyway V1 migration (kyb_case, audit_record); docker-compose PostgreSQL 16; Fly.io provisioning pending (billing) |
| F-03 | frontend-scaffold | 2026-05-29    | 5d57a3b, d82886f, 06e9607, ccc9c39, e11a6ad                          | 4 fazy: Angular 21 scaffold + ClearKYC design system, Maven Frontend Plugin, dev proxy + SPA catch-all routing, app routing + AppLayout split-panel + AuthGuard stub |
| F-05 | design-system-wire | 2026-06-01   | 6bd4e62, 6ce1f8c, ad70324, c93beee                                   | Naprawa 5 broken CSS variable references (_mixins.scss, app-layout.scss); migracja fontow z Google Fonts CDN do @fontsource (latin-ext dla Sans, latin dla Mono); styles.css: 21.8 kB → 6.6 kB, WOFF2: 45 → 7 plikow |
