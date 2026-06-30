# ai-toolkit Implementation Plan

## Overview

Budujemy `@dominikmodrzejewski99/ai-toolkit` — prywatna paczka npm na GitHub Packages
ktora robi dwie rzeczy: (1) dystrybuuje skille/rules do projektow przez postinstall, oraz
(2) udostepnia CLI `ai init` ktore interaktywnie inicjalizuje workflow AI w nowym projekcie.

Szkielet generujemy w katalogu `ai-toolkit/` w tym repo. Po ukonczeniu uzytkownik przenosi
go do osobnego repozytorium `dominikmodrzejewski99/ai-toolkit` i pushuje do GitHub.

## Current State Analysis

Brak istniejacego kodu — greenfield. Dostepne zasoby:
- Szablony m5l4 w `.claude/config-templates/m5l4-github-packages-*.template` — gotowy
  install.js, uninstall.js, package.json, GitHub Actions workflow. Wymagaja zmiany nazwy.
- Skille Tier-1 w `~/.claude/skills/` — do skopiowania bez modyfikacji.
- Shape notes w `context/foundation/shape-notes.md` — 9 FRs, non-goals, OQ.
- Research w `context/changes/ai-toolkit/research.md` — architektura, decyzje, mapowanie.

## Desired End State

Katalog `ai-toolkit/` zawiera kompletny szkielet paczki gotowy do `git init && git push`.
Po `npm install @dominikmodrzejewski99/ai-toolkit` w projekcie docelowym: skille Tier-1
laduja w `.claude/skills/`, rules wstrzykuja sie do CLAUDE.md miedzy sentinel markers.
Komenda `ai init` pyta o agenty, wykrywa stack i generuje context/ + pliki konfiguracyjne
dla wybranych agentow — wszystko lokalnie, bez zewnetrznych wywolan.

### Key Discoveries:

- Szablony m5l4 uzywaja CommonJS (`require`). Pakiet docelowy bedzie ESM (`"type": "module"`)
  bo `@inquirer/prompts` v9+ jest ESM-only i Node >=20 wspiera ESM natywnie.
  install.js zostanie przepisany do ESM (zmiana mechaniczna, ta sama logika).
- `@inquirer/prompts` musi byc w `dependencies` (nie devDependencies) bo bin/ai.js
  uruchamia sie w srodowisku konsumenta, nie tylko podczas publishowania.
- Detekcja Angular: sprawdzamy `angular.json` PRZED `package.json` (oba wystepuja razem).
- GitHub Packages wymaga `@dominikmodrzejewski99:registry=https://npm.pkg.github.com`
  w `.npmrc` konsumenta do instalacji prywatnej paczki.

## What We're NOT Doing

- Brak generowania testow i konfiguracji CI/CD projektu docelowego (tylko workflow AI)
- Brak interaktywnego TUI / web UI — tylko terminal prompts
- Brak sync skills po init (jednorazowa kopia; mechanizm sync to v2)
- Brak obslugi wiecej niz 3 agentow (Claude Code, Copilot, Cursor)
- Brak Next.js / Go / Rust szablonow w v1 (generic fallback dla nierozpoznanych stackow)
- Brak CLI `--force` flag w v1 (tylko interaktywne pytanie per plik)
- Brak `npx ai-toolkit install` manual mode — tylko postinstall + bin `dm`

## Implementation Approach

Piec faz sekwencyjnych; kazda weryfikowalna niezaleznie:
1. Package infrastructure — adaptacja szablonow m5l4, pliki packageu
2. Skills + rules payload — kopiowanie skilli, minimalne rules
3. CLI core — logika ai init (src/) i entry point (bin/)
4. Templates — szablony CLAUDE.md i plikow konfiguracyjnych agentow
5. Testy + CI/CD — Vitest unit tests, GitHub Actions publish workflow

## Critical Implementation Details

**ESM vs CommonJS**: Caly pakiet uzywa `"type": "module"`. Wszystkie `.js` pliki pisane
z `import`/`export`. Dotyczy to rowniez install.js i uninstall.js — mechanicznie
przeksztalcamy `require('node:fs')` na `import fs from 'node:fs'`.

**Postinstall bez TTY**: `install.js` (postinstall) nie moze byc interaktywny — odpala sie
podczas `npm install` i moze nie miec TTY. Inquirer jest uzywane TYLKO w `bin/ai.js`.
install.js jest w pelni nieinaktywny: kopiuje, wstrzykuje, zapisuje manifest.

