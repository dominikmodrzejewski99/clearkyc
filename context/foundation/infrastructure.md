---
project: clearkyc
researched_at: 2026-05-19
recommended_platform: fly.io
runner_up: heroku
context_type: mvp
tech_stack:
  language: java-21
  framework: spring-boot-4.0.6
  runtime: jvm
  database: cockroachdb-serverless-free (postgres-wire compatible)
---

## Recommendation

**Deploy on Fly.io (app compute) + CockroachDB Serverless Free (managed Postgres-wire database).**

Two hard constraints drove the pick: (1) persistent SSE for the FR-005–008 LLM extraction stream rules out every JVM-incompatible platform (Vercel, Netlify, Cloudflare Workers) and every platform with a sub-2-minute hard request timeout (DigitalOcean App Platform 100 s, Railway 15 min cap is only marginal); (2) banking audit ledger + GDPR pushes toward providers with explicit EU regions and signed DPAs. Fly.io passes both — `fra`/`waw`/`cdg` available, configurable `auto_stop_machines = "off"` for SSE, DPA + EU-US Data Privacy Framework certified, official Paketo path for Spring Boot via `BP_JVM_VERSION=21`. CockroachDB Serverless Free supplies 10 GB Postgres-wire storage at $0/mo — Hibernate 6.x ships a native `CockroachDialect`, so the JPA/Flyway stack from `tech-stack.md` stays intact. Combined monthly cost at MVP traffic ≈ **$2–3/mo (Fly compute only)**, matching the developer interview's "minimize cost" weighting without sacrificing the persistent-process + EU-residency requirements.

## Platform Comparison

| Platform | CLI-first | Managed | Agent docs | Stable deploy API | MCP / integration | Verdict |
|---|---|---|---|---|---|---|
| **Fly.io** | Pass | Pass | Pass (markdown source on GitHub, "Copy page as markdown" buttons) | Pass (`flyctl deploy`, `flyctl releases rollback`) | Partial (`fly mcp server` experimental, also `superfly/flymcp`) | **Recommended** |
| **Heroku** | Pass | Pass | Partial (DevCenter HTML, no llms.txt) | Pass (`heroku releases:rollback` GA) | Pass (official `heroku/heroku-mcp-server` GA) | Runner-up |
| **Render** | Pass | Pass | Pass (`llms.txt` + per-page `.md`) | Pass (`render deploys create`, MCP) | Pass (Render MCP GA Aug 2025) | Third |
| **Railway** | Pass | Pass | Partial (MDX on GitHub, no llms.txt) | Partial (rollback dashboard-only, no `railway rollback` verb) | Pass (Railway MCP GA, hosted remote) | Out (15-min SSE cap + no public DPA) |
| **DigitalOcean App Platform** | Pass | Pass | Pass | Pass | Pass (DO MCP GA) | **Dropped** (100 s hard request timeout breaks LLM SSE) |
| **Cloudflare / Vercel / Netlify** | n/a | n/a | n/a | n/a | n/a | **Dropped** (no native JVM runtime) |

### Shortlisted Platforms

#### 1. Fly.io (Recommended)

Strongest fit for the constraint set: persistent JVM via OCI containers + Paketo buildpack, EU regions including `waw` for app compute, configurable autostop for SSE workloads, official `flyctl` CLI covering deploy/logs/rollback, mature GitHub Actions story for auto-deploy on merge (matches `tech-stack.md` `ci_default_flow: auto-deploy-on-merge`). MCP server is experimental — agent ops loop should plan for either CLI-based MCP fallback or hardened CLI parsing until GA. Free tier was removed in October 2024 but pay-as-you-go pricing for the smallest always-on machine is ~$1.94–3.19/mo, which is close enough to free at MVP scale.

#### 2. Heroku

Best Java DX in the shortlist: native Spring Boot detection via the official Java buildpack, Java 21 supported via `system.properties` (`java.runtime.version=21`), git-push deploys, mature `heroku releases:rollback`, official MCP server GA. EU Common Runtime lives in Ireland (AWS eu-west-1) — fine for MVP, but strict data-residency for a Polish bank pilot would need Heroku Private Spaces at ~$1,000/mo Enterprise. Eco dyno ($5/mo) sleeps after 30 min idle (cold start ~15 s on JVM Spring Boot — breaks click-to-extract UX); the realistic MVP tier is Basic ($7) + Postgres Essential-1 ($9) ≈ $16/mo. The 24-hour dyno cycle requires idempotent extraction jobs (relevant for FR-005–008 if a stream is mid-flight at restart).

