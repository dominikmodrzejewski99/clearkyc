# Relational Data Layer (F-02) Implementation Plan

## Overview

Implementacja warstwy trwałości: tabele `kyb_case` i `audit_record` z migracją Flyway, encje JPA i repozytoria Spring Data. Brak warstwy serwisowej i REST — te należą do S-01. PostgreSQL lokalnie przez Docker Compose, na Fly.io przez `fly pg create` + `fly postgres attach`.

## Current State Analysis

- Brak `spring-boot-starter-data-jpa`, brak sterownika PostgreSQL, brak Flyway w `pom.xml`
- Zero konfiguracji DataSource w `application.properties`
- Brak encji, repozytoriów, migracji, ani Docker Compose
- `fly.toml` istnieje (app `clearkyc`, region `fra`), ale bez skonfigurowanej bazy danych; `DATABASE_URL` nie jest ustawiony jako secret Fly.io
- `@SpringBootTest contextLoads()` przechodzi bez DataSource (Spring Boot nie wymaga DataSource gdy JPA nie jest na classpath); po dodaniu JPA test wymagał DataSource — obsłużony przez H2 w test scope

## Desired End State

- `./mvnw verify` zielony: kompilacja, 5 testów (3 SecurityConfigTest + contextLoads + nowe testy repozytorium), package
- `docker compose up -d` uruchamia PostgreSQL 16 lokalnie
- `./mvnw spring-boot:run -Dspring.profiles.active=dev` startuje bez błędu i Flyway V1 migracja przechodzi
- `SELECT * FROM kyb_case` i `SELECT * FROM audit_record` dostępne w lokalnym PostgreSQL
- Na Fly.io: `fly pg create` + `fly postgres attach` podłącza bazę, aplikacja startuje i Flyway migruje

### Key Discoveries

- Flyway 10+ wymaga **dwóch** artefaktów: `flyway-core` + `flyway-database-postgresql` — oba BOM-managed, zero wersji w `pom.xml`
- `GenerationType.UUID` dostępne w JPA 3.1 / Hibernate 6 (Spring Boot 4) — bez `@GenericGenerator`
- `@JdbcTypeCode(SqlTypes.JSON)` (Hibernate 6 API) mapuje pole `String` do `jsonb` w PostgreSQL; H2 automatycznie mapuje do VARCHAR — działa w testach bez konfiguracji
- `@DataJpaTest` domyślnie wyłącza Flyway i używa Hibernate `create-drop` na H2 — testy repozytoriów nie wymagają kompatybilności SQL z H2
- `@SpringBootTest` z H2 w `MODE=PostgreSQL`: Flyway uruchamia V1 migrację na H2, Hibernate waliduje schemat — podwójne zabezpieczenie
- Fly.io `fly postgres attach` zapisuje `DATABASE_URL` w formacie `postgres://` (nie JDBC) — wymagana ręczna konfiguracja JDBC secrets

## What We're NOT Doing

- Warstwa serwisowa (@Service CaseService) — S-01
- REST endpoint `/api/cases` — S-01
- Walidacja JSON Schema payload FR-012 — S-01
- Testcontainers — H2 wystarczy dla F-02; Testcontainers można dodać przy integracji S-01
- Wielokrotne encje inne niż `KybCase` i `AuditRecord` (np. `AuditField`, `Citation`) — S-01
- GitHub Actions zmiany — deploy działa bez zmian w CI dla tej fazy

## Implementation Approach

Trzy fazy sekwencyjne: (1) zależności + konfiguracja + migracja SQL — fundament bez kodu Java, (2) encje JPA + repozytoria — model domeny, (3) testy repozytoriów + weryfikacja Fly.io.

## Critical Implementation Details

**Flyway + H2 w `@SpringBootTest`:** Migracja V1 zawiera `JSONB` i `TIMESTAMP WITH TIME ZONE`. H2 2.3.x (BOM Spring Boot 4) w trybie PostgreSQL (`MODE=PostgreSQL`) obsługuje oba typy. Klucz `spring.datasource.url` w `src/test/resources/application.properties` musi zawierać `;MODE=PostgreSQL` inaczej H2 odrzuci te typy. Bez tego Flyway na H2 zakończy się błędem migracji.

