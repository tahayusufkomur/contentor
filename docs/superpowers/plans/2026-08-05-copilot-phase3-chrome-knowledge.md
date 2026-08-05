# Copilot Phase 3 — Chrome + Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the coach copilot theme/navbar powers (`edit_theme`, `edit_navbar`), ground its answers in the Ask Contentor platform knowledge base, and add a superadmin-configurable ask-cap knob (adminkit).

**Architecture:** Phases 1–2 (shipped, on `main`) built the whole loop: `engine.run_turn` returns `answer | ask | actions`, each action becomes a card with a single-use signed token, and `copilot_execute` runs the confirmed action. Phase 3 extends the same three seams as Phase 2 — the pydantic union + `_card` in `engine.py`, a new executor module (`chrome.py`) dispatched from `views._execute`, and two frontend `ActionKind` strings — plus two engine-level additions: the system prompt gains the platform KB (byte-stable, fingerprint-cached via `help_bot`), and `run_turn` enforces a per-conversation clarifying-question cap read from a new `CopilotSettings` singleton.

**Tech Stack:** Django 5.1 + DRF (backend `apps/core/copilot/`, `apps/tenant_config/`), pydantic via `apps/core/ai.py`, adminkit (`apps/adminkit` + `@shared/admin-kit`), Next.js 14 `frontend-customer` (vitest lib tests only) + `frontend-main` (superadmin sidebar), Playwright e2e.

**Design decisions (deviations/clarifications vs the spec, settled at planning time):**

