# Post-login Redirect to cases/new — Plan Brief

> Full plan: `context/changes/post-login-redirect/plan.md`

## What & Why

After logging in via Auth0, users land back on the public marketing landing page instead of `cases/new`, the page they were trying to reach. This breaks the expected flow for analysts (and for demo/reviewer accounts) who click "Zaloguj się" expecting to go straight into the app.

## Starting Point

`authGuard` (`web/src/app/core/guards/auth.guard.ts:18`) calls `auth.loginWithRedirect()` with no arguments. `provideAuth0(...)` (`web/src/app/app.config.ts:24-34`) has no `onRedirectCallback`, and `redirect_uri` is always `window.location.origin` (the bare root). Confirmed live in production via an automated browser test: post-login, the user ends up on `/`.

## Desired End State

Any login — whether triggered from the landing page's "Zaloguj się" button or by hitting a guarded route directly while logged out — ends with the user on `cases/new`. A cancelled or failed login returns cleanly to `/` with no leftover query params.

## Key Decisions Made

| Decision                                  | Choice                                       | Why (1 sentence)                                                                 | Source |
| ------------------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| Already-authenticated user visits landing  | No auto-redirect, landing stays visible        | Zero added logic/risk; user can just click "Zaloguj się" again with no extra Auth0 round-trip | Plan (unconfirmed — user unavailable, used recommended default) |
| Post-login target                          | Hardcoded `cases/new` for every guarded route  | Matches the literal report ("po zalogowaniu routing do cases/new") exactly        | Plan (unconfirmed — used recommended default) |
| Failed/cancelled login                     | Return to clean `/`, no error banner           | Safe fallback; avoids scope creep into new UI/error-state work                   | Plan (unconfirmed — used recommended default) |
| `login()` in landing component             | Left unchanged (still `router.navigate(['cases/new'])`) | Keeps all Auth0 interaction centralized in the guard — one source of truth       | Plan (unconfirmed — used recommended default) |
| Test coverage                              | Guard unit test + manual verification          | Fast to write, covers the logic without needing a real Auth0 round-trip in CI    | Plan (unconfirmed — used recommended default) |

**Note:** the interactive question rounds for this plan went unanswered (user away from keyboard); all five decisions above used the marked ⭐-recommended option. Flag any of these for a different choice before implementing — they're easy to change (see plan.md's "What We're NOT Doing" for the discarded alternatives).

## Scope

**In scope:**
- `auth.guard.ts`: pass `appState: { target: 'cases/new' }` to `loginWithRedirect()`
- `app.config.ts`: add `onRedirectCallback` to `provideAuth0(...)` that navigates to `appState.target` or falls back to `/`
- New unit test for the guard's redirect-target behavior

**Out of scope:**
- Auto-redirecting already-authenticated users away from landing
- Preserving arbitrary deep-link targets (e.g. a shared `cases/:id` link) through login
- User-facing error messaging for failed logins
- Any backend/API changes

## Architecture / Approach

Standard `@auth0/auth0-angular` pattern: the guard is the single place that knows "we need to log in and then go to X," expressed via `appState`. The Auth0 provider's `onRedirectCallback` is the single place that acts on it after the OAuth round-trip completes, via `Router.navigateByUrl`.

## Phases at a Glance

| Phase     | What it delivers                                      | Key risk                                                     |
| --------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| 1. Wire appState + redirect callback | Login always lands on `cases/new`; failed login returns to clean `/` | Getting `Router` injected correctly into `onRedirectCallback` (must be captured at provider-setup time, not inside the callback itself) |
| 2. Guard unit test                   | Regression protection for the redirect-target behavior | None significant — straightforward mock-based test              |

**Prerequisites:** None — no new dependencies, no infra changes.
**Estimated effort:** ~1 session, single phase pair, two small files touched.

## Open Risks & Assumptions

- All five decision points above were answered by default/recommended choice, not explicit user confirmation (user was away from keyboard during planning). Worth a quick sanity check before/while implementing.
- Assumes `Router` can be safely captured once at `ApplicationConfig` construction time and closed over by `onRedirectCallback` — this is the standard pattern but hasn't been verified against this exact Angular 20+/zoneless setup in this codebase.

## Success Criteria (Summary)

- Logging in via `https://clearkyc.fly.dev` with the demo account lands on `cases/new`, not the landing page.
- A cancelled/failed login returns to a clean `/` with no leftover `code`/`state`/`error` query params.
- `npm run test`, `npm run lint`, and `npm run build` all pass (from `web/`).
