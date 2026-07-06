# Persist Extraction State (LOCKED rehydration) Implementation Plan

## Overview

Fix the confirmed regression against the PRD: a `LOCKED` case's extraction
results (verified field values, citations, overrides, red flags) are already
saved in `AuditRecord.payload` at finalization, but the backend never returns
them and the frontend never asks for them, so reloading a locked case's page
shows a misleadingly empty view. This plan wires the existing data through:
backend deserializes the stored payload and returns it, frontend rehydrates
`CaseStore` from it on load.

Scope is deliberately narrowed to the **LOCKED** path per
`context/changes/persist-extraction-state/frame.md`'s reframe. Persistence for
**pre-decision** states (`ANALYZING`/`ANALYZED`) is a separate, not-yet-decided
product question and is explicitly out of scope here.

## Current State Analysis

- `FinalizeService.finalize()` (`src/main/java/com/example/clearkyc/service/FinalizeService.java:70-99`)
  writes `fields` (each a `FieldRecord`, including per-field `override`) and
  `red_flags` into `AuditRecord.payload` as a JSON string, validated against
  `schema/finalization-v0.3.json`, at the moment a case transitions to
  `LOCKED`.
- `CaseService.getCase()` (`src/main/java/com/example/clearkyc/service/CaseService.java:88-108`)
  only maps the audit row to `AuditSummary(auditRecordId, decision, finalizedAt)`
  — it never touches `AuditRecord.getPayload()`.
- `CaseDetailResponse` (`src/main/java/com/example/clearkyc/web/dto/CaseDetailResponse.java`)
  has no field to carry extraction data back to the client.
- On the frontend, `case-detail.component.ts:41-48` sets only `caseStatus` and
  `entityName` from the `GET /api/cases/:id` response — `CaseStore.extractionFields`,
  `.fieldOverrides`, and `.redFlags` stay at their reset (empty) values.
- The rendering templates (`extraction-form.component.html`, `red-flag-list.component.html`)
  already read from `CaseStore` regardless of whether status is `ANALYZED` or
  `LOCKED` — **no template changes are needed**. `extraction-form.component.html:117-120`
  already renders `fieldOverrides` (struck-through original value + new value)
  and `red-flag-list.component.html:1` already renders for both `ANALYZED` and
  `LOCKED`. This is purely a data-plumbing gap.
- `FieldRecord` (`web/src/app/core/models/extraction.models.ts:67-72`) and the
  Java `FieldRecord`/`RedFlagItem` types used in `FinalizeRequest` are the
  exact shapes already stored in the payload — reusing them (rather than
  inventing new DTOs) keeps write/read symmetric.

### Key Discoveries:

- The fix requires zero schema/migration changes — `audit_record.payload` is
  a JSON column that already holds everything needed.
- `AuditRecord` is `@OneToOne` per case (`AuditRecord.java:20-22`), so a
  `LOCKED` case has at most one payload to fetch — no ordering/pagination
  concerns.
- `CaseControllerTest` (`src/test/java/com/example/clearkyc/web/CaseControllerTest.java:92-122`)
  mocks `CaseService` directly, so controller tests don't need changes; the
  new deserialization logic belongs in a `CaseServiceTest` (does not yet exist).

## Desired End State

Finalizing a case, then reloading `/cases/:id` in a fresh browser session,
shows the same field values, citations, override annotations ("Nadpisano" +
original/new value + justification), and red flags as before the reload —
matching PRD acceptance criterion (`prd.md:66`). Verify by: finalize a case
via UI or API, hard-reload the page, confirm all field values/citations/
overrides/red flags render identically to pre-reload state.

## What We're NOT Doing

- Persisting extraction results for `ANALYZING`/`ANALYZED` (pre-decision)
  states — separate product decision, tracked as a follow-up to this change.
- Changing the `finalization-v0.3.json` schema or adding new database
  columns/tables — the existing `audit_record.payload` column is sufficient.
- Changing `extraction-form.component.html` / `red-flag-list.component.html`
  templates — they already render correctly from `CaseStore` signals.
- Reconciling payload data with the live PDF (e.g., re-validating citations
  against `KybCase.pdfData`) — out of scope, not part of the reported bug.

## Implementation Approach

Deserialize `AuditRecord.payload` back into the same `FieldRecord`/`RedFlagItem`
types used to write it, expose them as new optional fields on
`CaseDetailResponse`, and have the frontend replay them into `CaseStore` via
the existing `appendField`/`setOverride`/`setRedFlags` mutators when the
returned case is `LOCKED`. This keeps the write path (`FinalizeService`) and
read path (`CaseService.getCase`) symmetric on the same types, and requires no
new frontend rendering logic.

