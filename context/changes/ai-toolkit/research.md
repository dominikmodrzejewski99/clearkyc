---
date: 2026-06-30T18:35:00+02:00
researcher: Dominik Modrzejewski
git_commit: f7aaf40ddb0e2f122e40beef619820806ca0f4c8
branch: main
repository: clearkyc
topic: "ai-toolkit: budowa prywatnej paczki npm z workflow AI"
tags: [research, ai-toolkit, npm, github-packages, cli, skills]
status: complete
last_updated: 2026-06-30
last_updated_by: Dominik Modrzejewski
---

# Research: ai-toolkit - budowa prywatnej paczki npm z workflow AI

**Date**: 2026-06-30T18:35:00+02:00
**Researcher**: Dominik Modrzejewski
**Git Commit**: f7aaf40ddb0e2f122e40beef619820806ca0f4c8
**Branch**: main
**Repository**: clearkyc

## Research Question

Co jest potrzebne do zbudowania ai-toolkit jako prywatnej paczki npm na GitHub Packages,
zgodnie z wymaganiami z shape-notes.md i specyfikacjami z lekcji m5l4?

## Summary

ai-toolkit to **superset** modelu z lekcji m5l4. Lekcja pokrywa dystrybucje artefaktow AI
(skills/rules przez postinstall) - to jest infrastruktura paczki. ai-toolkit dodaje do tego
interaktywne CLI (`ai init`) z detekcja stacku i generowaniem konfiguracj - czego szablony
m5l4 NIE pokrywaja i co trzeba zbudowac od podstaw.

Paczka sklada sie z dwoch rozlacznych komponentow:
1. **Dystrybutor** (`install.js` / `uninstall.js`) - automatyczny postinstall, kopiuje skills/rules.
   Szablon z m5l4 dziala prawie bez zmian.
2. **CLI** (`bin/ai.js`) - interaktywny `ai init`, detekcja stacku, generowanie CLAUDE.md,
   pytanie o agenty. To jest core value produktu i wymaga implementacji od zera.

Nazwa paczki: `@dominikmodrzejewski99/ai-toolkit` (GitHub username z remote URL).

## Detailed Findings

### 1. Wymagania produktowe (shape-notes.md)

Zrodlo: `context/foundation/shape-notes.md`

**9 Functional Requirements (wszystkie must-have):**

- FR-001: `ai init` uruchamia pelny scaffold AI workflow
- FR-002: tworzy `context/` (changes/, foundation/, archive/) z README-ami
- FR-003: generuje `CLAUDE.md` dostosowany do wykrytego stacku (stack-aware, nie szablon statyczny)
- FR-004: pyta ktore agenty AI sa uzywane (Claude Code / Copilot / Cursor) i generuje tylko wybrane pliki
- FR-005: generuje pliki per agent: `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursorrules`
- FR-006: instaluje skills do `.claude/skills/` (jesli Claude Code wybrany)
- FR-007: wypisuje liste next-steps po zakonczeniu
- FR-008: pyta o akcje (nadpisz/pomin) gdy plik juz istnieje - nigdy nie nadpisuje milczkiem
- FR-010: paczka instalowana z prywatnego rejestru npm, bez zewnetrznego dostepu
- FR-011: automatyczna detekcja stacku z plikow manifestow (package.json, pom.xml, go.mod, Cargo.toml)

**Non-Functional Requirements:**
- Zero zewnetrznych wywolan API podczas `ai init` (offline-first, full stack detection)
- Dane projektu nie opuszczaja lokalnego srodowiska

**Non-Goals (v1):**
- Max 3 agenty (Claude Code, Copilot, Cursor) - Windsurf, Cline to v2
- Brak TUI ani web UI - tylko prompty terminalowe
- Brak generowania testow i CI/CD config
- Brak sync skills po init (jednorazowa kopia - dryf zaakceptowany do v2)

### 2. Model techniczny (m5l4 - GitHub Packages)

Zrodlo: `.claude/prompts/m5l4-github-packages-spec-pack.md`

**Gotowe szablony z m5l4 (do zaadaptowania):**
- `package.json` template: `.claude/config-templates/m5l4-github-packages-package.json.template`
- `install.js` (kompletny installer z sentinel markers): `.claude/config-templates/m5l4-github-packages-install.js.template`
- `uninstall.js` (manifest-based uninstall): `.claude/config-templates/m5l4-github-packages-uninstall.js.template`
- GitHub Actions workflow: `.claude/config-templates/m5l4-github-packages-publish-ai-toolkit.yml.template`

