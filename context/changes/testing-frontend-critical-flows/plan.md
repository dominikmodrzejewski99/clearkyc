# Phase 2 — Frontend Critical Flows Tests (R5: State Machine) Implementation Plan

## Overview

Implement Angular component tests covering Risk #5 (state machine correctness): for each
of the 5 rendering contexts defined in `research.md`, verify that the correct controls are
visible and enabled, and controls that must be absent are absent. Written in Vitest via
`@angular/build:unit-test`. R6 (citation trust contract) is a planned Phase 6 — marked
as requiring research before implementation.

## Current State Analysis

The Angular project has Vitest installed (`^4.0.8`) and `tsconfig.spec.json` already
declares `vitest/globals`, but the active test runner is Karma + Jasmine (`karma.conf.js`,
`angular.json` points to it via `runnerConfig: true`). Stryker is configured for the Karma
runner (`@stryker-mutator/karma-runner ^9.6.1`). No Angular component tests exist — only
`app.spec.ts` (a Jasmine/TestBed smoke test).

The state machine oracle is fully mapped in `research.md`: 5 effective rendering contexts,
exact `@if` conditions per control for 3 components (ExtractionForm, DecisionBar,
RedFlagList), and the complete signal transition graph.

## Desired End State

`ng test` runs all spec files under Vitest (not Karma). Three component spec files cover the
5 rendering contexts plus the dead-state contract for ExtractionForm, 3 states for
DecisionBar, and 3 visibility states for RedFlagList. Stryker runs under the Vitest runner.
A shared CaseStore mock factory eliminates boilerplate across all specs. R6 is blocked
pending research.

### Key Discoveries

- `CaseStatus` is `'CREATED' | 'ANALYZING' | 'ANALYZED' | 'LOCKED'` — not `'IDLE'`.
  All test fixtures must use `'CREATED'`, not `'IDLE'` (`extraction.models.ts:1`).
- State machine is dual-track: `caseStatus` (string signal) + `isAnalyzing` (boolean signal)
  must both be set to accurately represent any context. `caseStatus='CREATED'` alone does
  NOT encode the streaming state — `isAnalyzing=true` is required (`case.store.ts:7-10`).
- All components inject `CaseStore` as a singleton without `@Input()`. Tests must provide a
  mock via TestBed providers, not props.
- Analyze button is absent in pure ANALYZED state (no error). Re-analysis is unreachable
  without an `analysisError`. Tests must encode this as a contract.
- Edit button has a 3-condition guard (`caseStatus='ANALYZED'`, `!isAnalyzing()`,
  `!editingField()`). All three must be set correctly in tests.
- `caseStatus='ANALYZING'` from backend (dead-state) renders a blank form with no controls.
  This is a pre-existing UX gap — tests document it as a contract, not a bug.

## What We're NOT Doing

- R6 (citation trust contract, SSE parsing) — needs separate research before implementation.
- Testing `CaseDetailComponent` page-level layout beyond what spec files naturally exercise.
- E2E with real SSE stream or live LLM (per test-plan.md §7 exclusions).
- HTML snapshot tests (per test-plan.md §7 exclusions).
- Fixing the dead-state UX gap (out of R5 scope).
- Karma infrastructure — it may remain as a legacy file but will no longer be the active runner.

## Implementation Approach

Switch the Angular test runner to Vitest first (Phase 1) so all subsequent phases write tests
in the correct framework. Then build a shared CaseStore mock factory and write one spec per
component in Phases 2-4. R6 is a placeholder phase (Phase 5) with no implementation until
research ships. Cookbook update in Phase 6 closes the phase.

## Critical Implementation Details

**Angular signals cannot be mocked with `vi.fn()`.** The mock CaseStore must create real
Angular signals using `signal()` from `@angular/core` — the template's `@if` expressions
call each signal as a function, and the change detection system requires a real `Signal<T>`.
A plain `vi.fn()` does not satisfy the `Signal<T>` interface and the fixture will fail at
`fixture.detectChanges()`.