**Collision handling zaklada TTY**: `safeWrite()` z promptem Overwrite/Skip/Abort uzywa
`@inquirer/prompts` i zaklada ze jest TTY. Jest uzywana tylko z `ai init` (bin/),
nigdy z postinstall.

---

## Phase 1: Package Infrastructure

### Overview

Tworzy podstawowa strukture paczki npm: package.json, .npmrc, install.js, uninstall.js,
README.md. Adaptuje szablony m5l4 do ai-toolkit (podmienione nazwy, ESM).

### Changes Required:

#### 1. Katalog paczki

**File**: `ai-toolkit/` (nowy katalog w root tego repo)

**Intent**: Punkt startowy dla calej paczki. Nie bedzie commitowany do clearkyc —
sluzy tylko jako workspace do wygenerowania szkieletu przed przeniesieniem do nowego repo.

#### 2. package.json

**File**: `ai-toolkit/package.json`

**Intent**: Konfiguracja paczki npm z publishConfig na GitHub Packages, bin `dm`,
postinstall, dependencies (inquirer) i engines (node >=20).

**Contract**:
```json
{
  "name": "@dominikmodrzejewski99/ai-toolkit",
  "version": "0.1.0",
  "description": "Personal AI workflow toolkit — ai init for new projects",
  "type": "module",
  "license": "UNLICENSED",
  "publishConfig": { "registry": "https://npm.pkg.github.com" },
  "files": ["skills/", "rules/", "templates/", "install.js", "uninstall.js", "bin/", "README.md"],
  "scripts": { "postinstall": "node install.js", "test": "vitest run" },
  "bin": { "ai": "./bin/ai.js" },
  "dependencies": { "@inquirer/prompts": "^7.3.2" },
  "devDependencies": { "vitest": "^3.0.0" },
  "engines": { "node": ">=20" }
}
```

#### 3. .npmrc

**File**: `ai-toolkit/.npmrc`

**Intent**: Mapuje scope `@dominikmodrzejewski99` na GitHub Packages registry.
Nie zawiera tokena — token wchodzi przez zmienna srodowiskowa lub user-level .npmrc.

**Contract**: `@dominikmodrzejewski99:registry=https://npm.pkg.github.com`

#### 4. install.js

**File**: `ai-toolkit/install.js`

**Intent**: Postinstall script (automatyczny przy npm install). Kopiuje skills/ do
`.claude/skills/`, wstrzykuje rules do CLAUDE.md miedzy sentinel markers, zapisuje
manifest. Idempotentny — drugi install aktualizuje zamiast duplikowac.
Bazuje na `.claude/config-templates/m5l4-github-packages-install.js.template`,
przepisany do ESM z podmienionymi stalymi.

**Contract**: Stale do podmiany wzgledem szablonu:
- `PACKAGE_NAME = "@dominikmodrzejewski99/ai-toolkit"`
- `MANIFEST = ".ai-toolkit-manifest.json"`
- BEGIN/END sentinels uzywaja PACKAGE_NAME
Cala reszta logiki (findProjectRoot, copyDir, applyRulesBlock, writeManifest) bez zmian.

#### 5. uninstall.js

**File**: `ai-toolkit/uninstall.js`

**Intent**: Usuwa zainstalowane pliki na podstawie manifestu. Bazuje na szablonie m5l4,
przepisany do ESM z podmienionymi stalymi.

**Contract**: Te same stale co install.js. Logika bez zmian.

#### 6. README.md

**File**: `ai-toolkit/README.md`

**Intent**: Minimalna dokumentacja: czym jest paczka, jak zainstalowac (npmrc + npm install),
jak uzywac `ai init`, jak odinstalowac.

### Success Criteria:

#### Automated Verification:

- `node -e "import('./ai-toolkit/package.json', {assert: {type: 'json'}}).then(m => console.log(m.default.name))"` wypisuje `@dominikmodrzejewski99/ai-toolkit`
- `cd ai-toolkit && node install.js` wykonuje sie bez bledu w test katalogu
- `cd ai-toolkit && node -e "import('./install.js')"` nie rzuca syntax error

#### Manual Verification:

- package.json ma wszystkie wymagane pola (name, version, publishConfig, bin, files, type: module)
- install.js i uninstall.js uzywaja `import` (nie `require`)
- Sentinel markers zawieraja prawidlowa nazwe paczki

