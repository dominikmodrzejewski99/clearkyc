---
description: Create a detailed implementation plan through interactive, iterative questioning
mode: agent
tools: ['edit', 'search', 'runCommands']
---

# /ai-plan — Implementation Plan

Create a detailed implementation plan through an interactive, iterative process. Be skeptical, thorough, and collaborative — produce a high-quality technical specification.

> See `.github/prompts/README.md` for the shared frontmatter/substitution conventions this file follows.

## Initial response

If no parameters given, reply:

```
I'll help you create a detailed implementation plan. Let me start by understanding what we're building.

Please provide:
1. The task/ticket description (or reference to a change-id)
2. Any relevant context, constraints, or requirements
3. Links to related research or previous implementations

The more upstream context you pass in, the fewer questions I'll ask:
- Just a task description → full questioning
- Task + research doc (context/changes/<change-id>/research.md) → fewer questions
- Task + frame brief (context/changes/<change-id>/frame.md) → far fewer questions
- Task + frame + research → minimum questions
```

Then wait. If a change-id or file path was given, read it fully and begin.

## Step 1: Context gathering

### 1.0 Identify upstream artifacts, scale questioning

Classify what was passed in: **frame brief** (`frame.md` or content starting `# Frame Brief:`), **research doc** (`research.md` or frontmatter with `topic:`/`researcher:`), **existing plan** (`plan.md`, resume mode), or **task only**.

Question count scales down as more upstream artifacts are present:

| Upstream          | LOW | MEDIUM | HIGH  |
| ------------------ | --- | ------ | ----- |
| Task only           | 4–6 | 7–10   | 11–15 |
| Task + research     | 3–5 | 5–7    | 8–11  |
| Task + frame        | 2–3 | 4–6    | 7–9   |
| Task + frame+research | 1–2 | 3–5  | 5–7   |

Every upstream artifact is a source of decisions already made — don't re-ask what's already written down. When a frame is present, treat its Reframed Problem Statement and Hypothesis Investigation as authoritative and skip re-questioning the framing. When research is present, use its Code References and Architecture Insights as the codebase baseline instead of re-searching.

### 1.1 Read and research

Read all mentioned files fully (no partial reads) before doing anything else. Then research the codebase or prior context yourself:

- For software: what patterns does the codebase use for similar features, what's the established error-handling/testing approach, what can be reused, what constraints does the architecture impose.
- For non-software: what formats/templates were used before, what constraints exist from prior decisions or platform, what worked or didn't in past iterations.

**Copilot substitution — sequential search, not parallel agents**: the source skill spawns 2–4 concurrent sub-agents here. In Copilot Chat, do the equivalent searches one after another in this turn (file search, grep-equivalent, read) and synthesize before moving on. Slower, same eventual output shape. If the user corrects a misunderstanding, don't just accept it — verify by reading the specific files/directories they mention before proceeding.

### 1.2 Present understanding, assess complexity

Summarize findings, then present a complexity assessment:

```
**Complexity Assessment: [HIGH / MEDIUM / LOW]**

[2-3 sentences why, referencing systems touched, integration points, unknowns, testing surface.]

I'd like to ask [N] questions across a few rounds to nail down [key decision areas].

Does this feel right, or would you adjust the complexity level?
1. Agree — proceed with [N] questions
2. Higher — ask more questions (explain what's missing)
3. Lower — fewer questions needed
```

Wait for the user's numbered/text reply before proceeding.

### 1.3 Deep probing questions (Copilot substitution — numbered text, not AskUserQuestion)

Ask the confirmed number of questions across multiple chat turns if needed (1-4 per turn). For each question:

```
Q[n]. [Question]
  1. ⭐ Recommended: [Option] — [what it does]. Strength: [advantage]. Tradeoff: [cost/risk].
  2. [Option] — [what it does]. Strength: [...]. Tradeoff: [...].
  3. [Option] — [what it does]. Strength: [...]. Tradeoff: [...].
```

Ground every recommendation in the research from Step 1.1, not a guess. Cover categories relevant to the task's domain and confirmed complexity (scope boundaries, edge cases, success criteria, priority always; data model/error handling/testing/performance at MEDIUM+; architecture/state/security/migration at HIGH — adapt the category set for content or strategy tasks per the source skill's domain tables). Skip anything already settled by an upstream frame/research artifact. Wait for the user's reply after each round before asking the next.

## Step 2: Research & discovery

After initial clarifications, resolve implementation details yourself — this is not for the user to decide:

- Research codebase patterns / prior-work formats and constraints (same dimensions as Step 1.1, now narrowed to the chosen approach).
- If the user corrects something, verify it by reading the actual files before proceeding.
- **Copilot substitution — sequential, single-turn research**, same as Step 1.1.
- If genuinely two approaches remain viable and only the user can decide, ask ONE numbered-option question (same format as 1.3); otherwise pick the approach yourself and state why.