**Instalator m5l4 - co juz umie (bez zmian):**
- Kopiuje `skills/` do `.claude/skills/<skill-name>/`
- Wstrzykuje rules do `CLAUDE.md` miedzy sentinel markers
- Zapisuje manifest `.claude/.ai-toolkit-manifest.json` z wersja i lista plikow
- Idempotentny: drugi install updatuje zamiast duplikowac
- Nie wysypuje calego `npm install` gdy postinstall nie przejdzie

**Wartosci do podmiany w szablonach:**
- `@twoj-zespol/ai-toolkit` -> `@dominikmodrzejewski99/ai-toolkit`
- `ai-toolkit` (bin name) -> `dm`
- Sentinel markers: `<!-- BEGIN @dominikmodrzejewski99/ai-toolkit -->` / `<!-- END ... -->`
- Manifest: `.claude/.ai-toolkit-manifest.json`

### 3. Struktura docelowa paczki

```text
ai-toolkit/              <- osobne repo: github.com/dominikmodrzejewski99/ai-toolkit
├── package.json         <- @dominikmodrzejewski99/ai-toolkit, bin: {dm: ./bin/ai.js}
├── .npmrc               <- @dominikmodrzejewski99:registry=https://npm.pkg.github.com
├── README.md
├── install.js           <- postinstall: kopiuje skills/ + rules/ (z szablonu m5l4)
├── uninstall.js         <- manifest-based cleanup (z szablonu m5l4)
├── bin/
│   └── ai.js            <- CLI: ai init (DO ZBUDOWANIA - nie ma w m5l4)
├── skills/              <- skille do zainstalowania przy npm install
│   ├── implement/
│   ├── plan/
│   ├── test/
│   ├── review/
│   └── ...              <- (lista ponizej)
├── rules/
│   └── CLAUDE.md        <- rules wstrzykiwane przy install
└── .github/
    └── workflows/
        └── publish.yml  <- z szablonu m5l4 (podmieniony scope)
```

### 4. Inwentarz skilli do zbundlowania

Zrodlo: agent Explore przeszukujacy `.claude/skills/` i `~/.claude/skills/`

**Tier 1 - rdzen kazdego projektu (zdecydowanie bundlowac):**

Z globalnych (`~/.claude/skills/`):
- `implement` - wykonaj plan z PLAN.md (PL, live coding discipline)
- `plan` - lekki plan z TASK.md (PL)
- `test` - testy jednostkowe z autodetekcja frameworka
- `e2e` - Playwright/Cypress E2E
- `review` - code review pod katem jakosci
- `reset` - cofnij zmiany do stanu sprzed zadania
- `start` - przygotuj projekt do live codingu
- `context7-mcp` - fetch dokumentacji bibliotek przez MCP
- `impeccable` - design/UX improvement

**Tier 2 - opcjonalne, ogolne:**
- `10x-health-check` - dependency audit, security scan
- `10x-shape` - structured discovery do shape-notes.md
- `10x-mom-test` - walidacja pomyslu Mom Test
- `10x-research` - research codebase z sub-agentami
- `10x-plan`, `10x-implement`, `10x-new` - change management workflow

**Tier 3 - pomijac w v1 (zbyt ClearKYC-specific lub ciazkie):**
- `angular-pitfalls` - tylko Angular
- `pack-init`, `setup-cicd`, `tf-registry` - infrastruktura samego toolkitu (bootstrap, nie day-to-day)
- Pozostale `10x-*` (28 skilli) - caly change management to v2

### 5. Glowna luka architektoniczna: CLI `ai init`

Szablony m5l4 obejmuja dystrybutor artefaktow. Nie ma w nich:

**A. Detekcja stacku (FR-011)**
Logika w `bin/ai.js`: skanuj biezacy katalog pod katem znanych manifestow, wyznacz framework:
```
package.json + angular.json  -> Angular
package.json + next.config*  -> Next.js
package.json                 -> Node/generic JS
pom.xml                      -> Java/Spring
go.mod                       -> Go
Cargo.toml                   -> Rust
requirements.txt / pyproject -> Python
```

**B. Szablony CLAUDE.md per stack (FR-003)**
Statyczne pliki `.md` w paczce, jeden per wykryty stack. Przy `ai init` odpowiedni szablon
kopiowany do projektu z uzupelnieniem przez uzytkownika.
Minimum v1: Angular, Spring Boot, Next.js, Go, generic.

**C. Interaktywny prompt agentow (FR-004)**
`ai init` pyta (np. `@inquirer/prompts` lub prosta readline):
```
Which AI agents does this project use?
> [x] Claude Code
> [ ] GitHub Copilot
> [ ] Cursor
```
Dla kazdego zaznaczonego generuje odpowiedni plik konfiguracyjny.

