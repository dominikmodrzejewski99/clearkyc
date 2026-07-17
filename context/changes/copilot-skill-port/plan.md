# Port 10x AI Skills to GitHub Copilot Implementation Plan

## Overview

Port the 11-skill core workflow chain of the 10x AI toolkit (`.claude/skills/ai-*`) to GitHub Copilot's custom-prompt format (`.github/prompts/*.prompt.md`) so the user can drive the same change-folder workflow on a bank work laptop that has GitHub Copilot Chat but no Claude Code. Deliver alongside a README for email distribution that explains setup and documents which capabilities carry over as-is versus degrade.

## Current State Analysis

- `.claude/skills/` holds 32 `SKILL.md` files; 11 form the primary chain: `ai-new`, `ai-shape`, `ai-frame`, `ai-research`, `ai-prd`, `ai-roadmap`, `ai-plan`, `ai-implement`, `ai-tdd`, `ai-e2e`, `ai-impl-review`. Sizes range 143-831 lines, so each needs condensing, not verbatim copy.
- `.github/copilot-instructions.md` already exists (10 lines, caveman-mode style block only) — confirms the custom-instructions mechanism is live in this repo.
- `.github/prompts/` does not exist yet.
- The workflow's state layer (`context/changes/<id>/change.md`, `research.md`, `plan.md` schemas, the `## Progress` section as canonical state) is pure markdown and fully portable.
- Four Claude-specific mechanisms have no Copilot equivalent and need a text-based substitution pattern applied consistently across all 11 ported files: `AskUserQuestion`, `Task`/`Agent` parallel sub-agent spawning, `TaskCreate`/`TaskUpdate`/`TaskList` status tracking, and frontmatter-driven auto-invocation.

### Key Discoveries:

- `.claude/skills/ai-new/SKILL.md:88-101` — `change.md` frontmatter schema, portable as-is.
- `.claude/skills/ai-research/SKILL.md:46-88` — `AskUserQuestion` usage pattern needing text-prompt substitution.
- `.claude/skills/ai-research/SKILL.md:89-105` — parallel sub-agent spawning needing sequential-search substitution.
- `.claude/skills/ai-research/SKILL.md:43,102` — `TaskCreate`/`TaskUpdate` progress tracking to drop; rely on `plan.md`'s `## Progress` section instead.
- Copilot's `.github/prompts/*.prompt.md` files are invoked explicitly via `/name`, matching this toolkit's existing explicit-invocation convention (`/ai-new`, `/ai-plan`, etc.) — this is a wash, not a loss.

## Desired End State

`.github/prompts/` contains 11 `.prompt.md` files, one per core skill, each invokable via `/ai-<name>` in Copilot Chat, each producing the same `context/changes/<id>/` artifacts (`change.md`, `research.md`, `plan.md` with `## Progress`) as the Claude Code originals. A README at the repo root (or a location the user names for email attachment) explains setup and a per-skill capability matrix. Verification: manually invoke `/ai-new`, `/ai-plan`, `/ai-implement` in VS Code Copilot Chat against a throwaway change-id and confirm the expected files are produced with correct schema.

### Key Discoveries:

- Same as Current State Analysis above — no separate discoveries beyond what research already surfaced.

## What We're NOT Doing

