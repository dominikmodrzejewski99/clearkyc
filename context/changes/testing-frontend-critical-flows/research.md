---
date: 2026-06-02T10:25:00+02:00
researcher: Claude Sonnet 4.6
git_commit: 2ac4abd6696cddca601fd98054b863cf87b522b4
branch: main
repository: dominikmodrzejewski99/clearkyc
topic: "Risk #5 — Angular state machine: ExtractionForm control visibility and state transitions"
tags: [research, frontend, angular, state-machine, casestore, extraction-form, decision-bar, vitest]
status: complete
last_updated: 2026-06-02
last_updated_by: Claude Sonnet 4.6
---

# Research: Risk #5 — Angular state machine control visibility

**Date**: 2026-06-02T10:25:00+02:00
**Git Commit**: 2ac4abd6696cddca601fd98054b863cf87b522b4
**Branch**: main
**Repository**: dominikmodrzejewski99/clearkyc

## Research Question

For each of the 4 case states, what controls are visible and enabled, which must be absent or
disabled, and what triggers each state transition? Source: test-plan.md Risk #5, Phase 2.

---

## Summary

The state machine is **dual-track**: `caseStatus` (string enum) and `isAnalyzing` (boolean) are
separate signals that combine to produce 5+ distinct rendering contexts. The test plan's label
"IDLE" does not exist in code — the initial state is `'CREATED'`. During active SSE streaming,
`caseStatus` stays `'CREATED'`; only `isAnalyzing` flips to `true`. Every control visibility
condition is driven by `@if` expressions reading these signals directly — there are no derived
`computed()` signals in any component.

---

## Detailed Findings

### 1. State model — what actually exists in the codebase

**File**: `web/src/app/core/models/extraction.models.ts:1`
**File**: `web/src/app/core/store/case.store.ts:6-10`

```typescript
export type CaseStatus = 'CREATED' | 'ANALYZING' | 'ANALYZED' | 'LOCKED';

readonly caseStatus = signal<CaseStatus>('CREATED');   // line 7
readonly isAnalyzing = signal<boolean>(false);          // line 10
readonly analysisError = signal<string | null>(null);   // line 12
readonly pdfBlob = signal<Blob | null>(null);           // line 8
```

**Oracle correction vs. test plan**: The plan says "IDLE" — code uses `'CREATED'`. All test
fixtures must use `'CREATED'`, not `'IDLE'`.

**`'ANALYZING'` as caseStatus**: This value is part of the type and is set by
`case-detail.component.ts:32` when loading a case whose HTTP response returns
`status: 'ANALYZING'` (a case that is mid-analysis on the backend). The frontend
`startAnalysis()` does NOT change `caseStatus` to `'ANALYZING'` — it only sets `isAnalyzing=true`
while `caseStatus` stays `'CREATED'`. See section 5 (dead-state) below.

---

### 2. Effective rendering contexts (the test oracle for R#5)

The template conditions combine `caseStatus`, `isAnalyzing`, `analysisError`, and `pdfBlob`
into 5 meaningful UI states. Tests must assert the full control set for each:

| Context | Condition | State in code |
|---|---|---|
| **CREATED-IDLE** | `caseStatus='CREATED'`, `isAnalyzing=false`, `pdfBlob=null` | After reset, no PDF yet |
| **CREATED-READY** | `caseStatus='CREATED'`, `isAnalyzing=false`, `pdfBlob` present | Ready to analyze |
| **STREAMING** | `caseStatus='CREATED'`, `isAnalyzing=true` | SSE stream active |
| **ANALYZED** | `caseStatus='ANALYZED'`, `isAnalyzing=false`, `analysisError=null` | Successful analysis |
| **ANALYZED-ERROR** | `caseStatus='ANALYZED'`, `analysisError` non-null | Re-analysis after backend error |
| **LOCKED** | `caseStatus='LOCKED'` | Case finalized |

---

### 3. Exact `@if` conditions per control (the test oracle)

