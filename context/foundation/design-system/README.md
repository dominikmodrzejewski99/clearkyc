# ClearKYC Design System

A design system for **ClearKYC** — a KYB (Know-Your-Business) compliance analyst
workstation used by senior bank compliance officers. The product is a single-page
analyst tool: upload a complex B2B corporate PDF (Articles of Association, trust
deeds, corporate filings), trigger LLM analysis, and watch structured entity fields
stream in alongside the embedded source document. The terminal action is an
immutable compliance decision — **Approve / Reject / Escalate**.

This is a v1, light-theme-only system designed for high information density on 1080p
back-office monitors. It is deliberately clinical and authoritative — closer to a
trading terminal, medical record, or legal review platform than a consumer app.

## Index

| File | Purpose |
|------|---------|
| `tokens.css` | **The deliverable.** All design tokens as CSS custom properties, ready to paste into a SCSS `:root` block. Colour, spacing, type, radius, elevation, layout. |
| `styleguide.html` | Living reference — renders every token and all four component specs with their states. Open this first. |
| `workstation.html` | Interactive prototype of the full analyst workstation. The system composed into the real flow. |
| `ck-app.jsx` | React app for the workstation prototype. |
| `ck-data.js` | Mock case data (a fabricated Articles of Association + field schema) driving the prototype. |
| `preview/` | Small reference cards shown in the Design System tab. |
| `SKILL.md` | Agent-Skill manifest for reuse in Claude Code. |

## Visual foundations

- **Palette.** A cool, slightly blue-tinted neutral gray ramp (`--gray-25` → `--gray-950`)
  carries ~95% of the UI. Colour is reserved almost entirely for the three terminal
  decisions. A single steel-blue accent (`--blue-500`) covers all interactive
  affordances, links, focus rings, and analyst-edit markers — no fourth hue is
  introduced for overrides, by design.
- **Status colour.** Three families, each verified at WCAG AA both as text-on-surface
  and as a solid fill with white text: **Approve** green (`--green-700`), **Reject**
  red (`--red-700`), **Escalate** amber/ochre (`--amber-700`). Decision buttons are
  outlined at rest; the analyst's current selection becomes the only saturated element
  in the field.
- **Typography.** `IBM Plex Sans` for the entire interface — a humanist grotesque
  built for technical/institutional contexts that stays crisp at 11–13px.
  `IBM Plex Mono` is reserved for quoted source text from the document, so citation
  snippets are visually distinct from analyst-facing form values at a glance. Base
  body size is 13px / 1.5.
- **Density.** A 4px base unit drives all spacing. Field rows target ~30px so an
  analyst can scan 20+ extracted fields without scrolling. Whitespace is functional,
  never decorative.
- **Elevation.** Shallow, flat shadows (`--shadow-xs/sm/md/lg`) — surfaces are
  separated mostly by hairline borders (`--border-subtle/default/strong`) rather than
  heavy drop shadows.
- **Radius.** Small and restrained: 2/3/5/8px. Inputs and buttons at 3px, cards and
  panels at 5–8px.
- **Motion.** Minimal by mandate — a blinking cursor for streaming fields, a pulse on
  the "Analysing" indicator, a brief highlight flash when a citation is opened.
  Nothing decorative.

## Citation visual language

Extracted fields carry inline source citations. The treatment is footnote-style:
a superscript marker (`[n]`, `--citation-marker`) sits beside the value, and the
quoted source snippet renders below in `IBM Plex Mono` inside a subtly tinted well
with a left rule (`--citation-border`). Clicking either the marker or the snippet
scrolls the embedded document to the source and highlights the exact quoted text.

## Field lifecycle states

The extraction form models five states, all specced in `styleguide.html` and live in
`workstation.html`:

1. **Empty** — not yet extracted (italic, disabled).
2. **Streaming** — actively written by the LLM (partial text + blinking cursor + tag).
3. **Populated** — value with a footnote citation snippet.
4. **Overridden** — analyst-edited; tinted accent row, inset left bar, struck original
   value, and a mandatory attributed + timestamped justification note.
5. **Not disclosed / inferred missing** — explicit absence marker (`∅`, dashed border).
   Missing *required* fields block Approve until resolved by override or escalation.

## Accessibility

Every text-on-surface pairing in `tokens.css` is annotated with its measured contrast
ratio and meets WCAG 2.1 AA (≥4.5:1 body, ≥3:1 large/UI). No dark mode in v1.

## Notes / substitutions

- **Fonts** load from Google Fonts (IBM Plex Sans / Mono). For an offline or
  production build, self-host the woff2 files and drop a local `@font-face` block.
- **Icons** use Unicode/text glyphs as placeholders (`✓ ✕ ▲ ✎ ∅ ◎ ▶`) per the brief —
  no icon library is committed yet. Swap in a real set (e.g. a stroked institutional
  set) when one is chosen.
- The prototype's "document" and case data are fabricated for demonstration only.