---

## Phase 2: Skills + Rules Payload

### Overview

Kopiuje wszystkie Tier-1 skille z globalnego `~/.claude/skills/` do `ai-toolkit/skills/`.
Tworzy `ai-toolkit/rules/CLAUDE.md` z minimalnymi personalnymi regulami.

### Changes Required:

#### 1. Skille Tier-1

**File**: `ai-toolkit/skills/<name>/SKILL.md` (9 skilli)

**Intent**: Skopiowac bez modyfikacji nastepujace skille z `~/.claude/skills/`:
implement, plan, test, e2e, review, reset, start, context7-mcp, impeccable.
Kazdy skill to folder z co najmniej jednym plikiem SKILL.md.

**Contract**: Zrodlo: `~/.claude/skills/<name>/`. Cel: `ai-toolkit/skills/<name>/`.
Kopiujemy caly folder rekurencyjnie dla kazdego ze skilli.

#### 2. rules/CLAUDE.md

**File**: `ai-toolkit/rules/CLAUDE.md`

**Intent**: Personalne reguly Dominika wstrzykiwane do CLAUDE.md kazdego nowego projektu
przez install.js. Powinny byc projekt-agnostyczne — dotyczace stylu pracy, nie stacku.

**Contract**: Zawartosc do ustalenia przez uzytkownika. Minimalne placeholder:
```markdown
# Personal AI Workflow Rules

- Zawsze odpowiadaj po polsku
- Przed implementacja przejdz przez /plan i potwierdzenie uzytkownika
- Commituj tylko na wyrazna prosbe uzytkownika
```
Te reguly beda wstrzykiwane miedzy sentinel markers — uzytkownik moze je edytowac
bezposrednio w pliku przed finalnym publishem.

### Success Criteria:

#### Automated Verification:

- `ls ai-toolkit/skills/` pokazuje 9 folderow (implement plan test e2e review reset start context7-mcp impeccable)
- Kazdy SKILL.md zaczyna sie od `---` (valid YAML frontmatter): `for f in ai-toolkit/skills/*/SKILL.md; do head -1 "$f"; done` — wszystkie wypisuja `---`
- `test -f ai-toolkit/rules/CLAUDE.md` przechodzi

#### Manual Verification:

- Przejrzyj jeden lub dwa SKILL.md zeby upewnic sie ze zawartosc jest poprawna (nie pusta)
- rules/CLAUDE.md zawiera reguly ktore chcesz w kazdym nowym projekcie

---

## Phase 3: CLI — ai init

### Overview

Buduje interaktywne CLI `ai init`. Orkiestrator w `src/init.js` wywoluje kolejno:
detekcje stacku, wybor agentow (inquirer), scaffold context/, generowanie plikow
konfiguracyjnych agentow, i wypisanie next-steps. Kazdy modul w osobnym pliku src/.

### Changes Required:

#### 1. Entry point

**File**: `ai-toolkit/bin/ai.js`

**Intent**: Punkt wejscia CLI (`#!/usr/bin/env node`). Parsuje argument (na razie tylko
`init`) i deleguje do `src/init.js`. Wypisuje blad i wychodzi z kodem 1 dla nieznanych komend.

**Contract**:
```js
#!/usr/bin/env node
import { init } from '../src/init.js';
const [,, cmd] = process.argv;
if (cmd === 'init') { await init(); }
else { console.error(`Unknown command: ${cmd ?? '(none)'}. Try: ai init`); process.exit(1); }
```

#### 2. Orkiestrator init

**File**: `ai-toolkit/src/init.js`

**Intent**: Glowny flow `ai init`: wykryj stack, zapytaj o agenty, potwierdzenie,
scaffold context/, generuj pliki agentow, zainstaluj skille (jesli claude-code wybrany),
wypisz next-steps. Importuje pozostale moduly z src/.

**Contract**: Eksportuje `async function init()` bez parametrow. Uzywa `process.cwd()`
jako project root. Kolejnosc: detectStack -> selectAgents -> confirm -> scaffoldContext
-> generateAgentConfigs -> installSkillsLocally (warunkowe) -> printNextSteps.

#### 3. Detekcja stacku

**File**: `ai-toolkit/src/detect-stack.js`

**Intent**: Skanuje pliki w katalogu projektu i zwraca obiekt `{type, framework}`.
Priorytet sprawdzen: angular.json > pom.xml > next.config.* > package.json > go.mod > Cargo.toml.
Fallback: `{type: 'generic', framework: 'Generic'}`.

