# Typewriter Field Reveal — Plan Brief

> Full plan: `context/changes/streaming-field-citations/plan.md`
> Research: `context/changes/streaming-field-citations/research.md`

## What & Why

The extraction form today fakes "live typing" the same way the landing page does — a fade-in row plus a blinking cursor next to an already-complete value. The user wants a real character-by-character reveal, matching what a genuine typewriter effect would look like, not the illusion. This is a deliberate reversal of a prior decision (archived `extraction-streaming-ux`, 2026-06-21) that explicitly rejected a real typewriter due to an unresolved CSS/flex-wrap conflict.

## Starting Point

`ExtractionFormComponent` pushes each SSE `FieldExtracted` event's complete value straight into `CaseStore` and the template interpolates it in one shot (`extraction-form.component.html:116-121`). A blinking `.cursor` currently appears after *every* already-filled field for as long as the whole analysis is running, not tied to which field is actually still "typing." Citations render immediately alongside the value.

## Desired End State

During a live analysis run, each field's value visibly builds up character-by-character, with a cursor that tracks the end of the currently-revealing text. Citations for that field fade in only once its value finishes revealing. Anything loaded outside an active stream (page refresh of an ANALYZED case, a LOCKED case) — and anyone with OS-level reduced motion enabled — sees fields fully formed instantly, with no reveal animation.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Reveal mechanism | JS signal-driven substring reveal, not CSS `steps()` | Sidesteps the exact flex-wrap conflict that killed the prior attempt — text-content changes don't need `white-space: nowrap`. | Research + User |
| Citation timing | Citations appear only after the value finishes revealing | Consistent "fact, then source" sequencing; less distracting mid-reveal. | User |
| Multi-field driver | One shared timer for all in-progress fields | Constant per-tick cost regardless of how many fields stream at once (a case can have a dozen-plus). | User |
| Timer primitive | `setInterval`, not literal `requestAnimationFrame` | Deterministic with Vitest fake timers; no rAF-mocking precedent exists in this codebase. | Plan |
| Existing animations | `rowAppear` and `.cursor` both kept; cursor repositioned to track reveal position | Minimal disruption to working styles; cursor gains a more accurate meaning. | User |
| Reduced motion | Full value shown instantly, no reveal, when `prefers-reduced-motion: reduce` | A real multi-hundred-ms reveal is far more motion-invasive than the previous 150ms fade — this is no longer optional. | User |
| Replay on load | Only fields arriving via an active SSE stream animate; loaded/refreshed fields render instantly | The reveal is a liveness indicator, not decoration — replaying it on every page load would be tedious. | User |

## Scope

**In scope:** `ExtractionFormComponent` (TS/HTML/SCSS), `CitationBadgeComponent` SCSS (citation fade-in only), unit tests.

**Out of scope:** Backend, SSE wire format, `CaseStore`, the pre-existing `CitationBadgeComponent`/`ExtractionFormComponent` navigation-logic duplication, and every other gap research flagged (NDJSON silent parse-drop, unchecked `toFieldExtracted` cast, red-flag taxonomy, stale `CLAUDE.md`).

## Architecture / Approach

Component-local reveal state (two signals: revealed substring per field, set of mid-reveal field names) driven by one shared `setInterval`, started lazily on the first field and stopped when none remain. The `FieldExtracted` SSE handler registers a field for reveal (unless reduced motion is on); the template swaps between the revealed substring and the final value based on whether the field is currently mid-reveal, and gates citation rendering on the same condition.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Typewriter reveal mechanism | Live character-by-character reveal, per-field cursor, gated citations, reduced-motion bypass | Multiple concurrent fields revealing smoothly without stutter |
| 2. Unit test coverage | Tests for live reveal, instant-render regression guard, reduced motion, cleanup on destroy | Faking `setInterval`-driven timing deterministically in Vitest |

**Prerequisites:** None — frontend-only, builds directly on the existing extraction form.
**Estimated effort:** ~1-2 sessions across 2 phases.

## Open Risks & Assumptions

- Reveal timing constants tuned during Phase 1 manual verification: initial estimate (40 chars/sec, 150-900ms clamp) made short field values (e.g. "Polska") reveal too fast to read as a typewriter effect. Retuned to 25 chars/sec, 350-1200ms clamp.
- `prefers-reduced-motion` behavior is testable via `window.matchMedia` stubbing in unit tests, but the actual OS-level toggle still needs manual verification (no automated coverage for real browser media-query behavior).

## Success Criteria (Summary)

- Live analysis runs show each field's value building up character-by-character, not popping in fully formed
- Citations appear only after their field finishes revealing
- Reduced-motion users and non-live field loads (refresh, LOCKED) see everything instantly, with no reveal
