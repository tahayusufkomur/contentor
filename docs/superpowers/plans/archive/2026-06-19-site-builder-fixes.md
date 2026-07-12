# Site-builder Block-editor Fixes (sub-project A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three coach-site-builder block-editor defects — Brand background hiding buttons/text, banner alignment doing nothing, and the missing H1 heading level.

**Architecture:** Frontend-only, concentrated in `frontend-customer/src/lib/blocks/style.ts` (the per-block style override maps) plus two registry options. No backend, no new block types/controls. The blocks already drive heading tags via `as={level}`, and the override maps are plain Tailwind class strings applied by `BlockRenderer`.

**Tech Stack:** Next.js 14, React, Tailwind v3 (CSS-var tokens), TypeScript.

## Global Constraints

- **Frontend-only.** No backend changes — `primary`/`accent` backgrounds, the `align` control for `banner`, and free-form `headingLevel` are already server-permitted.
- **Token-only color** (house rule): use only semantic tokens (`primary`/`primary-foreground`, `accent`/`accent-foreground`), never raw colors.
- **Tailwind JIT needs literal class strings** — every new utility must be spelled out as a full string literal in `style.ts` (no dynamic concatenation), matching the file's existing convention.
- Don't change blocks using `muted`/`card` backgrounds or the existing H2/H3/H4 levels.
- Never commit unless the user has authorized it (repo CLAUDE.md). Each task ends with a *suggested* commit.
- Work dir: `~/ws/projects-in-progress/contentor`.

---

### Task 1: Fix 1 — Brand/Accent background keeps buttons & text visible

**Files:**
- Modify: `frontend-customer/src/lib/blocks/style.ts` (the `BACKGROUND_CLASSES` map, `primary` and `accent` entries)

- [ ] **Step 1: Extend the `primary` entry**

Replace the current `primary:` value in `BACKGROUND_CLASSES` with (one line, full literals):

```ts
  primary:
    "[&>*]:!bg-primary [&>*]:!text-primary-foreground [&_h1]:!text-primary-foreground [&_h2]:!text-primary-foreground [&_h3]:!text-primary-foreground [&_h4]:!text-primary-foreground [&_p]:!text-primary-foreground [&_li]:!text-primary-foreground [&_span]:!text-primary-foreground [&_a]:!text-primary-foreground [&_strong]:!text-primary-foreground [&_small]:!text-primary-foreground [&_label]:!text-primary-foreground [&_[data-slot=button]]:!bg-primary-foreground [&_[data-slot=button]]:!text-primary",
```

- [ ] **Step 2: Extend the `accent` entry**

Replace the current `accent:` value with:

```ts
  accent:
    "[&>*]:!bg-accent [&>*]:!text-accent-foreground [&_h1]:!text-accent-foreground [&_h2]:!text-accent-foreground [&_h3]:!text-accent-foreground [&_h4]:!text-accent-foreground [&_p]:!text-accent-foreground [&_li]:!text-accent-foreground [&_span]:!text-accent-foreground [&_a]:!text-accent-foreground [&_strong]:!text-accent-foreground [&_small]:!text-accent-foreground [&_label]:!text-accent-foreground [&_[data-slot=button]]:!bg-accent-foreground [&_[data-slot=button]]:!text-accent",
```

Leave `muted` and `card` unchanged.

- [ ] **Step 3: Rationale check (no run)**

shadcn `Button` (incl. `asChild` → `<a>`) carries `data-slot="button"`, so `[&_[data-slot=button]]` targets every CTA button. Its attribute specificity (0,2,0) beats the `[&_a]` element rule (0,1,1), so a button-link's text stays `text-primary` (readable on the `primary-foreground` fill) while plain links become `primary-foreground`.

- [ ] **Step 4: Suggested commit (await user OK)**

```bash
git add frontend-customer/src/lib/blocks/style.ts
git commit -m "fix(site-builder): keep buttons + links visible on Brand/Accent block backgrounds"
```

---

### Task 2: Fix 2 — Banner (and flex blocks) honor alignment

**Files:**
- Modify: `frontend-customer/src/lib/blocks/style.ts` (the `ALIGN_CLASSES` map)

- [ ] **Step 1: Add flex justification to each alignment**

Replace the `ALIGN_CLASSES` map with:

```ts
const ALIGN_CLASSES: Record<string, string> = {
  left: "[&>*]:!text-left [&>*]:!justify-start",
  center: "[&>*]:!text-center [&>*]:!justify-center",
  right: "[&>*]:!text-right [&>*]:!justify-end",
};
```

`justify-*` is ignored by non-flex direct children (richText/stats render block divs → no-op) and repositions banner's flex row (and CTA's flex layouts).

- [ ] **Step 2: Suggested commit (await user OK)**

