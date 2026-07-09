# Eager Auth0 Callback Processing — Plan Brief

> Full plan: `context/changes/login-redirect-loop/plan.md`
> Frame brief: `context/changes/login-redirect-loop/frame.md`

## What & Why

Auth0 SPA callback (`code`/`state` in the URL after login) is never processed on the first page load, because `redirect_uri` points at the unguarded root route, and `AuthService` (auth0-angular) is never constructed anywhere on that path — the callback only gets processed by accident, on whatever route guard happens to run next. This forces every user to log in twice on a cold session.

## Starting Point

`AuthService`'s constructor (`@auth0/auth0-angular`) is where callback processing lives, but the only place in the app that ever injects it is `authGuard` (`web/src/app/core/guards/auth.guard.ts:11`). The root route (landing page) has no guard and never touches `AuthService`. A prior fix (`post-login-redirect`, commit `9929abe`) correctly wired `appState.target` through the guard, but that only works once `AuthService` is actually constructed — which the prior fix didn't guarantee.

## Desired End State

A user's first login attempt in a fresh session lands directly on `cases/new` — no second click on "Zaloguj się" required. Dev mode (`skipAuth: true`) and the cancelled/failed-login fallback to a clean `/` are both unaffected.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| How to guarantee callback processing | `provideAppInitializer` in `app.config.ts` injecting `AuthService` | No Auth0 dashboard changes needed, smallest diff, mirrors the existing `skipAuth` guard pattern | Plan |
| Should init block app render | No — non-blocking, fire-and-forget | Landing page doesn't depend on auth state; blocking would add startup latency for every load | Plan |
| Callback error handling (network/state failure) | Unchanged — clean return to `/`, no error banner | Matches the prior change's accepted scope; new UI is out of scope for this fix | Plan |
| Regression protection | Unit test on the initializer's `skipAuth` guard + manual cold-start (incognito) verification | Fast, no new e2e infra needed; manual step explicitly targets the exact scenario the prior fix's verification missed | Plan |

## Scope

**In scope:**
- `app.config.ts`: add `provideAppInitializer` that injects `AuthService` when `!environment.skipAuth`
- New unit test (`app.config.spec.ts`) covering both `skipAuth` states

**Out of scope:**
- Changing `redirect_uri` or adding a dedicated `/callback` route
- Adding `onRedirectCallback` to `provideAuth0(...)` (key doesn't exist in the installed SDK version)
- Blocking app render on auth resolution
- User-facing error messaging for failed logins
- E2E test mocking a full Auth0 token exchange

## Architecture / Approach

`provideAppInitializer(() => { if (!environment.skipAuth) inject(AuthService); })` added to `app.config.ts`'s providers. `AuthService`'s constructor is self-subscribing (confirmed in the installed library source), so merely constructing it during bootstrap is enough — no extra subscription or blocking wait needed. This guarantees the constructor's callback-detection logic runs before the Router activates any route, regardless of which route (guarded or not) the browser lands on after the Auth0 redirect.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Eager AuthService construction | Cold-start login always lands on `cases/new` on the first attempt | Must guard on `environment.skipAuth` correctly, or dev mode breaks with `NullInjectorError` |
| 2. Unit test coverage | Regression protection for the `skipAuth` guard on the initializer | None significant — small, mock-based test following existing `auth.guard.spec.ts` convention |

**Prerequisites:** None — no new dependencies, no Auth0 dashboard changes.
**Estimated effort:** ~1 session, two small phases, one file changed + one new test file.

## Open Risks & Assumptions

- Assumes `provideAppInitializer`'s non-blocking behavior (function returns nothing → bootstrap not delayed) holds as documented for Angular `^21.2.0` in this project's zoneless setup — not yet verified against a live build in this exact configuration.
- Assumes `AuthService`'s self-subscribing constructor (confirmed by reading the installed `@auth0/auth0-angular@^2.9.0` source) doesn't change behavior across patch versions within the `^2.9.0` range.

## Success Criteria (Summary)

- A user's first login attempt in a fresh (incognito) session lands directly on `cases/new`, with no second "Zaloguj się" click needed.
- Dev mode and the cancelled/failed-login clean-return-to-`/` behavior are unaffected.
- `npm run test`, `npm run lint`, and `npm run build` all pass (from `web/`).
