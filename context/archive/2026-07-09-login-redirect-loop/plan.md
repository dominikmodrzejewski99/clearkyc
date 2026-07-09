# Eager Auth0 Callback Processing Implementation Plan

## Overview

After logging in via Auth0, users always land back on the public landing page on their first attempt and must click "Zaloguj się" a second time to actually enter the app. This plan forces `AuthService` (`@auth0/auth0-angular`) to be constructed at application bootstrap — via `provideAppInitializer` — so the Auth0 callback (`code`/`state` in the URL) is always processed on the very first page load after returning from login, regardless of which route the browser lands on.

## Current State Analysis

- `web/src/app/app.config.ts:24-35` configures `provideAuth0(...)` with `redirect_uri: window.location.origin` (the bare root) and no eager consumer of `AuthService` anywhere in the providers array.
- `web/src/app/app.routes.ts:16-19` — the root route (`''`, landing page) has no `canActivate` guard.
- `web/src/app/features/landing/landing.component.ts:29-31` — `login()` only does `router.navigate(['cases/new'])`; it never injects `AuthService`.
- `web/src/app/core/guards/auth.guard.ts:7-24` is the **only** place in the app that injects `AuthService` (`inject(AuthService)` at line 11).
- `AuthService`'s constructor (`node_modules/@auth0/auth0-angular/fesm2022/auth0-auth0-angular.mjs:301-311`) is where the code/state-in-URL callback handling lives — it decides whether the current load is a callback (`shouldHandleCallback()`), and if so calls `handleRedirectCallback()`, which internally exchanges the code for tokens and navigates to `appState.target`. This is fully self-contained: the constructor ends with its own `.subscribe()`, so merely constructing the service (no extra subscription needed) is enough to trigger callback processing.
- Net effect of the current architecture: after Auth0 redirects back to `/?code=...&state=...`, the browser lands on the unguarded root route, `LandingComponent` renders without ever touching `AuthService`, and the leftover `code`/`state` sit unprocessed in the URL — the user just sees the landing page. Clicking "Zaloguj się" navigates to `cases/new`, which activates `authGuard`, which is the first point in this page load that constructs `AuthService` — at that moment the `code`/`state` are still present, so the callback is (finally) processed and the library's own `handleRedirectCallback` navigates to `appState.target` = `cases/new`.
- The previous fix (`context/changes/post-login-redirect/`, commit `9929abe`) correctly added `appState: { target: 'cases/new' }` to `loginWithRedirect()` in `auth.guard.ts:18`, on the stated assumption that `handleRedirectCallback()` navigates to `appState.target` internally and no `onRedirectCallback` wiring is needed. That assumption is true, but incomplete: it only holds if `AuthService` gets constructed while the code/state are still in the URL, which was never guaranteed.
- `environment.ts:2` (`skipAuth: true`) gates the entire Auth0 provider off in dev mode; `environment.prod.ts:2` (`skipAuth: false`) is the only environment where this bug (and this fix) is live. `authGuard` already checks `environment.skipAuth` before touching `AuthService` (`auth.guard.ts:8-10`) — the new initializer must follow the same guard to avoid a `NullInjectorError` in dev mode, where `provideAuth0(...)` is never added to the providers array (`app.config.ts:23`).
- `web/src/app/core/guards/auth.guard.spec.ts` is the existing test convention for this area: it mutates the shared `environment` plain object directly in `beforeEach`/`afterEach` (since `vi.mock()` on relative imports isn't available in the Angular test builder) and mocks `AuthService` via `TestBed.configureTestingModule`.

### Key Discoveries:

- Angular `^21.2.0` (this project's pinned version) ships `provideAppInitializer(fn)`: if `fn` returns nothing, application bootstrap is **not** delayed — the function still runs (and its `inject()` calls resolve) during startup, before the router activates any route guard (`https://angular.dev/api/core/provideAppInitializer`).
- Because `AuthService`'s constructor is self-subscribing, `provideAppInitializer(() => { inject(AuthService); })` is sufficient — no need to also subscribe to `isLoading$`/`isAuthenticated$` inside the initializer.

## Desired End State

A user visiting the app for the first time in a session (no prior `AuthService` construction), who clicks "Zaloguj się" and completes Auth0 login, lands directly on `cases/new` — no second click required. A cancelled/failed login still returns cleanly to `/` (existing behavior, unchanged). Dev mode (`skipAuth: true`) is unaffected — no `AuthService` is constructed there, matching current guard behavior.

Verification: in a fresh incognito window (or after clearing cookies/site data) on `https://clearkyc.fly.dev`, click "Zaloguj się", log in with the demo account, and confirm the very first landing after the Auth0 redirect is `cases/new` — not a second visit to `/`.

## What We're NOT Doing

- Not changing `redirect_uri` or adding a dedicated `/callback` route — no Auth0 dashboard configuration changes required.
- Not adding `onRedirectCallback` to `provideAuth0(...)` — that config key doesn't exist in the installed `@auth0/auth0-angular@^2.9.0` (confirmed by the previous change's commit message and by the library's type surface), and the guard-level `appState` fix from `post-login-redirect` already covers "where to navigate."
- Not blocking application render on auth resolution — the initializer only forces `AuthService`'s construction; it does not delay bootstrap on `isLoading$` settling, since the landing page renders identically regardless of auth state.
- Not adding user-facing error messaging for failed/cancelled logins — out of scope, matches the prior change's decision.
- Not adding e2e/Playwright coverage that mocks a full Auth0 token exchange — no existing infrastructure for that in this project; a unit test on the initializer's guard condition plus a manual cold-start verification is the agreed level of protection for this fix.

## Implementation Approach

Add a `provideAppInitializer` entry to `app.config.ts`'s providers array, conditioned on `!environment.skipAuth` (mirroring the existing check in `authGuard`), whose sole job is to `inject(AuthService)`. This guarantees `AuthService` exists — and therefore has already run its callback-detection logic — before the Angular Router resolves the initially-requested route, regardless of whether that route is the unguarded root or a guarded route.

## Phase 1: Eagerly construct AuthService at bootstrap

### Overview

Ensure the Auth0 callback is processed on the very first page load after returning from login, by forcing `AuthService` construction during app initialization rather than leaving it to whichever route guard happens to run first.

### Changes Required:

#### 1. App initializer forces AuthService construction

**File**: `web/src/app/app.config.ts`

**Intent**: Guarantee that `AuthService` is constructed during app bootstrap (in production/non-skip-auth mode), so its constructor's callback-handling logic always runs before any route — guarded or not — is resolved.

**Contract**: Add `provideAppInitializer(() => { if (!environment.skipAuth) { inject(AuthService); } })` to the `providers` array in `appConfig`, alongside the existing `provideAuth0(...)` block. Import `inject` from `@angular/core` and `provideAppInitializer` from `@angular/core`; import `AuthService` from `@auth0/auth0-angular` (already imported in `auth.guard.ts`, not yet in this file).

### Success Criteria:

#### Automated Verification:

- Unit test suite passes: `npm run test` (from `web/`)
- Lint passes: `npm run lint` (from `web/`)
- Production build succeeds: `npm run build` (from `web/`)

#### Manual Verification:

- In a fresh incognito window on `https://clearkyc.fly.dev`, click "Zaloguj się" once, complete login with the demo account, and confirm the browser lands on `cases/new` immediately — no second click needed.
- Confirm dev mode (`npm start` locally, `skipAuth: true`) still loads the landing page and guarded routes without any Auth0-related console errors (no `NullInjectorError` for `AuthService`).
- Cancel/fail a login attempt and confirm the browser still returns to a clean `/` with no leftover `code`/`state`/`error` query params (unchanged from the prior fix).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Unit test coverage for the initializer's environment guard

### Overview

Lock in the new behavior with a unit test so a future edit to `app.config.ts` or `environment.ts` can't silently drop the `skipAuth` guard and break dev mode, or silently drop the initializer and reintroduce the cold-start bug.

### Changes Required:

#### 1. App config initializer test

**File**: `web/src/app/app.config.spec.ts` (new file)

**Intent**: Verify that the app initializer added in Phase 1 constructs `AuthService` when `environment.skipAuth` is `false`, and does not attempt to construct it (and does not throw) when `environment.skipAuth` is `true`. Follow the existing convention from `auth.guard.spec.ts` of mutating the shared `environment` object directly in `beforeEach`/`afterEach` rather than mocking the module.

**Contract**: Two test cases — `skipAuth: false` (assert `AuthService` was constructed/injected, e.g. via a spy on the provided instance or by asserting no error and that the service resolves via `TestBed.inject`), and `skipAuth: true` (assert the initializer runs without throwing and does not require `AuthService` to be provided at all).

### Success Criteria:

#### Automated Verification:

- New spec passes: `npm run test -- --include='**/app.config.spec.ts'` (from `web/`)
- Full unit test suite still passes: `npm run test` (from `web/`)
- Lint passes: `npm run lint` (from `web/`)

#### Manual Verification:

- None — this phase is test-only, covered entirely by automated verification.

---

## Testing Strategy

### Unit Tests:

- `app.config.spec.ts` (new, Phase 2): asserts the app initializer constructs `AuthService` only when `!environment.skipAuth`, and never throws in either mode.

### Integration Tests:

- None added — reproducing a full Auth0 cold-start redirect (code/state in URL on first load) against the real Auth0 tenant is covered by the Phase 1 manual verification, per the "What We're NOT Doing" scope decision.

### Manual Testing Steps:

1. Fresh incognito window on `https://clearkyc.fly.dev`: click "Zaloguj się" once, log in with `demo@10xdevs.pl`, confirm immediate landing on `cases/new`.
2. Local dev (`npm start`, `skipAuth: true`): confirm landing page and guarded routes still load with no console errors.
3. Cancel/fail a login attempt: confirm clean return to `/`.

## Performance Considerations

Negligible — this adds one additional service construction (and its internal `shouldHandleCallback()`/`checkSession()` call) during app bootstrap, which auth0-angular already performs on first `AuthService` use regardless of this change; we're only changing *when* that construction happens, not adding new work.

## Migration Notes

Not applicable — no data or schema changes.

## References

- Related frame: `context/changes/login-redirect-loop/frame.md`
- Related prior change: `context/changes/post-login-redirect/plan.md` (commit `9929abe`)
- App config: `web/src/app/app.config.ts`
- Auth guard (existing `skipAuth` pattern to mirror): `web/src/app/core/guards/auth.guard.ts`
- Existing test convention: `web/src/app/core/guards/auth.guard.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Eagerly construct AuthService at bootstrap

#### Automated

- [x] 1.1 Unit test suite passes: `npm run test` — 397a058
- [x] 1.2 Lint passes: `npm run lint` — 397a058
- [x] 1.3 Production build succeeds: `npm run build` — 397a058

#### Manual

- [x] 1.4 Cold-start login (incognito) lands on `cases/new` on first attempt — confirmed by user; brief landing-page flash observed before redirect, deemed acceptable
- [x] 1.5 Dev mode (`skipAuth: true`) loads without Auth0-related console errors — confirmed by user
- [x] 1.6 Cancelled/failed login returns to a clean `/` — confirmed by user

### Phase 2: Unit test coverage for the initializer's environment guard

#### Automated

- [x] 2.1 New spec passes: `npm run test -- --include='**/app.config.spec.ts'` — 2/2 passed
- [x] 2.2 Full unit test suite still passes: `npm run test` — 82/82 passed
- [x] 2.3 Lint passes: `npm run lint` — `app.config.ts`/`app.config.spec.ts` clean (`npx eslint` on both, 0 errors); 7 pre-existing errors remain in unrelated files, confirmed via `git stash` to predate this change
