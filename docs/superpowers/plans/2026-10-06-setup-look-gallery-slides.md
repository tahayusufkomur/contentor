# Setup Look Gallery & Visual Slides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `/setup` interview into full-screen, slide-like question pages where every answer is a visual tile, and replace the two-text-card "Which look feels most like you?" with a gallery of 12 live-rendered looks.

**Architecture:** A "look" is one of the 4 shipped section styles in one of 3 colourways (the style's own palette plus two alternatives), stored as `TenantConfig.style` + a new `TenantConfig.palette`. The gallery renders each look as the top of a real home page (the style's own hero/benefits/courses layouts with fixture content and the coach's brand name) scaled into a tile, so the picture can never drift from what the coach gets. Every other question's tiles gain a lucide icon (code-owned for fixed options, model-chosen from an allowlist for AI-written options) and, where it helps, a one-line hint; question pages animate as slides and respond to arrow keys.

**Tech Stack:** Django 5.1 + DRF + pydantic (backend interview), Next.js 14 / React 18 + Tailwind + lucide-react (frontend-customer), the shared section manifest in `packages/shared/src/sections` (synced into the backend by `make sections-sync`), pytest, vitest, Playwright.

**Spec:** No separate spec document. The request (verbatim): "I want the onboarding wizard to provide more option and visual guidance. And more like a slideshow. Not like you write chat continuously but question by question, more engaging style. E.g. 'Which look feels most like you?' is not clear, why not we offer several different styles? E.g. 12 different styles but not in text, but with visuals, we use all the screen, every new question like a new slide page. Every answer with guidance of visuals." The design decisions below are this plan's reading of it.

## Design decisions (read before Task 1)

- **12 looks = 4 layout styles × 3 palettes.** Designing 8 brand-new section styles (each ships 12 family layouts) is weeks of work; a colourway is 11 OKLCH values. Thumbnails differ most by colour and type, so 4 typographic/layout systems × 3 palettes read as 12 distinct looks. Fonts, radius, photo words and layouts stay per style.
- **Live tiles, not screenshots.** The old wizard's captured WebPs went stale invisibly (see `docs/wiki/onboarding-wizard-site-ai.md`). Section components have no `"use client"` or server-only imports, so the gallery renders them in-page at the site's 1180px desktop width and CSS-scales them, the same trick `browser-frame.tsx` uses for the iframe preview.
- **Icons on every tile.** Fixed-option fields carry an icon id per option in `interview_brief.Field.icons`; AI-written options get an icon id per option from the model, validated against the same allowlist. Unknown ids are dropped, never shown.
- **Hints only where they teach.** `tone`, `course_format` and `sells` get a one-line sample/explanation per option (`Field.hints`). AI options get none (the option text is already specific; extra output tokens slow a turn that is already long).
- **Nothing else moves.** Question order, the brief, milestones, go-live, the copilot edit path and the e2e flow (`01-signup-onboarding` delegates every question with "You decide") are untouched.

## Baseline warning (the working tree is shared and live)

The working tree already holds **uncommitted** question-by-question work from another session (`setup-flow.tsx`, `question-screen.tsx`, `answer-box.tsx`, `golive-panel.tsx`, `interview.py`, `interview_brief.py`, `interview_milestones.py`, their tests), and that session was still editing `interview_milestones.py` (`LOGO_PAGE = 15`, `style_cards` returning all enabled styles with `recommended`) while this plan was written. Rules:

1. This plan builds on top of that work. Before Task 1, run `git status --short` and ask the user whether to commit the baseline first (`git add` exactly those files, one commit `feat(setup): one question per screen`). Never revert or reformat a file you did not change (memory: `feedback-never-revert-files-you-did-not-change`).
2. Every edit below is described as a targeted change to the file *as it is when you open it*; re-read the file before editing, line numbers are approximate.
3. Each task commits only the files it touched (`git add <paths>`, never `git add -A`).

## Global Constraints

- Public endpoints untouched; every setup-flow view keeps `IsCoachOrOwner` (DRF default auth).
- `make lint` must pass: it runs `scripts/sync_sections.py --check` (manifest drift), `scripts/check-loading-patterns.mjs` (no raw spinners, `useAsyncAction` for async handlers, `<NavLink>`/`useNavigate()` only), ruff, prettier, eslint.
- Motion is CSS-only and `motion-safe:`-gated; every new keyframe lives in `tokens.ts` `SHELL_CSS`.
- After the serializer change, run `npm run gen:api` in `frontend-customer` (dev stack up) and review the `src/types/api-generated.ts` diff: only `palette` may appear.
- Option strings stay ≤ 60 chars, options ≤ `MAX_OPTIONS` (16); icon ids are lucide kebab-case names that exist in `lucide-react@0.441`.
- Shared manifest JSON is the source of truth; `backend/apps/tenant_config/sections_manifest/` is only ever written by `make sections-sync`.
- One heavy job at a time (full suite, e2e, build). Verify with `make test-app APP=tenant_config`, `npx vitest run`, `make typecheck`, `make lint`, then `make test-changed` and `make e2e-changed` once at the end.

## Review Focus

1. **A later style switch with a stale palette.** The copilot's `edit_style` (`apps/core/copilot/engine.py`) and the admin PATCH change `style` without touching `palette`. A palette id from the old style must render the new style's own palette (frontend) and must not make an unrelated PATCH fail validation (backend). Pinned in Task 2 (`paletteOf` unknown-id test; serializer test "PATCH style alone clears a stale palette").
2. **Going back to the look question.** The tile the coach already picked must show as current; `pickedOptions` only matches plain option strings, so the gallery highlights by label. Pinned in Task 6 (`current` prop).
3. **Model returns fewer or bogus icons.** Icons must be matched by position and silently dropped when unknown; the guide must still render. Pinned in Task 4 (`test_ai_icons_are_matched_to_options_and_filtered`).
4. **Phone width.** 12 live tiles two abreast: no horizontal page scroll, tiles clipped not overflowing, "You decide" still reachable. Checked manually in Task 8 with the browser pane's mobile preset.
5. **Offline fixture assets.** Tile photos are Pix4Less CDN previews and fonts are Google Fonts; with neither reachable (e2e, flaky Wi-Fi) tiles must still render coloured layouts, never a broken page. Checked in Task 8 by loading `/setup?mock=1` with the browser pane's network blocked for `pix4less.com` (devtools) and visually confirming tiles.

---

### Task 1: Palettes in the shared style manifest

**Files:**
- Modify: `packages/shared/src/sections/types.ts` (SiteStyle, ~line 57)
- Modify: `packages/shared/src/sections/styles/journal.json`, `kinetic.json`, `grid.json`, `pop.json`
- Modify: `scripts/sync_sections.py` (`_style_errors`)
- Modify: `backend/apps/tenant_config/sections.py` (after `style()`)
- Test: `backend/apps/tenant_config/tests/test_sections.py`

**Interfaces:**
- Produces (TS): `SiteStyle.paletteLabel: string`, `SiteStyle.palettes: SitePaletteVariant[]` where `SitePaletteVariant = { id: string; label: string; mood: string; palette: SiteStylePalette }`.
- Produces (Py): `sections.palettes(style_id) -> dict[str, dict]`, `sections.looks() -> list[dict]` (`{"value","style","palette","label","detail"}`), `sections.parse_look(value) -> tuple[str, str] | None`.

- [ ] **Step 1: Write the failing backend tests**

Append to `backend/apps/tenant_config/tests/test_sections.py` (the module already imports `sections`):

```python
def test_every_enabled_style_ships_two_full_palettes():
    keys = set(sections.style("journal")["palette"])
    for sid, s in sections.enabled_styles().items():
        assert s.get("paletteLabel"), sid
        assert len(s["palettes"]) == 2, sid
        for p in s["palettes"]:
            assert p["id"] and p["label"] and p["mood"], (sid, p)
            assert set(p["palette"]) == keys, (sid, p["id"])


def test_looks_list_every_style_in_every_palette():
    looks = sections.looks()
    assert len(looks) == 3 * len(sections.enabled_styles())
    first = looks[0]
    assert first["value"] == first["style"] and first["palette"] == ""
    assert looks[1]["value"] == f"{first['style']}:{looks[1]['palette']}"
    assert all({"value", "style", "palette", "label", "detail"} <= set(o) for o in looks)
    assert sections.palettes("journal").keys() == {"sage", "dusk"}


def test_parse_look():
    assert sections.parse_look("journal") == ("journal", "")
    assert sections.parse_look("journal:sage") == ("journal", "sage")
    assert sections.parse_look("journal:mint") is None
    assert sections.parse_look("nope") is None
    assert sections.parse_look("") is None
```

- [ ] **Step 2: Run them to verify they fail**

Run: `make test-app APP=tenant_config` (or inside the container: `cd backend && pytest apps/tenant_config/tests/test_sections.py -k "palettes or looks or parse_look" -v`)
Expected: FAIL — `KeyError: 'palettes'` / `AttributeError: module ... has no attribute 'looks'`.

- [ ] **Step 3: Extend the shared type**

In `packages/shared/src/sections/types.ts`, before `export interface SiteStyle {`:

```ts
/** An alternative colourway a style ships. Fonts, radius, photo words and
 *  layouts stay the style's; only the palette changes. */
export interface SitePaletteVariant {
  id: string;
  label: string;
  mood: string;
  palette: SiteStylePalette;
}
```

Inside `SiteStyle`, after `palette: SiteStylePalette;`:

```ts
  /** Name of the style's own `palette` as shown beside the alternatives. */
  paletteLabel: string;
  /** Alternative colourways; a look is `<style.id>` or `<style.id>:<palette.id>`. */
  palettes: SitePaletteVariant[];
```

- [ ] **Step 4: Add the colourways to the four style JSONs**

Add `"paletteLabel"` and `"palettes"` directly after the existing `"palette"` object in each file (keep the existing `palette` untouched).

`journal.json`:

```json
  "paletteLabel": "Paper",
  "palettes": [
    {
      "id": "sage",
      "label": "Sage",
      "mood": "Soft greens and warm ochre — a garden studio.",
      "palette": {
        "background": "oklch(0.97 0.01 140)",
        "surface": "oklch(0.935 0.018 140)",
        "foreground": "oklch(0.22 0.02 150)",
        "mutedForeground": "oklch(0.46 0.02 150)",
        "primary": "oklch(0.36 0.06 150)",
        "primaryForeground": "oklch(0.975 0.01 140)",
        "accent": "oklch(0.55 0.1 60)",
        "accentForeground": "oklch(0.975 0.01 140)",
        "border": "oklch(0.86 0.015 140)",
        "inverse": "oklch(0.30 0.05 150)",
        "inverseForeground": "oklch(0.95 0.01 140)"
      }
    },
    {
      "id": "dusk",
      "label": "Dusk",
      "mood": "Plum ink on lilac paper with a coral accent — evening calm.",
      "palette": {
        "background": "oklch(0.965 0.012 320)",
        "surface": "oklch(0.93 0.02 320)",
        "foreground": "oklch(0.24 0.03 320)",
        "mutedForeground": "oklch(0.47 0.03 320)",
        "primary": "oklch(0.33 0.07 320)",
        "primaryForeground": "oklch(0.97 0.01 320)",
        "accent": "oklch(0.55 0.14 20)",
        "accentForeground": "oklch(0.97 0.01 320)",
        "border": "oklch(0.86 0.015 320)",
        "inverse": "oklch(0.28 0.06 300)",
        "inverseForeground": "oklch(0.95 0.01 320)"
      }
    }
  ],
```

`kinetic.json`:

```json
  "paletteLabel": "Signal",
  "palettes": [
    {
      "id": "ocean",
      "label": "Ocean",
      "mood": "Navy and aqua — a swim club's bold signage.",
      "palette": {
        "background": "oklch(0.975 0.004 230)",
        "surface": "oklch(0.93 0.008 230)",
        "foreground": "oklch(0.18 0.02 250)",
        "mutedForeground": "oklch(0.45 0.02 250)",
        "primary": "oklch(0.42 0.16 250)",
        "primaryForeground": "oklch(0.99 0 0)",
        "accent": "oklch(0.9 0.12 195)",
        "accentForeground": "oklch(0.18 0.02 250)",
        "border": "oklch(0.85 0.006 240)",
        "inverse": "oklch(0.22 0.04 250)",
        "inverseForeground": "oklch(0.97 0.003 230)"
      }
    },
    {
      "id": "ember",
      "label": "Ember",
      "mood": "Orange heat and yellow highlights — a boxing gym at dusk.",
      "palette": {
        "background": "oklch(0.975 0.006 70)",
        "surface": "oklch(0.93 0.012 70)",
        "foreground": "oklch(0.2 0.01 50)",
        "mutedForeground": "oklch(0.46 0.01 50)",
        "primary": "oklch(0.62 0.19 50)",
        "primaryForeground": "oklch(0.99 0 0)",
        "accent": "oklch(0.9 0.16 95)",
        "accentForeground": "oklch(0.2 0.01 50)",
        "border": "oklch(0.85 0.008 70)",
        "inverse": "oklch(0.2 0.01 50)",
        "inverseForeground": "oklch(0.97 0.006 70)"
      }
    }
  ],
```

`grid.json`:

```json
  "paletteLabel": "Cobalt",
  "palettes": [
    {
      "id": "mono",
      "label": "Mono",
      "mood": "Black on white, nothing else — pure typography.",
      "palette": {
        "background": "oklch(0.985 0 0)",
        "surface": "oklch(0.95 0 0)",
        "foreground": "oklch(0.15 0 0)",
        "mutedForeground": "oklch(0.45 0 0)",
        "primary": "oklch(0.2 0 0)",
        "primaryForeground": "oklch(0.99 0 0)",
        "accent": "oklch(0.9 0 0)",
        "accentForeground": "oklch(0.15 0 0)",
        "border": "oklch(0.82 0 0)",
        "inverse": "oklch(0.2 0 0)",
        "inverseForeground": "oklch(0.98 0 0)"
      }
    },
    {
      "id": "terracotta",
      "label": "Terracotta",
      "mood": "Clay red on warm stone — grounded and modern.",
      "palette": {
        "background": "oklch(0.975 0.01 70)",
        "surface": "oklch(0.94 0.015 70)",
        "foreground": "oklch(0.2 0.01 40)",
        "mutedForeground": "oklch(0.46 0.01 40)",
        "primary": "oklch(0.55 0.16 40)",
        "primaryForeground": "oklch(0.99 0 0)",
        "accent": "oklch(0.9 0.05 40)",
        "accentForeground": "oklch(0.2 0.01 40)",
        "border": "oklch(0.84 0.01 70)",
        "inverse": "oklch(0.5 0.16 40)",
        "inverseForeground": "oklch(0.98 0.005 70)"
      }
    }
  ],
```

`pop.json`:

```json
  "paletteLabel": "Candy",
  "palettes": [
    {
      "id": "sorbet",
      "label": "Sorbet",
      "mood": "Tangerine and sky blue — summer stickers.",
      "palette": {
        "background": "oklch(0.975 0.02 80)",
        "surface": "oklch(0.92 0.05 60)",
        "foreground": "oklch(0.25 0.05 40)",
        "mutedForeground": "oklch(0.45 0.05 40)",
        "primary": "oklch(0.6 0.19 40)",
        "primaryForeground": "oklch(0.99 0.01 80)",
        "accent": "oklch(0.88 0.1 220)",
        "accentForeground": "oklch(0.25 0.05 40)",
        "border": "oklch(0.25 0.05 40)",
        "inverse": "oklch(0.3 0.08 40)",
        "inverseForeground": "oklch(0.95 0.04 80)"
      }
    },
    {
      "id": "mint",
      "label": "Mint",
      "mood": "Teal and lemon on mint — fresh and loud.",
      "palette": {
        "background": "oklch(0.975 0.02 150)",
        "surface": "oklch(0.92 0.06 165)",
        "foreground": "oklch(0.24 0.05 190)",
        "mutedForeground": "oklch(0.45 0.05 190)",
        "primary": "oklch(0.5 0.14 190)",
        "primaryForeground": "oklch(0.99 0.01 150)",
        "accent": "oklch(0.92 0.17 100)",
        "accentForeground": "oklch(0.24 0.05 190)",
        "border": "oklch(0.24 0.05 190)",
        "inverse": "oklch(0.28 0.07 200)",
        "inverseForeground": "oklch(0.95 0.04 150)"
      }
    }
  ],
```

- [ ] **Step 5: Validate palettes in the manifest checker**

In `scripts/sync_sections.py`, inside `_style_errors`, after the `"intro"` check in the loop:

```python
        keys = set(style.get("palette") or {})
        for variant in style.get("palettes") or []:
            if not variant.get("id") or set(variant.get("palette") or {}) != keys:
                errors.append(f"{name}: palette {variant.get('id')!r} must define exactly the style's palette keys")
```

- [ ] **Step 6: Sync the manifest into the backend**

Run: `make sections-sync`
Expected: `sections: synced 5 file(s) into backend/apps/tenant_config/sections_manifest` and no warnings.

- [ ] **Step 7: Add the look helpers to `sections.py`**

After `def style(style_id)` in `backend/apps/tenant_config/sections.py`:

```python
def palettes(style_id) -> dict:
    """palette id -> variant for a style. The style's own palette is not
    listed: it is palette id "" everywhere."""
    return {p["id"]: p for p in (style(style_id) or {}).get("palettes") or [] if p.get("id")}


def looks() -> list[dict]:
    """Every enabled style in its own palette and in each alternative, in
    display order: the looks /setup offers. value is the look id the coach
    picks: "<style>" or "<style>:<palette>"."""
    out = []
    for sid, s in enabled_styles().items():
        label = s.get("label") or sid
        out.append(
            {
                "value": sid,
                "style": sid,
                "palette": "",
                "label": f"{label} · {s.get('paletteLabel') or 'Original'}",
                "detail": s.get("mood", ""),
            }
        )
        for p in s.get("palettes") or []:
            out.append(
                {
                    "value": f"{sid}:{p['id']}",
                    "style": sid,
                    "palette": p["id"],
                    "label": f"{label} · {p.get('label') or p['id']}",
                    "detail": p.get("mood") or s.get("mood", ""),
                }
            )
    return out


def parse_look(value) -> tuple[str, str] | None:
    """"journal" or "journal:sage" -> (style id, palette id) when both exist."""
    sid, _, pid = str(value or "").partition(":")
    if style(sid) is None or (pid and pid not in palettes(sid)):
        return None
    return sid, pid
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `make test-app APP=tenant_config`
Expected: PASS (the three new tests plus the existing `test_sections.py` suite).

- [ ] **Step 9: Lint and commit**

Run: `make lint` — expected clean (the sync check sees no drift).

```bash
git add packages/shared/src/sections/types.ts packages/shared/src/sections/styles/*.json scripts/sync_sections.py backend/apps/tenant_config/sections.py backend/apps/tenant_config/sections_manifest backend/apps/tenant_config/tests/test_sections.py
git commit -m "feat(sections): every style ships two alternative palettes; looks() lists style x palette"
```

---

### Task 2: `TenantConfig.palette` end to end (model, API, rendering)

**Files:**
- Modify: `backend/apps/tenant_config/models.py` (after `style`, ~line 32)
- Create: `backend/apps/tenant_config/migrations/0027_tenantconfig_palette.py`
- Modify: `backend/apps/tenant_config/serializers.py` (`TenantConfigSerializer`: fields list ~line 189, add `validate`)
- Modify: `frontend-customer/src/types/tenant.ts` (~line 178)
- Modify: `frontend-customer/src/lib/site-styles.ts`
- Modify: `frontend-customer/src/components/shared/tenant-theme-style.tsx`
- Modify: `frontend-customer/src/app/design-showcase/page.tsx`
- Test: `backend/apps/tenant_config/tests/test_sections.py`, `frontend-customer/src/lib/__tests__/site-styles.test.ts` (new)

**Interfaces:**
- Consumes: `sections.palettes()` (Task 1), `SiteStyle.palettes` (Task 1).
- Produces: `TenantConfig.palette: str` ("" = the style's own), exposed as `palette` on `/api/v1/tenant-config/`; `paletteOf(style, paletteId?) -> SiteStylePalette`; `styleVars(style, paletteId?)`, `styleScope(style, paletteId?)`, `styleRootCss(style, extraCss?, paletteId?)`.

- [ ] **Step 1: Write the failing backend serializer tests**

Append to `backend/apps/tenant_config/tests/test_sections.py`:

```python
def test_palette_must_belong_to_the_style():
    from apps.tenant_config.serializers import TenantConfigSerializer

    assert TenantConfigSerializer(data={"style": "journal", "palette": "sage"}, partial=True).is_valid()
    bad = TenantConfigSerializer(data={"style": "journal", "palette": "mint"}, partial=True)
    assert not bad.is_valid() and "palette" in bad.errors


@pytest.mark.django_db
def test_patching_style_alone_clears_a_stale_palette(tenant_ctx):
    """Review focus 1: the copilot and the admin page change style without
    touching palette; a palette from the old style must not block the save."""
    from apps.tenant_config.models import TenantConfig
    from apps.tenant_config.serializers import TenantConfigSerializer

    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.style, cfg.palette = "journal", "sage"
    cfg.save()
    ser = TenantConfigSerializer(cfg, data={"style": "grid"}, partial=True)
    assert ser.is_valid(), ser.errors
    assert ser.validated_data["palette"] == ""
```

- [ ] **Step 2: Write the failing frontend test**

Create `frontend-customer/src/lib/__tests__/site-styles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SITE_STYLES, paletteOf, styleVars } from "@/lib/site-styles";

describe("paletteOf", () => {
  const journal = SITE_STYLES.journal;
  it("is the style's own palette by default and for an unknown id", () => {
    expect(paletteOf(journal)).toBe(journal.palette);
    expect(paletteOf(journal, "")).toBe(journal.palette);
    expect(paletteOf(journal, "mint")).toBe(journal.palette);
  });
  it("swaps in an alternative colourway, keeping the style's type", () => {
    const sage = journal.palettes.find((p) => p.id === "sage")!;
    expect(paletteOf(journal, "sage")).toBe(sage.palette);
    const vars = styleVars(journal, "sage");
    expect(vars.primary).toBe(sage.palette.primary);
    expect(vars.inverse).toBe(sage.palette.inverse);
    expect(vars["font-display"]).toBe(styleVars(journal)["font-display"]);
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `make test-app APP=tenant_config` → FAIL (`palette` not a serializer field).
Run: `cd frontend-customer && npx vitest run src/lib/__tests__/site-styles.test.ts` → FAIL (`paletteOf` is not exported).

- [ ] **Step 4: Model field and migration**

In `backend/apps/tenant_config/models.py`, directly after the `style = models.CharField(...)` line:

```python
    # Alternative colourway of ``style`` (its "palettes" in the manifest);
    # "" = the style's own palette. Ignored when it does not belong to ``style``.
    palette = models.CharField(max_length=40, blank=True, default="")
```

Create `backend/apps/tenant_config/migrations/0027_tenantconfig_palette.py`:

```python
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenant_config", "0026_tenantconfig_setup_flow"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenantconfig",
            name="palette",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
    ]
```

Run: `make migrate` (dev stack up) — expected: applies `0027` on every schema. Then `make test-fresh` once (new migration → rebuild the test DB).

- [ ] **Step 5: Serializer field + cross-field validation**

In `TenantConfigSerializer.Meta.fields`, add `"palette",` directly after `"style",`.

Add this method next to `validate_style`:

```python
    def validate(self, attrs):
        attrs = super().validate(attrs)
        current = self.instance
        style = attrs.get("style", getattr(current, "style", ""))
        if "palette" in attrs:
            if attrs["palette"] and attrs["palette"] not in sections.palettes(style):
                raise serializers.ValidationError({"palette": "Palette must be one of the style's palettes."})
        elif "style" in attrs and getattr(current, "palette", "") not in sections.palettes(style):
            attrs["palette"] = ""  # a style switch drops a colourway the new style does not have
        return attrs
```

- [ ] **Step 6: Frontend type and palette-aware style helpers**

`frontend-customer/src/types/tenant.ts`, after the `style?: string;` line:

```ts
  /** Alternative colourway of `style` ("" = the style's own palette). */
  palette?: string;
```

`frontend-customer/src/lib/site-styles.ts`: change the import line to also bring the palette type, add `paletteOf`, and thread `paletteId` through:

```ts
import type { SiteStyle, SiteStylePalette } from "@shared/sections/types";

/** The palette a site wears: the style's own, or one of its alternatives.
 *  An id the style does not have (e.g. left over from a style switch) means
 *  the style's own. */
export function paletteOf(
  style: SiteStyle,
  paletteId?: string | null,
): SiteStylePalette {
  return (
    style.palettes?.find((p) => paletteId && p.id === paletteId)?.palette ??
    style.palette
  );
}
```

Then:
- `export function styleVars(style: SiteStyle, paletteId?: string | null)` and replace `const p = style.palette;` with `const p = paletteOf(style, paletteId);`.
- `export function styleScope(style: SiteStyle, paletteId?: string | null)` and call `styleVars(style, paletteId)`.
- `export function styleRootCss(style: SiteStyle, extraCss = "", paletteId?: string | null)` and call `styleVars(style, paletteId)`.

`tenant-theme-style.tsx`: `styleRootCss(siteStyle, config.custom_css || "", config.palette)`.

`design-showcase/page.tsx`: `<div style={styleScope(style, sp.palette)} ...>` and, in the toolbar after the style links, palette links so each colourway can be eyeballed:

```tsx
          <span className="mx-2 opacity-30">|</span>
          {[{ id: "", label: style.paletteLabel }, ...style.palettes].map((p) => (
            <a
              key={p.id || "own"}
              href={`?style=${style.id}&palette=${p.id}${sp.page ? `&page=${sp.page}` : ""}`}
              className={(sp.palette ?? "") === p.id ? "underline" : "opacity-60"}
            >
              {p.label}
            </a>
          ))}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `make test-app APP=tenant_config` → PASS.
Run: `cd frontend-customer && npx vitest run` → PASS.
Run: `make typecheck` → clean.

- [ ] **Step 8: Regenerate the API types and commit**

Run (dev stack up): `cd frontend-customer && npm run gen:api` and `git diff src/types/api-generated.ts` — only a `palette` property may appear.

```bash
git add backend/apps/tenant_config/models.py backend/apps/tenant_config/migrations/0027_tenantconfig_palette.py backend/apps/tenant_config/serializers.py backend/apps/tenant_config/tests/test_sections.py frontend-customer/src/types/tenant.ts frontend-customer/src/types/api-generated.ts frontend-customer/src/lib/site-styles.ts frontend-customer/src/lib/__tests__/site-styles.test.ts frontend-customer/src/components/shared/tenant-theme-style.tsx frontend-customer/src/app/design-showcase/page.tsx
git commit -m "feat(tenant-config): palette field picks a style's alternative colourway"
```

---

### Task 3: The interview offers 12 looks and applies a palette

**Files:**
- Modify: `backend/apps/tenant_config/interview_milestones.py` (`style_cards`, `apply_style`, `choose`)
- Test: `backend/apps/tenant_config/tests/test_interview_milestones.py`

**Interfaces:**
- Consumes: `sections.looks()`, `sections.parse_look()`, `sections.enabled_styles()` (Task 1); `TenantConfig.palette` (Task 2).
- Produces: `style_cards(answers)["options"]` = 12 `{value, style, palette, label, detail, recommended?}` with the recommended style's three looks first; `choose(tenant, answers, "site_style", "<style>[:<palette>]")` sets `answers["site_style"]` (the look value), `answers["style"]`, `answers["palette"]` and `apply_style(tenant, style_id, palette="")`.

- [ ] **Step 1: Update the tests to the new contract**

In `test_interview_milestones.py`, replace `test_style_cards_lead_with_the_niche_pick` with:

```python
def test_style_cards_offer_every_look_with_the_niche_style_first():
    cards = ms.style_cards({"niche": "fitness"})
    assert cards["kind"] == "style" and len(cards["options"]) == 12
    assert [o["style"] for o in cards["options"][:3]] == ["kinetic"] * 3
    assert cards["options"][0]["value"] == "kinetic" and cards["options"][0]["recommended"] is True
    assert cards["options"][1]["value"] == "kinetic:ocean" and "recommended" not in cards["options"][1]
    assert all({"value", "style", "palette", "label", "detail"} <= set(o) for o in cards["options"])
```

Extend `test_choose_style_validates_and_applies` by appending:

```python
    ms.choose(tenant_ctx, answers, "site_style", "journal:sage")
    cfg = TenantConfig.objects.first()
    assert (cfg.style, cfg.palette) == ("journal", "sage")
    assert (answers["site_style"], answers["style"], answers["palette"]) == ("journal:sage", "journal", "sage")
    with pytest.raises(ms.ChoiceError):
        ms.choose(tenant_ctx, answers, "site_style", "journal:mint")
    ms.choose(tenant_ctx, answers, "site_style", "grid")
    assert TenantConfig.objects.first().palette == "" and answers["palette"] == ""
```

- [ ] **Step 2: Run to verify they fail**

Run: `make test-app APP=tenant_config` → the two tests FAIL (`len == 4`, `cfg.palette == ""`).

- [ ] **Step 3: Implement**

Replace `style_cards` in `interview_milestones.py`:

```python
def style_cards(answers: dict) -> dict:
    """Every look (style × palette), the niche's style first; its own
    palette is the guide's pick."""
    from apps.core.onboarding.wizard_catalog import recommended_style

    from . import sections

    first = recommended_style(answers.get("niche") or "general")
    looks = sorted(sections.looks(), key=lambda o: o["style"] != first)
    return {
        "kind": "style",
        "options": [{**o, **({"recommended": True} if o["value"] == first else {})} for o in looks],
    }
```

Change `apply_style`'s signature and body:

```python
def apply_style(tenant, style_id: str, palette: str = "") -> None:
    """Same effect as the copilot's edit_style: every block takes the style's
    layout (no AI), the colourway is set, and the `look` publish blocker clears."""
    from . import sections

    with transaction.atomic():
        cfg = TenantConfig.objects.select_for_update().first()
        cfg.style = style_id
        cfg.palette = palette
        cfg.pages = sections.restyle_pages(cfg.pages or {}, style_id)
        cfg.setup_progress = {**(cfg.setup_progress or {}), "look_edited": True}
        cfg.save(update_fields=["style", "palette", "pages", "setup_progress"])
    _bust(tenant)
```

Replace the `if field_id == "site_style":` branch in `choose` (the non-delegate one):

```python
    if field_id == "site_style":
        look = sections.parse_look(value)
        if look is None or look[0] not in sections.enabled_styles():
            raise ChoiceError("unknown_style")
        style_id, palette = look
        answers["site_style"] = str(value)
        answers["style"] = style_id
        answers["palette"] = palette
        apply_style(tenant, style_id, palette)
        return
```

(The delegate branch keeps `apply_style(tenant, recommended_style(...))`: palette "".)

- [ ] **Step 4: Run to verify they pass**

Run: `make test-app APP=tenant_config` → PASS (including `test_interview.py`, whose `test_card_fields_are_asked_by_code_not_ai` still expects `site_style`).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/interview_milestones.py backend/apps/tenant_config/tests/test_interview_milestones.py
git commit -m "feat(setup): the look question offers all 12 looks; a pick applies style and palette"
```

---

### Task 4: Icons and hints on every answer (backend)

**Files:**
- Modify: `backend/apps/tenant_config/interview_brief.py` (`Field`, `FIELDS`, new `ICONS`)
- Modify: `backend/apps/tenant_config/interview.py` (`SYSTEM`, `InterviewTurn`, `guide_for`, `_user_turn`, `run_turn`, `interview_state`)
- Test: `backend/apps/tenant_config/tests/test_interview_brief.py`, `backend/apps/tenant_config/tests/test_interview.py`

**Interfaces:**
- Produces: `brief.ICONS: tuple[str, ...]` (lucide kebab ids); `Field.icons`, `Field.hints` parallel to `Field.options`; `InterviewTurn.icons: list[str]`; `guide_for(field, ack="", question="", options=None, icons=None)`; every guide dict gains `"icons": {option: icon_id}` and `"hints": {option: text}` (both may be `{}`).

- [ ] **Step 1: Write the failing tests**

Append to `test_interview_brief.py`:

```python
def test_field_icons_and_hints_line_up_with_options():
    for f in brief.FIELDS:
        assert len(f.icons) in (0, len(f.options)), f.id
        assert len(f.hints) in (0, len(f.options)), f.id
        assert set(f.icons) <= set(brief.ICONS), f.id
    assert brief.FIELD_BY_ID["teaches"].icons[0] == "flower-2"
    assert brief.FIELD_BY_ID["tone"].hints[0].startswith("Come as you are")
    assert len(set(brief.ICONS)) == len(brief.ICONS)  # no duplicates
```

Append to `test_interview.py`:

```python
def test_fixed_options_carry_icons_and_hints(client, tenant_ctx):
    from apps.tenant_config import interview_brief as brief

    with mock.patch("apps.tenant_config.interview_milestones.cards_for", return_value=None):
        guide = client.get("/api/v1/admin/setup-flow/").json()["interview"]["guide"]
    assert guide["icons"]["Yoga"] == "flower-2" and len(guide["icons"]) == len(guide["options"])
    assert guide["hints"] == {}
    tone = interview.guide_for(brief.FIELD_BY_ID["tone"])
    assert tone["icons"]["Warm"] == "heart" and tone["hints"]["Warm"].startswith("Come as you are")
    offers = interview.guide_for(brief.FIELD_BY_ID["offers"], options=["AI made-up"], icons=["star"])
    assert offers["icons"]["Courses"] == "book-open"  # the fixed offer list keeps its own icons
    assert interview.guide_for(None)["icons"] == {} and interview.guide_for(None)["hints"] == {}


def test_ai_icons_are_matched_to_options_and_filtered(client, tenant_ctx, quiet):
    """Review focus 3: fewer or bogus icons never break the guide."""
    quiet.reply = interview.InterviewTurn(
        next_field="audience",
        question="Who?",
        options=["Parents", "Runners", "Desk workers"],
        icons=["baby", "not-an-icon"],
    )
    guide = client.post(URL, {"message": "Yoga"}, format="json").json()["guide"]
    assert guide["icons"] == {"Parents": "baby"} and guide["hints"] == {}
    assert '"icons"' in quiet.calls[0]["user"]  # the allowlist rides every turn
    flow = TenantConfig.objects.first().setup_flow
    assert interview.interview_state(tenant_ctx, flow)["guide"]["icons"] == {"Parents": "baby"}  # survives a reload
```

- [ ] **Step 2: Run to verify they fail**

Run: `make test-app APP=tenant_config` → FAIL (`Field` has no attribute `icons`; `InterviewTurn` rejects `icons`).

- [ ] **Step 3: Allowlist, field icons and hints in `interview_brief.py`**

After `TONES = (...)`:

```python
# Lucide icon ids a tile may show (frontend: src/lib/option-icons.ts mirrors
# this list). The model picks one per AI-written option; fixed fields carry
# their own below. Unknown ids are dropped, never shown.
ICONS = (
    "activity", "apple", "armchair", "baby", "badge-check", "badge-dollar-sign", "bed-double", "bike",
    "book-open", "brain", "briefcase", "building-2", "calendar", "calendar-days", "camera", "chef-hat",
    "circle-help", "clock", "coffee", "coins", "compass", "crown", "dumbbell", "feather", "flame",
    "flower-2", "footprints", "feather", "gem", "gift", "glasses", "globe", "graduation-cap", "guitar",
    "hand", "hand-heart", "headphones", "heart", "heart-pulse", "home", "hourglass", "infinity",
    "instagram", "languages", "laptop", "layers", "layout-grid", "leaf", "lightbulb", "list-checks",
    "lock-open", "mail", "map-pin", "megaphone", "message-circle", "mic", "moon", "mountain", "music",
    "newspaper", "paintbrush", "palette", "pen-line", "person-standing", "phone", "piggy-bank", "repeat",
    "rocket", "salad", "school", "scissors", "shield", "shirt", "smile", "sparkles", "sprout", "star",
    "stethoscope", "store", "sun", "sun-medium", "sunrise", "sunset", "target", "ticket", "timer", "trees",
    "trophy", "type", "user-round", "users", "users-round", "video", "wallet", "waves", "wind", "zap",
)
```

(Remove the duplicated `"feather"` so the no-duplicates assertion holds: keep it once.)

In `Field` add two attributes after `multi`:

```python
    icons: tuple[str, ...] = ()  # one lucide id per option (fixed-option fields)
    hints: tuple[str, ...] = ()  # one short line per option, shown under it
```

Add `icons=` / `hints=` to the fixed-option fields in `FIELDS` (each tuple exactly as long as that field's `options`):

```python
# teaches (16)
icons=("flower-2", "person-standing", "dumbbell", "brain", "music", "sparkles", "zap", "smile",
       "paintbrush", "salad", "compass", "briefcase", "languages", "guitar", "palette", "chef-hat"),
# audience (5)
icons=("sprout", "briefcase", "heart-pulse", "baby", "glasses"),
# offers (6)
icons=("book-open", "video", "map-pin", "newspaper", "users", "badge-check"),
# tone (5)
icons=("heart", "zap", "leaf", "graduation-cap", "smile"),
hints=(
    "Come as you are. We'll take it slow.",
    "Let's go. Today counts.",
    "Breathe in. There's no rush here.",
    "Twelve years of teaching, distilled.",
    "Yes, you can wear socks.",
),
# course_format (4)
icons=("calendar-days", "ticket", "infinity", "sunrise"),
hints=("A weekly rhythm that's easy to keep", "Two days, all in", "Start any time, go at their pace", "Ten minutes a day"),
# course_level (4)
icons=("sprout", "trees", "mountain", "users"),
# sells (2)
icons=("coins", "gift"),
hints=("Set a price; students pay by card", "Everything free now, prices later"),
# live_when (5)
icons=("sunrise", "coffee", "sunset", "calendar", "sun"),
# contact (5)
icons=("mail", "instagram", "message-circle", "phone", "pen-line"),
```

- [ ] **Step 4: Model output, prompt and `guide_for` in `interview.py`**

`InterviewTurn`: add `icons: list[str] = []` after `options`.

`SYSTEM`, inside point 3 after the `options:` bullet, add:

```
   - icons: one icon id per option, in the same order, chosen from "icons" in the message: the
     best visual hint for that answer (repeat an id when nothing fits better).
```

`_user_turn`: add `"icons": list(brief.ICONS),` to the JSON (after `"fields"`).

Replace `guide_for`:

```python
def guide_for(field: brief.Field | None, ack: str = "", question: str = "", options=None, icons=None) -> dict:
    if field is None:
        return {
            "ack": ack[:300],
            "question": READY_QUESTION,
            "options": [],
            "field": None,
            "can_delegate": False,
            "multi": False,
            "icons": {},
            "hints": {},
        }
    # The offers chips are the fixed offer list the answer is parsed against.
    fixed = options is None or field.kind == "offers"
    chosen = [str(o)[:60] for o in (field.options if fixed else options)][:MAX_OPTIONS]
    names = field.icons if fixed else [str(i) for i in (icons or [])]
    return {
        "ack": ack[:300],
        "question": (question or field.question)[:300],
        "options": chosen,
        "field": field.id,
        "can_delegate": True,
        "multi": field.multi,
        "icons": {o: i for o, i in zip(chosen, names, strict=False) if i in brief.ICONS},
        "hints": dict(zip(chosen, field.hints, strict=False)) if fixed else {},
    }
```

`run_turn`: the AI branch becomes `guide = guide_for(nxt, turn.ack, turn.question, turn.options, turn.icons)`.

`interview_state`: the reconstructed guide tuple becomes
`("ack", "question", "options", "field", "can_delegate", "multi", "icons", "hints")` and, so a transcript written before this change still renders, follow it with `guide["icons"] = guide.get("icons") or {}` and `guide["hints"] = guide.get("hints") or {}`.

- [ ] **Step 5: Run to verify they pass**

Run: `make test-app APP=tenant_config` → PASS. Also `make lint` (ruff line length: wrap the `ICONS` tuple as shown, one group per line).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/tenant_config/interview_brief.py backend/apps/tenant_config/interview.py backend/apps/tenant_config/tests/test_interview_brief.py backend/apps/tenant_config/tests/test_interview.py
git commit -m "feat(setup): every answer tile gets an icon; fixed questions get hints"
```

---

### Task 5: Frontend contract — types, icon map, transcript helpers, dev mock

**Files:**
- Modify: `frontend-customer/src/lib/setup-flow.ts` (`GuideTurn`, `LookOption`)
- Modify: `frontend-customer/src/lib/interview.ts` (`questionSteps`)
- Create: `frontend-customer/src/lib/option-icons.ts`
- Modify: `frontend-customer/src/components/setup-flow/mock.ts`
- Test: `frontend-customer/src/lib/__tests__/interview.test.ts`, `frontend-customer/src/lib/__tests__/option-icons.test.ts` (new)

**Interfaces:**
- Consumes: the guide shape from Task 4 (`icons`, `hints`), look options from Task 3 (`style`, `palette`).
- Produces: `GuideTurn.icons?: Record<string, string>`, `GuideTurn.hints?: Record<string, string>`; `LookOption.style?: string`, `LookOption.palette?: string`; `OPTION_ICONS: Record<string, LucideIcon>`; `questionSteps` keeps `icons`/`hints` on each step.

- [ ] **Step 1: Write the failing tests**

In `interview.test.ts`, inside `describe("questionSteps", ...)`:

```ts
  it("keeps icons and hints on a question", () => {
    const g: GuideTurn = {
      ...ask("tone"),
      icons: { A: "heart" },
      hints: { A: "Come as you are." },
    };
    const steps = questionSteps([{ role: "guide", ...g }], g);
    expect(steps[0].icons).toEqual({ A: "heart" });
    expect(steps[0].hints).toEqual({ A: "Come as you are." });
  });
```

Create `src/lib/__tests__/option-icons.test.ts` (a cross-language contract test: the backend allowlist is the source of truth):

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OPTION_ICONS } from "@/lib/option-icons";

