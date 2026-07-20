---
description: Drive an approved plan's browser-level E2E phases against the running app, one risk at a time — plan, generate, review, verify
mode: agent
tools: ['edit', 'search', 'runCommands']
---

# /ai-e2e — Risk-Driven E2E Plan Execution

Drive `context/changes/<change-id>/plan.md`'s browser-level phases with the loop **PLAN → GENERATE → REVIEW → VERIFY**, one risk at a time, one reviewed test per risk. Sibling of `/ai-implement`/`/ai-tdd`, sharing the same plan, `## Progress`, and commit ritual. Only drives risks that genuinely need a browser and whose feature is already built; redirects the rest.

> See `.github/prompts/README.md` for shared conventions. This skill assumes VS Code Copilot's own Playwright/browser tooling in place of the Claude Code `mcp__playwright__*` tools referenced in the source skill — substitute whatever browser-automation surface Copilot exposes, or fall back to the prompt-template path (no live browser) if none is available.

Also runs **standalone**: `/ai-e2e <risk-id>` (or no argument) reads `context/foundation/test-plan.md`, picks the top browser-level risk, produces one reviewed, break-verified test, then stops — no change folder, no Progress, no commit ritual.

## What this assumes / won't do

Playwright config + a way to run a single spec + auth pattern + app-start mechanism already exist (discovered, not installed). The feature under test must already be **built** — unlike `/ai-tdd`, E2E drives a running app. Creates the two quality levers (`seed.spec.ts`, E2E rules file) once per project if missing, from `.claude/skills/ai-e2e/references/seed-test-pattern.md` and `references/e2e-quality-rules.md`. Drives one reviewed test per risk, not a coverage sweep.

## Setup (plan-driven only — standalone skips straight to the gate)

1. Resolve the plan: `/ai-e2e <change-id> [phase N]`. Refuse if under `context/archive/`. If nothing given, print usage and wait.
2. Read the plan fully; note which phases trace to a browser-level `test-plan.md` risk.
3. Read `context/foundation/test-plan.md` if present (the risk map).
4. Read `context/foundation/lessons.md` if present.
5. Confirm Playwright config + single-spec command + auth setup + app-start mechanism exist (quick glob + read). If no config/specs at all, stop and tell the user to install Playwright first, or use `/ai-tdd`/`/ai-implement`.
6. Ensure `seed.spec.ts` and the E2E rules file exist; create from the referenced templates if missing, adapted to this app's real routes/roles. Add both to the first phase's touched-file set.
7. Update `change.md`: `status: implementing` if currently `planned`/`plan_reviewed`, `updated: <today>`.
8. Find the starting point: first `- [ ]` in `## Progress`.

## The E2E eligibility gate — before every phase (plan-driven) / once (standalone)

**1. Browser-level fit.** Needs E2E only if the risk crosses several boundaries (auth/routing/API/DB) or exists only in rendered UI. A single endpoint contract or pure function belongs in `/ai-tdd`/`/ai-implement` instead.

**2. Feature presence.** If the feature isn't built yet, STOP — print the missing evidence, state `/ai-implement <change-id> phase [N]` plainly, and don't touch Progress.

**3. Test absence.** If a passing spec for this risk already exists, mark the row and move on. If a spec exists but is failing, that's a debugging job — don't regenerate or silently "heal" it.

All three hold → proceed to PLAN. Clearly not browser-level → redirect (below). Mixed → ask (numbered text): "1. E2E the browser-level part (Recommended) 2. Redirect whole phase to /ai-tdd 3. E2E the whole phase anyway."

**Redirect**: state why in 1-2 sentences, ask (numbered text): "1. Hand off to /ai-tdd (Recommended) 2. Hand off to /ai-implement 3. E2E inline here anyway 4. Skip — already done." On hand-off, state the resume command plainly and stop.

## The Plan → Generate → Review → Verify cycle

One risk per loop. Budget: typically one test per risk, rarely more than 1-3 per phase.

