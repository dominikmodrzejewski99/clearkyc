# ai-toolkit — Plan Brief

> Full plan: `context/changes/ai-toolkit/plan.md`
> Research: `context/changes/ai-toolkit/research.md`

## What & Why

Budujemy `@dominikmodrzejewski99/ai-toolkit` — prywatna paczke npm na GitHub Packages
zawierajaca osobisty workflow AI Dominika. Cel: jedna komenda `ai init` w nowym projekcie
zamiast recznego kopiowania skilli i konfiguracji miedzy projektami.

## Starting Point

Brak istniejacego kodu. Dostepne zasoby: szablony m5l4 (install.js, uninstall.js,
package.json, GitHub Actions) wymagajace zmiany nazw; skille Tier-1 w `~/.claude/skills/`
gotowe do skopiowania bez modyfikacji.

## Desired End State

`ai-toolkit/` w tym repo zawiera kompletny szkielet gotowy do `git init && git push`
do nowego GitHub repo. Po `npm install @dominikmodrzejewski99/ai-toolkit` w projekcie
docelowym: 9 skilli laduje w `.claude/skills/`, rules wstrzykuje sie do CLAUDE.md.
Komenda `ai init` wykrywa stack, pyta o agenty (checkboxy inquirer), generuje context/
+ pliki konfiguracyjne wybranych agentow — offline, bez zewnetrznych wywolan.

## Key Decisions Made

| Decision | Choice | Why (1 zdanie) | Source |
|---|---|---|---|
| Rejestr npm | GitHub Packages | Brak AWS, brak infry — tylko GITHUB_TOKEN | Research |
| Package name | `@dominikmodrzejewski99/ai-toolkit` | GitHub username z remote URL | Research |
| Module system | ESM (`"type": "module"`) | `@inquirer/prompts` v9+ jest ESM-only; Node >=20 | Plan |
| CLI prompts | `@inquirer/prompts` | Checkboxy i kolory vs prymitywny readline | Plan |
| Skills v1 | Wszystkie Tier-1 (9 skilli) | Kompletny arsenal, uzytkownik zdecydowal | Plan |
| Stacki v1 | Angular + Spring Boot + generic fallback | Aktywne stacki + safety net dla nieznanych | Plan |
| Kolizja plikow | Per-file: Overwrite / Skip / Abort | FR-008 doslosnie, pelna granularna kontrola | Plan |
| Testy | Vitest unit tests dla logiki | Szybkie, bez systemu plikow; integracyjne to v2 | Plan |
| Postinstall | Nieinaktywny — brak inquirer | Postinstall moze nie miec TTY | Plan |

## Scope

**In scope:**
- Package infrastructure (package.json, install.js, uninstall.js, .npmrc)
- 9 skilli Tier-1 jako payload paczki
- CLI `ai init`: detekcja stacku, wybor agentow, scaffold context/, generowanie CLAUDE.md + copilot + cursorrules
- Szablony: CLAUDE.angular.md, CLAUDE.spring.md, CLAUDE.generic.md, copilot, cursorrules, context READMEs
- Vitest unit tests dla detect-stack, file-ops, generate-agents
- GitHub Actions publish workflow

**Out of scope:**
- Next.js / Go / Rust szablony (v2)
- Interaktywny TUI / web UI
- Sync skills po init (jednorazowa kopia)
- CLI `--force` flag
- Integracyjne testy CLI (v2)
- Wiecej niz 3 agenty AI

## Architecture / Approach

Dwa oddzielne komponenty w jednej paczce: **Dystrybutor** (`install.js` — postinstall,
nieinaktywny, kopiuje skills/rules, idempotentny) i **CLI** (`bin/ai.js` — interaktywny
`ai init`, uzywany recznie, ma TTY). Rozdzielenie krytyczne: postinstall nie moze
uzywac inquirer bo moze nie miec TTY. Caly pakiet ESM, Node >=20.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Package Infrastructure | package.json, install.js, uninstall.js, .npmrc | ESM migration z szablonu CJS |
| 2. Skills + Rules Payload | 9 skilli w ai-toolkit/skills/, rules/CLAUDE.md | Skill frontmatter validation |
| 3. CLI — ai init | Pelny interaktywny flow `ai init` (src/) | TTY assumptions w file-ops |
| 4. Templates | CLAUDE.md x3, copilot, cursorrules, context READMEs | Spring template bazuje na ClearKYC |
| 5. Testy + CI/CD | Vitest tests pass, npm pack --dry-run, publish.yml | Vitest mock setup dla ESM |

**Prerequisites:** Dostep do `~/.claude/skills/` (kopiowanie Tier-1 skilli w Phase 2)
**Estimated effort:** ~3-4 sesje wieczorowe across 5 faz

## Open Risks & Assumptions

- GitHub username `dominikmodrzejewski99` zakladamy z remote URL — potwierdzic przed pierwszym `npm publish`
- Generic fallback dodany mimo ze uzytkownik nie wymagal — bezpiecznik dla nieznanych stackow
- `@inquirer/prompts` wersja do ustalenia przy `npm install` — pinujemy ^7.3.2 ale API moze sie roznic
- rules/CLAUDE.md placeholder — uzytkownik musi uzupelnic wlasna trescia przed publishem

## Success Criteria (Summary)

- `cd ai-toolkit && npm test` — 0 failed, `npm pack --dry-run` — bez bledu
- `ai init` w pustym katalogu przechodzi pelny interaktywny flow i generuje poprawne pliki
- Paczka gotowa do `git init && git push` i publikacji przez GitHub Actions
