# ClearKYC

KYB (Know Your Business) compliance backend for banks. Senior KYB analysts upload a single complex B2B PDF; an LLM extracts entities (company name, directors, UBOs) with verbatim source citations streaming into a structured form; the analyst verifies, overrides, or locks the case with a terminal decision (Approve / Reject / Escalate).

Single-document, single-role, single-analyst scope by design. Full spec, non-goals, and FR list live in `context/foundation/prd.md`.

## Stack

- Spring Boot 4.0.6 (jakarta.* namespace, Hibernate 7.x)
- Java 21 (records, pattern-matching switch, virtual threads)
- Maven Wrapper (committed; do not use system Maven)
- PostgreSQL via CockroachDB Serverless (not yet wired)
- Angular SPA in `web/` (not yet scaffolded; sibling concern)

Locked decisions: `context/foundation/tech-stack.md`, `context/foundation/infrastructure.md`.

## Local development

```bash
./mvnw spring-boot:run            # embedded Tomcat on :8080
./mvnw test                       # run all tests
./mvnw verify                     # build, test, package runnable JAR
./mvnw spring-boot:build-image    # build OCI image via Paketo
```

Health endpoint: http://localhost:8080/actuator/health

## Deployment

Auto-deploy on push to `main` via GitHub Actions (`.github/workflows/fly-deploy.yml`). Target: Fly.io app `clearkyc`, region `fra`, Paketo buildpack with `BP_JVM_VERSION=21`.

Live: https://clearkyc.fly.dev/actuator/health

Manual deploy from local CLI:

```bash
flyctl deploy --local-only
```

(Remote builder in `ams` has been failing transiently; local build via the GitHub runner's Docker is the current stable path. See `context/deployment/deployment-plan.md` for the audit trail.)

## Repository layout

- `src/` Spring Boot source
- `context/foundation/` PRD, tech-stack hand-off, infrastructure decision (read before touching FR-numbered features)
- `context/changes/` bootstrap-verification audit and future change records
- `context/deployment/` deploy plan and post-deploy state
- `.github/workflows/` CI/CD
- `fly.toml` Fly.io app config
- `CLAUDE.md` Guidance for AI coding agents working on this repo

## Status

Smoke deploy live. Persistence, auth, LLM streaming, JSON-Schema-validated finalization, and the Angular SPA are not yet wired. See `CLAUDE.md` "What's actually in the repo right now" for the current honest state.