1. **The spec's example theme "Midnight" does not exist.** The catalog is `TenantTheme` (`backend/apps/tenant_config/models.py:6-12`): `ocean, ember, forest, sunset, violet, slate`. `edit_theme` accepts exactly those six ids; unknown ids are refused at proposal time (dropped card → fallback answer). The light/dim/dark "mode" is a per-visitor client-side `next-themes` setting with no server field — out of scope.
2. **`edit_navbar` scope is layout and/or CTA** (the spec's "navbar layout/cta"), merged into the existing `navbar_config` so links and the other keys are preserved, then cleaned by the same `TenantConfigSerializer.validate_navbar_config` allowlist the admin PATCH uses.
3. **The ask-cap is a conversation-behavior knob, NOT metering.** Spec decision 3 defines it as a cap on clarifying questions per conversation; spec decision 4 forbids coach metering ("no quota checks"). So it is a platform-wide `CopilotSettings.max_asks_per_conversation` singleton (0 = uncapped, the default — today's behavior), enforced inside `run_turn` by steering the user turn and coercing an over-cap `ask` into an `answer`. It is NOT a `PlatformPlan` field, NOT a usage meter, and consumes nothing.
4. **KB grounding = system-prompt append, not user-turn injection.** The KB (~5.2k tokens: `help_kb.md` + `PlatformKbEntry` addenda) is platform-level and tenant-independent, so appending it to the system prompt keeps the "byte-identical across tenants" prompt-cache rule intact — bytes only change when a superadmin edits addenda, exactly like `help_bot`'s fingerprint-cached prompt. The module docstring's "module constant" wording is updated accordingly.
5. **`scripts/sync-admin-kit.sh` no longer exists** (deleted in `c42662d7`; admin-kit lives once in `packages/shared/src/admin-kit/`). Any older doc telling you to run it is stale — there is no mirroring step.

## Global Constraints

- No metering for the coach: no quota checks, no `record_update`, no upsell copy. Cost still lands via `ai_compose.record_spend` in `copilot_converse`'s `finally` (untouched).
- Nothing executes without a tap: proposals are cards backed by single-use tokens (`tokens.stash_action` / `take_action`); executors only run from `copilot_execute` after confirm.
- The system prompt stays **byte-identical across tenants** (prompt-cache rule). Tenant specifics ride in the user turn. The KB append (Task 6) is platform-level and fingerprint-cached, so it satisfies the rule.
- Both endpoints keep coach-JWT (`IsCoachOrOwner`, DRF default auth) — never clear `authentication_classes`.
- Theme/navbar writes MUST delete the config cache key `tenant:<schema>:config` (public pages read theme/navbar through `TenantConfigView.get_object`'s 300 s cache), and a theme change flips `setup_progress["look_edited"]` for Setup Assistant parity with `TenantConfigView.perform_update` (`backend/apps/tenant_config/views.py:93-123`).
- Never interpolate tenant state into a system prompt (`help_bot.py:4-10`, `copilot/engine.py:5-6`).
- Frontend: `useAsyncAction` for async handlers, sonner toasts for outcomes, `NavLink` from `@/components/ui/nav-link` (never raw `next/link`), i18n keys under `student.copilot` in `messages/{en,tr}/student.json`.
- Frontend unit tests are lib-only `.ts` under `src/**/__tests__/` (no React harness); components are covered by build + e2e.
- Verification gates: `make test-app APP=core`, `make test-app APP=tenant_config`, `cd frontend-customer && npm test && npm run build`, `cd frontend-main && npm run build` (Task 8 only), `make e2e-spec SPEC=29-copilot`, pre-commit clean. After the Task 8 migration: `make migrate`, and `make test-fresh` if the test DB predates it. Never commit without the step saying so.
- Backend test invocation: the repo runs pytest in the django container — `docker compose exec django python -m pytest <paths> -q` (or the scoped `make test-app APP=<app>`).

---

### Task 1: Chrome executors (`chrome.py`)

**Files:**
- Create: `backend/apps/core/copilot/chrome.py`
- Test: `backend/apps/core/tests/test_copilot_chrome.py`

**Interfaces:**
- Consumes: `TenantTheme` (`apps/tenant_config/models.py:6`), `TenantConfigSerializer.validate_navbar_config` + `_NAVBAR_LAYOUTS` (`apps/tenant_config/serializers.py:26,76-111`).
- Produces (used by Task 2's `_card` and Task 3's dispatch):
  - `ChromeOpError(Exception)` — user-safe refusal message (the analogue of `blocks.BlockOpError`)
  - `clean_theme(theme_id) -> str` — normalized valid theme id, or raises
  - `theme_label(theme_id) -> str` — human label ("Forest") for a valid id
  - `clean_layout(layout) -> str` — normalized valid navbar layout, or raises
  - `merge_navbar(current: dict, updates: dict) -> dict` — full cleaned navbar_config with `updates` overlaid on `current` (links etc. preserved), or raises

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_copilot_chrome.py`:

```python
"""Copilot chrome executors: pure validation/merge helpers behind
edit_theme / edit_navbar. Theme ids come from the TenantTheme catalog;
navbar updates are overlaid on the current config and cleaned by the same
serializer allowlist the admin config PATCH uses (links survive a
layout/cta change). DB writes happen in the execute view, not here."""

import pytest

from apps.core.copilot import chrome

pytestmark = pytest.mark.django_db


def test_clean_theme_normalizes_and_accepts_catalog_ids():
    assert chrome.clean_theme(" Forest ") == "forest"
    assert chrome.clean_theme("ocean") == "ocean"


def test_clean_theme_rejects_unknown_id():
    with pytest.raises(chrome.ChromeOpError, match="ocean"):
        chrome.clean_theme("midnight")  # the spec's example theme does not exist


def test_theme_label():
    assert chrome.theme_label("forest") == "Forest"


def test_clean_layout_normalizes_and_rejects_unknown():
    assert chrome.clean_layout(" Pill ") == "pill"
    with pytest.raises(chrome.ChromeOpError, match="classic"):
        chrome.clean_layout("floating")


def test_merge_navbar_overlays_and_preserves_links():
    current = {
        "layout": "classic",
        "links": [{"label": "Courses", "href": "/courses"}],
        "cta": {"text": "Get Started", "href": "/courses"},
        "logo_size": "lg",
    }
    merged = chrome.merge_navbar(current, {"layout": "pill"})
    assert merged["layout"] == "pill"
    assert merged["links"] == [{"label": "Courses", "href": "/courses"}]
    assert merged["cta"] == {"text": "Get Started", "href": "/courses"}
    assert merged["logo_size"] == "lg"


def test_merge_navbar_cleans_cta_href_and_caps_text():
    merged = chrome.merge_navbar({}, {"cta": {"text": "x" * 200, "href": "javascript:evil()"}})
    assert merged["cta"]["href"] == ""  # unsafe scheme stripped by _clean_nav_href
    assert len(merged["cta"]["text"]) == 80


def test_merge_navbar_invalid_layout_raises_user_safe_error():
    with pytest.raises(chrome.ChromeOpError):
        chrome.merge_navbar({}, {"layout": "floating"})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django python -m pytest apps/core/tests/test_copilot_chrome.py -q`
Expected: FAIL — `ImportError: cannot import name 'chrome'`

- [ ] **Step 3: Write the implementation**

Create `backend/apps/core/copilot/chrome.py`:

```python
"""Chrome executors behind edit_theme / edit_navbar: narrow TenantConfig
fields (theme id from the catalog, navbar layout/cta).

Pure helpers — validation and merge only, no DB writes (those happen in the
execute view, like blocks.py). Navbar updates are overlaid on the current
navbar_config and cleaned by TenantConfigSerializer.validate_navbar_config,
the exact allowlist the admin config PATCH enforces, so the copilot can
never write a navbar shape the admin couldn't. Imports are function-local
to match apps/core's cycle-dodging convention."""


class ChromeOpError(Exception):
    """User-safe message describing why a chrome edit was refused."""


def clean_theme(theme_id):
    from apps.tenant_config.models import TenantTheme

    theme = str(theme_id or "").strip().lower()
    if theme not in TenantTheme.values:
        raise ChromeOpError("theme must be one of: " + ", ".join(TenantTheme.values))
    return theme


def theme_label(theme_id):
    from apps.tenant_config.models import TenantTheme

    return TenantTheme(theme_id).label


def clean_layout(layout):
    from apps.tenant_config.serializers import _NAVBAR_LAYOUTS

    value = str(layout or "").strip().lower()
    if value not in _NAVBAR_LAYOUTS:
        raise ChromeOpError("layout must be one of: " + ", ".join(sorted(_NAVBAR_LAYOUTS)))
    return value


def merge_navbar(current, updates):
    from rest_framework import serializers as drf_serializers

    from apps.tenant_config.serializers import TenantConfigSerializer

    merged = dict(current or {})
    merged.update(updates)
    try:
        return TenantConfigSerializer().validate_navbar_config(merged)
    except drf_serializers.ValidationError as exc:
        detail = exc.detail
        if isinstance(detail, list) and detail:
            detail = detail[0]
        raise ChromeOpError(str(detail)) from exc
```

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Step 2.
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/chrome.py backend/apps/core/tests/test_copilot_chrome.py
git commit -m "feat(copilot): chrome validation/merge helpers for theme and navbar"
```

---

### Task 2: Engine — action union, prompt, proposal cards, chrome digest

**Files:**
- Modify: `backend/apps/core/copilot/engine.py` (`SYSTEM_PROMPT` at :27-51, models end at :107, union at :110-119, `_user_turn` at :148-164, `_card` at :167-262)
- Test: `backend/apps/core/tests/test_copilot_engine.py` (append + touch the mock helpers)

**Interfaces:**
- Consumes: Task 1's `chrome.clean_theme` / `theme_label` / `clean_layout` / `ChromeOpError`.
- Produces: two new `CopilotAction` members and `_card` branches that stash exactly these payloads (Task 3's dispatch depends on them):
  - `{"kind": "edit_theme", "theme": "<one of the six ids>"}`
  - `{"kind": "edit_navbar", "updates": {"layout": "<id>"?, "cta": {"text": str, "href": str}?}}` (at least one key present)
- Also produces `_chrome_digest(tenant) -> str` (a one-line current theme/navbar summary in the user turn; tests mock it like `_pages_digest`).

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_copilot_engine.py`:

```python
def test_edit_theme_card_stashes_normalized_theme():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(kind="actions", text="", actions=[{"kind": "edit_theme", "theme": "Forest"}])
    payload, _ = _run(parsed)
    (card,) = payload["actions"]
    assert card["kind"] == "edit_theme"
    assert "Forest" in card["title"]
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed == {"kind": "edit_theme", "theme": "forest"}


def test_edit_theme_unknown_id_dropped_with_fallback():
    parsed = _turn(kind="actions", text="", actions=[{"kind": "edit_theme", "theme": "midnight"}])
    payload, _ = _run(parsed)
    assert payload["kind"] == "answer"  # unknown theme dropped, fallback answer


def test_edit_navbar_card_carries_layout_and_cta():
    from apps.core.copilot import tokens as copilot_tokens

    parsed = _turn(
        kind="actions",
        text="",
        actions=[{"kind": "edit_navbar", "layout": "pill", "cta_text": "Join now", "cta_href": "/plans"}],
    )
    payload, _ = _run(parsed)
    (card,) = payload["actions"]
    assert card["kind"] == "edit_navbar"
    assert "pill" in card["detail"] and "Join now" in card["detail"]
    stashed = copilot_tokens.take_action(card["token"], "demo_yoga")
    assert stashed == {
        "kind": "edit_navbar",
        "updates": {"layout": "pill", "cta": {"text": "Join now", "href": "/plans"}},
    }


def test_edit_navbar_without_changes_dropped():
    parsed = _turn(kind="actions", text="", actions=[{"kind": "edit_navbar"}])
    payload, _ = _run(parsed)
    assert payload["kind"] == "answer"  # nothing to change, dropped


def test_user_turn_includes_chrome_digest():
    from decimal import Decimal
    captured = {}

    def fake_structured(**kw):
        captured.update(kw)
        return _turn(kind="answer", text="hi"), Decimal("0.01"), "m"

    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
    ):
        engine.run_turn(TENANT, [], [], "hello")
    assert "Theme: ocean" in captured["user"]
```

Then update the existing mock plumbing so every `run_turn` call also mocks the new `_chrome_digest`: add

```python
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
```

to the shared `_run` helper's `with (...)` block (top of the file, next to the existing `_pages_digest` patch) **and** to every inline `with mock.patch(...)` block in the file that patches `_pages_digest` directly (the Phase 2 create-* tests do this — search the file for `_pages_digest`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django python -m pytest apps/core/tests/test_copilot_engine.py -q`
Expected: the 4 new action tests FAIL with pydantic discriminator errors ("Input tag 'edit_theme' found using 'kind' does not match any of the expected tags"); `test_user_turn_includes_chrome_digest` fails with `AttributeError: ... has no attribute '_chrome_digest'`. All pre-existing tests still pass.

- [ ] **Step 3: Implement — union members, prompt bullets, digest, card branches**

In `backend/apps/core/copilot/engine.py`:

3a. Extend the copilot import (line 19) to:

```python
from apps.core.copilot import blocks, chrome, content, tokens
```

3b. Append to `SYSTEM_PROMPT`, after the `create_blog_post` bullet (line 47) and before the closing "Use block ids…" sentence:

```python
    "- edit_theme: switch the site's color theme; theme must be one of: "
    "ocean, ember, forest, sunset, violet, slate\n"
    "- edit_navbar: change the navbar layout (one of: classic, centered, "
    "split, minimal, pill) and/or its call-to-action button (cta_text plus "
    "cta_href, an internal path like /courses); include only what changes\n"
```

3c. Add the pydantic models after `CreateBlogPostAction` (line 107) and extend the union:

```python
class EditThemeAction(BaseModel):
    kind: Literal["edit_theme"]
    theme: str


class EditNavbarAction(BaseModel):
    kind: Literal["edit_navbar"]
    layout: str | None = None
    cta_text: str | None = None
    cta_href: str | None = None


CopilotAction = Annotated[
    EditPagesAction
    | AddBlockAction
    | RemoveBlockAction
    | MoveBlockAction
    | CreateCourseAction
    | CreateEventAction
    | CreateBlogPostAction
    | EditThemeAction
    | EditNavbarAction,
    Field(discriminator="kind"),
]
```

3d. Add `_chrome_digest` after `_pages_digest` (line 145) and wire it into `_user_turn`:

```python
def _chrome_digest(tenant):
    """One-line current theme/navbar state for the user turn."""
    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
    if cfg is None:
        return "Theme: ocean; Navbar: layout=classic, cta=none"
    nav = cfg.navbar_config or {}
    cta = nav.get("cta") or {}
    cta_part = f"'{cta.get('text')}' -> {cta.get('href')}" if cta.get("text") else "none"
    return f"Theme: {cfg.theme}; Navbar: layout={nav.get('layout') or 'classic'}, cta={cta_part}"
```

In `_user_turn`, extend the initial `parts` list (lines 150-154) with one more element after the pages digest:

```python
        "Current pages:\n" + _pages_digest(tenant),
        _chrome_digest(tenant),
```

3e. Add two `_card` branches after the `MoveBlockAction` branch (line 208) — they must sit **above** the trailing `create_blog_post` fallthrough:

```python
    if isinstance(action, EditThemeAction):
        theme = chrome.clean_theme(action.theme)
        return {
            "kind": "edit_theme",
            "title": f"Switch theme to {chrome.theme_label(theme)}",
            "detail": "Colors change across the whole site — you can switch back anytime.",
            "token": tokens.stash_action(schema, {"kind": "edit_theme", "theme": theme}),
        }
    if isinstance(action, EditNavbarAction):
        updates = {}
        if action.layout is not None:
            updates["layout"] = chrome.clean_layout(action.layout)
        if action.cta_text:
            updates["cta"] = {"text": action.cta_text[:80], "href": str(action.cta_href or "/courses")[:300]}
        if not updates:
            raise chrome.ChromeOpError("nothing to change on the navbar")
        parts = []
        if "layout" in updates:
            parts.append(f"layout: {updates['layout']}")
        if "cta" in updates:
            parts.append(f"button: '{updates['cta']['text']}' → {updates['cta']['href']}")
        return {
            "kind": "edit_navbar",
            "title": "Update the navbar",
            "detail": ", ".join(parts),
            "token": tokens.stash_action(schema, {"kind": "edit_navbar", "updates": updates}),
        }
```

(`run_turn`'s existing `except Exception` around `_card` turns `ChromeOpError` into a dropped card + fallback answer — no change there. The cta href is only length-capped here; the unsafe-scheme strip happens at execute time inside `merge_navbar`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django python -m pytest apps/core/tests/test_copilot_engine.py apps/core/tests/test_copilot_chrome.py -q`
Expected: all pass (pre-existing + 5 new engine + 7 chrome).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/engine.py backend/apps/core/tests/test_copilot_engine.py
git commit -m "feat(copilot): propose edit_theme/edit_navbar cards with chrome digest"
```

---

### Task 3: Execute dispatch — theme/navbar writes

**Files:**
- Modify: `backend/apps/core/copilot/views.py` (`_execute` at :80-106, `copilot_execute`'s except tuple at :120)
- Test: `backend/apps/core/tests/test_copilot_views.py` (append)

**Interfaces:**
- Consumes: Task 1's `chrome` helpers; Task 2's stashed payload shapes.
- Produces: `POST /api/v1/admin/copilot/execute/` responses `{"result": {"kind": "edit_theme", "theme": str}}` and `{"result": {"kind": "edit_navbar"}}`. Chrome failures → `400 {"detail": "<message>"}`; token failures stay `403`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_copilot_views.py` (reuse the file's existing `client`/`coach` fixtures and `copilot_tokens` import; `"shared_test"` is the schema the fixtures use):

```python
def test_execute_edit_theme_writes_theme_flips_look_edited_and_busts_cache(client, coach):
    from django.core.cache import cache

    from apps.tenant_config.models import TenantConfig

    cache.set("tenant:shared_test:config", "sentinel", timeout=300)
    token = copilot_tokens.stash_action("shared_test", {"kind": "edit_theme", "theme": "forest"})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    assert resp.json()["result"] == {"kind": "edit_theme", "theme": "forest"}
    cfg = TenantConfig.objects.first()
    assert cfg.theme == "forest"
    assert cfg.setup_progress.get("look_edited") is True
    assert cache.get("tenant:shared_test:config") is None


def test_execute_edit_navbar_merges_and_preserves_links(client, coach):
    from django.core.cache import cache

    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.first()
    cfg.navbar_config = {"layout": "classic", "links": [{"label": "Courses", "href": "/courses"}]}
    cfg.save(update_fields=["navbar_config"])
    cache.set("tenant:shared_test:config", "sentinel", timeout=300)
    token = copilot_tokens.stash_action(
        "shared_test",
        {"kind": "edit_navbar", "updates": {"layout": "pill", "cta": {"text": "Join now", "href": "/plans"}}},
    )
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 200, resp.content
    cfg.refresh_from_db()
    assert cfg.navbar_config["layout"] == "pill"
    assert cfg.navbar_config["cta"] == {"text": "Join now", "href": "/plans"}
    assert cfg.navbar_config["links"] == [{"label": "Courses", "href": "/courses"}]
    assert cache.get("tenant:shared_test:config") is None


def test_execute_edit_theme_invalid_stashed_id_returns_400(client, coach):
    # Defense in depth: even a stashed payload is re-validated at execute time.
    token = copilot_tokens.stash_action("shared_test", {"kind": "edit_theme", "theme": "midnight"})
    resp = client.post("/api/v1/admin/copilot/execute/", {"token": token}, format="json")
    assert resp.status_code == 400
    assert "theme must be one of" in resp.json()["detail"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django python -m pytest apps/core/tests/test_copilot_views.py -q`
Expected: the 3 new tests FAIL — `_execute` falls through to `BlockOpError("unknown action: edit_theme")` → the first two get 400 instead of 200; the third's detail says "unknown action…". Pre-existing tests still pass.

- [ ] **Step 3: Implement the dispatch**

In `backend/apps/core/copilot/views.py`:

3a. Add `from django.core.cache import cache` to the imports and extend the copilot import (line 18) to:

```python
from apps.core.copilot import blocks, chrome, content, engine, tokens
```

3b. Add a chrome branch in `_execute`, after the `_CREATORS` lookup (line 90) and before the pages-op `with tenant_context(...)` block:

```python
    if kind in ("edit_theme", "edit_navbar"):
        with tenant_context(tenant):
            cfg = TenantConfig.objects.first()
            if cfg is None:
                raise chrome.ChromeOpError("site is not set up yet")
            if kind == "edit_theme":
                theme = chrome.clean_theme(action.get("theme"))
                cfg.theme = theme
                fields = ["theme"]
                # Setup Assistant parity with TenantConfigView.perform_update.
                progress = dict(cfg.setup_progress or {})
                if not progress.get("look_edited"):
                    progress["look_edited"] = True
                    cfg.setup_progress = progress
                    fields.append("setup_progress")
                cfg.save(update_fields=fields)
                result = {"kind": kind, "theme": theme}
            else:
                cfg.navbar_config = chrome.merge_navbar(cfg.navbar_config or {}, action.get("updates") or {})
                cfg.save(update_fields=["navbar_config"])
                result = {"kind": kind}
        # Public pages read theme/navbar through the cached config object.
        cache.delete(f"tenant:{tenant.schema_name}:config")
        return result
```

3c. Widen the error mapping in `copilot_execute` (line 120):

```python
    except (blocks.BlockOpError, content.ContentOpError, chrome.ChromeOpError) as exc:
        return Response({"detail": str(exc)}, status=400)
```

- [ ] **Step 4: Run the copilot suite**

Run: `docker compose exec django python -m pytest apps/core/tests/test_copilot_views.py apps/core/tests/test_copilot_engine.py apps/core/tests/test_copilot_chrome.py apps/core/tests/test_copilot_tokens.py apps/core/tests/test_copilot_blocks.py apps/core/tests/test_copilot_content.py -q`
Expected: all pass. Then `make test-app APP=core` for the app-level gate.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/views.py backend/apps/core/tests/test_copilot_views.py
git commit -m "feat(copilot): execute theme/navbar edits with cache bust and look_edited parity"
```

---

### Task 4: Frontend kinds + e2e chrome flow

**Files:**
- Modify: `frontend-customer/src/lib/copilot/types.ts` (`ActionKind` at :17-24)
- Test: `frontend-customer/src/lib/__tests__/copilot.test.ts` (append to the `isCreateKind` describe)
- Modify: `e2e/specs/29-copilot.spec.ts` (append one test)

**Interfaces:**
- Consumes: Task 3's execute results. `edit_theme`/`edit_navbar` are site edits, NOT creates — `isCreateKind` stays unchanged and they get the "Applied" card path (and `router.refresh()` repaints the new theme) for free. No i18n keys needed.

- [ ] **Step 1: Write the failing lib test**

In `frontend-customer/src/lib/__tests__/copilot.test.ts`, append to the existing `isCreateKind` test's expectations:

```ts
    expect(isCreateKind("edit_theme")).toBe(false);
    expect(isCreateKind("edit_navbar")).toBe(false);
```

(These pass against the runtime already — the failing check is the type union: Step 3's `ActionKind` change is verified by `npm run build`. Keep the assertions anyway; they pin the classification.)

- [ ] **Step 2: Widen the kind union**

In `frontend-customer/src/lib/copilot/types.ts`:

```ts
export type ActionKind =
  | "edit_pages"
  | "add_block"
  | "remove_block"
  | "move_block"
  | "create_course"
  | "create_event"
  | "create_blog_post"
  | "edit_theme"
  | "edit_navbar";
```

- [ ] **Step 3: Append the e2e test**

In `e2e/specs/29-copilot.spec.ts`, after the existing tests (same imports; copy the exact page-setup, open, fill, and Send locator lines from test 1 — they are the source of truth if the snippets below drift):

```ts
test("an edit-theme card confirms and applies", async ({ browser }) => {
  const page = await coachContext(browser);
  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"actions","text":"Switching it up.",' +
        '"actions":[{"kind":"edit_theme","title":"Switch theme to Forest",' +
        '"detail":"Colors change across the whole site — you can switch back anytime.","token":"e2e-theme-token"}]}\n\n',
    });
  });
  let executed = false;
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    executed = true;
    await route.fulfill({ json: { result: { kind: "edit_theme", theme: "forest" } } });
  });
  await page.goto(`${TENANT}/?copilot=1`);
  await expect(page.getByText("Your AI assistant").first()).toBeVisible();
  await page.getByPlaceholder("e.g. make this section warmer").fill("make my site feel calmer");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Switch theme to Forest")).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Applied", { exact: true })).toBeVisible();
  expect(executed).toBe(true);
  await page.close();
});
```

- [ ] **Step 4: Verify**

```bash
cd frontend-customer && npm test && npm run build
make e2e-spec SPEC=29-copilot   # dev stack must be up — check `make health-check` first, do not rebuild
```
Expected: lib tests pass, build clean, 4 e2e tests pass. `e2e/impact-map.json` already maps `src/components/copilot` and `src/lib/copilot` → `29-copilot`; no new entry needed.

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/copilot/types.ts frontend-customer/src/lib/__tests__/copilot.test.ts e2e/specs/29-copilot.spec.ts
git commit -m "feat(copilot): edit_theme/edit_navbar action kinds + e2e chrome flow"
```

