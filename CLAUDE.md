# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: ClearKYC

KYB (Know Your Business) compliance backend for banks. Senior KYB analysts upload a single complex B2B PDF; an LLM extracts entities (company name, directors, UBOs) with verbatim source citations streaming into a structured form; the analyst verifies / overrides / locks the case with a terminal decision (Approve / Reject / Escalate). Single-document, single-role, single-analyst scope by design — see `@context/foundation/prd.md` for the full spec, non-goals, and FR list.

**Stack** (locked at `@context/foundation/tech-stack.md`): Spring Boot 4.0.6 backend + Maven (wrapper committed) + Java 21 + PostgreSQL (not yet wired) + Angular SPA in `web/` (not yet scaffolded — sibling concern, second pass). Deployment target: Fly.io. CI/CD: GitHub Actions with auto-deploy on merge (not yet wired).

## Build, run, test

Use the committed Maven Wrapper, not a system Maven — version drift is the canonical Java tripwire.

- Run the app (embedded Tomcat on `:8080`, devtools restart enabled): `./mvnw spring-boot:run`
- Run all tests: `./mvnw test`
- Run a single test class: `./mvnw test -Dtest=ClearkycApplicationTests`
- Run a single test method: `./mvnw test -Dtest=ClearkycApplicationTests#contextLoads`
- Build + test + package the runnable JAR: `./mvnw verify` (or `./mvnw package`)
- Build an OCI image (no Dockerfile needed): `./mvnw spring-boot:build-image`
- Clean: `./mvnw clean`

There is no separate lint step yet — Spring Boot ships no opinionated linter by default. When a style/quality tool gets added (Spotless / Checkstyle / SonarLint), record the invocation here.

## What's actually in the repo right now

Bare Spring Initializr output plus the bootstrap-chain `context/` tree. Dependencies declared in `pom.xml`: `spring-boot-starter-webmvc`, `spring-boot-starter-webmvc-test`, `spring-boot-devtools`. Config lives in `src/main/resources/application.properties` (currently a single line: `spring.application.name=clearkyc`). **Everything PRD-mandated is unimplemented**:

- Authentication via managed IdP (FR-001) — needs `spring-boot-starter-oauth2-resource-server` + `spring-boot-starter-security`.
- JPA-persisted audit ledger (FR-013) — needs `spring-boot-starter-data-jpa` + the PostgreSQL JDBC driver + Flyway/Liquibase for migrations.
- JSON-Schema-validated finalization record (FR-012) — needs a JSON Schema library (e.g. `networknt/json-schema-validator`) plus a versioned schema file committed alongside the code.
- Server-side LLM streaming for FR-005–008 — needs an SSE controller (`SseEmitter` / WebFlux `Flux<ServerSentEvent>`) plus an LLM client SDK (Anthropic SDK or equivalent).
- Closed red-flag taxonomy (PRD Open Question 1) — **blocking dependency** for FR-007; the bank must provide the catalog before the red-flag detector can be implemented.
- Fly.io deployment (`fly.toml`, `Dockerfile` or use of `spring-boot:build-image`) — not committed; deployment target is locked in `@context/foundation/tech-stack.md` but no infra files exist yet.
- LLM client SDK choice — not pinned in `pom.xml`. PRD calls for streaming extraction (FR-005–008) but the specific SDK (Anthropic, OpenAI via Spring AI, LangChain4j, etc.) hasn't been selected. Confirm with the owner before adding the dependency.

The single source class is `src/main/java/com/example/clearkyc/ClearkycApplication.java` (group `com.example`, package `com.example.clearkyc`). The auto-generated `ClearkycApplicationTests.contextLoads()` is the only test.

## Mutation testing

Repo uses Stryker for selective mutation testing on risk-critical modules.
Run it only for code covered by the current change or a risk from test-plan.md,
prefer narrowed scope with --mutate "path/to/file.ts:start-end", and do not chase
100% mutation score. Survived mutants should be reviewed one by one: add an
assertion only when the mutant represents a user-visible or business-relevant bug.

