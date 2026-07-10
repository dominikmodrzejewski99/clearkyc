---
date: 2026-07-09T23:23:52+02:00
researcher: Claude Sonnet 5
git_commit: 259aa32319ef706b37264b702dc382f8e31134f0
branch: main
repository: clearkyc
topic: "Ostatnie sprawy doczytują się za pierwszym razem kilka sekund"
tags: [research, codebase, angular, auth0, case-store, performance]
status: complete
last_updated: 2026-07-09
last_updated_by: Claude Sonnet 5
---

# Research: Recent cases list takes a few seconds to load on first view

**Date**: 2026-07-09T23:23:52+02:00
**Researcher**: Claude Sonnet 5
**Git Commit**: 259aa32319ef706b37264b702dc382f8e31134f0
**Branch**: main
**Repository**: clearkyc

## Research Question

"ostatnie sprawy doczytują się za pierwszym razem kilka sekund" — the "recent cases" list on the `cases/new` page takes a few seconds to appear the first time an analyst views it (after login). Is this caused by the recently-added Auth0 app initializer (Phase 1 of `login-redirect-loop`, commit 397a058), the case-list fetch itself, the backend endpoint, or something else?

## Summary

The lag is **not** caused by the new eager-`AuthService` app initializer, and **not** by the backend `/api/cases` endpoint (which is a single indexed-projection-shaped query with no N+1, no cold start — Fly.io is configured with `min_machines_running = 1`). The most plausible cause is the **pre-existing** `authGuard` behavior: it blocks route activation until Auth0's `isLoading$` flips to `false`, which only happens after the Auth0 SDK's `checkSession()` silent-authentication round trip (a hidden-iframe network call to the Auth0 tenant) completes. On a cold browser/session this round trip can genuinely take one to a few seconds — and it predates the `login-redirect-loop` fix entirely. A secondary, additive contributor is that the case list itself is fetched by the component's constructor (not a route resolver) only *after* the guard lets the route activate, and only *after* the lazy route chunk (`cases/new`) finishes downloading — so on a first visit these two delays (guard's `checkSession()` wait, then component mount + HTTP fetch) stack sequentially rather than overlapping.

Nothing here indicates a bug to "fix" in the traditional sense — it's an architectural byproduct of Auth0's silent-auth flow plus a component-level (non-resolver) fetch. Whether to address it (e.g., with a route resolver that starts the fetch in parallel with the guard, or a skeleton/instant local cache) is a product/UX call, not a correctness bug.

## Detailed Findings

### Frontend: where the "recent cases" list actually lives

There is no dedicated "recent cases" page — it's a sidebar on the `cases/new` page (the post-login landing/upload screen).

- Route: `web/src/app/app.routes.ts:5-8` — `cases/new` is `loadComponent`-lazy and gated by `authGuard`.
- Component: `web/src/app/features/case-new/case-new.component.ts` renders the sidebar list in `case-new.component.html:91-119`.
- Fetch trigger: `case-new.component.ts:61-63` — `loadRecentCases()` is called from the **constructor**, not `ngOnInit`, not a resolver. It fires as soon as the component class is instantiated, which — because there's no resolver — happens only after `authGuard` (`app.routes.ts:8`) has already resolved to `true` and the lazy chunk has loaded.
- Store: `web/src/app/core/store/case.store.ts` — `CaseStore` (`providedIn: 'root'`) holds `recentCases`/`recentCasesLoading`/`recentCasesError` signals (`case.store.ts:20-22`). `loadRecentCases()` (`case.store.ts:30-46`) no-ops if data is already loaded or a load is in flight, so this lag is a **first-visit-only** cost, not a repeat cost — confirmed by the guard `if (this.recentCases().length > 0 || this.recentCasesLoading()) return;` (`case.store.ts:31-33`).
- HTTP call: `CaseService.listCases()` → `GET /api/cases` (`web/src/app/core/services/case.service.ts:20-22`), wrapped in `shareReplay(1)` (`case.store.ts:26-27`) so the underlying observable is cached across subscriptions.
- Loading UI: `case-new.component.html:95-96` shows a "Wczytywanie..." row while `recentCasesLoading()` is true, so the delay isn't a blank screen — but it is a visible several-second placeholder in the sidebar.

### Auth0 app initializer (commit 397a058) — ruled out as the cause

