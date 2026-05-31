<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Relational Data Layer (F-02)

- **Plan**: context/changes/data-layer/plan.md
- **Scope**: Phase 1 + 2 + 3 (all phases)
- **Date**: 2026-05-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Plan Drift Notes

- `flyway-core` replaced with `spring-boot-starter-flyway` (Spring Boot 4.x auto-configuration requirement — accepted deviation)
- `spring-boot-starter-data-jpa-test` added in test scope (Spring Boot 4.x modular test slice requirement — benign extra)
- `@DataJpaTest` required `@TestPropertySource(spring.flyway.enabled=false, ddl-auto=create-drop)` workaround (SB4 behavior change — accepted)
- `saveAndFlush()` used instead of `save()` in timestamp test (required for `@CreationTimestamp` visibility before flush — accepted)
- docker-compose.yml port `5433:5432` instead of `5432:5432` (conflict avoidance — addressed by F1 fix)

## Findings

### F1 — Port mismatch: docker-compose host port vs. application.properties default

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: docker-compose.yml:8 vs. src/main/resources/application.properties:9
- **Detail**: docker-compose.yml maps host port as 5433:5432. Fallback in application.properties was localhost:5432. Developer without SPRING_DATASOURCE_URL set gets connection-refused even with Docker running.
- **Fix**: Changed fallback in application.properties to `localhost:5433` — consistent with docker-compose.yml.
- **Decision**: FIXED (Fix A — fallback changed to 5433)

### F2 — @DataJpaTest bypasses Flyway: schema drift between migration and ORM untested

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: KybCaseRepositoryTest.java:14, AuditRecordRepositoryTest.java:16
- **Detail**: Both @DataJpaTest tests have spring.flyway.enabled=false and ddl-auto=create-drop (SB4 requirement). Hibernate generates schema from entity annotations, not from V1 SQL. CHECK constraints and UNIQUE constraints are never tested.
- **Fix**: Skip — plan explicitly excludes Testcontainers from F-02 ("H2 wystarczy"). Address in S-01 with one Testcontainers or @SpringBootTest+Flyway+CRUD integration test.
- **Decision**: SKIPPED

### F3 — spring.jpa.open-in-view not disabled

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/main/resources/application.properties
- **Detail**: Defaults to true — holds DB connection open for full HTTP request lifecycle. Application is stateless JWT API (STATELESS session), open-in-view is pointless and wastes connection pool resources.
- **Fix**: Added `spring.jpa.open-in-view=false` to application.properties.
- **Decision**: FIXED

### F4 — KybCase.setStatus() and setLockedAt() lack domain invariant guards

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/main/java/com/example/clearkyc/domain/KybCase.java:43,47
- **Detail**: Setters allow arbitrary status changes including backward transitions (LOCKED -> CREATED). PRD has terminal decision concept — LOCKED should be a terminal state. Service layer in S-01 will enforce invariants via lock() method.
- **Decision**: SKIPPED (accepted — service layer S-01 will enforce invariants)

### F5 — Fly.io provisioning skipped (billing)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md: items 3.5, 3.6, 3.7
- **Detail**: Manual Fly.io steps not executed — account requires credit card. Automated verification (3.1-3.4) complete and green. Code scope of F-02 fully implemented.
- **Decision**: ACCEPTED AS PENDING — execute before S-01 when billing is resolved