**Standalone component import in TestBed.** All three target components are Angular
standalone. TestBed must list them in `imports: [ComponentName]`, not `declarations`. A
component placed in `declarations` fails silently in Angular 21 standalone mode.

**Run `/angular-pitfalls` before writing any spec file.** The project's Angular pitfalls
skill surfaces known traps for signals, TestBed, and zoneless patterns that are not obvious
from framework docs.

---

## Phase 1: Vitest Setup

### Overview

Replace Karma with Vitest as the active Angular test runner and update Stryker to use the
Vitest runner. Existing `app.spec.ts` must pass under the new configuration — this is the
acceptance gate for the setup phase.

### Changes Required

#### 1. angular.json — switch test builder options

**File**: `web/angular.json`

**Intent**: Replace `runnerConfig: true` (Karma) with the Vitest runner configuration so
that `ng test` runs under Vitest.

**Contract**: The `"test"` target's `"options"` must configure Vitest as the runner.
Use Context7 to confirm the exact option keys for `@angular/build:unit-test` v21 with
Vitest — the option name may be `"runner": "vitest"` or a `vitest.config.ts` reference.
The `tsconfig.spec.json` path (`tsconfig.spec.json`) should be explicit in options.

#### 2. vitest.config.ts (new file if required)

**File**: `web/vitest.config.ts`

**Intent**: If `@angular/build:unit-test` requires an explicit Vitest config file (rather
than inline angular.json options), create a minimal config that sets the test environment to
`jsdom` and includes the Angular plugin.

**Contract**: Check Context7 for `@angular/build` v21 Vitest config requirements before
creating. If angular.json options alone are sufficient, skip this file.

#### 3. package.json — add @stryker-mutator/vitest-runner

**File**: `web/package.json`

**Intent**: Add the Vitest Stryker runner as a devDependency to replace karma-runner.

**Contract**: Add `"@stryker-mutator/vitest-runner": "^9.6.1"` (match the existing core
version `^9.6.1`). Verify compatible version via `npm info @stryker-mutator/vitest-runner`.

#### 4. stryker.config.json — switch testRunner

**File**: `web/stryker.config.json`

**Intent**: Point Stryker at the Vitest runner instead of Karma.

**Contract**: Change `"testRunner": "karma"` to `"testRunner": "vitest"`. Remove the
`"karma": {...}` block. The `"vitest": {}` section may be empty or omitted if no
custom config is needed. Keep `"mutate"`, `"reporters"`, `"ignorers"`, and
`"coverageAnalysis"` unchanged.

### Success Criteria

#### Automated Verification

- `ng test` completes without error and `app.spec.ts` passes (2 tests: `should create the app`, `should render router outlet`).
- `ng test` output confirms Vitest as the runner (no Karma/Chrome browser launch visible).

> **Stryker note (discovered during Phase 1):** `@stryker-mutator/vitest-runner` bypasses the Angular CLI
> builder and calls Vitest standalone — it cannot find tests configured through `@angular/build:unit-test`.
> Stryker mutation testing requires a separate standalone `vitest.config.ts` for Angular. This is out of
> scope for Phase 1. `stryker.config.json` is updated to vitest-runner (directionally correct) but will
> not function until a standalone Vitest config is established. Treat as a separate follow-up.

#### Manual Verification

- No Karma or Chrome processes are launched when running `ng test`.
- Terminal output shows Vitest reporter format (not Jasmine dot/spec reporter).

---

## Phase 2: ExtractionForm Component Tests

### Overview

Create a shared CaseStore mock factory and write the primary spec for ExtractionFormComponent
covering all 5 rendering contexts defined in `research.md` plus the dead-state contract.
This is the highest-risk component (most `@if` conditions, 3-condition Edit guard).

### Changes Required

#### 1. CaseStore mock factory (shared test helper)

**File**: `web/src/app/core/testing/case-store.mock.ts`