---

### Task 5: `help_bot.knowledge_text` — persona-free KB accessor

**Files:**
- Modify: `backend/apps/tenant_config/help_bot.py` (`_system_prompt_cached` at :129-136)
- Modify: `backend/apps/tenant_config/tests/test_help_bot.py` (the `kb_file` fixture at :22-29)
- Test: `backend/apps/core/tests/test_platform_kb.py` (append)

**Interfaces:**
- Consumes: existing `KB_PATH`, `platform_notes`, `_addenda_state` (`help_bot.py:27,118,104`).
- Produces: `knowledge_text(audience="coach") -> str` — repo KB + DB addenda, **no persona** (Task 6 consumes it). Byte-stable between addenda edits (same fingerprint + `lru_cache` pattern as the system prompt).

- [ ] **Step 1: Write the failing tests**

Append to `backend/apps/core/tests/test_platform_kb.py` (the file already imports `help_bot` and `PlatformKbEntry` — match its existing imports):

```python
def test_knowledge_text_is_persona_free_and_includes_kb_plus_addenda():
    PlatformKbEntry.objects.create(title="Fees", content="KB-EXTRACT-MARKER fee note", audience="coach")
    text = help_bot.knowledge_text("coach")
    assert "KB-EXTRACT-MARKER fee note" in text
    assert "# PLATFORM NOTES" in text
    assert help_bot._PERSONAS["coach"] not in text  # persona stays out


def test_knowledge_text_is_byte_stable_between_edits():
    assert help_bot.knowledge_text("coach") is help_bot.knowledge_text("coach")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django python -m pytest apps/core/tests/test_platform_kb.py -q`
