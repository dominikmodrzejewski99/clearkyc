---
description: Drive an approved plan to completion phase by phase, test-first (red-green-refactor), for phases whose implementation doesn't exist yet
mode: agent
tools: ['edit', 'search', 'runCommands']
---

# /ai-tdd — Test-First Plan Execution

Drive `context/changes/<change-id>/plan.md` to completion one phase at a time, test-first: RED (failing test) → GREEN (minimal code) → REFACTOR (clean up, stay green). This is the test-first sibling of `/ai-implement` — same plan, same `## Progress` section, same commit ritual; only the ordering differs (test before code). Assumes test infrastructure already exists — does not set up runners, configs, or CI. Because both skills share `## Progress`, phases can be interleaved between `/ai-tdd` and `/ai-implement` freely.

> See `.github/prompts/README.md` for shared conventions.

## What this assumes / won't do

Runner + single-file invocation + conventions already exist (discovered, not installed). Production implementation for the phase must be **absent** — if it already exists, stop; don't write retroactive tests, redirect to `/ai-implement`. Not every phase is TDD'able (scaffolding, infra wiring, visual polish, docs are not).

## Setup

1. Resolve the plan: `/ai-tdd <change-id> [phase N]` → `context/changes/<change-id>/plan.md`. Refuse if the path starts with `context/archive/`. If nothing given, print the usage message and wait.
2. Read the plan completely; `## Progress` is authoritative for state.
3. Read `context/foundation/lessons.md` if present.
4. Confirm test infrastructure: read `context/foundation/test-stack.md` if present, else a quick scan (one `*.test.*`/`*.spec.*` glob + read one example) for runner, conventions, and single-file run command. If none exists at all, stop and tell the user to set one up first (or use `/ai-implement` without test-first).
5. Update `change.md`: `status: implementing` if currently `planned`/`plan_reviewed`, `updated: <today>`.
6. Find the starting point: first `- [ ]` in `## Progress` (or under the requested `### Phase N:`).

## The TDD eligibility gate — run before every phase

**1. Existing-implementation stop.** Quick focused search for the phase's files/symbols/endpoints. If implementation already exists (fully or partially), STOP — print the evidence, state `/ai-implement <change-id> phase [N]` plainly as the redirect, and don't touch Progress rows.

**2. TDD-ability check.** A phase is eligible only when there's an observable outcome assertable before the code exists. TDD'able: pure functions/transforms/parsers/validators, state machines, API contract shapes, business logic with clear I/O, integration flows across mockable boundaries, bug fixes. Not TDD'able: scaffolding/config/manifest edits, CI/infra wiring, visual polish with no assertion path, exploratory spikes, docs, tautological glue tests.

Clearly TDD'able → proceed to the loop. Clearly not → redirect (below). Mixed/ambiguous → ask (numbered text): "1. TDD the testable part (Recommended) 2. Redirect whole phase to /ai-implement 3. TDD the whole phase anyway."

**Redirect**: state why in 1-2 sentences, then ask (numbered text): "1. Hand off to /ai-implement (Recommended) — state /ai-implement <change-id> phase N and stop, resume TDD after. 2. Implement inline here (no test-first) — build directly, run success criteria, fall into the phase-end ritual with a plain feat/chore/refactor commit subject, no RED framing. 3. Skip — already done — flip Progress rows with no SHA."

## The Red-Green-Refactor cycle

Work behavior by behavior, one `#### Automated` step per loop. Budget 2-5 focused tests per phase — not exhaustive coverage.

**RED**: write one test (or tight cluster) for the next behavior, following discovered conventions. Name for outcome, not mechanism. Run just that file, confirm it fails for the right reason (assertion failure or missing implementation, never a syntax/import error). Never `it.skip()`/`xit()` to fake a pass.

**GREEN**: write the smallest production code that passes. Don't build ahead of the test. Re-run, confirm green; fix code (not tests) if anything else broke.

**REFACTOR**: with the test green, clean up names/duplication/types without changing behavior. Re-run after each change.

Then flip that step's Progress row `[ ]` → `[x]` (no SHA yet) and loop to RED for the next behavior. Repeat until every `#### Automated` row in the phase is `[x]` and success criteria hold.

## Phase completion

**Hard invariant — commit only on green.** Never commit while any in-scope test is red or skipped.

Maintain a touched-file set (tests + production code + `plan.md`, seeded on the first phase with any dirty files in `context/changes/<change-id>/`). Resets each phase boundary.

1. Run the full suite, confirm green.
2. Manual confirmation gate — present the same format as `/ai-implement`'s (automated verification passed / manual items to perform), pause for confirmation.
3. `git status --porcelain` intersected with paths outside the touched set — if non-empty, ask (numbered text) whether to stage only the planned set (Recommended), stage all, or abort.
4. `git add <file> <file> ...` explicitly — never `-A`/`.`.
5. `git diff --cached --quiet` — if empty, print "no diff to commit", set SHA empty, skip to step 8.
6. Draft Conventional-Commits subject `test(<change-id>): <phase title> (p<N>)` (prefer `test`/`feat`, mention test-first nature in body), approve via numbered text (approve / edit subject / override).
7. Commit via heredoc — never `--no-verify`/`--amend`. Fix and re-commit on hook failure.
8. `git rev-parse --short HEAD` → SHA, write back into every flipped Progress row this phase.
9. Update `change.md`: `updated: <today>`, keep `status: implementing` until the final phase.
10. Reset the touched-file set.

**Next-phase decision** (numbered text): "1. Continue to Phase [N+1] 2. Clear context first — resume with /ai-tdd <change-id> phase [N+1] 3. Review this phase first — run /ai-impl-review."

## State tracking

`## Progress` in `plan.md` is the single source of truth — no state file. First `- [ ]` = next step; its `### Phase N:` = current phase; completion = `count([x]) / count([ ]+[x])`.

## After all phases

Defensive straggler scan → if clean, update `change.md` (`status: implemented`, `updated: <today>`), epilogue commit (`plan.md` + `change.md` only, subject `chore(<change-id>): close out plan (epilogue)`, no self-SHA-writeback), print completion summary, offer `/ai-impl-review <change-id>` or skip.

## Guidelines

Good tests describe **what**, not **how**; fail for the right reason; are stable across refactors; are minimal. Avoid testing internals, over-mocking the thing under test, snapshot tests for business logic, near-duplicate tests, and building code ahead of a failing test.

If a phase's acceptance criteria are vague, check Desired End State / Changes Required for concrete I/O before guessing; if still unclear, ask one focused question. If a phase can't be implemented as written, present the mismatch (Expected/Found/Why this matters) and ask (numbered text): "1. Adapt and continue 2. Skip this part 3. Stop and re-plan."

File placement defaults: unit tests next to source (`src/[module]/thing.test.ts`), integration in `tests/`, E2E in the project's e2e dir.

## Copilot substitution notes

- `AskUserQuestion` → numbered text throughout (eligibility gate, redirect, dirty-path, commit-message approval, next-phase decision, mismatch handling).
- `Task` sub-agents → sequential search/read in the current turn if stuck.
- `TaskCreate`/`TaskUpdate`/`TaskList` → dropped; Progress is the only state.
- No clipboard copy — state resume commands plainly.
