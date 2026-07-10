# Recent Cases First-Load Lag Implementation Plan

## Overview

The "ostatnie sprawy" (recent cases) sidebar on `cases/new` currently starts fetching data only after the Auth0 route guard resolves and the lazy route chunk loads — stacking the Auth0 `checkSession()` wait and the case-list fetch sequentially instead of letting them overlap. This plan starts the case-list fetch in parallel with Auth0's authentication check (at app bootstrap) and adds lightweight Performance API instrumentation so the actual first-load timing is measurable in production, not just inferred from code.

## Current State Analysis

Per `context/changes/recent-cases-first-load-lag/research.md`:

- `CaseNewComponent`'s constructor (`web/src/app/features/case-new/case-new.component.ts:61-63`) calls `CaseStore.loadRecentCases()`. Because there's no route resolver, this only happens after `authGuard` (`app.routes.ts:8`) resolves `true` and the `cases/new` lazy chunk finishes loading.
- `authGuard` (`web/src/app/core/guards/auth.guard.ts:11-14`) blocks route activation until Auth0's `isLoading$` flips to `false`, which depends on the Auth0 SDK's `checkSession()` silent-auth round trip (a hidden-iframe network call) completing — a real, unbounded-in-code network cost.
- `CaseStore.loadRecentCases()` (`web/src/app/core/store/case.store.ts:30-46`) already no-ops if data is loaded or a load is in flight — this is a first-visit-per-session cost only.
- `web/src/app/app.config.ts` already has one `provideAppInitializer(authInitializer)` (from the `login-redirect-loop` change) that branches on `environment.skipAuth`: in dev (`skipAuth: true`) it does nothing; in prod it eagerly constructs `AuthService`.
- No Performance API usage exists anywhere in the codebase yet — this plan introduces the first use of `performance.mark`/`performance.measure`.

## Desired End State

The case-list HTTP request (`GET /api/cases`) starts as soon as the app can determine the analyst is authenticated — running in parallel with route resolution and lazy-chunk loading — instead of only starting after both have finished. A `performance.measure` entry captures the wall-clock time from app bootstrap to first-load completion, inspectable via the browser's Performance panel or `performance.getEntriesByName(...)` in production, without requiring a HAR trace to confirm impact.

Verification: in a fresh incognito session against the deployed app, `cases/new`'s recent-cases sidebar populates visibly sooner (fewer perceived seconds of "Wczytywanie...") than before this change, and `performance.getEntriesByName('clearkyc:recent-cases:first-load')` in DevTools console returns exactly one entry after the first successful load.

### Key Discoveries:

- `web/src/app/app.config.ts:15-23` — the `environment.skipAuth` branch pattern to mirror for the new initializer (dev mode has no `AuthService` provider at all; injecting it unconditionally throws `NullInjectorError`).
- `web/src/app/core/store/case.store.ts:25-46` — `loadRecentCases()`'s existing no-op guard means calling it twice (once from the new initializer, once from `CaseNewComponent`'s constructor as before) is safe and requires no change to the component.
- `web/src/app/core/store/case.store.ts:48-55` — `refreshRecentCases()` re-invokes `loadRecentCases()` after case create/status changes; the new instrumentation must not re-measure on this path (see Critical Implementation Details).

## What We're NOT Doing

- Not building a generalized "warm on auth" mechanism for future routes — this is a dedicated fix for `recentCases` only (per user decision).
- Not adding a route resolver — resolvers still run after `canActivate`, so they wouldn't remove the sequential wait on `checkSession()`.
- Not touching the backend `/api/cases` endpoint, its query, or adding a DB index on `analyst_identity` — research ruled out the backend as the cause; the index question is explicitly out of scope for this change.
- Not adding retry/queueing logic to the HTTP interceptor for early (pre-auth) requests — the prefetch waits for `isAuthenticated$` to emit `true` before firing, so no 401 is expected in the normal flow.
- Not wiring the Performance API measurements into any analytics/telemetry pipeline — none exists in this project; entries are inspectable via DevTools only, per the instrumentation-only scope of this change.

## Implementation Approach

Add a second `provideAppInitializer` in `app.config.ts`, alongside the existing `authInitializer`, that starts `CaseStore.loadRecentCases()` as early as authentication state allows:
- In dev mode (`skipAuth: true`), there's no real auth wait — call `loadRecentCases()` immediately.
- In prod mode, inject `AuthService` and subscribe to `isAuthenticated$.pipe(filter(Boolean), take(1))`, calling `loadRecentCases()` only once the analyst is confirmed authenticated (avoiding a premature 401).

This runs independently of route activation and the lazy `cases/new` chunk, so the two previously-sequential costs (auth wait, then component-mount-triggered fetch) now overlap. `CaseNewComponent`'s existing constructor call stays untouched — it becomes a no-op in the common case thanks to the existing guard in `loadRecentCases()`, and remains the correct fallback for any navigation path where the prefetch initializer didn't fire (there is none today, but this keeps the component self-sufficient).

