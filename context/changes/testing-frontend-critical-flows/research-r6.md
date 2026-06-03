---
date: 2026-06-03T10:05:00+02:00
researcher: Claude Sonnet 4.6
git_commit: 7765dc52c02290147fd85c20f137e9d73d6239f2
branch: main
repository: dominikmodrzejewski99/clearkyc
topic: "Risk #6 — Citation trust contract: empty citations array on non-NDI field"
tags: [research, frontend, angular, citation, trust-contract, extraction-stream, extraction-form, vitest]
status: complete
last_updated: 2026-06-03
last_updated_by: Claude Sonnet 4.6
---

# Research: Risk #6 — Citation Trust Contract

**Date**: 2026-06-03T10:05:00+02:00
**Git Commit**: 7765dc52c02290147fd85c20f137e9d73d6239f2
**Branch**: main
**Repository**: dominikmodrzejewski99/clearkyc

## Research Question

For Risk #6 from test-plan.md: when a `FieldExtracted` SSE event carries an empty `citations`
array and a non-NDI value, does the UI render a "Not Disclosed / Inferred Missing" marker (as
required by the PRD trust contract), or does it display the value as if it were verified? What
code changes and tests does this require?

---

## Summary

**A confirmed gap exists between the PRD trust contract and the current frontend implementation.**

The PRD guardrail states that no extracted field should be displayed without a source citation.
When citations are absent, the field must be surfaced as an explicit gap — not shown as a
confident value. However, the current `ExtractionFormComponent` template checks only the
`field.value` string for the literal `'Not Disclosed / Inferred Missing'` text, and never
inspects `field.citations.length`. A field with `value="ACME Corp."` and `citations=[]` renders
identically to a field with three citations: the value is shown in full, the citations column
is empty, and there is no visual indicator that the value is unverifiable.

**The gap exists at the frontend template layer. It is not caught by the backend or by
`ExtractionStreamService`** — both are permissive pass-throughs. The fix requires a template
guard: when `citations.length === 0` and `value !== 'Not Disclosed / Inferred Missing'`, the
component should render the NDI marker instead of the raw value.

**Tests for R6 must be written AFTER this template change.** Without it, a test asserting the
protection exists would fail against the current code. Alternatively, a TDD approach writes the
failing test first, then implements the guard.

---

## Detailed Findings

### 1. Oracle — PRD Trust Contract (verbatim)

**NFR (trust-contract integrity):**
> "every populated field shown in the UI is justifiable — either by an array of verbatim source
> citations, or by an explicit 'Not Disclosed / Inferred Missing' marker plus its derived
> red-flag entry. The product never shows a confident value without provenance."

**Product Guardrail (verbatim):**
> "No extracted field is ever displayed to the analyst without an accompanying source citation.
> If the model cannot produce a citation for a value, the field remains empty and is surfaced to
> the analyst as an explicit gap, not a confident answer."

**FR-008 (verbatim):**
> "Every populated extracted field is displayed alongside an array of one or more verbatim
> quoted-snippet citations from the source document (supports multi-page synthesis). If a field's
> value is derived from absence of evidence, the field shows an explicit 'Not Disclosed /
> Inferred Missing' marker rather than staying empty."

**US-01 Acceptance Criteria (verbatim):**
> "Every populated field carries an array of one or more quoted-snippet citations; fields where
> the model determined absence-of-evidence show an explicit 'Not Disclosed / Inferred Missing'
> marker rather than an empty value."

**Rule derived from oracle:**
- Non-NDI value AND `citations.length > 0` → show value + citation badges (correct)
- NDI value (`'Not Disclosed / Inferred Missing'`) AND `citations = []` → show NDI marker (correct)
- Non-NDI value AND `citations = []` → MUST NOT show as confident value; must surface as gap (CURRENT GAP)

---

### 2. Frontend Template Gap

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html`

The citations column renders at line 106-110:
```html
<td class="extraction-form__citations">
  @for (citation of field.citations; track $index) {
    <app-citation-badge [citation]="citation" [index]="$index + 1" />
  }
