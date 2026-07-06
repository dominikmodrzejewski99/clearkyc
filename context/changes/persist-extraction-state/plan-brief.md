# Persist Extraction State (LOCKED rehydration) — Plan Brief

> Full plan: `context/changes/persist-extraction-state/plan.md`
> Frame brief: `context/changes/persist-extraction-state/frame.md`

## What & Why

The LOCKED-case reload path is a confirmed bug (regression against the PRD),
not a design decision: extraction data already exists in `audit_record.payload`;
what's missing is only the "wire" — the API must return the payload and the
frontend must use it to fill `CaseStore` instead of showing a misleading empty
state. Fixing this closes the gap against PRD acceptance criterion
(`prd.md:66`): "reloading the page in a fresh session returns the same locked
values."

## Starting Point

`FinalizeService` already writes full field values, citations, overrides, and
red flags to `AuditRecord.payload` (JSON) at the moment a case is locked.
`CaseService.getCase()` and `CaseDetailResponse` currently expose only
metadata (`id/status/timestamps/entityName`) plus a thin `AuditSummary`
(decision + timestamp) — the payload itself is never read back. The frontend
templates (`extraction-form`, `red-flag-list`) already render correctly from
`CaseStore` for both `ANALYZED` and `LOCKED` states — they just never receive
data on a fresh page load.

## Desired End State

Finalize a case, hard-reload `/cases/:id` in a new browser session: the same
field values, citations, override badges (with justification), and red flags
appear exactly as they did before the reload.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| DTO shape | Reuse `FieldRecord`/`RedFlagItem` types directly on `CaseDetailResponse` | Symmetric with `FinalizeRequest` (same types written and read back); no new types | Plan |
| Corrupt payload handling | Return metadata without extraction fields, log a warning | Degrades gracefully — a rare malformed-JSON edge case shouldn't lock an analyst out of the whole case record | Plan |
| Override reconstruction | Map `FieldRecord.override` → `CaseStore.setOverride()` per field | Reuses existing store mutator; UI override badge/justification already renders from this signal | Plan |
| Test scope | Backend unit (`CaseServiceTest`) + frontend unit (`case-detail.component.spec.ts`) | Directly covers the regression; no controller changes needed since `CaseControllerTest` mocks `CaseService` | Plan |
| Scope boundary | LOCKED-state fix only; pre-decision (ANALYZING/ANALYZED) persistence excluded | Frame identified these as two different problems with different cost/status — LOCKED is a bug, pre-decision is an open product decision | Frame |

## Scope

**In scope:**
- Backend: `CaseDetailResponse` gains `fields`/`red_flags`; `CaseService.getCase()` deserializes `AuditRecord.payload` for LOCKED cases
- Frontend: `CaseDetail` model extended; `case-detail.component.ts` rehydrates `CaseStore` from the response on LOCKED load
- Backend + frontend unit tests for the new hydration path

**Out of scope:**
- Persistence for ANALYZING/ANALYZED (pre-decision) states — separate product decision
- Any schema/migration changes (none needed — `audit_record.payload` already has everything)
- Template changes to `extraction-form`/`red-flag-list` (already render correctly from `CaseStore`)

## Architecture / Approach

Symmetric read/write: `FinalizeService` writes `FieldRecord`/`RedFlagItem` into
`AuditRecord.payload` at lock time; `CaseService.getCase()` now reads that same
payload back into the same types for `LOCKED` cases, exposed via
`CaseDetailResponse`. The frontend replays the returned fields/overrides/red
flags into `CaseStore` using its existing mutators (`appendField`,
`setOverride`, `setRedFlags`) — no new store API, no template changes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend payload return | `CaseDetailResponse` carries `fields`/`red_flags` for LOCKED cases | Malformed payload JSON must degrade gracefully, not 500 |
| 2. Frontend rehydration | `CaseStore` populated from response on LOCKED load | Double-hydration on repeated navigation (mitigated by existing id-change reset guard) |
| 3. Test coverage confirmation | Full suite green, tests verified to catch the regression | None — checkpoint phase |

**Prerequisites:** None — no schema changes, no new dependencies.
**Estimated effort:** ~1 session across 3 phases (small, well-scoped fix).

## Open Risks & Assumptions

- Assumes all LOCKED cases have a valid `AuditRecord` (enforced by
  `FinalizeService`'s single transaction — verified in Phase 1 research, not a
  new assumption introduced by this plan).
- Assumes `finalization-v0.3.json` schema's required `fields` array means no
  historical locked case predates the payload format — confirmed via schema
  version file, no backfill needed.

## Success Criteria (Summary)

- Reloading a LOCKED case's page shows identical field values, citations,
  overrides (with justification), and red flags as before reload.
- No regression to non-LOCKED case loading or to cases with zero red flags.
- Malformed audit payload degrades to metadata-only response, not a 500 error.