Expected: 2 new tests FAIL with `AttributeError: module ... has no attribute 'knowledge_text'`; the 6 existing tests pass.

- [ ] **Step 3: Implement the extraction**

In `backend/apps/tenant_config/help_bot.py`, replace `_system_prompt_cached` (lines 129-136) with:

```python
@lru_cache(maxsize=8)
def _knowledge_cached(audience, fingerprint):
    return KB_PATH.read_text(encoding="utf-8") + platform_notes(audience)


def knowledge_text(audience="coach") -> str:
    """Repo KB + DB addenda, persona-free — for consumers (the coach
    copilot) that ground answers in platform knowledge without the chat
    persona. Byte-stable between addenda edits (fingerprint keys the
    cache), so callers can embed it in their own cached prompts."""
    fingerprint, _ = _addenda_state(audience)
    return _knowledge_cached(audience, fingerprint)


@lru_cache(maxsize=8)
def _system_prompt_cached(audience, fingerprint):
    return _PERSONAS[audience] + "\n\n# KNOWLEDGE BASE\n\n" + _knowledge_cached(audience, fingerprint)
```

Then update the `kb_file` fixture in `backend/apps/tenant_config/tests/test_help_bot.py` (lines 22-29) so the new cache is cleared alongside the old one — both before and after:

```python
@pytest.fixture()
def kb_file(tmp_path, monkeypatch):
    path = tmp_path / "help_kb.md"
    path.write_text("## Payouts\nConnect Stripe under Payouts.\n\n## ROUTES\n| /admin/payouts | Payouts |")
    monkeypatch.setattr(help_bot, "KB_PATH", path)
    help_bot._knowledge_cached.cache_clear()
    help_bot._system_prompt_cached.cache_clear()
    yield path
    help_bot._knowledge_cached.cache_clear()
    help_bot._system_prompt_cached.cache_clear()
```

Also run `grep -rn "_system_prompt_cached.cache_clear" backend/` — add a matching `_knowledge_cached.cache_clear()` beside every other hit (any test or fixture that clears the prompt cache after touching `KB_PATH` or addenda must clear both).

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django python -m pytest apps/core/tests/test_platform_kb.py apps/tenant_config/tests/test_help_bot.py -q`
Expected: all pass (8 platform-kb + all help-bot). Then `make test-app APP=tenant_config` for the app gate — the help-bot views/conversations suites must stay green (the composed system-prompt bytes are unchanged).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/tenant_config/help_bot.py backend/apps/tenant_config/tests/test_help_bot.py backend/apps/core/tests/test_platform_kb.py
git commit -m "refactor(help-bot): extract persona-free knowledge_text for the copilot"
```

---

### Task 6: Engine — ground answers in the platform KB

**Files:**
- Modify: `backend/apps/core/copilot/engine.py` (module docstring at :5-6, new `_KB_HEADER` + `_system()` above `run_turn`, `run_turn`'s `system=` kwarg at :267)
- Test: `backend/apps/core/tests/test_copilot_engine.py` (append)

**Interfaces:**
- Consumes: Task 5's `help_bot.knowledge_text("coach")`.
- Produces: `_system() -> str` — `SYSTEM_PROMPT + _KB_HEADER + knowledge_text("coach")`, used as the `system=` argument of every `run_turn` model call (Task 9 keeps using it).

- [ ] **Step 1: Write the failing test**

Append to `backend/apps/core/tests/test_copilot_engine.py`:

```python
def test_system_prompt_carries_platform_knowledge_and_addenda():
    from decimal import Decimal

    from apps.core.models import PlatformKbEntry

    PlatformKbEntry.objects.create(title="Fees", content="COPILOT-KB-MARKER fee note", audience="coach")
    captured = {}

    def fake_structured(**kw):
        captured.update(kw)
        return _turn(kind="answer", text="hi"), Decimal("0.01"), "m"

    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
    ):
        engine.run_turn(TENANT, [], [], "how do I get paid?")
    assert captured["system"].startswith(engine.SYSTEM_PROMPT)
    assert "# PLATFORM KNOWLEDGE" in captured["system"]
    assert "COPILOT-KB-MARKER fee note" in captured["system"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `docker compose exec django python -m pytest apps/core/tests/test_copilot_engine.py -q`
Expected: the new test FAILS — `"# PLATFORM KNOWLEDGE" in captured["system"]` is False (system is the bare `SYSTEM_PROMPT`).

- [ ] **Step 3: Implement the composition**

In `backend/apps/core/copilot/engine.py`:

3a. Update the module docstring's prompt-cache sentence (lines 5-6) to:

```python
The system prompt is byte-identical across tenants (prompt-cache rule):
SYSTEM_PROMPT is a module constant and the appended platform KB is
platform-level, fingerprint-cached in help_bot — bytes only change when a
superadmin edits KB addenda. Everything tenant-specific rides in the user turn.
```

3b. Add above `run_turn`:

```python
_KB_HEADER = (
    "\n\n# PLATFORM KNOWLEDGE\n"
    "Contentor platform facts (plans, payouts, features) for questions like "
    "'how do I get paid?'. Ground platform answers in this section only — "
    "never invent plan numbers or fees. When pointing the coach somewhere, "
    "use ONLY paths from the ROUTES table below, formatted as a markdown "
    "link like [Payouts](/admin/payouts). If the knowledge does not cover "
    "the question, say so and point to support@contentor.app.\n\n"
)


def _system():
    """SYSTEM_PROMPT + platform KB. Still byte-identical across tenants —
    the KB is platform-level and help_bot's fingerprint cache keeps the
    string stable between addenda edits, so the prompt-cache prefix stays
    warm."""
    from apps.tenant_config import help_bot

    return SYSTEM_PROMPT + _KB_HEADER + help_bot.knowledge_text("coach")
```

3c. In `run_turn`, change the model call's first kwarg from `system=SYSTEM_PROMPT,` to `system=_system(),`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose exec django python -m pytest apps/core/tests/test_copilot_engine.py -q`
Expected: all pass (the pre-existing tests run with the real `help_kb.md` — the KB append does not disturb their assertions, which never inspect `system`).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/engine.py backend/apps/core/tests/test_copilot_engine.py
git commit -m "feat(copilot): ground answers in the platform knowledge base"
```

---

### Task 7: Frontend — render KB answer links as buttons

**Files:**
- Modify: `frontend-customer/src/components/copilot/copilot-bubble.tsx` (the entry-text render at :125)
- Modify: `e2e/specs/29-copilot.spec.ts` (append one test)

**Interfaces:**
- Consumes: `parseAnswer(content, origin)` from `frontend-customer/src/components/admin/assistant/format-answer.ts` (already shared, same-origin-validated) and `NavLink` from `@/components/ui/nav-link`.
- Rationale: coaches are non-technical — the KB's `[label](/admin/...)` markdown-lite links must render as tappable buttons, never raw paths (same contract as `AnswerBody` in `setup/help-chat.tsx`). No new i18n keys (labels come from the answer). `parseAnswer` is already unit-tested where it lives, and the repo convention keeps component tests to build + e2e.

- [ ] **Step 1: Implement the answer renderer**

In `frontend-customer/src/components/copilot/copilot-bubble.tsx`:

1a. Add imports:

```tsx
import { NavLink } from "@/components/ui/nav-link";
import { parseAnswer } from "@/components/admin/assistant/format-answer";
```

1b. Add a small component above `CopilotBubble` (entries only exist after client-side interaction, but guard `window` anyway for the SSR pass):

```tsx
/** Assistant text with the markdown-lite link contract: `[label](/path)`
 * links are stripped from the prose and rendered as tappable chips, so a
 * coach never sees a raw path (same contract as help-chat's AnswerBody). */
function AssistantText({ text }: { text: string }) {
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const { text: prose, links } = parseAnswer(text, origin);
  return (
    <>
      {prose}
      {links.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-1">
          {links.map((l) => (
            <NavLink
              key={l.href}
              href={l.href}
              className="rounded-full border px-2 py-0.5 text-xs font-medium text-primary"
            >
              {l.label}
            </NavLink>
          ))}
        </span>
      )}
    </>
  );
}
```

1c. Change the bubble body (line 125) from:

```tsx
{e.text === "__unavailable__" ? t("resting") : e.text}
```

to:

```tsx
{e.text === "__unavailable__" ? (
  t("resting")
) : e.role === "assistant" ? (
  <AssistantText text={e.text} />
) : (
  e.text
)}
```

- [ ] **Step 2: Append the e2e test**

In `e2e/specs/29-copilot.spec.ts` (same setup lines as the Task 4 test):

```ts
test("a KB-grounded answer renders admin links as buttons, not raw paths", async ({ browser }) => {
  const page = await coachContext(browser);
  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"answer","text":"You get paid through Stripe payouts. [Payouts](/admin/payouts)"}\n\n',
    });
  });
  await page.goto(`${TENANT}/?copilot=1`);
  await page.getByPlaceholder("e.g. make this section warmer").fill("how do I get paid?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("You get paid through Stripe payouts.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Payouts" })).toHaveAttribute("href", /\/admin\/payouts/);
  await expect(page.getByText("[Payouts]")).toHaveCount(0);
  await page.close();
});
```

- [ ] **Step 3: Verify**

```bash
cd frontend-customer && npm test && npm run build
make e2e-spec SPEC=29-copilot
make lint
```
Expected: tests pass, build clean (type-checks the component), 5 e2e tests pass, loading-pattern checker clean.

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/components/copilot/copilot-bubble.tsx e2e/specs/29-copilot.spec.ts
git commit -m "feat(copilot): render KB answer links as tappable chips"
```

