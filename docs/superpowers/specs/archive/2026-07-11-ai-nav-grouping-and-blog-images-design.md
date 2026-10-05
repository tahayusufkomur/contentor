# AI Nav Grouping & Blog Images — Design

**Date:** 2026-07-11
**Status:** Draft — pending owner review
**Companion to:** `2026-07-10-ai-assistants-v2-design.md` (amended 2026-07-11 with **D14**,
the nav badge for human-handoff requests, which this doc's nav work surfaces).
**Depends on:** AI blog v1 (`2026-07-09-ai-blog-design.md`, implemented) for `blog/ai.py` and
`BlogPost`; AI assistants v1+v2 for the bots/conversations this groups in nav.

## 1. Problem

Three unrelated rough edges, requested together:

1. **AI surfaces are scattered.** In the coach panel, Blog lives under Content, the site
   chatbot lives under Site as "Assistant", Logo Studio is a modal buried inside the Design
   page, and Setup Assistant is a floating bubble with no nav entry at all — four AI features,
   four different places (or nowhere). In the superadmin panel there's no AI-specific nav
   entry yet at all (the governance spec's AI Usage dashboard and this doc's Conversations
   work both need a home), and the existing "Communication" group already mixes Inbox/Email
   (support-shaped) with Community/Blog (content-shaped).
2. **AI blog posts are text-only.** `blog/ai.py`'s prompt explicitly forbids images
   (`"no images"`, `blog/ai.py:86`) and `BlogPost` has no image field at all — every AI (and
   manual) post ships with a wall of text, even though a `Photo` library and a working
   `PhotoPicker` UI already exist and are used by Courses and Live Events.

## 2. Decisions

- **Coach AI nav group** groups Blog, Assistant, Logo Studio, and Setup Assistant. Logo
  Studio gets a deep-link (`/admin/design?open=logoStudio`) that auto-opens the existing
  modal rather than restructuring the Design page. Setup Assistant is promoted from the
  floating bubble to a real nav item; the bubble is retired to avoid two entry points for the
  same checklist.
- **Superadmin nav** gets an AI group (AI Usage + Conversations, both already living on
  `/admin/ai` per the governance/v2 specs) plus a light cleanup: split the current
  **Communication** group (Inbox, Email, Community, Blog) into **Content** (Blog, Community)
  and **Communication** (Inbox, Email) — Overview/Data/System untouched.
- **Blog images are AI-picked from the existing `Photo` library only** — no generation, no
  upload-during-generation. One optional cover photo plus up to 2 inline photos per post (cap
  chosen so a post doesn't turn into a stock-photo wall; easy to raise later). Coaches can
  swap or remove any AI-picked photo afterward via the existing `PhotoPicker`.
- **Photo references are stored, never baked-in signed URLs** (see §6.3) — the one
  non-negotiable technical decision in this doc, because every other durable use of `Photo` in
  this codebase (course thumbnails, page-builder blocks, tenant logo) follows this rule and a
  generated blog post is read for the life of the post, far past a signed URL's 1-hour expiry.

## 3. Approaches considered (blog images)

1. **Store photo references (id), resolve to signed URLs at serve time — recommended.**
   Matches the existing pattern everywhere else in this codebase
   (`courses/serializers.py:131`, `tenant_config/serializers.py:357`, `live/serializers.py:45`).
   No sanitizer changes to `render_body()`'s `nh3` allow-list — the server (not the model)
   constructs the final `<img>` tag, so `img`/`src` never has to be trusted model output.
2. **Bake `<img src="{signed_url}">` into `body_html` at generation time.** Rejected —
   the signed URL expires in 1h (`generate_presigned_download_url`, default `expiry=3600`);
   every AI/autopilot post would show broken images within an hour of publishing.
3. **Store a permanent/public (unsigned) URL instead of a presigned one.** Rejected as
   out of scope — the bucket has no public-read config today and changing that is a storage/
   security decision independent of this feature; §2's reference-based approach sidesteps the
   need entirely.

## 4. Coach panel — AI nav group

`frontend-customer/src/components/admin/admin-shell.tsx:42-134` (`navSections`) gains a new
section between `content` and `community` (or wherever reads best — cosmetic ordering, not
load-bearing):

```
{
  label: t("nav.sections.ai"),
  items: [
    { label: t("nav.items.blog"), href: "/admin/blog", icon: Newspaper },
    { label: t("nav.items.assistant"), href: "/admin/assistant", icon: ... },  // badge: D14
    { label: t("nav.items.logoStudio"), href: "/admin/design?open=logoStudio", icon: ... },
    { label: t("nav.items.setupAssistant"), href: "/admin/setup", icon: ... },
  ],
}
```

- Blog and Assistant move out of `content`/`site` respectively (removed from their old
  sections, not duplicated).
- `/admin/design` reads the `open` query param on mount and opens the existing `LogoStudio`
  modal (`frontend-customer/src/app/admin/design/page.tsx:317`) programmatically — same modal,
  no new route, no page restructuring. The "Design" nav item stays where it is (branding
  fields are a separate concern from Logo Studio); Logo Studio just gets a second entry point.
- Setup Assistant: the checklist rendered by `SetupAssistantBubble` moves to a small page at
  `/admin/setup` (or the bubble's inner content is extracted into a shared component rendered
  both by the page and — until this ships — nowhere else). `SetupAssistantBubble` mount in
  `admin-shell.tsx:30`/`:145` is removed once the nav item ships.
- D14's badge (unread `human_requested` count, §5.4/§6.5 of the v2 spec) renders on the
  **Assistant** item specifically, not the whole group — it's the only item that leads to
  conversations.

## 5. Superadmin panel — nav cleanup

`frontend-main/src/components/admin/admin-shell.tsx:28-93` (flat `NavItem[]` with a `group`
string per item):

- New group **AI**: one item, "AI" → `/admin/ai` (AI Usage dashboard + Conversations section,
  both already speced to live on that page). D14's badge renders here.
- Split **Communication** → **Content** (Blog, Community) and **Communication** (Inbox,
  Email). Group *order*: Overview, AI, Content, Communication, Data, System — AI surfaced
  near the top since it's now an active-attention surface (badge), not a settings page.
- Data (dynamic per-model injection) and System unchanged.

## 6. Blog AI images

### 6.1 Model (`backend/apps/blog/models.py`)

```python
class BlogPost(models.Model):
    ...
    cover_photo = models.ForeignKey(
        "media.Photo", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    image_placements = models.JSONField(default=list, blank=True)
    # [{"heading": "<exact section heading text>", "photo_id": "<Photo uuid>"}, ...]
    # max 2 entries (§2 cap). heading is matched against the rendered <h2> text at
    # serve time (§6.3) — not a stored HTML offset, so it survives re-renders.
```

One migration, both fields nullable/default-empty — existing posts are unaffected.

### 6.2 Generation (`backend/apps/blog/ai.py`)

- New helper alongside `brand_brief()` — **not** in `BLOG_STATIC_PROMPT`, since tenant photo
  data is tenant-specific and the static prompt must stay byte-identical for the Anthropic
  cache (see the module's own token-efficiency contract). Something like:

  ```python
  def available_photos_block(photos):
      """photos: up to 30 most-recent Photo rows (id, title, alt_text). Empty tenant
      library -> empty string (zero extra tokens, matches today's no-photo behavior)."""
  ```

  Appended to the same per-request user message as `brand_brief()`, e.g.:
  ```
  <available_photos>
  a1b2...: "Morning stretch" — alt: "woman stretching on yoga mat at sunrise"
  ...
  </available_photos>
  ```
- `BLOG_STATIC_PROMPT` gains generic (tenant-independent) instructions: reference at most one
  `cover_photo_id` and up to 2 per-section `photo_id`s from `<available_photos>` **by exact
  id**, only when genuinely relevant to that section's topic — most posts should use 0-2
  photos, not one per section; never invent an id; leave blank if no photo fits or the list is
  empty. **`PROMPT_VERSION` 1 → 2** (per the module's own "bump on any static-prompt change"
  rule).
- `_BlogDraft` gains `cover_photo_id: str = ""`; `_Section` gains `photo_id: str = ""`.
- Still **one model call per post** — no second AI call for image selection, preserving the
  file's stated token-efficiency contract.
- Post-call validation (in the view/service that builds the `BlogPost`, not in `ai.py`'s
  schema): any `photo_id`/`cover_photo_id` not found in the fetched-for-this-request Photo id
  set (hallucinated, wrong tenant, deleted mid-call) is dropped silently — fails open to "no
  image," never errors the whole generation.

### 6.3 Serving (resolve-at-request-time — the load-bearing piece, §3)

- `BlogPost` API serializer gains `cover_photo: {id, signed_url, alt_text} | null`, resolved
  via `generate_presigned_download_url` exactly like `courses/serializers.py:131`'s thumbnail
  field — fresh on every response, nothing cached beyond the request.
- For `image_placements`, the serializer (or the detail view) does an in-memory substitution
  on the **response** `body_html` string — the stored field itself is never touched: for each
  placement, find `<h2>{escaped heading}</h2>` in the rendered HTML and insert
  `<img src="{fresh signed url}" alt="{photo.alt_text}" loading="lazy">` immediately after it.
  Heading not found (e.g. the coach hand-edited the heading after generation) → skip that
  placement silently, no error. `render_body()`'s `nh3` allow-list (`_BLOG_TAGS`/`_BLOG_ATTRS`,
  `blog/ai.py:120-121`) is **unchanged** — `img` is never in the model-trust boundary; the
  server constructs that tag itself with a value (a signed URL) the server itself generated.
- Verify the public blog post route (Next.js) doesn't cache/ISR the API response past the
  signed URL's TTL — if it does, extend the TTL or force per-request fetch for posts with
  images; flag as a testing checklist item (§8), not a design decision to pre-solve blind.

### 6.4 Manual editing (`frontend-customer/src/app/admin/blog/[id]/page.tsx`)

- Cover photo: one `PhotoPicker` bound to `cover_photo`.
- Inline images: a small list editor — each row is a heading dropdown (populated from the
  post's current `<h2>` headings) + `PhotoPicker` + remove button, capped at 2 rows. Not a
  rich embedded-image editor — swap/remove is the whole requirement (§2).

## 7. Settings / non-goals

- No new Django settings — photo count caps (30 fetched, 2 inline + 1 cover placed) are
  in-code constants in `blog/ai.py`, cheap to tune.
- Non-goals: no AI image *generation* (only selection from the existing library); no
  automatic re-tagging/captioning of photos to improve matching (title/alt_text as authored is
  the signal); no per-tenant toggle to disable AI image selection (same posture as the rest of
  blog generation — one contract for everyone).

## 8. Testing

- **Nav**: coach sidebar renders the new AI section with the 4 items in the right group, old
  locations no longer duplicate them; superadmin sidebar renders AI + the split
  Content/Communication groups; D14 badge count renders on the correct single item in each
  panel (not the whole group).
- **Blog images — generation**: empty photo library → no `<available_photos>` block, zero
  extra tokens, `cover_photo`/`image_placements` stay empty (regression-safe default);
  populated library → model call includes the block; hallucinated/invalid photo id → dropped,
  post still saves; cap enforced (never more than 1 cover + 2 inline persisted even if the
  model returns more).
- **Blog images — serving**: `signed_url` differs between two requests separated by the
  presign TTL (proves it's resolved fresh, not cached/stored); heading-based splice inserts at
  the right point and degrades to "skip" when the heading was edited away; `nh3` allow-list
  diff — assert `_BLOG_TAGS`/`_BLOG_ATTRS` unchanged (guards against someone "fixing" this by
  widening the model-trust boundary instead).
- **Blog images — manual editor**: cover swap/remove persists; inline row add/remove capped
  at 2; removing a photo the AI picked doesn't affect other placements.
- **Logo Studio deep link**: `/admin/design?open=logoStudio` opens the modal on load without
  requiring a click; direct nav to `/admin/design` (no query param) behaves as today.
- **Setup Assistant**: checklist renders identically via the new nav page as it did via the
  bubble; bubble no longer mounts.

## 9. Rollout (independently shippable)

1. Coach AI nav group (§4) — pure frontend reorg, no backend changes, ships first/fastest.
2. Superadmin nav cleanup (§5) — same, independent of everything else in this doc.
3. Blog images backend (§6.1-6.3) — model + migration, `ai.py` prompt/schema changes, serve-
   time resolution. TDD per the project's standing rule.
4. Blog images manual editor (§6.4) — depends on 3's fields existing.
5. D14 badge wiring on the new nav items (depends on the v2 spec's Phase 1/3/4 conversation
   substrate + count endpoints actually being built — this doc only adds the nav placement,
   the badge mechanism itself is speced in the companion doc).

## 10. Open questions

- Coach AI nav ordering: is Blog → Assistant → Logo Studio → Setup Assistant the right order,
  or should the most-used item (probably Blog) stay first regardless of grouping?
- Retiring `SetupAssistantBubble` entirely vs. keeping it as a lightweight nudge that deep-
  links to the new `/admin/setup` page instead of rendering the checklist inline — the design
  above retires it outright; flag if the bubble's ambient visibility (no nav-click required)
  was doing useful work.