**`anyRequest().permitAll()` a Actuator:** `SecurityConfig` przepuszcza `anyRequest()` jako publiczne — `/actuator/health` jest już jawnie publiczny przez osobną regułę. Po dodaniu JPA `/actuator/health` może wskazywać status bazy danych (Spring Boot auto-konfiguruje health indicator dla DataSource). To jest pożądane zachowanie — health probe Fly.io korzysta z tej trasy.

---

## Phase 1: Zależności + Konfiguracja + Migracja Flyway

### Overview

Dodanie wszystkich zależności Maven, konfiguracja DataSource przez env vars, stworzenie Docker Compose, aktualizacja plików properties i napisanie migracji SQL. Po tej fazie `./mvnw compile` przechodzi, H2 jest dostępne w testach, a schemat bazy jest zdefiniowany w SQL.

### Changes Required

#### 1. Zależności Maven

**File:** `pom.xml`

**Intent:** Dodać JPA, sterownik PostgreSQL, Flyway (core + postgresql module) i H2 do testów. Wszystkie BOM-managed — zero wersji w `<dependency>`.

**Contract:** Pięć nowych `<dependency>` bloków w sekcji `<dependencies>`:
- `spring-boot-starter-data-jpa` (compile)
- `org.postgresql:postgresql` (runtime)
- `org.flywaydb:flyway-core` (compile)
- `org.flywaydb:flyway-database-postgresql` (compile — wymagany przez Flyway 10+ dla PG)
- `com.h2database:h2` (test scope)

#### 2. DataSource konfiguracja — główna

**File:** `src/main/resources/application.properties`

**Intent:** Dodać klucze DataSource czytane z env vars (bezpieczne w prod), ustawić Hibernate na `validate` (Flyway jest właścicielem schematu) i wyłączyć auto-generację DDL.

**Contract:** Dołączyć poniższe klucze:
```properties
spring.datasource.url=${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/clearkyc}
spring.datasource.username=${SPRING_DATASOURCE_USERNAME:clearkyc}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD:clearkyc}
spring.jpa.hibernate.ddl-auto=validate
spring.flyway.locations=classpath:db/migration
```

Fallback wartości (`localhost:5432/clearkyc` + `clearkyc`/`clearkyc`) pasują do Docker Compose. W prod Fly.io nadpisuje przez secrets.

#### 3. DataSource konfiguracja — profil dev i example

**File:** `src/main/resources/application-dev.properties` (gitignored — istniejący)

**Intent:** Dodać lokalne klucze DataSource dla profilu dev; pasują do Docker Compose bez żadnej dodatkowej konfiguracji.

**Contract:** Dołączyć do istniejącego pliku (po linii issuer-uri):
```properties
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/clearkyc
SPRING_DATASOURCE_USERNAME=clearkyc
SPRING_DATASOURCE_PASSWORD=clearkyc
```

**File:** `src/main/resources/application-dev.properties.example` (istniejący template)

**Intent:** Zaktualizować szablon aby deweloperzy wiedzieli jakie klucze dodać.

**Contract:** Dodać sekcję DataSource z placeholderami lub konkretnymi wartościami Docker Compose (są publiczne — serwer lokalny, brak sekretów).

#### 4. Konfiguracja testów — H2

**File:** `src/test/resources/application.properties`

**Intent:** Skonfigurować H2 jako DataSource dla `@SpringBootTest` w trybie kompatybilności PostgreSQL, umożliwiając Flyway V1 migrację na H2.

**Contract:** Dołączyć do istniejącego pliku (po linii jwk-set-uri):
```properties
spring.datasource.url=jdbc:h2:mem:testdb;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE
spring.datasource.driver-class-name=org.h2.Driver
```

Klucz `MODE=PostgreSQL` jest krytyczny — bez niego H2 odrzuci `JSONB` i `TIMESTAMP WITH TIME ZONE` z migracji V1.

#### 5. Docker Compose

**File:** `docker-compose.yml` (nowy plik, root projektu)