---

### Task 8: `CopilotSettings` — superadmin ask-cap knob (adminkit)

**Files:**
- Modify: `backend/apps/core/models.py` (append near the other AI models)
- Create: `backend/apps/core/migrations/00XX_copilotsettings.py` (generated, then edited)
- Modify: `backend/apps/core/admin_panels.py` (append registration)
- Modify: `frontend-main/src/app/admin/admin-shell.tsx` (AI section of `SECTIONS`, lines 103-111)
- Test: `backend/apps/core/tests/test_copilot_settings.py`

**Interfaces:**
- Produces: `CopilotSettings` (public schema, `app_label = "core"`) with `max_asks_per_conversation: PositiveIntegerField(default=0)` and `CopilotSettings.load() -> CopilotSettings` (singleton `get_or_create(pk=1)`). Task 9's `engine._ask_cap()` consumes `load()`. Superadmin edits it at `/admin/m/copilot-settings` (adminkit is fully generic — no new frontend page).

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/core/tests/test_copilot_settings.py`. For the superadmin client, copy the exact superuser fixture used by `backend/apps/core/tests/test_platform_plan_admin.py` (same auth pattern; adjust the fixture body below to match it if it differs):

```python
"""CopilotSettings: platform-wide copilot knobs (singleton row), edited by
superadmin through adminkit at /api/v1/platform-admin/copilot-settings/.
The ask-cap is a conversation-behavior knob, not metering — see the
Phase 3 plan."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import CopilotSettings

pytestmark = pytest.mark.django_db


@pytest.fixture()
def su_client():
    user = User.objects.create_superuser(email="root@x.com", name="Root", password="x")  # noqa: S106
    client = APIClient()
    client.force_authenticate(user)
    return client


def test_load_returns_the_pk1_singleton():
    a = CopilotSettings.load()
    b = CopilotSettings.load()
    assert a.pk == b.pk == 1
    assert a.max_asks_per_conversation == 0  # default: uncapped


def test_superadmin_can_read_and_update_the_cap(su_client):
    CopilotSettings.load()  # ensure the row exists even under --no-migrations
    resp = su_client.get("/api/v1/platform-admin/copilot-settings/1/")
    assert resp.status_code == 200, resp.content
    resp = su_client.patch(
        "/api/v1/platform-admin/copilot-settings/1/", {"max_asks_per_conversation": 3}, format="json"
    )
    assert resp.status_code == 200, resp.content
    assert CopilotSettings.load().max_asks_per_conversation == 3


def test_create_and_delete_are_blocked(su_client):
    CopilotSettings.load()
    assert su_client.post(
        "/api/v1/platform-admin/copilot-settings/", {"max_asks_per_conversation": 1}, format="json"
    ).status_code == 405
    assert su_client.delete("/api/v1/platform-admin/copilot-settings/1/").status_code == 405


def test_non_superuser_is_rejected():
    user = User.objects.create_user(email="coach@x.com", name="C", password="x", role="coach")  # noqa: S106
    client = APIClient()
    client.force_authenticate(user)
    assert client.get("/api/v1/platform-admin/copilot-settings/").status_code in (403, 404)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django python -m pytest apps/core/tests/test_copilot_settings.py -q`
Expected: FAIL — `ImportError: cannot import name 'CopilotSettings'`.

- [ ] **Step 3: Model + migration**

3a. Append to `backend/apps/core/models.py` (near `PlatformKbEntry`, the other superadmin-editable AI model):

```python
class CopilotSettings(models.Model):
    """Superadmin-tunable copilot knobs (single row, pk=1) — adminkit panel
    "copilot-settings". The ask-cap is the Phase 3 steering knob: clarifying
    questions allowed per conversation before the engine forces an
    answer/action. 0 = uncapped (prompt-level steering only)."""

    max_asks_per_conversation = models.PositiveIntegerField(
        default=0,
        help_text=(
            "Clarifying questions the copilot may ask in one conversation "
            "before it must act or answer. 0 = no cap."
        ),
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        verbose_name = "Copilot settings"
        verbose_name_plural = "Copilot settings"

    def __str__(self):
        return "Copilot settings"

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
```

3b. Generate the migration: `make makemigrations` (creates `backend/apps/core/migrations/00XX_copilotsettings.py`). Then edit the generated file to seed the singleton — append to its `operations`:

```python
        migrations.RunPython(_create_singleton, migrations.RunPython.noop),
```

and add above the `Migration` class:

```python
def _create_singleton(apps, schema_editor):
    apps.get_model("core", "CopilotSettings").objects.get_or_create(pk=1)
```

3c. Apply: `make migrate`. (`apps.core` is a SHARED app — the row lands in the public schema. If the backend test DB predates this migration, run `make test-fresh` once.)

- [ ] **Step 4: Adminkit registration + sidebar**

4a. Append to `backend/apps/core/admin_panels.py` (import `CopilotSettings` alongside the other model imports at the top of the file; place the class near `PlatformKbEntryAdmin`):

```python
@platform_site.register(CopilotSettings)
class CopilotSettingsAdmin(ModelAdmin):
    label = "Copilot Settings"
    label_plural = "Copilot Settings"
    key = "copilot-settings"
    icon = "bot"
    description = "Platform-wide knobs for the coach copilot (ask-cap steering)."
    list_display = ("max_asks_per_conversation", "updated_at")
    fields = ("max_asks_per_conversation",)
    can_create = False
    can_delete = False
```

4b. In `frontend-main/src/app/admin/admin-shell.tsx`, add the model to the AI section of `SECTIONS` (lines 103-111):

```tsx
  {
    id: "ai",
    label: "AI",
    items: [
      { kind: "static", label: "AI Overview", href: "/admin/ai", icon: Bot },
      { kind: "model", key: "ai-transcripts", label: "AI Transcripts" },
      { kind: "model", key: "ai-ip-blocks", label: "AI IP Blocks" },
      { kind: "model", key: "copilot-settings", label: "Copilot Settings" },
    ],
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose exec django python -m pytest apps/core/tests/test_copilot_settings.py -q` — expected 4 passed.
Then: `cd frontend-main && npm run build` — clean (`/admin/m/[model]` is generic; only the sidebar changed).

- [ ] **Step 6: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations backend/apps/core/admin_panels.py backend/apps/core/tests/test_copilot_settings.py frontend-main/src/app/admin/admin-shell.tsx
git commit -m "feat(copilot): superadmin ask-cap knob via adminkit CopilotSettings"
```

---

### Task 9: Ask-cap enforcement — engine + transcript kind threading

**Files:**
- Modify: `backend/apps/core/copilot/engine.py` (`run_turn` at :265, new helpers above it)
- Modify: `frontend-customer/src/lib/copilot/types.ts` (`ChatEntry`), `frontend-customer/src/lib/copilot/state.ts` (`reduceChat`, `toTranscript`), `frontend-customer/src/lib/copilot/api.ts` (transcript body type)
- Test: `backend/apps/core/tests/test_copilot_engine.py` (append), `frontend-customer/src/lib/__tests__/copilot.test.ts` (append)

**Interfaces:**
- Consumes: Task 8's `CopilotSettings.load()`; Task 6's `_system()`.
- Produces: transcript entries may carry `kind` (`"answer" | "ask" | "actions"`); the engine counts assistant entries with `kind == "ask"` and, at/over the cap, appends `CAP_STEER` to the user turn and coerces a returned `ask` into an `answer`. Entries without `kind` (old clients) count as not-asks — the cap simply doesn't bite, which is safe.

- [ ] **Step 1: Write the failing backend tests**

Append to `backend/apps/core/tests/test_copilot_engine.py`:

```python
def test_ask_over_cap_is_steered_and_coerced_to_answer():
    from decimal import Decimal

    from apps.core.models import CopilotSettings

    s = CopilotSettings.load()
    s.max_asks_per_conversation = 1
    s.save()
    captured = {}

    def fake_structured(**kw):
        captured.update(kw)
        return _turn(kind="ask", text="Which page do you mean?"), Decimal("0.01"), "m"

    transcript = [
        {"role": "coach", "text": "improve my site"},
        {"role": "assistant", "text": "What look do you want?", "kind": "ask"},
    ]
    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
    ):
        payload, _ = engine.run_turn(TENANT, transcript, [], "warmer")
    assert payload == {"kind": "answer", "text": "Which page do you mean?"}
    assert "Do not ask another clarifying question" in captured["user"]


def test_cap_zero_leaves_asks_uncapped():
    from decimal import Decimal

    captured = {}

    def fake_structured(**kw):
        captured.update(kw)
        return _turn(kind="ask", text="Which page?"), Decimal("0.01"), "m"

    transcript = [{"role": "assistant", "text": "Earlier question?", "kind": "ask"}]
    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
    ):
        payload, _ = engine.run_turn(TENANT, transcript, [], "hi")
    assert payload["kind"] == "ask"  # default cap 0 = today's behavior
    assert "Do not ask another clarifying question" not in captured["user"]


def test_under_cap_ask_passes_through():
    from decimal import Decimal

    from apps.core.models import CopilotSettings

    s = CopilotSettings.load()
    s.max_asks_per_conversation = 2
    s.save()

    def fake_structured(**kw):
        return _turn(kind="ask", text="Which page?"), Decimal("0.01"), "m"

    transcript = [{"role": "assistant", "text": "Earlier question?", "kind": "ask"}]
    with (
        mock.patch.object(engine.core_ai, "structured", side_effect=fake_structured),
        mock.patch.object(engine, "_pages_digest", return_value="home: blk_hero(hero)"),
        mock.patch.object(engine, "_chrome_digest", return_value="Theme: ocean; Navbar: layout=classic, cta=none"),
    ):
        payload, _ = engine.run_turn(TENANT, transcript, [], "hi")
    assert payload["kind"] == "ask"  # 1 prior ask < cap of 2
```

- [ ] **Step 2: Write the failing lib tests**

Append to `frontend-customer/src/lib/__tests__/copilot.test.ts` inside the `chat state` describe (imports already cover `reduceChat`/`toTranscript`):

```ts
it("preserves the assistant turn kind for the ask-cap", () => {
  const entries = reduceChat([], { kind: "ask", text: "Which page?" });
  expect(entries[0].kind).toBe("ask");
  expect(toTranscript(entries)[0]).toEqual({
    role: "assistant",
    text: "Which page?",
    kind: "ask",
  });
});

it("omits kind for entries that never had one", () => {
  expect(toTranscript([{ role: "coach", text: "hi" }])[0]).toEqual({
    role: "coach",
    text: "hi",
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `docker compose exec django python -m pytest apps/core/tests/test_copilot_engine.py -q` — the 3 new tests fail (`payload["kind"]` is `"ask"` in the first, no steering text).
Run: `cd frontend-customer && npm test` — the first new test fails (`entries[0].kind` is `undefined`).

- [ ] **Step 4: Implement the backend enforcement**

In `backend/apps/core/copilot/engine.py`, add above `run_turn`:

```python
CAP_STEER = (
    "\n\n(Do not ask another clarifying question this conversation — act on "
    "your best interpretation or answer directly.)"
)


def _ask_cap():
    """Superadmin knob (CopilotSettings): max clarifying questions per
    conversation. 0 = uncapped."""
    from apps.core.models import CopilotSettings

    return CopilotSettings.load().max_asks_per_conversation


def _asks_so_far(transcript):
    return sum(
        1
        for e in list(transcript)
        if isinstance(e, dict) and e.get("role") != "coach" and e.get("kind") == "ask"
    )
```

and rewrite the top of `run_turn` (through the model call and the answer/ask return) as:

```python
def run_turn(tenant, transcript, selections, message):
    cap = _ask_cap()
    capped = cap > 0 and _asks_so_far(transcript) >= cap
    user = _user_turn(tenant, transcript, selections, message)
    if capped:
        user += CAP_STEER
    parsed, cost, _model = core_ai.structured(
        system=_system(),
        user=user,
        output_model=CopilotTurn,
        model=settings.COPILOT_MODEL,
        max_tokens=4000,
    )
    if parsed.kind == "ask" and capped:
        # Hard cap: the question still reads fine as a statement-of-need,
        # but without the quick-reply ask affordance it ends the loop.
        return {"kind": "answer", "text": parsed.text}, cost
    if parsed.kind in ("answer", "ask"):
        return {"kind": parsed.kind, "text": parsed.text}, cost
```

(the cards loop below stays unchanged).

- [ ] **Step 5: Implement the frontend threading**

5a. `frontend-customer/src/lib/copilot/types.ts` — add `kind` to `ChatEntry` (it is declared after `CopilotDone`, so the reference is valid):

```ts
export interface ChatEntry {
  role: "coach" | "assistant";
  text: string;
  cards?: ActionCard[];
  kind?: CopilotDone["kind"];
}
```

5b. `frontend-customer/src/lib/copilot/state.ts` — store and forward the kind:

```ts
  return [
    ...entries,
    { role: "assistant", text: done.text ?? "", cards: done.actions, kind: done.kind },
  ];
```

and:

```ts
export function toTranscript(
  entries: ChatEntry[],
): { role: string; text: string; kind?: string }[] {
  return entries
    .filter((e) => e.text !== UNAVAILABLE_MARKER)
    .slice(-TRANSCRIPT_MAX)
    .map((e) =>
      e.kind
        ? { role: e.role, text: e.text, kind: e.kind }
        : { role: e.role, text: e.text },
    );
}
```

5c. `frontend-customer/src/lib/copilot/api.ts` — widen the converse body type:

```ts
    transcript: { role: string; text: string; kind?: string }[];
```

- [ ] **Step 6: Run everything to verify it passes**

```bash
docker compose exec django python -m pytest apps/core/tests/test_copilot_engine.py apps/core/tests/test_copilot_settings.py -q
cd frontend-customer && npm test && npm run build
```
Expected: all green.

- [ ] **Step 7: Full verification gate**

```bash
make test-changed
make lint
make e2e-spec SPEC=29-copilot
```
Expected: all green, pre-commit clean.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/core/copilot/engine.py backend/apps/core/tests/test_copilot_engine.py frontend-customer/src/lib/copilot frontend-customer/src/lib/__tests__/copilot.test.ts
git commit -m "feat(copilot): enforce superadmin ask-cap with transcript kind threading"
```

---

## Out of scope (explicitly)

- Theme *mode* (light/dim/dark) — client-side per-visitor `next-themes` preference, no server field. `dark_mode_enabled` toggling is also out (spec scope is "theme id from the catalog, navbar layout/cta").
- Navbar links editing, logo size/layout, show_login/show_install/transparent_over_hero — `edit_navbar` writes only layout and cta; the merge preserves everything else.
- A theme-swatch preview card — chrome cards use the generic `ActionCard` (first per-kind card UI can come later if wanted).
- Any per-plan or per-tenant copilot metering (`PlatformPlan.max_copilot_*`, usage meters) — the ask-cap is behavior steering, not quota (spec decisions 3 + 4). `PlatformPlan.max_site_ai_updates` stays untouched.
- KB retrieval/RAG — whole-KB injection, same as `help_bot` (~5.2k tokens, prompt-cached).
- Answer caching for KB questions (help_bot's answer-cache layer) — the copilot's turns are context-dependent (pages digest, selections); revisit only if converse cost grows.
- Conversation persistence across navigations; editing `PlatformKbEntry` from anywhere new (the existing `platform-kb` panel is the editing surface).
- `npm run gen:api`: adminkit endpoints are not in the drf-spectacular schema and no spectacular-visible serializer changes — no regen expected; if `make lint`/CI flags a schema diff anyway, regenerate and review.

## Self-review notes (done at planning time)

- **Spec coverage:** `edit_theme`/`edit_navbar` registry entry + executor + card (Tasks 1–3), widget rendering of the new kinds (Task 4), "ground answers in the platform KB … 'how do I get paid?'-class questions" (Tasks 5–7, including the coach-safe link rendering), "superadmin-configurable ask-cap platform setting (adminkit)" (Tasks 8–9). Spec's "Switch to Midnight theme" example corrected to the real six-theme catalog (design decision 1). The spec's error-handling and trust rules (single-use tokens, execute 400s with the card kept, cross-tenant 403) are inherited unchanged from Phase 1 machinery.
- **Type consistency:** stashed payloads `{"kind": "edit_theme", "theme"}` / `{"kind": "edit_navbar", "updates"}` match between Task 2 (producer) and Task 3 (consumer); `chrome.clean_theme/clean_layout/merge_navbar/ChromeOpError` names match across Tasks 1–3; `knowledge_text` matches between Task 5 (producer) and Task 6 (consumer); `CopilotSettings.load()` matches between Task 8 and Task 9; `ChatEntry.kind`/transcript `kind` naming matches state.ts ↔ api.ts ↔ engine `_asks_so_far`.
- **Conventions honored:** cache-bust + `look_edited` parity on chrome writes (`TenantConfigView.perform_update` mirror), byte-identical system prompt via fingerprint caching, function-local imports for the core↔tenant_config boundary, pure executor helpers with DB writes in the view, lib-only frontend tests, generic `ActionCard` reuse, `NavLink` (never raw `next/link`), no `sync-admin-kit.sh` (deleted — single shared copy).
- **Known judgment calls to flag in review:** (a) the over-cap coercion reuses the model's question text as an answer — cheap and safe, but if it reads oddly in practice, a re-prompt would be the upgrade; (b) `edit_navbar`'s CTA can only be set/changed, not removed; (c) engine tests now touch the DB for `CopilotSettings`/`PlatformKbEntry` (they already carry `django_db`).