#### 3. Render

Best agent-friendliness signals — `llms.txt` published, per-page markdown via URL suffix, Render MCP server GA since August 2025, Frankfurt EU region. Disqualified from top pick by two SSE-specific failure modes documented in community reports: connections drop past ~5 min (real for LLM extraction streams) and zero-downtime deploys replace the instance mid-stream (clients need reconnect logic anyway, but state recovery becomes mandatory). Java is not a native runtime — Spring Boot deploys via Dockerfile or `./mvnw spring-boot:build-image`. Realistic MVP: Starter ($7) + Postgres Basic (~$6) ≈ $13/mo.

## Anti-Bias Cross-Check: Fly.io

### Devil's Advocate — Weaknesses

1. **Cost-vs-MPG tension.** Fly Managed Postgres Basic is $38/mo — the priciest option in the shortlist. The mitigation chosen here (external CockroachDB Serverless Free) introduces cross-vendor latency (sub-10 ms within same EU region but routes outside Fly's network) and an additional DPA to track separately from Fly's.
2. **JVM cold start vs autostop.** Spring Boot 4 + JPA + Spring Security bootstraps 8–15 s. With `auto_stop_machines = "stop"` enabled to cut compute cost further, the first request after idle hangs for seconds — breaks the PRD's click-to-extract UX. `auto_stop_machines = "off"` + `min_machines_running = 1` mandatory for analyst-facing traffic.
3. **MCP server experimental.** Tying the agent's ops loop to `fly mcp server` (currently flagged `[experimental]`) risks breaking changes without deprecation window. Fallback path is brittle CLI output parsing in subagents.
4. **MPG Frankfurt-only.** If the team ever migrates from CockroachDB to Fly's Managed Postgres (e.g. for tighter network integration), EU MPG is only in `fra` — app in `waw` means cross-EU-border DB calls, 25–35 ms per query. Acceptable, but bank compliance may flag the cross-border movement.
5. **CLOUD Act exposure.** Fly Inc. is a US Delaware C-Corp. EU-US Data Privacy Framework + DPA mitigate, but US government can compel disclosure of EU customer data. For a Polish bank pilot, this becomes a legal conversation — bank DPO may require EU-incorporated provider (Scaleway, OVH, Hetzner) as a pilot precondition.

### Pre-Mortem — How This Could Fail

Six months after launch: the team picked Fly.io because `tech-stack.md` said so and the EU compliance story looked clean. To match the "minimize cost" interview answer, they enabled `auto_stop_machines = "stop"` on the app machine; the first analyst session every morning hung 12 seconds on JVM cold start. Analysts learned to "warm up" the app by pressing refresh — productivity tax that wasn't measured but degraded the UX promise of the PRD. Three months in, CockroachDB Serverless Free hit the 10 GB cap (audit ledger + JSON Schema validation records grew faster than expected); migration to CockroachDB paid tier was painless, but the team also discovered the `fly mcp server` experimental flag had silently broken between flyctl releases, so the GitHub Actions deploy started failing on unrelated runs. Then a regional bank pilot escalated CLOUD Act concerns — Fly's US incorporation forced a hard pivot to Scaleway, requiring a full container repush + secrets rotation + DB migration. Pilot slipped two months. **Lesson:** decouple the cost choice from the cold-start choice (always `min_machines_running = 1`); set storage growth alerts on Cockroach early; verify CLOUD Act tolerance with the bank's DPO *before* committing to a US-incorporated provider, not after.

### Unknown Unknowns

- **Paketo defaults to Java 17, not 21.** Without `BP_JVM_VERSION=21` in `fly.toml` env, builds "look OK" but land on 17, and Spring Boot 4 jakarta.* + some transitive deps misbehave subtly. Pin it explicitly on day one.
- **CockroachDB is Postgres-wire-compatible, not Postgres.** Quirks: no `SERIAL` (use `UUID DEFAULT gen_random_uuid()`), no `pg_advisory_lock`, limited Postgres extension set (no `pg_trgm` parity, `pgcrypto` only via experimental flag). Hibernate `CockroachDialect` handles SQL generation but if any Flyway migration uses raw Postgres-only syntax, it'll fail at deploy time, not at compile.
- **Always Free hosts reclaimed after idle.** Not applicable to Fly (no free tier) but listed because anyone considering the "$0 forever via Oracle" alternative needs to know Oracle reclaims Always Free instances after 7 days of inactivity (since Oct 2023).
- **`flyctl mcp server` flag is `[experimental]`.** If the agent ops loop is wired to it, expect refactor at GA or stay on a deprecated path.
- **Fly changed pricing twice in 18 months.** Pay-as-you-go since Oct 2024, volume snapshots since Jan 2026. Budget volatility risk for a multi-month MVP; track Fly's pricing blog and adjust the cost ceiling in `infrastructure.md` quarterly.
- **For a single-analyst single-region MVP, Fly's multi-region edge architecture is over-engineered.** You pay the conceptual complexity (regions, machines, anycast, autostop) without using the strength (global low-latency). Single-region PaaS would be operationally simpler — chosen anyway because of the SSE + EU compliance story.

## Operational Story

- **Preview deploys**: PR-triggered preview apps via `fly deploy --app clearkyc-pr-<num>` in a GitHub Actions workflow; isolated by app name. Protect with a Cloudflare Access policy or `fly_machines` IP allowlist to avoid exposing analyst PII URLs publicly. Fork PRs cannot read `FLY_API_TOKEN` — skip preview deploy for forks.
- **Secrets**: `flyctl secrets set DATABASE_URL=… ANTHROPIC_API_KEY=… JWT_ISSUER=…` — encrypted in Fly's Vault, exposed as env vars in machines. Rotate quarterly via `flyctl secrets unset` + set; mid-rotation requires `flyctl deploy` to roll machines. CI/CD token rotation: regenerate `FLY_API_TOKEN` from Fly dashboard, update `FLY_API_TOKEN` in GitHub repo secrets, no app redeploy needed.
- **Rollback**: `flyctl releases list` to find the prior good release, `flyctl releases rollback <version>` to revert. Typical time-to-revert ≈ 30–90 s for a single small machine. **DB migrations do NOT roll back automatically** — every Flyway migration must be paired with a documented undo migration before merge, otherwise rollback leaves the DB schema ahead of the rolled-back code.
- **Approval**: human-required for: production `flyctl deploy --strategy immediate` (vs canary), secret rotation, scaling beyond shared-cpu-2x, deleting any Fly Volume, dropping a Cockroach DB. Agent may perform unattended: `flyctl logs` reads, `flyctl status` checks, GitHub Actions auto-deploy on merge to `main` (which is itself gated by PR review).
- **Logs**: `flyctl logs --app clearkyc -n` for tail; `flyctl logs --app clearkyc --json` for structured agent consumption. CockroachDB logs via Cockroach Cloud console (read-only export to S3 or webhook configurable but not free-tier). Runtime metrics: Fly's built-in Grafana at `https://fly-metrics.net/`.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Paketo default JVM = 17, builds silently degrade | Unknown unknowns | H | M | Set `BP_JVM_VERSION=21` in `fly.toml` env on day one; assert Java version in `ClearkycApplicationTests.contextLoads()` |
| CockroachDB Postgres-wire quirks break Flyway migrations | Unknown unknowns | M | M | Run every Flyway migration against a local CockroachDB before merge (`docker run cockroachdb/cockroach start-single-node --insecure`); avoid `SERIAL` and advisory locks |
| JVM cold start with autostop breaks UX | Devil's advocate | H | H | Hard-set `auto_stop_machines = "off"` + `min_machines_running = 1` for the analyst-facing app machine; document the cost trade-off ($3/mo vs UX) in `fly.toml` comment |
| CLOUD Act blocks Polish bank pilot | Devil's advocate / Pre-mortem | M | H | Surface to bank DPO during pilot kickoff, not after; have Scaleway / OVH migration story drafted before pilot SoW signed |
| 10 GB CockroachDB free cap hit mid-pilot | Pre-mortem | M | M | Set storage alert at 7 GB; budget $40–60/mo for paid Cockroach tier as Phase-2 line item |
| `fly mcp server` experimental flag breaks unattended | Devil's advocate | M | L | Wrap MCP calls in subagent that falls back to `flyctl` CLI parsing; pin `flyctl` version in CI |
| SSE drops past Fly's 60 s proxy idle window | Research finding | H if no heartbeat | H | SseEmitter sends `event: ping` every 30 s during LLM extraction; client EventSource auto-reconnects |
| DB migration rollback gap (forward-only Flyway) | Operational | M | H | Every PR with a migration ships paired undo migration in same commit; reviewer checklist enforces it |
| Cross-vendor DPA (Fly + CockroachDB) | Devil's advocate | L | M | Track both DPAs in `context/foundation/compliance/dpa-register.md` (to be created); review quarterly |
| Fly pricing changes mid-pilot | Unknown unknowns | M | L | Quarterly review of `https://fly.io/pricing`; reflect cost ceiling changes here |

## Getting Started

Concrete first steps for the **exact pinned versions** in `tech-stack.md` (Spring Boot 4.0.6, Java 21, Maven Wrapper):

1. **Install `flyctl` and authenticate.**
   ```bash
   curl -L https://fly.io/install.sh | sh
   export PATH="$HOME/.fly/bin:$PATH"
   flyctl auth login
   ```

2. **Provision the Fly app from the project root.** `flyctl launch --no-deploy` autodetects Spring Boot from `pom.xml` and writes `fly.toml` + `Dockerfile`. Then edit `fly.toml`:
   ```toml
   app = "clearkyc"
   primary_region = "fra"  # waw if Polish-bank pilot requires Polish residency

   [build]
     builder = "paketobuildpacks/builder-jammy-base"
     [build.args]
       BP_JVM_VERSION = "21"

   [env]
     SPRING_PROFILES_ACTIVE = "prod"

   [[services]]
     internal_port = 8080
     protocol = "tcp"
     auto_stop_machines = "off"
     auto_start_machines = true
     min_machines_running = 1
   ```

3. **Sign up for CockroachDB Serverless Free** at `https://cockroachlabs.cloud/`. Pick region `eu-central-1` (Frankfurt) for EU residency. Copy the JDBC connection string from the console (looks like `jdbc:postgresql://<cluster>.cockroachlabs.cloud:26257/clearkyc?sslmode=verify-full&user=…&password=…`).

4. **Wire secrets.**
   ```bash
   flyctl secrets set \
     DATABASE_URL="jdbc:postgresql://<cluster>.cockroachlabs.cloud:26257/clearkyc?sslmode=verify-full&user=…&password=…" \
     SPRING_DATASOURCE_DRIVER_CLASS_NAME="org.postgresql.Driver"
   ```

5. **Add the dependencies to `pom.xml`** (one PR per concern — auth, JPA, JSON Schema, LLM streaming are separate per `tech-stack.md` deferred work):
   ```xml
   <dependency>
     <groupId>org.springframework.boot</groupId>
     <artifactId>spring-boot-starter-data-jpa</artifactId>
   </dependency>
   <dependency>
     <groupId>org.postgresql</groupId>
     <artifactId>postgresql</artifactId>
     <scope>runtime</scope>
   </dependency>
   <dependency>
     <groupId>org.flywaydb</groupId>
     <artifactId>flyway-database-postgresql</artifactId>
   </dependency>
   ```
   Set `spring.jpa.database-platform=org.hibernate.dialect.CockroachDialect` in `application.properties`.

6. **Deploy.** `flyctl deploy` (or push to `main` once the GitHub Actions workflow is wired). Verify with `flyctl status` and `flyctl logs -n`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration (Paketo handles this; custom Dockerfile only if Paketo proves limiting)
- CI/CD pipeline setup (GitHub Actions auto-deploy on merge per `tech-stack.md`; pipeline definition is a separate concern)
- Production-scale architecture (multi-region failover, HA, DR, dedicated Fly Machines instead of shared-cpu-1x)
- LLM provider selection (Anthropic vs OpenAI via Spring AI vs LangChain4j — separate decision per `CLAUDE.md` deferred work)
- Closed red-flag taxonomy (PRD Open Question 1 — blocking dependency for FR-007, not infrastructure)
- Authentication IdP selection (FR-001 — Auth0/Clerk/Keycloak picked separately, not infrastructure)