**Intent**: Provide a factory function that returns a typed mock object with real Angular
signals and `vi.fn()` method stubs for all CaseStore public surface. All spec files import
from this file — no boilerplate per spec.

**Contract**:

```typescript
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { CaseStore } from '../store/case.store';
import { CaseStatus } from '../models/extraction.models';

export function createCaseStoreMock(
  overrides: Partial<InstanceType<typeof CaseStore>> = {}
): Partial<InstanceType<typeof CaseStore>> {
  return {
    caseStatus:       signal<CaseStatus>('CREATED'),
    isAnalyzing:      signal<boolean>(false),
    analysisError:    signal<string | null>(null),
    pdfBlob:          signal<Blob | null>(null),
    extractionFields: signal<any[]>([]),
    redFlags:         signal<any[]>([]),
    fieldOverrides:   signal<Record<string, string>>({}),
    reset:            vi.fn(),
    markAnalyzed:     vi.fn(),
    markAnalysisError: vi.fn(),
    markLocked:       vi.fn(),
    setRedFlags:      vi.fn(),
    ...overrides,
  };
}
```

Include the snippet — it documents the signal-vs-vi.fn() boundary, which is the
non-obvious constraint implementers would otherwise guess wrong.

#### 2. ExtractionForm spec

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.spec.ts`

**Intent**: Assert control visibility for each of the 5 rendering contexts and the
dead-state, using the exact `@if` conditions from `research.md:§3` as the oracle.

**Contract**: For each rendering context:

| Context | caseStatus | isAnalyzing | analysisError | pdfBlob |
|---|---|---|---|---|
| CREATED-IDLE | `'CREATED'` | false | null | null |
| CREATED-READY | `'CREATED'` | false | null | `new Blob()` |
| STREAMING | `'CREATED'` | true | null | (any) |
| ANALYZED | `'ANALYZED'` | false | null | (any) |
| ANALYZED-ERROR | `'ANALYZED'` | false | `'some error'` | (any) |
| LOCKED | `'LOCKED'` | false | null | (any) |
| DEAD-STATE | `'ANALYZING'` | false | null | (any) |

Assert the following per context (querying by role/text, not CSS class):

- **Analyze button**: present vs absent; disabled vs enabled (see research.md:§3, line 2 and 6).
- **Edit button** (for a field row): present vs absent, all 3 guard conditions (research.md:§3, line 86).
- **Locked message ("Sprawa zakończona")**: present vs absent (research.md:§3, line 118).
- **Error banner**: present vs absent (research.md:§3, line 15).
- **DEAD-STATE assertion**: ALL above controls absent; marked with a comment
  `// pre-existing gap: caseStatus='ANALYZING' from backend renders blank form`.

The spec must provide `CaseStore` and `ExtractionStreamService` (stub) via TestBed.
`ExtractionStreamService` can be a minimal object with `startStream: vi.fn()`.

For the Edit button test, set `extractionFields` signal to a non-empty array so the
fields table renders.

### Success Criteria

#### Automated Verification

- `ng test` passes all specs in `extraction-form.component.spec.ts`.
- Each of the 7 contexts has at least one `expect` assertion that would fail if its `@if` condition were inverted.

#### Manual Verification

- Test output names make the context clear (e.g., `ExtractionFormComponent > STREAMING context > Analyze button is disabled`).
- No snapshot assertions exist in the spec file.

---

## Phase 3: DecisionBar Component Tests

### Overview

Write the spec for DecisionBarComponent covering its 3 rendering states: no-render for
non-ANALYZED/non-LOCKED states, decision buttons for ANALYZED, and locked view for LOCKED.

### Changes Required