**D. Scaffold context/ (FR-002)**
Tworzy drzewo katalogow z README-ami (logika identyczna jak `10x-init` - do skopiowania).

**E. Bezpieczna kolizja plikow (FR-008)**
Przed kazdym zapisem sprawdza czy plik istnieje i pyta: `[O]verwrite / [S]kip / [A]bort`.

### 6. CI/CD - GitHub Actions

Z szablonu m5l4 (`m5l4-github-packages-publish-ai-toolkit.yml.template`) po podmianie wartosci:
- Trigger: push na `main` lub PR
- Permissions: `contents: read`, `packages: write`
- Validation job: sprawdza `package.json`, `SKILL.md` frontmatter, `npm pack --dry-run`
- Publish job: `npm publish` z `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
- Brak AWS, Terraform, IAM - tylko GITHUB_TOKEN (ephemeral, bez konfiguracji secrets)

## Code References

- `context/foundation/shape-notes.md` - pelna specyfikacja produktu (9 FRs, non-goals, OQ)
- `.claude/prompts/m5l4-github-packages-spec-pack.md` - spec paczki GitHub Packages
- `.claude/prompts/m5l4-github-packages-spec-cicd.md` - spec CI/CD GitHub Actions
- `.claude/config-templates/m5l4-github-packages-install.js.template` - kompletny installer
- `.claude/config-templates/m5l4-github-packages-uninstall.js.template` - uninstaller
- `.claude/config-templates/m5l4-github-packages-package.json.template` - package.json
- `.claude/config-templates/m5l4-github-packages-publish-ai-toolkit.yml.template` - GH Actions

## Architecture Insights

**Dwa komponenty, dwie odpowiedzialnosci:**

`install.js` (postinstall) = jednorazowe zdarzenie npm, kopiuje statyczne artefakty.
`bin/ai.js` (CLI) = interaktywna sesja z uzytkownikiem, stack detection, dynamic generation.

To sa rozlaczne problemy. Postinstall NIE powinien byc interaktywny (odpala sie w trakcie
`npm install`, moze nie miec TTY). CLI jest osobnym procesem, odpalany recznie.

**Package.json rozroznia te role:**
```json
{
  "scripts": { "postinstall": "node install.js" },
  "bin": { "ai": "./bin/ai.js" }
}
```

**Sentinel markers sa krytyczne dla idempotentnosci rules:**
```
<!-- BEGIN @dominikmodrzejewski99/ai-toolkit -->
...team rules...
<!-- END @dominikmodrzejewski99/ai-toolkit -->
```
Bez nich drugi `npm install` zduplikowalby rules w CLAUDE.md.

**Manifest JSON sluzy jako kontrakt uninstall:**
`.claude/.ai-toolkit-manifest.json` - zapisuje liste zainstalowanych plikow przy install,
uninstall.js czyta manifest zamiast zgadywac co usunac.

## Historical Context (from prior changes)

- `context/foundation/shape-notes.md` - shape notes ai-toolkit (draft 2026-06-25, Phase 8)
  - 9 FRs z blokami Socratesa, quality_check_status: accepted
  - Open Question 1 (rejestr npm) - rozwiazane w tej sesji: GitHub Packages

Brak innych powiazanych zmian w `context/changes/` - ai-toolkit jest nowym projektem
bez historii w tym repo.

## Open Questions

1. **GitHub username dla scope paczki**: wykryty jako `dominikmodrzejewski99` z remote URL
   (`https://github.com/dominikmodrzejewski99/clearkyc.git`). Potwierdzic przed pierwszym publish.

2. **Ktore skille Tier 1 wchodzą do v1?** Lista z section 4 to rekomendacja - ostateczna
   selekcja nalezy do Dominika (ile skilli jest w globalnych vs projektowych, co warto kopiowac).

3. **Dependency na `@inquirer/prompts` vs `readline`?** Inquirer daje lepszy UX (checkboxy, kolorki)
   ale dodaje zewnetrzna zaleznosc. Readline jest zero-dep ale prymitywne. Rekomendacja: Inquirer
   dla `ai init` (jedyna dev-facing komenda), ale zdecydowac przed implementacja.

4. **Szablony CLAUDE.md per stack**: ile stackow pokrywac w v1? Minimum: Angular (Dominik uzywany),
   Spring Boot (aktualny projekt), Next.js (popularne), generic. Go, Rust, Python to v2.

5. **Osobne repo**: zgodnie z ustaleniem w sesji - paczka bedzie w osobnym repo
   `dominikmodrzejewski99/ai-toolkit`. Ten plik pozostaje w obecnym repo jako dokumentacja zmiany.
