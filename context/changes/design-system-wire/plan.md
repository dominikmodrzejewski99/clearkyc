# Design System Wire — Implementation Plan

## Overview

Fix two categories of issues in the Angular frontend design system foundation: (1) reconcile broken CSS variable references in `_mixins.scss` and `app-layout.component.scss` with the canonical token names defined in `_variables.scss`; (2) migrate IBM Plex font loading from Google Fonts CDN to `@fontsource` npm packages for offline-capable, deterministic builds.

## Current State Analysis

- `styles.scss` correctly imports the design system (reset, variables, mixins) and applies base body styles using correct token names. IBM Plex loaded via `@import url('https://fonts.googleapis.com/...')`.
- `_variables.scss` defines tokens as `--text-secondary`, `--surface-raised`, `--surface-sunken`, `--border-strong`, `--border-focus`, etc. — no `--color-*` prefix, no `--surface-panel`.
- `_mixins.scss` references 4 non-existent tokens: `--color-text-secondary`, `--color-surface-panel`, `--color-border-strong`, `--color-border-focus`. These silently fall back to browser defaults.
- `app-layout.component.scss:33` — `.app-layout__placeholder` uses `var(--surface-panel)` which doesn't exist in `_variables.scss`. Should be `--surface-sunken` (gray-100 inset well).
- `app.html` — welcome placeholder with inline oklch styles and `font-family: Inter`. Excluded from scope (throwaway, replaced in S-01).

### Key Discoveries

- `web/src/styles/design-system/_mixins.scss:16` — `--color-surface-panel` in `panel-placeholder` mixin
- `web/src/styles/design-system/_mixins.scss:19` — `--color-border-strong` in `panel-placeholder` mixin
- `web/src/styles/design-system/_mixins.scss:31` — `--color-text-secondary` in `panel-placeholder` mixin
- `web/src/styles/design-system/_mixins.scss:35` — `--color-border-focus` in `focus-ring` mixin
- `web/src/app/layout/app-layout/app-layout.component.scss:33` — `--surface-panel` in placeholder background
- `web/src/styles.scss:6` — Google Fonts CDN `@import url(...)` to replace
- Angular build uses `@angular/build:application` (esbuild) — no tilde prefix needed for npm package imports

## Desired End State

All CSS custom property references in the design system resolve to tokens defined in `_variables.scss`. No broken-variable silent fallbacks. IBM Plex Sans and IBM Plex Mono load from npm packages bundled at build time — no CDN requests, no network dependency for font rendering.

### Verification

`ng build` completes cleanly. Browser DevTools shows: no requests to `fonts.googleapis.com`, no CSS variable resolution warnings, computed `font-family` on `body` resolves to "IBM Plex Sans". AppLayout placeholder renders with gray-100 background and dashed border visible against the white pane.

## What We're NOT Doing

- Not touching `app.html` welcome screen (throwaway placeholder, replaced in S-01)
- Not adding new design tokens to `_variables.scss`
- Not creating new components
- Not building any feature UI
- Not adding a SCSS linter (separate concern, post-MVP tooling)

## Implementation Approach

Two sequential phases, both mechanical: first fix all broken CSS variable references (pure renames, no visual redesign), then swap font loading from CDN to npm. Phase 1 is a prerequisite for Phase 2 only in the sense that both should land in the same PR — they are technically independent.

---

## Phase 1: Fix broken CSS variable references

### Overview

Rename 4 broken variable references in `_mixins.scss` and 1 in `app-layout.component.scss` to match the canonical token names in `_variables.scss`. No new tokens added; no visual intent changed.

### Changes Required

#### 1. `_mixins.scss` — reconcile 4 broken token references

**File**: `web/src/styles/design-system/_mixins.scss`

**Intent**: The `panel-placeholder` and `focus-ring` mixins reference CSS variables with a `--color-` prefix that doesn't exist in `_variables.scss`. Rename each to the canonical equivalent so the mixins resolve correctly when used by future components.

**Contract**: Four substitutions in `_mixins.scss`:

| Broken reference (current) | Canonical token (after fix) |
|---|---|
| `var(--color-text-secondary)` | `var(--text-secondary)` |
| `var(--color-surface-panel)` | `var(--surface-sunken)` |
| `var(--color-border-strong)` | `var(--border-strong)` |
| `var(--color-border-focus)` | `var(--border-focus)` |

All four are in the `panel-placeholder` and `focus-ring` mixins (lines 10–36).

#### 2. `app-layout.component.scss` — fix `--surface-panel`

**File**: `web/src/app/layout/app-layout/app-layout.component.scss`

**Intent**: The `.app-layout__placeholder` element uses `var(--surface-panel)` for its background color, which doesn't exist in `_variables.scss`. Replace with `var(--surface-sunken)` (gray-100), which matches the inset-well visual intent of a dashed placeholder.