**Intent:** Jedno polecenie `docker compose up -d` uruchamia PostgreSQL 16 z kredencjalami pasującymi do domyślnych fallback wartości z `application.properties`.

**Contract:** Serwis `postgres` z obrazem `postgres:16`, zmienne środowiskowe `POSTGRES_DB=clearkyc`, `POSTGRES_USER=clearkyc`, `POSTGRES_PASSWORD=clearkyc`, port `5432:5432`, named volume `postgres_data`.

#### 6. Flyway migracja V1

**File:** `src/main/resources/db/migration/V1__create_case_and_audit_tables.sql` (nowy plik)

**Intent:** Stworzyć dwie tabele z pełnym cyklem życia case i rekordem audytu. Schemat jest własny tej migracji — Hibernate tylko go waliduje, nie modyfikuje.

**Contract:**

```sql
CREATE TABLE kyb_case (
    id          UUID                     PRIMARY KEY,
    status      TEXT                     NOT NULL
                    CHECK (status IN ('CREATED', 'ANALYZING', 'ANALYZED', 'LOCKED')),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    locked_at   TIMESTAMP WITH TIME ZONE
);

CREATE TABLE audit_record (
    id               UUID                     PRIMARY KEY,
    case_id          UUID                     NOT NULL UNIQUE
                         REFERENCES kyb_case(id),
    analyst_identity TEXT                     NOT NULL,
    decision         TEXT                     NOT NULL
                         CHECK (decision IN ('APPROVE', 'REJECT', 'ESCALATE')),
    finalized_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    payload          JSONB                    NOT NULL
);
```

UUID jako `PRIMARY KEY` bez `DEFAULT gen_random_uuid()` — wartość generuje Hibernate (`GenerationType.UUID`). Relacja `audit_record.case_id` jest `UNIQUE` (1:1 z `kyb_case`). `payload JSONB` przechowuje pełny rekord finalizacji (FR-012) — schemat JSON zdefiniowany w S-01.

### Success Criteria

#### Automated Verification

- Kompilacja z nowymi zależnościami: `./mvnw compile`
- Istniejące testy przechodzą: `./mvnw test`

#### Manual Verification

- `docker compose up -d` startuje bez błędu, `docker compose ps` pokazuje `postgres` jako `running`
- `./mvnw spring-boot:run -Dspring.profiles.active=dev` startuje, logi zawierają `Successfully applied 1 migration to schema "public"` (Flyway)
- `psql postgresql://clearkyc:clearkyc@localhost:5432/clearkyc -c "\dt"` pokazuje tabele `kyb_case` i `audit_record`

**Implementation Note:** Po przejściu automated i manual verification tej fazy — poczekaj na potwierdzenie przed przejściem do Fazy 2.

---

## Phase 2: Encje JPA + Repozytoria

### Overview

Implementacja modelu domeny: enumy `CaseStatus` i `DecisionType`, encje `KybCase` i `AuditRecord`, repozytoria Spring Data. Bez logiki biznesowej — S-01 ją doda.

### Changes Required

#### 1. CaseStatus enum

**File:** `src/main/java/com/example/clearkyc/domain/CaseStatus.java` (nowy plik)

**Intent:** Typ wyliczeniowy mapujący statusy cyklu życia case do wartości TEXT w bazie.

**Contract:** Enum `CaseStatus` w pakiecie `com.example.clearkyc.domain` z wartościami `CREATED`, `ANALYZING`, `ANALYZED`, `LOCKED`. Używany przez `KybCase` z `@Enumerated(EnumType.STRING)` — wartości w bazie są literałami, nie liczbami.

#### 2. DecisionType enum

**File:** `src/main/java/com/example/clearkyc/domain/DecisionType.java` (nowy plik)

**Intent:** Typ wyliczeniowy dla terminaler decyzji analityka.

**Contract:** Enum `DecisionType` w pakiecie `com.example.clearkyc.domain` z wartościami `APPROVE`, `REJECT`, `ESCALATE`.

#### 3. KybCase entity

**File:** `src/main/java/com/example/clearkyc/domain/KybCase.java` (nowy plik)

