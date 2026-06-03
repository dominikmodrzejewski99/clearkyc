# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-02 (Phase 2 change opened — research complete)

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost x signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase signal (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `web/src/` (31 commits / 30d).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact x likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the evidence that surfaced
this risk — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Finalization appears to succeed in UI but audit record was never written to the database — analyst's decision is unverifiable and the compliance record does not exist | High | Medium | PRD Guardrails "persisted before UI confirms"; interview Q1; hot-spot dir `src/.../service` (8 commits/30d) |
| 2 | Frontend sends a stale payload shape after a backend DTO change — server silently ignores unknown or renamed fields; finalization record is incomplete without any error surfaced | High | Medium | interview Q2 (burned before in similar project); hot-spot dir `src/.../web/dto` (10 commits/30d); S-02 FinalizeRequest breaking change already occurred |
| 3 | Endpoint verifies the JWT is valid but does not check case ownership — analyst A reads or modifies a case belonging to analyst B (IDOR) | High | Medium | PRD Access Control "Authenticated, single-role, fully audited"; interview Q1 |
| 4 | JSON Schema validation in the finalization service accepts a payload that violates the business contract — missing required fields, null citations, or wrong decision type pass through and an invalid record is persisted | High | Medium | PRD FR-012 "strictly validated against versioned JSON Schema"; interview Q3; hot-spot dir `src/.../web/dto` (10 commits/30d) |
| 5 | ExtractionForm renders wrong controls for a case state (IDLE / ANALYZING / ANALYZED / LOCKED) — analyst can trigger Analyze while already analyzing, or edit a locked field, causing state corruption or silently invalid actions | Medium | High | interview Q4; hot-spot dir `web/src/.../case-detail` (14 commits/30d); zero Angular tests currently |
| 6 | LLM-extracted field displayed to analyst without a citation array and without a "Not Disclosed / Inferred Missing" marker — analyst acts on an unverifiable value, violating the product's core trust contract | High | Low | PRD NFR "trust-contract integrity"; PRD FR-008 "every populated field carries an array of one or more quoted-snippet citations"; interview Q1 |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|---|---|---|---|---|---|
| #1 | DB failure during finalization returns 5xx (not 2xx); on success the audit record is readable in DB before HTTP 200 returns | "Happy path works" — must also prove the failure path: what happens if DB is unavailable mid-finalization | @Transactional boundary in FinalizeService; whether exceptions are swallowed before response; order of DB write vs HTTP response | `@SpringBootTest` integration test with mocked DB failure | Happy-path only; not verifying audit record actually exists in DB after finalization |
| #2 | Submitting a pre-S02 payload shape (missing `fields`, using old `extractedData` key) returns 400; current shape returns 200 | "The endpoint works today" — backward incompatibility is not tested; silent field loss is not a test failure today | `@NotNull` / `@Valid` annotations on FinalizeRequest fields; whether Jackson silently ignores unknown fields at the top level | `@WebMvcTest` DecisionController test with both old and current payload shapes | Only testing the current happy-path shape; not testing what breaks when `fields` is null or `decision` is absent |
| #3 | Request for case_id owned by analyst B, authenticated as analyst A, returns 403 or 404 (not 200) | "Authenticated = authorized to this case" — auth and ownership are separate checks | CaseController query: does it filter by analystIdentity or only by id? What JWT claim carries identity? How analystIdentity is stored in the case row | `@WebMvcTest` CaseController test with two distinct JWT subjects | 401-only test (auth required) without testing ownership enforcement (403 test) |
| #4 | Payload missing a required field, or with a null citations array, returns 400 with a validation error; valid payload returns 200 | "Schema file exists therefore validation is strict" — schema may have `additionalProperties: true` or missing `required` constraints | `finalization-v0.2.json`: which fields are in `required`, what `additionalProperties` is set to, nullable fields; how FinalizeService invokes the networknt validator on failure | `@WebMvcTest` DecisionController test sending malformed JSON bodies (missing field, null citations, unknown decision) | Only testing a valid payload; not testing boundary cases |
| #5 | For each of the 4 states, the correct controls are visible and enabled; controls that must not appear are absent or disabled; state transitions on stream events behave correctly | "Component renders without error" — rendering is not the same as the state machine contract | CaseStore state signals; how ExtractionForm reads them; which template bindings change per state; what triggers each transition | Angular component tests with mocked CaseStore signals (no real SSE needed) | HTML snapshot test (negative space §7); implementation mirror (checking ngIf conditions rather than visible controls) |
| #6 | When a FieldExtracted SSE event carries an empty citations array, the UI renders "Not Disclosed / Inferred Missing" rather than a confident extracted value | "Field is visible therefore a citation is present" — the field may render its value without ever inspecting the citation array | ExtractionStreamService SSE parsing of FieldExtracted events; how ExtractionForm renders the citations property; what happens when citations is empty | Angular service unit test + component test for empty citations case | Only testing the happy path where citations are present |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status and Change-folder as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Backend contract safety | Prove at integration layer that audit write, schema strictness, case ownership, and DTO contract cannot fail silently | #1, #2, #3, #4 | `@SpringBootTest` integration + `@WebMvcTest` controller slice | change opened | context/changes/testing-backend-contract-safety |
| 2 | Frontend critical flows | Fill the zero-coverage gap in Angular: prove state machine correctness and citation trust contract | #5, #6 | Angular component + service tests (Vitest via `@angular/build`) | change opened | context/changes/testing-frontend-critical-flows |
| 3 | Quality gates wiring | Wire `./mvnw test` and `ng test` as CI gates; merge to main blocked on red | cross-cutting | GitHub Actions YAML | not started | — |

## 4. Stack

| Layer | Tool | Version | Notes |
|---|---|---|---|
| Backend unit + integration | JUnit 5 via Spring Boot Test | Spring Boot 4.0.6 (JUnit 5 bundled) | `@SpringBootTest` for full context; `@WebMvcTest` for controller slice; `./mvnw test` |
| Frontend unit + component | Vitest via `@angular/build` | Vitest ^4.0.8, @angular/build ^21.2.12 | `ng test`; 1 stub spec file today; full Angular signal / component test support |
| Backend API mocking | Spring MockMvc + Mockito | Spring Boot 4.0.6 bundled | Used in existing CaseControllerTest, DecisionControllerTest |
| Frontend HTTP mocking | none yet | — | Phase 2 may introduce MSW or Angular HttpTestingController depending on research |
| e2e | none yet | — | Not planned for current rollout; real-LLM E2E is negative space (§7) |
| CI | GitHub Actions | existing `.github/workflows/fly-deploy.yml` | Phase 3 adds test gates before deploy step |

**Stack grounding tools (current session):**
- Docs: Context7 available — available for framework/library API lookup if needed during research phases; checked: 2026-06-01
- Search: Exa available — available for discovery and current status lookup; checked: 2026-06-01
- Runtime/browser: Playwright MCP not available in current session
- Provider/platform: Linear available — issue tracking; not used for quality gates

## 5. Quality Gates

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck (`ng build --configuration production`) | local + CI | required now | type drift, build errors |
| backend unit + integration (`./mvnw test`) | local + CI | required after §3 Phase 1 | audit integrity, IDOR, schema strictness, DTO contract |
| frontend unit + component (`ng test`) | local + CI | required after §3 Phase 2 | state machine regressions, citation contract violations |
| full CI gate on PR merge | GitHub Actions | required after §3 Phase 3 | all of the above before any deploy |
| e2e with real LLM | — | excluded (see §7) | — |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a backend integration test (`@SpringBootTest`)

TBD — see §3 Phase 1 for audit integrity and IDOR ownership patterns.

### 6.2 Adding a backend controller slice test (`@WebMvcTest`)

TBD — see §3 Phase 1 for DTO contract drift and schema validation patterns.

### 6.3 Adding an Angular component test (Vitest)

Shipped in Phase 2 (R5 state machine tests). Canonical patterns:

- **Import standalone components in `imports:`, not `declarations:`.**
  `TestBed.configureTestingModule({ imports: [MyComponent], ... })`.
  Using `declarations:` with a standalone component fails silently in Angular 21.

- **Mock CaseStore with real Angular signals via `createCaseStoreMock()`.**
  Import from `web/src/app/core/testing/case-store.mock.ts`. The factory returns
  `WritableSignal<T>` values for all signals — `vi.fn()` does NOT satisfy `Signal<T>`
  and will crash at `fixture.detectChanges()`.
  ```typescript
  const store = createCaseStoreMock();
  TestBed.configureTestingModule({
    imports: [MyComponent],
    providers: [{ provide: CaseStore, useValue: store }],
  });
  ```

- **Set signal values then call `fixture.detectChanges()` to re-render.**
  ```typescript
  store.caseStatus.set('ANALYZED');
  fixture.detectChanges();
  expect(el.querySelector('.some-element')).not.toBeNull();
  ```

- **Assert by DOM text, role, or aria-label — not CSS class.**
  Prefer `querySelector('[aria-label="..."]')` or `textContent.toContain(...)`.
  CSS classes are acceptable when no semantic attribute exists and the class name
  is semantically meaningful (BEM conventions).

- **Component-local signals** (e.g. `isSubmitting` in `DecisionBarComponent`)
  are `protected`. Access via `(fixture.componentInstance as any).signalName.set(...)`.

### 6.4 Adding an Angular service unit test (Vitest)

TBD — see §3 Phase 2 R6 (blocked on research — run `/10x-research testing-frontend-critical-flows R6`).

### 6.5 Per-rollout-phase notes

(Fills in as phases ship — surprising fixtures, shared helpers, or naming
conventions discovered during implementation.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **HTML snapshot tests** — break on every CSS or template change, catch no behavioral regression. Re-evaluate if a critical rendering rule emerges that cannot be tested any other way. (Source: interview Q5.)
- **Java DTO / record unit tests** — plain POJOs with no behavior; Spring does not touch them at runtime, risk is zero. Re-evaluate if business logic is added directly to a DTO. (Source: interview Q5.)
- **E2E tests with a real LLM** — slow, expensive, non-deterministic, and flaky as a regression gate. The streaming pipeline is covered at the controller (SSE format) and service (SSE parsing) layers without a live model call. Re-evaluate if a new LLM integration adds untestable behavior at those cheaper layers. (Source: interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-01
- Stack versions last verified: 2026-06-01
- AI-native tool references last verified: n/a (no AI-native test layer in current rollout)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