Instrumentation lives in `CaseStore.loadRecentCases()` itself (not duplicated in the initializer) so it automatically covers both entry points (the new prefetch and the pre-existing component-constructor call) without needing two code paths to stay in sync.

## Critical Implementation Details

**State sequencing**: The Performance API measurement must be scoped to the *first* successful (or failed) completion of `loadRecentCases()` only. `refreshRecentCases()` (`case.store.ts:48-55`) resets `recentCases` to `[]` and re-invokes `loadRecentCases()` after every case create/status change — without a one-time guard, each of those re-invocations would call `performance.measure()` against the *original* bootstrap-time start mark (which only fires once), producing a nonsensical "minutes long" measurement instead of being skipped or measured against its own start. Guard this with a private boolean field (e.g. `private firstLoadMeasured = false`) in `CaseStore`, set to `true` right after the first measurement fires, checked before creating the `performance.measure()` call on every subsequent completion.

## Phase 1: Parallel prefetch with Performance API instrumentation

### Overview

Start the recent-cases fetch in parallel with the Auth0 authentication check, and record how long the whole first-load sequence actually takes.

### Changes Required:

#### 1. Root-level prefetch initializer

**File**: `web/src/app/app.config.ts`

**Intent**: Add a new exported initializer function that starts `CaseStore.loadRecentCases()` as early as authentication state allows, mirroring the existing `authInitializer`'s `environment.skipAuth` branching so it never injects `AuthService` when it isn't provided (dev mode). Also marks the bootstrap-time start of the measurement window.

