# Copilot Phase 4 — Website-Building Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the coach copilot to ~90% parity with the browser site editor: surgical per-block field edits (including links, layout variants, and select knobs), hide/show and duplicate blocks, cross-page moves, two new addable block types (stats, banner), and navbar links management.

**Architecture:** All new powers follow the existing action-registry pattern (pydantic action → `_card` branch → single-use token → `_execute` branch). The new write surface is a copilot-owned `BLOCK_SCHEMA` in `copilot/blocks.py` — deliberately **not** a widening of `ai_compose.WRITABLE_FIELDS`, so the wizard/`edit_pages` compose engine keeps its narrow copy-only trust boundary while the copilot gains the full field surface. One `clean_field()` validator serves both `add_block` and the new `edit_block_fields`. A FIELD GUIDE generated from `BLOCK_SCHEMA` at module import is appended to `SYSTEM_PROMPT` (module-level constant → byte-identical across tenants → prompt-cache safe); current field values ride in the user turn via an enriched pages digest.

**Tech Stack:** Django 5.1 + pydantic structured output (`apps/core/ai.py`), Next.js 14 widget (`components/copilot/`), pytest, Playwright (stubbed SSE).

## Global Constraints

- Nothing executes without a confirm tap; every action is validated at card time AND re-validated at execute time (tokens store raw params, executors re-clean).
- `testimonials` must remain un-addable and un-editable (fabricated social proof stays impossible — see `blocks.py` module docstring).
- `SYSTEM_PROMPT` must stay a module-level constant, byte-identical across tenants (prompt-cache rule). Tenant-specific data goes in the user turn only.
- `ai_compose.py` (`WRITABLE_FIELDS`, `FIELD_CAPS`, `_brief`, `_apply`) is NOT modified by this plan.
- Any site-config write path must keep the existing cache-bust (`cache.delete(f"tenant:{schema}:config")`) and the widget's `announceSiteUpdated()` repaint (already fired generically in `action-card.tsx` — no per-kind work needed).
- Backend field values/select options must mirror `frontend-customer/src/lib/blocks/registry.tsx` exactly (source of truth for allowed values; copied verbatim into `BLOCK_SCHEMA` below).
- Imports inside `apps/core` stay function-local where they cross apps (cycle-dodging convention).
- Pre-commit must pass; verify with `make test-app APP=core`, `make test-frontend`, `make typecheck`, `make e2e-spec SPEC=29-copilot`.
- Never claim done without running the verify commands.

## Phasing roadmap (later phases get their own plan docs)

- **Phase 5 — read grounding:** tenant-data digest + read powers (`read_students`, `read_sales`/`read_payouts`, course/event/blog inventory) so answers are grounded, not blind.
- **Phase 6 — content mutations:** `edit_course`, `add_module`/`add_lesson`/`edit_lesson`, attach library video, `edit_event`/`reschedule_event`, `create_download`/`edit_download`, `edit_blog_post` + blog images.
- **Phase 7 — drafts & presence:** `create_community_post`, inbox read + `draft_reply`, `draft_announcement`, `draft_email_campaign`, mount widget in `/admin`, conversation persistence.
- **Phase 8 — engine:** file/image intake, multi-step tool loop, undo/rollback, analytics answers.
- Excluded permanently from copilot (browser-only): deletes, publish/go-live, all sends, cancellations, money/billing/settings changes.

## File Structure

- `backend/apps/core/copilot/blocks.py` — gains `BLOCK_SCHEMA`, `clean_field`, `clean_link`, `edit_block_fields`, `set_block_enabled`, `duplicate_block`; `build_block` rewritten over the schema; `move_block` gains `to_page`.
- `backend/apps/core/copilot/chrome.py` — gains `clean_links`.
- `backend/apps/core/copilot/engine.py` — 3 new action models, `MoveBlockAction.to_page`, `EditNavbarAction.links/show_login/show_install`, `_card` branches, `_tenant_pages` helper, enriched `_pages_digest`, FIELD GUIDE appended to `SYSTEM_PROMPT`.
- `backend/apps/core/copilot/views.py` — `_execute` branches for the 3 new kinds + `to_page` threading.
- `frontend-customer/src/lib/copilot/types.ts` — 3 new `ActionKind` members.
- `frontend-customer/src/components/copilot/action-card.tsx` — extend `FIELD_NAME_KEYS`.
- `frontend-customer/src/messages/{en,tr}/student.json` — new `fieldNames` entries.
- `e2e/specs/29-copilot.spec.ts` — one new stubbed scenario.
- Tests: `backend/apps/core/tests/test_copilot_blocks.py`, `test_copilot_chrome.py`, `test_copilot_engine.py`, `test_copilot_views.py`.

---

### Task 1: BLOCK_SCHEMA + clean_field + build_block rewrite (adds stats & banner)

**Files:**
- Modify: `backend/apps/core/copilot/blocks.py`
- Test: `backend/apps/core/tests/test_copilot_blocks.py`

**Interfaces:**
- Consumes: `MAX_FAQ_ITEMS` from `apps.core.onboarding.ai_compose` (=6), `sanitize_rich_text` from `apps.tenant_config.defaults`.
- Produces: `BLOCK_SCHEMA: dict[str, dict[str, tuple]]`, `clean_field(block_type, field, value) -> cleaned` (raises `BlockOpError`), `clean_link(value) -> str`, and `build_block(block_type, fields) -> dict` (signature unchanged). Later tasks import all of these from `apps.core.copilot.blocks`.

- [ ] **Step 1: Write the failing tests** (append to `test_copilot_blocks.py`)