**Intent:** Encja JPA mapowana na tabelę `kyb_case`. Przechowuje status i znaczniki czasowe; logika biznesowa (np. `lock()`) dodana w S-01.

**Contract:** Klasa `KybCase` w `com.example.clearkyc.domain`, adnotacje `@Entity @Table(name = "kyb_case")`. Pola:
- `id: UUID` — `@Id @GeneratedValue(strategy = GenerationType.UUID) @Column(updatable = false, nullable = false)`
- `status: CaseStatus` — `@Enumerated(EnumType.STRING) @Column(nullable = false)`
- `createdAt: Instant` — `@CreationTimestamp @Column(name = "created_at", updatable = false, nullable = false)`
- `updatedAt: Instant` — `@UpdateTimestamp @Column(name = "updated_at", nullable = false)`
- `lockedAt: Instant` — `@Column(name = "locked_at")` (nullable)

Konstruktor publiczny wymagany przez JPA (bez argumentów) oraz konstruktor konwencyjny przyjmujący `CaseStatus` (dla tworzenia instancji w testach i S-01). Gettery dla wszystkich pól; bez setterów dla `id`, `createdAt` (niezmienne po persist).

#### 4. AuditRecord entity

**File:** `src/main/java/com/example/clearkyc/domain/AuditRecord.java` (nowy plik)

**Intent:** Encja JPA mapowana na tabelę `audit_record`. Relacja 1:1 z `KybCase`. Payload JSONB przechowuje pełny rekord finalizacji jako surowy JSON string — deserializacja i schemat walidowany w S-01.

**Contract:** Klasa `AuditRecord` w `com.example.clearkyc.domain`, adnotacje `@Entity @Table(name = "audit_record")`. Pola:
- `id: UUID` — `@Id @GeneratedValue(strategy = GenerationType.UUID) @Column(updatable = false, nullable = false)`
- `kybCase: KybCase` — `@OneToOne(fetch = FetchType.LAZY) @JoinColumn(name = "case_id", nullable = false, unique = true)`
- `analystIdentity: String` — `@Column(name = "analyst_identity", nullable = false)` (subject z JWT)
- `decision: DecisionType` — `@Enumerated(EnumType.STRING) @Column(nullable = false)`
- `finalizedAt: Instant` — `@CreationTimestamp @Column(name = "finalized_at", updatable = false, nullable = false)`
- `payload: String` — `@JdbcTypeCode(SqlTypes.JSON) @Column(nullable = false)` (surowy JSON; Hibernate mapuje do `jsonb` w PostgreSQL)

Import: `org.hibernate.annotations.JdbcTypeCode` i `org.hibernate.type.SqlTypes` (Hibernate 6 API, dostępne przez `spring-boot-starter-data-jpa`).

#### 5. KybCaseRepository

**File:** `src/main/java/com/example/clearkyc/repository/KybCaseRepository.java` (nowy plik)

**Intent:** Repozytorium Spring Data dla CRUD operacji na `KybCase`. Metody niestandardowe (np. `findByStatus`) dodane w S-01 według potrzeby.

**Contract:** Interfejs `KybCaseRepository` w `com.example.clearkyc.repository` rozszerzający `JpaRepository<KybCase, UUID>`. Brak niestandardowych metod w F-02.

#### 6. AuditRecordRepository

**File:** `src/main/java/com/example/clearkyc/repository/AuditRecordRepository.java` (nowy plik)

**Intent:** Repozytorium Spring Data dla operacji na `AuditRecord`.

**Contract:** Interfejs `AuditRecordRepository` w `com.example.clearkyc.repository` rozszerzający `JpaRepository<AuditRecord, UUID>`. Metoda `findByKybCase(KybCase kybCase): Optional<AuditRecord>` — Spring Data generuje query automatycznie z nazwy metody.

### Success Criteria

#### Automated Verification

- `./mvnw compile` — zero błędów kompilacji z nowymi klasami
- `./mvnw test` — wszystkie dotychczasowe testy zielone (SecurityConfigTest 3 testy + contextLoads)

#### Manual Verification

