---
description: Implement technical plans from context/changes/<change-id>/plan.md with verification
mode: agent
tools: ['edit', 'search', 'runCommands']
---

# /ai-implement — Implement Plan

Implement an approved plan from `context/changes/<change-id>/plan.md`, phase by phase, with automated + manual verification and a commit ritual per phase.

> See `.github/prompts/README.md` for the shared frontmatter/substitution conventions this file follows.

## Initial setup

1. Resolve the plan: `/ai-implement <change-id> [phase N]` → `context/changes/<change-id>/plan.md`. A full path is also accepted.
2. Refuse if the resolved path starts with `context/archive/`: print "This change is archived. Open a new change with /ai-new instead." and stop.
3. If nothing was provided, reply:

```
I'll help you implement an approved technical plan. Please provide:
1. A change-id (e.g., "oauth-login phase 1"), or
2. A full path (e.g., context/changes/oauth-login/plan.md).

You can list active changes with: ls context/changes/
```

and wait.

## Getting started

- Read the plan completely. The `## Progress` section at the bottom is authoritative for execution state — checkmarks live ONLY there. Phase blocks use plain `- ` bullets, no checkboxes.
- Read `context/foundation/lessons.md` if present and internalize every entry before starting any phase.
- Read all files the plan references (research, frame, source files in the same change folder) fully — never with a line limit.
- Update `change.md`: set `status: implementing` (only if currently `planned` or `plan_reviewed`) and `updated: <today>`.
- Find the next pending step: scan `## Progress` for the first `- [ ]` line in document order. If a `phase N` argument was given, jump to the first `- [ ]` inside `### Phase N:` instead.
- Start implementing once you understand what's needed.

## Implementation philosophy

Follow the plan's intent while adapting to what you actually find. Implement each phase fully before moving to the next. If something doesn't match the plan:

1. STOP and think about why.
2. Present the issue as text:

```
Issue in Phase [N]:
Expected: [what the plan says]
Found: [actual situation]
Why this matters: [explanation]
```

3. Ask (numbered text, not AskUserQuestion):

```
How should I handle this mismatch?
1. Adapt and continue — adjust the implementation to match reality (explain the adaptation).
2. Skip this part — this change isn't needed.
3. Stop and re-plan — this mismatch is too significant, update the plan first.
```

Wait for the reply before proceeding.

## Tracking files touched during a phase

Maintain a touched-file set for the current phase: every file you `Edit`/`Write` goes in it. `plan.md` is always in the set (every phase edits its `## Progress` section). The set resets at each phase boundary, right after that phase's commit lands.

## Verification approach

After implementing a phase:

1. Run the success-criteria checks from the plan (usually the project's standard test/lint/typecheck commands). Fix issues before proceeding.
2. Flip Progress checkboxes for automated items as they pass: find `- [ ] N.M <title>`, replace with `- [x] N.M <title>`. **Do not check off manual items until the user confirms them.**
3. **Manual confirmation gate** — present:

```
Phase [N] Complete - Ready for Manual Verification

Automated verification passed:
- [list automated checks that passed]

Please perform the manual verification steps listed in the plan:
- [list manual verification items]

Let me know when manual testing is complete so I can proceed to the commit step.
```

Pause here. Do not commit until the user confirms.

4. **Phase-end commit ritual**, once manual testing is confirmed:
   1. Flip the manual Progress checkboxes now that they're confirmed.
   2. Run `git status --porcelain` and intersect with paths outside this phase's touched-file set. If non-empty, present the dirty paths and ask (numbered text):

      ```
      <N> unrelated path(s) are dirty. How should I handle them?
      1. Continue — stage only the planned set (Recommended): commit only files this phase touched.
      2. Stage all — add the unrelated paths too, you take responsibility for the broader scope.
      3. Abort — stop the phase commit, resolve the dirty paths first.
      ```

      If the dirty-but-untouched set is empty, skip this question.
   3. Stage explicitly by path (`git add <file> <file> ...`). Never `git add -A` or `git add .`.
   4. Check `git diff --cached --quiet`. If exit code 0 (empty diff), print `Phase [N] had no diff to commit; rows remain SHA-less.` and skip to step 7.
   5. Draft a Conventional-Commits message (`<type>(<change-id>): <phase title> (p<N>)`, short body listing touched files, `Refs:` line if the user gave tracking references). Ask (numbered text):

      ```
      Approve commit message?
      1. Approve as proposed (Recommended)
      2. Edit subject line
      3. Override entirely
      ```
   6. Commit via heredoc, per standard git-safety rules: never `--no-verify`, `--amend`, or signing-bypass flags. If a pre-commit hook fails, fix the issue and create a NEW commit — the original commit didn't happen.
   7. Capture the short SHA (`git rev-parse --short HEAD`), unless step 4 set it to empty.
   8. Write the SHA back into every Progress row flipped this phase: `- [x] N.M <title>` → `- [x] N.M <title> — <SHA>`.
   9. Update `change.md`: `updated: <today>`, keep `status: implementing` (idempotent until the final phase; on the final phase set `status: implemented` after the SHA write-back).
   10. Reset the touched-file set.

5. **Next-phase decision** — if there's a next phase, ask (numbered text):

   ```
   Phase [N] complete. How to proceed?
   1. Continue to Phase [N+1] — stay in this context.
   2. Clear context first — I'll give you the resume command.
   3. Review this phase first — run /ai-impl-review before proceeding.
   ```

   - "Review": suggest running `/ai-impl-review <change-id> phase [N]`, then re-present this choice without the review option.
   - "Continue": proceed directly — read the next phase, implement it. No need to re-read the whole plan.
   - "Clear": print `/ai-implement <change-id> phase [next-phase-number]` as the resume command (no clipboard support in Copilot Chat).

   If instructed to run multiple phases consecutively, skip this question between them.

## State tracking

The `## Progress` section in `plan.md` is the single source of truth — no state file, no comment markers. Parse it to answer "where am I?": the first `- [ ]` is the next step, the `### Phase N:` heading above it is the current phase, completion is `count([x]) / count([ ]+[x])`.

## After all phases

When every `- [ ]` in `## Progress` is `[x]`:

1. If any items are still pending (shouldn't happen at this point, but double-check), ask (numbered text):

   ```
   <N> Progress item(s) still pending. How to proceed?
   1. Pause (Recommended) — stop without flipping change.md.status, address stragglers, then re-enter.
   2. Proceed to epilogue — flip status anyway; stragglers surface later as warnings.
   ```

   On "Pause": stop immediately, don't touch `change.md`, don't run the epilogue commit.

2. Update `change.md`: `status: implemented`, `updated: <today>`. Do not set `archived_at` — that belongs to a separate archive step.
3. Stage exactly `context/changes/<change-id>/plan.md` and `context/changes/<change-id>/change.md` (explicit paths). If `git diff --cached --quiet` is empty, skip the epilogue.
4. Commit via heredoc, same rules as above (never `--no-verify`/`--amend`).
5. Present:

```
All phases implemented!

Summary:
- Phases completed: [N]
- Files changed: [list key files]
```

Then ask:

```
Plan complete. Would you like a final implementation review?
1. Run full review (/ai-impl-review <change-id>)
2. Skip review — I'm satisfied
```

## If you get stuck

Make sure you've read and understood all relevant code first. Consider whether the codebase evolved since the plan was written. Present the mismatch clearly and ask for guidance rather than guessing.

## Resuming work

If `## Progress` already has `[x]` marks: trust that completed work is done, pick up from the first `- [ ]`, and only re-verify prior work if something looks off.

## Copilot substitution notes

- `AskUserQuestion` → numbered text questions throughout (mismatch handling, dirty-path handling, commit-message approval, next-phase decision, stragglers), waiting for the user's chat reply each time.
- `Task`/parallel sub-agents → not used in normal flow; if stuck, do sequential search/read within the current turn instead of spawning agents.
- `TaskCreate`/`TaskUpdate` per-phase status-bar tracking → dropped; `## Progress` in `plan.md` is the only state that matters.
- No clipboard copy for resume commands — state them plainly.