```bash
git add frontend-customer/src/lib/blocks/style.ts
git commit -m "fix(site-builder): make banner/flex alignment actually move content (justify)"
```

---

### Task 3: Fix 3 — Add an H1 heading level

**Files:**
- Modify: `frontend-customer/src/lib/blocks/style.ts` (`headingClasses`)
- Modify: `frontend-customer/src/lib/blocks/registry.tsx` (`richText` + `imageText` `headingLevel` options)
- Verify (modify only if it hardcodes the tag): `frontend-customer/src/components/blocks/image-text-block.tsx`

- [ ] **Step 1: Add the `h1` case to `headingClasses`**

In `style.ts`, add a case to the `switch (level)` in `headingClasses`, above `case "h3"`:

```ts
    case "h1":
      return "font-display text-4xl font-bold tracking-tight md:text-5xl";
```

(The `default` branch keeps returning the H2 size — `text-3xl` — so existing blocks are unchanged.)

- [ ] **Step 2: Add the H1 option to both blocks' `headingLevel` field**

In `registry.tsx`, in BOTH the `richText` and `imageText` definitions, prepend the H1 option so the select reads:

```ts
        options: [
          { label: "H1 (largest)", value: "h1" },
          { label: "H2 (large)", value: "h2" },
          { label: "H3 (medium)", value: "h3" },
          { label: "H4 (small)", value: "h4" },
        ],
```

Leave `defaultData.headingLevel: "h2"` unchanged in both (H2 stays the default).

- [ ] **Step 3: Verify `image-text-block.tsx` renders the dynamic tag**

```bash
grep -nE "as=\{level\}|headingLevel|headingClasses|as=\"h" frontend-customer/src/components/blocks/image-text-block.tsx
```
Expected: it uses `as={level}` + `headingClasses(level)` like `rich-text-block.tsx`. If instead it hardcodes `as="h2"`, change it to read `const level = data.headingLevel || "h2"` and pass `as={level} className={headingClasses(level)}` (mirroring `rich-text-block.tsx`).

- [ ] **Step 4: Suggested commit (await user OK)**

```bash
git add frontend-customer/src/lib/blocks/style.ts frontend-customer/src/lib/blocks/registry.tsx frontend-customer/src/components/blocks/image-text-block.tsx
git commit -m "feat(site-builder): add H1 heading level to Text and Image+Text blocks"
```

---

### Task 4: Verification (typecheck + live visual)

**Files:** none (verification only).

- [ ] **Step 1: Typecheck frontend-customer**

```bash
cd ~/ws/projects-in-progress/contentor
docker compose run --rm --no-deps -T nextjs-customer sh -c 'npx tsc --noEmit && echo TSC_CLEAN'
```
Expected: `TSC_CLEAN` (no `error TS...`).

- [ ] **Step 2: Bring up the dev stack**

```bash
docker compose up -d
```
Wait for `nextjs-customer` to compile (watch `docker compose logs -f nextjs-customer` for "Ready").

- [ ] **Step 3: Visual check in the editor** (a real tenant, e.g. `http://tahaws.localhost`, in the owner/edit mode)

Confirm:
1. A **CTA** block with the **Brand** background → its button is clearly visible (inverse fill) and the heading/links readable. Repeat for **Accent**.
2. A **Banner** block with alignment set to **Left** then **Right** → the text+link visibly shift left/right (not stuck centered).
3. A **Text** block set to **H1** → renders larger than H2; confirm `<h1>` in DevTools. Existing H2/H3/H4 unchanged.
4. A block with **Muted**/**Card** background still looks correct (no regression).

- [ ] **Step 4: Tear down (preserve data)**

```bash
docker compose down   # NOT -v (keep the seeded dev DB)
```

- [ ] **Step 5: Report**

Confirm `TSC_CLEAN` and each visual check passed; report any deviation with a screenshot/observation before claiming done.

---

## Self-Review

**Spec coverage:**
- Fix 1 (brand/accent bg buttons+text) → Task 1. ✓
- Fix 2 (banner/flex alignment) → Task 2. ✓
- Fix 3 (H1 level: headingClasses + registry ×2 + image-text verify) → Task 3. ✓
- Frontend-only / token-only / JIT-literal constraints → Global Constraints + each task uses full token-class literals. ✓
- Verification (tsc + visual, light/dark, no regression) → Task 4. ✓

**Placeholder scan:** No TBD/TODO; every code step shows the exact literal to write. Task 3 Step 3 is a concrete grep with a stated expected result + the exact fallback edit.

**Consistency:** Token names (`primary`/`primary-foreground`, `accent`/`accent-foreground`), the `[data-slot=button]` selector, the `headingLevel` values (`h1`/`h2`/`h3`/`h4`), and `headingClasses` are consistent across tasks and match the spec.
