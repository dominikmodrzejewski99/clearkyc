<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Post-login Redirect to cases/new

- **Plan**: context/changes/post-login-redirect/plan.md
- **Scope**: Full plan (Phase 1 + Phase 2)
- **Date**: 2026-07-03
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 4 observations (3 shown; 2 folded into F1/context)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Untranslated backend enum leaks into Polish compliance UI

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: web/src/app/shared/components/decision-bar/decision-bar.component.ts:34-37
- **Detail**: `lockedDecisionLabel` computed translates via `getDecisionLabel()` when `lockedDecision()` is set (APPROVE→"Zatwierdzona" etc.), but falls back to the raw untranslated backend enum `caseStore.caseStatus()` when null (page-refresh scenario). Since `caseStatus()` here can only be `'LOCKED'`, this renders literally as "Sprawa zablokowana — decyzja: LOCKED" in an otherwise fully-Polish bank-compliance UI. The new test (decision-bar.component.spec.ts:215-219) asserts this English leak as expected — introduced by this session's out-of-scope debt fix, not the original post-login-redirect plan.
- **Fix**: Replace the `caseStore.caseStatus()` fallback with a hardcoded Polish string (e.g. `'Zablokowana'`) since LOCKED is the only reachable value in that branch.
- **Decision**: FIXED — hardcoded `'Zablokowana'` in decision-bar.component.ts:34-39, spec updated, 23/23 tests pass.

### F2 — Direct environment-object mutation in guard spec

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: web/src/app/core/guards/auth.guard.spec.ts:22-25,42-45
- **Detail**: auth.guard.spec.ts mutates the shared `environment` singleton directly and restores it in afterEach, since Angular's vitest-based unit-test builder disallows vi.mock() on relative imports (confirmed live in this session). Vitest guarantees afterEach runs even on a thrown assertion, so leak risk is low. Acceptable pragmatic workaround.
- **Fix**: Optional: wrap body in try/finally for defense-in-depth. Not required.
- **Decision**: SKIPPED

### F3 — Scope: two extra files fixed beyond the plan

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline
- **Location**: extraction-form.component.html/.spec.ts, decision-bar.component.ts/.spec.ts
- **Detail**: Not in the original plan. Fixed mid-implementation to unblock the pre-commit hook's full-suite run, which was failing on 7 pre-existing, unrelated tests. Already disclosed transparently in a separate commit (aa4092e) with its own rationale.
- **Fix**: None — already documented via a separate, clearly-labeled commit.
- **Decision**: SKIPPED

### F4 — Redundant-but-safe state guard in extraction-form

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: extraction-form.component.html:8-11
- **Detail**: The new `caseStatus() !== 'ANALYZING'` clause is redundant with `!isAnalyzing()` in normal flow, but correctly guards a real frontend/backend state desync (documented DEAD-STATE contract). No state-combination gap found across CREATED/ANALYZING/ANALYZED±error/LOCKED.
- **Fix**: None needed.
- **Decision**: SKIPPED

### F5 — Text-literal-only spec updates verified safe

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: extraction-form.component.spec.ts:76,167; decision-bar.component.spec.ts:75
- **Detail**: Both agents independently confirmed these are pure English→Polish literal-text corrections matching already-translated templates — no assertion logic, selectors, or setup changed.
- **Fix**: None needed.
- **Decision**: SKIPPED

## Plan Adherence detail

All 3 planned changes verified MATCH by independent source-code check:
- auth.guard.ts:18 passes `{ appState: { target: 'cases/new' } }`
- app.config.ts left unchanged — verified CORRECT, not missing: the installed @auth0/auth0-angular's AuthConfig has no onRedirectCallback key at all, and handleRedirectCallback() already does `navigator.navigateByUrl(appState?.target ?? '/')` internally (fesm2022/auth0-auth0-angular.mjs:520-531, independently re-derived)
- auth.guard.spec.ts covers exactly the two planned branches
- landing.component.ts confirmed unchanged, as planned

Success criteria: 70/70 unit tests pass, production build succeeds, lint's 6 errors are pre-existing/unrelated (confirmed via git stash earlier this session) and don't touch any file in this diff.
