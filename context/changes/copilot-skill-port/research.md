---
date: 2026-07-17T12:50:01+02:00
researcher: Claude Sonnet 5
git_commit: de8e7d5fa02841e56981823e12bb29a145d75b77
branch: main
repository: 10xdevs
topic: "Port 10x AI skills to GitHub Copilot for a Copilot-only work laptop"
tags: [research, copilot, skills, ai-toolkit, portability]
status: complete
last_updated: 2026-07-17
last_updated_by: Claude Sonnet 5
---

# Research: Port 10x AI skills to GitHub Copilot for a Copilot-only work laptop

**Date**: 2026-07-17T12:50:01+02:00
**Researcher**: Claude Sonnet 5
**Git Commit**: de8e7d5fa02841e56981823e12bb29a145d75b77
**Branch**: main
**Repository**: 10xdevs

## Research Question

Can the 10x AI toolkit (Claude Code skills under `.claude/skills/`) be brought to a bank work laptop that has GitHub Copilot Chat only, no Claude Code? Which skills survive the port and which don't, and what does a README for that handoff need to say?

## Summary

The repo has 32 skill files under `.claude/skills/`, of which 11 form the core end-to-end workflow chain (`ai-*`): `ai-shape` -> `ai-prd` -> `ai-roadmap` -> `ai-plan` -> `ai-implement`/`ai-tdd`/`ai-e2e` -> `ai-impl-review`, plus the utility skills `ai-new`, `ai-research`, `ai-frame`.

The workflow's **state layer is fully portable**: the `context/changes/<id>/` folder convention, `change.md` schema, and each artifact's markdown shape (`research.md`, `plan.md` with its `## Progress` section as single source of truth) have zero dependency on Claude-specific tooling. Any agent that can read/write files and follow instructions can drive this state machine.

The **execution layer is partially portable**. Four Claude Code mechanisms used throughout the skills have no Copilot Chat equivalent and must be substituted with plain-text fallbacks:

1. `AskUserQuestion` (structured multi-option UI) -> numbered plain-text questions, user replies inline.
2. `Task`/`Agent` parallel sub-agent spawning (used heavily in `ai-research`, `ai-shape`, `ai-plan`) -> sequential search/reasoning in a single Copilot Chat turn; no concurrency.
3. `TaskCreate`/`TaskUpdate`/`TaskList` status-bar progress tracking -> no substitute; drop it, rely on the `## Progress` section in `plan.md` for state instead (which the skills already treat as canonical).
4. Skill auto-invocation via description/trigger-phrase matching (the `name`/`description` frontmatter in `SKILL.md` that Claude Code uses to surface skills) -> Copilot has its own mechanism: `.github/prompts/*.prompt.md` files invoked explicitly via `/prompt-name` in Copilot Chat, or `.github/copilot-instructions.md` for always-on repo-wide instructions. No auto-trigger-by-description equivalent; every prompt must be invoked explicitly by the user.

Repo already has a `.github/copilot-instructions.md` (currently just the caveman-mode style block) confirming Copilot's custom-instructions mechanism is live in this repo, but no `.github/prompts/` directory exists yet — that's the natural target for ported skills.

## Detailed Findings

### Skill inventory and chain structure

- `.claude/skills/` contains 32 `SKILL.md` files. 11 make up the primary workflow chain the user wants ported: `ai-new`, `ai-shape`, `ai-frame`, `ai-research`, `ai-prd`, `ai-roadmap`, `ai-plan`, `ai-implement`, `ai-tdd`, `ai-e2e`, `ai-impl-review`.
- The remaining 21 (`10x-*`, `pack-init`, `setup-cicd`, `tf-registry`, `context7-mcp`, `impeccable`) are bootstrap/one-off/support skills, out of scope for this port unless the user says otherwise.
- Line counts range 143-831 per `SKILL.md` (`.claude/skills/ai-plan/SKILL.md` is the largest at 831 lines), so verbatim copying is not viable — each needs condensing/rewriting for the leaner Copilot prompt format.

### Claude-specific mechanisms with no Copilot equivalent