const PY = path.resolve(
  __dirname,
  "../../../../backend/apps/tenant_config/interview_brief.py",
);

describe("OPTION_ICONS", () => {
  it("covers every icon id the backend may send", () => {
    const src = readFileSync(PY, "utf8");
    const block = src.slice(src.indexOf("ICONS = ("), src.indexOf("\n)\n", src.indexOf("ICONS = (")));
    const ids = [...block.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(50);
    const missing = ids.filter((id) => !(id in OPTION_ICONS));
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend-customer && npx vitest run` → FAIL (`icons` not on the step; module `@/lib/option-icons` missing).

- [ ] **Step 3: Types**

`setup-flow.ts`, in `GuideTurn` after `multi?: boolean;`:

```ts
  /** Lucide icon id per option (only options that have one). */
  icons?: Record<string, string>;
  /** One short line per option, shown under it (fixed questions only). */
  hints?: Record<string, string>;
```

In `LookOption` after `image_url?: string;`:

```ts
  /** Looks: the section style and its colourway ("" = the style's own). */
  style?: string;
  palette?: string;
```

- [ ] **Step 4: Carry icons/hints through the transcript**

In `interview.ts` `questionSteps`, the guide branch destructures and stores them:

```ts
        const { ack, question, options, field, can_delegate, multi, icons, hints } = e;
        const answer = asked.get(e.field)?.answer;
        asked.set(e.field, {
          ack,
          question,
          options,
          field,
          can_delegate,
          multi,
          icons,
          hints,
          answer,
        });
```

- [ ] **Step 5: The icon map**

Create `src/lib/option-icons.ts` (no JSX, so it stays a pure-logic module):

```ts
import {
  Activity, Apple, Armchair, Baby, BadgeCheck, BadgeDollarSign, BedDouble, Bike, BookOpen, Brain,
  Briefcase, Building2, Calendar, CalendarDays, Camera, ChefHat, CircleHelp, Clock, Coffee, Coins,
  Compass, Crown, Dumbbell, Feather, Flame, Flower2, Footprints, Gem, Gift, Glasses, Globe,
  GraduationCap, Guitar, Hand, HandHeart, Headphones, Heart, HeartPulse, Home, Hourglass, Infinity,
  Instagram, Languages, Laptop, Layers, LayoutGrid, Leaf, Lightbulb, ListChecks, LockOpen, Mail,
  MapPin, Megaphone, MessageCircle, Mic, Moon, Mountain, Music, Newspaper, Paintbrush, Palette,
  PenLine, PersonStanding, Phone, PiggyBank, Repeat, Rocket, Salad, School, Scissors, Shield, Shirt,
  Smile, Sparkles, Sprout, Star, Stethoscope, Store, Sun, SunMedium, Sunrise, Sunset, Target, Ticket,
  Timer, Trees, Trophy, Type, UserRound, Users, UsersRound, Video, Wallet, Waves, Wind, Zap,
  type LucideIcon,
} from "lucide-react";

/** Icon ids the guide may send on an answer (mirrors ICONS in
 *  backend/apps/tenant_config/interview_brief.py; a vitest checks it). */
export const OPTION_ICONS: Record<string, LucideIcon> = {
  activity: Activity, apple: Apple, armchair: Armchair, baby: Baby, "badge-check": BadgeCheck,
  "badge-dollar-sign": BadgeDollarSign, "bed-double": BedDouble, bike: Bike, "book-open": BookOpen,
  brain: Brain, briefcase: Briefcase, "building-2": Building2, calendar: Calendar,
  "calendar-days": CalendarDays, camera: Camera, "chef-hat": ChefHat, "circle-help": CircleHelp,
  clock: Clock, coffee: Coffee, coins: Coins, compass: Compass, crown: Crown, dumbbell: Dumbbell,
  feather: Feather, flame: Flame, "flower-2": Flower2, footprints: Footprints, gem: Gem, gift: Gift,
  glasses: Glasses, globe: Globe, "graduation-cap": GraduationCap, guitar: Guitar, hand: Hand,
  "hand-heart": HandHeart, headphones: Headphones, heart: Heart, "heart-pulse": HeartPulse, home: Home,
  hourglass: Hourglass, infinity: Infinity, instagram: Instagram, languages: Languages, laptop: Laptop,
  layers: Layers, "layout-grid": LayoutGrid, leaf: Leaf, lightbulb: Lightbulb, "list-checks": ListChecks,
  "lock-open": LockOpen, mail: Mail, "map-pin": MapPin, megaphone: Megaphone,
  "message-circle": MessageCircle, mic: Mic, moon: Moon, mountain: Mountain, music: Music,
  newspaper: Newspaper, paintbrush: Paintbrush, palette: Palette, "pen-line": PenLine,
  "person-standing": PersonStanding, phone: Phone, "piggy-bank": PiggyBank, repeat: Repeat,
  rocket: Rocket, salad: Salad, school: School, scissors: Scissors, shield: Shield, shirt: Shirt,
  smile: Smile, sparkles: Sparkles, sprout: Sprout, star: Star, stethoscope: Stethoscope, store: Store,
  sun: Sun, "sun-medium": SunMedium, sunrise: Sunrise, sunset: Sunset, target: Target, ticket: Ticket,
  timer: Timer, trees: Trees, trophy: Trophy, type: Type, "user-round": UserRound, users: Users,
  "users-round": UsersRound, video: Video, wallet: Wallet, waves: Waves, wind: Wind, zap: Zap,
};
```

(Prettier will reflow it; that is fine.)

- [ ] **Step 6: The dev mock speaks the new contract**

In `mock.ts`: import `SITE_STYLES` from `@/lib/site-styles`; give the first two script turns icons (`icons: { Yoga: "flower-2", Pilates: "person-standing", "Fitness coaching": "dumbbell" }` and `icons: { "Complete beginners": "sprout", "Busy professionals": "briefcase" }`); replace the style turn's `cards` with every look:

```ts
    cards: {
      kind: "style",
      options: Object.values(SITE_STYLES).flatMap((s, i) => [
        {
          value: s.id,
          style: s.id,
          palette: "",
          label: `${s.label} · ${s.paletteLabel}`,
          detail: s.mood,
          ...(i === 0 ? { recommended: true } : {}),
        },
        ...s.palettes.map((p) => ({
          value: `${s.id}:${p.id}`,
          style: s.id,
          palette: p.id,
          label: `${s.label} · ${p.label}`,
          detail: p.mood,
        })),
      ]),
    },
```

- [ ] **Step 7: Run to verify they pass**

Run: `cd frontend-customer && npx vitest run` → PASS. `make typecheck` → clean.

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/lib/setup-flow.ts frontend-customer/src/lib/interview.ts frontend-customer/src/lib/option-icons.ts frontend-customer/src/lib/__tests__/interview.test.ts frontend-customer/src/lib/__tests__/option-icons.test.ts frontend-customer/src/components/setup-flow/mock.ts
git commit -m "feat(setup): frontend contract for answer icons, hints and looks"
```

---

### Task 6: The look gallery — 12 live-rendered tiles

**Files:**
- Create: `frontend-customer/src/components/setup-flow/look-tile.tsx`
- Modify: `frontend-customer/src/components/setup-flow/look-cards.tsx`
- Modify: `frontend-customer/src/components/setup-flow/question-screen.tsx` (the `<LookCardsView … />` call)
- Modify: `frontend-customer/src/components/setup-flow/setup-flow.tsx` (pass `brandName` to `QuestionScreen`)

**Interfaces:**
- Consumes: `STYLE_SECTIONS` (`@/components/sections/registry`), `fixtureBlock`/`fixtureData` (`@/components/sections/fixtures`), `getSiteStyle`/`styleScope`/`styleFontsHref` (`@/lib/site-styles`, Task 2), `LookOption.style/palette/recommended` (Task 5).
- Produces: `LookTile({ styleId, paletteId, brandName })`; `LookCardsView` gains props `brandName: string` and `current?: string` (the label of the look already picked); `QuestionScreen` gains `brandName: string`.

- [ ] **Step 1: The tile**

Create `look-tile.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { FamilyId } from "@shared/sections/types";
import { fixtureBlock, fixtureData } from "@/components/sections/fixtures";
import { STYLE_SECTIONS } from "@/components/sections/registry";
import { getSiteStyle, styleScope } from "@/lib/site-styles";

// The site's desktop layout width; the tile scales it down, the same way the
// preview frame scales the live page.
const PAGE_W = 1180;
const FAMILIES: FamilyId[] = ["hero", "benefits", "courseShowcase"];

/** One look as the top of a real home page in that style and colourway: the
 * style's own section layouts with fixture content and the coach's brand as
 * the kicker, scaled into the tile. A picture, not a page: inert. */
export function LookTile({
  styleId,
  paletteId,
  brandName,
}: {
  styleId: string;
  paletteId?: string;
  brandName: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const style = getSiteStyle(styleId);
  if (!style) return null;
  const layouts = STYLE_SECTIONS[styleId] ?? {};
  const page: CSSProperties = {
    ...(styleScope(style, paletteId) as CSSProperties),
    width: PAGE_W,
    transform: `scale(${w / PAGE_W})`,
    transformOrigin: "top left",
  };
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none aspect-[4/3] w-full select-none overflow-hidden"
    >
      {w > 0 && (
        <div style={page}>
          {FAMILIES.map((family) => {
            const variant = style.variants[family]?.[0];
            const Comp = variant ? layouts[family]?.[variant] : undefined;
            if (!Comp || !variant) return null;
            const block = fixtureBlock(family, `${styleId}.${variant}`, "short");
            if (family === "hero" && brandName) block.kicker = brandName;
            return (
              <Comp
                key={family}
                block={block}
                data={fixtureData(family, "short")}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: The gallery**

In `look-cards.tsx`: add imports `import type { SiteStyle } from "@shared/sections/types";`, `import { getSiteStyle, styleFontsHref } from "@/lib/site-styles";`, `import { LookTile } from "./look-tile";`, `import { Check } from "lucide-react";`. Add `brandName: string;` and `current?: string;` to the props. Replace the `if (shown.kind === "style") { … }` block with:

```tsx
  if (shown.kind === "style") {
    const styles = [...new Set(shown.options.map((o) => o.style ?? o.value))]
      .map((id) => getSiteStyle(id))
      .filter((s): s is SiteStyle => !!s);
    return (
      <div className="mt-8">
        {styles.map((s) => (
          <link key={s.id} rel="stylesheet" href={styleFontsHref(s)} />
        ))}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
          {shown.options.map((o, i) => {
            const on = !!current && o.label === current;
            return (
              <button
                key={o.value}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => onPick(o.value, o.label)}
                style={{ animationDelay: `${Math.min(i, 15) * 30}ms` }}
                className={cn(
                  "group overflow-hidden rounded-2xl border bg-white text-left",
                  "transition-[border-color,box-shadow,transform] duration-200 motion-safe:animate-[sf-rise_.4s_ease-out_both] motion-safe:hover:-translate-y-0.5",
                  "hover:border-[var(--sf-line-strong)] hover:shadow-[0_14px_32px_-18px_rgb(48_36_20/0.5)] disabled:pointer-events-none disabled:opacity-60",
                  on ? "border-[var(--sf-ink)] ring-2 ring-[var(--sf-ink)]" : "border-[var(--sf-line)]",
                )}
              >
                <LookTile
                  styleId={o.style ?? o.value}
                  paletteId={o.palette}
                  brandName={brandName}
                />
                <span className="flex items-center justify-between gap-2 border-t border-[var(--sf-line)] px-3.5 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">
                      {o.label}
                    </span>
                    {o.detail && (
                      <span className="block truncate text-[12px] text-[var(--sf-graphite)]">
                        {o.detail}
                      </span>
                    )}
                  </span>
                  {on ? (
                    <Check className="size-4 shrink-0" aria-hidden />
                  ) : (
                    o.recommended && (
                      <span className="shrink-0 rounded-full bg-[var(--sf-brass-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--sf-brass)]">
                        Suggested
                      </span>
                    )
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }
```

Also enlarge the logo branch so it fills the slide: its wrapper `mt-3` → `mt-8`, grid `grid-cols-2 gap-2 sm:grid-cols-4` → `grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4`, and the `CardButton` gets `rounded-2xl` instead of `rounded-xl`.

- [ ] **Step 3: Thread `brandName` and `current` down**

`question-screen.tsx`: add `brandName: string;` to the props; the `<LookCardsView … />` call gains `brandName={brandName}` and `current={step.answer}`. Also drop the `live &&` guard on that call (`{step.cards && step.field && (…)}`) so a coach who goes back to the look question sees the gallery with their pick highlighted.

`setup-flow.tsx`: the `<QuestionScreen … />` call gains `brandName={brandName}`.

- [ ] **Step 4: Verify in the dev stack**

Run: `make typecheck` and `make lint` → clean (no raw spinners added; `animate-[sf-rise…]` is `motion-safe:`-gated).

Open the browser pane at `http://demo-yoga.localhost/setup?mock=1` logged in as the coach (memory `reference-browser-pane-coach-login` has the login recipe). Answer two questions; the third slide must show 12 tiles, each a recognisably different site top with "Demo Yoga" as the hero kicker, the first badged "Suggested". Click one: the mock advances. Press the back arrow: the gallery shows with that tile ticked.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/components/setup-flow/look-tile.tsx frontend-customer/src/components/setup-flow/look-cards.tsx frontend-customer/src/components/setup-flow/question-screen.tsx frontend-customer/src/components/setup-flow/setup-flow.tsx
git commit -m "feat(setup): the look question is a gallery of 12 live-rendered looks"
```

---

### Task 7: Slides — icon tiles, hints, full-screen grid, directional transitions, arrow keys

**Files:**
- Modify: `frontend-customer/src/components/setup-flow/tokens.ts` (`SHELL_CSS`)
- Modify: `frontend-customer/src/components/setup-flow/question-screen.tsx`
- Modify: `frontend-customer/src/components/setup-flow/setup-flow.tsx`

**Interfaces:**
- Consumes: `OPTION_ICONS` (Task 5), `step.icons`/`step.hints` (Task 5).
- Produces: `QuestionScreen` prop `dir: "next" | "back"`; `Flow` state `dir` set by every navigation.

- [ ] **Step 1: Slide keyframes**

Append to `SHELL_CSS` in `tokens.ts` (before the `.sf-shell` rules):

```
@keyframes sf-slide-next { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: none; } }
@keyframes sf-slide-back { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: none; } }
```

- [ ] **Step 2: Icon + hint tiles and the slide animation in `question-screen.tsx`**

Add `import { OPTION_ICONS } from "@/lib/option-icons";` and the prop `dir: "next" | "back";`.

Replace the inner wrapper's class `motion-safe:animate-[sf-rise_.45s_ease-out_both]` with:

```tsx
            className={
              dir === "back"
                ? "motion-safe:animate-[sf-slide-back_.45s_ease-out_both]"
                : "motion-safe:animate-[sf-slide-next_.45s_ease-out_both]"
            }
```

Widen the slide: the container `max-w-[1120px]` → `max-w-[1280px]` (both occurrences).

Replace the option `<button …>` body with an icon + label + hint layout (keep the `key`, `aria-pressed`, `disabled`, `onClick`, `style` and the outer class list; change `min-h-[68px] items-center` to `min-h-[84px] flex-col justify-center gap-1.5` and `px-4 py-3` to `px-4 py-3.5`):

```tsx
                    {(() => {
                      const Icon = step.icons?.[o]
                        ? OPTION_ICONS[step.icons[o]]
                        : undefined;
                      return (
                        Icon && (
                          <Icon
                            aria-hidden
                            className={cn(
                              "size-5 shrink-0",
                              on
                                ? "text-[var(--sf-paper)]"
                                : "text-[var(--sf-brass)]",
                            )}
                          />
                        )
                      );
                    })()}
                    <span className={cn("leading-snug", multi && "pr-7")}>
                      {o}
                    </span>
                    {step.hints?.[o] && (
                      <span
                        className={cn(
                          "text-[12.5px] font-normal leading-snug",
                          on ? "opacity-75" : "text-[var(--sf-graphite)]",
                        )}
                      >
                        {step.hints[o]}
                      </span>
                    )}
```

(Keep the existing multi-select tick `<span aria-hidden …>` after it.)

- [ ] **Step 3: Direction state and arrow keys in `setup-flow.tsx`**

In `Flow`, next to `const [at, setAt] = …`:

```tsx
  const [dir, setDir] = useState<"next" | "back">("next");
  const goBack = () => {
    setDir("back");
    setAt(index - 1);
  };
  const goNext = () => {
    setDir("next");
    setAt(index + 1 >= steps.length - 1 ? null : index + 1);
  };
```

Use `goBack` / `goNext` as the two `NavButton` `onClick`s. In `send`'s success path, before `setAt(null)`, add `setDir("next")`.

Add, after the Escape-closes-preview effect:

```tsx
  // Slides: ← and → move between questions when nothing is being typed.
  useEffect(() => {
    if (golive || previewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (sending || t?.closest("textarea, input, [contenteditable]")) return;
      if (e.key === "ArrowLeft" && index > 0) goBack();
      if (e.key === "ArrowRight" && index < steps.length - 1) goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // goBack/goNext close over index and steps.length, listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [golive, previewOpen, sending, index, steps.length]);
```

Pass `dir={dir}` to `<QuestionScreen … />`.

- [ ] **Step 4: Verify in the dev stack**

`make typecheck`, `make lint` → clean. In the browser pane on `/setup?mock=1`: the first slide shows 3 tiles with icons; answering slides the next question in from the right; the back arrow (button or ←) slides the previous one in from the left; → returns. Focus the answer box and press ← : the caret moves, the slide does not.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/components/setup-flow/tokens.ts frontend-customer/src/components/setup-flow/question-screen.tsx frontend-customer/src/components/setup-flow/setup-flow.tsx
git commit -m "feat(setup): questions are slides with icon tiles, hints and arrow-key navigation"
```

---

### Task 8: Whole-feature verification

**Files:** none new.

- [ ] **Step 1: Targeted suites**

Run, one at a time: `make test-app APP=tenant_config`, `cd frontend-customer && npx vitest run`, `make typecheck`, `make lint`. All must be clean.

- [ ] **Step 2: Real backend walk-through**

In the browser pane, logged in as the demo-yoga coach, open `/setup` (no mock) on a tenant whose setup is still active (reset one with `make shell` → `python manage.py seed_dev_tenants --help` for the reset flag, or use the e2e-created tenant). Confirm: the first slide shows 16 niche tiles with icons; an AI-written question shows icons on its tiles; the look slide shows 12 tiles; picking `Quiet Journal · Sage` changes the preview (the "Preview your site" overlay) to sage greens within one reload; `GET /api/v1/tenant-config/` returns `"palette": "sage"`.

- [ ] **Step 3: Colourway eyeball**

Open `/design-showcase?style=<id>&palette=<pid>&page=home` for all 8 new palettes. Every section must stay readable (text on inverse bands, buttons on primary). Fix any value in the JSON, re-run `make sections-sync`, recommit.

- [ ] **Step 4: Review-focus checks 4 and 5**

Browser pane → `resize_window` preset `mobile` on `/setup?mock=1`: no horizontal scroll, tiles two abreast, "You decide" visible below the gallery. Reset to `desktop`.
Block `pix4less.com` and `fonts.googleapis.com` (devtools network conditions) and reload: tiles still show coloured layouts with placeholder image boxes.

- [ ] **Step 5: Diff-scoped suites**

`make test-changed` (preview with `PLAN=1` first), then `make e2e-changed` (runs `00-smoke` and `01-signup-onboarding`; the latter delegates every question and must still reach "Go to dashboard"). If `01` fails on a blank page or hang, read memory `reference-e2e-502-flakiness` before suspecting the code.

- [ ] **Step 6: Wiki, memory, hand-off**

`docs/wiki/` is regenerated by the post-commit hook; commit its diff with the final commit. Then follow the standing instruction in memory `feedback-always-commit-deploy-verify-prod` (commit → `make deploy` → verify on `https://demo-yoga.contentor.app/setup`), unless the user says otherwise at hand-off.

---

## Self-review

- **Coverage.** Question-by-question slides (Task 7), full-screen use (Task 7 width + Task 6 grid), 12 visual looks (Tasks 1, 3, 6), visuals on every answer (Tasks 4, 5, 7), more options on the logo slide (peer's `LOGO_PAGE = 15`, kept). Not done, by decision: hints on AI-written options, brand-new layout styles.
- **Placeholders.** None: every step carries its code; palette values, icon lists and hint copy are spelled out.
- **Type consistency.** `paletteOf/styleVars/styleScope/styleRootCss` signatures match between Task 2 (definition), Task 6 (`styleScope(style, paletteId)`) and `tenant-theme-style.tsx`. `guide_for(field, ack, question, options, icons)` matches its callers in `run_turn` and the tests. `LookCardsView` props `brandName`/`current` match the `question-screen.tsx` call; `QuestionScreen` props `brandName`/`dir` match `setup-flow.tsx`. Look value `"<style>[:<palette>]"` is produced by `sections.looks()`, parsed by `sections.parse_look()`, and built identically in `mock.ts`.
- **Review Focus.** 1 → Task 2 tests; 2 → Task 6 `current`; 3 → Task 4 test; 4 and 5 → Task 8 manual checks (no automated pin: both are visual).
