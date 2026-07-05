# ClearKYC

KYB (Know Your Business) compliance platform for banks. Senior KYB analysts upload a single complex B2B PDF; an LLM extracts entities (company name, directors, UBOs) with verbatim source citations streaming into a structured form; the analyst verifies, overrides, or locks the case with a terminal decision (Approve / Reject / Escalate).

Single-document, single-role, single-analyst scope by design. Full spec, non-goals, and FR list live in `context/foundation/prd.md`.

## Stack

- Spring Boot 4.0.6 (jakarta.* namespace, Hibernate 7.x)
- Java 21 (records, pattern-matching switch, virtual threads)
- Maven Wrapper (committed; do not use system Maven)
- PostgreSQL via CockroachDB Serverless
- Angular 21 SPA in `web/` with Auth0 authentication
- Google Gemini (gemini-3.1-flash-lite) for entity extraction with streaming

Locked decisions: `context/foundation/tech-stack.md`, `context/foundation/infrastructure.md`.

## Local development

```bash
./mvnw spring-boot:run            # embedded Tomcat on :8080
./mvnw test                       # run all tests
./mvnw verify                     # build, test, package runnable JAR
./mvnw spring-boot:build-image    # build OCI image via Paketo
```

Frontend (Angular):
```bash
cd web
npm start                         # dev server on :1999, proxies API to :8080
npx playwright test               # run E2E tests
```

Health endpoint: https://clearkyc.fly.dev/actuator/health

## Deployment

Auto-deploy on push to `main` via GitHub Actions (`.github/workflows/fly-deploy.yml`). Target: Fly.io app `clearkyc`, region `fra`, Paketo buildpack with `BP_JVM_VERSION=21`.

Live: https://clearkyc.fly.dev

Manual deploy from local CLI:

```bash
flyctl deploy --local-only
```

## Repository layout

- `src/` — Spring Boot backend (REST API, LLM streaming, persistence)
- `web/` — Angular SPA (upload form, extraction viewer, case finalization)
- `context/foundation/` — PRD, tech-stack, infrastructure decisions
- `context/changes/` — change records and audit trail
- `context/deployment/` — deploy plan and post-deploy state
- `.github/workflows/` — CI/CD
- `fly.toml` — Fly.io app config
- `CLAUDE.md` — Guidance for AI coding agents working on this repo

## Status

MVP complete: Auth0 login, PDF upload, LLM entity extraction with streaming, citation navigation, case finalization (Approve/Reject/Escalate), persistence to CockroachDB. Deployed live on Fly.io.