## Step 3: Plan structure development

Present the proposed structure as plain text:

```
Here's the proposed plan structure:

## Overview
[1-2 sentence summary]

## Implementation Phases:
1. [Phase name] - [what it accomplishes]
2. [Phase name] - [what it accomplishes]
3. [Phase name] - [what it accomplishes]
```

Then ask (numbered text, not AskUserQuestion):

```
Does this phase breakdown look right?
1. Looks good, proceed — write the detailed plan for these phases.
2. Needs adjustment — I'll explain the change before you write the detailed plan.
3. Too granular — combine some phases.
4. Too coarse — split further.
```

Wait for the reply before writing the full plan.

## Step 4: Detailed plan writing

1. Resolve the change folder: use `context/changes/<change-id>/` if it exists; otherwise derive a kebab-case id and create the folder + `change.md` first (mirroring `/ai-new`). Refuse if the path starts with `context/archive/`. Update `change.md`: `status: planned`, `updated: <today>`.
2. Write `context/changes/<change-id>/plan.md` using this exact structure (Phase blocks use plain `- ` bullets, never `- [ ]` — the single canonical `## Progress` section at the bottom owns all checkbox state):

```markdown
# [Feature/Task Name] Implementation Plan

## Overview
## Current State Analysis
## Desired End State
### Key Discoveries:
## What We're NOT Doing
## Implementation Approach
## Critical Implementation Details
[Omit entirely unless there's a real load-bearing constraint/gotcha/ordering requirement. Default: omit.]

## Phase 1: [Descriptive Name]
Overview
Changes Required:
#### 1. [Component/File Group]
**File**: `path/to/file.ext`
**Intent**: [1-2 sentences: what and why, not how]
**Contract**: [interface/signature/schema/route/invariant touched. Code snippet ONLY if the change is genuinely non-obvious.]

### Success Criteria:
#### Automated Verification:
- [command-runnable checks]
#### Manual Verification:
- [human-only checks]

---
## Phase 2: [...]
---

## Testing Strategy
### Unit Tests:
### Integration Tests:
### Manual Testing Steps:
## Performance Considerations
## Migration Notes
## References

## Progress
Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: <name>
#### Automated
- [ ] 1.1 <item>
#### Manual
- [ ] 1.2 <item>

### Phase 2: <name>
...
```

Emit one `### Phase N:` block per phase under `## Progress`, mirroring each phase's Success Criteria bullets one-to-one as `- [ ] <phase>.<index> <title>`. Omit empty subsections.

**Describe intent, not implementation**: separate `**Intent**` (what/why) from `**Contract**` (the field/route/structure/invariant touched). Default to no code snippets — only include one when the change is a tricky regex, unusual API call, counterintuitive ordering, or a signature other phases depend on. No open questions allowed in a finished plan — if you hit one, stop and ask before finalizing.

## Step 4.5: Plan brief

Write `context/changes/<change-id>/plan-brief.md`, sibling to `plan.md`. Must fit ~60-80 lines / 2 printed pages:

```markdown
# [Name] — Plan Brief

> Full plan: `context/changes/<change-id>/plan.md`
> Research: `context/changes/<change-id>/research.md` (if present)

## What & Why
## Starting Point
## Desired End State

## Key Decisions Made
| Decision | Choice | Why (1 sentence) | Source |
(Source column: Frame / Research / Plan — omit column if no upstream artifacts)

## Scope
**In scope:** ...
**Out of scope:** ...

## Architecture / Approach

## Phases at a Glance
| Phase | What it delivers | Key risk |

**Prerequisites:** ...
**Estimated effort:** ...

## Open Risks & Assumptions
## Success Criteria (Summary)
```

## Step 5: Sync review

Confirm both files exist. Present:

```
I've created the implementation plan:

Brief (start here): context/changes/<change-id>/plan-brief.md
Full plan: context/changes/<change-id>/plan.md

Next: /ai-implement <change-id> phase 1

Review the brief first, then the full plan for anything needing adjustment:
- phases properly scoped?
- success criteria specific enough?
- missing edge cases?
```

Iterate on feedback (add/remove phases, adjust approach, clarify criteria) until the user is satisfied.

## Important guidelines

- Be skeptical: question vague requirements, verify against code/files, don't assume.
- No open questions in the final plan — resolve everything before writing it.
- Separate Automated Verification (commands) from Manual Verification (human testing) in every phase's success criteria.
- Include specific file:line references wherever they exist.

## Copilot substitution notes

- `AskUserQuestion` → numbered text questions per Steps 1.2/1.3/3, waiting for the user's chat reply each time.
- Parallel sub-agent research (Steps 1.1/2) → sequential search within the current turn.
- `TaskCreate`/`TaskUpdate` progress tracking → dropped; `plan.md`'s `## Progress` section is the only state that matters.
- No clipboard copy — state the next command plainly.
