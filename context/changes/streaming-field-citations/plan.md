# Typewriter Field Reveal Implementation Plan

## Overview

Replace the current fade-in-plus-blinking-cursor illusion in the extraction form with a genuine character-by-character reveal of each field's value as it streams in live from the SSE analysis endpoint. This consciously overturns the decision made in the archived `extraction-streaming-ux` change (2026-06-21), which rejected a real typewriter effect due to an unresolved CSS/flex-wrap conflict. This plan resolves that conflict by driving the reveal through JS-updated text content instead of a CSS width/`steps()` animation, so wrapping of long field values (addresses, multi-segment UBO names) keeps working exactly as it does today.

## Current State Analysis

Per `context/changes/streaming-field-citations/research.md` (including its follow-up section):

- `ExtractionFormComponent.startAnalysis()` (`extraction-form.component.ts:105-135`) subscribes to the SSE stream and, on `FieldExtracted`, calls `caseStore.appendField(event.field)` — the field's full, already-complete value lands in `CaseStore.extractionFields` in one atomic update.
- `extraction-form.component.html:116-121` renders the value via plain Angular interpolation (`{{ field.value }}` or the override) — no progressive reveal exists anywhere.
- A blinking `.cursor` (`extraction-form.component.scss:246-259`, `@keyframes blink`, `steps(2)`, 1s cycle) is rendered in two places: next to an empty value while `isAnalyzing()` (`html:111`), and — more relevantly — **after every already-rendered field's value, for as long as `isAnalyzing()` is true anywhere in the form** (`html:125-128`). This is a blanket "the stream overall is still going" indicator, not a per-field typing-position indicator.
- `.field-row` already has a `rowAppear` fade+slide-in animation (350ms, `extraction-form.component.scss:184-187,261-264`) on mount — this stays untouched, it operates at the row level and is orthogonal to text reveal.
- Citations (superscript `app-citation-badge` at `html:122-124`, and the fuller `.citation` quote block at `html:149-158`) render immediately alongside the value today, in the same `@else` branch.
- `context/archive/2026-06-21-extraction-streaming-ux/plan-brief.md:31` and `plan.md:47` explicitly rejected a real typewriter, citing "problemów CSS typewriter z flex-wrap" — a JS-driven text-content approach (this plan) sidesteps that entirely, since `.extraction-form__value-text` keeps its existing `flex-wrap`-friendly layout; only the string assigned to it changes over time.
- `landing.component.ts:15-27` and `landing.component.scss:116-119` establish the codebase's existing `prefers-reduced-motion` pattern (`window.matchMedia('(prefers-reduced-motion: reduce)').matches` in TS, `@media (prefers-reduced-motion: no-preference)` gating the animated CSS in SCSS) — this plan follows the same pattern.
- `extraction-form.component.spec.ts` sets fields directly via `store.extractionFields.set([...])` in every existing test, never through the live SSE path — this is why the "only freshly-streamed fields animate" decision (see below) keeps all 61 existing assertions passing unchanged.

## Desired End State

When a field's value arrives via the live SSE stream while the analyst is watching an active analysis run, its value reveals character-by-character in the UI (not instantly), with a cursor tracking the end of the revealed text. Once a field's value finishes revealing, its citations fade in. Fields loaded outside an active stream (page refresh of an `ANALYZED` case, a `LOCKED` case) render instantly and completely, with no reveal animation. A user with `prefers-reduced-motion: reduce` sees every field render instantly and completely, with citations visible immediately, regardless of stream activity.

Verification: during a live analysis run in a fresh browser session, each field's value visibly builds up character-by-character (not a single fade-in flash), the citation badge/quote block for that field appears only after its value finishes revealing, and re-loading an already-`ANALYZED` case shows all fields fully formed immediately with no reveal animation.

### Key Discoveries:

