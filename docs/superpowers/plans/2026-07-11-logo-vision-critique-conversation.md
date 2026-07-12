# Logo Vision Self-Critique + Staged "Design with AI" Conversation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI logo calls critique their own rendered output before the coach sees them; the batch Brand Pack becomes a staged 1-on-1 chat (icon → name line → tagline); marks gain gradient fills (recipe v3); the tenant navbar gets an editable logo size and hides the duplicate brand-name text when a logo exists.

**Architecture:** The browser renders AI drafts with the production `LogoRenderer` and posts PNGs back; the server pairs them with its Redis-cached draft and runs a vision critique pass (Pass B). Conversation state lives client-side in the existing localStorage studio session; the server stays stateless. Recipe v3 widens mark colors from `string` to `string | Fill` (reusing the badge's `Fill` type).

**Tech Stack:** Django 5.1 + DRF + pydantic structured output (`apps.core.ai`), Anthropic SDK vision, Next.js 14 + vitest, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-07-11-logo-vision-critique-conversation-design.md`

## Global Constraints

- ⚠️ **The working tree has unrelated uncommitted changes** (blog AI work: `apps/blog/*`, `apps/core/ai.py`, `apps/core/tests/test_ai.py`, `test_help_bot.py`, `settings/base.py`). Execute this plan in a git worktree (superpowers:using-git-worktrees), or have the human commit/stash first. **Never `git add -A` / `git add .`** — stage only the files each task names.
- Backend tests run inside the dev container: `make dev` must be up; run targeted tests with `docker compose exec -T django pytest <path> -v`.
- Frontend tests: `cd frontend-customer && npx vitest run <path>`.
- Pre-commit must pass with zero issues (`make lint`); `make format` before committing.
- Never commit unless the task's commit step says so; never push.
- The injection trust boundary is untouched: every AI mark still flows `compile_elements` → `_validate_pack_mark` → `validate_recipe` (`_PATH_D_RE` whitelist, `MARK_CUSTOM_MAX_PATHS=8`, `MAX_D_LEN=2000`).
- Copy rules (exact strings): chat button label **"Design with AI"**; stage names **Icon / Name / Tagline**; quota message **"You've used this month's AI design turns. More next month."**
- New settings: `LOGO_AI_MONTHLY_TURN_LIMIT` default **40**. `LOGO_AI_MONTHLY_PACK_LIMIT` and the `logo_brand_pack` endpoint retire.
- Navbar: `logo_size` ∈ `sm|md|lg|xl` → 24/32/40/48 px, default `md`; `pill` renders `xl` as `lg`. `show_brand_name` default `false`; name shows when **no logo OR toggle on**.
- Draft cache: Redis via Django cache, key `logo_draft:{token}`, TTL 600 s. Image uploads: ≤3 PNGs, ≤700 000 chars base64 each, magic-byte-checked.
- Pass B failure or `cli` provider (no vision) must never lose the draft: server returns/marks the draft as final; client falls back to draft designs it already holds.

---

### Task 1: Navbar config backend — `logo_size` + `show_brand_name`

**Files:**
- Modify: `backend/apps/tenant_config/serializers.py` (inside `validate_navbar_config`, after the `transparent_over_hero` line)
- Test: `backend/apps/tenant_config/tests/test_navbar_config.py`

**Interfaces:**
- Produces: `navbar_config` JSON gains `logo_size: "sm"|"md"|"lg"|"xl"` (default `"md"`) and `show_brand_name: bool` (default `False`), shaped exactly like `layout`/`show_login` are today. Frontend Task 2 relies on those names and defaults.

- [ ] **Step 1: Write the failing tests** — append to `test_navbar_config.py`, following the file's existing serializer-call pattern (open the file first and reuse its helper/fixture for running `validate_navbar_config`; the assertions below are the contract):

```python
class TestNavbarLogoControls:
    def test_logo_size_defaults_to_md(self):
        cleaned = _validate({"links": []})
        assert cleaned["logo_size"] == "md"

    def test_logo_size_accepts_presets(self):
        for size in ("sm", "md", "lg", "xl"):
            assert _validate({"logo_size": size})["logo_size"] == size

    def test_logo_size_rejects_unknown(self):
        with pytest.raises(serializers.ValidationError):
            _validate({"logo_size": "huge"})

    def test_show_brand_name_defaults_false_and_coerces(self):
        assert _validate({})["show_brand_name"] is False
        assert _validate({"show_brand_name": 1})["show_brand_name"] is True
```

(`_validate` = whatever thin wrapper the existing tests in this file use to call `TenantConfigSerializer().validate_navbar_config`; add one at module top if the file inlines it.)

- [ ] **Step 2: Run to verify they fail**

Run: `docker compose exec -T django pytest apps/tenant_config/tests/test_navbar_config.py -v -k LogoControls`
Expected: FAIL — `KeyError: 'logo_size'`.

- [ ] **Step 3: Implement** — in `validate_navbar_config`, after `cleaned["transparent_over_hero"] = ...`:

```python
        logo_size = cleaned.get("logo_size") or "md"
        if logo_size not in {"sm", "md", "lg", "xl"}:
            raise serializers.ValidationError("logo_size must be one of: lg, md, sm, xl.")
        cleaned["logo_size"] = logo_size
        cleaned["show_brand_name"] = bool(cleaned.get("show_brand_name", False))
```

- [ ] **Step 4: Run tests to verify pass** — same command; also run the whole file: `docker compose exec -T django pytest apps/tenant_config/tests/test_navbar_config.py -v`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/serializers.py backend/apps/tenant_config/tests/test_navbar_config.py
git commit -m "feat(navbar): validate logo_size preset and show_brand_name flag"
```

---

### Task 2: Navbar frontend — size classes + brand-name visibility

**Files:**
- Create: `frontend-customer/src/lib/navbar.ts`
- Test: `frontend-customer/src/lib/__tests__/navbar.test.ts`
- Modify: `frontend-customer/src/types/tenant.ts` (NavbarConfig, ~line 13)
- Modify: `frontend-customer/src/components/shared/public-header.tsx` (`Brand`, ~line 34)

**Interfaces:**
- Produces: `logoSizeClass(size: NavbarLogoSize | undefined, layout: string): string` → Tailwind height class; `showBrandName(config: { logo_url?: string | null; navbar_config?: { show_brand_name?: boolean } } | null): boolean`. Task 3's UI and Task 16's e2e rely on these behaviors.

- [ ] **Step 1: Add types** — in `types/tenant.ts`:

```ts
export type NavbarLogoSize = "sm" | "md" | "lg" | "xl";
```

and inside `NavbarConfig`:

```ts
  /** Navbar logo height preset: 24/32/40/48px. Missing renders as "md". */
  logo_size?: NavbarLogoSize;
  /** Show the brand-name text even when a logo image exists (default false —
   * saved studio logos already contain the wordmark). */
  show_brand_name?: boolean;
```

- [ ] **Step 2: Write the failing tests** — `src/lib/__tests__/navbar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { logoSizeClass, showBrandName } from "@/lib/navbar";

describe("logoSizeClass", () => {
  it("maps presets to heights and defaults to md", () => {
    expect(logoSizeClass("sm", "classic")).toBe("h-6");
    expect(logoSizeClass("md", "classic")).toBe("h-8");
    expect(logoSizeClass("lg", "classic")).toBe("h-10");
    expect(logoSizeClass("xl", "classic")).toBe("h-12");
    expect(logoSizeClass(undefined, "classic")).toBe("h-8");
  });
  it("caps xl at lg inside the pill layout", () => {
    expect(logoSizeClass("xl", "pill")).toBe("h-10");
    expect(logoSizeClass("lg", "pill")).toBe("h-10");
  });
});

describe("showBrandName", () => {
  it("shows the name when there is no logo", () => {
    expect(showBrandName({ logo_url: "", navbar_config: undefined })).toBe(true);
    expect(showBrandName(null)).toBe(true);
  });
  it("hides the name when a logo exists", () => {
    expect(showBrandName({ logo_url: "https://x/logo.png" })).toBe(false);
  });
  it("shows it again when the toggle is on", () => {
    expect(
      showBrandName({
        logo_url: "https://x/logo.png",
        navbar_config: { show_brand_name: true },
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify fail** — `cd frontend-customer && npx vitest run src/lib/__tests__/navbar.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement** — `src/lib/navbar.ts`:

```ts
// Pure navbar presentation rules, split out of public-header.tsx so they
// are unit-testable (the header itself has no component-test harness).
import type { NavbarLogoSize } from "@/types/tenant";

const SIZE_CLASS: Record<NavbarLogoSize, string> = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
  xl: "h-12",
};

/** Navbar logo height class. The pill capsule is only 56px tall, so xl
 * renders as lg there. Unknown/missing sizes render as md (today's 32px). */
export function logoSizeClass(
  size: NavbarLogoSize | undefined,
  layout: string,
): string {
  const effective: NavbarLogoSize =
    size && size in SIZE_CLASS ? size : "md";
  if (layout === "pill" && effective === "xl") return SIZE_CLASS.lg;
  return SIZE_CLASS[effective];
}

/** Brand-name text shows when there is no logo image, or when the coach
 * explicitly re-enabled it — saved studio logos already contain the
 * wordmark, so rendering the name next to them duplicated it. */
export function showBrandName(
  config: {
    logo_url?: string | null;
    navbar_config?: { show_brand_name?: boolean };
  } | null,
): boolean {
  if (!config?.logo_url) return true;
  return config.navbar_config?.show_brand_name === true;
}
```

- [ ] **Step 5: Run tests to verify pass** — same command. Expected: PASS.

- [ ] **Step 6: Wire the header** — replace `Brand` in `public-header.tsx`:

```tsx
function Brand({ config }: { config: TenantConfig | null }) {
  const layout = config?.navbar_config?.layout ?? "classic";
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-bold">
      {config?.logo_url ? (
        <img
          src={config.logo_url}
          alt={config.brand_name}
          className={`${logoSizeClass(config.navbar_config?.logo_size, layout)} w-auto`}
        />
      ) : (
        <BookOpen className="h-5 w-5 text-primary" />
      )}
      {showBrandName(config) && (
        <span className="font-display">{config?.brand_name || "Welcome"}</span>
      )}
    </Link>
  );
}
```

with `import { logoSizeClass, showBrandName } from "@/lib/navbar";` added to the imports.

- [ ] **Step 7: Verify in the running app** — `make dev`, open a seeded tenant with a saved logo: name text is gone, logo renders 32px. Tenant without a logo: BookOpen icon + name still show.

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/lib/navbar.ts frontend-customer/src/lib/__tests__/navbar.test.ts frontend-customer/src/types/tenant.ts frontend-customer/src/components/shared/public-header.tsx
git commit -m "feat(navbar): logo size presets + hide duplicate brand name when a logo exists"
```

---

### Task 3: Navbar admin UI — size picker + show-name switch

**Files:**
- Modify: `frontend-customer/src/components/owner/navbar-tab.tsx`

**Interfaces:**
- Consumes: `NavbarConfig.logo_size` / `.show_brand_name` (Task 2 types), Task 1 backend validation. Uses this file's existing patch/save flow for other fields (read the file; every control mutates a local `navbar` object and persists through the same handler — reuse it verbatim).

- [ ] **Step 1: Add the controls** — below the existing layout picker section, following the file's `Label`/`Switch` idioms:

```tsx
{/* Logo size — only meaningful once a logo exists, but harmless before. */}
<div className="space-y-1.5">
  <Label>Logo size</Label>
  <div className="flex gap-1.5">
    {(["sm", "md", "lg", "xl"] as const).map((size) => (
      <button
        key={size}
        type="button"
        aria-pressed={(navbar.logo_size ?? "md") === size}
        onClick={() => update({ logo_size: size })}
        className={cn(
          "rounded-md border px-3 py-1.5 text-sm uppercase",
          (navbar.logo_size ?? "md") === size
            ? "border-primary bg-primary/10 text-primary"
            : "text-muted-foreground hover:border-foreground",
        )}
      >
        {size}
      </button>
    ))}
  </div>
</div>

{config.logo_url && (
  <div className="flex items-center justify-between">
    <Label htmlFor="show-brand-name">Show brand name next to logo</Label>
    <Switch
      id="show-brand-name"
      checked={navbar.show_brand_name === true}
      onCheckedChange={(v) => update({ show_brand_name: v })}
    />
  </div>
)}
```

(`update` = this file's existing navbar-patch helper; match its real name when editing.)

- [ ] **Step 2: Verify in the running app** — in `/admin` → Navbar tab: click XL, confirm the live site logo grows to 48px; toggle the switch, confirm the name reappears. Confirm a PATCH lands on `/api/v1/admin/config/` with both fields.

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/owner/navbar-tab.tsx
git commit -m "feat(navbar): admin controls for logo size and brand-name visibility"
```

---

### Task 4: Recipe v3 backend — mark colors accept `Fill`

**Files:**
- Modify: `backend/apps/tenant_config/logo_recipe.py`
- Test: `backend/apps/tenant_config/tests/test_logo_recipe.py`

**Interfaces:**
- Consumes: the existing `_fill(value, default_color)` (already shapes `{type: solid|linear|radial, ...}` for the badge) and `_hex`.
- Produces: `validate_recipe` returns `version: 3`; `colors.mark`, `colors.mark2`, `colors.mark_accent` each pass through as either a hex string or a shaped Fill dict. New helper `_fill_or_hex(value, default_color)`. Frontend Task 5 mirrors this contract.

- [ ] **Step 1: Write the failing tests** — append to `test_logo_recipe.py` (reuse the file's canonical valid-recipe fixture; call it `_valid()` here):

```python
class TestMarkFillV3:
    def test_output_is_version_3(self):
        assert validate_recipe(_valid())["version"] == 3

    def test_string_mark_color_passes_through(self):
        shaped = validate_recipe(_valid())
        assert shaped["colors"]["mark"] == _valid()["colors"]["mark"]

    def test_linear_fill_mark_color_is_shaped(self):
        recipe = _valid()
        recipe["colors"]["mark"] = {"type": "linear", "from": "#112233", "to": "#445566", "angle": 45}
        shaped = validate_recipe(recipe)
        assert shaped["colors"]["mark"] == {"type": "linear", "from": "#112233", "to": "#445566", "angle": 45}

    def test_malformed_fill_falls_back_to_default_hex(self):
        recipe = _valid()
        recipe["colors"]["mark"] = {"type": "conic", "junk": True}
        shaped = validate_recipe(recipe)
        assert shaped["colors"]["mark"] == "#ffffff"

    def test_gradient_angle_clamped(self):
        recipe = _valid()
        recipe["colors"]["mark"] = {"type": "linear", "from": "#112233", "to": "#445566", "angle": 9999}
        assert validate_recipe(recipe)["colors"]["mark"]["angle"] == 360
```

- [ ] **Step 2: Run to verify fail** — `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_recipe.py -v -k MarkFillV3`. Expected: FAIL (`version == 2`, fill dict rejected to hex).

- [ ] **Step 3: Implement** — in `logo_recipe.py`:

Add next to `_fill`:

```python
def _fill_or_hex(value, default_hex):
    """Mark colors (recipe v3): plain hex string, or a Fill dict shaped by
    the same rules as the badge fill. Anything malformed falls back to the
    default hex — never rejected."""
    if isinstance(value, dict):
        if value.get("type") in ("linear", "radial", "solid"):
            shaped = _fill(value, default_hex)
            if shaped["type"] == "linear":
                shaped["angle"] = max(0, min(360, float(value.get("angle", 90) or 0)))
            return shaped["color"] if shaped["type"] == "solid" else shaped
        return default_hex
    return _hex(value, default_hex)
```

Then in the colors-shaping block (~line 227), replace the three mark lines:

```python
    mark_fill = _fill_or_hex(raw_colors.get("mark"), "#ffffff")
    colors = {
        ...
        "mark": mark_fill,
        ...
    }
    if raw_colors.get("mark2") is not None:
        colors["mark2"] = _fill_or_hex(raw_colors.get("mark2"), "#ffffff")
    if raw_colors.get("mark_accent") is not None:
        colors["mark_accent"] = _fill_or_hex(raw_colors.get("mark_accent"), "#ffffff")
```

(keep the surrounding `badge`/`text`/`tagline` lines exactly as they are — text colors stay hex-only), and change the shaped output's `"version": 2` to `"version": 3`. Accept incoming `version` 2 **or** 3 wherever the function gates on version (v2→v3 is only this widening — no other field moves).

Check `_DUMMY_RECIPE` in `logo_ai.py` still validates (it's v2 in, v3 out — fine).

- [ ] **Step 4: Run the whole file** — `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_recipe.py apps/tenant_config/tests/test_logo_ai.py -v`. Fix any fixture asserting `version == 2` on *output* (inputs stay v2 — that's the point of the compat test). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/logo_recipe.py backend/apps/tenant_config/tests/test_logo_recipe.py
git commit -m "feat(logo): recipe v3 — mark colors accept Fill (solid/linear/radial)"
```

---

### Task 5: Recipe v3 frontend — types + migrate

**Files:**
- Modify: `frontend-customer/src/types/logo.ts`
- Modify: `frontend-customer/src/lib/logo/migrate.ts`
- Modify: `frontend-customer/src/lib/logo/catalog.ts` (`defaultRecipe` emits `version: 3`)
- Test: `frontend-customer/src/lib/logo/__tests__/migrate.test.ts`

**Interfaces:**
- Produces: `type MarkFill = string | Fill`; `LogoRecipe.version: 3`; `LogoRecipe.colors.mark/mark2/mark_accent: MarkFill`; `isRecipe` accepts v1/v2/v3; `migrateRecipe` upgrades both. Every downstream file type-checks against this.

- [ ] **Step 1: Write the failing tests** — add to `migrate.test.ts`:

```ts
it("accepts and upgrades a v2 recipe to v3 unchanged apart from version", () => {
  const v2 = { ...FIXTURE_V2 }; // the file's existing v2 fixture
  expect(isRecipe(v2)).toBe(true);
  const out = migrateRecipe(v2 as AnyLogoRecipe);
  expect(out.version).toBe(3);
  expect(out.colors.mark).toBe(FIXTURE_V2.colors.mark);
});

it("passes a v3 recipe through untouched", () => {
  const v3 = { ...migrateRecipe(FIXTURE_V2 as AnyLogoRecipe) };
  expect(migrateRecipe(v3)).toEqual(v3);
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/lib/logo/__tests__/migrate.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`types/logo.ts`: add `export type MarkFill = string | Fill;`, rename the current `LogoRecipe` interface to `LogoRecipeV2` (with `version: 2` and its current string mark colors), and declare the live schema:

```ts
export interface LogoRecipe extends Omit<LogoRecipeV2, "version" | "colors"> {
  version: 3;
  colors: Omit<LogoRecipeV2["colors"], "mark" | "mark2" | "mark_accent"> & {
    mark: MarkFill;
    mark2?: MarkFill;
    mark_accent?: MarkFill;
  };
}
export type AnyLogoRecipe = LogoRecipeV1 | LogoRecipeV2 | LogoRecipe;
```

`migrate.ts`: `isRecipe` accepts `v === 1 || v === 2 || v === 3`; `migrateRecipe` becomes:

```ts
export function migrateRecipe(recipe: AnyLogoRecipe): LogoRecipe {
  if (recipe.version === 3) return recipe;
  if (recipe.version === 2) return { ...recipe, version: 3 };
  // v1 → v2 body stays exactly as-is below, then returns version: 3
  ...
}
```

(the existing v1 branch's returned literal changes `version: 2` → `version: 3`).

`catalog.ts` `defaultRecipe`: `version: 3`. Fix any resulting type errors surfaced by `npx tsc --noEmit` (the `KEEP IN SYNC` comment in migrate.ts already points at `logo_recipe.py` — Task 4 is the Python half).

- [ ] **Step 4: Run tests + typecheck** — `npx vitest run src/lib/logo` and `npx tsc --noEmit`. Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/types/logo.ts frontend-customer/src/lib/logo/migrate.ts frontend-customer/src/lib/logo/catalog.ts frontend-customer/src/lib/logo/__tests__/migrate.test.ts
git commit -m "feat(logo): recipe v3 types + migrate — MarkFill = string | Fill"
```

---

### Task 6: Renderer + dark variant paint gradient marks

**Files:**
- Modify: `frontend-customer/src/components/logo/logo-renderer.tsx`
- Modify: `frontend-customer/src/lib/logo/brand-kit.ts` (`darkVariant`)
- Test: `frontend-customer/src/lib/logo/__tests__/brand-kit.test.ts`

**Interfaces:**
- Produces: exported pure helpers in `logo-renderer.tsx`: `asFill(v: MarkFill): Fill` and `solidOf(v: MarkFill): string` (gradient → its `from` stop). `darkVariant` lightens every stop of Fill-valued mark colors. Task 13's compose tests reuse `solidOf`.

- [ ] **Step 1: Write the failing tests** — add to `brand-kit.test.ts`:

```ts
it("darkVariant lightens both stops of a gradient mark color", () => {
  const recipe = {
    ...baseRecipe(), // the file's existing recipe factory
    colors: {
      ...baseRecipe().colors,
      mark2: { type: "linear", from: "#111827", to: "#1f2937", angle: 90 } as const,
    },
  };
  const dark = darkVariant(recipe);
  const mark2 = dark.colors.mark2 as Extract<Fill, { type: "linear" }>;
  expect(mark2.type).toBe("linear");
  expect(mark2.from).not.toBe("#111827"); // lightened
  expect(mark2.to).not.toBe("#1f2937");
  expect(mark2.angle).toBe(90);
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/lib/logo/__tests__/brand-kit.test.ts`. Expected: FAIL (type error / unchanged stops).

- [ ] **Step 3: Implement**

`logo-renderer.tsx` — add near `useFillPaint`:

```ts
/** Recipe v3 mark colors: plain hex or a Fill. Normalize for painting. */
export function asFill(v: MarkFill): Fill {
  return typeof v === "string" ? { type: "solid", color: v } : v;
}
/** Solid stand-in (gradient -> its `from` stop) for places that need a
 * plain color: emblem name text, color-input values, favicon-ish contexts. */
export function solidOf(v: MarkFill): string {
  if (typeof v === "string") return v;
  return v.type === "solid" ? v.color : v.from;
}
```

Then paint marks through fills in `ComposedMark`:

```ts
  const markFill = useFillPaint(asFill(recipe.colors.mark), "mark");
  const mark2Fill = useFillPaint(asFill(recipe.colors.mark2 ?? recipe.colors.mark), "mark2");
  const markAccentFill = useFillPaint(asFill(recipe.colors.mark_accent ?? recipe.colors.mark), "markacc");
```

- the `fg` computation (~line 360) becomes `hasBadge && !recipe.badge.outline ? markFill.paint : badgeSolid` and the returned `<g>` emits `{markFill.defs}{mark2Fill.defs}{markAccentFill.defs}` inside the existing `<defs>` block;
- the custom-path `roleColor` (~line 188) resolves `mark2 → mark2Fill.paint`, `accent → markAccentFill.paint`, default → the `color` prop (already the paint string);
- the emblem `nameColor` (~line 544) becomes `solidOf(colors.mark)` — **text never gets a gradient**;
- anywhere else that reads `recipe.colors.mark`/`mark2`/`mark_accent` as a plain string (search the file) goes through `solidOf`.

Note `useFillPaint` is a hook: the three calls above are unconditional at the top of `ComposedMark`, order-stable.

`brand-kit.ts` — add and use:

```ts
const lightenFill = (v: MarkFill, fallback: string): MarkFill => {
  if (typeof v === "string") return lighten(v, fallback);
  if (v.type === "solid") return { ...v, color: lighten(v.color, fallback) };
  return { ...v, from: lighten(v.from, fallback), to: lighten(v.to, fallback) };
};
```

and in `darkVariant`'s colors spread, route `mark2`/`mark_accent` (and the top-level `mark` if the function starts touching it — it currently doesn't; leave `mark` alone) through `lightenFill(...)` instead of `lighten(...)`.

Also sweep `studio-panel.tsx`, `studio-canvas.tsx`, `export.ts`, `brand-kit.ts` for `colors.mark` string-typed reads (`npx tsc --noEmit` finds them all) and wrap with `solidOf` — behavior identical for solid recipes.

- [ ] **Step 4: Run tests + typecheck** — `npx vitest run src/lib/logo && npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Visual check** — in the running studio, temporarily set a wall recipe's `colors.mark2` to a linear fill via the editor's dev tools or a scratch edit, confirm the gradient renders and dark preview lightens it. Revert scratch edits.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/logo/logo-renderer.tsx frontend-customer/src/lib/logo/brand-kit.ts frontend-customer/src/lib/logo/__tests__/brand-kit.test.ts frontend-customer/src/components/logo/studio-panel.tsx frontend-customer/src/components/logo/studio-canvas.tsx frontend-customer/src/lib/logo/export.ts
git commit -m "feat(logo): render gradient mark fills; dark variant lightens both stops"
```

---

### Task 7: Editor gradient control for the mark color

**Files:**
- Modify: `frontend-customer/src/components/logo/studio-panel.tsx` (the "Mark color" block, ~line 565)

**Interfaces:**
- Consumes: `asFill`/`solidOf` from `logo-renderer.tsx` (Task 6), `patch` prop.

- [ ] **Step 1: Implement** — replace the single mark color input with a solid/gradient toggle (mirroring how the badge section of this same file handles its Fill — read it and reuse its structure):

```tsx
{(() => {
  const markFill = asFill(recipe.colors.mark);
  const isGradient = markFill.type === "linear";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Mark color</p>
        <button
          type="button"
          aria-pressed={isGradient}
          onClick={() =>
            onPatch({
              colors: {
                ...recipe.colors,
                mark: isGradient
                  ? solidOf(recipe.colors.mark)
                  : { type: "linear", from: solidOf(recipe.colors.mark), to: "#111827", angle: 90 },
              },
            })
          }
          className="text-xs text-muted-foreground hover:underline"
        >
          {isGradient ? "Solid" : "Gradient"}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Mark color"
          value={isGradient ? markFill.from : solidOf(recipe.colors.mark)}
          onChange={(e) =>
            onPatch(
              {
                colors: {
                  ...recipe.colors,
                  mark: isGradient ? { ...markFill, from: e.target.value } : e.target.value,
                },
              },
              "mark-color",
            )
          }
        />
        {isGradient && (
          <>
            <input
              type="color"
              aria-label="Mark gradient end color"
              value={markFill.to}
              onChange={(e) =>
                onPatch(
                  { colors: { ...recipe.colors, mark: { ...markFill, to: e.target.value } } },
                  "mark-color",
                )
              }
            />
            <input
              type="number"
              aria-label="Gradient angle"
              min={0}
              max={360}
              value={markFill.angle}
              onChange={(e) =>
                onPatch(
                  {
                    colors: {
                      ...recipe.colors,
                      mark: { ...markFill, angle: Math.max(0, Math.min(360, Number(e.target.value) || 0)) },
                    },
                  },
                  "mark-color",
                )
              }
              className="w-16 rounded-md border bg-background px-2 py-1 text-sm"
            />
          </>
        )}
      </div>
    </div>
  );
})()}
```

- [ ] **Step 2: Verify in the running studio** — toggle Gradient on a custom-mark recipe: mark repaints live; save; reload; gradient persists (backend Task 4 accepts it). Undo/redo works (`onPatch` coalesce key `"mark-color"`).

- [ ] **Step 3: Commit**

```bash
git add frontend-customer/src/components/logo/studio-panel.tsx
git commit -m "feat(logo): editor gradient toggle for the mark color"
```

---

### Task 8: `core_ai` — vision-capable structured call

**Files:**
- Modify: `backend/apps/core/ai.py`
- Test: `backend/apps/core/tests/test_ai.py`

**Interfaces:**
- Produces: `supports_vision() -> bool` (False on the `cli` provider) and
  `structured_messages(*, system, messages, output_model, model, max_tokens) -> (parsed, cost_usd, model)` where `messages` is a Messages-API list whose content blocks may include base64 image blocks. Raises `AiError` on `cli`. Tasks 10/12 consume both.

- [ ] **Step 1: Write the failing tests** — append to `test_ai.py` (match the file's existing monkeypatch style for the Anthropic client):

```python
class TestStructuredMessages:
    def test_cli_provider_reports_no_vision(self, settings):
        settings.AI_PROVIDER = "cli"
        assert core_ai.supports_vision() is False

    def test_anthropic_provider_reports_vision(self, settings):
        settings.AI_PROVIDER = "anthropic"
        assert core_ai.supports_vision() is True

    def test_cli_provider_raises(self, settings):
        settings.AI_PROVIDER = "cli"
        with pytest.raises(core_ai.AiError):
            core_ai.structured_messages(
                system="s", messages=[], output_model=_Echo, model="m", max_tokens=10,
            )

    def test_anthropic_passes_messages_through(self, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"
        captured = {}

        class FakeResponse:
            parsed_output = _Echo(text="ok")
            usage = None

        class FakeMessages:
            def parse(self, **kwargs):
                captured.update(kwargs)
                return FakeResponse()

        class FakeClient:
            messages = FakeMessages()

        monkeypatch.setattr(core_ai, "_anthropic_client", lambda: FakeClient())
        msgs = [{"role": "user", "content": [{"type": "text", "text": "hi"}]}]
        parsed, cost, model = core_ai.structured_messages(
            system="s", messages=msgs, output_model=_Echo, model="claude-sonnet-5", max_tokens=10,
        )
        assert parsed.text == "ok"
        assert captured["messages"] is msgs
```

with a module-level `class _Echo(BaseModel): text: str`.

- [ ] **Step 2: Run to verify fail** — `docker compose exec -T django pytest apps/core/tests/test_ai.py -v -k StructuredMessages`. Expected: FAIL (`AttributeError`).

- [ ] **Step 3: Implement** — in `ai.py` under the structured-output section:

```python
def supports_vision():
    """Whether the active provider can take image inputs. The cli provider
    (claude -p) has no reliable image path — callers skip the critique pass."""
    return settings.AI_PROVIDER != "cli"


def structured_messages(*, system, messages, output_model, model, max_tokens):
    """Structured output over a full messages array (content blocks may
    include base64 images) -> (validated instance, cost_usd, model).
    Anthropic provider only; raises AiError on the cli provider."""
    if settings.AI_PROVIDER == "cli":
        raise AiError("cli provider does not support vision calls")
    client = _anthropic_client()
    try:
        response = client.messages.parse(
            model=model,
            max_tokens=max_tokens,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            messages=messages,
            output_format=output_model,
        )
    except Exception as exc:
        raise AiError(f"anthropic call failed: {exc}") from exc
    return response.parsed_output, estimate_cost(response.usage, model), model
```

- [ ] **Step 4: Run to verify pass** — same command plus the whole file. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/ai.py backend/apps/core/tests/test_ai.py
git commit -m "feat(ai): supports_vision + structured_messages for image-bearing structured calls"
```

---

### Task 9: AI contract — `mark_scale` + `mark_gradient` on designs

**Files:**
- Modify: `backend/apps/tenant_config/logo_ai.py`
- Test: `backend/apps/tenant_config/tests/test_logo_ai.py`

**Interfaces:**
- Produces: `class _MarkGradient(BaseModel): to: Literal["primary","secondary","accent","ink"]; angle: float = 90`; `_Design` and `_RefinedDesign` gain `mark_scale: float = 1.0` and `mark_gradient: _MarkGradient | None = None`; `_validate_lockup` clamps and emits both (`mark_scale` clamped 0.6–1.8, `angle` 0–360, `mark_gradient` as dict or None). Tasks 10 and 13 rely on the emitted key names `mark_scale` / `mark_gradient`.

- [ ] **Step 1: Write the failing tests** — append to `test_logo_ai.py` (reuse its `_design()`/pack factory helpers):

```python
class TestLockupProportionAndGradient:
    def test_defaults_pass_through(self):
        shaped = logo_ai._validate_lockup(_design())
        assert shaped["mark_scale"] == 1.0
        assert shaped["mark_gradient"] is None

    def test_mark_scale_clamped(self):
        shaped = logo_ai._validate_lockup(_design(mark_scale=9.0))
        assert shaped["mark_scale"] == 1.8
        shaped = logo_ai._validate_lockup(_design(mark_scale=0.1))
        assert shaped["mark_scale"] == 0.6

    def test_mark_gradient_shaped_and_angle_clamped(self):
        shaped = logo_ai._validate_lockup(
            _design(mark_gradient={"to": "accent", "angle": 999})
        )
        assert shaped["mark_gradient"] == {"to": "accent", "angle": 360.0}

    def test_gradient_to_white_rejected_by_schema(self):
        with pytest.raises(ValidationError):
            _design(mark_gradient={"to": "white", "angle": 90})
```

(`_design(**overrides)` builds a validated `_Design` pydantic instance — if the file lacks such a factory, add one from its existing fixture dict.)

- [ ] **Step 2: Run to verify fail** — `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_ai.py -v -k ProportionAndGradient`. Expected: FAIL.

- [ ] **Step 3: Implement** — in `logo_ai.py`:

```python
class _MarkGradient(BaseModel):
    to: Literal["primary", "secondary", "accent", "ink"]
    angle: float = 90
```

Add to **both** `_Design` and `_RefinedDesign`:

```python
    mark_scale: float = 1.0
    mark_gradient: _MarkGradient | None = None
```

Extend `_validate_lockup`'s returned dict:

```python
        "mark_scale": max(0.6, min(1.8, float(item.mark_scale or 1.0))),
        "mark_gradient": (
            {"to": item.mark_gradient.to, "angle": max(0.0, min(360.0, float(item.mark_gradient.angle or 0)))}
            if item.mark_gradient
            else None
        ),
```

- [ ] **Step 4: Run to verify pass** — whole file + `test_logo_ai_elements_roundtrip.py`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/logo_ai.py backend/apps/tenant_config/tests/test_logo_ai.py
git commit -m "feat(logo): designs carry mark_scale proportion + role-based mark_gradient"
```

---

### Task 10: `logo_converse.py` — stage prompts, turn + critique calls

**Files:**
- Create: `backend/apps/tenant_config/logo_converse.py`
- Test: `backend/apps/tenant_config/tests/test_logo_converse.py`

**Interfaces:**
- Consumes: from `logo_ai`: `_ELEMENT_VOCABULARY_AND_PRINCIPLES`, `_FONT_CATALOG`, `_Element`, `_Palette`, `_Typography`, `_ColorRoles`, `_MarkGradient`, `_ROLE`, `_LAYOUTS_LITERAL`, `_BADGES_LITERAL`, `_validate_pack_mark`, `_validate_pack_palette`, `_validate_lockup`; from `core_ai`: `structured`, `structured_messages`, `supports_vision`, `AiError`.
- Produces (Task 11 consumes):
  - `STAGES = ("icon", "name", "tagline")`
  - `converse_turn(stage, brief, transcript, pinned, message) -> TurnResult` where `TurnResult` has `.message: str`, `.designs: list[dict]`, `.cost_usd`
  - `critique_turn(stage, draft, images) -> TurnResult` (`draft` = the cached dict `{"stage", "message", "designs"}`, `images` = list of raw base64 PNG strings)
  - `ConverseError(Exception)` carrying `.cost_usd`
  - Validated icon-design dicts: `{concept, rationale, paths, elements, palette, color_roles}`; name/tagline-design dicts additionally: `{layout, badge_shape, badge_outline, font, typography, palette_index? NO — palette embedded, color_roles, mark_scale, mark_gradient, tagline}`.

- [ ] **Step 1: Write the failing tests** — `test_logo_converse.py`:

```python
"""Staged Design-with-AI conversation: stage prompt selection, turn/critique
validation. core_ai is always mocked — no network access."""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from apps.core import ai as core_ai
from apps.tenant_config import logo_converse

_ICON_TURN = {
    "message": "Here are three directions.",
    "designs": [
        {
            "concept": "A rising line.",
            "rationale": "Your practice, carried through.",
            "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 30}],
            "palette": {"name": "Calm", "primary": "#0f766e", "secondary": "#14b8a6", "accent": "#f59e0b", "ink": "#111827"},
            "color_roles": {"mark": "primary", "mark2": "secondary", "mark_accent": "accent"},
        }
    ],
}

_NAME_TURN = {
    "message": "Two lockups.",
    "designs": [
        {
            **_ICON_TURN["designs"][0],
            "layout": "horizontal",
            "badge_shape": "none",
            "badge_outline": False,
            "font": "Manrope",
            "typography": {"case": "none", "tracking": 0, "weight": 700},
            "color_roles": {
                "badge": "primary", "mark": "ink", "mark2": "secondary",
                "mark_accent": "accent", "text": "ink", "tagline": "secondary",
            },
            "mark_scale": 1.2,
            "mark_gradient": {"to": "accent", "angle": 45},
            "tagline": "",
        }
    ],
}


def _mock_structured(monkeypatch, payload, cost=Decimal("0.02")):
    def fake(*, system, user, output_model, model, max_tokens):
        return output_model.model_validate(payload), cost, model
    monkeypatch.setattr(logo_converse.core_ai, "structured", fake)
    return fake


class TestConverseTurn:
    def test_icon_turn_validates_marks_and_palette(self, monkeypatch, settings):
        settings.LOGO_AI_MODEL = "claude-sonnet-5"
        _mock_structured(monkeypatch, _ICON_TURN)
        result = logo_converse.converse_turn("icon", {"brand_name": "Flow", "niche": "yoga"}, [], {}, "hi")
        assert result.message == "Here are three directions."
        (design,) = result.designs
        assert design["paths"]  # compiled through the trust boundary
        assert design["palette"]["primary"] == "#0f766e"

    def test_name_turn_carries_full_lockup(self, monkeypatch, settings):
        settings.LOGO_AI_MODEL = "claude-sonnet-5"
        _mock_structured(monkeypatch, _NAME_TURN)
        result = logo_converse.converse_turn("name", {"brand_name": "Flow"}, [], {"mark_elements": []}, "go")
        (design,) = result.designs
        assert design["mark_scale"] == 1.2
        assert design["mark_gradient"] == {"to": "accent", "angle": 45.0}

    def test_unknown_stage_rejected(self):
        with pytest.raises(ValueError):
            logo_converse.converse_turn("logo", {}, [], {}, "x")

    def test_all_invalid_marks_raise(self, monkeypatch, settings):
        settings.LOGO_AI_MODEL = "claude-sonnet-5"
        bad = {**_ICON_TURN, "designs": [{**_ICON_TURN["designs"][0], "elements": []}]}
        _mock_structured(monkeypatch, bad)
        with pytest.raises(logo_converse.ConverseError):
            logo_converse.converse_turn("icon", {"brand_name": "Flow"}, [], {}, "hi")


class TestCritiqueTurn:
    def test_critique_returns_corrected_designs(self, monkeypatch, settings):
        settings.LOGO_AI_MODEL = "claude-sonnet-5"

        def fake_messages(*, system, messages, output_model, model, max_tokens):
            # image blocks made it into the user turn
            blocks = messages[0]["content"]
            assert any(b.get("type") == "image" for b in blocks)
            return output_model.model_validate(_ICON_TURN), Decimal("0.01"), model

        monkeypatch.setattr(logo_converse.core_ai, "structured_messages", fake_messages)
        draft = {"stage": "icon", "message": "m", "designs": _ICON_TURN["designs"]}
        result = logo_converse.critique_turn("icon", draft, ["aGVsbG8="])
        assert result.designs
```

- [ ] **Step 2: Run to verify fail** — `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_converse.py -v`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `logo_converse.py` (complete file):

```python
"""Staged Design-with-AI conversation (icon -> name -> tagline). Each turn
is Pass A here (design), then the client renders the draft and Pass B
(critique_turn, vision) reviews the model's own output before the coach
sees it. See docs/superpowers/specs/2026-07-11-logo-vision-critique-conversation-design.md.

Every mark still flows through logo_ai._validate_pack_mark -> validate_recipe
(the injection trust boundary) — nothing reaches the caller unvalidated."""

import json

from django.conf import settings
from pydantic import BaseModel

from apps.core import ai as core_ai

from .logo_ai import (
    _BADGES_LITERAL,
    _ColorRoles,
    _Element,
    _ELEMENT_VOCABULARY_AND_PRINCIPLES,
    _FONT_CATALOG,
    _LAYOUTS_LITERAL,
    _Mark,
    _MarkGradient,
    _Palette,
    _ROLE,
    _Typography,
    _validate_lockup,
    _validate_pack_mark,
    _validate_pack_palette,
)

STAGES = ("icon", "name", "tagline")

_SESSION_FRAME = """You are a senior brand-identity designer in a LIVE
working session with a coach (they sell courses and community under this
brand). You are talking WITH them, not generating a batch: read the
conversation, respond to what they just said in one or two warm plain-words
sentences (`message`), and show 1-3 candidates that act on their feedback.
Never repeat a candidate they already rejected; evolve or replace it. Every
design must look like it came from a serious studio engagement.

"""

ICON_STAGE_PROMPT = (
    _SESSION_FRAME
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
    + """

## This stage: THE ICON ONLY

Design 1-3 mark candidates (no lockup, no fonts). Each candidate:
- `concept` FIRST: one sentence naming a real idea from THIS brand's
  name/niche/vibe and the visual device expressing it. Then draw exactly that.
- Candidates in one turn must not share their primary visual device.
- `palette`: 4 hex roles (primary/secondary/accent/ink) tuned to the brand —
  riff on the theme color; ink must read on white.
- `color_roles`: which palette color paints mark / mark2 / mark_accent.
- `rationale`: one plain-words sentence to the coach on why it fits.
Banned clichés: generic swoosh, sparkle, globe, atom orbits, lightbulb."""
)

NAME_STAGE_PROMPT = (
    _SESSION_FRAME
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
    + """

## This stage: THE NAME LINE (lockup around the pinned mark)

The coach pinned a mark (its elements are in the conversation). Keep its
identity — you may fine-tune geometry only if the coach asks. Design 1-3
complete lockups:
- layout: horizontal | horizontal_reversed | stacked | emblem (needs a
  badge) | name_only.
- badge_shape + badge_outline: a badge is a container; "none" lets the mark
  breathe on the page.
- font: exactly one family from the catalog; typography case/tracking/weight
  designed for the brand's voice. Pairing recipes: Elegant = light serif,
  tracked-out upper (tracking 0.12-0.2, weight 400-500); Bold = heavy
  tight lowercase (weight 700-800, tracking 0); Minimal = medium weight,
  generous tracking (0.05-0.1); Playful = rounded family, title case;
  Script = name only, never uppercase.
- mark_scale (0.6-1.8): the mark/wordmark size relationship — small-mark
  editorial vs big-mark emblem drama. Vary it across candidates.
- mark_gradient: optional, subtle, same hue family (e.g. primary -> ink at
  90-135 degrees). Flat is the default — a gradient must earn its place.
  Never on text.
- color_roles: contrast is non-negotiable — on a dark badge use white or a
  light role for the mark; text always reads on white.
- tagline: leave "" at this stage.

"""
    + _FONT_CATALOG
)

TAGLINE_STAGE_PROMPT = (
    _SESSION_FRAME
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
    + """

## This stage: THE TAGLINE

The lockup is decided (in the conversation). Return 1-3 candidates that are
the SAME design with different `tagline` text (and its color role if needed):
short, concrete, in the coach's voice — never corporate filler. If the coach
supplied their own words, style those (you may tighten them). If nothing
natural fits, one candidate may keep tagline "".

"""
    + _FONT_CATALOG
)

CRITIQUE_PROMPT = (
    """You are the same senior brand-identity designer REVIEWING RENDERS OF
YOUR OWN DESIGNS before the client sees them. The images are exact renders
of the JSON designs you produced, in order. Hold them to: would a $5,000
studio ship this?

Checklist — redraw (not nudge) any design that fails:
1. Collisions / collapsed geometry: overlapping elements that read as a
   mistake, shapes swallowing each other, stray fragments.
2. Balance: is the composition visually centered with intentional weight?
3. Spacing rhythm: at least 6 units of clear space between separate
   elements; margins respected.
4. Contrast on the white card: every element clearly visible.
5. Favicon survivability: no meaningful feature would vanish at 48px.
6. Mark <-> wordmark proportion and typography pairing (when a lockup is
   shown): does the type feel designed for this brand?

Return the same schema you produced before: keep `message` (you may append
one sentence about what you fixed), keep good designs byte-identical, and
fully redraw failing ones.

"""
    + _ELEMENT_VOCABULARY_AND_PRINCIPLES
)


class _MarkRoles(BaseModel):
    mark: _ROLE = "primary"
    mark2: _ROLE = "secondary"
    mark_accent: _ROLE = "accent"


class _IconDesign(BaseModel):
    concept: str
    elements: list[_Element]
    rationale: str
    palette: _Palette
    color_roles: _MarkRoles


class _IconTurn(BaseModel):
    message: str
    designs: list[_IconDesign]


class _ConverseDesign(BaseModel):
    concept: str
    elements: list[_Element]
    rationale: str
    palette: _Palette
    layout: _LAYOUTS_LITERAL
    badge_shape: _BADGES_LITERAL
    badge_outline: bool = False
    font: str
    typography: _Typography
    color_roles: _ColorRoles
    mark_scale: float = 1.0
    mark_gradient: _MarkGradient | None = None
    tagline: str = ""


class _LockupTurn(BaseModel):
    message: str
    designs: list[_ConverseDesign]


_STAGE_PROMPTS = {
    "icon": (ICON_STAGE_PROMPT, _IconTurn),
    "name": (NAME_STAGE_PROMPT, _LockupTurn),
    "tagline": (TAGLINE_STAGE_PROMPT, _LockupTurn),
}


class ConverseError(Exception):
    """The turn completed but left nothing usable (provider failure or all
    marks failed validation). Carries the billed cost for the kill-switch."""

    def __init__(self, message, cost_usd=0.0):
        super().__init__(message)
        self.cost_usd = cost_usd


class TurnResult:
    def __init__(self, message, designs, cost_usd):
        self.message = message
        self.designs = designs
        self.cost_usd = cost_usd


def _validate_icon_design(item):
    mark = _validate_pack_mark(_Mark(rationale=item.rationale, elements=item.elements))
    if not mark:
        return None
    return {
        **mark,
        "concept": str(item.concept or "")[:200],
        "palette": _validate_pack_palette(item.palette),
        "color_roles": item.color_roles.model_dump(),
    }


def _validate_converse_design(item):
    mark = _validate_pack_mark(_Mark(rationale=item.rationale, elements=item.elements))
    if not mark:
        return None
    return {
        **mark,
        "concept": str(item.concept or "")[:200],
        "palette": _validate_pack_palette(item.palette),
        "tagline": str(item.tagline or "")[:120],
        **_validate_lockup(item),
    }


_VALIDATORS = {"icon": _validate_icon_design, "name": _validate_converse_design, "tagline": _validate_converse_design}


def _validate_turn(stage, parsed, cost):
    designs = [d for d in (_VALIDATORS[stage](item) for item in parsed.designs[:3]) if d]
    if not designs:
        raise ConverseError("turn validation left nothing usable", cost_usd=cost)
    return TurnResult(str(parsed.message or "")[:600], designs, cost)


def _user_content(brief, transcript, pinned, message):
    parts = [
        f'Brand name: "{brief.get("brand_name") or "My Brand"}"\n'
        f'Niche: "{brief.get("niche") or "general coaching"}"\n'
        f'Style preferences: {brief.get("style_chips") or "no strong preference"}\n'
        f'Their vibe, in their own words: "{brief.get("vibe") or "-"}"\n'
        f'Brand\'s existing theme color: {brief.get("primary_hex") or "#1a56db"}'
    ]
    if pinned.get("mark_elements"):
        parts.append("Pinned mark elements: " + json.dumps(pinned["mark_elements"])[:4000])
    if pinned.get("lockup"):
        parts.append("Pinned lockup: " + json.dumps(pinned["lockup"])[:4000])
    tail = transcript[-12:]
    if tail:
        lines = [f"{'Coach' if m.get('role') == 'user' else 'You'}: {str(m.get('text') or '')[:500]}" for m in tail]
        parts.append("<conversation_so_far>\n" + "\n".join(lines) + "\n</conversation_so_far>")
    parts.append(f'Coach\'s message: "{str(message or "")[:500]}"')
    return "\n\n".join(parts)


def converse_turn(stage, brief, transcript, pinned, message):
    """Pass A: one structured call -> validated TurnResult. Raises
    ConverseError (carrying billed cost) on failure."""
    if stage not in _STAGE_PROMPTS:
        raise ValueError(f"unknown stage: {stage}")
    prompt, output_model = _STAGE_PROMPTS[stage]
    try:
        parsed, cost, _ = core_ai.structured(
            system=prompt,
            user=_user_content(brief, transcript, pinned, message),
            output_model=output_model,
            model=settings.LOGO_AI_MODEL,
            max_tokens=6000,
        )
    except core_ai.AiError as exc:
        raise ConverseError(str(exc), cost_usd=exc.cost_usd) from exc
    return _validate_turn(stage, parsed, cost)


def critique_turn(stage, draft, images):
    """Pass B: the model reviews renders of its own draft. `images` are raw
    base64 PNG strings (already size/magic-checked by the view). Raises
    ConverseError on failure — the caller falls back to the draft."""
    _, output_model = _STAGE_PROMPTS[stage]
    blocks = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img}}
        for img in images[:3]
    ]
    blocks.append(
        {
            "type": "text",
            "text": "Your designs, in the same order as the renders:\n" + json.dumps(draft["designs"])[:12000],
        }
    )
    try:
        parsed, cost, _ = core_ai.structured_messages(
            system=CRITIQUE_PROMPT,
            messages=[{"role": "user", "content": blocks}],
            output_model=output_model,
            model=settings.LOGO_AI_MODEL,
            max_tokens=6000,
        )
    except core_ai.AiError as exc:
        raise ConverseError(str(exc), cost_usd=exc.cost_usd) from exc
    return _validate_turn(stage, parsed, cost)
```

> Note: the `logo_ai` import list above intentionally includes `_Mark` — `_validate_pack_mark` takes a `_Mark` instance.

- [ ] **Step 4: Run to verify pass** — `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_converse.py -v`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/logo_converse.py backend/apps/tenant_config/tests/test_logo_converse.py
git commit -m "feat(logo): staged converse module — icon/name/tagline prompts, turn + vision critique"
```

---

### Task 11: Conversation endpoints + turn quota; retire the batch pack

**Files:**
- Modify: `backend/apps/core/models.py` (`LogoAiUsage` gains `turns_used`)
- Create: `backend/apps/core/migrations/00XX_logoaiusage_turns_used.py` (via `make makemigrations`)
- Modify: `backend/config/settings/base.py` (~line 243)
- Modify: `backend/apps/tenant_config/logo_ai.py` (add `record_successful_turn`; delete `STATIC_PROMPT`, `_BrandPack`, `generate_brand_pack`, `BrandPackResult`, and the now-unused `PROMPT_VERSION` constant; **keep** `_Design` — its lockup fields feed `_validate_lockup`/`_RefinedDesign` — and keep `BrandPackError` only if something still imports it, which a grep will settle)
- Modify: `backend/apps/tenant_config/views.py`, `backend/apps/tenant_config/urls.py`
- Create test: `backend/apps/tenant_config/tests/test_logo_converse_views.py`
- Modify test: `backend/apps/tenant_config/tests/test_logo_ai_views.py` (delete pack-endpoint tests; keep/move status tests)

**Interfaces:**
- Consumes: `logo_converse.converse_turn/critique_turn/ConverseError/STAGES` (Task 10), `core_ai.supports_vision` (Task 8).
- Produces (Task 13's client consumes):
  - `GET /api/v1/admin/config/logo-ai/status/` → `{enabled, eligible, turns_remaining, refine_remaining, reason}` (reason ∈ `upgrade_required|quota_exhausted|disabled|null`)
  - `POST /api/v1/admin/config/logo-converse/` body `{stage, brief:{niche,style_chips,vibe}, transcript:[{role,text}], pinned:{mark_elements?,lockup?}, message}` → `{phase:"draft"|"final", token?, message, designs, turns_remaining, source:"ai"|"disabled"|"upgrade_required"|"quota_exhausted"|"error"}`
  - `POST /api/v1/admin/config/logo-converse/finish/` body `{token, images:[dataUrl]}` → `{phase:"final", message, designs, turns_remaining, source:"ai"|"draft"|"error"}`
  - Settings: `LOGO_AI_MONTHLY_TURN_LIMIT` (40). `logo_brand_pack` route/view/tests deleted.

- [ ] **Step 1: Model + settings + accounting**

`models.py` — add to `LogoAiUsage`: `turns_used = models.PositiveIntegerField(default=0)` (keep `packs_used` — historical data). Run `make makemigrations` → commit the generated migration; `make migrate-shared`.

`base.py` — replace the `LOGO_AI_MONTHLY_PACK_LIMIT` block with:

```python
# Hard per-tenant cap on successful Design-with-AI conversation turns per
# calendar month (one turn = design pass + vision critique pass).
LOGO_AI_MONTHLY_TURN_LIMIT = int(os.environ.get("LOGO_AI_MONTHLY_TURN_LIMIT", "40"))
```

`logo_ai.py` — add alongside `record_successful_refinement`:

```python
def record_successful_turn(tenant_schema, month=None):
    """Charged only after a successful, validated Pass A — the critique
    pass and failed calls never consume a coach's monthly turns."""
    from django.db.models import F

    month = month or _current_month()
    row, _ = LogoAiUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month)
    LogoAiUsage.objects.filter(pk=row.pk).update(turns_used=F("turns_used") + 1)
```

- [ ] **Step 2: Write the failing endpoint tests** — `test_logo_converse_views.py`, cloning `test_logo_ai_views.py`'s fixtures (`coach_client`, `paid_tenant`, `tenant_ctx`, HOST/SCHEMA constants) with `logo_converse.converse_turn`/`critique_turn` monkeypatched:

```python
_FAKE_TURN = logo_converse.TurnResult(
    "Here you go.",
    [{"concept": "c", "rationale": "r", "paths": [{"d": "M0 0 Z", "fill": "mark"}],
      "elements": [{"type": "circle", "cx": 50, "cy": 50, "r": 30}],
      "palette": {"name": "P", "primary": "#0f766e", "secondary": "#14b8a6", "accent": "#f59e0b", "ink": "#111827"},
      "color_roles": {"mark": "primary", "mark2": "secondary", "mark_accent": "accent"}}],
    Decimal("0.02"),
)

PNG_B64 = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 64).decode()
DATA_URL = "data:image/png;base64," + PNG_B64


class TestConverse:
    def test_draft_phase_returns_token_and_counts_turn(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"
        settings.ANTHROPIC_API_KEY = "k"
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: _FAKE_TURN)
        resp = coach_client.post(URL, {"stage": "icon", "brief": {}, "transcript": [], "pinned": {}, "message": "hi"}, format="json")
        assert resp.data["phase"] == "draft"
        assert resp.data["token"]
        assert resp.data["turns_remaining"] == settings.LOGO_AI_MONTHLY_TURN_LIMIT - 1
        usage = LogoAiUsage.objects.get(tenant_schema=SHARED_SCHEMA, month=MONTH)
        assert usage.turns_used == 1

    def test_cli_provider_returns_final_directly(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "cli"
        monkeypatch.setattr(core_ai, "available", lambda: (True, "ok"))
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: _FAKE_TURN)
        resp = coach_client.post(URL, {"stage": "icon", "brief": {}, "transcript": [], "pinned": {}, "message": "hi"}, format="json")
        assert resp.data["phase"] == "final"
        assert "token" not in resp.data or resp.data["token"] is None

    def test_quota_exhausted(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.LOGO_AI_MONTHLY_TURN_LIMIT = 0
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: _FAKE_TURN)
        resp = coach_client.post(URL, PAYLOAD, format="json")
        assert resp.data["source"] == "quota_exhausted"

    def test_free_tenant_upgrade_required(self, coach_client, tenant_ctx, settings, monkeypatch):
        ...  # mirror test_logo_ai_views.py's existing upgrade-gate test

    def test_kill_switch_blocks(self, coach_client, paid_tenant, settings, monkeypatch):
        ...  # mirror the existing budget kill-switch test against the converse URL


class TestConverseFinish:
    def test_finish_critiques_cached_draft(self, coach_client, paid_tenant, settings, monkeypatch):
        # First call caches the draft...
        settings.AI_PROVIDER = "anthropic"; settings.ANTHROPIC_API_KEY = "k"
        monkeypatch.setattr(logo_converse, "converse_turn", lambda *a, **k: _FAKE_TURN)
        draft = coach_client.post(URL, PAYLOAD, format="json").data
        captured = {}
        def fake_critique(stage, cached, images):
            captured["stage"], captured["designs"], captured["n_images"] = stage, cached["designs"], len(images)
            return _FAKE_TURN
        monkeypatch.setattr(logo_converse, "critique_turn", fake_critique)
        resp = coach_client.post(FINISH_URL, {"token": draft["token"], "images": [DATA_URL]}, format="json")
        assert resp.data["phase"] == "final"
        assert resp.data["source"] == "ai"
        assert captured["stage"] == "icon" and captured["n_images"] == 1
        # the critiqued designs came from the SERVER cache, not the client
        assert captured["designs"] == _FAKE_TURN.designs

    def test_finish_failure_falls_back_to_draft(self, coach_client, paid_tenant, settings, monkeypatch):
        ...  # critique_turn raises ConverseError -> resp.data["source"] == "draft", designs == draft designs

    def test_unknown_token_is_error(self, coach_client, paid_tenant, settings):
        resp = coach_client.post(FINISH_URL, {"token": "nope", "images": [DATA_URL]}, format="json")
        assert resp.data["source"] == "error"

    def test_non_png_image_rejected(self, coach_client, paid_tenant, settings, monkeypatch):
        ...  # data:image/png;base64,<jpeg bytes> -> source "error", critique never called

    def test_finish_does_not_count_a_second_turn(self, coach_client, paid_tenant, settings, monkeypatch):
        ...  # turns_used stays 1 after finish
```

(Fill the `...` bodies by mirroring the neighboring complete tests — each is a 5-line variation. `URL = "/api/v1/admin/config/logo-converse/"`, `FINISH_URL = URL + "finish/"`, `PAYLOAD = {"stage": "icon", "brief": {}, "transcript": [], "pinned": {}, "message": "hi"}`.)

- [ ] **Step 3: Run to verify fail** — `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_converse_views.py -v`. Expected: FAIL (404s).

- [ ] **Step 4: Implement the views** — in `views.py`, replacing `logo_brand_pack` (keep `_brand_pack_status`'s gating logic but reshape):

```python
_DRAFT_CACHE_PREFIX = "logo_draft:"
_DRAFT_TTL_SECONDS = 600
_MAX_CRITIQUE_IMAGES = 3
_MAX_IMAGE_B64_CHARS = 700_000
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _logo_ai_status(tenant):
    enabled, _ = core_ai.available()
    eligible = tenant.has_paid_platform_plan
    usage = logo_ai.tenant_usage(tenant.schema_name)
    turns_remaining = max(0, settings.LOGO_AI_MONTHLY_TURN_LIMIT - usage.turns_used)
    refine_remaining = max(0, settings.LOGO_AI_MONTHLY_REFINE_LIMIT - usage.refinements_used)
    reason = None
    if not eligible:
        reason = "upgrade_required"
    elif not enabled:
        reason = "disabled"
    elif turns_remaining <= 0:
        reason = "quota_exhausted"
    return {
        "enabled": enabled,
        "eligible": eligible,
        "turns_remaining": turns_remaining,
        "refine_remaining": refine_remaining,
        "reason": reason,
    }


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def logo_ai_status(request):
    return Response(_logo_ai_status(connection.tenant))


def _cache_draft(kind, stage, result):
    token = secrets.token_urlsafe(24)
    cache.set(
        _DRAFT_CACHE_PREFIX + token,
        {
            "kind": kind,
            "stage": stage,
            "tenant": connection.tenant.schema_name,
            "message": result.message,
            "designs": result.designs,
        },
        timeout=_DRAFT_TTL_SECONDS,
    )
    return token


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def logo_converse(request):
    """Pass A of a Design-with-AI turn. Returns a draft + token when the
    provider supports vision (the client renders and calls finish/), or a
    final response on the cli provider. Always a non-empty JSON body."""
    tenant = connection.tenant
    month = logo_ai._current_month()
    empty = {"phase": "final", "message": "", "designs": [], "turns_remaining": 0}

    if not core_ai.available()[0]:
        return Response({**empty, "source": "disabled"})
    if not tenant.has_paid_platform_plan:
        return Response({**empty, "source": "upgrade_required"})

    data = request.data if isinstance(request.data, dict) else {}
    stage = data.get("stage")
    if stage not in logo_converse_mod.STAGES:
        return Response({**empty, "source": "error"})
    config = TenantConfig.objects.first()
    brief = {
        "brand_name": (config.brand_name if config else "") or "My Brand",
        "primary_hex": _THEME_PRIMARY_HEX.get(config.theme if config else "ocean", "#1a56db"),
        "niche": str((data.get("brief") or {}).get("niche") or "")[:120],
        "style_chips": ", ".join(str(c)[:20] for c in ((data.get("brief") or {}).get("style_chips") or [])[:3]),
        "vibe": str((data.get("brief") or {}).get("vibe") or "")[:200],
    }
    transcript = [m for m in (data.get("transcript") or []) if isinstance(m, dict)][:12]
    pinned = data.get("pinned") if isinstance(data.get("pinned"), dict) else {}
    message = str(data.get("message") or "")[:500]

    usage = logo_ai.tenant_usage(tenant.schema_name, month=month)
    turns_remaining = max(0, settings.LOGO_AI_MONTHLY_TURN_LIMIT - usage.turns_used)
    if turns_remaining <= 0:
        return Response({**empty, "source": "quota_exhausted"})
    if logo_ai.global_spend(month=month) >= Decimal(str(settings.LOGO_AI_MONTHLY_BUDGET_USD)):
        logger.warning("logo converse: monthly budget kill-switch tripped (%s)", month)
        return Response({**empty, "source": "disabled", "turns_remaining": turns_remaining})

    try:
        result = logo_converse_mod.converse_turn(stage, brief, transcript, pinned, message)
    except logo_converse_mod.ConverseError as exc:
        logo_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd, month=month)
        logger.exception("logo converse: turn failed")
        return Response({**empty, "source": "error", "turns_remaining": turns_remaining})
    except Exception:
        logo_ai.record_attempt_cost(tenant.schema_name, Decimal("0"), month=month)
        logger.exception("logo converse: AI call failed")
        return Response({**empty, "source": "error", "turns_remaining": turns_remaining})

    logo_ai.record_attempt_cost(tenant.schema_name, result.cost_usd, month=month)
    logo_ai.record_successful_turn(tenant.schema_name, month=month)
    body = {
        "message": result.message,
        "designs": result.designs,
        "turns_remaining": turns_remaining - 1,
        "source": "ai",
    }
    if core_ai.supports_vision():
        return Response({**body, "phase": "draft", "token": _cache_draft("converse", stage, result)})
    return Response({**body, "phase": "final"})


def _decode_images(raw):
    """data:image/png;base64 URLs -> raw base64 strings; enforce count, size
    and PNG magic. Returns None if anything is off."""
    if not isinstance(raw, list) or not 1 <= len(raw) <= _MAX_CRITIQUE_IMAGES:
        return None
    out = []
    for item in raw:
        if not isinstance(item, str) or not item.startswith("data:image/png;base64,"):
            return None
        b64 = item.split(",", 1)[1]
        if len(b64) > _MAX_IMAGE_B64_CHARS:
            return None
        try:
            head = base64.b64decode(b64[:64] + "=" * (-len(b64[:64]) % 4))
        except Exception:
            return None
        if not head.startswith(_PNG_MAGIC):
            return None
        out.append(b64)
    return out


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def logo_converse_finish(request):
    """Pass B: vision critique of the server-cached draft against the
    client's renders. Never costs a turn; any failure returns the draft."""
    tenant = connection.tenant
    month = logo_ai._current_month()
    data = request.data if isinstance(request.data, dict) else {}
    token = str(data.get("token") or "")
    cached = cache.get(_DRAFT_CACHE_PREFIX + token) if token else None
    usage = logo_ai.tenant_usage(tenant.schema_name, month=month)
    turns_remaining = max(0, settings.LOGO_AI_MONTHLY_TURN_LIMIT - usage.turns_used)

    if not cached or cached.get("tenant") != tenant.schema_name:
        return Response({"phase": "final", "message": "", "designs": [], "source": "error", "turns_remaining": turns_remaining})
    cache.delete(_DRAFT_CACHE_PREFIX + token)
    draft_body = {
        "phase": "final",
        "message": cached["message"],
        "designs": cached["designs"],
        "turns_remaining": turns_remaining,
    }
    images = _decode_images(data.get("images"))
    if images is None:
        return Response({**draft_body, "source": "error"})
    try:
        result = logo_converse_mod.critique_turn(cached["stage"], cached, images)
    except logo_converse_mod.ConverseError as exc:
        logo_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd, month=month)
        logger.exception("logo converse finish: critique failed — serving draft")
        return Response({**draft_body, "source": "draft"})
    except Exception:
        logo_ai.record_attempt_cost(tenant.schema_name, Decimal("0"), month=month)
        logger.exception("logo converse finish: AI call failed — serving draft")
        return Response({**draft_body, "source": "draft"})
    logo_ai.record_attempt_cost(tenant.schema_name, result.cost_usd, month=month)
    return Response({**draft_body, "message": result.message, "designs": result.designs, "source": "ai"})
```

with imports `import base64`, `import secrets`, `from apps.tenant_config import logo_converse as logo_converse_mod`. Delete `logo_brand_pack`, `logo_brand_pack_status`, `_brand_pack_status`, `_brand_pack_cache_key`.

`urls.py`:

```python
    path("config/logo-ai/status/", logo_ai_status, name="logo-ai-status"),
    path("config/logo-converse/", logo_converse, name="logo-converse"),
    path("config/logo-converse/finish/", logo_converse_finish, name="logo-converse-finish"),
```

(remove the two `logo-brand-pack` routes). In `logo_ai.py`, delete `STATIC_PROMPT`, `_BrandPack`, `generate_brand_pack`, `BrandPackResult`; keep `BrandPackError` only if anything still imports it (grep — the refine path uses `RefineError`). In `test_logo_ai_views.py`, delete the pack-endpoint test classes and re-point status tests at `/logo-ai/status/` asserting the new payload keys.

- [ ] **Step 5: Run to verify pass** — `docker compose exec -T django pytest apps/tenant_config/ apps/core/tests -v`. Expected: PASS (including updated status tests).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations backend/config/settings/base.py backend/apps/tenant_config/logo_ai.py backend/apps/tenant_config/views.py backend/apps/tenant_config/urls.py backend/apps/tenant_config/tests/test_logo_converse_views.py backend/apps/tenant_config/tests/test_logo_ai_views.py
git commit -m "feat(logo): converse endpoints with draft/critique phases and turn quota; retire batch pack"
```

---

### Task 12: Refine gains the two-pass loop

**Files:**
- Modify: `backend/apps/tenant_config/views.py` (`logo_refine`), `backend/apps/tenant_config/logo_converse.py` (refine critique), `backend/apps/tenant_config/logo_ai.py` (nothing new — `_RefinedDesign` already has the Task 9 fields)
- Test: `backend/apps/tenant_config/tests/test_logo_refine_views.py`

**Interfaces:**
- Produces: `logo_refine` response gains `phase` + `token` (`{design, source, refine_remaining, phase, token?}`); `logo_converse_finish` additionally handles cached `kind == "refine"` drafts (single design; response key `design` instead of `designs`). Client Task 15 consumes.

- [ ] **Step 1: Write the failing tests** — append to `test_logo_refine_views.py`:

```python
class TestRefineTwoPass:
    def test_refine_returns_draft_with_token_when_vision(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"; settings.ANTHROPIC_API_KEY = "k"
        _mock_refine_success(monkeypatch)  # the file's existing helper
        resp = coach_client.post(REFINE_URL, _payload(), format="json")
        assert resp.data["phase"] == "draft" and resp.data["token"]
        assert resp.data["design"]  # draft design still returned for fallback

    def test_refine_final_on_cli(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "cli"
        monkeypatch.setattr(core_ai, "available", lambda: (True, "ok"))
        _mock_refine_success(monkeypatch)
        resp = coach_client.post(REFINE_URL, _payload(), format="json")
        assert resp.data["phase"] == "final"

    def test_finish_critiques_refine_draft(self, coach_client, paid_tenant, settings, monkeypatch):
        settings.AI_PROVIDER = "anthropic"; settings.ANTHROPIC_API_KEY = "k"
        _mock_refine_success(monkeypatch)
        draft = coach_client.post(REFINE_URL, _payload(), format="json").data
        monkeypatch.setattr(logo_converse, "critique_refine", lambda cached, images: logo_converse.RefineCritiqueResult(cached["design"], Decimal("0.01")))
        resp = coach_client.post(FINISH_URL, {"token": draft["token"], "images": [DATA_URL]}, format="json")
        assert resp.data["phase"] == "final" and resp.data["design"]
```

- [ ] **Step 2: Run to verify fail** — `docker compose exec -T django pytest apps/tenant_config/tests/test_logo_refine_views.py -v -k TwoPass`. Expected: FAIL.

- [ ] **Step 3: Implement**

`logo_converse.py` — add:

```python
class RefineCritiqueResult:
    def __init__(self, design, cost_usd):
        self.design = design
        self.cost_usd = cost_usd


def critique_refine(cached, images):
    """Pass B for an editor refinement: one design, same checklist. The
    output model is logo_ai's _RefinedDesign; validation mirrors
    logo_ai.refine_design's."""
    from . import logo_ai

    blocks = [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img}}
        for img in images[:3]
    ]
    blocks.append({"type": "text", "text": "Your design:\n" + json.dumps(cached["design"])[:12000]})
    try:
        parsed, cost, _ = core_ai.structured_messages(
            system=CRITIQUE_PROMPT,
            messages=[{"role": "user", "content": blocks}],
            output_model=logo_ai._RefinedDesign,
            model=settings.LOGO_AI_MODEL,
            max_tokens=3000,
        )
    except core_ai.AiError as exc:
        raise ConverseError(str(exc), cost_usd=exc.cost_usd) from exc
    mark = _validate_pack_mark(parsed.mark)
    if not mark:
        raise ConverseError("critiqued refine mark left nothing usable", cost_usd=cost)
    design = {
        "mark": mark,
        "palette": _validate_pack_palette(parsed.palette),
        "font_vibe": parsed.font_vibe,
        "rationale": str(parsed.rationale or "")[:300],
        **_validate_lockup(parsed),
    }
    return RefineCritiqueResult(design, cost)
```

`views.py` — in `logo_refine`'s success tail, replace the final `return Response(...)` with:

```python
    logo_ai.record_attempt_cost(tenant.schema_name, result.cost_usd, month=month)
    logo_ai.record_successful_refinement(tenant.schema_name, month=month)
    body = {"design": result.design, "source": "ai", "refine_remaining": refine_remaining - 1}
    if core_ai.supports_vision():
        token = secrets.token_urlsafe(24)
        cache.set(
            _DRAFT_CACHE_PREFIX + token,
            {"kind": "refine", "tenant": tenant.schema_name, "design": result.design},
            timeout=_DRAFT_TTL_SECONDS,
        )
        return Response({**body, "phase": "draft", "token": token})
    return Response({**body, "phase": "final"})
```

and in `logo_converse_finish`, right after the cache hit, branch on kind:

```python
    if cached.get("kind") == "refine":
        draft_body = {"phase": "final", "design": cached["design"], "turns_remaining": turns_remaining}
        images = _decode_images(data.get("images"))
        if images is None:
            return Response({**draft_body, "source": "error"})
        try:
            result = logo_converse_mod.critique_refine(cached, images)
        except Exception:
            logger.exception("logo refine finish: critique failed — serving draft")
            return Response({**draft_body, "source": "draft"})
        logo_ai.record_attempt_cost(tenant.schema_name, result.cost_usd, month=month)
        return Response({**draft_body, "design": result.design, "source": "ai"})
```

- [ ] **Step 4: Run to verify pass** — whole `test_logo_refine_views.py` + `test_logo_converse_views.py`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/views.py backend/apps/tenant_config/logo_converse.py backend/apps/tenant_config/tests/test_logo_refine_views.py
git commit -m "feat(logo): editor refine runs the same draft->render->critique loop"
```

---

### Task 13: Frontend converse client + compose mapping

**Files:**
- Create: `frontend-customer/src/lib/logo/converse-api.ts`
- Modify: `frontend-customer/src/lib/logo/composer.ts` (add `ConverseDesign`, `composeConverseDesign`, `composeIconPreview`; extend `applyRefinedDesign` with `mark_scale`/`mark_gradient`)
- Modify: `frontend-customer/src/lib/logo/brand-pack-api.ts` → status shape (`LogoAiStatus`)
- Test: `frontend-customer/src/lib/logo/__tests__/composer.test.ts`

**Interfaces:**
- Consumes: Task 11/12 response shapes; `solidOf` (Task 6); recipe v3 types (Task 5).
- Produces (Task 14/15 consume):

```ts
// converse-api.ts
export type ChatStage = "icon" | "name" | "tagline";
export interface ConverseTurnResponse {
  phase: "draft" | "final";
  token?: string;
  message: string;
  designs: ConverseDesign[];
  turns_remaining: number;
  source: "ai" | "draft" | "disabled" | "upgrade_required" | "quota_exhausted" | "error";
}
export function fetchConverseTurn(body: {
  stage: ChatStage;
  brief: { niche: string; style_chips: string[]; vibe: string };
  transcript: { role: "user" | "assistant"; text: string }[];
  pinned: { mark_elements?: BrandPackElement[]; lockup?: unknown };
  message: string;
}): Promise<ConverseTurnResponse>;
export function fetchConverseFinish(token: string, images: string[]): Promise<ConverseTurnResponse>;
export function fetchLogoAiStatus(): Promise<LogoAiStatus>; // {enabled, eligible, turns_remaining, refine_remaining, reason}
// composer.ts
export interface ConverseDesign { /* mirrors the backend dicts: concept, rationale,
  paths, elements?, palette, color_roles, and (name/tagline stages) layout,
  badge_shape, badge_outline, font, typography, mark_scale, mark_gradient, tagline */ }
export function composeConverseDesign(design: ConverseDesign, brandName: string): LogoRecipe;
export function composeIconPreview(design: ConverseDesign, brandName: string): LogoRecipe;
```

- [ ] **Step 1: Write the failing tests** — add to `composer.test.ts`:

```ts
const iconDesign: ConverseDesign = {
  concept: "c", rationale: "r",
  paths: [{ d: "M0 0 Z", fill: "mark" }],
  palette: { name: "P", primary: "#0f766e", secondary: "#14b8a6", accent: "#f59e0b", ink: "#111827" },
  color_roles: { mark: "primary", mark2: "secondary", mark_accent: "accent" },
};
const lockupDesign: ConverseDesign = {
  ...iconDesign,
  layout: "horizontal", badge_shape: "none", badge_outline: false,
  font: "Manrope", typography: { case: "none", tracking: 0, weight: 700 },
  color_roles: { badge: "primary", mark: "ink", mark2: "secondary", mark_accent: "accent", text: "ink", tagline: "secondary" },
  mark_scale: 1.4, mark_gradient: { to: "accent", angle: 45 }, tagline: "Breathe.",
};

describe("composeConverseDesign", () => {
  it("maps mark_scale onto elements.mark.scale", () => {
    const recipe = composeConverseDesign(lockupDesign, "Flow");
    expect(recipe.elements.mark.scale).toBe(1.4);
  });
  it("materializes mark_gradient as a linear Fill from mark role to target role", () => {
    const recipe = composeConverseDesign(lockupDesign, "Flow");
    expect(recipe.colors.mark).toEqual({ type: "linear", from: "#111827", to: "#f59e0b", angle: 45 });
  });
  it("keeps solid mark when no gradient", () => {
    const recipe = composeConverseDesign({ ...lockupDesign, mark_gradient: null }, "Flow");
    expect(recipe.colors.mark).toBe("#111827");
  });
  it("sets the design's tagline text", () => {
    expect(composeConverseDesign(lockupDesign, "Flow").tagline).toBe("Breathe.");
  });
});

describe("composeIconPreview", () => {
  it("builds a badge-less custom-mark recipe with role-resolved colors", () => {
    const recipe = composeIconPreview(iconDesign, "Flow");
    expect(recipe.mark.type).toBe("custom");
    expect(recipe.badge.shape).toBe("none");
    expect(recipe.colors.mark).toBe("#0f766e");
    expect(recipe.colors.mark2).toBe("#14b8a6");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/lib/logo/__tests__/composer.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement**

`composer.ts` — add after `composeDesigns` (reusing `resolveRole`, `clampTracking`, `taglineWeight`, `fontEntry`, `defaultRecipe`):

```ts
export interface ConverseMarkRoles {
  mark: PaletteRole;
  mark2: PaletteRole;
  mark_accent: PaletteRole;
}
export interface ConverseDesign {
  concept: string;
  rationale: string;
  paths: BrandPackPath[];
  elements?: BrandPackElement[];
  palette: BrandPackPalette;
  color_roles: ConverseMarkRoles | BrandPackColorRoles;
  layout?: RecipeLayout;
  badge_shape?: BadgeShape;
  badge_outline?: boolean;
  font?: string;
  typography?: BrandPackTypography;
  mark_scale?: number;
  mark_gradient?: { to: Exclude<PaletteRole, "white">; angle: number } | null;
  tagline?: string;
}

const clampScale = (s: number | undefined) =>
  Math.max(0.6, Math.min(1.8, s ?? 1));

function markFillFor(design: ConverseDesign, markHex: string): MarkFill {
  if (!design.mark_gradient) return markHex;
  return {
    type: "linear",
    from: markHex,
    to: resolveRole(design.mark_gradient.to, design.palette),
    angle: Math.max(0, Math.min(360, design.mark_gradient.angle)),
  };
}

/** Stage-1 icon candidate -> a minimal recipe for MarkRenderer cards. */
export function composeIconPreview(
  design: ConverseDesign,
  brandName: string,
): LogoRecipe {
  const roles = design.color_roles;
  const base = defaultRecipe(brandName || "My Brand", design.palette.primary);
  return {
    ...base,
    mark: { type: "custom", rationale: design.rationale, paths: design.paths },
    badge: { shape: "none", outline: false },
    colors: {
      ...base.colors,
      palette_id: null,
      badge: { type: "solid", color: design.palette.primary },
      mark: resolveRole(roles.mark === "white" ? "ink" : roles.mark, design.palette),
      mark2: resolveRole(roles.mark2, design.palette),
      mark_accent: resolveRole(roles.mark_accent, design.palette),
    },
  };
}

/** Stage-2/3 candidate -> the complete recipe, faithfully. */
export function composeConverseDesign(
  design: ConverseDesign,
  brandName: string,
): LogoRecipe {
  const roles = design.color_roles as BrandPackColorRoles;
  const palette = design.palette;
  const family = LOGO_FONT_FAMILIES.includes(design.font ?? "")
    ? design.font!
    : LOGO_FONT_FAMILIES[0]!;
  const entry = fontEntry(family);
  const typography = design.typography ?? { case: "none" as const, tracking: 0, weight: 700 as const };
  const weight: FontWeight = entry.weights.includes(typography.weight)
    ? typography.weight
    : entry.weights[entry.weights.length - 1]!;
  const layout = design.layout ?? "horizontal";
  const badgeShape = design.badge_shape ?? "none";
  const noBadge = badgeShape === "none" || layout === "name_only";
  const markRole: PaletteRole =
    noBadge && roles.mark === "white" ? "ink" : roles.mark;
  const markHex = resolveRole(markRole, palette);
  const base = defaultRecipe(brandName || "My Brand", palette.primary);
  return {
    ...base,
    layout,
    tagline: design.tagline ?? "",
    mark: { type: "custom", rationale: design.rationale, paths: design.paths },
    badge: { shape: badgeShape, outline: design.badge_outline ?? false },
    typography: {
      name: {
        font: entry.family,
        weight,
        tracking: clampTracking(typography.tracking),
        case: typography.case,
      },
      tagline: { font: entry.family, weight: taglineWeight(entry), tracking: 0.08, case: "upper" },
    },
    colors: {
      palette_id: null,
      badge: { type: "solid", color: resolveRole(roles.badge, palette) },
      mark: markFillFor(design, markHex),
      mark2: resolveRole(roles.mark2, palette),
      mark_accent: resolveRole(roles.mark_accent, palette),
      text: resolveRole(roles.text, palette),
      tagline: resolveRole(roles.tagline, palette),
    },
    elements: {
      ...base.elements,
      mark: { offset: [0, 0], scale: clampScale(design.mark_scale) },
    },
  };
}
```

Also extend `applyRefinedDesign`: `RefinedDesign` gains `mark_scale?: number; mark_gradient?: ConverseDesign["mark_gradient"]`, its returned recipe sets `colors.mark: markFillFor(design as ConverseDesign, resolveRole(markRole, design.palette))` and `elements: { ...recipe.elements, mark: { ...recipe.elements.mark, scale: clampScale(design.mark_scale) } }`.

`converse-api.ts` (complete file):

```ts
// Thin client for the staged Design-with-AI endpoints. See
// backend/apps/tenant_config/views.py logo_converse / logo_converse_finish.
import { clientFetch } from "@/lib/api-client";
import type { BrandPackElement, ConverseDesign } from "@/lib/logo/composer";

export type ChatStage = "icon" | "name" | "tagline";

export interface LogoAiStatus {
  enabled: boolean;
  eligible: boolean;
  turns_remaining: number;
  refine_remaining: number;
  reason: "upgrade_required" | "quota_exhausted" | "disabled" | null;
}

export interface ConverseTurnResponse {
  phase: "draft" | "final";
  token?: string;
  message: string;
  designs: ConverseDesign[];
  turns_remaining: number;
  source: "ai" | "draft" | "disabled" | "upgrade_required" | "quota_exhausted" | "error";
}

export function fetchLogoAiStatus(): Promise<LogoAiStatus> {
  return clientFetch<LogoAiStatus>("/api/v1/admin/config/logo-ai/status/");
}

export function fetchConverseTurn(body: {
  stage: ChatStage;
  brief: { niche: string; style_chips: string[]; vibe: string };
  transcript: { role: "user" | "assistant"; text: string }[];
  pinned: { mark_elements?: BrandPackElement[]; lockup?: unknown };
  message: string;
}): Promise<ConverseTurnResponse> {
  return clientFetch<ConverseTurnResponse>("/api/v1/admin/config/logo-converse/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function fetchConverseFinish(
  token: string,
  images: string[],
): Promise<ConverseTurnResponse> {
  return clientFetch<ConverseTurnResponse>("/api/v1/admin/config/logo-converse/finish/", {
    method: "POST",
    body: JSON.stringify({ token, images }),
  });
}
```

`brand-pack-api.ts`: delete `fetchBrandPack`/`fetchBrandPackStatus`/`BrandPackStatus` (Task 15 rewires callers to `converse-api.ts`; do the mechanical rename here only if `npx tsc --noEmit` demands it to stay green — otherwise leave the file for Task 15's sweep).

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/logo && npx tsc --noEmit` (tsc may flag studio files still importing the old status API — acceptable to defer only if the repo's lint gate allows; otherwise stub the re-export `export type BrandPackStatus = LogoAiStatus` until Task 15 removes it). Expected: tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/logo/converse-api.ts frontend-customer/src/lib/logo/composer.ts frontend-customer/src/lib/logo/brand-pack-api.ts frontend-customer/src/lib/logo/__tests__/composer.test.ts
git commit -m "feat(logo): converse client + faithful compose of staged designs (scale, gradient, tagline)"
```

---

### Task 14: Chat state machine

**Files:**
- Create: `frontend-customer/src/lib/logo/chat-state.ts`
- Test: `frontend-customer/src/lib/logo/__tests__/chat-state.test.ts`

**Interfaces:**
- Consumes: `ChatStage`, `ConverseDesign` (Task 13).
- Produces (Task 15's component consumes):

```ts
export interface ChatMessage { role: "user" | "assistant"; text: string; designs?: ConverseDesign[] }
export interface ChatState {
  stage: ChatStage;
  messages: ChatMessage[];
  pinnedIcon: ConverseDesign | null;
  pinnedLockup: ConverseDesign | null;
  status: "idle" | "designing" | "reviewing";
  done: boolean;
}
export const initialChatState: ChatState;
export type ChatEvent =
  | { type: "user_message"; text: string }
  | { type: "draft_received" }
  | { type: "final_received"; message: string; designs: ConverseDesign[] }
  | { type: "turn_failed"; notice: string }
  | { type: "pin"; design: ConverseDesign }
  | { type: "skip_tagline" }
  | { type: "back"; stage: ChatStage };
export function chatReducer(state: ChatState, event: ChatEvent): ChatState;
```

- [ ] **Step 1: Write the failing tests** — `chat-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState } from "@/lib/logo/chat-state";

const design = { concept: "c", rationale: "r", paths: [], palette: { name: "", primary: "#111111", secondary: "#222222", accent: "#333333", ink: "#000000" }, color_roles: { mark: "primary", mark2: "secondary", mark_accent: "accent" } } as never;

describe("chatReducer", () => {
  it("starts at the icon stage, idle", () => {
    expect(initialChatState.stage).toBe("icon");
    expect(initialChatState.status).toBe("idle");
  });

  it("user_message appends and enters designing; draft_received enters reviewing", () => {
    let s = chatReducer(initialChatState, { type: "user_message", text: "hi" });
    expect(s.messages.at(-1)).toEqual({ role: "user", text: "hi" });
    expect(s.status).toBe("designing");
    s = chatReducer(s, { type: "draft_received" });
    expect(s.status).toBe("reviewing");
  });

  it("final_received appends the assistant turn with designs and idles", () => {
    let s = chatReducer(initialChatState, { type: "user_message", text: "hi" });
    s = chatReducer(s, { type: "final_received", message: "here", designs: [design] });
    expect(s.status).toBe("idle");
    expect(s.messages.at(-1)?.designs).toHaveLength(1);
  });

  it("pin on icon advances to name; pin on name advances to tagline; pin on tagline finishes", () => {
    let s = chatReducer(initialChatState, { type: "pin", design });
    expect(s.stage).toBe("name");
    expect(s.pinnedIcon).toBe(design);
    s = chatReducer(s, { type: "pin", design });
    expect(s.stage).toBe("tagline");
    expect(s.pinnedLockup).toBe(design);
    s = chatReducer(s, { type: "pin", design });
    expect(s.done).toBe(true);
  });

  it("skip_tagline finishes with the pinned lockup", () => {
    let s = chatReducer(initialChatState, { type: "pin", design });
    s = chatReducer(s, { type: "pin", design });
    s = chatReducer(s, { type: "skip_tagline" });
    expect(s.done).toBe(true);
    expect(s.pinnedLockup).toBe(design);
  });

  it("back to icon clears later pins", () => {
    let s = chatReducer(initialChatState, { type: "pin", design });
    s = chatReducer(s, { type: "pin", design });
    s = chatReducer(s, { type: "back", stage: "icon" });
    expect(s.stage).toBe("icon");
    expect(s.pinnedIcon).toBeNull();
    expect(s.pinnedLockup).toBeNull();
  });

  it("turn_failed returns to idle with an assistant notice", () => {
    let s = chatReducer(initialChatState, { type: "user_message", text: "hi" });
    s = chatReducer(s, { type: "turn_failed", notice: "Couldn't reach the studio." });
    expect(s.status).toBe("idle");
    expect(s.messages.at(-1)?.text).toContain("Couldn't");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/lib/logo/__tests__/chat-state.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** — `chat-state.ts`:

```ts
// Pure state machine for the Design-with-AI chat. React-free so the stage /
// pin / status transitions are unit-testable; studio-chat.tsx renders it.
import type { ChatStage } from "@/lib/logo/converse-api";
import type { ConverseDesign } from "@/lib/logo/composer";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  designs?: ConverseDesign[];
}

export interface ChatState {
  stage: ChatStage;
  messages: ChatMessage[];
  pinnedIcon: ConverseDesign | null;
  pinnedLockup: ConverseDesign | null;
  status: "idle" | "designing" | "reviewing";
  done: boolean;
}

export const initialChatState: ChatState = {
  stage: "icon",
  messages: [],
  pinnedIcon: null,
  pinnedLockup: null,
  status: "idle",
  done: false,
};

export type ChatEvent =
  | { type: "user_message"; text: string }
  | { type: "draft_received" }
  | { type: "final_received"; message: string; designs: ConverseDesign[] }
  | { type: "turn_failed"; notice: string }
  | { type: "pin"; design: ConverseDesign }
  | { type: "skip_tagline" }
  | { type: "back"; stage: ChatStage };

export function chatReducer(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "user_message":
      return {
        ...state,
        status: "designing",
        messages: [...state.messages, { role: "user", text: event.text }],
      };
    case "draft_received":
      return { ...state, status: "reviewing" };
    case "final_received":
      return {
        ...state,
        status: "idle",
        messages: [
          ...state.messages,
          { role: "assistant", text: event.message, designs: event.designs },
        ],
      };
    case "turn_failed":
      return {
        ...state,
        status: "idle",
        messages: [...state.messages, { role: "assistant", text: event.notice }],
      };
    case "pin":
      if (state.stage === "icon")
        return { ...state, stage: "name", pinnedIcon: event.design };
      if (state.stage === "name")
        return { ...state, stage: "tagline", pinnedLockup: event.design };
      return { ...state, pinnedLockup: event.design, done: true };
    case "skip_tagline":
      return { ...state, done: true };
    case "back":
      if (event.stage === "icon")
        return { ...state, stage: "icon", pinnedIcon: null, pinnedLockup: null, done: false };
      if (event.stage === "name")
        return { ...state, stage: "name", pinnedLockup: null, done: false };
      return { ...state, stage: "tagline", done: false };
  }
}
```

- [ ] **Step 4: Run to verify pass** — same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/logo/chat-state.ts frontend-customer/src/lib/logo/__tests__/chat-state.test.ts
git commit -m "feat(logo): chat state machine for the staged design session"
```

---

### Task 15: Chat UI + draft rendering + studio wiring + session v2

**Files:**
- Create: `frontend-customer/src/components/logo/studio-chat.tsx`
- Modify: `frontend-customer/src/components/logo/studio-wall.tsx` (banner → "Design with AI" CTA; drop `aiWall` grid props), `frontend-customer/src/components/logo/logo-studio.tsx` (chat open state, refine two-pass, remove pack fetching), `frontend-customer/src/lib/logo/ai-banner.ts` (+ its test), `frontend-customer/src/lib/logo/studio-session.ts` (+ its test), `frontend-customer/src/lib/logo/refine-api.ts` (phase/token), delete leftovers in `brand-pack-api.ts`
- Test: `frontend-customer/src/lib/logo/__tests__/studio-session.test.ts`, `frontend-customer/src/lib/logo/__tests__/ai-banner.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 13–14; `svgToPngBlob` + `LOGO_FONTS` for draft rendering; `MarkRenderer`/`LogoRenderer` refs.
- Produces: `<StudioChat open state dispatch brief brandName status onUseDesign onStatusChange />`; `StudioSession` v2 with `chat: { stage, messages, pinnedIcon, pinnedLockup } | null`.

- [ ] **Step 1: Session v2 tests first** — extend `studio-session.test.ts`:

```ts
it("round-trips the chat state (schema v2)", () => {
  saveStudioSession({ ...baseSession(), chat: { stage: "name", messages: [{ role: "user", text: "hi" }], pinnedIcon: null, pinnedLockup: null } });
  expect(loadStudioSession()?.chat?.stage).toBe("name");
});

it("still loads a v1 payload, with chat null", () => {
  localStorage.setItem("contentor_logo_studio", JSON.stringify({ ...baseSession(), v: 1, savedAt: Date.now() }));
  const loaded = loadStudioSession();
  expect(loaded).not.toBeNull();
  expect(loaded?.chat).toBeNull();
});
```

Implement in `studio-session.ts`: `SCHEMA_VERSION = 2`; `StudioSession` gains `chat: { stage: ChatStage; messages: ChatMessage[]; pinnedIcon: ConverseDesign | null; pinnedLockup: ConverseDesign | null } | null`; loader accepts `parsed.v === 1 || parsed.v === 2` and fills `chat: parsed.v === 2 ? (parsed.chat ?? null) : null`. Run `npx vitest run src/lib/logo/__tests__/studio-session.test.ts` → PASS.

- [ ] **Step 2: Rework `ai-banner.ts` states + tests** — the banner machine drops `generating`/`ai_ready` (progress lives in the chat now) and keys off `LogoAiStatus`: states `hidden | upsell | idle | quota_exhausted | disabled`; `idle.description` mentions the 1-on-1 session. Update `deriveAiBannerState` signature to `{ status: LogoAiStatus | null }` and rewrite its test file accordingly (same TDD rhythm: adjust tests, watch fail, implement, pass).

- [ ] **Step 3: Build `studio-chat.tsx`** — a right-side panel (`w-[420px] border-l flex flex-col`, full-screen overlay on `md:` down) with: header (title + Icon → Name → Tagline progress strip: buttons, `aria-current` on the active stage, earlier stages clickable → `dispatch({type:"back",...})`); scrollable message list (user bubbles right, assistant left; assistant turns render their `designs` as cards — `MarkRenderer` at 120px for icon stage, `LogoRenderer width={280}` otherwise — each card with rationale caption, a **Pick this** button → `pin`, and on the tagline stage an extra **Skip tagline** button → `skip_tagline`); status row ("Designing…" pulse while `designing`, "Reviewing its own work…" while `reviewing`); input + send (disabled unless `status === "idle"` and turns remain); quota/upsell/disabled banners from `deriveAiBannerState`.

  The turn driver inside the component:

```tsx
async function runTurn(text: string) {
  dispatch({ type: "user_message", text });
  try {
    const resp = await fetchConverseTurn({
      stage: state.stage,
      brief: { niche: brief.niche, style_chips: brief.styleChips, vibe: brief.vibe ?? "" },
      transcript: state.messages.map((m) => ({ role: m.role, text: m.text })),
      pinned: {
        mark_elements: state.pinnedIcon?.elements,
        lockup: state.pinnedLockup ?? undefined,
      },
      message: text,
    });
    onStatusChange(resp.turns_remaining);
    if (resp.source !== "ai") {
      dispatch({ type: "turn_failed", notice: NOTICES[resp.source] });
      return;
    }
    if (resp.phase === "final" || !resp.token) {
      dispatch({ type: "final_received", message: resp.message, designs: resp.designs });
      return;
    }
    dispatch({ type: "draft_received" });
    setDraft(resp.designs); // mounts the hidden render rack
    const images = await renderDraftPngs(resp.designs, state.stage);
    const final = await fetchConverseFinish(resp.token, images);
    setDraft(null);
    dispatch({
      type: "final_received",
      message: final.source === "error" ? resp.message : final.message,
      designs: final.designs.length ? final.designs : resp.designs,
    });
  } catch {
    dispatch({ type: "turn_failed", notice: "Couldn't reach the design studio just now." });
  }
}
```

  with `NOTICES = { quota_exhausted: "You've used this month's AI design turns. More next month.", disabled: "AI design is temporarily unavailable.", upgrade_required: "AI design is included with paid plans.", error: "Couldn't design that turn — try again.", draft: "", ai: "" }`.

  `renderDraftPngs` renders each draft invisibly (fixed off-screen container, `composeIconPreview` for stage "icon" / `composeConverseDesign` otherwise, refs collected per card), waits one `requestAnimationFrame`, then for each svg element:

```ts
const vb = stage === "icon" ? { w: 1, h: 1 } : logoViewBox(recipe.layout);
const blob = await svgToPngBlob(svg, stage === "icon" ? 512 : 600, stage === "icon" ? 512 : Math.round((600 * vb.h) / vb.w), fontsFor(recipe));
const dataUrl = await blobToDataUrl(blob); // FileReader.readAsDataURL
```

  (`fontsFor(recipe)` builds the same `FontSpec[]` list `handleSave` in logo-studio.tsx builds — copy that block into a small helper here.) If rendering throws, fall back to `fetchConverseFinish` being skipped entirely and dispatch the draft as final — the coach always gets designs.

  On `state.done`, call `onUseDesign(composeConverseDesign({ ...state.pinnedLockup! }, brandName), state.pinnedLockup?.elements)`.

- [ ] **Step 4: Wire the studio** — in `logo-studio.tsx`:
  - Replace `fetchBrandPackStatus` with `fetchLogoAiStatus`; state `logoAiStatus`. Delete `fetchAiIdeas`, `aiWall`, `aiWallElements`, `pack`, `packSeed`, `aiLoading`, `aiNotice` **fetch paths** — keep `pack`/`packSeed` only as session-restore inputs to `composePackWall` (legacy walls still render if a saved session has one); never set them otherwise.
  - New state `const [chat, chatDispatch] = useReducer(chatReducer, initialChatState)` + `chatOpen`; restore/persist both through the v2 session (`chat: chatOpen || chat.messages.length ? { stage: chat.stage, messages: chat.messages, pinnedIcon: chat.pinnedIcon, pinnedLockup: chat.pinnedLockup } : null`).
  - `StudioWall` props swap: `onGenerateAi` → `onOpenChat={() => setChatOpen(true)}`; pass `logoAiStatus`. In `studio-wall.tsx`, the banner CTA becomes:

```tsx
<Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={() => onOpenChat?.()}>
  <Sparkles className="h-3.5 w-3.5" />
  Design with AI
</Button>
```

  and the ideas step renders `<StudioChat …/>` beside the wall when `chatOpen`. First open with an empty transcript auto-fires `runTurn("Show me first concepts for my brand.")`.
  - `onUseDesign={(recipe, elements) => { handleCustomize(recipe, elements); setChatOpen(false); }}`.
  - **Refine two-pass** in `handleRefine`: `fetchLogoRefine` response now carries `phase`/`token` (`refine-api.ts`: add `phase: "draft" | "final"; token?: string` to `RefineResponse`). When `phase === "draft"`: apply the draft to a temp recipe, render it with the same `renderDraftPngs` helper (export it from `studio-chat.tsx` or a shared `render-draft.ts`), call `fetchConverseFinish(token, images)`, and apply `resp.design ?? draft`. On any failure, apply the draft. (The response key for refine drafts is `design`, not `designs` — see Task 12.)

- [ ] **Step 5: Verify end-to-end in the running app** — `make dev` with the `cli` provider (or `ANTHROPIC_API_KEY` set): open the studio fresh → Brief → Ideas → "Design with AI" → first icon candidates appear → send feedback → pin → name-line candidates → pin → tagline stage → finish → editor holds the recipe → save → tenant navbar shows the logo, no duplicate name. Check `npx vitest run` and `npx tsc --noEmit` are clean; delete now-unused exports (`fetchBrandPack` etc.) and run `make lint`.

- [ ] **Step 6: Commit**

```bash
git add frontend-customer/src/components/logo frontend-customer/src/lib/logo frontend-customer/src/types/logo.ts
git commit -m "feat(logo): Design-with-AI staged chat replaces the batch pack wall"
```

---

### Task 16: E2e updates + manual eval harness

**Files:**
- Modify: `e2e/specs/15-logo-studio.spec.ts`, `e2e/specs/14-navbar-layouts.spec.ts`
- Create: `e2e/specs/90-logo-eval.spec.ts`

**Interfaces:**
- Consumes: the running dev stack (`make dev`), seeded tenants, the shipped UI.

- [ ] **Step 1: Update `15-logo-studio.spec.ts`** — read the spec first; it asserts the old wall (AI button text, 8/18-tile counts). Replace AI assertions with: the Ideas step shows the **"Design with AI"** button (or the upsell for free tenants); clicking it opens the chat panel (`role="dialog"` or the panel test-id you added — give the panel `data-testid="studio-chat"`). Do **not** drive a real AI turn in the default suite (provider may be off): assert the panel opens with the input and progress strip visible. Keep the deterministic-wall assertions (24 tiles, shuffle, customize→editor→save) as they are.

- [ ] **Step 2: Update `14-navbar-layouts.spec.ts`** — add: with a saved logo, the header brand-name text is absent (`locator("header .font-display")` count 0) and present again after enabling the toggle through the Navbar tab; setting size XL gives the logo `h-12`.

- [ ] **Step 3: Create the eval harness** — `90-logo-eval.spec.ts`:

```ts
// Manual eval wall: renders real conversation candidates for fixed briefs
// into eval-shots/ so prompt changes are judged on before/after evidence.
// Excluded from the default suite: requires LOGO_EVAL=1 and a live AI
// provider. If the dev stack uses the cli provider, probe its session
// limits first (see memory note: CLI batch evals can exhaust the dev
// subscription mid-run).
import { expect, test } from "@playwright/test";

const BRIEFS = [
  { name: "Stillpoint Yoga", niche: "yoga and breathwork", vibe: "calm, earthy, premium" },
  { name: "Glow Atelier", niche: "beauty coaching", vibe: "feminine, elegant" },
  { name: "Shipfast Labs", niche: "developer career coaching", vibe: "technical, sharp" },
  { name: "Ledger & Latte", niche: "personal finance", vibe: "trustworthy, warm" },
];

test.describe("logo eval wall", () => {
  test.skip(!process.env.LOGO_EVAL, "manual: set LOGO_EVAL=1 to run");
  for (const brief of BRIEFS) {
    test(`contact sheet: ${brief.name}`, async ({ page }) => {
      // login as the seeded coach + open the studio — reuse the exact
      // helper calls 15-logo-studio.spec.ts uses for this.
      // fill the brief fields with `brief`, continue to Ideas,
      // open Design with AI, wait for the first candidates:
      await expect(
        page.getByTestId("studio-chat").getByTestId("chat-design-card").first(),
      ).toBeVisible({ timeout: 240_000 });
      await page.getByTestId("studio-chat").screenshot({
        path: `eval-shots/${brief.name.toLowerCase().replace(/\W+/g, "-")}-icons.png`,
      });
    });
  }
});
```

(add `data-testid="chat-design-card"` to the chat's design cards in Task 15 if not already present; fill the login/brief steps from the existing spec's helpers — copy them, don't invent new ones).

- [ ] **Step 4: Run** — `make e2e` (Stripe specs skip; eval spec skips). Expected: green, including the two updated specs.

- [ ] **Step 5: Commit**

```bash
git add e2e/specs/15-logo-studio.spec.ts e2e/specs/14-navbar-layouts.spec.ts e2e/specs/90-logo-eval.spec.ts frontend-customer/src/components/logo/studio-chat.tsx
git commit -m "test(logo): e2e for chat studio + navbar logo controls; manual eval wall"
```

---

## Final verification (after all tasks)

- [ ] `make test` — full backend suite green.
- [ ] `cd frontend-customer && npx vitest run && npx tsc --noEmit` — green.
- [ ] `make lint` — zero issues.
- [ ] `make e2e` — green (17+ specs, Stripe + eval skip).
- [ ] Manual: full journey (brief → chat 3 stages → editor → save → navbar) on the dev stack, plus one real-provider eval run (`LOGO_EVAL=1`) to eyeball quality against the four axes: considered marks, clean geometry, designed typography, gradient color.