```python
def test_clean_field_select_link_and_bool():
    assert blocks.clean_field("hero", "layout", "split") == "split"
    with pytest.raises(blocks.BlockOpError):
        blocks.clean_field("hero", "layout", "diagonal")
    assert blocks.clean_field("hero", "ctaHref", "/pricing") == "/pricing"
    with pytest.raises(blocks.BlockOpError):
        blocks.clean_field("hero", "ctaHref", "javascript:alert(1)")
    assert blocks.clean_field("banner", "dismissible", 1) is True
    with pytest.raises(blocks.BlockOpError):
        blocks.clean_field("hero", "nope", "x")


def test_build_block_stats_and_banner_addable():
    stats = blocks.build_block("stats", {"layout": "band", "items": [{"value": "500+", "label": "Students"}] * 20})
    assert stats["layout"] == "band" and len(stats["items"]) == 8
    assert stats["items"][0] == {"value": "500+", "label": "Students"}
    banner = blocks.build_block("banner", {"text": "Sale!", "linkHref": "/pricing", "dismissible": True})
    assert banner["text"] == "Sale!" and banner["dismissible"] is True


def test_build_block_accepts_presentation_fields():
    b = blocks.build_block("hero", {"heading": "Hi", "ctaHref": "/courses", "overlay": "light"})
    assert b["ctaHref"] == "/courses" and b["overlay"] == "light"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `make test-app APP=core` (or targeted: `make shell` then `pytest apps/core/tests/test_copilot_blocks.py -q`)
Expected: FAIL — `blocks.clean_field` does not exist; `build_block("stats", ...)` raises `unknown block type`.

- [ ] **Step 3: Implement**

In `blocks.py`, replace the `FIELD_CAPS`/`WRITABLE_FIELDS` import with `MAX_FAQ_ITEMS` only, and replace `_clamp` + `build_block` with:

```python
from apps.core.onboarding.ai_compose import MAX_FAQ_ITEMS
from apps.tenant_config.defaults import sanitize_rich_text

_UNSAFE_URL_PREFIXES = ("javascript:", "data:", "vbscript:")
_H = ("text", 120)
MAX_STATS_ITEMS = 8

# Mirrors frontend-customer/src/lib/blocks/registry.tsx (selects verbatim).
# testimonials is deliberately absent; gallery/logos/video wait on image/URL
# handling (Phase 8 file intake).
BLOCK_SCHEMA = {
    "hero": {
        "layout": ("select", ("centered", "split", "minimal")),
        "heading": _H,
        "subheading": ("text", 200),
        "ctaText": ("text", 40),
        "ctaHref": ("link",),
        "overlay": ("select", ("none", "dark", "light")),
        "overlayStrength": ("select", ("light", "medium", "strong")),
    },
    "richText": {
        "layout": ("select", ("standard", "centered", "wide")),
        "heading": _H,
        "headingLevel": ("select", ("h1", "h2", "h3", "h4")),
        "body": ("rich", 2000),
    },
    "imageText": {
        "layout": ("select", ("split", "stacked", "card")),
        "heading": _H,
        "headingLevel": ("select", ("h1", "h2", "h3", "h4")),
        "body": ("rich", 2000),
        "imagePosition": ("select", ("right", "left")),
    },
    "cta": {
        "layout": ("select", ("centered", "banner", "split")),
        "heading": _H,
        "buttonText": ("text", 40),
        "buttonHref": ("link",),
        "secondaryButtonText": ("text", 40),
        "secondaryButtonHref": ("link",),
    },
    "faq": {
        "layout": ("select", ("accordion", "open", "columns")),
        "heading": _H,
        "items": ("items", {"q": 150, "a": 500}, MAX_FAQ_ITEMS),
    },
    "contact": {
        "layout": ("select", ("centered", "split", "card")),
        "heading": _H,
        "intro": ("text", 200),
        "submitLabel": ("text", 40),
        "successMessage": ("text", 200),
    },
    "courseGrid": {"layout": ("select", ("standard", "centered")), "heading": _H},
    "pricingPlans": {"layout": ("select", ("cards", "compact")), "heading": _H, "subheading": ("text", 200)},
    "upcomingEvents": {"layout": ("select", ("grid", "list")), "heading": _H},
    "storeProducts": {"layout": ("select", ("grid", "list")), "heading": _H},
    "stats": {
        "layout": ("select", ("cards", "plain", "band")),
        "heading": _H,
        "items": ("items", {"value": 40, "label": 80}, MAX_STATS_ITEMS),
    },
    "banner": {
        "layout": ("select", ("bar", "full", "soft")),
        "text": ("text", 150),
        "linkText": ("text", 40),
        "linkHref": ("link",),
        "dismissible": ("bool",),
    },
}


def clean_link(value):
    """Same semantics as tenant_config's _clean_nav_href, but refusing (not
    blanking) unsafe schemes so the coach gets an honest card-drop reason."""
    href = str(value or "").strip()
    if href.lower().startswith(_UNSAFE_URL_PREFIXES):
        raise BlockOpError("links must be site paths like /courses or https:// URLs")
    return href[:300]


def clean_field(block_type, field, value):
    spec = (BLOCK_SCHEMA.get(block_type) or {}).get(field)
    if spec is None:
        raise BlockOpError(f"{block_type} has no editable field '{field}'")
    kind = spec[0]
    if kind == "text":
        return str(value)[: spec[1]]
    if kind == "rich":
        return sanitize_rich_text(str(value)[: spec[1]])
    if kind == "select":
        v = str(value).strip()
        if v not in spec[1]:
            raise BlockOpError(f"{field} must be one of: " + ", ".join(spec[1]))
        return v
    if kind == "link":
        return clean_link(value)
    if kind == "bool":
        return bool(value)
    _, item_caps, max_items = spec
    return [
        {k: str(it.get(k, ""))[:cap] for k, cap in item_caps.items()}
        for it in list(value or [])[:max_items]
        if isinstance(it, dict)
    ]


