# Running the 10x AI Toolkit on GitHub Copilot Chat

This is for the laptop that only has GitHub Copilot Chat (VS Code), not Claude Code. It explains how to get the toolkit's 11 core skills working there, and what changes in behavior versus the Claude Code originals.

> **Unverified assumption, read this first:** the prompt-file frontmatter shape used below (`description` / `mode: agent` / `tools`) is based on general knowledge of GitHub Copilot custom prompt files, **not confirmed against current Copilot docs** (both Context7 and web search were unavailable when this was written). Before relying on this for real work: open one `.prompt.md` file in VS Code, confirm it shows up as a recognized slash command, and check VS Code's own Copilot documentation. If the schema is different, the fix is mechanical — update the frontmatter block in every file the same way.

## Setup

1. Copy these onto the work laptop's clone of this repo (or any repo you want the toolkit in):
   - `.github/prompts/*.prompt.md` (11 files)
   - `.github/copilot-instructions.md`
2. Open the repo in VS Code with GitHub Copilot Chat enabled.
3. In Copilot Chat, type `/` — the 11 skills should appear as `/ai-new`, `/ai-shape`, `/ai-frame`, `/ai-research`, `/ai-prd`, `/ai-roadmap`, `/ai-plan`, `/ai-implement`, `/ai-tdd`, `/ai-e2e`, `/ai-impl-review`.
4. Invoke the same way you would in Claude Code: `/ai-new <change-id>`, then follow the prompts.

The workflow is identical to Claude Code's: everything lives in `context/changes/<change-id>/` as plain markdown (`change.md`, `research.md`, `plan.md` with a `## Progress` section as the canonical state). Nothing about that state layer changed — only how each skill talks to you inside the chat window.

## What's different from Claude Code

Four Claude Code mechanisms have no Copilot Chat equivalent. Every ported skill substitutes the same way:

| Claude Code mechanism | Copilot substitution |
|---|---|
| `AskUserQuestion` (structured multi-choice UI) | Numbered plain-text question in chat, one option marked "(Recommended)", waits for your reply as a number or free text |
| `Task`/`Agent` parallel sub-agents | Sequential search-and-read within the same turn — slower, but same end result on a single-repo scope |
| `TaskCreate`/`TaskUpdate`/`TaskList` (status-bar tracking) | Dropped. `plan.md`'s `## Progress` section is already the source of truth; skills read/update it directly instead of mirroring state into a separate tracker |
| Frontmatter-driven auto-invocation | Explicit `/name` invocation only — matches how you already use the toolkit (`/ai-new`, `/ai-plan`, ...), so this is a wash, not a regression |

## Capability matrix

Per skill, which of the four substitutions it actually exercises (based on what the source `SKILL.md` uses):

| Skill | AskUserQuestion → text | Parallel agents → sequential | Task tracking → `## Progress` | Auto-invoke → explicit `/name` |
|---|---|---|---|---|
| `/ai-new` | Yes | N/A | N/A | Yes |
| `/ai-shape` | Yes | N/A | Yes | Yes |
| `/ai-frame` | Yes | Yes | Yes | Yes |
| `/ai-research` | Yes | Yes | Yes | Yes |
| `/ai-prd` | Yes | N/A | Yes | Yes |
| `/ai-roadmap` | Yes | N/A | Yes | Yes |
| `/ai-plan` | Yes | Yes | Yes | Yes |
| `/ai-implement` | Yes | Yes | Yes | Yes |
| `/ai-tdd` | Yes | N/A | Yes | Yes |
| `/ai-e2e` | Yes | N/A | Yes | Yes |
| `/ai-impl-review` | Yes | Yes | Yes | Yes |

`ai-research` and `ai-implement` carry the heaviest substitution burden (all four mechanisms) — spot-check those first if something feels off.

## What's out of scope

- The other 21 non-`ai-*` skills (`10x-*`, `pack-init`, `setup-cicd`, `tf-registry`, `context7-mcp`, `impeccable`) are **not** ported. Only the 11-skill core workflow chain is.
- No automated test suite — these are markdown instructions, not code. Verification is manual: run the loop on a scratch change-id and check the output files.
- The bank laptop's exact Copilot plan/tier was not confirmed ahead of time. If a skill doesn't show up as a slash command, that's the first thing to check.

## First thing to try

```
/ai-new copilot-port-smoketest
```

Confirm it creates `context/changes/copilot-port-smoketest/change.md` with the expected frontmatter, then delete the folder once you're satisfied it works.