## Phase 1: Backend — return payload data for LOCKED cases

### Overview

`CaseService.getCase()` deserializes the stored `AuditRecord.payload` and
`CaseDetailResponse` carries it back to the client for `LOCKED` cases.

### Changes Required:

#### 1. Extend `CaseDetailResponse`

**File**: `src/main/java/com/example/clearkyc/web/dto/CaseDetailResponse.java`

**Intent**: Add fields to carry the finalized extraction data back to the
client, reusing the existing `FieldRecord`/`RedFlagItem` types so the shape
matches exactly what `FinalizeRequest` accepted.

**Contract**: Add two nullable fields to the record: `List<FieldRecord> fields`
and `List<RedFlagItem> red_flags` (same field naming as `FinalizeRequest`/
`FinalizePayload` for frontend consistency). Both `null` when the case is not
`LOCKED` or no audit payload exists.

#### 2. Deserialize payload in `CaseService.getCase()`

**File**: `src/main/java/com/example/clearkyc/service/CaseService.java`

**Intent**: When the case is `LOCKED` and an `AuditRecord` exists, parse its
`payload` JSON string back into `fields`/`red_flags` and populate the new
`CaseDetailResponse` fields. On JSON parse failure, log a warning with the
case id and return the response without the extraction fields (metadata and
`AuditSummary` still populate normally) — never fail the whole request over a
malformed payload.

**Contract**: Add an `ObjectMapper` (module-level field, mirroring the
existing `FinalizeService` pattern) and a private helper that reads
`payload` into a small local record/holder with `fields`/`red_flags`, called
from inside the existing `if (kybCase.getStatus() == CaseStatus.LOCKED)`
branch in `getCase()`. Use SLF4J `Logger.warn(...)` (project's existing
logging approach) for the parse-failure case, including `caseId` and the
exception message but not the raw payload content.

### Success Criteria:

#### Automated Verification:

- Backend compiles and existing tests pass: `./mvnw test`
- New `CaseServiceTest` covers: LOCKED case with valid payload returns
  populated `fields`/`red_flags`; LOCKED case with malformed payload JSON
  returns `null` fields plus a logged warning, not a thrown exception;
  non-LOCKED case returns `null` fields (unchanged behavior)

#### Manual Verification:

- N/A for this phase (verified end-to-end in Phase 2)

---

## Phase 2: Frontend — rehydrate CaseStore on LOCKED load

### Overview

`case-detail.component.ts` replays the backend's returned `fields`/`red_flags`
into `CaseStore` when the loaded case is `LOCKED`, using the store's existing
mutators — no new store methods, no template changes.

### Changes Required:

#### 1. Extend `CaseDetail` model

**File**: `web/src/app/core/models/extraction.models.ts`

**Intent**: Mirror the new backend response fields on the frontend interface.

**Contract**: Add `fields?: FieldRecord[] | null` and
`red_flags?: RedFlagItem[] | null` to the `CaseDetail` interface (`extraction.models.ts:37-45`).

#### 2. Rehydrate `CaseStore` on load

**File**: `web/src/app/features/case-detail/case-detail.component.ts`

**Intent**: When `getCase()` returns a `LOCKED` case with `fields`, populate
`extractionFields` (via `appendField` per field), reconstruct
`fieldOverrides` from each `FieldRecord.override` (via `setOverride`), and
populate `redFlags` (via `setRedFlags`). Only do this once per load (the
existing `ngOnInit` id-change reset already guards against double-loading on
repeated navigation to the same case).

**Contract**: Inside the existing `ngOnInit` `caseService.getCase(id).subscribe({ next: ... })`
callback (`case-detail.component.ts:44-47`), after setting `caseStatus`/
`entityName`, add: if `response.status === 'LOCKED' && response.fields`, iterate
`response.fields` calling `caseStore.appendField({ fieldName, value, citations })`
for each, then `caseStore.setOverride(fieldName, override)` for any field with
a non-null `override`; if `response.red_flags`, call
`caseStore.setRedFlags(response.red_flags)`.

### Success Criteria:

#### Automated Verification:

- Frontend unit tests pass: `npm test` (or project's configured Angular test command)
- New/updated `case-detail.component.spec.ts` covers: LOCKED response with
  `fields` (including one with `override`) and `red_flags` results in
  `CaseStore.extractionFields`, `.fieldOverrides`, and `.redFlags` being
  populated; non-LOCKED response leaves them empty (unchanged behavior)

#### Manual Verification:

- Finalize a case (any decision) via the running app
- Hard-reload `/cases/:id` for that case in the browser
- Confirm: field values, citations, override badges ("Nadpisano" with
  struck-through original value) and justification text, and red flags all
  render identically to their pre-reload state
- Confirm a case finalized *before* this change (no `fields` in payload —
  N/A here since schema always included fields, but verify a case with no
  red flags recorded shows "Brak zidentyfikowanych red flag" as before, not
  an error)

---

## Phase 3: Test coverage confirmation

### Overview

Consolidate and confirm the automated coverage added in Phases 1-2 is
complete and passing together; no new production code in this phase.

### Changes Required:

#### 1. Full suite run

**File**: N/A (verification phase)

**Intent**: Confirm backend and frontend suites pass together, and that the
new tests actually fail without the Phase 1/2 changes (sanity check they
test the right thing) — revert locally, confirm red, reapply, confirm green.

**Contract**: No code changes; this phase is a checkpoint.

### Success Criteria:

#### Automated Verification:

- Full backend suite passes: `./mvnw test`
- Full frontend suite passes: `npm test` (project's Angular test command)
- `CaseServiceTest` and `case-detail.component.spec.ts` new tests fail on
  the pre-Phase-1/2 code and pass after (confirmed manually during review,
  not a CI step)

#### Manual Verification:

- End-to-end manual check from Phase 2 re-confirmed after full suite is green

---

## Testing Strategy

### Unit Tests:

- `CaseServiceTest` (new): LOCKED + valid payload → fields populated; LOCKED
  + malformed payload → null fields, no exception, warning logged; CREATED/
  ANALYZING/ANALYZED → fields stay null (unchanged)
- `case-detail.component.spec.ts` (new or extended): LOCKED response with
  fields/overrides/red_flags → CaseStore populated correctly; non-LOCKED →
  unchanged

### Integration Tests:

- Not required — `CaseControllerTest` already mocks `CaseService`, so the
  deserialization logic is fully covered at the service-unit level; no new
  controller-level scenarios needed since the controller doesn't change.

### Manual Testing Steps:

1. Finalize a case with at least one field override and one red flag.
2. Hard-reload `/cases/:id`.
3. Confirm field values, citations, override annotation, and red flags all
   match pre-reload state.
4. Finalize a second case with zero red flags; hard-reload; confirm
   "Brak zidentyfikowanych red flag" still renders (not broken by empty array
   handling).

## Performance Considerations

None — payload is a single small JSON blob already fetched via the existing
`AuditRecord` lookup; no additional queries introduced.

## Migration Notes

None — no schema changes. Cases finalized before this change already have
`fields`/`red_flags` in their `AuditRecord.payload` (schema v0.3 has required
`fields` since `finalization-v0.3.json`), so historical locked cases benefit
immediately without backfill.

## References

- Frame brief: `context/changes/persist-extraction-state/frame.md`
- `src/main/java/com/example/clearkyc/service/FinalizeService.java:70-99`
- `src/main/java/com/example/clearkyc/service/CaseService.java:88-108`
- `src/main/java/com/example/clearkyc/domain/AuditRecord.java:35-37,54`
- `src/main/java/com/example/clearkyc/web/dto/CaseDetailResponse.java`
- `src/main/java/com/example/clearkyc/web/dto/FinalizeRequest.java`
- `web/src/app/core/models/extraction.models.ts:37-78`
- `web/src/app/features/case-detail/case-detail.component.ts:33-58`
- `web/src/app/core/store/case.store.ts`
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html:117-171`
- `web/src/app/features/case-detail/components/red-flag-list/red-flag-list.component.html`
- `src/test/java/com/example/clearkyc/web/CaseControllerTest.java:92-122`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — return payload data for LOCKED cases

#### Automated

- [x] 1.1 Backend compiles and existing tests pass: `./mvnw test` — e8508d4
- [x] 1.2 New CaseServiceTest covers valid payload, malformed payload, non-LOCKED cases — e8508d4

### Phase 2: Frontend — rehydrate CaseStore on LOCKED load

#### Automated

- [ ] 2.1 Frontend unit tests pass: `npm test`
- [ ] 2.2 New/updated case-detail.component.spec.ts covers LOCKED hydration and non-LOCKED unchanged behavior

#### Manual

- [ ] 2.3 Finalize a case, hard-reload, confirm fields/citations/overrides/red flags render identically
- [ ] 2.4 Confirm case with zero red flags still shows "Brak zidentyfikowanych red flag" after reload

### Phase 3: Test coverage confirmation

#### Automated

- [ ] 3.1 Full backend suite passes: `./mvnw test`
- [ ] 3.2 Full frontend suite passes: `npm test`

#### Manual

- [ ] 3.3 End-to-end manual check re-confirmed after full suite green