**Contract**: One substitution at line 33: `background-color: var(--surface-panel)` → `background-color: var(--surface-sunken)`.

### Success Criteria

#### Automated Verification

- Angular build succeeds without errors: `cd web && ng build`

#### Manual Verification

- Navigate to `/cases/new` in the running dev server (`ng serve`)
- Both split-pane placeholder boxes render with a light gray (gray-100) background and a visible dashed border — not white/transparent
- Browser DevTools Console shows no CSS custom property resolution warnings for the fixed tokens

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2.

---

## Phase 2: @fontsource font loading migration

### Overview

Replace the Google Fonts CDN `@import url(...)` in `styles.scss` with `@fontsource` npm package imports so IBM Plex Sans and IBM Plex Mono are bundled at build time and require no network access to render.

### Changes Required

#### 1. Install `@fontsource` packages

**File**: `web/package.json` (via npm install in `web/`)

**Intent**: Add IBM Plex Sans and IBM Plex Mono as npm dependencies so font files are available in `node_modules` for the Angular build to bundle.

**Contract**: Run `npm install @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono` from `web/`. After install, inspect the package directory structure (e.g. `ls web/node_modules/@fontsource/ibm-plex-sans/`) to confirm available CSS file naming before editing `angular.json`.

#### 2. Update `angular.json` — add font CSS files to styles array

**File**: `web/angular.json`

**Intent**: Wire the @fontsource CSS files into the Angular build via the `styles` array so esbuild bundles the font assets. Importing here (rather than in `styles.scss`) is the conventional approach for npm font packages in Angular projects.

**Contract**: In the `styles` array (currently `["src/styles.scss"]`), prepend entries for each weight and style needed. Import only the weights declared in `_variables.scss` (`--weight-regular: 400`, `--weight-medium: 500`, `--weight-semibold: 600`, `--weight-bold: 700`):

Weights for IBM Plex Sans: 400, 400-italic, 500, 600, 700.
Weights for IBM Plex Mono: 400, 400-italic, 500.

Confirm exact file names against the installed package before editing. Typical @fontsource naming: `node_modules/@fontsource/ibm-plex-sans/400.css`, `node_modules/@fontsource/ibm-plex-sans/400-italic.css`, etc.

#### 3. Remove CDN `@import` from `styles.scss`

**File**: `web/src/styles.scss`

**Intent**: Delete the `@import url('https://fonts.googleapis.com/...')` line now that fonts are bundled via `angular.json`. The `@use` imports for the design system SCSS partials stay unchanged.

**Contract**: Remove exactly one line — the `@import url('https://fonts.googleapis.com/css2?...')` line. All other lines in `styles.scss` remain.

### Success Criteria

#### Automated Verification

- `npm install` succeeds in `web/`: `cd web && npm install`
- Angular build succeeds: `cd web && ng build`

#### Manual Verification

- Open DevTools → Network tab → filter by "google" → confirm zero requests to `fonts.googleapis.com` on page load
- DevTools → Elements → select `body` → Computed → verify `font-family` resolves to `"IBM Plex Sans"` (not `system-ui` or `Inter`)
- DevTools → Network → throttle to "Offline" → reload page → verify IBM Plex Sans still renders (not falling back to system font)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before closing this change.

---

## Testing Strategy

### Manual Testing Steps

1. `cd web && ng serve` — start dev server
2. Open browser at `http://localhost:1999`
3. DevTools → Console — check for CSS variable warnings (should be zero after Phase 1)
4. DevTools → Network — confirm no `fonts.googleapis.com` requests (after Phase 2)
5. DevTools → Elements → body → Computed → font-family confirms IBM Plex Sans
6. Throttle to Offline → reload → fonts still render correctly

## References

- Design tokens: `web/src/styles/design-system/_variables.scss`
- Mixins: `web/src/styles/design-system/_mixins.scss`
- AppLayout styles: `web/src/app/layout/app-layout/app-layout.component.scss`
- Global styles entry: `web/src/styles.scss`
- Angular build config: `web/angular.json`
- Roadmap: `context/foundation/roadmap.md` (F-05)

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Fix broken CSS variable references

#### Automated

- [x] 1.1 Angular build succeeds: `cd web && ng build` — 6bd4e62

#### Manual

- [x] 1.2 Split-pane placeholders render with gray-100 background and visible dashed border — 6bd4e62
- [x] 1.3 No CSS variable resolution warnings in DevTools Console — 6bd4e62

### Phase 2: @fontsource font loading migration

#### Automated

- [x] 2.1 `npm install` succeeds with @fontsource packages added
- [x] 2.2 `ng build` succeeds without font asset errors

#### Manual

- [x] 2.3 No requests to `fonts.googleapis.com` in DevTools Network tab
- [x] 2.4 Body `font-family` resolves to IBM Plex Sans in DevTools Computed
- [x] 2.5 IBM Plex Sans renders correctly with network throttled to Offline