- `AskUserQuestion` — used in `ai-new/SKILL.md`, `ai-research/SKILL.md:46-88`, and throughout `ai-shape`/`ai-plan`/`ai-frame` for structured decision points (2-4 labeled options + description + recommendation). No Copilot Chat UI primitive exists for this; must become numbered markdown lists in the prompt output, with the user typing back a number or word.
- Parallel sub-agent spawning (`Task` tool, `subagent_type: Explore | general-purpose`) — `ai-research/SKILL.md:89-105` explicitly spawns 2-4 concurrent agents and waits for all before synthesizing. Copilot Chat has no agent-spawning primitive; the prompt must be rewritten to do sequential grep/read passes within one turn (slower, but same eventual output shape).
- `TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet` — used for user-visible progress in the status bar (`ai-research/SKILL.md:43`, `102`). Drop entirely; the skills already have a redundant canonical progress mechanism (`plan.md`'s `## Progress` section, per `ai-new/SKILL.md:141`) that Copilot can read/write directly.
- Frontmatter-driven auto-invocation (`name`, `description`, `argument-hint`, `allowed-tools` fields in `SKILL.md`) — Claude Code uses this to decide when a skill applies. Copilot's `.github/prompts/*.prompt.md` files are invoked explicitly by filename (`/ai-plan` maps to `ai-plan.prompt.md`), no description-matching happens. This is actually a wash for this toolkit, since the skills are already invoked explicitly by slash command (`/ai-new`, `/ai-plan`, etc.) per the `context/foundation/prd.md` and `web/CLAUDE.md` router tables — Copilot's explicit-invocation model matches the existing usage pattern.

### What ports cleanly as-is

- Directory/file conventions: `context/changes/<change-id>/change.md`, `research.md`, `plan.md` schemas (`ai-new/SKILL.md:88-101`) — pure markdown, no tool dependency.
- Validation rules (kebab-case check, uniqueness check, parent-dir-exists check in `ai-new/SKILL.md:65-75`) — plain logic, portable as prose instructions any capable agent can follow.
- Decision-recording conventions (reframed problem statements, phase structure, cost x signal reasoning in `ai-plan`, negative-space sections in `10x-test-plan`) — text-only, portable.
- The "one rollout phase at a time, `/clear` between handoffs" STOP-point discipline — portable as an instruction, though Copilot Chat's equivalent of `/clear` is starting a new chat thread.

### Existing Copilot config in this repo

- `.github/copilot-instructions.md` exists (10 lines, caveman-mode style block only) — confirms the custom-instructions mechanism is active but currently carries no skill content.
- `.github/prompts/` does not exist yet — this is the correct target directory for Copilot's reusable custom prompt files (`*.prompt.md`, invoked via `/name` in Copilot Chat).
- `.github/workflows/fly-deploy.yml` is unrelated CI, no overlap.

## Code References

- `.claude/skills/ai-new/SKILL.md:88-101` - change.md frontmatter schema (portable as-is)
- `.claude/skills/ai-new/SKILL.md:107-136` - next-step suggestion + clipboard copy logic (clipboard copy is Claude-Code-CLI-specific, drop for Copilot)
- `.claude/skills/ai-research/SKILL.md:46-88` - AskUserQuestion usage pattern needing text-prompt substitution
- `.claude/skills/ai-research/SKILL.md:89-105` - parallel sub-agent spawning needing sequential-search substitution
- `.claude/skills/ai-research/SKILL.md:43,102` - TaskCreate/TaskUpdate progress tracking to drop
- `.github/copilot-instructions.md` - existing Copilot custom-instructions file in this repo (currently caveman-mode only)

## Architecture Insights

The toolkit's real intellectual property is the **artifact schema and decision discipline** (risk-first prioritization, cost x signal, canonical `## Progress` state, phase-gated STOP points), not the Claude-specific UI sugar. That means a faithful port should prioritize preserving the schemas and decision rules verbatim, and treat `AskUserQuestion`/parallel-agents/`TaskCreate` as a thin interaction layer to reimplement, not core logic to lose.

## Historical Context (from prior changes)

No prior `context/changes/` or `context/archive/` entries address Copilot porting; this is a new concern first raised in this session (see conversation summary references S2068-S2075 in session memory).

## Related Research

None on disk yet — this is the first artifact for this change.

## Open Questions

- Exact target format: single `.github/copilot-instructions.md` amendment (always-on, high token cost every turn) vs. per-skill `.github/prompts/*.prompt.md` files (explicit invocation, matches existing `/ai-*` slash-command usage) vs. both (thin always-on pointer + explicit prompt files). Recommend `.github/prompts/*.prompt.md`, one per skill, since it mirrors the current invocation pattern and avoids bloating every Copilot turn with all 11 skills' instructions.
- Whether the work laptop's Copilot plan supports custom prompt files at all (this is a GitHub Copilot Chat feature gated by IDE/plan tier) — needs confirming before the README promises it will work.
- Whether to port all 11 workflow skills or ship a reduced set first (e.g. `ai-new`, `ai-plan`, `ai-implement` as a minimal loop) and expand later.
