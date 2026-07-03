# Post-login Redirect to cases/new Implementation Plan

## Overview

After a user completes Auth0 login, they land back on the public landing page (`/`) instead of `cases/new`, the page they were actually trying to reach. This plan wires Auth0's `appState` mechanism through the existing route guard so a successful login always returns the user to `cases/new`.

## Current State Analysis

- `web/src/app/app.routes.ts:6-9` guards `cases/new` with `authGuard`; `cases/:id` (`:11-14`) is guarded the same way.
- `web/src/app/features/landing/landing.component.ts:29-31` — `login()` does `router.navigate(['cases/new'])`. It does not touch Auth0 directly.
- `web/src/app/core/guards/auth.guard.ts:18` — when unauthenticated, calls `auth.loginWithRedirect()` with **no arguments**, so no `appState` is ever set.
- `web/src/app/app.config.ts:24-34` — `provideAuth0(...)` sets `redirect_uri: window.location.origin` (always the bare root) and has **no `onRedirectCallback`**. Confirmed via full-codebase grep: zero matches for `appState` or `onRedirectCallback` outside `node_modules`.
- Net effect: after Auth0 redirects back to `/?code=...&state=...`, auth0-angular's default callback handling strips the query params but does not navigate anywhere — the user is left on whatever the current route resolved to, which is the landing page (`''`) since `redirect_uri` always points at the root.
- Confirmed live in production (`https://clearkyc.fly.dev`) via an automated Playwright run: after a successful Auth0 login, the browser ends up back on `/` showing the marketing landing page.

### Key Discoveries:

- The fix point is the guard, not the landing component: `login()` is a thin router navigation, and every protected route (`cases/new`, `cases/:id`) already funnels through `authGuard`, so putting `appState` there covers all entry points with one change.
- `environment.ts:3` / `environment.prod.ts:3` gate the whole Auth0 provider behind `skipAuth` — this change only affects the `!skipAuth` (production) path; dev-mode (`skipAuth: true`) bypasses `authGuard` entirely and is unaffected.

## Desired End State

A user who is not authenticated and navigates to any guarded route (or clicks "Zaloguj się", which routes to `cases/new`) is redirected to Auth0, logs in, and lands on `cases/new` — not the landing page. If Auth0 login does not complete successfully (user cancels, error param present), the user lands back on a clean `/` with no leftover query params.

Verification: manually log in via `https://clearkyc.fly.dev` using the demo account (`demo@10xdevs.pl`) and confirm the post-login URL is `cases/new`.

### Key Discoveries:

- (see Current State Analysis above — consolidated there since this is a single-file-pair fix)

## What We're NOT Doing

- Not adding auto-redirect for already-authenticated users who land on `/` directly — landing stays visible even to logged-in users (they can click "Zaloguj się" again, which passes straight through the guard with no extra Auth0 round-trip since they're already authenticated).
- Not adding a user-facing error banner/toast for failed logins — a failed/cancelled login simply returns to a clean landing page.
- Not preserving arbitrary deep-link targets (e.g., a shared `cases/:id` link) through the login flow — the redirect target is hardcoded to `cases/new` for every guarded route, matching the reported behavior exactly. Generalizing to "return to whatever route the user originally requested" is out of scope for this change.
- Not changing `landing.component.ts`'s `login()` method — it keeps navigating to `cases/new` and lets the guard own all Auth0 interaction.

## Implementation Approach

Use `@auth0/auth0-angular`'s standard `appState` + `onRedirectCallback` pattern:

1. `auth.guard.ts` passes `{ appState: { target: 'cases/new' } }` to `loginWithRedirect()`.
2. `app.config.ts`'s `provideAuth0(...)` gets an `onRedirectCallback` that reads `appState?.target` and navigates the Angular Router there, falling back to `/` (with the `code`/`state` params always stripped, which is `onRedirectCallback`'s job by contract) when there's no `appState` (e.g., the user landed on `/` and never went through the guard) or when Auth0 returned an error.

## Phase 1: Wire appState through the auth guard and redirect callback

### Overview

Make `authGuard` request a return path via `appState`, and make the Auth0 provider act on it when the browser comes back from Auth0.

### Changes Required:

#### 1. Auth guard passes a redirect target

**File**: `web/src/app/core/guards/auth.guard.ts`

**Intent**: When the guard triggers a login redirect, tell Auth0 where the user should end up afterward.

**Contract**: `auth.loginWithRedirect({ appState: { target: 'cases/new' } })` — replaces the current no-argument call on the line that currently reads `auth.loginWithRedirect();`.

#### 2. Auth0 provider handles the return navigation

**File**: `web/src/app/app.config.ts`

**Intent**: After Auth0 completes the OAuth callback, navigate to the `appState.target` the guard requested; if there's no target (e.g. direct landing-page visit, or the login failed/was cancelled), navigate to `/` with a clean URL.

