---
bootstrapped_at: 2026-05-18T15:55:00Z
starter_id: spring
starter_name: Spring Boot
project_name: clearkyc
language_family: java
package_manager: maven
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "null"
---

# Bootstrap verification — clearkyc (Spring Boot)

## Hand-off

Source: `context/foundation/tech-stack.md`

```yaml
starter_id: spring
package_manager: maven
project_name: clearkyc
hints:
  language_family: java
  team_size: solo
  deployment_target: fly
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: false
    from_official_starter: true
    conventions: false
    docs_current: false
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
```

### Why this stack (verbatim from hand-off)

Custom path. The user explicitly chose the Angular + Spring Boot + PostgreSQL enterprise banking stack over the recommended `10x-astro-starter` default for `(web, js)`, anchoring on Spring Boot because the backend carries the load-bearing surface — managed-IdP auth (FR-001), JPA-persisted audit ledger (FR-013), JSON Schema validation on the finalization record (FR-012), Postgres for case state, and the server-side LLM streaming endpoint for FR-005–008 extraction. The Angular SPA is a sibling concern to be scaffolded in a second pass into a `web/` subfolder. Spring clears all four agent-friendly gates and bootstrapper-confidence is `verified`. Two real risks are recorded for downstream awareness: the 6-week after-hours-only PRD timeline against a basic-Java + Angular-only fluency profile, and a self-check where 4 of 5 statements went unmarked (notably `can_judge_agent: false`) — bootstrapper should compensate with a thicker Spring/JPA/Spring-Security CLAUDE.md. `has_ai` is recorded `true` per PRD FRs 005–008 despite being unchecked in the feature audit; the PRD is the contract. Fly.io is Spring's deployment default; CI/CD is GitHub Actions with auto-deploy on merge.

## Pre-scaffold verification

| Signal             | Value     | Severity | Notes                                                                                          |
| ------------------ | --------- | -------- | ---------------------------------------------------------------------------------------------- |
| npm package        | not run   | n/a      | Spring card uses `curl https://start.spring.io/starter.tgz`, not an `npm create` CLI.          |
| GitHub repo        | not run   | n/a      | Card `docs_url` is `https://docs.spring.io/spring-boot/` — not a `github.com/<owner>/<repo>`. |

No recency signals available for this card. Spring Initializr is an HTTP service (always live), and Spring Boot's release cadence is published on the docs site; staleness of the card itself is a registry-maintenance concern, not a per-run check.

## Scaffold log

**Resolved invocation** (with card-defect deviation, see note below):

```
mkdir -p .bootstrap-scaffold && cd .bootstrap-scaffold && \
  curl -sS -o response.tgz "https://start.spring.io/starter.tgz" \
    -d dependencies=web,devtools \
    -d type=maven-project \
    -d javaVersion=21 \
    -d groupId=com.example \
    -d artifactId=clearkyc \
    -d name=clearkyc \
    -d packageName=com.example.clearkyc && \
  tar -xzf response.tgz && rm response.tgz
```

**Strategy**: subdir-then-move
**Exit code**: 0 (HTTP 200 from Spring Initializr, tar extracted cleanly)
**Files moved**: 8 top-level items (`.gitattributes`, `.gitignore`, `.mvn/`, `HELP.md`, `mvnw`, `mvnw.cmd`, `pom.xml`, `src/`)
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently (no pre-existing `.gitignore` in cwd)
**.bootstrap-scaffold cleanup**: deleted

### Generated project shape

- `pom.xml` — `groupId=com.example`, `artifactId=clearkyc`, `name=clearkyc`, Java 21, dependencies: `spring-boot-starter-webmvc`, `spring-boot-devtools`.
- `src/main/java/com/example/clearkyc/ClearkycApplication.java` — main class.
- `src/main/resources/application.properties` — empty stub.
- `src/test/java/com/example/clearkyc/ClearkycApplicationTests.java` — context-loads smoke test.
- Maven Wrapper (`mvnw`, `mvnw.cmd`, `.mvn/wrapper/`) committed.

### Card-defect deviation (recorded for v2 fix)

The `spring` starter card's `cmd_template` in `starter-registry.yaml` uses `{name}` as a **Maven artifactId**, not as a directory name:

```
curl -s https://start.spring.io/starter.tgz -d dependencies=web,devtools \
  -d type=maven-project -d javaVersion=21 -d groupId=com.example \
  -d artifactId={name} | tar -xzf -
```

Strict substitution per the bootstrapper spec (`{name}=.bootstrap-scaffold` for `subdir-then-move`) would have produced two problems: (a) `<artifactId>.bootstrap-scaffold</artifactId>` in `pom.xml` — an invalid Maven coordinate that breaks the build; and (b) the Spring Initializr tarball is **not** wrapped in a subdirectory, so `tar -xzf -` extracts straight into cwd, bypassing the conflict matrix entirely.

To produce a working project AND honor the conflict policy, this run deviated from strict substitution:

1. Substituted `{name}=clearkyc` (the `project_name`) into the `artifactId` parameter so `pom.xml` is valid.
2. Wrapped the `curl|tar` execution in `mkdir .bootstrap-scaffold && cd .bootstrap-scaffold && …` so the scaffold lands in a temp directory, then applied the conflict matrix on move-up.
3. Passed `name=clearkyc` and `packageName=com.example.clearkyc` to Spring Initializr explicitly so the main class and package layout are sensible.

**Recommended v2 registry fix**: rewrite the `spring` card's `cmd_template` to either (a) introduce a separate `{artifact_id}` placeholder distinct from `{name}` (the directory placeholder), or (b) explicitly wrap the extract in a subdirectory the strategy expects (`mkdir {name} && tar -xzf - -C {name}`). The same pattern likely affects any future `curl | tar`-based starter card.

## Post-scaffold audit

**Tool**: skipped — no built-in audit tool for `java`.
**Recommended external tool**: [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/) via the Maven plugin (`org.owasp:dependency-check-maven`), or [Snyk](https://snyk.io/) for SCA across Maven coordinates. Both can be wired into the CI workflow once the project gains additional dependencies beyond Spring Boot starters.

Spring Boot's BOM (`spring-boot-starter-parent`) tracks security advisories upstream; running `./mvnw versions:display-dependency-updates` after `git init` will report drift against the parent BOM. The two declared dependencies (`spring-boot-starter-webmvc`, `spring-boot-devtools`) inherit pinned versions from the BOM at `3.x` (whichever current at scaffold time).

## Hints recorded but not acted on

| Hint                       | Value                              |
| -------------------------- | ---------------------------------- |
| bootstrapper_confidence    | verified                           |
| quality_override           | false                              |
| path_taken                 | custom                             |
| self_check_answers.typed                | false                  |
| self_check_answers.from_official_starter| true                   |
| self_check_answers.conventions          | false                  |
| self_check_answers.docs_current         | false                  |
| self_check_answers.can_judge_agent      | false                  |
| team_size                  | solo                               |
| deployment_target          | fly                                |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                               |
| has_payments               | false                              |
| has_realtime               | false                              |
| has_ai                     | true                               |
| has_background_jobs        | false                              |

**Notable for the future M1L4 (Memory Architecture) skill**:

- `self_check_answers.can_judge_agent: false` combined with `self_check_answers.{typed,conventions,docs_current}: false` and `path_taken: custom` indicates the user is operating outside their fluency zone on Spring Boot specifically. The future agent-context skill should generate a thick `CLAUDE.md` documenting Spring conventions (constructor injection over field injection, `@Transactional` placement, Spring Security filter chain, JPA entity layout, `application.yml` over `.properties` if the user prefers, etc.) so the agent can compensate for the gap.
- `has_auth: true` + `has_ai: true` + `deployment_target: fly` + Spring backend will need: a Spring Security configuration aware of the chosen managed-IdP (PRD FR-001), an SSE controller for streaming LLM output (PRD FR-006), JPA-mapped audit-record entity (PRD FR-013) with a JSON Schema validation hook (PRD FR-012), and a Fly.io deploy descriptor (`fly.toml`).
- The hand-off explicitly anchored on Spring; the **Angular SPA is a separate scaffold**. A second pass through `/10x-tech-stack-selector` (writing `tech-stack-frontend.md`) and a second `/10x-bootstrapper` run into `web/` will produce the SPA. Alternatively, `ng new web --routing --style scss --skip-tests=false` run manually inside the project root produces the same result.
- CI/CD (`github-actions` + `auto-deploy-on-merge`) is not wired in v1; deferred to the future memory-architecture skill or to manual `.github/workflows/ci.yml` authoring.

## Next steps

Next: a future skill will set up agent context (`CLAUDE.md`, `AGENTS.md`). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` (if you have not already) to start your own repo history. The scaffold ships `.gitignore` and `.gitattributes`; the rest of the repo state is yours to compose.
- Smoke-test the build: `./mvnw spring-boot:run` should start the embedded Tomcat on `:8080`. The `web` dependency means a request to `http://localhost:8080/` will 404 cleanly (no controllers wired yet).
- Run the smoke test: `./mvnw test` should pass the auto-generated `ClearkycApplicationTests.contextLoads()`.
- Scaffold the Angular SPA into `web/` as a second pass (`ng new web --routing --style scss` from the project root), or re-run `/10x-tech-stack-selector` to lock that hand-off explicitly.
- Plan the auth integration (PRD FR-001): pick the managed IdP (Keycloak / Auth0 / Okta) and add `spring-boot-starter-oauth2-resource-server` + `spring-boot-starter-security` to `pom.xml`.
- Plan the persistence layer (PRD FR-013): add `spring-boot-starter-data-jpa` + the PostgreSQL JDBC driver, configure `application.properties` for a local Postgres, and define the audit-record entity.
- Address audit findings per your project's risk tolerance — no automated audit ran this pass; wire OWASP Dependency-Check or Snyk before adding non-Spring-Boot dependencies.