**PLAN**: state the contract — one browser-level risk in, one reviewed test that fails when the risk materializes out. Pull the risk's observable business outcome from `test-plan.md` or the phase's Success Criteria (standalone: ask the user first if no `test-plan.md`). Prefer a **browser-driven** path when live-browser tooling is available: navigate the running app, use its accessibility snapshot (not screenshots), map the happy path plus the risk's edge/error case, modeled on `seed.spec.ts`. Otherwise use the **prompt-template** path: fill `.claude/skills/ai-e2e/references/e2e-prompt-template.md` with the risk, anchor, scenario, and real-vs-mocked boundaries. Separate real (auth/routing/DB stay real) from mocked (expensive/non-deterministic external APIs, mocked at the network layer — note server-side calls need server-side mocking, not `page.route()`).

**GENERATE**: follow the seed/rules conventions without restating them — role-based locators, independently runnable (own setup/action/assertion/cleanup), wait for state not time, auth without the UI, unique test data, a name that binds to the risk. One test per file in the project's e2e dir (default `tests/e2e/<feature>.spec.ts`).

**REVIEW**: check against the five anti-patterns from `.claude/skills/ai-e2e/references/e2e-anti-patterns.md` (hallucinated assertion, brittle selector, shared state, wait-for-time, no cleanup). Re-prompt by name for any found — what's wrong, why it doesn't protect the risk, what replaces it. Never just "fix this test."

**VERIFY**: run the spec against the running app, confirm it passes. Then the **control question** — would this fail if the risk came true? Do a deliberate break (invert/weaken the targeted behavior), re-run, confirm red, then **revert immediately** — never commit a deliberate break. Flip the Progress row `[ ]` → `[x]` (no SHA yet). Loop to PLAN for the next risk.

Standalone run: after VERIFY, stop and report the spec + risk protected — skip everything below.

## Phase completion (plan-driven only)

**Hard invariant — commit only on green**, with any deliberate break reverted first.

Maintain a touched-file set (specs, prompt files, first-phase seed+rules, always `plan.md`). Resets each phase boundary.

1. Run the phase's new spec(s) against the running app, confirm green.
2. Manual confirmation gate (same format as `/ai-implement`, plus the deliberate-break result), pause for confirmation.
3. `git status --porcelain` intersected with untouched paths — ask (numbered text) if non-empty.
4. `git add <file> ...` explicitly.
5. Empty-diff check — skip to step 8 if clean.
6. Draft subject `test(<change-id>): <phase title> (p<N>)`, mention the E2E/risk nature in body, approve via numbered text.
7. Commit via heredoc — never `--no-verify`/`--amend`.
8. Capture SHA, write back into flipped Progress rows.
9. Update `change.md`.
10. Reset touched-file set.

**Next-phase decision** (numbered text): "1. Continue to Phase [N+1] 2. Clear context first 3. Review this phase first (/ai-impl-review)."

## State tracking (plan-driven only)

Same as `/ai-implement`/`/ai-tdd` — `## Progress` is the sole source of truth.

## After all phases (plan-driven only)

Same epilogue pattern as `/ai-tdd`: straggler scan, `change.md` status `implemented`, epilogue commit (`plan.md`+`change.md` only), completion summary, offer `/ai-impl-review` or skip.

## Guidelines

Observable user outcome across real boundaries, confirmed failing on the deliberate break — not assumed. Role-based locators, self-contained, waits for state. Protect the named risk, not surface area — no per-page/per-button tests, no over-mocking internal boundaries. Vision/screenshot tools are a supplement for visual-only risks, not the default. Auto-healing tools help on selector/timing drift (route through review) but must never mask a changed business behavior.

## Copilot substitution notes

- `AskUserQuestion` → numbered text throughout (eligibility gate, redirect, dirty-path, commit approval, next-phase decision).
- `Task` sub-agents (if stuck) → sequential search/read in the current turn.
- `TaskCreate`/`TaskUpdate`/`TaskList` → dropped.
- `mcp__playwright__*` tools → substitute Copilot's own browser-automation surface if present, else use the prompt-template (no-live-browser) path exclusively.
- No clipboard copy — state resume commands plainly.