**Contract**: Add an `onRedirectCallback: (appState) => { ... }` key to the `provideAuth0({...})` config object (`app.config.ts:24-34`), injecting `Router` to call `router.navigateByUrl(appState?.target ?? '/')`. Since `provideAuth0` is called inside the `providers` array (not an injection context), obtain the `Router` instance via Angular's `inject(Router)` called at the point where `appConfig` is being assembled — this works because `ApplicationConfig` provider arrays are evaluated during bootstrap, in an injector context where `inject()` is valid at the top level of the arrow function passed as `onRedirectCallback` is NOT itself an injection context (it runs later, on callback) — so `inject(Router)` must be called once, eagerly, when building the `provideAuth0(...)` call (i.e., at the same place `environment.skipAuth` is checked), and the resulting `Router` reference closed over by the `onRedirectCallback` arrow function.

### Success Criteria:

#### Automated Verification:

- Guard unit test passes: `npm run test -- --include='**/auth.guard.spec.ts'` (from `web/`)
- Full unit test suite passes: `npm run test` (from `web/`)
- Lint passes: `npm run lint` (from `web/`)
- Production build succeeds: `npm run build` (from `web/`)

#### Manual Verification:

- On `https://clearkyc.fly.dev`, click "Zaloguj się", complete login with `demo@10xdevs.pl`, and confirm the final URL is `cases/new` (not `/`).
- Directly visit `https://clearkyc.fly.dev/cases/123` while logged out, log in, and confirm the final URL is `cases/new` (hardcoded target, not `cases/123` — this is expected per scope).
- Cancel the Auth0 login screen (or trigger `error=access_denied`) and confirm the browser returns to a clean `https://clearkyc.fly.dev/` with no leftover `code`/`state`/`error` query params.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Unit test coverage for the guard's redirect target

### Overview

Lock in the new behavior with a guard-level unit test so a future refactor of `auth.guard.ts` or `app.config.ts` can't silently drop the `appState` target.

### Changes Required:

#### 1. New guard spec file

**File**: `web/src/app/core/guards/auth.guard.spec.ts` (new file)

**Intent**: Verify that when `isAuthenticated$` emits `false`, the guard calls `loginWithRedirect` with `{ appState: { target: 'cases/new' } }`, and when it emits `true`, the guard allows activation without calling `loginWithRedirect` at all. Follow the existing project convention for testing `CanActivateFn`s with mocked `AuthService` (`isLoading$`, `isAuthenticated$` as RxJS subjects) and `TestBed.runInInjectionContext`.

**Contract**: Two test cases — authenticated (guard resolves `true`, `loginWithRedirect` not called) and unauthenticated (guard resolves `false`, `loginWithRedirect` called once with the exact `appState` shape above).

### Success Criteria:

#### Automated Verification:

- New spec passes: `npm run test -- --include='**/auth.guard.spec.ts'` (from `web/`)
- Full unit test suite still passes: `npm run test` (from `web/`)
- Lint passes: `npm run lint` (from `web/`)

#### Manual Verification:

- None — this phase is test-only, covered entirely by automated verification.

---

## Testing Strategy

### Unit Tests:

- `auth.guard.spec.ts` (new, Phase 2): authenticated vs. unauthenticated paths, asserting the exact `appState` payload passed to `loginWithRedirect`.

### Integration Tests:

- None added — the `onRedirectCallback` wiring in `app.config.ts` is exercised by the Phase 1 manual verification steps against the real Auth0 tenant, since faking a full Auth0 redirect round-trip in a unit test would mostly test the SDK, not this project's code.

### Manual Testing Steps:

1. Log in via `https://clearkyc.fly.dev` with `demo@10xdevs.pl` / `10xDevs1!`, confirm landing at `cases/new`.
2. Visit a guarded route directly while logged out, log in, confirm landing at `cases/new`.
3. Cancel/fail a login attempt, confirm a clean return to `/`.

## Performance Considerations

None — this change adds a single conditional navigation call to an already-async callback path; no measurable performance impact.

## Migration Notes

Not applicable — no data or schema changes.

## References

- Guard: `web/src/app/core/guards/auth.guard.ts`
- Auth0 provider config: `web/src/app/app.config.ts`
- Login trigger: `web/src/app/features/landing/landing.component.ts:29-31`
- Route table: `web/src/app/app.routes.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Wire appState through the auth guard and redirect callback

#### Automated

- [ ] 1.1 Guard unit test passes: `npm run test -- --include='**/auth.guard.spec.ts'`
- [ ] 1.2 Full unit test suite passes: `npm run test`
- [ ] 1.3 Lint passes: `npm run lint`
- [x] 1.4 Production build succeeds: `npm run build`

#### Manual

- [x] 1.5 Login via demo account lands on `cases/new`
- [x] 1.6 Direct visit to a guarded deep link, then login, lands on `cases/new`
- [x] 1.7 Cancelled/failed login returns to a clean `/`

### Phase 2: Unit test coverage for the guard's redirect target

#### Automated

- [ ] 2.1 New spec passes: `npm run test -- --include='**/auth.guard.spec.ts'`
- [ ] 2.2 Full unit test suite still passes: `npm run test`
- [ ] 2.3 Lint passes: `npm run lint`