#### 1. DecisionBar spec

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.spec.ts`

**Intent**: Verify that DecisionBar renders nothing for CREATED/STREAMING states, shows
Approve/Reject/Escalate for ANALYZED, and shows the locked view for LOCKED.

**Contract**: Provide `CaseStore` mock (from `case-store.mock.ts`), `DecisionService` stub
(`{ finalize: vi.fn().mockResolvedValue({ decision: 'APPROVE' }) }`), and Input `caseId`
via the component instance.

Assert per context:

| Context | Expected |
|---|---|
| `caseStatus='CREATED'` | No decision buttons; no locked view |
| `caseStatus='ANALYZING'` | No decision buttons; no locked view |
| `caseStatus='ANALYZED'` | Approve + Reject + Escalate buttons present and enabled |
| `caseStatus='ANALYZED'`, `isSubmitting=true` | All three buttons disabled (see research.md:§3, line 13-25) |
| `caseStatus='LOCKED'` | "Sprawa zablokowana" visible; decision buttons absent |

`isSubmitting` is a component-local signal — set it by triggering a submit call
or directly on the component instance after `fixture.componentInstance`.

### Success Criteria

#### Automated Verification

- `ng test` passes all specs in `decision-bar.component.spec.ts`.
- The "no-render for CREATED" assertion fails if the `caseStatus === 'ANALYZED'` `@if`
  condition is removed (mutation guard).

#### Manual Verification

- Test names distinguish between "no decision buttons" (CREATED) and "locked view" (LOCKED)
  — these are different template branches.

---

## Phase 4: RedFlagList Component Tests

### Overview

Write the spec for RedFlagListComponent covering its 3 visibility states: hidden for
CREATED, visible-empty for ANALYZED with no flags, and visible-with-flags for LOCKED.

### Changes Required

#### 1. RedFlagList spec

**File**: `web/src/app/features/case-detail/components/red-flag-list/red-flag-list.component.spec.ts`

**Intent**: Verify the section-level guard (`ANALYZED || LOCKED`) and the inner empty-state
message (`redFlags().length === 0`).

**Contract**: Provide `CaseStore` mock. Assert:

| Context | redFlags signal | Expected |
|---|---|---|
| `caseStatus='CREATED'` | empty | Entire section absent |
| `caseStatus='ANALYZED'` | `[]` | Section present; "Brak zidentyfikowanych red flag." message visible |
| `caseStatus='ANALYZED'` | `[{...}]` | Section present; at least one flag item rendered; no empty message |
| `caseStatus='LOCKED'` | `[{...}]` | Section present; flags visible |

Query the section by its heading or wrapper element (not by CSS class).

### Success Criteria

#### Automated Verification

- `ng test` passes all specs in `red-flag-list.component.spec.ts`.

#### Manual Verification

- Changing `caseStatus='ANALYZED'` to `'CREATED'` in the ANALYZED test causes it to fail.

---

## Phase 5: R6 Placeholder

### Overview

Mark R6 (citation trust contract) in plan.md as blocked on research. No implementation in
this phase — this is a tracking step only.

### Changes Required

#### 1. plan.md comment block for R6

**File**: `context/changes/testing-frontend-critical-flows/plan.md`

**Intent**: Signal to future implementers that R6 is scoped but not yet implementable.

**Contract**: Append a `## Phase 6: R6 — Citation Trust Contract (BLOCKED)` section below
Phase 5's Progress block with a single sentence: "Blocked on research — run `/10x-research
testing-frontend-critical-flows R6` before implementing."

### Success Criteria

#### Automated Verification

- N/A (documentation-only phase).

#### Manual Verification

- Phase 6 placeholder is visible in plan.md and clearly marked BLOCKED.

---

## Phase 6: Cookbook Update

### Overview

Fill in §6.3 and §6.4 of `test-plan.md` with the patterns discovered during Phases 2-4,
and update the change.md status to `complete`.

### Changes Required

#### 1. test-plan.md §6.3 — Angular component test pattern

**File**: `context/foundation/test-plan.md`

**Intent**: Document the CaseStore mock factory pattern and TestBed standalone-import
pattern so future contributors don't re-derive them.

**Contract**: Replace the `TBD — see §3 Phase 2` placeholder with 3-5 bullet points
covering: (1) import the component in `imports:` not `declarations:`; (2) provide
CaseStore mock via `useValue` with real signals; (3) set signal values between test cases
by calling `.set()` on the mock signal; (4) call `fixture.detectChanges()` after each
signal change; (5) assert by DOM text/role queries, not CSS class.

#### 2. test-plan.md §6.4 — Angular service unit test pattern

**File**: `context/foundation/test-plan.md`

**Intent**: Leave §6.4 as TBD if R6 is not yet implemented; fill in once R6 ships.

**Contract**: Replace placeholder with: "TBD — see §3 Phase 2 R6 (blocked on research)."

#### 3. change.md — mark status planned→in-progress→complete as phases land

**File**: `context/changes/testing-frontend-critical-flows/change.md`

**Intent**: Keep the change.md status current; mark `complete` only after all Phases 1-5
pass their verification criteria.

**Contract**: Set `status: complete` and `updated: <date>` once Phase 5 is done.

### Success Criteria

#### Automated Verification

- `ng test` passes all specs across all three spec files.
- `context/foundation/test-plan.md` §6.3 no longer reads "TBD".

#### Manual Verification

- A new contributor reading §6.3 can write a component test without re-reading this plan.

---

## R6 — Citation Trust Contract (BLOCKED)

Blocked on research — run `/10x-research testing-frontend-critical-flows R6` before implementing.

## References

- Research: `context/changes/testing-frontend-critical-flows/research.md`
- Risk source: `context/foundation/test-plan.md` §2 Risk #5
- CaseStore signals: `web/src/app/core/store/case.store.ts:6-15`
- ExtractionForm template oracle: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html:2,6,10,15,86,118`
- DecisionBar template oracle: `web/src/app/shared/components/decision-bar/decision-bar.component.html:1-31`
- RedFlagList template oracle: `web/src/app/features/case-detail/components/red-flag-list/red-flag-list.component.html:1`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest Setup

