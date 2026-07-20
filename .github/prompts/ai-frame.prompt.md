---
description: Challenge framing assumptions about WHAT to build before planning HOW, separating observation from stated cause
mode: agent
tools: ['edit', 'search', 'runCommands']
---

# /ai-frame — Challenge the Framing Before Planning

Separate **observation** (the literal effect, or the scope/design question as stated) from **stated cause** (the user's theory) and from **proposed direction** (what they want to do), before any planning begins. `/ai-plan` answers *how*; `/ai-frame` answers *what's actually the right thing to plan*.

> See `.github/prompts/README.md` for shared conventions.

## When to use / skip

Use for bug-shaped ("X is broken, build Y"), scope-shaped ("split into two plans?"), design-shaped ("which approach?"), or assumption-shaped ("we're assuming X — true?") input. Skip for pure mechanical changes or when the user has already verified the framing themselves.

## Initial response

- File path/change-id given → resolve `context/changes/<id>/research.md` if present, read fully, proceed to Step 1.
- Problem description given inline → proceed to Step 1.
- Nothing given → reply:

```
I'll help you check whether you're framing the right problem before planning a solution.

Please share:
1. The observation — what's happening, what scope you're considering?
2. Your initial framing — what you think is causing it, or your approach?
3. (Optional) related research, prior incidents, files I should read

Tip: /ai-frame context/changes/<change-id>/research.md (or just the change-id)
```

Then wait.

## Process

### Step 1: Capture — keep observation and stated cause SEPARATE

Read `context/foundation/lessons.md` if present. Read every file the user mentioned, fully. Extract three things distinctly: **reported observation** (literal effect, no cause, no fix), **user's stated cause/approach**, **user's proposed direction**. Echo back as three bullets and confirm the framing is locked — even if the user pushes back, don't collapse the observation into the framing.

### Step 1.5: Clarifying questions before dispatch

Always run one round of 2-3 numbered-text questions to disambiguate observation/scope only — never causes or fixes. Always include "Not sure / haven't separated them yet". Capture answers as "Pre-dispatch narrowing" alongside Step 1's record.

### Step 2: Map the dimensions

Read the files mentioned and their neighbors; trace the path from stated cause to observed effect. Build a map of 3-5 plausible dimensions (only ones with actual evidence they could produce the observation) — for a large/unfamiliar surface, do sequential Explore-style searches (Copilot substitution) rather than parallel sub-agents. Present the map as text, marking which dimension the user's framing lands on.

### Step 3: Investigate each hypothesis

For each dimension: "if the framing broke here, what evidence would we expect, and does it exist?" Do these searches sequentially in this turn (Copilot substitution for parallel Task spawning). Synthesize strong/weak/no evidence per hypothesis.

### Step 4: Narrowing questions (Socratic, not solution)

2-5 numbered-text questions where options describe **observations or design positions**, never causes/fixes/solutions. Always include "I'm not sure / haven't checked". If Step 3 evidence is already conclusive, skip questioning and say so explicitly.

### Step 5: Cross-system check

Pressure-test the leading hypothesis from a different angle: an independent search that doesn't name the hypothesis, a check of `context/changes/**/` and `context/archive/**/` for prior occurrences, checking the inverse (what should NOT be visible if true), and a sanity-check against the original framing. If it surfaces a credible alternative, stop and re-run Step 3.

### Step 6: Synthesize the Frame Brief

Resolve/create `context/changes/<change-id>/` (mirror `/ai-new` semantics if new). Refuse if the path starts with `context/archive/`. Update `change.md`: `updated: <today>`, advance `status: preparing` only if currently `new`. Write `context/changes/<change-id>/frame.md` using this template:

```markdown
# Frame Brief: [Topic]

## Reported Observation
[literal effect / scope-design question, verbatim from Step 1]

## Initial Framing (preserved)
- **User's stated cause or approach**: [...]
- **User's proposed direction**: [...]
- **Pre-dispatch narrowing**: [from Step 1.5]

## Dimension Map
1. **[Dimension A]** — [...]
2. **[Dimension B]** — [...]  ← initial framing

## Hypothesis Investigation
| Hypothesis | Evidence | Verdict |
|---|---|---|
| [A] | [file:line / evidence] | STRONG/WEAK/NONE |

## Narrowing Signals
- [...]

## Cross-System Convention
[...]

## Reframed (or Confirmed) Problem Statement
> **The actual problem to plan around is**: [one sentence]
[2-3 sentences why. If original framing held, say so explicitly.]

## Confidence
HIGH | MEDIUM | LOW [+ verification step if LOW]

## What Changes for /ai-plan
[1-2 sentences]

## References
- Source files: [file:line]
- Related research: context/changes/<change-id>/research.md (if present)
```

Keep it ~80-150 lines.

### Step 7: Present and hand off

Print a one-screen summary, then ask (numbered text): "1. Hand off to /ai-plan 2. Reproduce/verify first 3. Discuss before planning 4. Stop here." On (1), state `/ai-plan <change-id>` plainly (no clipboard).

## Critical guardrails

"The framing was right" is a valid, successful outcome — don't manufacture a reframe. Observation and stated cause stay separate throughout, even in the final brief. No solution design here — that's `/ai-plan`'s job. Narrowing questions never propose fixes. Read source material before reaching for training-data priors; every claim needs file:line or document:section evidence. No hypothesis padding — investigate only plausible dimensions. Time-box to 2-4 search rounds and 2-5 questions.

## Copilot substitution notes

- `AskUserQuestion` → numbered text questions at Steps 1.5, 4, and 7, waiting for the reply each time.
- Parallel Explore/general-purpose sub-agents (Steps 2, 3, 5) → sequential search/read within the current turn.
- `TaskCreate` → dropped; the Frame Brief's Hypothesis Investigation table is the record.
- No clipboard copy — state the next command plainly.
