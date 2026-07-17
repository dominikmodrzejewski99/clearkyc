---
change_id: copilot-skill-port
title: Port 10x AI skills to GitHub Copilot for a Copilot-only work laptop
status: implementing
created: 2026-07-17
updated: 2026-07-17
archived_at: null
---

## Notes

User needs to bring the 10x AI toolkit (11 Claude Code skills under `.claude/skills/`) to a bank work laptop that only has GitHub Copilot Chat, no Claude Code access. Two deliverables:

1. A README (for email) explaining how to set up the toolkit on the Copilot-only machine and which skills will/won't work as-is.
2. Rewritten skill files, adapted to `.github/prompts/*.prompt.md` (Copilot's custom-prompt format), for skills where a direct port is feasible.

Prior research (this session) mapped the full workflow (ai-shape -> ai-prd -> ai-roadmap -> ai-plan -> ai-implement/ai-tdd/ai-e2e -> ai-impl-review) and found:
- Directory structure and markdown artifacts (change.md, plan.md, research.md schemas) are tool-agnostic and portable as-is.
- Decision logic and templates translate to plain text but lose UI convenience.
- Claude-specific mechanisms without a Copilot equivalent: AskUserQuestion (structured option UI), Task/Agent parallel sub-agent spawning, TaskCreate/TaskUpdate status-bar tracking, skill-trigger phrase matching.
- Sub-agent parallelism must become sequential search in Copilot; structured questions become numbered textual prompts.

Constraint: bank environment, so no exotic tooling, just markdown prompt files Copilot Chat can consume, plus a plain-English gap explanation for the email.