#### Automated

- [x] 1.1 `ng test` completes without error and `app.spec.ts` passes (2 tests) — e984bae
- [x] 1.2 `ng test` output confirms Vitest runner (no Karma/Chrome launch) — e984bae

#### Manual

- [x] 1.3 No Karma or Chrome processes launched when running `ng test` — e984bae
- [x] 1.4 Terminal output shows Vitest reporter format — e984bae

### Phase 2: ExtractionForm Component Tests

#### Automated

- [x] 2.1 `ng test` passes all specs in `extraction-form.component.spec.ts` — ce4dec9
- [x] 2.2 Each of 7 contexts has at least one assertion that would fail on inverted `@if` — ce4dec9

#### Manual

- [x] 2.3 Test output names make the context clear per rendering state — ce4dec9
- [x] 2.4 No snapshot assertions in the spec file — ce4dec9

### Phase 3: DecisionBar Component Tests

#### Automated

- [x] 3.1 `ng test` passes all specs in `decision-bar.component.spec.ts` — 89c1dc1
- [x] 3.2 "No decision buttons for CREATED" assertion fails if ANALYZED condition removed — 89c1dc1

#### Manual

- [x] 3.3 Test names distinguish no-render (CREATED) from locked view (LOCKED) — 89c1dc1

### Phase 4: RedFlagList Component Tests

#### Automated

- [x] 4.1 `ng test` passes all specs in `red-flag-list.component.spec.ts` — cd318d4

#### Manual

- [x] 4.2 ANALYZED test fails when `caseStatus` changed to `'CREATED'` — cd318d4

### Phase 5: R6 Placeholder

#### Manual

- [x] 5.1 Phase 6 R6 placeholder visible in plan.md, marked BLOCKED

### Phase 6: Cookbook Update

#### Automated

- [ ] 6.1 `ng test` passes all specs across all three spec files
- [ ] 6.2 `test-plan.md` §6.3 no longer reads "TBD"

#### Manual

- [ ] 6.3 New contributor can write a component test from §6.3 without reading this plan
- [ ] 6.4 `change.md` status set to `complete`