- Klasy encji i repozytoriów widoczne w IDE bez błędów importu (`jakarta.persistence.*`)
- Flyway log podczas startu aplikacji: `Successfully applied 1 migration` (nie: `2 migrations` — V1 już był w Fazie 1)

**Implementation Note:** Po przejściu automated i manual verification tej fazy — poczekaj na potwierdzenie przed przejściem do Fazy 3.

---

## Phase 3: Testy Repozytoriów + Weryfikacja Fly.io

### Overview

Testy `@DataJpaTest` weryfikujące CRUD operacje na encjach, weryfikacja `contextLoads()` z H2, i ręczne provisioning PostgreSQL na Fly.io.

### Changes Required

#### 1. KybCaseRepositoryTest

**File:** `src/test/java/com/example/clearkyc/repository/KybCaseRepositoryTest.java` (nowy plik)

**Intent:** Zweryfikować że `KybCase` poprawnie persystuje, UUID jest generowane i statusy działają z `@Enumerated(EnumType.STRING)`.

**Contract:** Klasa `KybCaseRepositoryTest` w `com.example.clearkyc.repository`, adnotacja `@DataJpaTest`. Wstrzykuje `KybCaseRepository` przez `@Autowired`. Trzy testy:
1. `save_generatesUUID_whenIdNull` — `new KybCase(CaseStatus.CREATED)` → `save()` → `assertNotNull(saved.getId())`
2. `findById_returnsCase_whenExists` — save + `findById(id)` → `assertTrue(found.isPresent())`
3. `save_setsCreatedAt_automatically` — save → `assertNotNull(saved.getCreatedAt())`

`@DataJpaTest` używa H2 in-memory, Flyway wyłączony, Hibernate tworzy schemat z adnotacji encji. Brak konieczności zewnętrznego serwera bazy danych.

#### 2. AuditRecordRepositoryTest

**File:** `src/test/java/com/example/clearkyc/repository/AuditRecordRepositoryTest.java` (nowy plik)

**Intent:** Zweryfikować że `AuditRecord` poprawnie persystuje z powiązaniem do `KybCase` i że pole `payload` JSONB przechowuje JSON string.

**Contract:** Klasa `AuditRecordRepositoryTest` w `com.example.clearkyc.repository`, adnotacja `@DataJpaTest`. Dwa testy:
1. `save_persistsAuditRecord_withJsonPayload` — stwórz i save `KybCase`, następnie `AuditRecord` z `payload = "{\"decision\":\"APPROVE\"}"` → save → `findById` → `assertEquals(payload, found.getPayload())`
2. `findByKybCase_returnsRecord_whenExists` — save case + audit → `findByKybCase(kybCase)` → `assertTrue(found.isPresent())`

#### 3. Aktualizacja ClearkycApplicationTests

**File:** `src/test/java/com/example/clearkyc/ClearkycApplicationTests.java`

**Intent:** Zweryfikować że `contextLoads()` nadal przechodzi po dodaniu JPA — Spring Boot ładuje pełny kontekst, Flyway migruje na H2, Hibernate waliduje schemat.

**Contract:** Bez zmian w kodzie klasy (plik nie był modyfikowany w F-01 i nie musi być zmieniany tutaj jeśli `src/test/resources/application.properties` ma poprawną konfigurację H2). Jeśli test failuje z błędem DataSource — to sygnał błędu w konfiguracji test properties, nie w kodzie klasy.

### Success Criteria

#### Automated Verification

- Wszystkie testy przechodzą: `./mvnw test`
- `KybCaseRepositoryTest` — 3 testy zielone
- `AuditRecordRepositoryTest` — 2 testy zielone
- `ClearkycApplicationTests.contextLoads()` — zielony (Flyway + H2 + Hibernate validate)
- Build: `./mvnw verify`

#### Manual Verification