**Contract**: `export function detectStack(dir = process.cwd()): {type: string, framework: string}`
Uzywa `fs.readdirSync(dir)` — bez rekurencji, tylko biezacy katalog.
Angular check: `files.includes('angular.json')`.
Next.js check: `files.includes('package.json')` + package.json zawiera dep `next`.

#### 4. Prompty agentow

**File**: `ai-toolkit/src/prompts.js`

**Intent**: Interaktywny wybor agentow AI przez uzytkownika (checkbox inquirer).
Domyslnie zaznaczony Claude Code. Zwraca tablice wybranych wartosci.

**Contract**: `export async function selectAgents(): Promise<string[]>`
Wartosci: `'claude-code'`, `'copilot'`, `'cursor'`. Minimum jeden wymagany
(walidacja przez inquirer `validate: v => v.length > 0 || 'Select at least one'`).

#### 5. Bezpieczny zapis plikow

**File**: `ai-toolkit/src/file-ops.js`

**Intent**: Zapisuje plik do projektu docelowego. Jesli plik istnieje, pyta uzytkownika
o Overwrite / Skip / Abort (per-file). Abort konczy caly proces (`process.exit(0)`).
Tworzy brakujace katalogi nadrzedne (mkdirSync recursive).

**Contract**: `export async function safeWrite(targetPath: string, content: string): Promise<'created'|'overwritten'|'skipped'>`
Prompt message: `${path.relative(process.cwd(), targetPath)} already exists. What should we do?`

#### 6. Scaffold context/

**File**: `ai-toolkit/src/scaffold.js`

**Intent**: Tworzy drzewo katalogow `context/changes/`, `context/archive/`,
`context/foundation/` i kopiuje do nich README.md z `templates/context-*-README.md`.
Uzywa safeWrite dla kazdego README.

**Contract**: `export async function scaffoldContext(projectRoot: string): Promise<void>`
Nie tworzy katalogow jesli juz istnieja (mkdirSync {recursive: true} jest idempotentne).

#### 7. Generowanie plikow agentow

**File**: `ai-toolkit/src/generate-agents.js`

**Intent**: Na podstawie wybranych agentow i wykrytego stacku generuje odpowiednie pliki
konfiguracyjne. Dla claude-code: CLAUDE.md z templates/CLAUDE.{type}.md (fallback: generic).
Dla copilot: .github/copilot-instructions.md. Dla cursor: .cursorrules.
Uzywa safeWrite dla kazdego pliku.

**Contract**: `export async function generateAgentConfigs(stack: {type, framework}, agents: string[], projectRoot: string): Promise<void>`
Sciezka szablonu: `new URL('../templates/', import.meta.url)`

#### 8. Lokalna instalacja skilli

**File**: `ai-toolkit/src/install-skills-locally.js`

**Intent**: Jesli uzytkownik wybral Claude Code, kopiuje skille z `skills/` paczki
do `.claude/skills/` projektu docelowego. Uzupelnia istniejace (safeWrite per SKILL.md).

**Contract**: `export async function installSkillsLocally(projectRoot: string): Promise<void>`
Sciezka zrodlowa: `new URL('../skills/', import.meta.url)` — wzgledna do pliku modulu.

### Success Criteria:

#### Automated Verification:

- `node ai-toolkit/bin/ai.js` (bez argumentu) wypisuje error i wychodzi z kodem 1
- `node -e "import('./ai-toolkit/src/detect-stack.js').then(m => console.log(m.detectStack('/tmp')))"` nie rzuca bledu
- `node -e "import('./ai-toolkit/src/file-ops.js')"` nie rzuca syntax error

#### Manual Verification:

- `cd /tmp && mkdir dm-test && cd dm-test && node <path>/ai-toolkit/bin/ai.js init` uruchamia
  interaktywny flow: pokazuje wykryty stack (generic dla /tmp), pyta o agenty
- Wybor agentow wyswietla checkboxy z inquirer
- Po zakonczeniu /tmp/dm-test/ zawiera context/, CLAUDE.md (dla claude-code)
- Kolizja plikow: drugi `ai init` pyta Overwrite/Skip/Abort per plik

---

## Phase 4: Templates

### Overview

Tworzy szablony CLAUDE.md dla Angular i Spring Boot (plus generic fallback),
szablony konfiguracyjne dla Copilot i Cursor, oraz README.md dla podfolderow context/.