#### ExtractionFormComponent

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html`

| Control | Condition (exact template expression) | Line |
|---|---|---|
| "Analizuj" button (container) | `caseStatus === 'CREATED' \|\| (caseStatus === 'ANALYZED' && analysisError())` | 2 |
| "Analizuj" button `[disabled]` | `isAnalyzing() \|\| !pdfBlob()` | 6 |
| Button label | `isAnalyzing() ? 'Analizowanie...' : 'Analizuj'` | 10 |
| Error banner | `analysisError()` (state-independent, any status) | 15 |
| "Analizuj ponownie" button in banner | inside error banner (same guard as line 15) | 18 |
| Fields table | `extractionFields().length > 0` (state-independent) | 22 |
| Row `--streaming` CSS class | `isAnalyzing()` | 33 |
| Edit button per field row | `caseStatus === 'ANALYZED' && !isAnalyzing() && !editingField()` | 86 |
| "Sprawa zakończona" locked message | `caseStatus === 'LOCKED'` | 118 |
| Re-analyze warning dialog | `showReanalyzeWarning()` (component-local signal) | 124 |

Key observations:
- The Analyze button is **absent in pure ANALYZED state** (no error). There is no way to
  trigger re-analysis once successfully analyzed without an error — the button disappears.
- The Edit button has a **3-condition guard**: status, isAnalyzing, AND no field currently
  being edited. Tests must verify all three.
- The error banner appears regardless of `caseStatus` — any state that sets `analysisError`
  shows it.

#### DecisionBarComponent

**File**: `web/src/app/shared/components/decision-bar/decision-bar.component.html`

| Control | Condition | Line |
|---|---|---|
| Locked view ("Sprawa zablokowana") | `caseStatus === 'LOCKED'` | 1 |
| Decision buttons container | `caseStatus === 'ANALYZED'` (else-if) | 5 |
| Approve/Reject/Escalate `[disabled]` | `isSubmitting()` (component-local signal) | 13, 19, 25 |
| Submit error message | `submitError()` (component-local signal) | 7 |

**Critical**: DecisionBar renders **nothing at all** for `caseStatus='CREATED'`,
`isAnalyzing=true`, or `caseStatus='ANALYZING'`. No placeholder, no spinner, no disabled state.

#### RedFlagListComponent

**File**: `web/src/app/features/case-detail/components/red-flag-list/red-flag-list.component.html`

| Control | Condition | Line |
|---|---|---|
| Entire section | `caseStatus === 'ANALYZED' \|\| caseStatus === 'LOCKED'` | 1 |
| "Brak zidentyfikowanych red flag." | `redFlags().length === 0` (inside section guard) | 4 |

#### CaseDetailComponent (page layout)

**File**: `web/src/app/features/case-detail/case-detail.component.html`

| Control | Condition | Line |
|---|---|---|
| Re-upload banner | `pdfBlob() === null && caseStatus !== 'LOCKED'` | 1 |

---

### 4. State transitions — what triggers each change

#### `caseStatus` transitions

| From | To | Trigger | Code location |
|---|---|---|---|
| (any) | `'CREATED'` | `caseStore.reset()` in `ngOnInit` | `case-detail.component.ts:26` |
| (from HTTP) | backend value | `caseStore.caseStatus.set(response.status)` | `case-detail.component.ts:32` |
| `'CREATED'` | `'ANALYZED'` | `markAnalyzed()` on `AnalysisComplete` SSE event | `case.store.ts:55` via `extraction-form.component.ts:97` |
| `'ANALYZED'` | `'LOCKED'` | `markLocked()` on successful finalization | `case.store.ts:60` via `decision-bar.component.ts:45` |

**`caseStatus` is NEVER set to `'ANALYZING'` by the frontend** during `startAnalysis()`.

#### `isAnalyzing` transitions

| To | Trigger | Code location |
|---|---|---|
| `true` | `caseStore.isAnalyzing.set(true)` — first thing in `startAnalysis()` | `extraction-form.component.ts:89` |
| `false` | `markAnalyzed()` on `AnalysisComplete` event | `case.store.ts:57` |
| `false` | `markAnalysisError()` on `AnalysisError` event or stream error | `case.store.ts:52` |
| `false` | `caseStore.isAnalyzing.set(false)` — reset on same-case navigation | `case-detail.component.ts:29` |

#### `markAnalysisError()` does NOT touch `caseStatus`

**File**: `web/src/app/core/store/case.store.ts:50-53`

```typescript
markAnalysisError(message: string): void {
  this.analysisError.set(message);
  this.isAnalyzing.set(false);
  // caseStatus unchanged — remains whatever it was before analysis started
}
```

This means after an error during first-ever analysis (starting from CREATED):
- `caseStatus` is still `'CREATED'` (not ANALYZED)
- `analysisError` is set
- Template shows Analyze button (CREATED condition) AND error banner

For an error during re-analysis (re-starting from ANALYZED — only reachable via ANALYZED+error path):
- `caseStatus` is still `'ANALYZED'`
- `analysisError` is set
- Template shows Analyze button (ANALYZED+error condition) AND error banner

---

### 5. The `'ANALYZING'` dead-state (UI limbo)

If the backend HTTP response at page load returns `{ status: 'ANALYZING' }`:

- `caseStore.caseStatus.set('ANALYZING')` is called (`case-detail.component.ts:32`)
- `isAnalyzing` remains `false` (not set by this path)

Template consequences:
- Analyze button: absent (condition needs CREATED or ANALYZED+error)
- DecisionBar: absent (condition needs ANALYZED or LOCKED)
- Locked message in ExtractionForm: absent (condition needs LOCKED)
- RedFlagList: absent (condition needs ANALYZED or LOCKED)
- Fields table: shown only if `extractionFields().length > 0`
- Re-upload banner: shown if no pdfBlob (LOCKED exclusion doesn't apply)

**Result**: A case in backend `ANALYZING` status renders a blank form pane. There is no visual
indication that analysis is in progress (no spinner, no message). This is a pre-existing UI gap,
not a regression to protect against — but it defines a test boundary: do not create a test
scenario using `caseStatus='ANALYZING'` and expect any controls to be visible.

---

### 6. Pre-analysis state reset sequence

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts:85-89`