- Fly.io provisioning: `fly pg create --name clearkyc-db --region fra` (ten sam region co app)
- Fly.io attach: `fly postgres attach clearkyc-db --app clearkyc` (dodaje `DATABASE_URL` secret w postgres:// formacie)
- Fly.io JDBC secrets:
  ```bash
  fly secrets set \
    SPRING_DATASOURCE_URL="jdbc:postgresql://<host>:5432/<db>" \
    SPRING_DATASOURCE_USERNAME="<user>" \
    SPRING_DATASOURCE_PASSWORD="<pass>" \
    --app clearkyc
  ```
  (Wartości z `fly pg show clearkyc-db` lub `fly secrets list`)
- Deploy: push do main lub `flyctl deploy --local-only`; logi Fly.io zawierają `Successfully applied 1 migration to schema "public"`
- Sprawdzenie z Fly.io: `fly postgres connect -a clearkyc-db -d <dbname>` → `\dt` pokazuje tabele

**Implementation Note:** Po przejściu automated i manual verification tej fazy — commity i zamknięcie F-02.

---

## Testing Strategy

### Unit / Integration Tests

- `KybCaseRepositoryTest`: `@DataJpaTest` + H2 — CRUD, UUID generation, timestamps
- `AuditRecordRepositoryTest`: `@DataJpaTest` + H2 — CRUD, relationship, JSON payload
- `ClearkycApplicationTests.contextLoads()`: `@SpringBootTest` + H2 (PostgreSQL mode) + Flyway V1 — pełen kontekst Spring z migracją

### Manual Testing Steps

1. `docker compose up -d` → `docker compose ps` (postgres running)
2. `./mvnw spring-boot:run -Dspring.profiles.active=dev` → logi Flyway: `1 migration applied`
3. `psql postgresql://clearkyc:clearkyc@localhost:5432/clearkyc -c "SELECT * FROM kyb_case LIMIT 1;"` — pusta tabela, bez błędu
4. Fly.io: `fly pg create` → `fly postgres attach` → `fly secrets set` → deploy → `fly logs` dla Flyway

## References

- Roadmap: `context/foundation/roadmap.md` (F-02)
- PRD: `context/foundation/prd.md` (FR-011, FR-013)
- Tech stack: `context/foundation/tech-stack.md`
- Spring Boot 4 JPA: `https://docs.spring.io/spring-boot/4.0.6/reference/data/sql.html`
- Flyway Spring Boot: `https://docs.spring.io/spring-boot/4.0.6/how-to/data-initialization.html`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Zależności + Konfiguracja + Migracja Flyway

#### Automated

- [x] 1.1 `./mvnw compile` — kompilacja z nowymi zależnościami (data-jpa, postgresql, flyway x2, h2)
- [x] 1.2 `./mvnw test` — istniejące testy przechodzą (SecurityConfigTest + contextLoads)

#### Manual

- [ ] 1.3 `docker compose up -d` startuje bez błędu, postgres running
- [ ] 1.4 `./mvnw spring-boot:run -Dspring.profiles.active=dev` startuje; Flyway log: `Successfully applied 1 migration`
- [ ] 1.5 `psql` do lokalnego PostgreSQL pokazuje tabele `kyb_case` i `audit_record`

### Phase 2: Encje JPA + Repozytoria

#### Automated

- [x] 2.1 `./mvnw compile` — zero błędów z nowymi klasami encji/repozytoriów
- [x] 2.2 `./mvnw test` — wszystkie dotychczasowe testy zielone (4/4)

#### Manual

- [x] 2.3 Klasy encji i repozytoriów bez błędów importu w IDE (`jakarta.persistence.*`)

### Phase 3: Testy Repozytoriów + Weryfikacja Fly.io

#### Automated

- [x] 3.1 `KybCaseRepositoryTest` — 3 testy zielone
- [x] 3.2 `AuditRecordRepositoryTest` — 2 testy zielone
- [x] 3.3 `ClearkycApplicationTests.contextLoads()` — zielony
- [x] 3.4 `./mvnw verify` — compile + test + package sukces

#### Manual

- [ ] 3.5 Fly.io: `fly pg create clearkyc-db --region fra` — klaster PG gotowy
- [ ] 3.6 Fly.io: `fly postgres attach` + `fly secrets set` JDBC credentials
- [ ] 3.7 Deploy na Fly.io: logi zawierają `Successfully applied 1 migration`
