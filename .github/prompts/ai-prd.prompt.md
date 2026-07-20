---
description: Generate context/foundation/prd.md from shape-notes.md against the locked PRD schema
mode: agent
tools: ['edit', 'search', 'runCommands']
---

# /ai-prd — Generate PRD from Shape Notes

Take `shape-notes.md` (or raw notes) and emit `context/foundation/prd.md` conforming to the locked PRD schema, auto-routing to greenfield (10 sections) or brownfield (11 sections). This is a **document generator**, not a discovery facilitator — never invent content; missing input goes verbatim to `## Open Questions`.

> See `.github/prompts/README.md` for shared conventions. Schema: `.claude/skills/ai-shape/references/prd-schema.md` — read it before generating and re-check before writing.

## Initial response

Path argument given → use it (strip leading `@`). No argument → default to `context/foundation/shape-notes.md`. Proceed to Step 1 either way (no prompt yet).

## Process

### Step 1: Locate input

`test -f "<resolved-path>"`. If exists, read fully, proceed to Step 1.5. If not, ask (numbered text): "No input file found at <path>. 1. Run /ai-shape first (Recommended) 2. Paste raw notes 3. Cancel." On (2), capture pasted text as in-memory input.

### Step 1.5: Determine context type

If input has `context_type:` in frontmatter, use it directly. Otherwise auto-detect from cwd (same Tier 1/2/3 signals as `/ai-shape` Step 0.7) and confirm via numbered text: "1. [Detected] — correct (Recommended) 2. [Other] — override."

### Step 2: Assess input

Score 0-4 (each 1 point): frontmatter `checkpoint:` block present (brownfield also needs `context_type: brownfield` + `## Current System`); ≥1 `FR-NNN:` line; ≥1 Given/When/Then block; explicit one-sentence Business Logic (not `# TODO`). Print the checklist and score.

Score ≥2 → proceed silently to Step 3. Score <2 → name each missing signal and its consequence, then ask (numbered text): "1. Run /ai-shape first (Recommended) 2. Proceed anyway 3. Cancel."

### Step 3: Generate PRD

Re-read the schema reference fully. Build in memory:

**Frontmatter**: `project` (from input or Title heading, else TODO), `version: 1`, `status: draft`, `created: <today>`, `context_type`, `product_type`/`target_scale`/`timeline_budget` (copy if present else `# TODO: <field> — see Open Questions`). Never populate `team_profile`/`tech_preferences`/`deployment_constraint` — those route downstream; summarize them in the Step 5 hand-off message instead.

**Sections (greenfield, 10, exact order)**: Vision & Problem Statement, User & Persona, Success Criteria (Primary/Secondary/Guardrails), User Stories, Functional Requirements, Non-Functional Requirements, Business Logic, Access Control, Non-Goals, Open Questions.

**Sections (brownfield, 11, exact order)**: Current System Overview, Problem Statement & Motivation, User & Persona, Success Criteria, User Stories, Scope of Change (new/modified/removed), Constraints & Compatibility, Business Logic Changes, Access Control Changes, Non-Goals, Open Questions.

Never emit `## Data Model`, `## Implementation Decisions`, `## Testing Strategy`, or `## Deployment & CI/CD` — not part of the schema; route that content to the Step 5 forward-message instead.

Content rule per section: has matching input → transcribe faithfully (no rephrasing); partial → transcribe + `# TODO: <what's missing> — see Open Questions` + matching Open Questions entry; none → heading + TODO + Open Questions entry. Never invent the one-sentence business rule — if absent, section reads exactly `# TODO: domain rule — see Open Questions` and Open Questions gets a blocking entry.

**Pre-write self-review** (abort the write and report specifics if any fail — do not proceed to Step 4):
1. All required `## ` headings present, in order, exact spelling (no retired sections).
2. All required frontmatter keys present.
3. Success Criteria has Primary/Secondary/Guardrails (or TODO-flagged).
4. **Technical-leak lint**: scan bodies (except brownfield's Current System Overview) for vendor/service names, schema/ORM notation, runtime-location words, enforcement-mechanism words, UI-affordance words in NFRs, transport/protocol words, or "the X does Y" implementation-verb phrasing. Any hit is a leak — report it, don't silently rewrite.

### Step 4: Collision check

`test -f context/foundation/prd.md`. Missing → write there, go to Step 5. Exists → ask (numbered text): "1. Save as prd-vN.md (Recommended) 2. Overwrite prd.md 3. Abort." On (1), scan for `prd-v*.md`, next slot = max+1, bump `version:` field to match.

### Step 5: Hand off

Print summary (project, context type, path, sections present, frontmatter populated count, Open Questions count). State the next command plainly (no clipboard): greenfield → `/ai-tech-stack-selector`; brownfield → `/ai-stack-assess`. If forward-routed content exists (tech-stack hints, implementation notes), list it briefly so the user knows it wasn't dropped. Stop — never chain automatically.

## Critical guardrails

Generator, not author — no invented business logic/success criteria/user stories/FR priorities. Schema is the contract, re-validate every write. Stack openness is binding across seven forbidden-vocabulary categories (frameworks/vendors/schema-notation/runtime-location/enforcement-mechanism/UI-affordance/transport-protocol) — exception: brownfield's Current System Overview may name the existing stack. Collisions favor history (versioned save over overwrite). Self-review aborts on any drift, never silently patches. No 10xDevs language. Never chain automatically.

## Copilot substitution notes

- `AskUserQuestion` → numbered text questions at Steps 1, 1.5, 2, and 4.
- `TaskCreate`/`TaskUpdate` → dropped.
- No clipboard copy — state the next command plainly.