def build_block(block_type, fields):
    schema = BLOCK_SCHEMA.get(block_type)
    if schema is None:
        raise BlockOpError(f"unknown block type: {block_type}")
    block = {"id": mint_block_id(), "type": block_type, "enabled": True}
    for field, value in (fields or {}).items():
        if field in schema:
            block[field] = clean_field(block_type, field, value)
    return block
```

Note: `build_block` still silently ignores unknown fields (matches the existing `evil`-field test) but now RAISES on a known select field with a bad value — the engine's `_card` try/except turns that into an honest card drop.

- [ ] **Step 4: Run tests to verify they pass**

Run: `make test-app APP=core`
Expected: all `test_copilot_blocks.py` tests PASS, including the pre-existing clamp/sanitize/testimonials tests (heading cap 120, faq items cap 6, `testimonials` still rejected).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/blocks.py backend/apps/core/tests/test_copilot_blocks.py
git commit -m "feat(copilot): BLOCK_SCHEMA field surface — links, selects, layout, stats & banner types

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `edit_block_fields` pure operation

**Files:**
- Modify: `backend/apps/core/copilot/blocks.py`
- Test: `backend/apps/core/tests/test_copilot_blocks.py`

**Interfaces:**
- Consumes: `clean_field`, `_page_blocks`, `_index_of` from Task 1 / existing module.
- Produces: `edit_block_fields(pages, page, block_id, fields) -> (new_pages, changes)` where `changes` is a list of `{"field": str, "old": str | None, "new": str | None}` (old/new are display previews, ≤200 chars; list values render as `"N item(s)"`). Raises `BlockOpError` on unknown page/block/field, invalid value, empty fields, or no-op.

- [ ] **Step 1: Write the failing tests**

```python
def test_edit_block_fields_changes_and_previews():
    new_pages, changes = blocks.edit_block_fields(
        PAGES, "home", "blk_hero", {"heading": "Welcome!", "ctaHref": "/pricing"}
    )
    hero = new_pages["home"]["blocks"][0]
    assert hero["heading"] == "Welcome!" and hero["ctaHref"] == "/pricing"
    assert {c["field"] for c in changes} == {"heading", "ctaHref"}
    assert next(c for c in changes if c["field"] == "heading") == {
        "field": "heading", "old": "Hi", "new": "Welcome!",
    }
    assert PAGES["home"]["blocks"][0]["heading"] == "Hi"  # input not mutated


def test_edit_block_fields_rejects_noop_empty_and_bad_values():
    with pytest.raises(blocks.BlockOpError):
        blocks.edit_block_fields(PAGES, "home", "blk_hero", {})
    with pytest.raises(blocks.BlockOpError):
        blocks.edit_block_fields(PAGES, "home", "blk_hero", {"heading": "Hi"})  # already that value
    with pytest.raises(blocks.BlockOpError):
        blocks.edit_block_fields(PAGES, "home", "blk_hero", {"layout": "diagonal"})
    with pytest.raises(blocks.BlockOpError):
        blocks.edit_block_fields(PAGES, "home", "blk_missing", {"heading": "x"})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `make test-app APP=core`
Expected: FAIL with `AttributeError: module ... has no attribute 'edit_block_fields'`.

- [ ] **Step 3: Implement** (append to `blocks.py`)

```python
def _preview(value):
    if value is None:
        return None
    if isinstance(value, list):
        return f"{len(value)} item(s)"
    return str(value)[:200]


def edit_block_fields(pages, page, block_id, fields):
    """Surgical field writes on one block. Returns (new_pages, changes);
    changes carry display previews for the confirm card's diff rows."""
    if not fields:
        raise BlockOpError("no fields to change")
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    block = blocks_[_index_of(blocks_, block_id, page)]
    changes = []
    for field, value in fields.items():
        cleaned = clean_field(block.get("type"), field, value)
        if block.get(field) == cleaned:
            continue
        changes.append({"field": field, "old": _preview(block.get(field)), "new": _preview(cleaned)})
        block[field] = cleaned
    if not changes:
        raise BlockOpError("those fields already have those values")
    return new_pages, changes
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `make test-app APP=core` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/blocks.py backend/apps/core/tests/test_copilot_blocks.py
git commit -m "feat(copilot): edit_block_fields pure op with diff previews

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: toggle, duplicate, and cross-page move pure operations

**Files:**
- Modify: `backend/apps/core/copilot/blocks.py`
- Test: `backend/apps/core/tests/test_copilot_blocks.py`

**Interfaces:**
- Produces: `set_block_enabled(pages, page, block_id, enabled) -> new_pages` (raises on no-op), `duplicate_block(pages, page, block_id) -> (new_pages, new_block_id)`, and `move_block(pages, page, block_id, after_block_id, to_page=None) -> new_pages` (backward-compatible: existing 4-arg callers unaffected; `to_page` moves the block to another page, `after_block_id` then refers to a block on the TARGET page, `None` = top of target).

- [ ] **Step 1: Write the failing tests**

```python
def test_set_block_enabled_toggles_and_rejects_noop():
    hidden = blocks.set_block_enabled(PAGES, "home", "blk_hero", False)
    assert hidden["home"]["blocks"][0]["enabled"] is False
    with pytest.raises(blocks.BlockOpError):
        blocks.set_block_enabled(PAGES, "home", "blk_hero", True)  # already visible