### Changes Required:

#### 1. CLAUDE.angular.md

**File**: `ai-toolkit/templates/CLAUDE.angular.md`

**Intent**: Szablon CLAUDE.md dla projektow Angular (TypeScript + Angular 17+/19+).
Pokrywa: stack (Angular, TypeScript, SCSS), komendy build/test/lint,
wazne konwencje (standalone components, signals, OnPush CD), typical tripwires.
Struktura wzorowana na CLAUDE.md z ClearKYC (format sprawdzony w praktyce).

**Contract**: Plik .md z sekcjami: ## Stack, ## Build & Run, ## Conventions, ## Tripwires.
Placeholdery dla wartosci projektowych: `{{PROJECT_NAME}}`, `{{PORT}}`.
Dlugosc: ~50-80 linii — wystarczajaco szczegolowy, nie przytlaczajacy.

#### 2. CLAUDE.spring.md

**File**: `ai-toolkit/templates/CLAUDE.spring.md`

**Intent**: Szablon dla projektow Spring Boot (Java 21, Maven Wrapper).
Pokrywa: stack, komendy mvnw, konwencje (constructor injection, @Transactional na service,
layered architecture), tripwires specyficzne dla Spring Boot 4.x.

**Contract**: Ten sam format co angular.md. Bazuje na CLAUDE.md z ClearKYC
(`src` tego repo) — wyodreben ogolne Spring czesci, usuniaj ClearKYC-specific.

#### 3. CLAUDE.generic.md

**File**: `ai-toolkit/templates/CLAUDE.generic.md`

**Intent**: Fallback dla nierozpoznanych stackow. Generyczny CLAUDE.md z instrukcjami
niezaleznymi od stacku (styl pracy, git, commitowanie). Uzywany przez ai init gdy
zadny z manifest-plikow nie zostal rozpoznany.

**Contract**: Minimalna wersja — ~20-30 linii. Bez stack-specific tripwirow.

#### 4. copilot-instructions.md

**File**: `ai-toolkit/templates/copilot-instructions.md`

**Intent**: Bazowy szablon `.github/copilot-instructions.md`. Instrukcje dla GitHub Copilot
wspoldzielone miedzy projektami. Moze byc krotszy niz CLAUDE.md — Copilot ma inny model
czytania instrukcji.

#### 5. cursorrules

**File**: `ai-toolkit/templates/cursorrules`

**Intent**: Bazowy szablon `.cursorrules` dla Cursor. Format plain text z regulami
stylu kodu i konwencjami.

#### 6. Context README templates

**File**: `ai-toolkit/templates/context-changes-README.md`,
`ai-toolkit/templates/context-archive-README.md`,
`ai-toolkit/templates/context-foundation-README.md`

**Intent**: Minimalne README.md wstrzykiwane przez scaffold.js do context/ podfolderow.
Opisuja cel katalogu w 2-3 zdaniach.

### Success Criteria:

#### Automated Verification:

- `ls ai-toolkit/templates/` pokazuje min. 7 plikow (3x CLAUDE, copilot, cursorrules, 3x context-README)
- Zadne szablony nie zawieraja ClearKYC-specific tresci: `grep -r "clearkyc\|ClearKYC\|KYB\|KYC" ai-toolkit/templates/` — brak wynikow

#### Manual Verification:

- Przejrzyj CLAUDE.angular.md — czy zawiera uzyteczne Angular-specific konwencje?
- Przejrzyj CLAUDE.spring.md — czy jest oparty na sprawdzonym CLAUDE.md z ClearKYC?
- generic.md jest wystarczajaco ogolny zeby dzialac w dowolnym projekcie

---

## Phase 5: Testy + CI/CD

### Overview

Dodaje testy jednostkowe Vitest dla krytycznej logiki (detekcja stacku, kolizje plikow,
selekcja szablonow) oraz GitHub Actions workflow do walidacji i publikacji paczki.

### Changes Required:

#### 1. detect-stack.test.js

**File**: `ai-toolkit/src/__tests__/detect-stack.test.js`

**Intent**: Testuje `detectStack()` dla wszystkich przypadkow: angular.json -> angular,
pom.xml -> spring, package.json z dep next -> nextjs, package.json bez next -> node,
go.mod -> go, Cargo.toml -> rust, pusty katalog -> generic. Mock fs.readdirSync.

