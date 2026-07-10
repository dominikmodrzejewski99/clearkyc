# Recent Cases First-Load Lag — Plan Brief

> Full plan: `context/changes/recent-cases-first-load-lag/plan.md`
> Research: `context/changes/recent-cases-first-load-lag/research.md`

## What & Why

The "ostatnie sprawy" sidebar on `cases/new` takes a few seconds to populate on first view after login. Research found this isn't a bug in the traditional sense — the case-list fetch currently starts only *after* Auth0's `checkSession()` wait and the route/chunk resolve, stacking two delays sequentially. This plan overlaps them by starting the fetch as soon as authentication state allows, running in parallel with (not after) the Auth0 wait.

## Starting Point

`CaseNewComponent`'s constructor calls `CaseStore.loadRecentCases()`, but only after `authGuard` lets the route activate and the lazy `cases/new` chunk loads. `CaseStore` already caches the result (`shareReplay` + no-op guard), so this is strictly a first-visit-per-session cost. The recently-added `authInitializer` (`app.config.ts`) already establishes the pattern of a `provideAppInitializer` that branches on `environment.skipAuth` — this plan reuses that pattern for a second concern.

## Desired End State

`GET /api/cases` starts near app bootstrap, overlapping with the Auth0 authentication check instead of waiting for it to finish first. A `performance.measure` entry (`clearkyc:recent-cases:first-load`) makes the actual first-load duration inspectable in production DevTools, closing the research doc's open question about how long `checkSession()` really takes without needing a manual HAR trace each time.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Fix approach | Root-level prefetch via a second `provideAppInitializer` | Overlaps the auth wait and the fetch instead of stacking them, with minimal architectural change (store already caches) | Plan |
| Pre-auth request handling | Wait for `isAuthenticated$ === true` before fetching (not fire-and-retry) | Avoids 401s and interceptor retry/queue complexity for one call site | Plan |
| Mechanism scope | Dedicated to `recentCases` only, not a generalized "warm on auth" pattern | Avoids speculative abstraction for a single current use case (YAGNI) | Plan |
| DB index on `analyst_identity` | Out of scope | Unrelated to this symptom (backend was ruled out as the cause); separate change if pursued | Research |
| Verification | Permanent Performance API instrumentation (`performance.mark`/`measure`), not just manual before/after | Gives a lasting, inspectable production signal instead of a one-time measurement | Plan |
| Test coverage | Unit tests on initializer timing logic + the "measure once" guard, not on the instrumentation calls themselves | Covers the actual new/non-obvious logic; testing "was mark() called" has low diagnostic value | Plan |

## Scope

**In scope:**
- New `recentCasesPrefetchInitializer` in `app.config.ts`, mirroring `authInitializer`'s `skipAuth` branching
- `performance.mark`/`performance.measure` instrumentation in `CaseStore.loadRecentCases()`, guarded to fire once per session
- Unit tests for both

**Out of scope:**
- Route resolvers (they run after `canActivate`, wouldn't help)
- Generalized "warm on auth" mechanism for other future routes
- Backend `/api/cases` changes or DB indexing
- HTTP interceptor retry/queue logic for pre-auth requests
- Wiring measurements into an analytics pipeline (none exists)

## Architecture / Approach

A second `provideAppInitializer` runs alongside the existing Auth0 one. In dev mode it fetches immediately (no real auth wait exists); in prod it waits for `AuthService.isAuthenticated$` to emit `true` once, then calls the same `CaseStore.loadRecentCases()` the component already calls — that method's existing no-op guard makes the component's own call a safe no-op once the prefetch has already fired. Instrumentation lives in the store (single choke point) rather than duplicated across both call sites.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Parallel prefetch + instrumentation | Fetch overlaps auth wait; `performance.measure` entry available in DevTools | Measurement guard must not fire twice on `refreshRecentCases()` — handled via a private one-time flag |
| 2. Unit test coverage | Locks in initializer timing branches + measure-once guard | None — test-only phase |

**Prerequisites:** None beyond the current `main` branch state (`login-redirect-loop` already merged).
**Estimated effort:** ~1 session across 2 phases — small, contained frontend change.

## Open Risks & Assumptions

- Assumes `AuthService.isAuthenticated$` reliably emits `true` exactly once per successful auth resolution in this app's usage (already relied upon by `authGuard`, so this is an existing assumption, not a new one).
- The actual perceived improvement depends on real-world `checkSession()` latency, which varies with network conditions — this plan makes it measurable but the magnitude of improvement isn't guaranteed until observed via `performance.getEntriesByName` in production.

## Success Criteria (Summary)

- Recent-cases sidebar visibly populates sooner on a fresh first login (DevTools Network timeline comparison)
- `performance.getEntriesByName('clearkyc:recent-cases:first-load')` returns exactly one entry per session, even after case-create/refresh cycles
- No regressions in dev mode (`skipAuth: true`) or existing test suite