**Contract**: New exported function `recentCasesPrefetchInitializer(): void`, wired via a second `provideAppInitializer(recentCasesPrefetchInitializer)` entry in `appConfig.providers` (order relative to the existing `provideAppInitializer(authInitializer)` entry doesn't matter — Angular's DI resolves `AuthService`/`CaseStore` by dependency graph, not provider array order). At the top of the function, call `performance.mark('clearkyc:recent-cases-prefetch:start')` unconditionally (both branches need this single, one-time mark as the measurement window's start). Then:
- if `environment.skipAuth`: `inject(CaseStore).loadRecentCases()` immediately.
- else: `inject(AuthService).isAuthenticated$.pipe(filter(Boolean), take(1)).subscribe(() => inject(CaseStore).loadRecentCases())` — note `inject()` must be called synchronously within the initializer's injection context, so capture `CaseStore` via `inject(CaseStore)` before entering the `.subscribe()` callback, not inside it.

#### 2. First-load measurement in the store

**File**: `web/src/app/core/store/case.store.ts`

**Intent**: Record how long the first successful (or failed) `loadRecentCases()` completion took, relative to the bootstrap-time mark set in `app.config.ts`, without corrupting the measurement on later refreshes.

**Contract**: Add a private `firstLoadMeasured = false` field to `CaseStore`. Inside `loadRecentCases()`'s existing `next`/`error` callbacks (`case.store.ts:35-43`), after the existing state updates, add: if `!this.firstLoadMeasured`, set `this.firstLoadMeasured = true`, call `performance.mark('clearkyc:recent-cases:fetch-end')`, then `performance.measure('clearkyc:recent-cases:first-load', 'clearkyc:recent-cases-prefetch:start', 'clearkyc:recent-cases:fetch-end')`. Both `next` and `error` branches should do this (a failed first load still ends the measurement window) — factor it into one private method (e.g. `private markFirstLoadComplete(): void`) called from both callbacks to avoid duplicating the guard logic.

### Success Criteria:

#### Automated Verification:

- Unit test suite passes: `npm run test` (from `web/`)
- Lint passes: `npm run lint` (from `web/`)
- Production build succeeds: `npm run build` (from `web/`)

#### Manual Verification:

- In a fresh incognito window against the deployed app, `cases/new`'s sidebar shows the recent-cases list populated visibly sooner than before this change (compare DevTools Network timeline: `GET /api/cases` now starts near app bootstrap instead of after route/chunk/component-mount).
- In DevTools console after a fresh first load, `performance.getEntriesByName('clearkyc:recent-cases:first-load')` returns exactly one `PerformanceMeasure` entry.
- Trigger a case create (or status change) after the first load, confirm no additional `clearkyc:recent-cases:first-load` entries appear (`getEntriesByName` still returns exactly one).
- Dev mode (`skipAuth: true`) still loads `cases/new` without Auth0-related console errors, and the recent-cases list populates (unaffected by the new initializer's dev-mode branch).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Unit test coverage for the prefetch initializer and measurement guard

### Overview

Lock in the new timing behavior with unit tests, following the existing `app.config.spec.ts` convention (mutate the shared `environment` object directly rather than mocking the module), so a future edit can't silently break the skipAuth branch or the "measure once" guard.

### Changes Required:

#### 1. Prefetch initializer test

**File**: `web/src/app/app.config.spec.ts` (extend existing file)

**Intent**: Verify `recentCasesPrefetchInitializer` calls `CaseStore.loadRecentCases()` immediately when `skipAuth` is `true`, and only after `isAuthenticated$` emits `true` when `skipAuth` is `false` — never before, and never at all if authentication never resolves.

**Contract**: Two to three test cases mirroring the existing `authInitializer` describe block's `beforeEach`/`afterEach` `environment.skipAuth` mutation pattern: (1) `skipAuth: true` — `loadRecentCases()` (spied via a `CaseStore` stub provided through `TestBed`) is called synchronously without any `AuthService` provider present; (2) `skipAuth: false` with a stubbed `AuthService.isAuthenticated$` `BehaviorSubject` — `loadRecentCases()` is not called while the subject is `false`, and is called exactly once after it emits `true`; (3) `skipAuth: false`, subject never emits `true` — `loadRecentCases()` is never called (no throw, no leak).

#### 2. First-load measurement guard test

**File**: `web/src/app/core/store/case.store.spec.ts` (new file, if no existing spec covers `CaseStore`; extend if one exists — check `web/src/app/core/store/` before creating)

**Intent**: Verify the `performance.measure` call fires exactly once across multiple `loadRecentCases()`/`refreshRecentCases()` cycles, per the Critical Implementation Details guard.

**Contract**: Stub `CaseService.listCases()` to return a synchronous observable (e.g. `of([...])`). Spy on `performance.mark`/`performance.measure` (via `vi.spyOn(performance, 'measure')`). Call `loadRecentCases()` once, assert `performance.measure` was called once with `'clearkyc:recent-cases:first-load'`. Then call `refreshRecentCases()` (which resets and reloads), assert `performance.measure` is still called exactly once in total (not twice).

### Success Criteria:

#### Automated Verification:

- New/extended specs pass: `npm run test -- --include='**/app.config.spec.ts' --include='**/case.store.spec.ts'` (from `web/`)
- Full unit test suite still passes: `npm run test` (from `web/`)
- Lint passes: `npm run lint` (from `web/`)

#### Manual Verification:

- None — this phase is test-only, covered entirely by automated verification.

---

## Testing Strategy

### Unit Tests:

- `app.config.spec.ts` (extended, Phase 2): asserts `recentCasesPrefetchInitializer`'s skipAuth branch and `isAuthenticated$`-gated branch call `CaseStore.loadRecentCases()` at the right time and never prematurely.
- `case.store.spec.ts` (new or extended, Phase 2): asserts the first-load `performance.measure` fires exactly once, even across `refreshRecentCases()` cycles.

### Integration Tests:

- None added — confirming the actual wall-clock improvement against real Auth0/network conditions is covered by Phase 1's manual verification (DevTools Network timeline + `performance.getEntriesByName` inspection), per the "no analytics pipeline" scope decision.

### Manual Testing Steps:

1. In a fresh incognito window against the deployed app, log in and observe the `cases/new` sidebar's "Wczytywanie..." row — note how quickly it resolves compared to before this change.
2. Open DevTools Network tab, filter for `/api/cases`, confirm the request starts near app bootstrap (visible as one of the earliest requests) rather than after the `cases-new` lazy chunk request completes.
3. In DevTools console, run `performance.getEntriesByName('clearkyc:recent-cases:first-load')` and confirm exactly one entry with a plausible duration.
4. Upload a sample document to create a new case, then run the same `getEntriesByName` call again — confirm still exactly one entry (no duplicate measurement from `refreshRecentCases()`).
5. Switch to dev mode (`npm start`, `skipAuth: true`), confirm `cases/new` loads with no Auth0-related console errors and the recent-cases list still populates.

## Performance Considerations

This change is itself a performance fix — no additional performance risk is introduced. `performance.mark`/`performance.measure` are synchronous, in-memory browser APIs with negligible overhead (sub-millisecond), safe to call unconditionally on every app load.

## Migration Notes

Not applicable — no data or schema changes.

## References

- Research: `context/changes/recent-cases-first-load-lag/research.md`
- Precedent for the `environment.skipAuth` branching pattern and `provideAppInitializer` usage: `web/src/app/app.config.ts:15-23` (`authInitializer`, from the archived `login-redirect-loop` change)
- Precedent for initializer unit-test conventions: `web/src/app/app.config.spec.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Parallel prefetch with Performance API instrumentation

#### Automated

- [x] 1.1 Unit test suite passes: `npm run test`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Production build succeeds: `npm run build`

#### Manual

- [x] 1.4 Recent-cases sidebar populates visibly sooner in a fresh incognito session (DevTools Network timeline comparison)
- [x] 1.5 `performance.getEntriesByName('clearkyc:recent-cases:first-load')` returns exactly one entry after first load
- [x] 1.6 No additional measurement entries appear after a case create / status change
- [x] 1.7 Dev mode (`skipAuth: true`) loads without Auth0-related console errors and recent-cases list populates

### Phase 2: Unit test coverage for the prefetch initializer and measurement guard

#### Automated

- [ ] 2.1 New/extended specs pass: `npm run test -- --include='**/app.config.spec.ts' --include='**/case.store.spec.ts'`
- [ ] 2.2 Full unit test suite still passes: `npm run test`
- [ ] 2.3 Lint passes: `npm run lint`
