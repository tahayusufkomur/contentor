# Site-builder block-editor fixes (sub-project A) — design

**Date:** 2026-06-19
**Status:** Approved, pending implementation plan
**Context:** First of four sub-projects from the coach site-builder punch-list.
Sub-projects B (courses options), C (video upload + library), D (niche-aware
example content) follow as their own spec → plan cycles.

## Problem

Three independent defects/gaps in the coach website builder's block editor:

1. **Brand background hides content.** A block's optional `style.background`
   "Brand" option (token `primary`) forces section text to `primary-foreground`
   but deliberately leaves buttons/links alone. A primary-filled button (e.g. the
   CTA block's `<Button>`) then renders primary-on-primary = invisible, and inline
   links / `text-muted-foreground` secondary copy can fall below contrast.
2. **Banner text alignment does nothing.** The banner block lays its content out
   with flex `justify-center` (+`text-center`). The align override applies only
   `[&>*]:!text-left/right`, and `text-align` cannot reposition flex items — so
   changing alignment is a no-op for banner.
3. **No H1 heading level.** `headingLevel` offers only H2/H3/H4 on the Text and
   Image+Text blocks.

All three are frontend-only: the relevant tokens/values are already
server-allowlisted, and `headingLevel` is passthrough block data (the backend
sanitizes only block type, style, and rich-text HTML — see
`apps/tenant_config/defaults.py` / `serializers._clean_block`).

## Goals

Fix the three issues with minimal, token-correct changes, concentrated in
`frontend-customer/src/lib/blocks/style.ts`, with no behaviour change to blocks
that don't use the affected controls.

## Non-goals

- No backend changes (allowlist already permits `primary`/`accent` backgrounds,
  the `align` control for banner, and free-form `headingLevel`).
- No new block types, no new style controls — only refine the three existing ones.
- Sub-projects B/C/D are out of scope.

## Design

### Fix 1 — Brand/Accent background keeps buttons & text visible

In `style.ts`, extend the `BACKGROUND_CLASSES.primary` and
`BACKGROUND_CLASSES.accent` entries so the override also:

- **Buttons:** flips shadcn buttons (`[&_[data-slot=button]]`) to an inverse fill
  on the brand surface — `!bg-primary-foreground !text-primary` (for `primary`);
  `!bg-accent-foreground !text-accent` (for `accent`) — so they remain visible.
  shadcn `Button` (incl. `asChild` → `<a>`) carries `data-slot="button"`, so this
  selector targets every CTA button regardless of element.
- **Links & remaining text:** force the contrasting foreground onto the text
  elements not already covered — add `a`, `strong`, `small`, `label` to the
  existing `h1..h4,p,li,span` list — so inline links and secondary copy stay
  readable. (The button selector's attribute specificity keeps button-link text
  as `text-primary`, winning over the broad `[&_a]` rule.)

Keep the `muted`/`card` entries unchanged (their foregrounds already contrast and
they carry no button-visibility problem).

### Fix 2 — Banner (and other flex blocks) honor alignment

In `style.ts`, extend `ALIGN_CLASSES` so each alignment also sets flex
justification on the block's direct child:

```
left:   "[&>*]:!text-left   [&>*]:!justify-start"
center: "[&>*]:!text-center [&>*]:!justify-center"
right:  "[&>*]:!text-right  [&>*]:!justify-end"
```

`justify-*` is ignored by non-flex direct children (richText/stats are block
divs → no-op), and makes alignment work for banner's flex row (and CTA's flex
layouts). No allowlist change — `banner` already permits `align`.

### Fix 3 — H1 heading level

- `registry.tsx`: add `{ label: "H1 (largest)", value: "h1" }` as the first
  `headingLevel` option on both `richText` and `imageText` (keep `defaultData.headingLevel: "h2"`).
- `style.ts` `headingClasses`: add an `"h1"` case →
  `"font-display text-4xl font-bold tracking-tight md:text-5xl"`.
- Blocks already render `<InlineText as={level} className={headingClasses(level)}>`,
  so `as="h1"` yields a semantic `<h1>` with no further block change. (Verify
  `image-text-block.tsx` uses the same `as={level}` pattern; fix if it hardcodes
  the tag.)

## Files

- Modify: `frontend-customer/src/lib/blocks/style.ts` (fixes 1, 2, 3)
- Modify: `frontend-customer/src/lib/blocks/registry.tsx` (fix 3 options ×2)
- Verify (modify only if needed): `frontend-customer/src/components/blocks/image-text-block.tsx`

## Verification

1. `tsc --noEmit` clean for `frontend-customer`.
2. Visual check in the running editor (dev stack), light **and** a dark theme:
   - A CTA block with **Brand** background → button clearly visible, heading +
     any link readable.
   - A Banner with alignment set to Left / Right → content visibly moves.
   - A Text block set to **H1** → renders larger than H2 and as a `<h1>` in the DOM.
3. Confirm no regression on blocks using `muted`/`card` backgrounds or the
   existing H2/H3/H4 levels.

## Risks

Low. All changes are additive Tailwind class strings on existing override maps;
the only cross-cutting one (justify in `ALIGN_CLASSES`) is a no-op for non-flex
blocks. Tailwind JIT needs the new class literals spelled out (they are, as full
strings) so they're generated.