**Contract**: Uzywa `vi.mock('node:fs')`. Kazdy test: jeden zestaw plikow w katalogu
= jeden oczekiwany {type, framework}. Min. 7 przypadkow.

#### 2. file-ops.test.js

**File**: `ai-toolkit/src/__tests__/file-ops.test.js`

**Intent**: Testuje `safeWrite()` bez interakcji uzytkownika. Przypadki:
plik nie istnieje -> tworzy i zwraca 'created'; plik istnieje + wybor overwrite -> 'overwritten';
plik istnieje + wybor skip -> 'skipped'; plik istnieje + wybor abort -> process.exit(0).
Mock fs.existsSync, fs.writeFileSync, @inquirer/prompts.

**Contract**: `vi.mock('@inquirer/prompts')` do symulowania wyboru uzytkownika.
`vi.spyOn(process, 'exit')` dla testu abort.

#### 3. generate-agents.test.js

**File**: `ai-toolkit/src/__tests__/generate-agents.test.js`

**Intent**: Testuje selekcje szablonu per stack i per agent. Przypadki:
stack=angular + agent claude-code -> uzywa CLAUDE.angular.md;
stack=generic + agent claude-code -> uzywa CLAUDE.generic.md;
agent copilot -> tworzy .github/copilot-instructions.md;
agent cursor -> tworzy .cursorrules;
bez claude-code -> nie tworzy CLAUDE.md.
Mock safeWrite, fs.readFileSync.

#### 4. vitest.config.js

**File**: `ai-toolkit/vitest.config.js`

**Intent**: Minimalna konfiguracja Vitest. Testuje pliki `src/__tests__/*.test.js`.

**Contract**:
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

#### 5. GitHub Actions workflow

**File**: `ai-toolkit/.github/workflows/publish.yml`

**Intent**: Waliduje i publikuje paczke na GitHub Packages. Adaptacja szablonu
`.claude/config-templates/m5l4-github-packages-publish-ai-toolkit.yml.template`
z podmienionymi wartosciami: scope `@dominikmodrzejewski99`, validation checks
dla ai-toolkit (skills/implement/SKILL.md zamiast skills/code-review/SKILL.md).

**Contract**: Validation job sprawdza:
1. `package.json` ma `name`, `version`, `publishConfig.registry`
2. `skills/implement/SKILL.md` istnieje
3. `SKILL.md` zaczyna sie od `---` (frontmatter)
4. `npm pack --dry-run` przechodzi

Trigger: push na `main`, PR na `main`. Publish tylko przy push (nie przy PR).
`NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` — brak dodatkowych secrets.

### Success Criteria:

#### Automated Verification:

- `cd ai-toolkit && npm test` — wszystkie testy przechodza, 0 failed
- `cd ai-toolkit && npm pack --dry-run` — wypisuje liste plikow w paczce, brak bledu
- `.github/workflows/publish.yml` zawiera `scope: "@dominikmodrzejewski99"`

#### Manual Verification:

- `npm pack --dry-run` zawiera skills/, rules/, templates/, install.js, uninstall.js, bin/, README.md
- `npm pack --dry-run` NIE zawiera src/, __tests__, node_modules, .github (nie w `files`)
- Przejrzyj publish.yml — czy validation job sprawdza wlasciwe pliki?

---

## Testing Strategy

### Unit Tests:

- `detect-stack.test.js` — 7+ przypadkow detekcji stacku z mock fs
- `file-ops.test.js` — created / overwritten / skipped / abort flow
- `generate-agents.test.js` — selekcja szablonu per stack + per agent

### Integration Tests:

Brak w v1 (zdecydowane podczas planowania). Manual smoke test w /tmp zastepuje.

### Manual Testing Steps:

1. `mkdir /tmp/dm-test && cd /tmp/dm-test`
2. `node <abs-path>/ai-toolkit/bin/ai.js init`
3. Wybierz Claude Code + Copilot, zaobserwuj: stack = generic, context/ scaffold, CLAUDE.md, copilot-instructions.md
4. Uruchom ponownie — sprawdz ze per-plik prompt pojawia sie dla istniejacych plikow
5. Wybierz Skip dla jednego, Overwrite dla drugiego, Abort — sprawdz zachowanie
6. `cd /tmp && mkdir angular-test && touch angular-test/angular.json && cd angular-test`
7. `node <abs-path>/ai-toolkit/bin/ai.js init` — sprawdz ze wykryto Angular i uzyto CLAUDE.angular.md

