# Angular 21 → 22 Upgrade Implementation Plan

## Overview

Upgrade the `web/` Angular SPA from v21.2.x to v22.0.6, following the official Angular update guide (https://angular.dev/update-guide?v=21.0-22.0&l=2), via `ng update` plus a coordinated manual bump of `typescript`, `typescript-eslint`, and `angular-eslint` (which have a hard peer-dep coupling to `@angular/cli`'s major version).

## Current State Analysis

The project runs Angular 21.2.x across all `@angular/*` packages, zoneless (`provideZonelessChangeDetection()` in `web/src/app/app.config.ts:47`), with TypeScript 5.9.2, `angular-eslint` 21.4.0, `typescript-eslint` 8.59.2, and third-party deps `@auth0/auth0-angular` ^2.9.0 and `ngx-extended-pdf-viewer` ^27.0.0 (backed by `pdfjs-dist` ^6.0.227).

Codebase scan (`grep` across `web/src`) found **zero usages** of any Angular 22 removed/changed API:
- No `ComponentFactoryResolver` / `ComponentFactory`, no `createNgModuleRef`, no `ChangeDetectorRef.checkNoChanges`, no Hammer.js, no `provideRoutes`, no `paramsInheritanceStrategy` override.
- No explicit `changeDetection:` metadata on any component — all components will pick up Angular 22's new "OnPush by default" behavior. Since the app is already zoneless, this is a low-risk, likely-invisible change (zoneless change detection already assumes signal-driven, OnPush-style update propagation).
- No `Validators.min`/`Validators.max` called with string arguments (the v22 forms breaking change).
- No `reportProgress` / `HttpXhrBackend` usage (the v22 http breaking change about upload progress).

### Key Discoveries:

- `web/src/app/app.config.ts:47` — `provideZonelessChangeDetection()` confirms zoneless bootstrap; zone.js is not a dependency at all, so the Angular 22 zone.js peer range (`~0.15.0 || ~0.16.0`) is irrelevant here.
- `web/package.json` — `typescript-eslint@8.63.0` (latest) still declares `peerDependencies.typescript: ">=4.8.4 <6.1.0"`, so the safe TypeScript upgrade target is **6.0.3** (latest stable 6.x), not the newest available 7.0.2.
- `angular-eslint@22.1.0` (latest) requires `peerDependencies['@angular/cli']: ">= 22.0.0 < 23.0.0"` — this means bumping `@angular/cli` to 22 without also bumping `angular-eslint` to 22.1.0 breaks `ng lint` immediately. Must land in the same change.
- **Correction discovered during Phase 2**: `ngx-extended-pdf-viewer@27.0.0`'s actual published peer range is `@angular/core: >=19.0.0 <22.0.0` — it does NOT support Angular 22 (the earlier research claim of `<23.0.0 || 22.0.0-rc` was wrong). `28.1.0` is the first version with real Angular 22 support (`>=19.0.0 <23.0.0 || 22.0.0-rc`), so it was bumped in Phase 2 alongside the core packages.
- `@auth0/auth0-angular@^2.9.0` peer range (`@angular/core: >=13`) is untouched by this upgrade — no forced bump required.
- `web/angular.json` build output is wired to `../src/main/resources/static` (Spring Boot static resources) — the production build path must keep working post-upgrade; this is a regression surface for the smoke test, not a config change.
- Angular 22 CHANGELOG breaking changes relevant to a strict-mode, zoneless, standalone-only codebase like this one are narrow: compiler diagnostics for nullish-coalescing/optional-chaining non-nullable expressions, `data`-prefixed template attributes no longer binding inputs/outputs, and multiple-matching-selector compile errors. None of these were found in the codebase scan, but they can only be conclusively ruled out by actually running the compiler (Phase 4).

## Desired End State

`web/` runs on Angular 22.0.6 with a consistent, mutually-compatible toolchain (`typescript` 6.0.3, `typescript-eslint` 8.63.0, `angular-eslint` 22.1.0). `ng build --configuration production`, `ng test`, `ng lint`, and the Playwright e2e suite all pass. The app boots via `ng serve` and the golden path (upload PDF → streaming extraction → decision) works with no new console errors.

## What We're NOT Doing

- Not bumping `@auth0/auth0-angular` past its current pinned major — it already satisfies its Angular 22 peer range, and bumping it is a separate concern (new features/behavior, not required by this upgrade). (`ngx-extended-pdf-viewer` *was* bumped to 28.1.0 in Phase 2 — see the Phase 2 correction in Key Discoveries — because its pinned 27.0.0 does not support Angular 22 at all.)
- Not adopting TypeScript 7.x — blocked by `typescript-eslint`'s `<6.1.0` peer ceiling; revisit in a follow-up change once `typescript-eslint` supports TS 7.
- Not touching backend (`com.example.clearkyc`) code — this is a frontend-only dependency upgrade.
- Not restructuring components to add explicit `changeDetection: ChangeDetectionStrategy.Default` to opt out of the new OnPush-by-default behavior — the zoneless architecture already assumes OnPush-style semantics, so no defensive opt-out is needed unless Phase 4 testing proves otherwise.

## Implementation Approach

Use the officially supported `ng update` schematic path for the core Angular packages (it will run any required automated migrations), then hand-bump the toolchain packages whose peer-dep chains aren't covered by `ng update` (`typescript`, `typescript-eslint`, `angular-eslint`). Fix any compiler/lint fallout, then run the full verification stack (unit, e2e, lint, build) before a manual browser smoke test of the golden path, per this repo's CLAUDE.md requirement to verify UI changes in a browser before calling them done.

## Phase 1: Pre-Upgrade Baseline

### Overview

Confirm a clean working tree and record current versions so the upgrade diff is attributable.

### Changes Required:

#### 1. Baseline check

**File**: N/A (verification only)

**Intent**: Confirm `git status` in `web/` is clean before starting, so the eventual diff is scoped entirely to this upgrade.

**Contract**: No uncommitted changes under `web/` before Phase 2 starts.

### Success Criteria:

#### Automated Verification:

- `git status --porcelain web/` returns no output

#### Manual Verification:

- N/A

---

## Phase 2: Core Angular Packages via `ng update`

### Overview

Run the official schematic-driven update for all `@angular/*` packages plus `@angular/cdk`, applying any codemods Angular ships for this transition.

### Changes Required:

#### 1. Angular framework + CLI + CDK

**File**: `web/package.json`, `web/package-lock.json`, plus any files touched by schematics

**Intent**: Bump `@angular/core`, `@angular/common`, `@angular/compiler`, `@angular/compiler-cli`, `@angular/forms`, `@angular/platform-browser`, `@angular/router`, `@angular/build`, `@angular/cli`, `@angular/cdk` from 21.2.x to 22.0.6, applying Angular's own migration schematics.

**Contract**: Run `npx ng update @angular/core@22 @angular/cli@22 @angular/cdk@22 --force` from `web/` (the `--force` flag bypasses the expected `angular-eslint@21.4.0` peer warning, since that package's bump is deliberately deferred to Phase 3). The schematic ran migrations beyond a version-only bump: it added explicit `changeDetection: ChangeDetectionStrategy.Eager` to 13 components (preserving pre-v22 default change-detection behavior rather than relying on the new OnPush default), added `withXhr` to `provideHttpClient()` in `app.config.ts`, and disabled the new `nullishCoalescingNotNullable`/`optionalChainNotNullable` extended template diagnostics in `tsconfig.app.json`. These are expected, schematic-driven edits within Phase 2's scope.

#### 2. ngx-extended-pdf-viewer (discovered during Phase 2, not in original plan)

**File**: `web/package.json`, `web/package-lock.json`

**Intent**: Bump `ngx-extended-pdf-viewer` from `^27.0.0` to `28.1.0`. Contrary to the plan's original assumption, `27.0.0`'s real peer range is `@angular/core: >=19.0.0 <22.0.0` — it does not support Angular 22 at all. `28.1.0` is the first version whose peer range (`>=19.0.0 <23.0.0 || 22.0.0-rc`) covers Angular 22.

**Contract**: Run `npm install ngx-extended-pdf-viewer@28.1.0 --force` (same deferred angular-eslint peer warning as above).

### Success Criteria:

#### Automated Verification:

- `npm ls @angular/core @angular/cli @angular/cdk` (from `web/`) reports 22.0.6 / 22.0.6 / matching 22.x for all three
- `npm ls ngx-extended-pdf-viewer` reports 28.1.0
- `git diff web/package.json` shows only the expected version bumps (no unexpected dependency changes)

#### Manual Verification:

- N/A (covered by Phase 4-6 automated + manual verification)

---

## Phase 3: Toolchain Packages (TypeScript, ESLint tooling)

### Overview

Hand-bump the packages Angular's `ng update` schematic doesn't manage, whose versions are peer-dep-coupled to the Angular 22 CLI bump from Phase 2.

### Changes Required:

#### 1. TypeScript

**File**: `web/package.json`

**Intent**: Bump `typescript` from `~5.9.2` to `~6.0.3` — Angular 22 requires TypeScript >= 6.0; 6.0.3 is the highest version that stays within `typescript-eslint`'s `<6.1.0` peer ceiling.

**Contract**: `"typescript": "~6.0.3"` in `dependencies`/`devDependencies` (wherever it currently sits).

#### 2. typescript-eslint

**File**: `web/package.json`

**Intent**: Bump `typescript-eslint` from `8.59.2` to `8.63.0`, the latest version, to pick up any Angular-22-era rule fixes and stay current within the TS 6.0.3 peer range.

**Contract**: `"typescript-eslint": "8.63.0"`.

#### 3. angular-eslint

**File**: `web/package.json`

**Intent**: Bump `angular-eslint` from `21.4.0` to `22.1.0` — mandatory alongside the Phase 2 CLI bump, since `angular-eslint@22.1.0` requires `@angular/cli >= 22.0.0 < 23.0.0` and the prior 21.x release will not resolve against CLI 22.

**Contract**: `"angular-eslint": "22.1.0"`.

### Success Criteria:

#### Automated Verification:

- `npm install` (from `web/`) completes with no `ERESOLVE` peer-dependency conflicts
- `npm ls typescript typescript-eslint angular-eslint` reports 6.0.3 / 8.63.0 / 22.1.0

#### Manual Verification:

- N/A

---

## Phase 4: Fix Compilation & Lint Fallout

### Overview

Run the compiler and linter against the new toolchain and resolve anything the static pre-upgrade scan didn't catch (per the Angular 22 CHANGELOG: nullish-coalescing/optional-chaining non-nullable diagnostics, `data`-prefixed attribute binding removal, multiple-matching-selector errors, or default-OnPush behavioral surprises).

### Changes Required:

#### 1. Address any new compiler/lint diagnostics

**File**: Any file the compiler or linter flags (scope unknown until run — expected to be empty or near-empty given the Phase 0 static scan)

**Intent**: Fix each new error/warning surfaced by `ng build` and `ng lint` under the Angular 22 + TS 6.0.3 toolchain. Since the codebase already avoids every known-removed API, this phase is expected to be a no-op or near-no-op; treat any finding as a genuine discovery, not an expected checklist item.

**Contract**: `ng build --configuration production` and `ng lint` both exit 0 with no errors.

**Discovery**: `ng lint` under `angular-eslint@22.1.0` flagged all 13 components where the Phase 2 schematic had added `changeDetection: ChangeDetectionStrategy.Eager` — the new `@angular-eslint/prefer-on-push-component-change-detection` rule forbids opting out of the v22 default OnPush strategy. Removed `changeDetection: ChangeDetectionStrategy.Eager` (and the now-unused `ChangeDetectionStrategy` import) from all 13 files, letting them fall back to the new default OnPush behavior — consistent with the plan's "What We're NOT Doing" decision not to add a defensive opt-out, since the app is already zoneless. `ng build --configuration production` continued to pass after the removal (one pre-existing, unrelated CSS budget warning on `landing.component.scss`, not a new regression).

### Success Criteria:

#### Automated Verification:

- `ng build --configuration production` (from `web/`) exits 0
- `ng lint` (from `web/`) exits 0

#### Manual Verification:

- N/A

---

## Phase 5: Full Automated Test Suite

### Overview

Run the complete automated verification stack to catch functional regressions before the manual smoke test.

### Changes Required:

#### 1. No code changes — verification only

**File**: N/A

**Intent**: Run every automated check the project has for the frontend, in one pass, to confirm the upgrade hasn't broken existing behavior.

**Contract**: All of `ng test`, `ng lint`, `ng build --configuration production`, and the Playwright e2e suite exit 0.

### Success Criteria:

#### Automated Verification:

- `ng test` (vitest) passes with no failures
- `ng lint` passes with no errors
- `ng build --configuration production` passes
- Playwright e2e suite (`npx playwright test` or the project's existing script) passes

#### Manual Verification:

- N/A (this phase is fully automated; manual smoke is Phase 6)

---

## Phase 6: Manual Browser Smoke Test

### Overview

Per this repo's CLAUDE.md rule ("For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete"), manually verify the golden path in a running browser.

### Changes Required:

#### 1. No code changes — manual verification only

**File**: N/A

**Intent**: Confirm the app actually works end-to-end under Angular 22 in a real browser, not just in automated tests — catching runtime-only regressions (e.g., console errors from the OnPush-by-default change, Auth0 redirect flow, PDF viewer rendering) that automated tests may not cover.

**Contract**: N/A

### Success Criteria:

#### Automated Verification:

- N/A

#### Manual Verification:

- `ng serve` (or `npm start`, port 1999) boots with no console errors
- Auth0 login flow completes
- Golden path works: upload a KYB PDF → streaming extraction renders fields with citations → analyst can override/verify a field → terminal decision (Approve/Reject/Escalate) can be submitted
- No new browser console errors/warnings compared to pre-upgrade baseline

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 7: Close Out the Change

### Overview

Record the completed upgrade in the change-tracking system and commit.

### Changes Required:

#### 1. Update change.md

**File**: `context/changes/update/change.md`

**Intent**: Reflect that the change has moved from planning to implementation-complete once Phases 1-6 are done.

**Contract**: `status: implemented` (or the project's terminal status value), `updated: <date of completion>`.

#### 2. Commit

**File**: N/A (git operation)

**Intent**: Commit the dependency bumps and any Phase 4 fixes as a single reviewable commit (or a small stack, if Phase 4 fallout is non-trivial).

**Contract**: Conventional-commit-style message, e.g. `chore(web): upgrade Angular 21 -> 22`.

### Success Criteria:

#### Automated Verification:

- `git log -1` shows the upgrade commit

#### Manual Verification:

- N/A

---

## Testing Strategy

### Unit Tests:

- Existing vitest suite must continue passing unmodified — this upgrade is not expected to require new unit tests, since no application behavior is intentionally changing.

### Integration Tests:

- Existing Playwright e2e suite covers the golden path (upload → extraction → decision) and must continue passing.

### Manual Testing Steps:

1. `cd web && npm start` (or `ng serve --port 1999 --proxy-config proxy.conf.json`), with the Spring Boot backend running.
2. Log in via Auth0.
3. Upload a sample KYB PDF (see `demo-assets/`).
4. Confirm streaming extraction renders fields with citations, typewriter reveal still works.
5. Override/verify a field, then submit a terminal decision.
6. Check the browser console for new errors/warnings not present before the upgrade.

## Performance Considerations

None expected — this is a version bump with no architectural changes. The zoneless change-detection model is unchanged; Angular 22's default-OnPush behavior aligns with (rather than fights) the existing zoneless setup.

## Migration Notes

No data migration involved (frontend-only, no persisted state format changes).

## References

- Official update guide: https://angular.dev/update-guide?v=21.0-22.0&l=2
- Angular 22.0.0 CHANGELOG breaking changes (fetched from `raw.githubusercontent.com/angular/angular/main/CHANGELOG.md`)
- Zoneless bootstrap: `web/src/app/app.config.ts:47`
- Build output wiring to Spring Boot static resources: `web/angular.json`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pre-Upgrade Baseline

#### Automated

- [x] 1.1 `git status --porcelain web/` returns no output (adapted: pre-existing unrelated dependency-cruiser changes noted and left untouched, treated as out-of-scope baseline noise) — ab2a634

### Phase 2: Core Angular Packages via `ng update`

#### Automated

- [x] 2.1 `npm ls @angular/core @angular/cli @angular/cdk` reports 22.0.6 / 22.0.6 / matching 22.x — d44b3fa
- [x] 2.2 `git diff web/package.json` shows only expected version bumps — d44b3fa
- [x] 2.3 `npm ls ngx-extended-pdf-viewer` reports 28.1.0 (added mid-phase — see Key Discoveries correction) — d44b3fa

### Phase 3: Toolchain Packages (TypeScript, ESLint tooling)

#### Automated

- [x] 3.1 `npm install` completes with no `ERESOLVE` peer-dependency conflicts — a018aa5
- [x] 3.2 `npm ls typescript typescript-eslint angular-eslint` reports 6.0.3 / 8.63.0 / 22.1.0 — a018aa5

### Phase 4: Fix Compilation & Lint Fallout

#### Automated

- [x] 4.1 `ng build --configuration production` exits 0 — de3f05e
- [x] 4.2 `ng lint` exits 0 — de3f05e

### Phase 5: Full Automated Test Suite

#### Automated

- [x] 5.1 `ng test` (vitest) passes with no failures (91/91 passed)
- [x] 5.2 `ng lint` passes with no errors
- [x] 5.3 `ng build --configuration production` passes
- [x] 5.4 Playwright e2e suite passes (1/1 passed)

### Phase 6: Manual Browser Smoke Test

#### Manual

- [ ] 6.1 `ng serve` boots with no console errors
- [ ] 6.2 Auth0 login flow completes
- [ ] 6.3 Golden path works end-to-end (upload → extraction → override → decision)
- [ ] 6.4 No new browser console errors/warnings vs. pre-upgrade baseline

### Phase 7: Close Out the Change

#### Automated

- [ ] 7.1 `git log -1` shows the upgrade commit