</td>
```

When `field.citations = []`, the `@for` loop does not iterate. The `<td>` is rendered but
completely empty — **no placeholder, no warning, no indicator.**

The NDI CSS class is applied at line 69-72:
```html
<td
  class="extraction-form__field-value"
  [class.extraction-form__field-value--missing]="
    !caseStore.fieldOverrides()[field.fieldName] &&
    field.value === 'Not Disclosed / Inferred Missing'"
>
```

**Critical**: the `--missing` class is applied only when `field.value` exactly equals the NDI
string. It is NEVER applied based on `field.citations.length`. There is no `@if` branch that
checks `citations.length === 0` to show an NDI-equivalent indicator.

**What the analyst sees for `value="ACME Corp.", citations=[]`:**
- Value column: "ACME Corp." in plain text (no `--missing` class)
- Citations column: completely blank `<td>` (no badge, no warning, no placeholder)
- Visually indistinguishable from a field with three citations

---

### 3. CitationBadgeComponent

**File**: `web/src/app/shared/components/citation-badge/citation-badge.component.html`

```html
<span class="citation" (click)="navigate()" [title]="citation().quote">
  <sup class="citation__marker">[{{ index() }}]</sup>
</span>
```

Renders a clickable `[N]` superscript with the quote as a tooltip. Clicking navigates to the
citation's page via `caseStore.activePage.set()`. No empty-state variant exists.

**Implication for testing**: Since `CitationBadgeComponent` also injects `CaseStore`, tests that
render it in `ExtractionFormComponent` spec already get it for free (same mock provided). No
separate mock needed for citations tests.

---

### 4. ExtractionStreamService — Pass-through, No Validation

**File**: `web/src/app/core/services/extraction-stream.service.ts`

The SSE parsing function at the module level:
```typescript
function parseSSEMessage(raw: string): ExtractionEvent | null {
  // ...
  if (eventType === 'FieldExtracted') return { type: 'FieldExtracted', field: payload };
  // ...
}
```

`payload` is a raw `JSON.parse(dataLine)` result. When the SSE message carries
`"citations":[]`, the parsed payload has `citations: []`. The function performs no
validation — it does not check `citations.length`, does not reject empty citations for
non-NDI values, and does not transform the field.

**`parseSSEMessage` is NOT exported** (module-level private function). It cannot be unit tested
directly without modifying the service to export it.

**For test purposes**: The service can be tested through its public `streamAnalysis()` method by
providing a mock HTTP response body that emits SSE events. However, since `streamAnalysis`
depends on `AuthService` and `fetch`, a full integration test is complex. The test-plan's
recommended layer is the **component test** (mocking the store, not the stream).

---

### 5. Backend — No Citation Enforcement

**ExtractionService** (`src/main/java/com/example/clearkyc/analysis/ExtractionService.java`):
- Parses LLM NDJSON lines directly into `ExtractionEvent.FieldExtracted` records
- No validation that non-NDI values have non-empty citations
- Unparseable lines are logged as WARN and skipped

**System prompt (relevant excerpt):**
```
Emit exactly one JSON object per line:
{"fieldName":"<name>","value":"<value>","citations":[{"quote":"<verbatim text>","pageNumber":<n>}]}