- Not porting the 21 non-`ai-*` skills (`10x-*`, `pack-init`, `setup-cicd`, `tf-registry`, `context7-mcp`, `impeccable`) — out of scope per user's stated deliverables.
- Not building any automated test suite for the prompt files (they're markdown instructions, not code) — verification is manual smoke-testing only.
- Not implementing a parallel-execution or structured-question UI shim for Copilot — the plan substitutes plain sequential search and numbered text prompts, it does not attempt to recreate the Claude Code UI primitives.
- Not confirming the bank laptop's exact Copilot plan/tier ahead of time — flagged as an open risk instead, since it cannot be verified from this environment.

## Implementation Approach

Establish one shared conversion pattern (frontmatter shape + a reusable "Copilot substitution notes" block covering the four unported mechanisms) in Phase 1, prove it on the three core-loop skills in Phase 2, then apply the proven pattern mechanically to the remaining 8 skills in Phase 3. README and manual verification close the change in Phases 4-5. This sequencing means any pattern mistakes surface and get fixed once (Phase 2) rather than 11 times.

## Critical Implementation Details

**Frontmatter schema is an unverified assumption.** GitHub Copilot custom prompt files are believed to support `description`, `mode`, and `tools` frontmatter fields, but this was not confirmed via Context7 or web search in this session (both were unavailable). Phase 1 must state this as an explicit assumption in the shared conventions doc, and the README (Phase 4) must tell the user to verify prompt-file support against their actual Copilot plan/tier before relying on it for real work.

## Phase 1: Prompt-file Scaffolding & Shared Conventions

### Overview

Create the `.github/prompts/` directory and a shared conversion pattern that all 11 ported skills will follow, so Phase 2 and Phase 3 apply a proven template rather than inventing structure per file.

### Changes Required:

#### 1. Prompts directory and conventions doc

**File**: `.github/prompts/README.md` (internal, not the email deliverable — that's Phase 4's `context/changes/copilot-skill-port/copilot-readme.md`)

**Intent**: Document the shared frontmatter shape and the four substitution patterns (AskUserQuestion → numbered text prompt, parallel Task spawning → sequential search steps, TaskCreate/TaskUpdate → drop in favor of `plan.md` `## Progress`, auto-invocation → explicit `/name` filename mapping) once, so every ported `.prompt.md` file references it instead of re-explaining.

**Contract**: Markdown file with a frontmatter-schema example block and one short paragraph per substitution pattern. No code beyond the frontmatter example.

#### 2. Frontmatter template

**File**: `.github/prompts/README.md` (same file as above)

**Intent**: Fix the exact frontmatter fields every ported `.prompt.md` will carry (`description`, `mode: agent`, `tools` — matching Copilot's documented custom-prompt-file fields as best known), flagged as unverified per Critical Implementation Details.

**Contract**: `description` mirrors the original `SKILL.md`'s one-line description; `tools` lists only Copilot-Chat-native capabilities (file read/write, terminal, workspace search) — no Claude-specific tool names carry over.

### Success Criteria:

#### Automated Verification:

- `.github/prompts/` directory exists: `ls .github/prompts/`
- `.github/prompts/README.md` exists and is non-empty: `test -s .github/prompts/README.md`

#### Manual Verification:

- Conventions doc reads clearly as a standalone reference without needing this plan for context
- Frontmatter template is unambiguous enough that Phase 2 doesn't need to re-derive it

---

## Phase 2: Port Core Loop (ai-new, ai-plan, ai-implement)

### Overview

Port the three skills that form the minimal usable loop, proving the Phase 1 pattern on real content before scaling to the remaining 8. These three are chosen because a user with only this subset can already open a change, plan it, and implement it end to end.

### Changes Required:

#### 1. ai-new port

**File**: `.github/prompts/ai-new.prompt.md`

**Intent**: Condense `.claude/skills/ai-new/SKILL.md` (change-folder bootstrap, kebab-case/uniqueness/parent-dir validation, `change.md` schema) into Copilot prompt form, applying the Phase 1 frontmatter template and substitution notes.

**Contract**: Preserves the `change.md` frontmatter schema verbatim (`.claude/skills/ai-new/SKILL.md:88-101`). Drops the clipboard-copy next-step logic (`ai-new/SKILL.md:107-136`), which is Claude-Code-CLI-specific.

#### 2. ai-plan port

**File**: `.github/prompts/ai-plan.prompt.md`

**Intent**: Condense `.claude/skills/ai-plan/SKILL.md` (831 lines — the largest skill) into Copilot prompt form: complexity-scaled questioning becomes numbered text questions asked in one or more chat turns; parallel research sub-agents become a sequential "research these areas one at a time" instruction list; the `plan.md` and `plan-brief.md` templates carry over verbatim since they're pure markdown schema.

**Contract**: `plan.md`'s `## Progress` section format and the Phase-block template (Intent/Contract split, Automated/Manual success criteria) are preserved exactly as in the source skill — this is the schema the whole toolkit depends on downstream.

#### 3. ai-implement port

**File**: `.github/prompts/ai-implement.prompt.md`

**Intent**: Condense `.claude/skills/ai-implement/SKILL.md` into Copilot prompt form, preserving the phase-by-phase execution loop and the convention of reading and checking off `## Progress` items in `plan.md` as work completes.

**Contract**: Same `## Progress` checkbox contract as ai-plan's output — `- [ ]` / `- [x]` with `— <commit sha>` on completion, per `references/progress-format.md` in the source skill.

### Success Criteria:

#### Automated Verification:

- Three files exist: `ls .github/prompts/ai-new.prompt.md .github/prompts/ai-plan.prompt.md .github/prompts/ai-implement.prompt.md`
- Each file has valid YAML frontmatter matching the Phase 1 template: manual grep check for `description:` and `mode:` keys

#### Manual Verification:

- Open VS Code Copilot Chat, invoke `/ai-new test-copilot-port`, confirm it produces a correctly-shaped `change.md`
- Invoke `/ai-plan test-copilot-port` against a trivial task, confirm the questioning flow substitutes cleanly to numbered text and a `plan.md` + `plan-brief.md` pair is produced
- Invoke `/ai-implement test-copilot-port phase 1` and confirm it reads and updates `## Progress` correctly
- Delete the `test-copilot-port` scratch change folder after verification

---

## Phase 3: Port Supporting Skills

### Overview

Apply the now-proven Phase 2 pattern to the remaining 8 skills: `ai-shape`, `ai-frame`, `ai-research`, `ai-prd`, `ai-roadmap`, `ai-tdd`, `ai-e2e`, `ai-impl-review`. No new pattern decisions — mechanical application.

### Changes Required:

#### 1. Remaining skill ports

**File**: `.github/prompts/ai-shape.prompt.md`, `.github/prompts/ai-frame.prompt.md`, `.github/prompts/ai-research.prompt.md`, `.github/prompts/ai-prd.prompt.md`, `.github/prompts/ai-roadmap.prompt.md`, `.github/prompts/ai-tdd.prompt.md`, `.github/prompts/ai-e2e.prompt.md`, `.github/prompts/ai-impl-review.prompt.md`

**Intent**: Condense each source `SKILL.md` using the Phase 1 frontmatter template and substitution notes, same as Phase 2. `ai-research`'s parallel sub-agent spawning (`ai-research/SKILL.md:89-105`) becomes sequential grep/read passes within one Copilot Chat turn per the Phase 1 conventions doc.

**Contract**: Each ported file preserves its source's document schema (research.md frontmatter for `ai-research`, PRD structure for `ai-prd`, roadmap table shape for `ai-roadmap`, etc.) verbatim — only the interaction layer (questioning, spawning, tracking) changes.

### Success Criteria:

#### Automated Verification:

- All 8 files exist: `ls .github/prompts/ai-shape.prompt.md .github/prompts/ai-frame.prompt.md .github/prompts/ai-research.prompt.md .github/prompts/ai-prd.prompt.md .github/prompts/ai-roadmap.prompt.md .github/prompts/ai-tdd.prompt.md .github/prompts/ai-e2e.prompt.md .github/prompts/ai-impl-review.prompt.md`
- Total ported count matches source count: 11 files in `.github/prompts/` excluding `README.md`

#### Manual Verification:

- Spot-check `ai-research.prompt.md` in Copilot Chat against a small research question, confirm sequential search substitution produces a usable `research.md`
- Read through each ported file once for schema fidelity against its source `SKILL.md`

---

## Phase 4: README for Email Distribution

### Overview

Write the plain-English README the user will email to themselves (or attach) for setup on the Copilot-only laptop, including the capability matrix showing what works as-is vs what's degraded vs what's dropped.

### Changes Required:

#### 1. Email README

**File**: `context/changes/copilot-skill-port/copilot-readme.md`

**Intent**: Explain how to copy `.github/prompts/*.prompt.md` and `.github/copilot-instructions.md` onto the work laptop's clone of the repo, how to invoke a ported skill (`/ai-new`, `/ai-plan`, etc.), and present a capability matrix (skill name → works as-is / degraded / dropped feature) built from the research.md findings.

**Contract**: Matrix has one row per of the 11 ported skills, columns for the four substituted mechanisms it uses (AskUserQuestion, parallel spawning, task tracking, auto-invocation) marked N/A where not applicable. Must include the unverified-frontmatter-schema caveat from Critical Implementation Details as a visible warning, not a footnote.

### Success Criteria:

#### Automated Verification:

- File exists and is non-empty: `test -s context/changes/copilot-skill-port/copilot-readme.md`

#### Manual Verification:

- README readable end-to-end by someone who has never seen this repo's `context/` conventions
- Capability matrix accurately reflects what Phases 1-3 actually shipped (not aspirational)

---

## Phase 5: Smoke Verification

### Overview

Manual checklist confirming the ported prompt files actually load and run in VS Code Copilot Chat, since these are markdown instructions with no automated test suite that applies.

### Changes Required:

#### 1. Verification pass

**File**: none (manual checklist against already-written Phase 1-4 output)

**Intent**: Confirm each of the 11 `.prompt.md` files is discoverable via `/ai-<name>` in Copilot Chat inside VS Code, and that the core loop (`ai-new` → `ai-plan` → `ai-implement`) produces correctly-shaped artifacts end to end on a scratch change-id.

**Contract**: No schema — this phase is a checklist, not a code change.

### Success Criteria:

#### Automated Verification:

- None — markdown prompt files have no automated verification path.

#### Manual Verification:

- All 11 `/ai-<name>` commands appear in Copilot Chat's slash-command list in VS Code
- Core loop (`ai-new`, `ai-plan`, `ai-implement`) run end-to-end on a scratch change-id, artifacts match expected schema, scratch folder deleted afterward
- README instructions followed literally on a clean checkout (or as close to it as practical) to confirm no missing setup step

---

## Testing Strategy

### Unit Tests:

- Not applicable — no code, only markdown prompt files.

### Integration Tests:

- Not applicable — see Manual Testing Steps below, which cover the same ground manually since Copilot prompt files have no automated harness.

### Manual Testing Steps:

1. In VS Code with Copilot Chat, invoke `/ai-new copilot-port-smoketest` and confirm `context/changes/copilot-port-smoketest/change.md` is created with correct frontmatter.
2. Invoke `/ai-plan copilot-port-smoketest` with a trivial task description, confirm numbered-text questioning substitutes cleanly and `plan.md` + `plan-brief.md` are produced with the `## Progress` section correctly populated.
3. Invoke `/ai-implement copilot-port-smoketest phase 1`, confirm it reads `plan.md`, executes the phase, and checks off the corresponding `## Progress` items.
4. Delete the `copilot-port-smoketest` change folder once verified.
5. Spot-check one supporting skill (`ai-research` recommended, since it has the heaviest substitution burden) against a small real question.

## Performance Considerations

None — markdown prompt files have no runtime performance profile of their own; any latency is Copilot Chat's, not this change's.

## Migration Notes

Not applicable — this is a net-new capability (`.github/prompts/` did not exist before), not a migration of existing data or systems.

## References

- Related research: `context/changes/copilot-skill-port/research.md`
- Source skills: `.claude/skills/ai-new/SKILL.md`, `.claude/skills/ai-plan/SKILL.md`, `.claude/skills/ai-implement/SKILL.md`, and the 8 remaining `.claude/skills/ai-*/SKILL.md` files
- Existing Copilot config: `.github/copilot-instructions.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Prompt-file Scaffolding & Shared Conventions

#### Automated

- [x] 1.1 `.github/prompts/` directory exists
- [x] 1.2 `.github/prompts/README.md` exists and is non-empty

#### Manual

- [x] 1.3 Conventions doc reads clearly as a standalone reference
- [x] 1.4 Frontmatter template is unambiguous for Phase 2

### Phase 2: Port Core Loop (ai-new, ai-plan, ai-implement)

#### Automated

- [ ] 2.1 Three core-loop files exist
- [ ] 2.2 Each file has valid frontmatter matching the Phase 1 template

#### Manual

- [ ] 2.3 `/ai-new test-copilot-port` produces correctly-shaped `change.md`
- [ ] 2.4 `/ai-plan test-copilot-port` substitutes questioning cleanly, produces `plan.md` + `plan-brief.md`
- [ ] 2.5 `/ai-implement test-copilot-port phase 1` reads and updates `## Progress` correctly
- [ ] 2.6 Scratch change folder deleted after verification

### Phase 3: Port Supporting Skills

#### Automated

- [ ] 3.1 All 8 remaining skill files exist
- [ ] 3.2 Total ported count is 11 files in `.github/prompts/` excluding `README.md`

#### Manual

- [ ] 3.3 `ai-research.prompt.md` spot-checked against a small research question
- [ ] 3.4 Each ported file read through once for schema fidelity against its source

### Phase 4: README for Email Distribution

#### Automated

- [ ] 4.1 `copilot-readme.md` exists and is non-empty

#### Manual

- [ ] 4.2 README readable end-to-end without prior repo context
- [ ] 4.3 Capability matrix matches what Phases 1-3 actually shipped

### Phase 5: Smoke Verification

#### Manual

- [ ] 5.1 All 11 `/ai-<name>` commands appear in Copilot Chat's slash-command list
- [ ] 5.2 Core loop run end-to-end on scratch change-id, scratch folder deleted afterward
- [ ] 5.3 README instructions followed literally on a clean checkout
