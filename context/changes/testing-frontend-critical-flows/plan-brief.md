# Phase 2 — Frontend Critical Flows Tests (R5: State Machine) — Plan Brief

> Full plan: `context/changes/testing-frontend-critical-flows/plan.md`
> Research: `context/changes/testing-frontend-critical-flows/research.md`

## What & Why

Implement Angular component tests covering Risk #5 from the test plan: the state machine
correctness of `ExtractionFormComponent`, `DecisionBarComponent`, and `RedFlagListComponent`.
The risk is that the form renders wrong controls for a given case state, allowing the analyst
to trigger analysis while already analyzing, or edit a locked field. Zero Angular tests exist
today, so any regression in `@if` conditions is currently invisible.

## Starting Point

The Angular project has Vitest installed (`^4.0.8`) and `tsconfig.spec.json` referencing
`vitest/globals`, but the active runner is Karma + Jasmine. `research.md` fully mapped the
state machine oracle: 5 rendering contexts, exact `@if` conditions per control, and the
dual-track signal model (`caseStatus` + `isAnalyzing`). The oracle is ready — only test
infrastructure and spec files are missing.

## Desired End State

`ng test` runs all spec files under Vitest. Three component spec files (ExtractionForm,
DecisionBar, RedFlagList) cover the 5 rendering contexts plus the dead-state contract and
the ANALYZING blank-form pre-existing gap. A shared `case-store.mock.ts` helper eliminates
signal-mocking boilerplate. Stryker also runs under the Vitest runner. R6 is a tracked
placeholder, blocked until research ships.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test runner | Vitest (switch from Karma) | Aligns with test-plan.md §4; tsconfig already declares vitest/globals. | Research / Plan |
| Stryker update | Migrate to @stryker-mutator/vitest-runner | Single runner avoids two parallel test stacks. | Plan |
| CaseStore mocking | Real `signal()` in mock object | Angular's `@if` expressions call signals as functions; vi.fn() does not satisfy Signal<T>. | Plan |
| Test organization | One spec per component | Standard Angular convention, discoverable, isolated. | Plan |
| Dead-state | Test as contract (not a bug) | caseStatus='ANALYZING' from backend is a pre-existing UX gap; encoding it prevents future accidental coverage. | Research |
| R6 scope | Placeholder only, requires research | R6 oracle (SSE parsing, citations rendering) was not in research scope; speculating would produce mirror tests. | Plan |
| Rendering contexts | 5 + dead-state = 7 assertions | Dual-track signals (caseStatus + isAnalyzing) produce 5 distinct meaningful UI states; dead-state adds 1 more. | Research |

## Scope

**In scope:** Vitest setup, Stryker migration to Vitest, ExtractionForm/DecisionBar/RedFlagList
component specs, shared CaseStore mock helper, R6 tracking placeholder, cookbook update (§6.3).

**Out of scope:** R6 implementation (needs research), fixing the dead-state UX gap, E2E tests,
HTML snapshot tests, CaseDetailComponent page-level layout tests.

## Architecture / Approach

All three components inject `CaseStore` as a singleton (no `@Input()`). Tests provide a mock
via `TestBed.configureTestingModule({ providers: [{ provide: CaseStore, useValue: mockStore }] })`.
The mock uses real Angular `signal()` values (not `vi.fn()`) so that `fixture.detectChanges()`
triggers change detection correctly. Each spec sets signal values per context, calls
`detectChanges()`, and asserts DOM presence by text/role — no CSS class selectors, no
snapshots.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Vitest Setup | `ng test` runs under Vitest; Stryker migrated | Angular builder config syntax for Vitest may differ from docs — use Context7 |
| 2. ExtractionForm Tests | 7 contexts covered, shared mock helper created | 3-condition Edit guard is easy to write partially — must verify all 3 conditions independently |
| 3. DecisionBar Tests | 3 states covered including `isSubmitting` disabled guard | `isSubmitting` is component-local signal — must access via component instance |
| 4. RedFlagList Tests | 3 visibility states covered | Section-guard vs inner empty-state are two separate `@if` levels |
| 5. R6 Placeholder | R6 tracked as BLOCKED in plan | None — documentation only |
| 6. Cookbook Update | §6.3 filled in test-plan.md; change.md closed | Must reflect patterns actually used, not hypothetical ones |

**Prerequisites:** `research.md` complete (done). Angular CLI available (`ng test`). No
database or backend required for any spec.

**Estimated effort:** 2-3 sessions across 6 phases (Phase 1 is the riskiest setup-wise;
Phases 2-4 are mechanical once Vitest is wired).

## Open Risks & Assumptions

- `@angular/build:unit-test` v21 Vitest runner config syntax not yet verified — implementer
  must check Context7 for exact `angular.json` option keys before touching the file.
- Standalone component import in TestBed (`imports:` vs `declarations:`) — a common Angular
  trap; covered in `angular-pitfalls` skill.
- `lockedDecision` component-local signal in DecisionBar means Phase 3 tests may need to
  call `submit()` to populate it, or access the signal directly on the component instance.

## Success Criteria (Summary)

- `ng test` runs Vitest, passes all 3 new spec files plus `app.spec.ts`.
- For each of the 7 rendering contexts in ExtractionForm, at least one assertion fails if the
  corresponding `@if` condition is inverted.
- `test-plan.md §6.3` contains the component test cookbook pattern.