If a field cannot be found:
{"fieldName":"<name>","value":"Not Disclosed / Inferred Missing","citations":[]}
```

The backend INSTRUCTS the LLM to send empty citations only for NDI values. But it does NOT
enforce this at the code level — a non-NDI value with `citations=[]` from the LLM would pass
through to the frontend without any error.

**Finalization schema** (`src/main/resources/schema/finalization-v0.3.json`):
```json
"citations": {
  "type": "array",
  "items": { "type": "object", "required": ["page", "quote"] }
}
```
No `minItems` constraint — citations array is optional regardless of field value.

---

### 6. Historical Contract (from prior changes)

**Source**: `context/changes/llm-streaming-backend/research.md:270-271`

```
List<Citation> citations   // co najmniej jeden element (lub pusta lista przy "Not Disclosed")
```

Translation: "at least one element (or empty list for 'Not Disclosed')."

This is the **explicit design contract** established when the extraction pipeline was built:
- Non-NDI value → `citations.length >= 1` (required)
- NDI value → `citations = []` (required)

The contract exists in design documentation but is enforced nowhere in code.

---

## Code References

- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html:69-72` — NDI CSS class (value string check only)
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html:106-110` — citations `@for` loop (empty array = empty `<td>`)
- `web/src/app/shared/components/citation-badge/citation-badge.component.html:1-3` — badge render (`[N]` superscript + tooltip)
- `web/src/app/core/services/extraction-stream.service.ts:64-86` — `parseSSEMessage` (private, pass-through)
- `web/src/app/core/services/extraction-stream.service.ts:77` — `FieldExtracted` assignment: `return { type: 'FieldExtracted', field: payload }` (no citation check)
- `src/main/java/com/example/clearkyc/analysis/ExtractionService.java` — backend NDJSON parser (no citation validation)
- `src/main/resources/schema/finalization-v0.3.json:22-32` — `citations` field: optional, no `minItems`
- `context/changes/llm-streaming-backend/research.md:270-271` — design contract (citations ≥1 for non-NDI)

---

## Architecture Insights

**Where the gap is cheapest to fix**: The frontend template is the right layer. A single `@if`
guard in `extraction-form.component.html` can enforce the trust contract before the value
reaches the analyst, even when the backend passes through an invalid state:

```html
<!-- Proposed guard (not yet implemented): -->
@if (field.citations.length === 0 && field.value !== 'Not Disclosed / Inferred Missing') {
  <span class="extraction-form__field-value--missing">Not Disclosed / Inferred Missing</span>
} @else {
  <!-- existing value rendering -->
}
```

**Why a service-layer test alone is insufficient**: `ExtractionStreamService` is a pass-through
— it does not and should not enforce domain rules about citation presence. Its job is SSE
parsing fidelity. The trust contract is a UI rendering concern.

**Why a backend fix alone is insufficient**: Even if the backend schema adds `minItems: 1` for
non-NDI values at finalization time, the SSE stream during analysis is not validated the same
way. A field emitted with empty citations by the LLM would still be rendered without protection
until the frontend guard exists.

**Test approach (cheapest layer per test-plan §4)**:
1. **Component test** (primary): Mock `CaseStore.extractionFields` with `[{ value: 'ACME Corp.', citations: [] }]` and `caseStatus='ANALYZED'`. Assert that the template renders the NDI marker, NOT the raw value. This test currently **fails** — it drives the fix.
2. **Service unit test** (secondary): Export `parseSSEMessage` and write a focused unit test verifying it passes through `citations:[]` correctly. This confirms the service is a correct pass-through and that the component test is the right oracle layer.

---

## Historical Context

- `context/changes/llm-streaming-backend/research.md` — established the design contract: citations ≥1 for non-NDI, citations=[] for NDI
- `context/changes/llm-streaming-backend/plan.md` — LLM system prompt defines the citation requirement per field type
- `context/changes/core-case-flow/research.md` — frontend `ExtractionField` interface (value, citations, isStreaming)
- `context/changes/red-flag-taxonomy/plan.md` — NDI values chain into red flags (confirmed NDI is a first-class value in the taxonomy)

## Related Research

- `context/changes/testing-frontend-critical-flows/research.md` — R5 state machine research (same change folder, different risk)

---

## Open Questions

1. **Template fix scope**: Should the guard be in `extraction-form.component.html` (where the
   field value is displayed) or in `CaseStore.appendField()` (normalizing at the store layer)?
   Store normalization would propagate to any future consumers, but it silently mutates the LLM
   output. Template guard is more transparent.

2. **`parseSSEMessage` export**: Should it be exported for direct unit testing, or is testing
   through the component (with a store mock) sufficient coverage? The test-plan says "Angular
   service unit test + component test" — both are listed. If exported, the service test can
   verify parse fidelity independently from the template behavior.

3. **NDI citations empty vs. absent**: The backend contract says NDI fields have `citations: []`
   (explicit empty array). Should the guard handle `citations == null` as well (defensive
   programming), or treat null as a bug that should surface loudly?

4. **Finalization schema**: Should `finalization-v0.3.json` add a conditional `minItems: 1` for
   non-NDI fields? This would catch the gap at the finalization API boundary. Not a frontend
   concern, but related to Risk #4 territory.
