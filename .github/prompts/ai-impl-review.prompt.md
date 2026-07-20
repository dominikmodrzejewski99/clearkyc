---
description: Review implementation against plan for drift, dangerous decisions, and pattern compliance
mode: agent
tools: ['edit', 'search', 'runCommands']
---

# /ai-impl-review — Implementation Review

Compare actual implementation work against `context/changes/<change-id>/plan.md` to catch drift, dangerous decisions, architecture violations, and pattern misuse. Two granularities (phase review / full-plan review) and two modes (fresh review / resume triage).

> See `.github/prompts/README.md` for shared conventions.

## Input resolution

1. Argument points to a saved review file (contains `<!-- IMPL-REVIEW-REPORT -->`) → resume triage, skip to Step 5.
2. Argument is a `<change-id>` with an existing `plan.md` → fresh review.
3. Plan path given directly → fresh review on that plan.
4. Phase number given (e.g. "phase 3") → review only that phase.
5. No argument → enumerate `context/changes/*/change.md`, pick the most recently `updated` one with `status` in `{implementing, implemented}`, confirm via numbered text.

Refuse if the resolved path starts with `context/archive/`: "This change is archived. Reviews are not appended to archived plans." and stop.

## Step 1: Load plan and detect change scope

Read the plan file fully. Read `context/foundation/lessons.md` if present — use accepted rules as priors when scanning for findings. Read the canonical state from `## Progress` (completion = count-based, current phase = phase containing first `- [ ]`). Read sibling `change.md` for status/updated. Scope = requested phase, else all phases with fully `[x]` Progress checkboxes.

Extract from phases under review: file paths from Changes Required, architectural decisions, success criteria, the "What We're NOT Doing" list. Detect the actual git scope (`git log`/`git diff` since the plan's date, or commits referencing the plan/feature) and compare against plan-listed files: in-plan-and-in-diff (verify content matches intent), in-diff-not-in-plan (unplanned, flag), in-plan-not-in-diff (potentially missing).

Don't pre-read every changed file into context — read only what's needed as you go (Copilot substitution for sub-agent delegation).

## Step 2: Review passes (sequential — Copilot substitution for parallel sub-agents)

Run these two passes one after another within the current turn, each with its own targeted context:

**Pass 1 — Plan Drift Detection.** For each planned change, read the actual file, verify implementation matches intent. Check for: implemented differently than planned, planned items skipped without documentation, additions not in the plan (scope creep). Report per file: what plan said, what exists, verdict (MATCH/DRIFT/MISSING/EXTRA).

**Pass 2 — Safety, Quality & Pattern Compliance.** Scan each changed file for: security (injection, hardcoded secrets, missing authn/authz, permissive CORS), performance (N+1, unbounded iteration, missing pagination, sync I/O), reliability (missing error handling at boundaries, race conditions, resource leaks), data safety (destructive ops without rollback, unmigrated schema changes). Then pattern compliance — compare each changed file against 1-2 similar existing files (naming, error handling, structure, imports, tests); report only substantive mismatches. Budget pattern-checking depth to diff size (≤3 files changed → minimal pattern work).

## Step 3: Verify success criteria

Automated: run each command from the phase's Automated Verification checkboxes, record pass/fail + truncated output. Manual: check `## Progress` Manual items `[x]`/`[ ]`; flag items marked complete with no observable evidence in the diff (possible rubber-stamping); acknowledge unchecked items as pending.

## Step 4: Compile findings and present report

Each finding: ID (F1, F2...), Severity (CRITICAL/WARNING/OBSERVATION), Impact (LOW/MEDIUM/HIGH — decision effort, orthogonal to severity), Dimension (Plan Adherence/Scope Discipline/Safety & Quality/Architecture/Pattern Consistency/Success Criteria), Title, Location (`file:line`), Detail, Fix options.

LOW impact: `Fix: [one line]`. MEDIUM/HIGH impact: each option carries `[approach] · Strength: [...] · Tradeoff: [...] · Confidence: HIGH|MED|LOW — [why] · Blind spot: [...]`. Offer two options only for a genuine tradeoff, mark one `⭐ Recommended`.

Dimension verdicts (PASS/WARNING/FAIL): Plan Adherence (FAIL on MISSING/major DRIFT), Scope Discipline (WARNING on benign EXTRA), Safety & Quality (FAIL on any CRITICAL), Architecture (FAIL on violations), Pattern Consistency (WARNING on minor inconsistencies), Success Criteria (FAIL on automated failures).

Overall verdict: APPROVED (all PASS, or ≤2 minor warnings) / NEEDS ATTENTION (multiple warnings or 1 non-critical FAIL) / REJECTED (any critical FAIL).

Sort CRITICAL → WARNING → OBSERVATION, cap at 10 (consolidate if more). Print the box-drawing report format (verdicts table, then findings grouped by severity — omit empty groups). Always pair icons with a word.

Then ask (numbered text): "Review complete. 1. Triage findings 2. Save report & triage later 3. Save report only."

### Saving the report

Save to `context/changes/<change-id>/reviews/impl-review.md` (or `impl-review-phase-N.md`). Update `change.md`: `status: impl_reviewed`, `updated: <today>`. Use the `<!-- IMPL-REVIEW-REPORT -->` marker with per-finding `- **Decision**: PENDING` fields — this enables resume mode. If triaging now, queue "fix in plan/code" follow-ups into `context/changes/<change-id>/follow-ups/review-fixes.md`.

## Step 5: Interactive triage

Resume mode: read the saved file, filter findings to `Decision: PENDING`; if none, report "All findings triaged" and stop.

Walk findings in severity order. For each, present as numbered text mirroring the finding's fields (title/severity/impact/dimension/location/detail/fix options), then ask:

- 2-option findings: "1. Apply Fix A ⭐ 2. Apply Fix B 3. Skip 4. Record as lesson"
- 1-option findings: "1. Fix now 2. Fix differently 3. Skip 4. Record as lesson"

**Apply/Fix now**: show the before/after change, brief confirm, edit, mark FIXED. **Fix differently**: ask the preferred approach, apply, mark FIXED. **Record as lesson**: pre-fill Context/Problem from the finding, leave Rule/Applies-to for the user, show the full proposed entry, confirm via numbered text (approve/edit/cancel), append to `context/foundation/lessons.md` (create with the canonical header if absent). Always follow up: "Lesson saved. Also apply the fix now? 1. Yes 2. No — lesson only" — never decide this for the user. **Skip**: mark SKIPPED, move on. **Free text**: interpret intent (fix differently / accept risk / dismiss).

Update the saved file's `Decision:` field after each choice. Print the triage-complete summary (Fixed/Rule/Skipped/Accepted counts).

## Guidelines

Default to analyzing and reporting — edit only during triage on explicit user choice. Be specific (`file:line` + concrete evidence, never "there might be an issue"). Don't flag style preferences that don't matter. Flag plan-itself flaws too, not just implementation drift. Impact is decision effort, not severity — a CRITICAL with an obvious one-line fix is LOW impact. Two fix options only for genuine tradeoffs. When fixing, make minimal targeted edits — don't refactor unflagged code.

## Copilot substitution notes

- `AskUserQuestion` → numbered text at input resolution, post-report choice, and every triage step.
- Parallel Pass 1/Pass 2 sub-agents → sequential passes within the current turn.
- `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet` → dropped.
- No clipboard copy needed — this skill doesn't hand off to another command by default.
