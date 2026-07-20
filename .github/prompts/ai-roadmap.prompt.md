---
description: Generate context/foundation/roadmap.md from a PRD as an ordered set of vertical, end-to-end slices
mode: agent
tools: ['edit', 'search', 'runCommands']
---

# /ai-roadmap — Generate Roadmap from PRD

Read a PRD, auto-probe the codebase baseline, infer a decisive sequencing proposal (main goal, north star, investment areas, top blocker) through a **capped 3-question interview**, and emit `context/foundation/roadmap.md`: vertical, user-visible slices in dependency order, ready for `/ai-plan <change-id>`. This is decomposition + sequencing, not low-level planning — never pick frameworks, files, schemas, or time estimates.

> See `.github/prompts/README.md` for shared conventions.

## Initial response

Path argument given → use it. No argument → default to `context/foundation/prd.md`. Proceed to Step 1.

## Process

### Step 1: Locate and read PRD

`test -f "<path>"`. Missing → ask (numbered text): "1. Run /ai-prd first (Recommended) 2. Provide a different path 3. Cancel." Exists → read fully.

### Step 2: Supplementary inputs (best effort)

Read if present: `shape-notes.md` (lift `## Forward: technical-roadmap` bullets), `tech-stack.md` (informs Foundations, short-circuits baseline probes), existing `roadmap.md` (hold for Step 9 collision), `lessons.md` (ordering/readiness priors).

### Step 3: PRD readiness check

Score 0-4: Vision non-trivial (≥2 sentences, no TODO); ≥1 populated `### US-NN:` with GWT; ≥1 `must-have` FR; Business Logic populated. Print the table. Score ≥3 → proceed. Score <3 → name what's missing + consequence, ask (numbered text): "1. Firm up PRD first (Recommended) 2. Proceed anyway 3. Cancel."

### Step 4: Auto-research baseline

For each layer (Frontend, Backend/API, Data, Auth, Deploy/infra, Observability) not already declared in `tech-stack.md`, do a focused search (sequential — Copilot substitution for parallel sub-agents) and report present/absent/partial with file evidence, ≤100 words each, no speculation. Print the one-screen baseline table, then confirm via numbered text: "Does this match? 1. Looks right 2. Correct a layer — explain 3. Add something missed" (multi-select via free text). Save the confirmed baseline — feeds Foundations and the roadmap's `## Baseline`.

### Step 5: Lean interview — at most 3 anchor questions

Infer Recommend + up to 2 real alternatives (grounded in artifact quotes, no strawmen) for each of: **main_goal** (market-feedback/quality/low-complexity/speed/learn/other), **north_star** (smallest slice proving the PRD's core hypothesis), **top_blocker** (skills/capacity/time/decisions/external/motivation/none). Skip an anchor only when the PRD/Success Criteria literally states it unambiguously — announce the skip with the locking quote.

Ask each non-skipped anchor as its own numbered-text question, Recommend always option 1, each alternative carrying its own one-line "why reasonable" clause, always include a free-form override option. Derive **investment areas** (frontend/backend/data/infra: invest deeply vs. go simple) from the answers — do not ask a separate question.

Custom-MVP-shape exception (novel product, no familiar SaaS/CRUD/content/AI-wrapper pattern): disclose weaker Recommends up front, allow up to 2 follow-up free-text exchanges beyond the 3 anchors.

End with a plain-markdown synthesis recap (no new question) mirroring the user's language, locking in the framing; the user can override any line in one message.

### Step 6: Decompose and sequence

**Foundations** (`F-NN`): cross-cutting prerequisites with no user-visible outcome on their own, that unlock named slices/unknowns/verification paths. Only from: tech-stack scaffolding implications, PRD NFRs needing infra, PRD Access Control beyond none, Step 4 absent/partial baseline layers, Step 5 "invest deeply" picks. Cap scope to the smallest enabler — never a whole layer.

**Slices** (`S-NN`): walk User Stories/FRs, group into vertical end-to-end capabilities ("user can..."). Never slice horizontally. Split oversized slices by outcome/workflow-phase/persona/risk, never by layer.

Each item gets a stable kebab-case Change ID. Build the dependency graph (Prerequisites, Unlocks for Foundations, Parallel-with). Topological sort, north star placed as early as Prerequisites allow, ties broken by main_goal. Identify per-slice Blockers (external) and Unknowns (question/owner/block-flag). Generate `## Open Roadmap Questions` (PRD's Open Questions + cross-cutting ones from Step 5), `## Parked` (PRD Non-Goals + deferred items). Derive `## Streams` (2-5, navigation-only, doesn't replace the topological order) if the graph is large enough to benefit.

### Step 7: Emit roadmap content

Use the exact template (frontmatter: project/version/status/created/updated/prd_version/main_goal/top_blocker; sections: Vision recap, North star, At a glance, Streams (optional), Baseline, Foundations, Slices, Backlog Handoff, Open Roadmap Questions, Parked, Done). Define any strategy jargon (wedge/north star/etc.) inline on first use. No time units, no estimates, no complexity scores anywhere.

### Step 8: Self-review

Verify: 8 frontmatter keys; required sections in order; every S-NN/F-NN has its mandatory fields; every must-have FR and every US-NN covered by ≥1 slice's PRD refs; no dependency cycles, no forward references; At-a-glance table matches bodies; status consistency; no invented slices; Baseline vs. Foundations consistency (no re-scaffolding present layers); every Foundation has Unlocks; unique Change IDs, all present in Backlog Handoff; slice granularity balance; Foundation scope cap; progressive disclosure; Streams coverage (if present); strategic terms defined inline on first use. Any failure aborts the write with the specific failure named — do not proceed to Step 9.

### Step 9: Collision check

`test -f context/foundation/roadmap.md`. Missing → write, go to Step 10. Exists → ask (numbered text): "1. Archive and replace (Recommended) — move to context/foundation/archive/<today>-roadmap.md 2. Overwrite without archiving 3. Cancel."

### Step 10: Hand off

Print the summary block, then recommend a single next move (not a menu): north star ready → recommend it; else a Foundation the north star depends on is ready → recommend that; else no slice ready → recommend resolving the highest-leverage Open Question/Blocker; else recommend the ready slice with highest fan-out. State `/ai-plan <change-id>` on the recommended item plainly, list the "after that" order, and list blocked items with their unlocking unknowns. Stop — never chain automatically, never degrade into a plain menu.

## Critical guardrails

PRD is the source — every slice traces to a PRD ID. Vertical slices only; Foundations are the sole cross-cutting exception. Balanced granularity without estimates. Foundations are minimal unlocks, never layer-completion projects. No time units ever. No low-level technical detail (frameworks/files/schemas — that's `/ai-plan`'s territory). Surface unknowns, don't paper over them. Baseline is auto-researched, only confirmed by the user, never asked cold. Self-review aborts on drift. Edit-in-place is not supported by this skill — collisions default to archive-then-replace. No 10xDevs language. Never chain automatically. Lean interview — max 3 anchors, strong Recommends, no strawman alternatives, investment areas derived not asked.

## Copilot substitution notes

- `AskUserQuestion` → numbered text at Steps 1, 3, 4, 5, and 9.
- Parallel baseline-probe sub-agents (Step 4) → sequential search within the current turn.
- `TaskCreate`/`TaskUpdate` → dropped.
- No clipboard copy — state commands plainly.
