# Relational Data Layer (F-02) — Plan Brief

> Full plan: `context/changes/data-layer/plan.md`

## What & Why

Implementacja trwałości danych: tabele `kyb_case` i `audit_record` z migracją Flyway, encje JPA i repozytoria Spring Data. Bez warstwy danych S-01 (minimalny rdzeń przypadku) nie może persystować przypadku ani rekordu audytu — F-02 to prerequisit dla wszystkich wycinkow użytkownika.

## Starting Point

Brak JPA, brak sterownika PostgreSQL, brak Flyway w `pom.xml`. Brak konfiguracji DataSource w `application.properties`. `fly.toml` istnieje bez sekcji bazy danych. Zero encji, repozytoriów, migracji ani Docker Compose.

## Desired End State

`docker compose up -d` + `./mvnw spring-boot:run -Dspring.profiles.active=dev` uruchamia aplikację z działającą migracją Flyway V1. Tabele `kyb_case` i `audit_record` istnieją w lokalnym PostgreSQL. `./mvnw verify` zielony (5 testów). Na Fly.io PostgreSQL wdrożony i podłączony — aplikacja migruje przy starcie.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Migration tool | Flyway (core + database-postgresql) | Plain SQL, zero krzywej uczenia, solo projekt | Plan |
| ID type | UUID z GenerationType.UUID | JPA 3.1 / Hibernate 6 native; brak numerycznych ID w audit trail | Plan |
| audit_record.payload | JSONB | Queryable w PostgreSQL; schemat JSON (FR-012) definiowany w S-01, nie blokuje F-02 | Plan |
| Test strategy | H2 + @DataJpaTest | Szybkie, bez infrastruktury; H2 2.3.x obsługuje JSONB i TIMESTAMP WITH TIME ZONE w trybie PostgreSQL | Plan |
| Lokalne dev | docker-compose.yml z postgres:16 | Jedno polecenie; identyczne środowisko dla każdego dewelopera | Plan |
| Fly.io provisioning | W planie jako Manual Verification F-02 | Roadmap wymaga "bazy wdrożonej na Fly.io" jako warunek ukończenia F-02 | Plan |
| Zakres F-02 | Encje + repozytoria (brak serwisu/REST) | S-01 projektuje API kiedy zna szczegóły PDF upload; migracja ADD COLUMN jest tania | Plan |
| Case statusy | CREATED / ANALYZING / ANALYZED / LOCKED | Pełny cykl życia z PRD; brak ALTER TABLE później | Plan |
| ContextLoads po JPA | H2 w test/resources (MODE=PostgreSQL) | Flyway V1 migruje na H2; Hibernate waliduje — żadnych mocków DataSource | Plan |

## Scope

**In scope:**
- `pom.xml`: 5 zależności (data-jpa, postgresql, flyway-core, flyway-database-postgresql, h2-test)
- `docker-compose.yml`: PostgreSQL 16 lokalnie
- `application.properties`: DataSource env vars, Hibernate validate, Flyway locations
- `application-dev.properties` (gitignored) + `.example`: lokalne wartości DataSource
- `src/test/resources/application.properties`: H2 datasource z MODE=PostgreSQL
- `V1__create_case_and_audit_tables.sql`: DDL dla kyb_case i audit_record
- `CaseStatus`, `DecisionType` (enumy)
- `KybCase`, `AuditRecord` (encje JPA, pakiet `domain`)
- `KybCaseRepository`, `AuditRecordRepository` (Spring Data, pakiet `repository`)
- `KybCaseRepositoryTest`, `AuditRecordRepositoryTest` (@DataJpaTest + H2)
- Fly.io provisioning: `fly pg create` + `fly postgres attach` + JDBC secrets

**Out of scope:**
- Warstwa serwisowa (@Service) — S-01
- REST endpoint `/api/cases` — S-01
- JSON Schema walidacja payload FR-012 — S-01
- Testcontainers — H2 wystarczy
- GitHub Actions zmiany

## Architecture / Approach

```
pom.xml
  spring-boot-starter-data-jpa
  org.postgresql:postgresql (runtime)
  flyway-core + flyway-database-postgresql
  h2 (test)

src/main/resources/db/migration/
  V1__create_case_and_audit_tables.sql
    kyb_case   (id UUID PK, status TEXT CHECK, timestamps WITH TIME ZONE)
    audit_record (id UUID PK, case_id UUID UNIQUE FK, analyst_identity, decision, finalized_at, payload JSONB)

com.example.clearkyc.domain/
  CaseStatus (CREATED | ANALYZING | ANALYZED | LOCKED)
  DecisionType (APPROVE | REJECT | ESCALATE)
  KybCase (@Entity)
  AuditRecord (@Entity, @JdbcTypeCode(SqlTypes.JSON) payload: String)

com.example.clearkyc.repository/
  KybCaseRepository extends JpaRepository<KybCase, UUID>
  AuditRecordRepository extends JpaRepository<AuditRecord, UUID>

Tests:
  @DataJpaTest + H2 → KybCaseRepositoryTest, AuditRecordRepositoryTest
  @SpringBootTest + H2 (MODE=PostgreSQL) + Flyway → contextLoads()

Local dev:
  docker-compose.yml → postgres:16 → localhost:5432

Fly.io:
  fly pg create clearkyc-db --region fra
  fly postgres attach → DATABASE_URL secret (postgres:// format)
  fly secrets set SPRING_DATASOURCE_* (JDBC format, ręcznie)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Zależności + Konfiguracja + Migracja | `./mvnw compile` zielony, Docker Compose działa, Flyway V1 migruje lokalnie | H2 tryb PostgreSQL musi mieć `MODE=PostgreSQL` w URL — bez tego JSONB i TIMESTAMP WITH TIME ZONE odrzucone |
| 2. Encje JPA + Repozytoria | Model domeny gotowy do użycia przez S-01 | `@JdbcTypeCode(SqlTypes.JSON)` wymaga importu Hibernate 6 API (`org.hibernate.annotations`, nie `jakarta`) |
| 3. Testy + Fly.io | 5 testów zielonych, PostgreSQL na Fly.io gotowy | `fly postgres attach` zwraca `postgres://` URL — Spring wymaga `jdbc:postgresql://`; wymagana ręczna konwersja |

**Prerequisites:** Konto Fly.io z `flyctl` zalogowanym lokalnie, Docker do lokalnego devu.

**Estimated effort:** 1-2 sesje; Fazy 1-2 mogą być w jednej sesji, Faza 3 (Fly.io) wymaga dostępu do internetu i flyctl.

## Open Risks & Assumptions

- H2 obsługa JSONB w MODE=PostgreSQL: H2 2.3.x (BOM Spring Boot 4) powinien obsługiwać — nie zweryfikowane ręcznie, zweryfikuje Faza 1 manual check
- Fly.io free tier: `fly pg create` tworzy maszynę shared-cpu-1x z 256MB; wystarczy dla MVP, nie dla pilotu z dużymi JSONB payloadami
- Payload jako `String` (surowy JSON): S-01 będzie parsować — brak walidacji JSON w F-02 (tylko JSONB constraint w PostgreSQL)

## Success Criteria (Summary)

- `./mvnw verify` zielony: 5 testów (3 SecurityConfig + contextLoads + 5 nowych repository tests = 8 łącznie)
- Flyway `Successfully applied 1 migration` przy lokalnym starcie i deploy na Fly.io
- `psql ... -c "\dt"` pokazuje `kyb_case` i `audit_record`
