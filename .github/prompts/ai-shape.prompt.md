---
description: Facilitate a structured discovery conversation (greenfield or brownfield) that turns an idea into shape-notes.md, the input to /ai-prd
mode: agent
tools: ['edit', 'search', 'runCommands']
---

# /ai-shape — Facilitate Discovery Before /ai-prd

Walk the user from "I have an idea" (greenfield) or "I want to change this system" (brownfield) to a structured `context/foundation/shape-notes.md` that `/ai-prd` turns into a schema-conformant PRD. This is a **facilitator**, not a content generator: never write vision, FRs, or business rules the user did not say. Its value is question shape and order.

> See `.github/prompts/README.md` for shared conventions. The locked PRD schema lives at `.claude/skills/ai-shape/references/prd-schema.md` — read it before writing any artifact.

## When to use / skip

Use for a new project idea, a meaningful brownfield change (new module, significant feature, architectural change), or resuming an incomplete `shape-notes.md`. Skip when a PRD/ADR already exists (`/ai-frame` or `/ai-plan` instead) or the task is a small bug/refactor that doesn't warrant a PRD (`/ai-frame`).

## Initial response

- Freeform idea given inline → capture verbatim as the seed idea, proceed to Step 0.
- File path given → read fully, use as seed, proceed to Step 0.
- Nothing given → reply:

```
I'll help you shape an idea into structured notes that /ai-prd can turn into a
real PRD — greenfield (from scratch) or brownfield (change to an existing system).

Please share:
1. The seed idea — what do you want to build or change?
2. (Optional) rough notes, sketches, or links I should read

Tip: /ai-shape a recipe app that uses fridge contents
     /ai-shape add a recommendation engine to my recipe app
```

Then wait.

## Process

### Step 0: 10xWorkflow precondition

`test -d context/foundation`. If missing, ask (numbered text): "context/foundation/ is missing. Run /ai-init now? 1. Yes (Recommended) 2. No — stop." On yes, run the `/ai-init` equivalent scaffolding steps yourself (create `context/{changes,archive,foundation}` with READMEs) then continue.

### Step 0.5: Resume detection

`test -f context/foundation/shape-notes.md`. If present, read fully, parse the `checkpoint:` frontmatter (`current_phase`, `phases_completed`, `frs_drafted`, `quality_check_status`). Summarize what was found, then ask (numbered text): "1. Resume from Phase [next] (Recommended) 2. Restart from scratch (archive existing to context/foundation/archive/shape-notes-<timestamp>.md) 3. Cancel." On resume, jump to the next unfinished phase and summarize completed phases in 1-2 sentences each — never replay them.

### Step 0.7: Context-type detection

Score cwd: Tier 1 (git history) or Tier 2 (lockfile) → brownfield; Tier 3 only (manifest, no lockfile/git) → ambiguous, propose brownfield with a caveat; no signals → greenfield. Print the detected signals, then ask (numbered text): "Detected: [greenfield|brownfield]. Correct? 1. Yes (Recommended) 2. Override to [other]." Write confirmed `context_type` into shape-notes.md frontmatter immediately — it's load-bearing for `/ai-prd`'s routing. On resume, skip if `context_type:` already present.

### Discovery pattern (Steps 1-6)

Every phase: open with one line on what it produces + one open question → surface 3-5 gray areas as a numbered-text question (mirror AskUserQuestion's multi-select via "reply with one or more numbers") with one option marked "(Recommended)" first, always include "Not sure / haven't decided" → lock the decision back as a one-line summary the user confirms → write the section(s) to `shape-notes.md`, bump `checkpoint.current_phase`/`phases_completed`.

Hard rules: never invent content the user hasn't said (exception: mechanical FR numbering/headings/frontmatter); never pre-commit to a stack (framework/DB/hosting/language) — PRD captures only `product_type`/`target_scale`/`timeline_budget`; never use 10xDevs/cohort language in shipped output.

- **Step 1 — Vision & problem**: greenfield opens "who has the pain, what's the moment, what does it cost today?"; brownfield opens "what exists today, who uses it, what's the pain/gap driving this change?". Echo back components separately, challenge vague answers Socratically. Produces `## Vision & Problem Statement` + `## User & Persona` (+ `## Current System` for brownfield).
- **Step 2 — Access control**: how does the persona get in (login/local profile/access key/none)? Brownfield: describe current auth, ask if it's changing. Produces `## Access Control`.
- **Step 3 — MVP discipline**: sketch the smallest end-to-end flow (greenfield) or smallest incremental delta (brownfield); scope-cost surface if >6 actions or >3 weeks after-hours — offer scope-down vs. commit-to-longer-timeline with explicit acknowledgment recorded. Produces `## Success Criteria` (Primary/Secondary/Guardrails) + `timeline_budget`.
- **Step 4 — FRs & user stories**: capture `- FR-NNN: [Actor] can [capability]. Priority: must-have|nice-to-have` (brownfield adds `Change: new|modified|preserved`). Group thematically if >6. Translate the primary flow into `### US-01:` Given/When/Then.
- **Step 4.5 — Socrates round**: exactly one challenge question per FR, numbered-text with 2-4 counter-argument options plus "No counter-argument; it stands" last. Capture each as a `> Socrates:` blockquote under its FR.
- **Step 5 — Business logic & NFRs**: one-sentence domain rule; detect empty-CRUD anti-pattern and surface rule-shape options (recommendation/prioritization/classification/validation/scoring/workflow/calculation) if none found. Brownfield also captures `## Constraints & Preserved Behavior`. Then NFRs as outside-observable properties (no mechanism/runtime-location leakage).
- **Step 6 — Product framing**: three short framing questions one at a time (product_type, target_scale, timeline hard-deadline/after-hours) in plain language — never print field names. Then a Non-Goals multi-select round (functional + non-functional scope avoids, not tech avoids). Tech avoids go to `## Forward: tech-stack` (not `## Non-Goals`).

### Step 7: Closing soft-gate cross-check

Check presence of: Access Control, Business Logic (one-sentence rule), project artifacts, timeline-cost acknowledgment, Non-Goals, and (brownfield only) Preserved behavior. Print a table marking present/missing with one-line consequences. Ask (numbered text): "1. Address gaps now 2. Accept and finish 3. Restart phase [N]." On accept, set `checkpoint.quality_check_status: warned|accepted` and append a `## Quality cross-check` section.

### Step 8: Hand off

Confirm `quality_check_status` isn't `pending`, bump `updated:`, re-validate against the schema. Print completion summary and state (no clipboard): `Next: /ai-prd`. Stop — do not chain automatically.

## Critical guardrails

Facilitator not generator; schema is the contract (re-check every write); never commit to stack choices; name anti-patterns explicitly, don't generically warn; soft gate only (warn, allow override); mode-aware (greenfield vs brownfield) throughout; no 10xDevs language in output; on resume, summarize completed phases, never replay.

## Copilot substitution notes

- `AskUserQuestion` (including multi-select) → numbered text questions, "reply with one or more numbers" for multi-select, waiting for the user's chat reply each time.
- No `/ai-init` `Skill`-tool delegation — perform the scaffold steps inline in Step 0.
- `TaskCreate`/`TaskUpdate` → dropped; `shape-notes.md`'s own checkpoint frontmatter is the state.
- No clipboard copy — state `/ai-prd` plainly.