def test_duplicate_block_inserts_copy_with_fresh_id():
    new_pages, new_id = blocks.duplicate_block(PAGES, "home", "blk_hero")
    ids = [b["id"] for b in new_pages["home"]["blocks"]]
    assert ids == ["blk_hero", new_id, "blk_intro"] and new_id != "blk_hero"
    assert new_pages["home"]["blocks"][1]["heading"] == "Hi"


def test_move_block_across_pages():
    pages = {"home": {"blocks": [dict(HERO)]}, "about": {"blocks": [dict(INTRO)]}}
    moved = blocks.move_block(pages, "home", "blk_hero", None, to_page="about")
    assert [b["id"] for b in moved["home"]["blocks"]] == []
    assert [b["id"] for b in moved["about"]["blocks"]] == ["blk_hero", "blk_intro"]
    after = blocks.move_block(pages, "home", "blk_hero", "blk_intro", to_page="about")
    assert [b["id"] for b in after["about"]["blocks"]] == ["blk_intro", "blk_hero"]
    with pytest.raises(blocks.BlockOpError):
        blocks.move_block(pages, "home", "blk_hero", None, to_page="nope")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `make test-app APP=core` — Expected: FAIL (`set_block_enabled` missing; `move_block` rejects `to_page` kwarg).

- [ ] **Step 3: Implement** — replace `move_block` and append the two new ops:

```python
def move_block(pages, page, block_id, after_block_id, to_page=None):
    new_pages = deepcopy(pages)
    source = _page_blocks(new_pages, page)
    target_page = to_page or page
    target = _page_blocks(new_pages, target_page)  # validate target BEFORE popping
    moving = source.pop(_index_of(source, block_id, page))
    if after_block_id is None:
        target.insert(0, moving)
    else:
        target.insert(_index_of(target, after_block_id, target_page) + 1, moving)
    return new_pages


def set_block_enabled(pages, page, block_id, enabled):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    block = blocks_[_index_of(blocks_, block_id, page)]
    if bool(block.get("enabled", True)) == bool(enabled):
        raise BlockOpError(f"{block_id} is already {'visible' if enabled else 'hidden'}")
    block["enabled"] = bool(enabled)
    return new_pages


def duplicate_block(pages, page, block_id):
    new_pages = deepcopy(pages)
    blocks_ = _page_blocks(new_pages, page)
    i = _index_of(blocks_, block_id, page)
    copy_ = deepcopy(blocks_[i])
    copy_["id"] = mint_block_id()
    blocks_.insert(i + 1, copy_)
    return new_pages, copy_["id"]
```

(Note the same-page move edge: when `to_page` is None/`== page`, `source` and `target` alias the same list, preserving the existing 4-arg semantics exactly.)

- [ ] **Step 4: Run tests to verify they pass** — `make test-app APP=core`, all existing move tests must also still pass.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/blocks.py backend/apps/core/tests/test_copilot_blocks.py
git commit -m "feat(copilot): toggle, duplicate, and cross-page block moves

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `chrome.clean_links` for navbar links

**Files:**
- Modify: `backend/apps/core/copilot/chrome.py`
- Test: `backend/apps/core/tests/test_copilot_chrome.py`

**Interfaces:**
- Consumes: `TenantConfigSerializer.validate_navbar_config` (existing admin allowlist — layout enum, label[:80], `_clean_nav_href`, max 20 links).
- Produces: `clean_links(links) -> list[{"label": str, "href": str}]`; raises `ChromeOpError` for non-list input, >20 items, or when nothing survives cleaning (empty label/href, stripped unsafe scheme).

- [ ] **Step 1: Write the failing tests**

```python
def test_clean_links_validates_via_serializer_allowlist():
    cleaned = chrome.clean_links([
        {"label": "Courses", "href": "/courses"},
        {"label": "Evil", "href": "javascript:alert(1)"},  # href blanked -> dropped
    ])
    assert cleaned == [{"label": "Courses", "href": "/courses"}]


def test_clean_links_rejects_bad_shapes():
    with pytest.raises(chrome.ChromeOpError):
        chrome.clean_links("not-a-list")
    with pytest.raises(chrome.ChromeOpError):
        chrome.clean_links([{"label": "x", "href": "/a"}] * 21)
    with pytest.raises(chrome.ChromeOpError):
        chrome.clean_links([{"label": "", "href": ""}])
```

- [ ] **Step 2: Run tests to verify they fail** — `make test-app APP=core`, expect `AttributeError: clean_links`.

- [ ] **Step 3: Implement** (append to `chrome.py`)

```python
def clean_links(links):
    from rest_framework import serializers as drf_serializers

    from apps.tenant_config.serializers import TenantConfigSerializer

    if not isinstance(links, list):
        raise ChromeOpError("navbar links must be a list")
    if len(links) > 20:
        raise ChromeOpError("navbar supports up to 20 links")
    try:
        cleaned = TenantConfigSerializer().validate_navbar_config({"links": links})
    except drf_serializers.ValidationError as exc:
        detail = exc.detail
        if isinstance(detail, list) and detail:
            detail = detail[0]
        raise ChromeOpError(str(detail)) from exc
    out = [link for link in cleaned["links"] if link["label"] and link["href"]]
    if not out:
        raise ChromeOpError("every navbar link needs a label and a safe link")
    return out
```

- [ ] **Step 4: Run tests to verify they pass** — `make test-app APP=core`.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/chrome.py backend/apps/core/tests/test_copilot_chrome.py
git commit -m "feat(copilot): clean_links navbar-link validation via the admin allowlist

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Engine — new actions, cards, FIELD GUIDE prompt, enriched digest