- `web/src/app/app.config.ts:19-23,48` — `authInitializer` calls `inject(AuthService)` synchronously and returns `void`. Angular's `provideAppInitializer` only blocks bootstrap for a factory that returns a `Promise`/`Observable`; a `void`-returning factory runs inline and does not delay `ApplicationRef.isStable`, router initial navigation, or first paint.
- `AuthService`'s constructor (`@auth0/auth0-angular`, `auth0-angular.mjs:254-311`) is self-subscribing: it kicks off `checkSessionOrCallback$()` — either `handleRedirectCallback()` (code exchange, only on actual callback) or `this.auth0Client.checkSession()` (silent-auth iframe round trip) — via `.subscribe()`. The constructor itself returns immediately; the async work runs in the background and eventually flips `isLoading$` to `false`.
- Net effect of the eager initializer: it starts this same background work slightly **earlier** (at bootstrap instead of at first guard activation), which if anything lets it overlap with lazy-chunk download rather than run after it. It does not add a new wait or make anything slower.

### `authGuard` — the actual pre-existing wait (unchanged by the recent fix)

- `web/src/app/core/guards/auth.guard.ts:11-14` — the guard pipes `auth.isLoading$` through `filter(isLoading => !isLoading), take(1)` before checking `isAuthenticated$`. This means **route activation for `cases/new` is blocked until Auth0's `checkSession()` round trip completes**, regardless of whether the app initializer runs eagerly or lazily.
- This wait logic exists in the codebase prior to the `login-redirect-loop` fix and was explicitly evaluated and ruled out as *that* bug's root cause — see `context/archive/2026-07-09-login-redirect-loop/frame.md`, where the "Guard nie czeka poprawnie" (guard doesn't wait correctly) hypothesis was rated **NONE** (i.e., the guard's wait logic was already correct).
- On a cold browser/session, `checkSession()`'s hidden-iframe round trip to the Auth0 tenant domain is a real network operation and can plausibly take one to several seconds — this lines up with the reported "kilka sekund" (a few seconds) on first view.

### Backend `/api/cases` endpoint — ruled out as the cause

- Controller → service → repository chain: `src/main/java/com/example/clearkyc/web/CaseController.java:35-38` → `service/CaseService.java:79-89` → `repository/KybCaseRepository.java:16-23`.
- The repository query is a single `@Query` projection with a `LEFT JOIN` (`KybCaseRepository.java:16-22`), filtered by `analystIdentity`, ordered by `createdAt desc`, `limit 20` — one SQL statement, no N+1, no eager-entity-graph blowup (it returns `Object[]` rows, not full entities).
- Fly.io config (`fly.toml:20-22`): `auto_stop_machines = "off"`, `min_machines_running = 1` — the backend is never scaled to zero, so there's no infra-level cold start for this or any endpoint.
- No LLM/extraction work is in this request path (`listCases` only touches `KybCaseRepository`/`AuditRecordRepository`).
- Non-blocking caveat found in passing (not the reported symptom, but worth flagging): no index annotation was found on `KybCase.analystIdentity` in the entity class — worth confirming against the Flyway/Liquibase migrations under `src/main/resources/db/migration/` before case volume grows, since this becomes a full-table-scan risk over time. Also, `limit 20` has no real pagination (no `Pageable`/offset), a scalability ceiling once an analyst passes 20 cases — unrelated to the reported lag but adjacent.

## Code References

- `web/src/app/app.routes.ts:5-8` — `cases/new` route: lazy component + `authGuard`, no resolver
- `web/src/app/core/guards/auth.guard.ts:11-14` — guard blocks on `isLoading$` until Auth0 `checkSession()`/callback handling completes
- `web/src/app/app.config.ts:19-23,48` — `authInitializer`, eager but non-blocking `AuthService` construction
- `web/src/app/features/case-new/case-new.component.ts:61-63` — `loadRecentCases()` called from constructor (post-guard, post-chunk-load)
- `web/src/app/core/store/case.store.ts:25-46` — `recentCases$` (shareReplay-cached observable) and `loadRecentCases()` no-op guard against refetch
- `web/src/app/core/store/case.store.ts:48-55` — `refreshRecentCases()`, explicit cache invalidation after case create/status change
- `web/src/app/core/services/case.service.ts:20-22` — `GET /api/cases` HTTP call
- `web/src/app/features/case-new/case-new.component.html:95-98` — loading/error UI for the sidebar list
- `src/main/java/com/example/clearkyc/web/CaseController.java:35-38` — `listCases()` controller endpoint
- `src/main/java/com/example/clearkyc/repository/KybCaseRepository.java:16-23` — single-query projection with `LEFT JOIN`, `limit 20`
- `fly.toml:20-22` — `min_machines_running = 1`, no scale-to-zero

## Architecture Insights

- **Fetch-on-construct, not resolver-based.** The codebase's convention for `cases/new`'s sidebar data is component-constructor-triggered fetching with signal-based loading/error state, not an Angular route `resolve`. This is fine for a non-critical sidebar (main upload flow stays interactive), but it means the fetch necessarily starts *after* the guard and *after* the lazy chunk resolves — the two delays stack instead of overlapping. A resolver, or triggering the fetch outside the guarded route (e.g. from a root-level service warmed at the same time as the Auth0 initializer), would let the case-list HTTP call run in parallel with the Auth0 `checkSession()` wait instead of after it.
- **`CaseStore` caching is deliberate and correct.** `recentCases` is a `providedIn: 'root'` signal, explicitly preserved across `reset()` (`case.store.ts:69` comment) and only invalidated via `refreshRecentCases()` on actual case-state changes. So this lag is strictly a first-visit-per-session cost, not a recurring one.
- **Auth0 silent-auth cost is invisible in the code, only visible at runtime.** Nothing in the Angular code models or bounds how long `checkSession()`'s iframe round trip takes — it's entirely dependent on network conditions and the Auth0 tenant's response time. This is a common blind spot: the guard is "correct" by the code's own logic, but the UX cost is externalized to a third-party network call with no timeout/fallback visible in `auth.guard.ts`.

## Historical Context (from prior changes)

- `context/archive/2026-07-09-login-redirect-loop/plan.md` and `plan-brief.md` — the just-closed change that added the eager `AuthService` initializer. It explicitly frames the initializer as non-blocking "to not add startup latency for every load," and its manual verification notes accepted "a brief landing-page flash... before redirect... deemed acceptable" — i.e., there's already a team precedent of tolerating a brief perceptible delay around the Auth0 handoff as an acceptable tradeoff, not something that needs eliminating.
- `context/archive/2026-07-09-login-redirect-loop/frame.md` — evaluated and ruled out "guard doesn't wait correctly" as a hypothesis (rated **NONE**); confirms the guard's `isLoading$` wait is intentional, pre-existing, correct-by-design behavior — not a bug introduced by that change.
- `context/changes/core-case-flow/research.md` — sets an NFR target of "5s to first field" for the (unrelated) extraction SSE stream, and separately notes PDF storage as an accepted MVP limitation (in-memory signal, reset on reload). No direct bearing on this lag, but establishes the project's general tolerance for single-digit-second latencies on other flows.
- `context/changes/fly-deploy/research.md`, `frame.md` — no discussion of `min_machines_running`/autostop; deployment research didn't address idle/cold-start behavior, but the current `fly.toml` already has `min_machines_running = 1`, so this is moot for the reported symptom.
- No prior change folder addresses this specific "recent cases first-load lag" symptom — `context/changes/recent-cases-first-load-lag/change.md` is the first artifact for it.

## Related Research

- `context/archive/2026-07-09-login-redirect-loop/plan.md` — the Auth0 cold-start login fix this investigation double-checked for interaction effects.
- `context/changes/core-case-flow/research.md` — SSE/extraction latency budget, useful comparison point for "acceptable" latency norms in this app.

## Open Questions

- How long does the `checkSession()` silent-auth round trip actually take in production (Fly.io-hosted backend + Auth0 tenant), measured rather than inferred from code? Recommend capturing a HAR/network trace on a real cold first-login to confirm the guard wait is the dominant contributor before deciding on a fix.
- Is a route resolver (or a root-level "warm the case list in parallel with auth" strategy) worth the added complexity, given the team's stated tolerance for brief post-login delays (per the `login-redirect-loop` precedent)? This is a product/UX prioritization call, not something this research can settle.
- Should `KybCase.analystIdentity` have a DB index? Not the cause of the reported lag (query volume is currently low), but flagged during backend research as worth confirming in the Flyway/Liquibase migrations before it becomes one.