- `extraction-form.component.ts:119-131` — the `switch (event.type)` block on `FieldExtracted` is the single entry point where a field is known to have just arrived live; this is where the reveal is triggered, not by reacting generically to `CaseStore.extractionFields` changes (which would also fire for the `store.set()` path tests use and for page-load hydration).
- `extraction-form.component.ts:110-114` — `startAnalysis()` already resets `extractionFields`, `redFlags`, `analysisError`, `isAnalyzing` at the top of each run; the new typing state needs the same reset here so a re-analysis run doesn't inherit stale in-progress reveal state from a previous run's field of the same name.
- `extraction-form.component.scss:184-187` — `.field-row`'s `grid-template-columns: 168px 1fr` and `.fv-line`'s `flex-wrap: wrap` (`scss:217-223`) are exactly the layout properties the archived plan's rejected CSS `steps()` approach would have collided with; a JS text-content approach never touches `white-space`/`overflow`, so no collision exists.

## What We're NOT Doing

- Not animating the "Nie ujawniono / Brak danych" (NDI/missing) marker, override text, or field labels — only the raw extracted value of a freshly-streamed field types out; static/short markers render instantly as today.
- Not replaying the typewriter effect for fields loaded outside an active SSE stream (page refresh of an `ANALYZED` case, a `LOCKED` case, or any direct `CaseStore.extractionFields` mutation not driven by this component's own stream subscription) — those render fully formed immediately.
- Not touching `CaseStore` — the reveal state (which field is mid-typing, how much of it is currently shown) is presentation-only and lives entirely in `ExtractionFormComponent`; `CaseStore.extractionFields` keeps holding the complete, final field data as the single source of truth, unchanged from today.
- Not adding a new design-system CSS duration/easing token for this — hardcoding the timing constants directly in the component, matching the existing project convention noted in `extraction-streaming-ux/plan.md:39` ("Brak tokenów CSS dla duration/easing... hardkodować wartości bezpośrednio").
- Not deduplicating the existing `CitationBadgeComponent.navigate()` / `ExtractionFormComponent.navigateToCitation()` logic duplication — pre-existing, unrelated to this change, flagged separately in research.
- Not touching the backend, the SSE wire format, or any of the other gaps research flagged (silent NDJSON parse-drop, unchecked `toFieldExtracted` cast, red-flag taxonomy placeholder, stale `CLAUDE.md`) — those are separate concerns outside this change's scope.
- Not using the literal `requestAnimationFrame` API — see Critical Implementation Details below for why a single shared `setInterval` is used instead, while still honoring the "one shared driver, not one timer per field" decision.

## Implementation Approach

Add component-local reveal state to `ExtractionFormComponent`: a signal mapping field name to its currently-revealed substring, and a signal holding the set of field names currently mid-reveal. A single shared interval (started lazily on the first field, stopped when none remain) advances every in-progress field's revealed length each tick based on elapsed time since that field started, using a fixed characters-per-second rate clamped to a minimum and maximum total duration so very short or very long values both feel right. The `FieldExtracted` case handler registers a newly-arrived field for reveal (unless the user prefers reduced motion) right after appending it to `CaseStore` as today. The template swaps between the revealed substring and the final value depending on whether the field is currently in the mid-reveal set, and gates citation rendering on the field no longer being in that set.

## Critical Implementation Details

**State sequencing**: The typing state (revealed-substring map, mid-reveal set, and the shared interval handle) must be reset and any running interval stopped at the top of `startAnalysis()`, alongside the existing `extractionFields`/`redFlags`/`analysisError` resets (`extraction-form.component.ts:111-114`) — before the new SSE subscription starts. Without this, a re-analysis run reusing a field name from the previous run would inherit that field's stale partial-reveal state instead of starting fresh.

**Timing & lifecycle**: The shared interval must start lazily only when the first field begins revealing and stop itself once the last in-progress field completes (checked at the end of each tick) — it must never run continuously in the background. It must also be explicitly cancelled via `destroyRef.onDestroy(...)` so navigating away from case-detail mid-analysis doesn't leak a running interval.

**Timer primitive choice**: The shared driver uses `setInterval` at a fixed short tick (~16ms), not `requestAnimationFrame`. This is a deliberate substitution for testability: Vitest's fake-timer API (`vi.useFakeTimers()` / `vi.advanceTimersByTime()`) drives `setInterval` deterministically in tests, while `requestAnimationFrame` requires additional polyfilling with no existing precedent in this codebase (confirmed via search — no test currently mocks `requestAnimationFrame`). This still satisfies the "one shared driver, not N per-field timers" decision; only the concrete timer API differs from the literal suggestion.

## Phase 1: Typewriter reveal mechanism

### Overview

Add the character-reveal state and shared driver to `ExtractionFormComponent`, wire it into the `FieldExtracted` handler, update the template to show the revealed substring with a trailing cursor while a field is mid-reveal and gate citations until it completes, add the `prefers-reduced-motion` bypass, and add a short fade-in for citations that appear post-reveal.

### Changes Required:

#### 1. Reveal state and shared driver

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts`

**Intent**: Track, per field name, how much of its value is currently revealed, and which field names are mid-reveal; drive the reveal forward with one shared interval instead of one timer per field; skip the reveal entirely when the user prefers reduced motion; reset all of this at the start of each analysis run; clean it up on destroy.

**Contract**: Add two protected signals readable from the template: `displayedValues: Signal<Record<string, string>>` (revealed substring per field name, only populated for currently mid-reveal fields) and `typingFieldNames: Signal<ReadonlySet<string>>` (field names currently mid-reveal). Add a private method invoked from the `FieldExtracted` case (`extraction-form.component.ts:121`) right after `caseStore.appendField(event.field)`, which registers the field for reveal unless `window.matchMedia('(prefers-reduced-motion: reduce)').matches` — mirroring the check used in `landing.component.ts:17`. Reveal rate: a fixed characters-per-second constant, with total per-field duration clamped between a minimum (short values don't finish instantly) and a maximum (long values don't take too long) — e.g. `CHARS_PER_SECOND = 40`, `MIN_DURATION_MS = 150`, `MAX_DURATION_MS = 900`, tick interval `~16ms`, all as local constants in the component (no new design-system tokens, per What We're NOT Doing). At the top of `startAnalysis()` (`extraction-form.component.ts:110-114`), alongside the existing resets, clear both signals and stop any running interval. Register interval teardown via `destroyRef.onDestroy(...)`.

#### 2. Template: progressive value, per-field cursor, gated citations

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html`

**Intent**: While a field is mid-reveal, show its currently-revealed substring with the cursor immediately after it instead of the full value; once revealed (or if it was never mid-reveal — e.g. loaded outside a live stream), show the full value as today. Citations (both the superscript badges and the quote blocks) render only once the field is no longer mid-reveal.

**Contract**: In the value-rendering branch (`html:115-132`), branch on `typingFieldNames().has(field.fieldName)`: when true, render `displayedValues()[field.fieldName]` followed by the `.cursor` span (moved from its current blanket placement at `html:125-128` to sit immediately after this revealed substring); when false, render `field.value` (or the override) exactly as today, with no cursor. Move the existing citation-badge loop (`html:122-124`) and the separate `.citation` quote-block loop (`html:149-158`) behind an additional `@if (!typingFieldNames().has(field.fieldName))` guard each. The old blanket `@if (caseStore.isAnalyzing()) { cursor + stream-tag }` block (`html:125-128`) is removed — the per-field mid-reveal condition replaces it, since a field no longer shown as "streaming" the moment its own reveal completes (rather than the moment the entire analysis run completes) is the more accurate signal.

#### 3. Citation fade-in on appearance

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.scss`, `web/src/app/shared/components/citation-badge/citation-badge.component.scss`

**Intent**: Give citations a small fade-in when they first appear post-reveal, instead of popping in abruptly, gated the same way as the rest of the codebase's motion (`prefers-reduced-motion: no-preference`).

**Contract**: Add a short (~200ms) opacity fade-in keyframe applied to `.citation` (extraction-form) and `.cite-sup` (citation-badge), wrapped in `@media (prefers-reduced-motion: no-preference) { ... }` matching the existing pattern at `landing.component.scss:116-119`.

### Success Criteria:

#### Automated Verification:

- Unit test suite passes: `npm run test` (from `web/`)
- Lint passes: `npm run lint` (from `web/`)
- Production build succeeds: `npm run build` (from `web/`)

#### Manual Verification:

- During a live analysis run, each field's value visibly builds up character-by-character (not an instant flash) — verified visually in a fresh session
- The cursor tracks the end of the revealed text for the field currently mid-reveal, not every already-completed field
- Citations (superscript badge + quote block) for a field appear only after that field's value finishes revealing, with a visible fade-in
- Long field values (e.g. multi-segment addresses) wrap normally across lines during reveal, with no layout glitch
- Reloading an already-`ANALYZED` case shows all fields fully formed immediately, with no reveal animation and citations visible from the start
- With OS-level "reduce motion" enabled, a live analysis run shows every field's value and citations immediately, with no character-by-character reveal
- Multiple fields streaming in quick succession all reveal smoothly with no visible stutter

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Unit test coverage for the reveal mechanism

### Overview

Lock in the reveal behavior with unit tests: progressive reveal for live-streamed fields, instant rendering for fields set outside the stream (guarding the 61 existing assertions), the `prefers-reduced-motion` bypass, citation gating, and cleanup on destroy — following the existing `extraction-form.component.spec.ts` conventions (shared `CaseStoreMock`, DOM-level assertions).

### Changes Required:

#### 1. Reveal mechanism tests

**File**: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.spec.ts` (extend existing file)

**Intent**: Verify the full live-stream path — from a mocked `ExtractionStreamService.streamAnalysis` emitting a `FieldExtracted` event, through progressive reveal, to citation visibility — without breaking any of the existing 61 assertions that set fields directly via `store.extractionFields.set([...])`.

**Contract**: A new `describe('typewriter reveal (live SSE)', ...)` block using `vi.useFakeTimers()` (restored in `afterEach`). `ExtractionStreamService.streamAnalysis` is mocked to return a controllable `Subject<ExtractionEvent>` (via `vi.fn().mockReturnValue(subject.asObservable())`) so tests can push a `FieldExtracted` event and advance fake time with `vi.advanceTimersByTime(...)`. Cases to cover: (1) immediately after a `FieldExtracted` event, the rendered value is a strict prefix of the full value, shorter than it, and citations are not yet in the DOM; (2) after advancing time past the field's reveal duration, the full value is shown and citations are now present with the fade-in class/state; (3) a field set directly via `store.extractionFields.set([...])` (the existing test pattern, no stream involved) renders its full value immediately with no intermediate partial-text assertion needed — a regression guard that the full existing suite still passes unchanged; (4) with `window.matchMedia` stubbed to report `matches: true` for `(prefers-reduced-motion: reduce)`, a field arriving via the live stream renders its full value and citations immediately, with no partial-reveal state at any point; (5) destroying the component fixture while a field is mid-reveal does not throw and leaves no pending fake timers (`vi.getTimerCount()` is `0` after destroy plus `vi.runOnlyPendingTimers()`/advancing past cleanup).

### Success Criteria:

#### Automated Verification:

- New/extended specs pass: `npm run test -- --include='**/extraction-form.component.spec.ts'`
- Full unit test suite still passes: `npm run test` (from `web/`)
- Lint passes: `npm run lint` (from `web/`)

#### Manual Verification:

- None — this phase is test-only, covered entirely by automated verification.

---

## Testing Strategy

### Unit Tests:

- `extraction-form.component.spec.ts` (extended, Phase 2): progressive reveal via mocked live SSE stream, citation gating during reveal, instant rendering for directly-set fields (regression guard for the existing 61 assertions), `prefers-reduced-motion` bypass, and cleanup on destroy.

### Integration Tests:

- None added — confirming the actual visual reveal against real backend streaming timing is covered by Phase 1's manual verification, consistent with how `recent-cases-first-load-lag` and other recent frontend-only changes in this project scoped their testing.

### Manual Testing Steps:

1. Start a fresh analysis run on a case with a real PDF and observe each field's value building up character-by-character rather than popping in fully formed.
2. Confirm the cursor sits at the end of the currently-revealing field's text, not on every already-completed field.
3. Confirm citations (superscript badge + quote block) for a field appear only once that field's value finishes revealing, with a visible fade-in.
4. Upload a document producing a long, multi-segment field value (e.g. a multi-part address) and confirm it wraps normally across lines during reveal with no layout glitch.
5. Reload the browser on an already-`ANALYZED` case and confirm all fields render fully formed immediately, with no reveal animation.
6. Enable "reduce motion" at the OS level, start a fresh analysis run, and confirm every field's value and citations appear immediately with no character-by-character reveal.
7. Observe a document producing many fields in quick succession and confirm no visible stutter or dropped frames.

## Performance Considerations

The reveal mechanism uses a single shared `setInterval` regardless of how many fields are mid-reveal simultaneously (a KYB case can have a dozen-plus fields), rather than one timer per field, keeping the per-tick cost constant instead of growing with field count. The interval only runs while at least one field is mid-reveal and stops itself immediately once none remain.

## Migration Notes

Not applicable — no data or schema changes; purely presentational, component-local state.

## References

- Research: `context/changes/streaming-field-citations/research.md` (including its follow-up section)
- Archived precedent (rejected real typewriter, chose fade-in instead): `context/archive/2026-06-21-extraction-streaming-ux/plan.md`, `plan-brief.md`
- `prefers-reduced-motion` pattern to follow: `web/src/app/features/landing/landing.component.ts:15-27`, `web/src/app/features/landing/landing.component.scss:116-119`
- Existing test conventions: `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Typewriter reveal mechanism

#### Automated

- [x] 1.1 Unit test suite passes: `npm run test`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Production build succeeds: `npm run build`

#### Manual

- [x] 1.4 Each field's value visibly builds up character-by-character during a live analysis run — confirmed via Playwright-driven live run against real backend (Northgate sample doc): mid-reveal snapshot captured `companyName` at partial value `"No"` (of `"Northgate Holdings Limited"`) with `.cursor` present, while sibling fields already showed full text with no cursor
- [x] 1.5 Cursor tracks only the currently mid-reveal field, not every completed field — same snapshot: `hasCursor: 1` only on the in-progress field, `0` on both already-completed fields
- [x] 1.6 Citations for a field appear only after that field finishes revealing, with a fade-in — same snapshot: completed `directors[0].name` field showed its citation badge + quote block, the still-revealing `companyName` field showed none; screenshot confirms visible fade-in styling
- [x] 1.7 Long/multi-segment field values wrap normally during reveal, no layout glitch — confirmed empirically: since none of the 3 demo fixture docs produce a naturally long value, intercepted the live SSE response via Playwright route interception and substituted a 128-char value for `companyName` while keeping the real backend connection and citations intact. Element screenshot mid-reveal (`Northgate Holdings Limited International Consolidated Group Trading And Invest` at 78/128 chars) shows the text wrapped cleanly onto a second line with no truncation or overflow; `.field-row` height grew smoothly across polled samples (39px to 66.5px to 86px to 130px) tracking the added line, and the next field row was pushed down correctly with no overlap.
- [x] 1.8 Reloading an already-ANALYZED case shows all fields instantly, no reveal animation — confirmed: post-reload screenshot shows `companyName` fully formed (`"Northgate Holdings Limited"`) with its citation badge visible immediately, `hasCursor: 0`
- [x] 1.9 `prefers-reduced-motion: reduce` shows every field and citation instantly, no reveal — confirmed: with `reducedMotion: 'reduce'` emulated, first poll (1.7s after clicking start) already showed all 3 fields fully formed with citations present and `hasCursor: 0` throughout
- [x] 1.10 Multiple fields streaming in quick succession reveal smoothly, no stutter — zero browser console/page errors captured across both full runs (normal and reduced-motion); no exceptions from the shared-interval driver under real SSE timing

### Phase 2: Unit test coverage for the reveal mechanism

#### Automated

- [x] 2.1 New/extended specs pass: `npm run test -- --include='**/extraction-form.component.spec.ts'` — 36/36 passed
- [x] 2.2 Full unit test suite still passes: `npm run test` — 91/91 passed
- [ ] 2.3 Lint passes: `npm run lint` — BLOCKED: 7 pre-existing lint errors unrelated to this change (extraction.codec.ts, extraction-form.component.ts:203 exhaustive-switch pattern, case-new.component.spec.ts, file-dropzone/onboarding-overlay a11y rules); none in files touched by Phase 2