## Project-specific tripwires for the agent

These are surfaced from the bootstrap hand-off (`@context/changes/bootstrap-verification/verification.md`) and stand in addition to mainstream Spring/Java knowledge the agent already has from training:

1. **The owner has basic Java fluency and explicitly signaled they cannot reliably judge agent output against Spring conventions** (`self_check_answers.can_judge_agent: false` in `tech-stack.md`). Default to the most mainstream Spring idiom in every choice: constructor injection over field/setter injection, `@Transactional` on the service layer not on repositories or controllers, layered `controller → service → repository`, externalised config in `application.yml`/`.properties` over scattered `@Value` (repo currently uses `.properties` — convert to `.yml` only if the owner confirms), DTOs at the controller boundary instead of leaking JPA entities through the wire. When you deviate from a textbook pattern, **say so explicitly in chat so the owner can decide whether to accept the deviation** — silent non-standard code is the failure mode here.

2. **Spring Boot 4.x is the pinned major.** Version-specific docs land at `https://docs.spring.io/spring-boot/4.0.6/...`. Do not regress to 2.x or 3.x patterns (deprecated `WebSecurityConfigurerAdapter`, `javax.*` imports, etc.) — Spring Boot 4 is on `jakarta.*` and the security DSL is fully fluent.

3. **Java 21 is the language target** (`<java.version>21</java.version>`). Use records for DTOs, pattern-matching `switch`, virtual threads where blocking I/O dominates, sealed hierarchies for closed-set domain types (the red-flag taxonomy is a candidate). Do not target 17 or 11.

4. **`group = com.example`, `artifactId = clearkyc`, `packageName = com.example.clearkyc` were set via a bootstrap deviation** (the registry's Spring `cmd_template` uses `{name}` as a Maven artifactId and would have produced an invalid coordinate under strict substitution). They're correct as-shipped — see the verification log for the deviation rationale — but if the user re-runs `/10x-bootstrapper`, expect the same deviation note to appear again.

5. **No automated dependency audit is wired** (Java has no built-in tool in the bootstrapper's audit table). Recommend OWASP Dependency-Check (`org.owasp:dependency-check-maven`) or Snyk via the Maven plugin before adding non-Spring-Boot dependencies. Spring Boot's BOM pins versions of its own deps — `./mvnw versions:display-dependency-updates` reports drift against the parent BOM.

6. **The Angular SPA scaffolds separately into `web/`** — do not mix `.ts`, `node_modules/`, `angular.json`, or any frontend assets into the Spring source tree. Either re-run `/10x-tech-stack-selector` to lock a frontend hand-off and `/10x-bootstrapper` into `web/`, or `ng new web --routing --style scss` manually from the project root.

7. **`context/` is the bootstrap-chain metadata surface** (PRD, tech-stack hand-off, verification log, future change records) and is **never** code. Tests, scaffolding, and refactors must not touch it.

## Canonical references (do not paste, link)

- `@context/foundation/prd.md` — the product contract. Vision, FRs, NFRs, non-goals, open questions. Read before implementing any FR-numbered feature.
- `@context/foundation/tech-stack.md` — the locked stack hand-off. `starter_id`, deployment target, CI/CD shape, agent-friendly self-check answers.
- `@context/changes/bootstrap-verification/verification.md` — the bootstrap audit trail, including the card-defect deviation, dependency-audit recommendations, and per-FR next-step hints.
- `HELP.md` — Spring Initializr's auto-generated starter guide; useful for the parent-POM-override gotcha if the user touches `<licenses>` or `<developers>`.

When a future change shifts any of these (e.g., dependencies added, Angular scaffolded, taxonomy resolved), update this file's "What's actually in the repo right now" and "tripwires" sections in place — don't append.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
