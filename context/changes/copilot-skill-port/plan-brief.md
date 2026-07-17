# Port 10x AI Skills to GitHub Copilot — Plan Brief

> Full plan: `context/changes/copilot-skill-port/plan.md`
> Research: `context/changes/copilot-skill-port/research.md`

## What & Why

Port the 11-skill core workflow chain of the 10x AI toolkit to GitHub Copilot's `.github/prompts/*.prompt.md` format, so the user can run the same `context/changes/<id>/` workflow on a bank work laptop that has GitHub Copilot Chat but no Claude Code. Deliver a README for email distribution alongside the ported files.

## Starting Point

`.claude/skills/` has 32 skill files; 11 form the core chain (`ai-new`, `ai-shape`, `ai-frame`, `ai-research`, `ai-prd`, `ai-roadmap`, `ai-plan`, `ai-implement`, `ai-tdd`, `ai-e2e`, `ai-impl-review`), ranging 143-831 lines. The `context/changes/<id>/` artifact schema (`change.md`, `research.md`, `plan.md` with `## Progress`) is pure markdown, no tool dependency. `.github/copilot-instructions.md` already exists in this repo; `.github/prompts/` does not.

## Desired End State

`.github/prompts/` holds 11 `.prompt.md` files, each invokable via `/ai-<name>` in Copilot Chat, each producing the same artifact schema as the Claude Code originals. A README explains setup and a capability matrix for email distribution.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Target format | `.github/prompts/*.prompt.md`, one per skill | Mirrors existing explicit `/ai-*` invocation pattern, avoids bloating every turn | Research |
| Scope | Port all 11 core-chain skills | User confirmed 5-phase breakdown covering all 11, not a reduced subset | Plan |
| Rollout order | Core loop first (ai-new/ai-plan/ai-implement), then remaining 8 | Proves the conversion pattern once before applying it mechanically 8 more times | Plan |
| AskUserQuestion substitute | Numbered plain-text questions | No Copilot UI primitive for structured options exists | Research |
| Parallel sub-agent substitute | Sequential search within one Copilot Chat turn | No agent-spawning primitive in Copilot Chat | Research |
| TaskCreate/TaskUpdate substitute | Dropped, rely on `plan.md`'s `## Progress` | Toolkit already treats `## Progress` as canonical state | Research |

## Scope

**In scope:** 11 core `ai-*` skills, shared conversion pattern, README + capability matrix, manual smoke verification.

**Out of scope:** the 21 non-`ai-*` support/bootstrap skills; automated test suite for prompt files (none applies); confirming the bank laptop's Copilot tier ahead of time (flagged as risk instead).

## Architecture / Approach

One shared frontmatter + substitution-notes convention (Phase 1) applied first to the 3-skill core loop (Phase 2) to prove it works end to end, then mechanically to the remaining 8 skills (Phase 3). README and manual verification close the change (Phases 4-5).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Scaffolding & conventions | `.github/prompts/` + shared pattern doc | Copilot frontmatter schema unverified |
| 2. Core loop port | ai-new, ai-plan, ai-implement ported | Substitution pattern proven here or rework cascades |
| 3. Supporting skills port | Remaining 8 skills ported | Mechanical, low risk if Phase 2 pattern holds |
| 4. README | Email-ready setup guide + capability matrix | Must not overclaim what actually works |
| 5. Smoke verification | Manual checklist in VS Code Copilot Chat | No automated test path exists for markdown prompts |

**Prerequisites:** none — all source material (`.claude/skills/ai-*/SKILL.md`) already exists on disk.
**Estimated effort:** ~3-5 sessions across 5 phases.

## Open Risks & Assumptions

- Copilot custom-prompt-file frontmatter schema (`description`/`mode`/`tools`) is assumed from training knowledge, not confirmed via Context7 or web search (both unavailable this session). Must be verified against the actual work-laptop Copilot install before relying on it.
- Whether the bank laptop's Copilot plan/tier supports custom prompt files at all is unconfirmed — README must flag this rather than promise it works.
- Condensing 143-831-line `SKILL.md` files into leaner prompt format risks losing nuance; Phase 2's manual verification step is the main defense against this.

## Success Criteria (Summary)

- All 11 skills invokable via `/ai-<name>` in VS Code Copilot Chat
- Core loop (`ai-new` → `ai-plan` → `ai-implement`) produces correctly-shaped `context/changes/<id>/` artifacts end to end
- README lets someone unfamiliar with this repo set up and understand capability gaps in under 10 minutes
