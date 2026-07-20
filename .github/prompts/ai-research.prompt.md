---
description: Research the codebase comprehensively to answer a question, producing a research.md with file:line references
mode: agent
tools: ['edit', 'search', 'runCommands']
---

# /ai-research — Research the Codebase

Answer a research question by exploring the codebase thoroughly and writing findings to `context/changes/<change-id>/research.md`. Read-only against source; the only write is the research document itself.

> See `.github/prompts/README.md` for shared conventions.

## Initial response

No question given → reply:

```
I'm ready to research the codebase. Please provide your research question or
area of interest, and I'll analyze it thoroughly by exploring relevant
components and connections.
```

Then wait.

## Process

### Step 1: Read directly mentioned files first

If the user names specific files (tickets, docs, JSON), read them fully (no offset/limit) before anything else. If `context/foundation/lessons.md` exists, read it too — treat its entries as known-pattern priors that narrow what's worth re-investigating.

### Step 2: Decompose the question

Break the query into concrete research areas (components, patterns, concepts to investigate). Note which directories/files look relevant.

### Step 3: Clarify scope (numbered text, skip if already tight)

If the query is ambiguous, ask 1-3 of: scope (how broad), depth (overview vs deep dive), focus (performance/patterns/history/integration), output format (summary vs full doc). Numbered options, one marked "(Recommended)", wait for reply. Skip entirely for a query that's already unambiguous and tightly scoped — e.g. "find all files using X".

### Step 4: Search the codebase sequentially

Where the source skill spawns 2-4 parallel Explore/general-purpose sub-agents, perform the same searches one after another in this turn using Copilot's file-search and read tools. For each research area: search for relevant files, read the ones that match, note file:line references and how components connect. Also check `context/changes/**/` and `context/archive/**/` for prior decisions on the same topic — supplementary historical context, not the primary source.

### Step 5: Synthesize findings

Compile results, prioritizing live codebase findings over historical context. Connect findings across components with specific file:line references. Make sure the question is actually answered with concrete evidence.

### Step 6: Resolve change folder and metadata

- Change-id: if invoked as `/ai-research <change-id>` and `context/changes/<change-id>/` exists, use it. Otherwise derive a kebab-case id from the topic and create the folder + `change.md` (same shape as `/ai-new`) before writing.
- Refuse if the resolved path starts with `context/archive/`: print "This change is archived. Open a new change with /ai-new instead." and stop.
- Update `change.md`: set `updated: <today>`; if `status` is currently `new`, advance to `status: preparing`.
- Target file: `context/changes/<change-id>/research.md` (single artifact per change).
- Gather: current date/time with timezone, git commit hash (`git rev-parse HEAD`), branch (`git branch --show-current`), repository name.

### Step 7: Write the research document

Single file, this exact shape — frontmatter fields and section headers are the schema, keep them verbatim:

```markdown
---
date: [current date and time with timezone, ISO format]
researcher: [name]
git_commit: [hash from Step 6]
branch: [branch from Step 6]
repository: [repo name]
topic: "[user's question/topic]"
tags: [research, codebase, relevant-component-names]
status: complete
last_updated: [YYYY-MM-DD]
last_updated_by: [name]
---

# Research: [user's question/topic]

**Date**: [...]  **Researcher**: [...]  **Git Commit**: [...]  **Branch**: [...]  **Repository**: [...]

## Research Question

[original user query]

## Summary

[high-level findings answering the question]

## Detailed Findings

### [Component/Area 1]

- Finding with reference (`file.ext:line`)
- Connection to other components
- Implementation details

### [Component/Area 2]
...

## Code References

- `path/to/file.py:123` - what's there
- `another/file.ts:45-67` - what's there

## Architecture Insights

[patterns, conventions, design decisions discovered]

## Historical Context (from prior changes)

[relevant insights from context/changes/**/ and context/archive/**/ with references]

## Related Research

[links to other context/changes/**/research.md or context/archive/**/research.md]

## Open Questions

[anything needing further investigation]
```

Never fill in placeholder values — gather everything in Step 6 before writing.

### Step 8: GitHub permalinks (if applicable)

If on `main`/`master` or the commit is already pushed, and `gh` is available, replace local file references with `https://github.com/{owner}/{repo}/blob/{commit}/{file}#L{line}` using `gh repo view --json owner,name` for the repo slug. Skip silently if `gh` isn't available or the commit isn't pushed.

### Step 9: Present and offer follow-up

Give a concise summary with key file references. Ask if the user has follow-up questions.

### Step 10: Follow-up questions

Append to the same document rather than creating a new one: update `last_updated`/`last_updated_by`, add `last_updated_note: "Added follow-up research for [description]"` to frontmatter, add a `## Follow-up Research [timestamp]` section, repeat Steps 3-9 as needed for the new question.

## Important notes

- Always run fresh codebase research; `context/changes/**/` and `context/archive/**/` are supplementary, not primary.
- Read mentioned files fully before searching further (Step 1) — never with offset/limit.
- Gather metadata (Step 6) before writing (Step 7) — never placeholder values.
- Frontmatter fields stay consistent across every research.md this produces; snake_case for multi-word fields.

## Copilot substitution notes

- `AskUserQuestion` → numbered text questions with one "(Recommended)" option, waiting for the user's chat reply.
- Parallel `Task`/sub-agent spawning → sequential search-and-read within this turn (Step 4).
- `TaskCreate`/`TaskUpdate` → dropped; the research document itself is the only state that matters.
- No clipboard copy — state the summary and next step plainly.