```typescript
this.cancelStream$.next();              // cancel any in-flight stream (line 85)
this.caseStore.extractionFields.set([]); // (line 86)
this.caseStore.setRedFlags([]);          // (line 87)
this.caseStore.analysisError.set(null);  // (line 88)
this.caseStore.isAnalyzing.set(true);    // (line 89)
```

**`caseStatus` is NOT reset** here. A case that was `'ANALYZED'` does NOT return to
`'CREATED'` when re-analysis starts. However, since the Analyze button is only visible when
`caseStatus='CREATED'` (or ANALYZED+error), re-analysis from a clean ANALYZED state is
unreachable via the UI. The reset sequence is only reachable from CREATED or ANALYZED+error.

---

### 7. `startAnalysis()` is private — only reachable via `tryStartAnalysis()` or `confirmReanalyze()`

**File**: `extraction-form.component.ts:28-41`

`tryStartAnalysis()` (bound to the Analyze button click):
1. If `fieldOverrides` is non-empty → show `showReanalyzeWarning` dialog
2. Otherwise → call `startAnalysis()` directly

`confirmReanalyze()` (bound to the warning dialog confirm button):
1. Clear `fieldOverrides` and `activeQuote`
2. Close the dialog
3. Call `startAnalysis()`

The re-analyze warning is a component-local signal (`showReanalyzeWarning`) — it has no
representation in `CaseStore`. Tests that mock the store can exercise both paths by controlling
what `fieldOverrides` contains.

---

### 8. DecisionBar finalization flow

**File**: `decision-bar.component.ts:25-54`

`submit(decision)`:
1. Reads `fieldOverrides` and `extractionFields` to build `FieldRecord[]` with applied overrides
2. Calls `decisionService.finalize(caseId, { decision, fields, red_flags })`
3. On success: `lockedDecision.set(response.decision)` + `caseStore.markLocked()` + emit `decided`
4. On error: `submitError.set(...)` + `isSubmitting.set(false)`

