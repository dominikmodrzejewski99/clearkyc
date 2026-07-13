# Plan Brief: Angular 21 → 22 Upgrade

## What & Why

Upgrade `web/` from Angular 21.2.x to 22.0.6 (official update guide), keeping the toolchain (TypeScript, ESLint plugins) mutually compatible, so the frontend stays on a supported major with no functional regressions.

## Starting Point

Angular 21.2.x across all `@angular/*` packages, zoneless (`provideZonelessChangeDetection()`), TypeScript 5.9.2, `angular-eslint` 21.4.0, `typescript-eslint` 8.59.2. Codebase scan found zero usages of any Angular 22 removed/changed API.

## Desired End State

Angular 22.0.6 + TypeScript 6.0.3 + `typescript-eslint` 8.63.0 + `angular-eslint` 22.1.0. `ng build`, `ng test`, `ng lint`, and Playwright e2e all green; golden path (upload → extraction → decision) verified manually in browser with no new console errors.

## Key Decisions Made

| Decision | Choice |
|---|---|
| TypeScript target version | 6.0.3 (not latest 7.0.2) — `typescript-eslint` peer ceiling is `<6.1.0` |
| angular-eslint bump timing | Same change as `@angular/cli` bump (not deferred) — `angular-eslint@22.1.0` requires `@angular/cli >=22 <23` |
| Third-party deps (`ngx-extended-pdf-viewer`, `@auth0/auth0-angular`) | Not bumped — both already satisfy Angular 22 peer ranges |
| OnPush-by-default opt-out | Not added — zoneless architecture already assumes OnPush-style semantics |
| Definition of done | Build + all automated tests green + manual browser smoke test with no console errors |

## Scope

**In:** `@angular/*` + `@angular/cdk` bump via `ng update`; manual bump of `typescript`, `typescript-eslint`, `angular-eslint`; fixing any compiler/lint fallout; full automated + manual verification; `change.md` close-out and commit.

**Out:** Backend changes, `ngx-extended-pdf-viewer`/`@auth0/auth0-angular` version bumps, TypeScript 7.x adoption.

## Architecture / Approach

Use Angular's official `ng update` schematic for framework packages (runs any needed codemods automatically), then hand-bump the toolchain packages `ng update` doesn't manage but which are peer-dep-coupled to the CLI major. Fix fallout, verify with the full automated stack, then a manual browser smoke test per this repo's UI-verification rule.

## Phases at a Glance

| Phase | Summary | Prerequisites | Est. Effort |
|---|---|---|---|
| 1 | Pre-upgrade baseline check | None | Trivial |
| 2 | `ng update` core Angular packages + CDK | Phase 1 | Small |
| 3 | Manual bump: TypeScript, typescript-eslint, angular-eslint | Phase 2 | Small |
| 4 | Fix compilation/lint fallout | Phase 3 | Unknown (expected small/none) |
| 5 | Full automated suite (unit, lint, build, e2e) | Phase 4 | Small |
| 6 | Manual browser smoke test | Phase 5 | Small |
| 7 | Close out: update `change.md`, commit | Phase 6 | Trivial |

## Open Risks & Assumptions

- Static codebase scan found no usage of removed APIs, but only running the compiler (Phase 4) can conclusively confirm no hidden breakage (e.g. nullish-coalescing diagnostics, default-OnPush behavior surprises).
- `npm install` peer-resolution could still surface an unforeseen conflict from a transitive dependency not checked individually.

## Success Criteria Summary

`ng build --configuration production`, `ng test`, `ng lint`, and the Playwright e2e suite all pass on Angular 22.0.6 + TypeScript 6.0.3 + `angular-eslint` 22.1.0; golden path verified manually in browser with no new console errors.
