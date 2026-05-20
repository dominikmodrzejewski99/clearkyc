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

## 10xDevs AI Toolkit — Module 1, Lesson 5

Pick a deployment platform and ship to production with the **infra chain**:

```
(/10x-init  →  /10x-shape  →  /10x-prd  →  /10x-tech-stack-selector  →  /10x-bootstrapper  →  /10x-agents-md  →  /10x-rule-review  →  /10x-lesson)  →  /10x-infra-research  →  Plan Mode deploy
```

The full Module 1 chain ships from Lessons 1–4 (re-included so you can fix any earlier contract mid-flight). `/10x-infra-research` is the lesson's main topic; the deploy step itself uses the host's built-in **Plan Mode** rather than a dedicated skill — the artifact (`context/deployment/deploy-plan.md`) is what carries forward.

### Task Router — Where to start

| Skill | Use it when |
| --- | --- |
| **Infrastructure (lesson focus)** | |
| `/10x-infra-research [path-to-tech-stack-or-prd]` | You have a `context/foundation/tech-stack.md` (and ideally a `prd.md`) and need to pick an MVP deployment platform. The skill loads the stack as a hard constraint, runs a 5-question developer interview (persistent connections, cost sensitivity, existing familiarity, global reach, co-location preference), spawns parallel subagent research across six candidate platforms, scores them Pass/Partial/Fail across the five agent-friendly criteria from `references/agent-friendly-criteria.md`, shortlists the top three, and runs a three-lens anti-bias cross-check on the leader (devil's advocate, pre-mortem, unknown unknowns) before writing `context/foundation/infrastructure.md`. Use AFTER `/10x-tech-stack-selector`, BEFORE `/10x-implement`. |
| **Deploy (host built-in, not a skill)** | |
| Plan Mode deploy | You have `infrastructure.md` + `tech-stack.md` and want a read-only plan reviewed before any mutation hits the platform. Activate the host's plan mode (Claude Code: `Shift+Tab` cycles default → auto-accept → plan; IDE: dedicated button) with the prompt "Wykonajmy pierwsze wdrożenie w oparciu o `@infrastructure.md`, zgodnie ze stackiem z `@tech-stack.md`". Read the plan, demand corrections, approve, then let the agent execute. The approved plan persists at `context/deployment/deploy-plan.md` so the next lesson's milestone planning can reference what's already deployed and which secrets are already wired. |
| **Re-run upstream if needed** | |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-rule-review` / `/10x-lesson` / `/10x-stack-assess` / `/10x-health-check` | Bundled so you can patch any earlier contract mid-flight. If the anti-bias cross-check forces a platform swap that pushes a stack-shaped decision (e.g. "this DB doesn't fit any platform we'd accept"), re-run `/10x-tech-stack-selector` to keep `tech-stack.md` and `infrastructure.md` aligned. |

### How the chain hands off

- `/10x-infra-research` reads `context/foundation/tech-stack.md` (language, framework, runtime, database) as **hard constraints** — platforms that can't run the stack are dropped before scoring. It also reads `context/foundation/prd.md` (scale, latency, uptime expectations) as **soft weights** when scoring. Both inputs are optional but strongly recommended; without them the skill proceeds but warns.
- The skill writes `context/foundation/infrastructure.md` as the third foundation contract: frontmatter (`project`, `researched_at`, `recommended_platform`, `runner_up`, `context_type`, `tech_stack`) plus a body covering recommendation, full platform comparison with scoring matrix, anti-bias findings, operational story (preview / secrets / rollback / approval / logs), and a risk register tying every entry back to the lens that surfaced it. On collision the skill prompts: overwrite, save as `infrastructure-v2.md`, or abort.
- Plan Mode reads `infrastructure.md` and `tech-stack.md` together. The agent emits a step-by-step plan covering automated steps it owns, manual setup gates (account creation, secret configuration), exact deploy commands (Pages vs Workers commands are NOT interchangeable on Cloudflare — the plan must specify), and verification steps. The plan is rejected/edited until it's right; only then does Plan Mode exit and execution begin. The approved plan lands at `context/deployment/deploy-plan.md` and is consumed downstream by milestone-planning skills as ground truth for "what's already deployed".

### What the lesson's skills capture (and what they do NOT)

- **`/10x-infra-research` captures**: platform shortlist scored against five agent-friendly criteria (CLI quality, managed/serverless degree, agent-readable docs, stable/scriptable deploy API, MCP or first-class agent integration), three anti-bias outputs on the leader (numbered weaknesses, 150–200-word failure narrative, 3–5 unknown-unknowns), an operational story with one concrete answer per axis (not categories), and a risk register where every row names its source lens (`Devil's advocate` / `Pre-mortem` / `Unknown unknowns` / `Research finding`). Status of every non-GA feature is captured inline (`beta` / `preview` / `region-limited` / `deprecated`) with the date the status was checked.
- **`/10x-infra-research` does NOT** build Docker images or write Dockerfiles, configure CI/CD pipelines, or plan beyond MVP scope (multi-region HA is explicitly out of scope). It does NOT decide for you — the user accepts, swaps to runner-up, or aborts after the cross-check, and that decision is recorded in the output.
- **Plan Mode** captures: an explicit human gate between "agent has a plan" and "agent mutates production". The artifact (`deploy-plan.md`) is the audit trail for "what was supposed to happen" when the live run goes sideways. Plan Mode does NOT replace `/10x-infra-research` (the platform decision must already be made — Plan Mode plans the deploy, it doesn't pick where to deploy).

### The five agent-friendly criteria (and why they're load-bearing)

The criteria that make `/10x-infra-research`'s scoring matrix are not generic "good platform" axes — they're the specific traits that determine whether an agent can operate this platform from a session without you holding its hand:

1. **CLI-first** — every routine operation has a documented command; the agent doesn't need to click in a panel.
2. **Managed / serverless** — fewer moving pieces means fewer ways the agent (or you) breaks something the platform was supposed to handle.
3. **Agent-readable docs** — markdown / `llms.txt` / GitHub-hosted docs the agent can fetch and parse, not JS-rendered marketing pages.
4. **Stable, scriptable deploy API** — predictable exit codes, structured output, no interactive prompts mid-deploy.
5. **MCP server or first-class agent integration** — bonus, not required. CLI alone is fine for MVP; MCP earns its keep when the agent makes dozens of structured queries against live state.

Hard filters apply before scoring (persistent-connection requirement drops Netlify/Vercel serverless-only; tech-stack runtime mismatch drops the platform entirely). Interview answers reweight criteria after — cost sensitivity penalizes expensive base tiers, familiarity breaks ties, global-reach preference favours edge-native platforms, co-location preference favours integrated databases.

### Anti-bias as a decision discipline (not theatre)

Every research conversation with an LLM has a built-in tilt toward whatever the user already signalled. `/10x-infra-research` runs three structured lenses against the leader BEFORE the file is written, not after:

- **Devil's advocate** — *find the weaknesses, hidden costs, and failure modes specific to deploying `<this stack>` on `<this platform>`*. Output is a numbered list of 3–5 specifics, not categories.
- **Pre-mortem** — *six months later, this decision turned out to be a complete disaster; walk through the assumptions and underestimated risks that led there*. Output is a 150–200-word narrative; narratives surface concrete failure shapes that abstract risk lists hide.
- **Unknown unknowns** — *what's true about this combination that the marketing page and docs don't make obvious?* Output is 3–5 non-obvious risks.

After the cross-check the user has three real options: **proceed with the leader and absorb the risks into the register**, **swap to runner-up** (and re-run the cross-check on the new leader), or **swap to third place**. The third option is rare; if it never happens across many runs, the cross-check has degraded into a ritual and should be rewritten.

Two additional techniques (no skill required, raw prompts) belong in the same toolbox: forcing the model to compare three alternatives in a markdown table (structure beats "the same answer in different words"), and role-rotation (the same decision through a frontend dev's, security person's, and cost owner's eyes — surface the cost each role pays and propose alternatives if any of them flinch).

### CLI vs MCP for live-infra operability

After deploy, the agent needs a way to talk to the running platform. Two paths, complementary not competing:

- **CLI** (`wrangler`, `flyctl`, `vercel`, `gh`) — explicit and auditable, output stays in the terminal, safer defaults for irreversible actions (e.g. `netlify deploy` is draft by default; `--prod` must be passed). Best for MVP: minimal setup, low context cost (no tool schemas pre-loaded), and the agent has to know the command (which is where a per-tool skill helps).
- **MCP** — a dedicated server exposing structured tools with schemas (`pages_deployments_list`, etc.). Each connected MCP server adds tool definitions to the context window, so cost compounds across servers. Earns its keep when the agent makes many discovery-style queries against live state (logs, deployment diffs) and structured JSON beats parsing CLI output.

Sensible default: start with CLI, add MCP when you notice a recurring pattern of `--help` traversal the agent has to do to answer a class of questions. Anthropic's own [building-agents-that-reach-production](https://claude.com/blog/building-agents-that-reach-production-systems-with-mcp) framing is "API, CLI, and MCP are three complementary paths" — pick by task, not by hype.

### Production-access boundary (minimal permissions, human-on-irreversibles)

Both CLI and MCP can give the agent direct access to production. The lesson sets a default posture:

- **Tokens are scoped, not master keys.** On Cloudflare: an API token limited to Pages or Workers for one project, no DNS, no Workers Secrets for unrelated projects, no billing. AWS / GCP equivalent: scoped IAM role with `console-only-user` or read-only on production, full access on staging.
- **Tokens live in env vars, not in `.mcp.json` committed to the repo.** The agent picks them up via the MCP server or CLI's env-discovery, not via plaintext in conversation.
- **Destructive actions are human-only.** Drop a database, rotate a primary secret, delete a project — those are panel-by-hand operations, even if the agent suggests them. Manual click costs 30 seconds; cleanup after an automated mistake costs hours.

This is the MVP posture. As the project matures, the natural evolution is staging gets full agent access, production becomes read-only — covered in later modules.

### Foundation paths used by this lesson

- `context/foundation/tech-stack.md` — input (Lesson 2 hand-off, hard constraints)
- `context/foundation/prd.md` — input (Lesson 1 hand-off, soft weights)
- `context/foundation/infrastructure.md` — output (the third foundation contract)
- `context/deployment/deploy-plan.md` — output of Plan Mode deploy (audit trail of "what was supposed to happen")
- `context/foundation/lessons.md` — recurring rules & pitfalls (use `/10x-lesson` from Lesson 4 if you spot a class of agent failure during research or deploy)
- `docs/reference/contract-surfaces.md` — load-bearing names registry

### Universal language

The shipped skill carries no 10xDevs / cohort / certification references. The candidate platform list (Cloudflare, Vercel, Netlify, Fly.io, Railway, Render) is the starting research lens, not a recommendation set — the scoring + interview + cross-check pipeline is what's load-bearing, and a platform absent from the default list can be added by extending the research step. The five agent-friendly criteria are the artifact's true core; `/10x-infra-research` re-reads them from `references/agent-friendly-criteria.md` so they evolve as platforms do.

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
