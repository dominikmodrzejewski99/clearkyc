# 10x AI Toolkit — GitHub Copilot Prompt Files

This directory holds the Copilot Chat port of the 10x AI toolkit's core `ai-*` skill chain. Each `.prompt.md` file is invoked in VS Code Copilot Chat via `/<filename-without-extension>`, e.g. `.github/prompts/ai-new.prompt.md` becomes `/ai-new`.

Source of truth for the original skills: `.claude/skills/ai-*/SKILL.md` (Claude Code format). These prompt files are condensed ports, not verbatim copies — the `context/changes/<change-id>/` artifact schemas (`change.md`, `research.md`, `plan.md`, `## Progress`) are preserved exactly; only the interaction layer is adapted.

## Frontmatter template

Every ported `.prompt.md` file starts with:

```yaml
---
description: <one-line summary, mirrors the source SKILL.md's description field>
mode: agent
tools: ['edit', 'search', 'runCommands']
---
```

**Unverified assumption**: this frontmatter shape (`description`/`mode`/`tools`) is based on general knowledge of GitHub Copilot custom prompt files, not confirmed against current docs (Context7 and web search were both unavailable when this was written). Before relying on this for real work, verify against the actual Copilot install: open a `.prompt.md` file in VS Code and confirm it's recognized as a slash command, or check VS Code's Copilot documentation directly. If the schema differs, fix this template first, then re-apply to the other ported files.

## Substitution patterns

Claude Code skills use four mechanisms Copilot Chat has no equivalent for. Every ported skill applies the same substitution:

1. **`AskUserQuestion` (structured multi-option UI) → numbered plain-text question.** Instead of a UI widget with labeled options, the prompt asks the user a question as a numbered list in chat, states which option is recommended and why, and waits for the user's reply (a number or free text) before continuing.

2. **`Task`/`Agent` parallel sub-agent spawning → sequential search within one turn.** Where the original skill spawns 2-4 concurrent Explore/general-purpose agents, the ported prompt instead performs the same searches one after another in the current chat turn, using Copilot's own file-search and read tools. Slower, same eventual findings.

3. **`TaskCreate`/`TaskUpdate`/`TaskList` status-bar tracking → dropped.** Copilot Chat has no status-bar task list. The `## Progress` section in `plan.md` is already the toolkit's canonical state; ported prompts read and update it directly instead of mirroring state into a separate tracker.

4. **Frontmatter-driven auto-invocation → explicit `/name` invocation.** Claude Code can surface a skill automatically by matching its `description` against the conversation. Copilot has no equivalent — every prompt file must be invoked explicitly by its filename-derived slash command. This matches how this toolkit is already used (`/ai-new`, `/ai-plan`, etc.), so it's a wash, not a regression.

## Adding a new ported skill

1. Read the source `.claude/skills/<name>/SKILL.md` fully.
2. Copy the frontmatter template above, filling in `description`.
3. Condense the body, preserving any document schema (frontmatter fields, section headers, table shapes) verbatim.
4. Apply the four substitution patterns above wherever the source uses `AskUserQuestion`, `Task`, or `TaskCreate`/`TaskUpdate`.
5. Save as `.github/prompts/<name>.prompt.md`.
