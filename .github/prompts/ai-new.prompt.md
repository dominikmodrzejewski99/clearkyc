---
description: Initialize a new change folder under context/changes/<change-id> with a change.md identity file
mode: agent
tools: ['edit', 'search', 'runCommands']
---

# /ai-new — Start a New Change

Bootstrap a new change folder under `context/changes/<change-id>/`. Creates a `change.md` identity file and points the user at the next skill. A "change" is one unit of work end-to-end — research, planning, implementation, and review all live inside one folder keyed by `<change-id>`.

> See `.github/prompts/README.md` for the shared frontmatter/substitution conventions this file follows.

## Initial response

If no argument given, reply with the usage message below and stop — wait for the user's next chat message with the change-id:

```
I'll create a new change folder. Please provide a change-id (kebab-case slug):

Examples:
  /ai-new context-dir-restructure
  /ai-new oauth-login add Google sign-in so users skip the email-password step
  /ai-new @context/changes/oauth-login/

The first token becomes the change-id. Anything after it is freeform intent.
The change-id must be kebab-case (lowercase letters, digits, hyphens; no
leading/trailing hyphen, no double hyphens) and unique across
context/changes/ and context/archive/.
```

## Argument parsing

Split the raw argument on the first run of whitespace. First token = change-id reference: strip leading `@`, strip trailing `/`, if it contains `/` take the last path segment. Everything after the first token is freeform intent (may be empty; do not insert verbatim as a title).

## Validation (stop and report on failure)

1. **kebab-case**: must match `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`. On failure: `error: change-id "<id>" is not kebab-case. Use lowercase letters, digits, and single hyphens only.`
2. **Uniqueness**: neither `context/changes/<change-id>/` nor `context/archive/<change-id>/` may exist. On collision: `error: change "<id>" already exists at <path>.`
3. **Parent exists**: if `context/changes/` is missing, print `error: context/changes/ not found — is this repo set up for the 10x context structure?` and stop. Do not auto-create it.

## Creation

1. Create `context/changes/<change-id>/`.
2. Derive `<title>`: if intent is empty, humanize the change-id (hyphens → spaces, capitalize first letter). If intent is non-empty, write a concise title (≤80 chars, sentence case, no trailing period) — rephrase, don't dump the raw sentence.
3. Derive the `## Notes` body: if intent is empty, use the hint comment `<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->`; if non-empty, use the intent verbatim as the Notes body (no hint comment).
4. Write `context/changes/<change-id>/change.md`:

```markdown
---
change_id: <change-id>
title: <title>
status: new
created: <YYYY-MM-DD>
updated: <YYYY-MM-DD>
archived_at: null
---

## Notes

<notes-body>
```

Use today's date for both `created` and `updated`.

## Next-step suggestion

Default next step is `/ai-plan <change-id>`. Suggest `/ai-research <change-id>` instead when the intent signals the change needs codebase exploration first; suggest `/ai-frame <change-id>` when the intent signals the framing itself is suspect (bug-shaped: "fix", "bug", "broken", "root cause", "regression" — or scope-shaped: "should we even", "is this the right", "rethink"). Pick the situational option only on a clear signal, otherwise default.

Display (no clipboard support assumed in Copilot Chat — state the command plainly):

```
✓ Created context/changes/<change-id>/change.md (status: new)

Next step: /ai-plan <change-id>

Other options:
  /ai-research <change-id>   — explore the codebase first
  /ai-frame <change-id>      — challenge the framing first
```

## What this skill does NOT do

- Does not write `frame.md`, `research.md`, or `plan.md` — those come from their own prompts.
- Does not enforce status transitions — `change.md` is record-only.
- Does not create the `context/changes/` parent directory.

## Copilot substitution notes

- No clipboard copy (Claude-Code-CLI-specific) — just print the next command.
- No `AskUserQuestion` needed in this flow; all decisions are deterministic from the parsed argument.