`lockedDecision` is a **component-local signal** (line 23) — it stores the decision string
received from the backend. The locked view renders `lockedDecision() ?? caseStore.caseStatus()`,
so if `lockedDecision` is null (e.g., page refresh after lock) it falls back to showing
`'LOCKED'` as the label.

---

## Code References

- `web/src/app/core/models/extraction.models.ts:1` — `CaseStatus` type definition
- `web/src/app/core/store/case.store.ts:6-15` — all 10 CaseStore signals
- `web/src/app/core/store/case.store.ts:50-62` — `markAnalysisError`, `markAnalyzed`, `markLocked`
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html:2` — Analyze button `@if` condition
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html:86` — Edit button 3-condition guard
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html:118` — Locked message condition
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts:80-101` — `startAnalysis()` full body
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts:85-89` — pre-analysis state reset
- `web/src/app/shared/components/decision-bar/decision-bar.component.html:1-31` — full DecisionBar template
- `web/src/app/shared/components/decision-bar/decision-bar.component.ts:25-54` — `submit()` full body
- `web/src/app/features/case-detail/components/red-flag-list/red-flag-list.component.html:1` — RedFlagList visibility guard
- `web/src/app/features/case-detail/case-detail.component.html:1` — re-upload banner condition
- `web/src/app/features/case-detail/case-detail.component.ts:23-34` — `ngOnInit` with reset + HTTP load

---

## Architecture Insights

**No `computed()` in any component** — every visibility decision is an inline `@if` in the
template reading signals directly. This is good for testability: mock the signals, assert DOM.

**Singleton store, direct injection** — all child components inject `CaseStore` without
`@Input()`. Tests that want to isolate a component must provide a `CaseStore` spy/fake in the
TestBed providers, not pass props.

**`isAnalyzing` is not a `caseStatus` value in the frontend** — it is a parallel boolean
signal set/cleared by `extraction-form` and `case-detail`. This means test scenarios must set
BOTH signals to accurately represent a state. For example, "streaming in progress" requires:
```typescript
caseStore.caseStatus.set('CREATED');
caseStore.isAnalyzing.set(true);
```
Setting only `caseStatus='CREATED'` is not enough to assert button-disabled behavior.

**`lockedDecision` lives in DecisionBarComponent, not in CaseStore** — after a page refresh
where `caseStatus='LOCKED'` is loaded from HTTP, `lockedDecision` signal is `null`, and the
template falls back to rendering the string `'LOCKED'`. Tests that verify the locked view can
set `lockedDecision` to `null` and assert the fallback.

---

## Historical Context

- `context/changes/core-case-flow/plan.md` — original design specified `CREATED→ANALYZING→ANALYZED→LOCKED` as a linear backend flow; frontend diverged by using a dual-track (`caseStatus` + `isAnalyzing`) to decouple streaming state from case status.
- `context/changes/core-case-flow/reviews/impl-review.md` — F4: CaseStore reset not called between cases (FIXED). Confirmed `reset()` in `case-detail.component.ts:26` is the authoritative reset path.
- `context/changes/red-flag-taxonomy/plan.md` — RedFlagsFound event emission guaranteed BEFORE AnalysisComplete; frontend handler at `extraction-form.component.ts:96` sets flags before `markAnalyzed()` at line 97. Order is observable in test via subscription sequence.

---

## Open Questions

1. **`caseStatus='ANALYZING'` from backend**: The dead-state (section 5) is a pre-existing gap.
   Should a spinner or "Analysis in progress" message be added to handle this? Risk #5 does not
   require it, but it may surface as a UX bug during testing — worth flagging in the plan.

2. **Re-analyze from pure ANALYZED state**: The Analyze button is hidden in ANALYZED (no error).
   Is this intentional? The original PRD doesn't speak to whether re-analysis is allowed after a
   successful run. The current template makes it unreachable. Tests should encode this as a
   contract, not a bug.

3. **`lockedDecision` persistence**: After page refresh with a locked case, the locked view shows
   `'LOCKED'` not the actual decision (APPROVE/REJECT/ESCALATE). The backend HTTP response for
   case detail does not return the decision — only `status`. Is this a known limitation? Relevant
   for Risk #1 (audit completeness) but not for Risk #5.