## Migration Notes

Po ukonczeniu implementacji (wszystkie fazy):
1. `cd ai-toolkit && git init && git add -A && git commit -m "chore: initial ai-toolkit scaffold"`
2. Na GitHub: utwoz prywatne repo `dominikmodrzejewski99/ai-toolkit`
3. `git remote add origin https://github.com/dominikmodrzejewski99/ai-toolkit.git`
4. `git push -u origin main`
5. GitHub Actions workflow odpali sie automatycznie i opublikuje paczke na GitHub Packages

## References

- Research: `context/changes/ai-toolkit/research.md`
- Shape notes: `context/foundation/shape-notes.md`
- Install template: `.claude/config-templates/m5l4-github-packages-install.js.template`
- GitHub Actions template: `.claude/config-templates/m5l4-github-packages-publish-ai-toolkit.yml.template`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Package Infrastructure

#### Automated

- [x] 1.1 `node -e "import('./ai-toolkit/package.json'...)"` wypisuje nazwe paczki — 15a19a4
- [x] 1.2 `node ai-toolkit/install.js` wykonuje sie bez bledu — 15a19a4
- [x] 1.3 install.js i uninstall.js uzywaja `import` (nie `require`) — 15a19a4

#### Manual

- [x] 1.4 package.json ma wszystkie wymagane pola i type: module — 15a19a4
- [x] 1.5 Sentinel markers zawieraja prawidlowa nazwe paczki — 15a19a4

### Phase 2: Skills + Rules Payload

#### Automated

- [x] 2.1 `ls ai-toolkit/skills/` pokazuje 9 folderow — 37543e4
- [x] 2.2 Kazdy SKILL.md zaczyna sie od `---` — 37543e4
- [x] 2.3 `test -f ai-toolkit/rules/CLAUDE.md` przechodzi — 37543e4

#### Manual

- [x] 2.4 Zawartosc skilli nie jest pusta (weryfikacja jednego lub dwoch) — 37543e4
- [x] 2.5 rules/CLAUDE.md zawiera reguly adekwatne do Twojego stylu pracy — 37543e4

### Phase 3: CLI — ai init

#### Automated

- [x] 3.1 `node ai-toolkit/bin/ai.js` (bez args) wychodzi z kodem 1 — e95a174
- [x] 3.2 `node -e "import('./ai-toolkit/src/detect-stack.js')..."` nie rzuca bledu — e95a174
- [x] 3.3 `node -e "import('./ai-toolkit/src/file-ops.js')"` nie rzuca bledu — e95a174

#### Manual

- [x] 3.4 `ai init` w pustym /tmp/dm-test przechodzi pelny flow
- [x] 3.5 Checkboxy agentow wyswietlaja sie poprawnie
- [x] 3.6 Kolizja plikow: prompt Overwrite/Skip/Abort dziala per plik
- [x] 3.7 Angular project (`angular.json` w katalogu) wykrywa stack Angular

### Phase 4: Templates

#### Automated

- [x] 4.1 `ls ai-toolkit/templates/` pokazuje min. 7 plikow — 7224e17
- [x] 4.2 `grep -r "clearkyc\|ClearKYC" ai-toolkit/templates/` — brak wynikow — 7224e17

#### Manual

- [x] 4.3 CLAUDE.angular.md zawiera uzyteczne Angular-specific konwencje — 7224e17
- [x] 4.4 CLAUDE.spring.md oparty na sprawdzonym CLAUDE.md z ClearKYC — 7224e17
- [x] 4.5 CLAUDE.generic.md dziala jako fallback dla dowolnego projektu — 7224e17

### Phase 5: Testy + CI/CD

#### Automated

- [x] 5.1 `cd ai-toolkit && npm test` — 0 failed — 5ce99fe
- [x] 5.2 `cd ai-toolkit && npm pack --dry-run` — brak bledu — 5ce99fe
- [x] 5.3 publish.yml zawiera prawidlowy scope — 5ce99fe

#### Manual

- [x] 5.4 `npm pack --dry-run` zawiera wlasciwe pliki (skills/, rules/, templates/, bin/) — 5ce99fe
- [x] 5.5 `npm pack --dry-run` NIE zawiera src/, node_modules — 5ce99fe
- [x] 5.6 publish.yml sprawdza skills/implement/SKILL.md (nie code-review) — 5ce99fe