**Files:**
- Modify: `backend/apps/core/copilot/engine.py`
- Test: `backend/apps/core/tests/test_copilot_engine.py`

**Interfaces:**
- Consumes: `blocks.BLOCK_SCHEMA`, `blocks.edit_block_fields`, `blocks.set_block_enabled`, `blocks.duplicate_block`, `blocks.move_block(..., to_page=)`, `chrome.clean_links` from Tasks 1–4.
- Produces (relied on by Task 6/7): action token payloads `{"kind": "edit_block_fields", "page", "block_id", "fields"}`, `{"kind": "toggle_block", "page", "block_id", "enabled"}`, `{"kind": "duplicate_block", "page", "block_id"}`, move payload gains optional `"to_page"`, navbar `updates` may carry `"links"`, `"show_login"`, `"show_install"`. Card kinds `edit_block_fields` (with `changes` rows shaped like the existing `DiffRow`: `{page, block_type, field, old, new}`), `toggle_block`, `duplicate_block`.

- [ ] **Step 1: Write the failing tests** (append; follow the file's existing fake-tenant/monkeypatch conventions — it already builds tenants with `wizard_state` and stubs `core_ai.structured`)

```python
def test_system_prompt_contains_field_guide_and_new_actions():
    assert "edit_block_fields" in engine.SYSTEM_PROMPT
    assert "toggle_block" in engine.SYSTEM_PROMPT
    assert "duplicate_block" in engine.SYSTEM_PROMPT
    assert "stats" in engine.SYSTEM_PROMPT and "banner" in engine.SYSTEM_PROMPT
    assert "overlay(none|dark|light)" in engine.SYSTEM_PROMPT  # generated FIELD GUIDE


def test_edit_block_fields_card_carries_diff_rows(tenant_with_pages):
    action = engine.EditBlockFieldsAction(
        kind="edit_block_fields", page="home", block_id="blk_hero",
        fields={"heading": "New headline"},
    )
    card = engine._card(tenant_with_pages, action)
    assert card["kind"] == "edit_block_fields"
    assert card["changes"][0]["field"] == "heading"
    assert card["changes"][0]["new"] == "New headline"
    assert card["token"]


def test_toggle_and_duplicate_cards_validate_against_current_pages(tenant_with_pages):
    toggle = engine.ToggleBlockAction(kind="toggle_block", page="home", block_id="blk_hero", enabled=False)
    assert engine._card(tenant_with_pages, toggle)["kind"] == "toggle_block"
    dup = engine.DuplicateBlockAction(kind="duplicate_block", page="home", block_id="blk_missing")
    with pytest.raises(blocks.BlockOpError):
        engine._card(tenant_with_pages, dup)


def test_navbar_card_with_links_and_flags(tenant_with_pages):
    action = engine.EditNavbarAction(
        kind="edit_navbar",
        links=[engine.NavLinkItem(label="Courses", href="/courses")],
        show_login=False,
    )
    card = engine._card(tenant_with_pages, action)
    assert "Courses" in card["detail"] and "login" in card["detail"].lower()


def test_pages_digest_lists_field_values_and_hidden_flag(tenant_with_pages):
    digest = engine._pages_digest(tenant_with_pages)
    assert 'heading="Hi"' in digest  # current values now visible to the model
```

(If the test file has no `tenant_with_pages` fixture, add one mirroring its existing tenant-factory pattern with `pages={"home": {"blocks": [{"id": "blk_hero", "type": "hero", "enabled": True, "heading": "Hi"}]}}`.)

- [ ] **Step 2: Run tests to verify they fail** — `make test-app APP=core`. Expected: FAIL (`EditBlockFieldsAction` missing, prompt assertions fail).

- [ ] **Step 3: Implement — action models + union**

```python
class EditBlockFieldsAction(BaseModel):
    kind: Literal["edit_block_fields"]
    page: str
    block_id: str
    fields: dict = Field(default_factory=dict)


class ToggleBlockAction(BaseModel):
    kind: Literal["toggle_block"]
    page: str
    block_id: str
    enabled: bool


class DuplicateBlockAction(BaseModel):
    kind: Literal["duplicate_block"]
    page: str
    block_id: str


class NavLinkItem(BaseModel):
    label: str
    href: str
```

Extend `MoveBlockAction` with `to_page: str | None = None`; extend `EditNavbarAction` with `links: list[NavLinkItem] | None = None`, `show_login: bool | None = None`, `show_install: bool | None = None`. Add the three new actions to the `CopilotAction` union.

- [ ] **Step 4: Implement — `_tenant_pages` helper and digest enrichment**

Add the helper and rewrite `_pages_digest` (also refactor `_block_for_image` to reuse the helper):

```python
def _tenant_pages(tenant):
    from apps.tenant_config.models import TenantConfig

    with tenant_context(tenant):
        cfg = TenantConfig.objects.first()
        return (cfg.pages if cfg else None) or {}


def _pages_digest(tenant):
    """Bounded snapshot for the user turn: per page, each block's id, type,
    hidden flag, and current writable-field values (truncated) so the model
    can propose precise edit_block_fields changes."""
    lines = []
    for page, page_value in _tenant_pages(tenant).items():
        blocks_ = blocks.page_blocks(page_value)
        if blocks_ is None:
            continue
        lines.append(f"page={page}")
        for b in blocks_:
            if not isinstance(b, dict):
                continue
            schema = blocks.BLOCK_SCHEMA.get(b.get("type"), {})
            flags = "" if b.get("enabled", True) else " [hidden]"
            vals = " ".join(
                f"{f}={len(b.get(f) or [])} item(s)" if isinstance(b.get(f), list)
                else f'{f}="{str(b.get(f))[:60]}"'
                for f in schema
                if b.get(f) not in (None, "")
            )
            lines.append(f"  {b.get('id')} {b.get('type')}{flags} {vals}".rstrip())
    return "\n".join(lines) or "(no pages yet)"
```

- [ ] **Step 5: Implement — FIELD GUIDE + SYSTEM_PROMPT additions**

Append after the existing action list inside `SYSTEM_PROMPT` (edit the existing string):

```python
    "- edit_block_fields: change specific fields on one existing block "
    "(page + block_id from the digest, fields per the block field guide "
    "below) — prefer this over edit_pages for single-block changes\n"
    "- toggle_block: hide (enabled=false) or show (enabled=true) a block "
    "without deleting it — prefer this over remove_block when the coach "
    "says 'hide' or might want it back\n"
    "- duplicate_block: copy a block in place\n"
    "- move_block also accepts to_page to move a block to another page\n"
    "- edit_navbar additionally accepts links (full replacement list of "
    "{label, href}) and show_login / show_install booleans\n"
```

Update the `add_block` line's type list to include `stats` and `banner`. Then generate the guide at module scope (below the schema import, above the action models):

```python
def _field_guide():
    lines = ["Block field guide (add_block and edit_block_fields):"]
    for btype, schema in blocks.BLOCK_SCHEMA.items():
        parts = []
        for field, spec in schema.items():
            if spec[0] == "select":
                parts.append(f"{field}({'|'.join(spec[1])})")
            elif spec[0] == "link":
                parts.append(f"{field}(link)")
            elif spec[0] == "bool":
                parts.append(f"{field}(true/false)")
            elif spec[0] == "items":
                parts.append(f"items({{{'/'.join(spec[1])}}} max {spec[2]})")
            else:
                parts.append(field)
        lines.append(f"{btype}: {', '.join(parts)}")
    lines.append("Links are site paths like /courses (or full https URLs).")
    return "\n".join(lines)


SYSTEM_PROMPT = SYSTEM_PROMPT + "\n" + _field_guide()
```

(`BLOCK_SCHEMA` is a module constant, so the composed prompt stays byte-identical across tenants — the prompt-cache rule holds.)

- [ ] **Step 6: Implement — `_card` branches**

```python
    if isinstance(action, EditBlockFieldsAction):
        pages_snapshot = _tenant_pages(tenant)
        _, changes = blocks.edit_block_fields(pages_snapshot, action.page, action.block_id, action.fields)
        page_blocks_ = blocks.page_blocks(pages_snapshot.get(action.page)) or []
        block = next((b for b in page_blocks_ if isinstance(b, dict) and b.get("id") == action.block_id), {})
        rows = [
            {"page": action.page, "block_type": block.get("type", ""), "field": c["field"], "old": c["old"], "new": c["new"]}
            for c in changes
        ]
        return {
            "kind": "edit_block_fields",
            "title": f"Update the {block.get('type', 'block')} on {action.page}",
            "detail": f"{len(rows)} field(s) change",
            "changes": rows,
            "token": tokens.stash_action(schema, action.model_dump()),
        }
    if isinstance(action, ToggleBlockAction):
        blocks.set_block_enabled(_tenant_pages(tenant), action.page, action.block_id, action.enabled)
        verb = "Show" if action.enabled else "Hide"
        return {
            "kind": "toggle_block",
            "title": f"{verb} {action.block_id} on {action.page}",
            "detail": "The section stays saved — flip it back anytime.",
            "token": tokens.stash_action(schema, action.model_dump()),
        }
    if isinstance(action, DuplicateBlockAction):
        blocks.duplicate_block(_tenant_pages(tenant), action.page, action.block_id)
        return {
            "kind": "duplicate_block",
            "title": f"Duplicate {action.block_id} on {action.page}",
            "detail": "The copy lands right below the original.",
            "token": tokens.stash_action(schema, action.model_dump()),
        }
```

In the existing `MoveBlockAction` branch, extend the detail and keep `action.model_dump()` as the token payload (it now includes `to_page`):

```python
        detail = "to the top" if action.after_block_id is None else f"after {action.after_block_id}"
        if action.to_page:
            detail = f"to {action.to_page} ({detail})"
```

In the existing `EditNavbarAction` branch, after the cta handling add:

```python
        if action.links is not None:
            updates["links"] = chrome.clean_links([item.model_dump() for item in action.links])
        if action.show_login is not None:
            updates["show_login"] = action.show_login
        if action.show_install is not None:
            updates["show_install"] = action.show_install
```

and extend the `parts` detail builder:

```python
        if "links" in updates:
            parts.append("links: " + ", ".join(f"'{l['label']}'" for l in updates["links"]))
        if "show_login" in updates:
            parts.append(f"login button {'shown' if updates['show_login'] else 'hidden'}")
        if "show_install" in updates:
            parts.append(f"install button {'shown' if updates['show_install'] else 'hidden'}")
```

- [ ] **Step 7: Run tests** — `make test-app APP=core`. Fix any pre-existing digest-format assertions in `test_copilot_engine.py` to the new `page=home` / value-listing format (the old format was `home: blk_x(hero: Hi)`), then all PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/apps/core/copilot/engine.py backend/apps/core/tests/test_copilot_engine.py
git commit -m "feat(copilot): edit_block_fields/toggle/duplicate actions, navbar links, field-guide prompt, value-rich digest

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Execute view branches

**Files:**
- Modify: `backend/apps/core/copilot/views.py` (the `_execute` block-ops section)
- Test: `backend/apps/core/tests/test_copilot_views.py`

**Interfaces:**
- Consumes: token payloads exactly as produced in Task 5; `blocks.edit_block_fields` / `set_block_enabled` / `duplicate_block` / `move_block(to_page=)` from Tasks 2–3.
- Produces: execute results `{"kind": <kind>, "page": <page>}` for all four block-op kinds (the existing generic tail). Navbar links/flags need NO view change — `merge_navbar` already validates them.

- [ ] **Step 1: Write the failing tests** (follow the file's existing pattern: mint a token with `tokens.stash_action(schema, payload)`, POST to the execute endpoint as a coach, assert on `TenantConfig.pages`)

```python
def test_execute_edit_block_fields_writes_and_cachebusts(coach_client, tenant_cfg):
    token = tokens.stash_action(SCHEMA, {
        "kind": "edit_block_fields", "page": "home", "block_id": "blk_hero",
        "fields": {"heading": "Fresh"},
    })
    res = coach_client.post(EXECUTE_URL, {"token": token}, format="json")
    assert res.status_code == 200
    tenant_cfg.refresh_from_db()
    assert tenant_cfg.pages["home"]["blocks"][0]["heading"] == "Fresh"


def test_execute_toggle_and_duplicate_block(coach_client, tenant_cfg):
    token = tokens.stash_action(SCHEMA, {"kind": "toggle_block", "page": "home", "block_id": "blk_hero", "enabled": False})
    assert coach_client.post(EXECUTE_URL, {"token": token}, format="json").status_code == 200
    tenant_cfg.refresh_from_db()
    assert tenant_cfg.pages["home"]["blocks"][0]["enabled"] is False

    token = tokens.stash_action(SCHEMA, {"kind": "duplicate_block", "page": "home", "block_id": "blk_hero"})
    assert coach_client.post(EXECUTE_URL, {"token": token}, format="json").status_code == 200
    tenant_cfg.refresh_from_db()
    assert len(tenant_cfg.pages["home"]["blocks"]) == 3  # hero + copy + intro


def test_execute_move_block_to_page(coach_client, tenant_cfg):
    token = tokens.stash_action(SCHEMA, {
        "kind": "move_block", "page": "home", "block_id": "blk_hero",
        "after_block_id": None, "to_page": "about",
    })
    assert coach_client.post(EXECUTE_URL, {"token": token}, format="json").status_code == 200
    tenant_cfg.refresh_from_db()
    assert tenant_cfg.pages["about"]["blocks"][0]["id"] == "blk_hero"


def test_execute_edit_navbar_links(coach_client, tenant_cfg):
    token = tokens.stash_action(SCHEMA, {
        "kind": "edit_navbar",
        "updates": {"links": [{"label": "Courses", "href": "/courses"}], "show_login": False},
    })
    assert coach_client.post(EXECUTE_URL, {"token": token}, format="json").status_code == 200
    tenant_cfg.refresh_from_db()
    assert tenant_cfg.navbar_config["links"] == [{"label": "Courses", "href": "/courses"}]
    assert tenant_cfg.navbar_config["show_login"] is False
```

(Reuse the file's actual fixture/constant names — `SCHEMA`, `EXECUTE_URL`, coach client, and a `tenant_cfg` seeded with `pages={"home": {"blocks": [hero, intro]}, "about": {"blocks": []}}`. If its fixtures are named differently, adapt the test bodies, not the assertions.)

- [ ] **Step 2: Run tests to verify they fail** — `make test-app APP=core`. Expected: the three new kinds 400 with `unknown action`.

- [ ] **Step 3: Implement** — in `views._execute`, replace the block-op `if/elif` chain tail with:

```python
        if kind == "add_block":
            pages = blocks.add_block(pages, action["page"], action["block"], action.get("after_block_id"))
        elif kind == "remove_block":
            pages = blocks.remove_block(pages, action["page"], action["block_id"])
        elif kind == "move_block":
            pages = blocks.move_block(
                pages, action["page"], action["block_id"], action.get("after_block_id"),
                to_page=action.get("to_page"),
            )
        elif kind == "edit_block_fields":
            pages, _ = blocks.edit_block_fields(pages, action["page"], action["block_id"], action.get("fields") or {})
        elif kind == "toggle_block":
            pages = blocks.set_block_enabled(pages, action["page"], action["block_id"], action["enabled"])
        elif kind == "duplicate_block":
            pages, _ = blocks.duplicate_block(pages, action["page"], action["block_id"])
        else:
            raise blocks.BlockOpError(f"unknown action: {kind}")
```

- [ ] **Step 4: Run tests to verify they pass** — `make test-app APP=core`, full copilot suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/copilot/views.py backend/apps/core/tests/test_copilot_views.py
git commit -m "feat(copilot): execute paths for edit_block_fields, toggle, duplicate, cross-page move

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend types + i18n, e2e scenario, full verification

**Files:**
- Modify: `frontend-customer/src/lib/copilot/types.ts`
- Modify: `frontend-customer/src/components/copilot/action-card.tsx:26-34` (`FIELD_NAME_KEYS`)
- Modify: `frontend-customer/src/messages/en/student.json`, `frontend-customer/src/messages/tr/student.json` (`student.copilot.fieldNames`)
- Modify: `e2e/specs/29-copilot.spec.ts`

**Interfaces:**
- Consumes: card kinds and `changes` rows exactly as produced by Task 5. No new API shapes — `ActionCard`/`DiffRow`/`ExecuteResult` interfaces already fit; `announceSiteUpdated()` + `router.refresh()` already fire on every confirm, covering all new kinds.

- [ ] **Step 1: Extend `ActionKind`** in `types.ts`:

```ts
export type ActionKind =
  | "edit_pages"
  | "add_block"
  | "remove_block"
  | "move_block"
  | "edit_block_fields"
  | "toggle_block"
  | "duplicate_block"
  | "create_course"
  | "create_event"
  | "create_blog_post"
  | "edit_theme"
  | "edit_navbar"
  | "set_block_image";
```

- [ ] **Step 2: Extend `FIELD_NAME_KEYS`** in `action-card.tsx` and add matching `fieldNames` entries to BOTH locale files:

```ts
const FIELD_NAME_KEYS = new Set([
  "heading", "subheading", "body", "ctaText", "buttonText", "intro", "items",
  "ctaHref", "buttonHref", "secondaryButtonText", "secondaryButtonHref",
  "layout", "headingLevel", "imagePosition", "overlay", "overlayStrength",
  "text", "linkText", "linkHref", "submitLabel", "successMessage",
]);
```

`en/student.json` → inside `student.copilot.fieldNames` add: `"ctaHref": "Button link"`, `"buttonHref": "Button link"`, `"secondaryButtonText": "Second button text"`, `"secondaryButtonHref": "Second button link"`, `"layout": "Layout"`, `"headingLevel": "Heading size"`, `"imagePosition": "Image position"`, `"overlay": "Image shade"`, `"overlayStrength": "Shade strength"`, `"text": "Text"`, `"linkText": "Link text"`, `"linkHref": "Link"`, `"submitLabel": "Submit button"`, `"successMessage": "Success message"`. Mirror in `tr/student.json` (e.g. `"ctaHref": "Buton bağlantısı"`, `"layout": "Yerleşim"`, `"headingLevel": "Başlık boyutu"`, `"imagePosition": "Görsel konumu"`, `"overlay": "Görsel gölgesi"`, `"overlayStrength": "Gölge şiddeti"`, `"text": "Metin"`, `"linkText": "Bağlantı metni"`, `"linkHref": "Bağlantı"`, `"submitLabel": "Gönder butonu"`, `"successMessage": "Başarı mesajı"`, `"secondaryButtonText": "İkinci buton metni"`, `"secondaryButtonHref": "İkinci buton bağlantısı"`, `"buttonHref": "Buton bağlantısı"`).

- [ ] **Step 3: Add one stubbed e2e scenario** to `29-copilot.spec.ts`, mirroring the existing `add_block` scenario at lines 17–31 (same route-fulfill SSE pattern):

```ts
test("edit_block_fields card shows diff rows and confirms", async ({ page }) => {
  await loginAsCoach(page); // reuse the spec's existing auth helper
  await page.route("**/api/v1/admin/copilot/converse/", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body:
        'data: {"type":"phase","phase":"thinking"}\n\n' +
        'data: {"type":"done","kind":"actions","text":"Updating the hero.",' +
        '"actions":[{"kind":"edit_block_fields","title":"Update the hero on home",' +
        '"detail":"1 field(s) change",' +
        '"changes":[{"page":"home","block_type":"hero","field":"ctaHref","old":"/courses","new":"/pricing"}],' +
        '"token":"e2e-fields-token"}]}\n\n',
    });
  });
  await page.route("**/api/v1/admin/copilot/execute/", async (route) => {
    await route.fulfill({ json: { result: { kind: "edit_block_fields", page: "home" } } });
  });
  // open widget, send a message, confirm the card — copy the interaction
  // steps verbatim from the add_block scenario above it, then:
  await expect(page.getByText("Update the hero on home")).toBeVisible();
  await expect(page.getByText("/pricing")).toBeVisible();
});
```

Also add the spec's file entry to `e2e/impact-map.json` for the touched copilot backend files if not already mapped (the selector self-test in `make lint` fails otherwise).

- [ ] **Step 4: Full verification**

Run, in order, and confirm each is green:
- `make test-app APP=core`
- `make test-frontend`
- `make typecheck`
- `make lint`
- `make e2e-spec SPEC=29-copilot`

- [ ] **Step 5: Commit**

```bash
git add frontend-customer/src/lib/copilot/types.ts frontend-customer/src/components/copilot/action-card.tsx \
  frontend-customer/src/messages/en/student.json frontend-customer/src/messages/tr/student.json \
  e2e/specs/29-copilot.spec.ts e2e/impact-map.json
git commit -m "feat(copilot): frontend kinds + field names + e2e for website-parity actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** filtered-roadmap §1 rows → Task 1 (whitelist widening incl. links/selects/layout, stats+banner), Task 2 (`edit_block_fields`), Task 3 (toggle/duplicate/cross-page move), Task 4+5 (`edit_navbar_links` + show flags), Task 5 (prompt/digest so the model can actually use the powers), Task 6 (execute), Task 7 (frontend/e2e). Deferred by design: gallery/logos/video block types and non-curated images (Phase 8 file intake), Logo Studio (deep-link), `set_block_image` on more block types (small follow-up, not blocking).
- **Trust boundary:** `ai_compose.WRITABLE_FIELDS` untouched; `edit_pages` stays copy-only; testimonials still impossible; links cleaned with `_clean_nav_href` semantics; navbar goes through the admin serializer allowlist.
- **Digest format change** (Task 5) intentionally breaks old digest assertions — fixing them is in Task 5 Step 7, not an accident.
- **Type consistency check:** token payloads in Task 5 (`action.model_dump()`) match the dict keys read in Task 6 (`page`, `block_id`, `fields`, `enabled`, `to_page`, `updates.links/show_login/show_install`); card kinds match Task 7's `ActionKind` additions; `changes` rows match the existing `DiffRow` interface.
