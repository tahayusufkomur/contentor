# AI Nav Grouping & Blog Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group AI-related surfaces into their own nav section in both admin panels, and let AI blog generation pick a cover photo + up to two inline photos from the coach's existing photo library.

**Architecture:** Two independent frontend nav reorgs (no backend involved) plus a backend extension to the existing single-model-call blog generator: the AI's structured-output schema gains photo-id fields, validated against the tenant's real `Photo` rows, and resolved to fresh signed URLs at serve time rather than ever being persisted as a URL.

**Tech Stack:** Django 5.1 + DRF (backend/apps/blog, backend/apps/media), Next.js 14 + next-intl (frontend-customer), Next.js 14 (frontend-main, no i18n), pytest (backend), vitest (frontend-customer pure-logic only).

**Spec:** `docs/superpowers/specs/2026-07-11-ai-nav-grouping-and-blog-images-design.md`

## Global Constraints

- **Never persist a signed photo URL.** `Photo.signed_url` (`backend/apps/media/serializers.py`) expires in 1 hour (`generate_presigned_download_url` default `expiry=3600`). `BlogPost` must only ever store a `Photo` reference (FK or id string in JSON); the signed URL is resolved fresh on every API response, matching the pattern already used by `courses/serializers.py:131`, `tenant_config/serializers.py:357`, `live/serializers.py:45`.
- **`render_body()`'s `nh3` allow-list stays unchanged** (`_BLOG_TAGS`/`_BLOG_ATTRS`, `backend/apps/blog/ai.py:120-121` — no `img` tag ever added to it). The server constructs `<img>` tags itself with a URL it generated; model-authored HTML is never trusted with image markup.
- **One model call per post stays true.** Photo selection rides the existing `_BlogDraft` structured-output call (`backend/apps/blog/ai.py`'s stated token-efficiency contract) — no second AI call.
- **`BLOG_STATIC_PROMPT` stays byte-identical across tenants** (Anthropic prompt-cache requirement). Tenant-specific data (the photo library) goes in the per-request user message via a new helper alongside `brand_brief()`, never into the static prompt. Bump `PROMPT_VERSION` 1 → 2 (the module's own "bump on any static-prompt change" rule, `ai.py:1-8`).
- **Caps:** at most 1 cover photo + 2 inline photos per post; at most 30 candidate photos fed into the generation prompt (token cost control, most-recent-first).
- **`frontend-customer` has no component-test convention.** `vitest.config.ts` only includes `src/**/__tests__/**/*.test.ts` (not `.tsx`) — "React components are covered by `npm run build` + the Playwright e2e suite, per repo convention." Only extract genuinely-logic-bearing pieces (caps, dedup) into pure `.ts` functions for vitest; UI wiring itself is verified via `npm run build`, not a fabricated component test.
- **`frontend-main` has no test runner configured at all.** Its nav change is verified via `npm run build` only — do not introduce new test tooling for a two-item nav edit.
- **Backend test convention** (from `backend/apps/blog/tests/test_admin_api.py`): `pytestmark = pytest.mark.django_db(transaction=True)` at module level, `tenant_ctx` fixture, `coach`/`coach_client` fixtures using `User.objects.create_user(...)` + `APIClient(HTTP_HOST=HOST).force_authenticate(user=coach)` — no factory_boy.
- **D14 (nav badge for AI-handoff requests) is out of scope for this plan.** It depends on the `AiConversation`/takeover backend from `docs/superpowers/specs/2026-07-10-ai-assistants-v2-design.md`, which is speced but not yet implemented. The nav sections this plan builds (coach "Assistant" item, superadmin "AI" item) are exactly where that badge will attach once the substrate exists — no rework needed later, just an addition.
- Run `make migrate` after any migration is generated (project rule, `CLAUDE.md`). Run `npm run build` in the touched frontend before committing any frontend task (project rule, `CLAUDE.md`: "Always verify builds pass before claiming work is done").

---

## Task 1: Coach nav — group AI surfaces into one section

**Files:**
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx:42-134` (`navSections`)
- Modify: `frontend-customer/messages/en/admin.json` (`nav` block)
- Modify: `frontend-customer/messages/tr/admin.json` (`nav` block)

**Interfaces:**
- Consumes: `NavSection`/`NavItem` types from `@/components/shared/app-sidebar` (unchanged).
- Produces: nothing new consumed by later tasks — Task 2/3 add items into the section this task creates (`id: "ai"`).

- [ ] **Step 1: Add the `ai` nav section, moving Blog and Assistant into it**

Edit `frontend-customer/src/components/admin/admin-shell.tsx`. Remove the `blog` item from the `content` section (was `admin-shell.tsx:76`):

```tsx
    {
      id: "content",
      label: t("nav.sections.content"),
      items: [
        {
          label: t("nav.items.courses"),
          href: "/admin/courses",
          icon: BookOpen,
        },
        {
          label: t("nav.items.photos"),
          href: "/admin/photos",
          icon: ImageIcon,
        },
        { label: t("nav.items.videos"), href: "/admin/videos", icon: Film },
        {
          label: t("nav.items.downloads"),
          href: "/admin/downloads",
          icon: Download,
        },
        { label: t("nav.items.liveEvents"), href: "/admin/live", icon: Video },
        { label: t("nav.items.email"), href: "/admin/email", icon: Mail },
      ],
    },
```

Remove the `assistant` item from the `site` section (was `admin-shell.tsx:107-111`):

```tsx
    {
      id: "site",
      label: t("nav.sections.site"),
      items: [
        { label: t("nav.items.pages"), href: "/admin/pages", icon: FileText },
        { label: t("nav.items.design"), href: "/admin/design", icon: Palette },
        {
          label: t("nav.items.settings"),
          href: "/admin/settings",
          icon: Settings,
        },
      ],
    },
```

Insert a new `ai` section between `content` and `community`:

```tsx
    {
      id: "ai",
      label: t("nav.sections.ai"),
      items: [
        { label: t("nav.items.blog"), href: "/admin/blog", icon: Newspaper },
        {
          label: t("nav.items.assistant"),
          href: "/admin/assistant",
          icon: MessageCircleQuestion,
        },
        {
          label: t("nav.items.logoStudio"),
          href: "/admin/design?open=logoStudio",
          icon: Sparkles,
        },
      ],
    },
```

Add `Sparkles` to the `lucide-react` import at the top of the file (`admin-shell.tsx:3-23`) — the existing multi-line import gains one entry, alphabetical order preserved:

```tsx
import {
  Bell,
  BookOpen,
  CreditCard,
  Database,
  Download,
  Film,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  Mail,
  MessageCircleQuestion,
  MessagesSquare,
  Newspaper,
  Palette,
  FileText,
  Settings,
  Sparkles,
  Users,
  Video,
  Wallet,
} from "lucide-react";
```

(Task 3 adds a fourth item, Setup Assistant, to this same `ai` section — left out here since it needs its own new page first.)

- [ ] **Step 2: Add the new i18n keys**

Edit `frontend-customer/messages/en/admin.json`, in the `nav` block — add `"ai"` to `sections` and `"logoStudio"` to `items` (leave every existing key as-is, `"assistant"`/`"blog"` are reused unchanged):

```json
"nav": {
  "sections": {
    "overview": "Overview",
    "content": "Content",
    "ai": "AI",
    "community": "Community",
    "site": "Site",
    "business": "Business"
  },
  "items": {
    "communityFeed": "Community",
    "dashboard": "Dashboard",
    "courses": "Courses",
    "photos": "Photos",
    "videos": "Videos",
    "downloads": "Downloads",
    "liveEvents": "Live Events",
    "email": "Email",
    "blog": "Blog",
    "students": "Students",
    "notifications": "Send announcement",
    "inbox": "Inbox",
    "pages": "Pages",
    "design": "Design",
    "assistant": "Site assistant",
    "logoStudio": "Logo Studio",
    "settings": "Settings",
    "billing": "Billing",
    "payouts": "Payouts"
  }
}
```

Edit `frontend-customer/messages/tr/admin.json` the same way, matching key-for-key with Turkish values for the two new keys: `"ai": "Yapay Zeka"`, `"logoStudio": "Logo Stüdyosu"` (every other key stays exactly as it already reads in that file).

- [ ] **Step 3: Verify the build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds with no type errors (a missing i18n key or a typo'd icon import would fail the build here — `next-intl` doesn't type-check message keys at build time, so also grep to be sure: `grep -c '"ai"' messages/en/admin.json messages/tr/admin.json` should print `1` for each file).

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/components/admin/admin-shell.tsx frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "feat(nav): group Blog, Assistant, Logo Studio under a coach AI section"
```

---

## Task 2: Design page — deep-link auto-opens Logo Studio

**Files:**
- Modify: `frontend-customer/src/app/admin/design/page.tsx:1-35` (imports, `useEffect`)

**Interfaces:**
- Consumes: `studioOpen`/`setStudioOpen` state already defined at `design/page.tsx:28`; the `<LogoStudio open={studioOpen} .../>` render at `design/page.tsx:317` is unchanged.
- Produces: nothing consumed by other tasks — the `/admin/design?open=logoStudio` URL Task 1 links to now does something.

- [ ] **Step 1: Read the `open` query param and auto-open the modal**

Edit `frontend-customer/src/app/admin/design/page.tsx`. Add `useSearchParams` to the existing `next/navigation` import (was `design/page.tsx:4`):

```tsx
import { useRouter, useSearchParams } from "next/navigation";
```

Add a second `useEffect` right after the existing config-fetch one (`design/page.tsx:30-34`):

```tsx
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("open") === "logoStudio") {
      setStudioOpen(true);
      router.replace("/admin/design");
    }
  }, [searchParams, router]);
```

`router.replace` (no history entry) strips the query param immediately after opening, so a page refresh with the modal open doesn't re-trigger the auto-open on every reload.

- [ ] **Step 2: Verify the build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual verification**

Run `make dev`, sign in as a coach, navigate directly to `/admin/design?open=logoStudio` — the Logo Studio modal should open automatically. Reload the same URL without the query param (`/admin/design`) — the modal should stay closed, confirming the existing manual-open button still works standalone.

- [ ] **Step 4: Commit**

```bash
git add frontend-customer/src/app/admin/design/page.tsx
git commit -m "feat(design): open Logo Studio automatically via ?open=logoStudio"
```

---

## Task 3: Setup Assistant — promote from floating bubble to a nav page

**Files:**
- Create: `frontend-customer/src/app/admin/setup/page.tsx`
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx` (remove bubble mount, add nav item)
- Modify: `frontend-customer/messages/en/admin.json`, `frontend-customer/messages/tr/admin.json` (`nav.items.setupAssistant`)
- Delete: `frontend-customer/src/components/setup/setup-assistant-bubble.tsx`

**Interfaces:**
- Consumes: `SetupAssistantPanel` (`@/components/setup/setup-assistant-panel`, props `open: boolean; onClose: () => void; initialTab?: "checklist" | "help"`) — unchanged, already used standalone by `edit-sidebar.tsx`'s `SetupSidebarRow`, confirming it doesn't require the bubble to function.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Create the standalone setup page**

`SetupAssistantPanel` is already a self-contained slide-over (`ModalPortal` + `fixed inset-0`, `setup-assistant-panel.tsx:161-169`), driven purely by `open`/`onClose`/`initialTab` — no bubble-specific logic lives in it. Reuse it unchanged:

```tsx
"use client";

import { useRouter } from "next/navigation";

import { SetupAssistantPanel } from "@/components/setup/setup-assistant-panel";

export default function SetupAssistantPage() {
  const router = useRouter();

  return (
    <SetupAssistantPanel
      open={true}
      onClose={() => router.push("/admin")}
      initialTab="checklist"
    />
  );
}
```

Save as `frontend-customer/src/app/admin/setup/page.tsx`.

- [ ] **Step 2: Add the nav item, remove the bubble mount**

Edit `frontend-customer/src/components/admin/admin-shell.tsx`. In the `ai` section added by Task 1, add a fourth item:

```tsx
        {
          label: t("nav.items.setupAssistant"),
          href: "/admin/setup",
          icon: ListChecks,
        },
```

Add `ListChecks` to the `lucide-react` import (alongside `Sparkles` added in Task 1). Remove the bubble import (`admin-shell.tsx:30`, `import { SetupAssistantBubble } from "@/components/setup/setup-assistant-bubble";`) and its mount (`admin-shell.tsx:145`, `<SetupAssistantBubble />`).

- [ ] **Step 3: Add the i18n key**

Add `"setupAssistant": "Setup Assistant"` to `nav.items` in `frontend-customer/messages/en/admin.json`, and `"setupAssistant": "Kurulum Asistanı"` in `frontend-customer/messages/tr/admin.json`.

- [ ] **Step 4: Delete the now-unused bubble component**

`SetupAssistantBubble` has exactly one importer, `admin-shell.tsx` (verified: `grep -rn "SetupAssistantBubble" frontend-customer/src` returns only the component's own definition and that one import/mount, both removed in Step 2). `edit-sidebar.tsx`'s `SetupSidebarRow` uses `SetupAssistantPanel` directly, not the bubble, so it's unaffected.

```bash
rm frontend-customer/src/components/setup/setup-assistant-bubble.tsx
```

- [ ] **Step 5: Verify the build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds (a leftover import of the deleted bubble file would fail this).

- [ ] **Step 6: Manual verification**

Run `make dev`, sign in as a coach with an incomplete setup checklist. Confirm the floating bubble no longer appears anywhere in `/admin/*`. Click the new "Setup Assistant" nav item — the same slide-over checklist opens, on `/admin/setup`. Close it (X or backdrop) — it navigates to `/admin`.

- [ ] **Step 7: Commit**

```bash
git add frontend-customer/src/app/admin/setup/page.tsx frontend-customer/src/components/admin/admin-shell.tsx frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git rm frontend-customer/src/components/setup/setup-assistant-bubble.tsx
git commit -m "feat(setup): promote Setup Assistant from a floating bubble to a nav page"
```

---

## Task 4: Superadmin nav — AI group + Content/Communication split

**Files:**
- Modify: `frontend-main/src/app/admin/admin-shell.tsx:1-67`

**Interfaces:**
- Consumes: `NavItem` type from `@/components/shared/app-sidebar` (unchanged — `{label, href, icon, group, external?}`).
- Produces: nothing consumed by other tasks (D14, which will eventually add a badge to this "AI" item, is out of scope per Global Constraints).

- [ ] **Step 1: Add the `Bot` icon import**

Edit `frontend-main/src/app/admin/admin-shell.tsx`, add `Bot` to the existing `lucide-react` import (`admin-shell.tsx:4-13`):

```tsx
import {
  LayoutDashboard,
  Settings,
  Activity,
  ExternalLink,
  Mail,
  Inbox,
  MessagesSquare,
  Newspaper,
  Bot,
} from "lucide-react";
```

- [ ] **Step 2: Add the AI group, split Communication into Content + Communication**

Replace the `COMMUNICATION` const (`admin-shell.tsx:36-51`) with three consts:

```tsx
const AI: NavItem[] = [
  { label: "AI", href: "/admin/ai", icon: Bot, group: "AI" },
];
const CONTENT: NavItem[] = [
  { label: "Blog", href: "/admin/blog", icon: Newspaper, group: "Content" },
  {
    label: "Community",
    href: "/admin/community",
    icon: MessagesSquare,
    group: "Content",
  },
];
const COMMUNICATION: NavItem[] = [
  {
    label: "Inbox",
    href: "/admin/inbox",
    icon: Inbox,
    group: "Communication",
  },
  { label: "Email", href: "/admin/email", icon: Mail, group: "Communication" },
];
```

- [ ] **Step 3: Wire the new groups into `navItems`, ordered Overview → AI → Content → Communication → Data → System**

Edit the `navItems` `useMemo` (`admin-shell.tsx:86-94`):

```tsx
  const navItems = useMemo<NavItem[]>(() => {
    const dataItems: NavItem[] = (site?.models ?? []).map((model) => ({
      label: model.label_plural,
      href: `/admin/m/${model.key}`,
      icon: kitIcon(model.icon),
      group: "Data",
    }));
    return [...OVERVIEW, ...AI, ...CONTENT, ...COMMUNICATION, ...dataItems, ...SYSTEM];
  }, [site]);
```

(Data moves after Communication in this ordering — same items, same dynamic injection, just resequenced per the spec's stated group order §5.)

- [ ] **Step 4: Verify the build**

Run: `cd frontend-main && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual verification**

Run `make dev`, sign in as superadmin, open `/admin`. Confirm the sidebar shows group headers in order Overview / AI / Content / Communication / Data / System, "AI" links to the existing `/admin/ai` page (governance spec's AI Usage dashboard), and Blog/Community now sit under "Content" while Inbox/Email sit under "Communication".

- [ ] **Step 6: Commit**

```bash
git add frontend-main/src/app/admin/admin-shell.tsx
git commit -m "feat(nav): add superadmin AI group, split Communication into Content/Communication"
```

---

## Task 5: `BlogPost` gains `cover_photo` + `image_placements`

**Files:**
- Modify: `backend/apps/blog/models.py`
- Test: `backend/apps/blog/tests/test_models.py`

**Interfaces:**
- Produces: `BlogPost.cover_photo` (nullable FK to `media.Photo`), `BlogPost.image_placements` (JSONField, default `[]`, shape `[{"heading": str, "photo_id": str}, ...]`) — consumed by Tasks 6-9.

- [ ] **Step 1: Write the failing test**

Add to `backend/apps/blog/tests/test_models.py`:

```python
def test_blog_post_image_fields_default_empty():
    post = BlogPost.objects.create(title="x", slug="x")
    assert post.cover_photo is None
    assert post.image_placements == []


def test_blog_post_cover_photo_set_null_on_photo_delete():
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="k", title="p")
    post = BlogPost.objects.create(title="x", slug="x", cover_photo=photo)
    photo.delete()
    post.refresh_from_db()
    assert post.cover_photo is None
```

Check the top of `test_models.py` already imports `BlogPost` and has `pytestmark = pytest.mark.django_db(...)`/a `tenant_ctx`-dependent fixture — if the existing file's tests don't already run inside a tenant schema, add a `tenant_ctx` fixture parameter to both new tests (matching the module's existing pattern; `Photo`/`BlogPost` are both tenant-schema models).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && pytest apps/blog/tests/test_models.py -v`
Expected: FAIL — `TypeError: 'cover_photo' is an invalid keyword argument` (field doesn't exist yet).

- [ ] **Step 3: Add the fields**

Edit `backend/apps/blog/models.py`, add to `BlogPost` (after the existing `tags` field, before `status`):

```python
    cover_photo = models.ForeignKey(
        "media.Photo", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    image_placements = models.JSONField(default=list, blank=True)
```

- [ ] **Step 4: Generate and run the migration**

Run: `cd backend && python manage.py makemigrations blog`
Expected: creates a new migration file under `backend/apps/blog/migrations/` (Django names it automatically, e.g. `0002_blogpost_cover_photo_blogpost_image_placements.py`) with an `AddField` for each of the two fields — both nullable/default-empty, so existing rows are unaffected.

Run: `make migrate`
Expected: migration applies cleanly to every tenant schema.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && pytest apps/blog/tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/apps/blog/models.py backend/apps/blog/migrations/ backend/apps/blog/tests/test_models.py
git commit -m "feat(blog): add cover_photo and image_placements fields to BlogPost"
```

---

## Task 6: AI generation picks photos (`blog/ai.py`)

**Files:**
- Modify: `backend/apps/blog/ai.py`
- Test: `backend/apps/blog/tests/test_ai.py`

**Interfaces:**
- Consumes: `Photo` model (`apps.media.models.Photo`, fields `id`/`title`/`alt_text`).
- Produces: `available_photos_block(photos) -> str`; `generate_post(brief, topic, instructions="", photos=())` — `photos` is a new optional 4th positional/keyword arg, an iterable of objects with `.id`/`.title`/`.alt_text` (a `Photo` queryset slice, or anything shaped the same for tests). `DraftResult.fields` gains two keys: `"cover_photo_id": str` (empty string if none chosen) and `"image_placements": list[{"heading": str, "photo_id": str}]` (already validated against the `photos` passed in — Task 7 does no further validation, only FK resolution of `cover_photo_id`).

- [ ] **Step 1: Write the failing tests**

Add to `backend/apps/blog/tests/test_ai.py`:

```python
def _photo(id_, title, alt=""):
    return SimpleNamespace(id=id_, title=title, alt_text=alt)


DRAFT_JSON_WITH_PHOTOS = json.dumps(
    {
        "title": "Morning Habits That Stick",
        "slug": "morning-habits",
        "meta_description": "Five tiny habits.",
        "excerpt": "Start smaller than you think.",
        "tags": ["habits"],
        "cover_photo_id": "p1",
        "sections": [
            {"heading": "", "body_markdown": "Start **small**.", "photo_id": ""},
            {"heading": "Stretch first", "body_markdown": "A quick stretch.", "photo_id": "p2"},
        ],
    }
)


def test_available_photos_block_empty_for_no_photos():
    assert ai.available_photos_block([]) == ""


def test_available_photos_block_lists_id_title_alt():
    block = ai.available_photos_block([_photo("p1", "Morning stretch", "woman stretching at sunrise")])
    assert "<available_photos>" in block
    assert "p1" in block and "Morning stretch" in block and "woman stretching at sunrise" in block


def test_generate_post_picks_cover_and_inline_photos(settings):
    _cli_settings(settings)
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(DRAFT_JSON_WITH_PHOTOS), stderr="")
    photos = [_photo("p1", "Morning stretch"), _photo("p2", "Journal on desk")]
    with mock.patch("subprocess.run", return_value=completed):
        result = ai.generate_post("<brand_brief>x</brand_brief>", "Morning habits", photos=photos)
    assert result.fields["cover_photo_id"] == "p1"
    assert result.fields["image_placements"] == [{"heading": "Stretch first", "photo_id": "p2"}]


def test_generate_post_drops_hallucinated_photo_ids(settings):
    _cli_settings(settings)
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(DRAFT_JSON_WITH_PHOTOS), stderr="")
    # Neither p1 nor p2 is in the real candidate list -> both dropped, fails open.
    with mock.patch("subprocess.run", return_value=completed):
        result = ai.generate_post("<brand_brief>x</brand_brief>", "Morning habits", photos=[_photo("other", "x")])
    assert result.fields["cover_photo_id"] == ""
    assert result.fields["image_placements"] == []


def test_generate_post_caps_inline_placements_at_two(settings):
    _cli_settings(settings)
    three_sections = json.dumps(
        {
            **json.loads(DRAFT_JSON_WITH_PHOTOS),
            "cover_photo_id": "",
            "sections": [
                {"heading": "A", "body_markdown": "a", "photo_id": "p1"},
                {"heading": "B", "body_markdown": "b", "photo_id": "p2"},
                {"heading": "C", "body_markdown": "c", "photo_id": "p3"},
            ],
        }
    )
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(three_sections), stderr="")
    photos = [_photo("p1", "1"), _photo("p2", "2"), _photo("p3", "3")]
    with mock.patch("subprocess.run", return_value=completed):
        result = ai.generate_post("<brand_brief>x</brand_brief>", "t", photos=photos)
    assert len(result.fields["image_placements"]) == 2
```

`_cli_settings`, `_cli_envelope`, `SimpleNamespace`, `json`, `mock` are already imported/defined at the top of `test_ai.py` (see existing tests in that file) — only the new `_photo` helper needs adding.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && pytest apps/blog/tests/test_ai.py -k "photo" -v`
Expected: FAIL — `AttributeError: module 'apps.blog.ai' has no attribute 'available_photos_block'` (and `generate_post() got an unexpected keyword argument 'photos'`).

- [ ] **Step 3: Implement**

Edit `backend/apps/blog/ai.py`.

Add `photo_id: str = ""` to `_Section`, and `cover_photo_id: str = ""` to `_BlogDraft` (`ai.py:32-44`):

```python
class _Section(BaseModel):
    heading: str = ""  # empty = continuation paragraphs, no <h2>
    body_markdown: str
    photo_id: str = ""  # id of an <available_photos> entry, or "" for none


class _BlogDraft(BaseModel):
    title: str
    slug: str
    meta_description: str
    excerpt: str
    tags: list[str] = Field(default_factory=list)
    cover_photo_id: str = ""  # id of an <available_photos> entry, or "" for none
    sections: list[_Section]
```

Add photo-selection rules to `BLOG_STATIC_PROMPT` (`ai.py:64-89`), appended to the existing "Structure rules" bullet list, and bump `PROMPT_VERSION`:

```python
PROMPT_VERSION = 2
```

```python
Structure rules:
- 800-1200 words total, split into 4-7 sections.
- Each section: a short heading (empty string for the intro section) and \
1-3 paragraphs of markdown.
- Markdown subset ONLY: paragraphs separated by blank lines, **bold**, \
*italic*, "- " bullet lists, and [text](https://...) links sparingly. \
No headings inside body_markdown, no images, no HTML, no code blocks.

Image rules:
- If an <available_photos> block is present in the user message, you may \
reference AT MOST one cover_photo_id (for the whole post) and AT MOST 2 \
sections' photo_id (one photo per section, never more than one), using \
the id EXACTLY as given in <available_photos>.
- Only pick a photo when it is genuinely relevant to that section's (or \
the post's) topic. Most posts should use 0-2 photos total, not one per \
section — leave cover_photo_id/photo_id as "" when nothing fits.
- NEVER invent an id. If <available_photos> is absent or empty, leave \
every cover_photo_id/photo_id as "".
```

Add the tenant-photo block builder near `brand_brief()` (`ai.py:105-116`) — tenant-specific, so it goes in the per-request user message, never the static prompt:

```python
MAX_AVAILABLE_PHOTOS = 30


def available_photos_block(photos):
    """photos: iterable of objects with .id/.title/.alt_text (a Photo
    queryset slice in production, plain objects in tests). Empty/absent
    library -> empty string, zero extra prompt tokens (matches today's
    no-photo behavior)."""
    rows = list(photos)[:MAX_AVAILABLE_PHOTOS]
    if not rows:
        return ""
    lines = ["<available_photos>"]
    for p in rows:
        lines.append(f'{p.id}: "{p.title}" — alt: "{p.alt_text}"')
    lines.append("</available_photos>")
    return "\n".join(lines)
```

Update `generate_post()` (`ai.py:173-196`) to accept `photos`, append the block to the user prompt, and validate the model's chosen ids against the real candidate id set (fail open — drop anything not recognized):

```python
def generate_post(brief, topic, instructions="", photos=()):
    """ONE model call -> BlogPost-ready field dict. Slug and status are
    intentionally absent (callers re-derive the slug via models.unique_slug
    and decide status). Raises BlogAiError on failure."""
    photo_list = list(photos)
    valid_ids = {str(p.id) for p in photo_list}
    user_prompt = f"{brief}\n\nWrite a blog post about: {topic}"
    if instructions:
        user_prompt += f"\n\nThe coach's extra instructions: {instructions[:500]}"
    photos_block = available_photos_block(photo_list)
    if photos_block:
        user_prompt += f"\n\n{photos_block}"
    parsed, cost, effective_model = _call_structured(
        BLOG_STATIC_PROMPT, user_prompt, _BlogDraft, settings.BLOG_AI_MODEL, MAX_OUTPUT_TOKENS
    )
    body_html = render_body(parsed.sections)
    if not body_html.strip():
        raise BlogAiError("model returned an empty post", cost_usd=cost)
    cover_photo_id = parsed.cover_photo_id if parsed.cover_photo_id in valid_ids else ""
    image_placements = [
        {"heading": s.heading, "photo_id": s.photo_id}
        for s in parsed.sections
        if s.photo_id in valid_ids
    ][:2]
    return DraftResult(
        {
            "title": str(parsed.title)[:200],
            "body_html": body_html,
            "excerpt": str(parsed.excerpt)[:300],
            "meta_description": str(parsed.meta_description)[:170],
            "tags": [str(t).lower()[:30] for t in parsed.tags[:6]],
            "ai_model": effective_model,
            "cover_photo_id": cover_photo_id,
            "image_placements": image_placements,
        },
        cost,
    )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && pytest apps/blog/tests/test_ai.py -v`
Expected: PASS, including the pre-existing tests in that file (`test_generate_post_returns_rendered_fields` still passes since `photos=()` defaults to no photo block and empty `cover_photo_id`/`image_placements`).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/blog/ai.py backend/apps/blog/tests/test_ai.py
git commit -m "feat(blog-ai): pick cover + inline photos from the existing library in one model call"
```

---

## Task 7: `blog_generate` view supplies the tenant's photos, resolves `cover_photo`

**Files:**
- Modify: `backend/apps/blog/views.py:100-141` (`blog_generate`)
- Test: `backend/apps/blog/tests/test_admin_api.py`

**Interfaces:**
- Consumes: `ai.generate_post(brief, topic, instructions, photos=...)` from Task 6; `apps.media.models.Photo`.
- Produces: `BlogPost.objects.create(...)` now receives a real `cover_photo` FK instance (or `None`) — `image_placements` passes through from `result.fields` unchanged (already the correct JSON shape for the model field).

- [ ] **Step 1: Write the failing test**

Add to `backend/apps/blog/tests/test_admin_api.py`. Extend `_draft_result()` to include the two new keys (every existing caller of `_draft_result()` keeps working unchanged since the new keys default to empty/no-op):

```python
def _draft_result(cover_photo_id="", image_placements=None):
    return ai.DraftResult(
        {
            "title": "T",
            "body_html": "<p>b</p>",
            "excerpt": "e",
            "meta_description": "m",
            "tags": ["t"],
            "ai_model": "x",
            "cover_photo_id": cover_photo_id,
            "image_placements": image_placements or [],
        },
        Decimal("0.03"),
    )
```

Add the new tests:

```python
def test_generate_passes_tenant_photos_to_ai(coach_client, paid_tenant, settings):
    from apps.media.models import Photo

    settings.ANTHROPIC_API_KEY = "test-key"
    Photo.objects.create(s3_key="k", title="Sunrise stretch")
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()) as gen:
        coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    passed_photos = list(gen.call_args.kwargs["photos"])
    assert len(passed_photos) == 1 and passed_photos[0].title == "Sunrise stretch"


def test_generate_resolves_cover_photo_fk(coach_client, paid_tenant, settings):
    from apps.media.models import Photo

    settings.ANTHROPIC_API_KEY = "test-key"
    photo = Photo.objects.create(s3_key="k", title="Sunrise stretch")
    with mock.patch.object(ai, "generate_post", return_value=_draft_result(cover_photo_id=str(photo.id))):
        res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    post = BlogPost.objects.get(pk=res.data["post"]["id"])
    assert post.cover_photo_id == photo.id


def test_generate_with_no_cover_photo_id_leaves_field_null(coach_client, paid_tenant, settings):
    settings.ANTHROPIC_API_KEY = "test-key"
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()):
        res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    post = BlogPost.objects.get(pk=res.data["post"]["id"])
    assert post.cover_photo_id is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && pytest apps/blog/tests/test_admin_api.py -k "photo" -v`
Expected: FAIL — `generate_post` mock isn't called with a `photos` kwarg yet, and `BlogPost.objects.create(**result.fields)` raises `TypeError: 'cover_photo_id' is an invalid keyword argument` (it's not a model field — `cover_photo` is).

- [ ] **Step 3: Implement**

Edit `backend/apps/blog/views.py`. Add the import:

```python
from apps.media.models import Photo
```

Update `blog_generate` (`views.py:100-141`) — fetch the tenant's recent photos, pass them through, and convert `cover_photo_id` to a real FK before `.create()`:

```python
@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def blog_generate(request):
    """One gated AI call -> a draft BlogPost. Response always has a body:
    {post, source, remaining} — source mirrors the Brand Pack reasons."""
    tenant = connection.tenant
    status = ai.availability(tenant)
    if status["reason"]:
        return Response({"post": None, "source": status["reason"], "remaining": status["remaining"]})

    data = request.data if isinstance(request.data, dict) else {}
    topic_obj = None
    if data.get("topic_id"):
        topic_obj = BlogTopicIdea.objects.filter(pk=data["topic_id"], status="available").first()
    topic = (topic_obj.title if topic_obj else str(data.get("custom_topic") or ""))[:200]
    if not topic:
        return Response({"post": None, "source": "error", "remaining": status["remaining"]}, status=400)
    instructions = str(data.get("instructions") or "")[:500]
    photos = Photo.objects.order_by("-created_at")[: ai.MAX_AVAILABLE_PHOTOS]

    try:
        result = ai.generate_post(_brief_for_current_tenant(), topic, instructions, photos=photos)
    except ai.BlogAiError as exc:
        ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
        logger.exception("blog generate failed")
        return Response({"post": None, "source": "error", "remaining": status["remaining"]})
    except Exception:
        ai.record_attempt_cost(tenant.schema_name, 0)
        logger.exception("blog generate: AI call failed")
        return Response({"post": None, "source": "error", "remaining": status["remaining"]})

    ai.record_attempt_cost(tenant.schema_name, result.cost_usd)
    ai.record_success(tenant.schema_name)
    fields = dict(result.fields)
    cover_photo_id = fields.pop("cover_photo_id", "")
    cover_photo = Photo.objects.filter(pk=cover_photo_id).first() if cover_photo_id else None
    post = BlogPost.objects.create(
        slug=unique_slug(fields["title"]),
        status="draft",
        source="ai",
        created_by=request.user,
        cover_photo=cover_photo,
        **fields,
    )
    if topic_obj:
        BlogTopicIdea.objects.filter(pk=topic_obj.pk).update(status="used")
    return Response({"post": BlogPostAdminSerializer(post).data, "source": "ai", "remaining": status["remaining"] - 1})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && pytest apps/blog/tests/test_admin_api.py -v`
Expected: PASS, all tests in the file including the pre-existing ones (the updated `_draft_result()` defaults keep them working unchanged).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/blog/views.py backend/apps/blog/tests/test_admin_api.py
git commit -m "feat(blog): pass tenant photo library into generation, resolve cover photo FK"
```

---

## Task 8: Serve-time photo resolution (`blog/images.py`, serializers)

**Files:**
- Create: `backend/apps/blog/images.py`
- Test: `backend/apps/blog/tests/test_images.py`
- Modify: `backend/apps/blog/serializers.py`
- Test: `backend/apps/blog/tests/test_public_api.py`, `backend/apps/blog/tests/test_admin_api.py`

**Interfaces:**
- Produces: `resolve_cover_photo(post) -> {"id": str, "signed_url": str, "alt_text": str} | None`; `resolve_inline_photos(image_placements) -> {photo_id: {"id", "signed_url", "alt_text"}}`; `splice_image_placements(body_html, image_placements, resolved_photos) -> str` — all three consumed by `BlogPostDetailSerializer`.

- [ ] **Step 1: Write the failing tests**

Create `backend/apps/blog/tests/test_images.py`:

```python
"""Serve-time photo resolution: never bake a signed URL into stored content
(see the model docstring / spec §3) — these functions only ever run against
a response payload, never before a save()."""

from unittest import mock

from apps.blog.images import resolve_cover_photo, resolve_inline_photos, splice_image_placements


def test_resolve_cover_photo_none_when_unset():
    post = mock.Mock(cover_photo_id=None, cover_photo=None)
    assert resolve_cover_photo(post) is None


def test_resolve_cover_photo_signs_fresh(settings):
    photo = mock.Mock(id="p1", s3_key="k", alt_text="a woman stretching")
    post = mock.Mock(cover_photo_id="p1", cover_photo=photo)
    with mock.patch("apps.blog.images.generate_presigned_download_url", return_value="https://signed/1"):
        resolved = resolve_cover_photo(post)
    assert resolved == {"id": "p1", "signed_url": "https://signed/1", "alt_text": "a woman stretching"}


def test_resolve_inline_photos_empty_for_no_placements(db):
    assert resolve_inline_photos([]) == {}


def test_resolve_inline_photos_signs_each_referenced_photo(db):
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="k", title="p", alt_text="stretching")
    with mock.patch("apps.blog.images.generate_presigned_download_url", return_value="https://signed/2"):
        resolved = resolve_inline_photos([{"heading": "Stretch first", "photo_id": str(photo.id)}])
    assert resolved == {str(photo.id): {"id": str(photo.id), "signed_url": "https://signed/2", "alt_text": "stretching"}}


def test_resolve_inline_photos_omits_deleted_photo(db):
    assert resolve_inline_photos([{"heading": "Gone", "photo_id": "00000000-0000-0000-0000-000000000000"}]) == {}


def test_splice_inserts_after_matching_heading():
    html = "<h2>Intro</h2><p>hi</p><h2>Stretch first</h2><p>bend</p>"
    placements = [{"heading": "Stretch first", "photo_id": "p2"}]
    photos = {"p2": {"id": "p2", "signed_url": "https://signed/2", "alt_text": "stretching"}}
    out = splice_image_placements(html, placements, photos)
    assert '<h2>Stretch first</h2><img src="https://signed/2" alt="stretching" loading="lazy">' in out


def test_splice_skips_placement_with_no_matching_heading():
    html = "<h2>Intro</h2><p>hi</p>"
    placements = [{"heading": "Gone now", "photo_id": "p2"}]
    photos = {"p2": {"id": "p2", "signed_url": "https://signed/2", "alt_text": "x"}}
    assert splice_image_placements(html, placements, photos) == html


def test_splice_skips_placement_with_unresolvable_photo():
    html = "<h2>Stretch first</h2><p>bend</p>"
    placements = [{"heading": "Stretch first", "photo_id": "deleted"}]
    assert splice_image_placements(html, placements, {}) == html
```

`resolve_inline_photos`'s two `db`-marked tests need `pytest.mark.django_db` — either add `pytestmark = pytest.mark.django_db(transaction=True)` at module level (matching the rest of the app's test files) and drop the `db` fixture args, or keep the explicit `db` fixture params as shown; either is fine, pick whichever matches how you're reading the surrounding file's convention once it's not empty.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && pytest apps/blog/tests/test_images.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.blog.images'`.

- [ ] **Step 3: Implement**

Create `backend/apps/blog/images.py`:

```python
"""Serve-time photo resolution for BlogPost. Nothing in this module ever
runs before a save() — it only transforms an outgoing response payload, so
the signed URLs it produces are always fresh (see spec §3: a stored URL
would expire long before a published post stops being read)."""

import html as html_lib

from apps.core.storage import generate_presigned_download_url
from apps.media.models import Photo


def _sign(photo):
    return {
        "id": str(photo.id),
        "signed_url": generate_presigned_download_url(photo.s3_key),
        "alt_text": photo.alt_text,
    }


def resolve_cover_photo(post):
    if not post.cover_photo_id:
        return None
    return _sign(post.cover_photo)


def resolve_inline_photos(image_placements):
    """{photo_id: signed dict} for every id referenced in image_placements,
    one query for all of them (not one query per placement). Missing/deleted
    photos are simply absent from the returned dict —
    splice_image_placements skips any placement it can't resolve."""
    photo_ids = [p["photo_id"] for p in image_placements]
    if not photo_ids:
        return {}
    return {str(photo.id): _sign(photo) for photo in Photo.objects.filter(pk__in=photo_ids)}


def splice_image_placements(body_html, image_placements, resolved_photos):
    """resolved_photos: output of resolve_inline_photos(image_placements).
    Heading not found in the current body_html (e.g. hand-edited after
    generation) or photo no longer resolvable -> skip that placement, never
    error the whole response."""
    out = body_html
    for placement in image_placements:
        photo = resolved_photos.get(placement.get("photo_id"))
        if not photo:
            continue
        heading_html = f"<h2>{html_lib.escape(placement.get('heading', ''))}</h2>"
        if heading_html not in out:
            continue
        img = f'<img src="{photo["signed_url"]}" alt="{html_lib.escape(photo["alt_text"])}" loading="lazy">'
        out = out.replace(heading_html, heading_html + img, 1)
    return out
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && pytest apps/blog/tests/test_images.py -v`
Expected: PASS.

- [ ] **Step 5: Write the failing serializer tests**

Add to `backend/apps/blog/tests/test_public_api.py`:

```python
def test_detail_resolves_cover_photo_and_splices_inline_images(posts):
    from unittest import mock

    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="cover.jpg", title="Cover", alt_text="cover alt")
    inline = Photo.objects.create(s3_key="inline.jpg", title="Inline", alt_text="inline alt")
    post = BlogPost.objects.get(slug="pub")
    post.cover_photo = photo
    post.body_html = "<h2>Stretch first</h2><p>bend</p>"
    post.image_placements = [{"heading": "Stretch first", "photo_id": str(inline.id)}]
    post.save()

    with mock.patch(
        "apps.blog.images.generate_presigned_download_url",
        side_effect=lambda key: f"https://signed/{key}",
    ):
        res = APIClient(HTTP_HOST=HOST).get("/api/v1/blog/posts/pub/")

    assert res.data["cover_photo"] == {
        "id": str(photo.id),
        "signed_url": "https://signed/cover.jpg",
        "alt_text": "cover alt",
    }
    assert '<img src="https://signed/inline.jpg" alt="inline alt" loading="lazy">' in res.data["body_html"]


def test_detail_cover_photo_null_when_unset(posts):
    res = APIClient(HTTP_HOST=HOST).get("/api/v1/blog/posts/pub/")
    assert res.data["cover_photo"] is None
```

Add to `backend/apps/blog/tests/test_admin_api.py`:

```python
def test_admin_serializer_exposes_writable_cover_photo(coach_client, free_tenant):
    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="k", title="p")
    res = coach_client.post(
        "/api/v1/admin/blog/posts/",
        {"title": "x", "cover_photo": str(photo.id)},
        format="json",
    )
    assert res.status_code == 201
    post = BlogPost.objects.get(pk=res.data["id"])
    assert post.cover_photo_id == photo.id
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd backend && pytest apps/blog/tests/test_public_api.py apps/blog/tests/test_admin_api.py -k "photo" -v`
Expected: FAIL — `KeyError: 'cover_photo'` (not on either serializer yet).

- [ ] **Step 7: Implement**

Edit `backend/apps/blog/serializers.py`:

```python
from rest_framework import serializers

from apps.core.models import PlatformBlogPost
from apps.media.models import Photo

from .images import resolve_cover_photo, resolve_inline_photos, splice_image_placements
from .models import BlogAutopilot, BlogPost, BlogTopicIdea


class BlogPostListSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogPost
        fields = ("slug", "title", "excerpt", "tags", "published_at")


class BlogPostDetailSerializer(serializers.ModelSerializer):
    cover_photo = serializers.SerializerMethodField()

    class Meta:
        model = BlogPost
        fields = ("slug", "title", "excerpt", "meta_description", "tags", "body_html", "published_at", "cover_photo")

    def get_cover_photo(self, obj):
        return resolve_cover_photo(obj)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.image_placements:
            resolved = resolve_inline_photos(instance.image_placements)
            data["body_html"] = splice_image_placements(instance.body_html, instance.image_placements, resolved)
        return data


class BlogPostAdminSerializer(serializers.ModelSerializer):
    cover_photo = serializers.PrimaryKeyRelatedField(
        queryset=Photo.objects.all(), required=False, allow_null=True
    )
    cover_photo_signed_url = serializers.SerializerMethodField()

    class Meta:
        model = BlogPost
        fields = (
            "id",
            "slug",
            "title",
            "excerpt",
            "meta_description",
            "tags",
            "body_html",
            "status",
            "source",
            "ai_model",
            "cover_photo",
            "cover_photo_signed_url",
            "image_placements",
            "published_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "source",
            "ai_model",
            "cover_photo_signed_url",
            "published_at",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {"slug": {"required": False}}  # perform_create derives it via unique_slug()

    def get_cover_photo_signed_url(self, obj):
        resolved = resolve_cover_photo(obj)
        return resolved["signed_url"] if resolved else None
```

`resolve_cover_photo`/`resolve_inline_photos`/`splice_image_placements` are exactly the functions built and unit-tested in Step 1-4 — both serializers only compose them, no new photo-resolution logic lives in `serializers.py` itself. `cover_photo_signed_url` is read-only (write via `cover_photo`, the id) — it exists purely so the editor (Task 9) can show a thumbnail preview of the currently-set cover photo, the same split `courses/serializers.py` uses for `thumbnail_url`/`thumbnail_signed_url`.

Add one more test to `backend/apps/blog/tests/test_admin_api.py`, alongside `test_admin_serializer_exposes_writable_cover_photo`:

```python
def test_admin_serializer_exposes_cover_photo_signed_url(coach_client, free_tenant, settings):
    from unittest import mock

    from apps.media.models import Photo

    photo = Photo.objects.create(s3_key="k", title="p")
    post = BlogPost.objects.create(title="x", slug="x", cover_photo=photo)
    with mock.patch("apps.blog.images.generate_presigned_download_url", return_value="https://signed/k"):
        res = coach_client.get(f"/api/v1/admin/blog/posts/{post.id}/")
    assert res.data["cover_photo_signed_url"] == "https://signed/k"
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd backend && pytest apps/blog/tests/test_public_api.py apps/blog/tests/test_admin_api.py apps/blog/tests/test_images.py -v`
Expected: PASS, including every pre-existing test in `test_public_api.py`/`test_admin_api.py` (adding a field to a serializer doesn't change existing field behavior).

- [ ] **Step 9: Run the full blog suite**

Run: `cd backend && pytest apps/blog/ -v`
Expected: PASS, all files.

- [ ] **Step 10: Commit**

```bash
git add backend/apps/blog/images.py backend/apps/blog/serializers.py backend/apps/blog/tests/test_images.py backend/apps/blog/tests/test_public_api.py backend/apps/blog/tests/test_admin_api.py
git commit -m "feat(blog): resolve cover/inline photos to fresh signed URLs at serve time"
```

---

## Task 9: Blog editor — manual cover + inline photo controls

**Files:**
- Create: `frontend-customer/src/lib/blog-images.ts`
- Test: `frontend-customer/src/lib/__tests__/blog-images.test.ts`
- Modify: `frontend-customer/src/lib/blog-api.ts` (`BlogPostAdmin` type)
- Modify: `frontend-customer/src/app/admin/blog/[id]/page.tsx`

**Interfaces:**
- Consumes: `PhotoPicker` (`@/components/admin/photo-picker`, props `value?: string | null; previewUrl?: string | null; onSelect: (photo: Photo) => void; onClear?: () => void; label?: string`), `Photo` type (`@/types/photo`).
- Produces: `extractHeadings(bodyHtml: string) -> string[]`; `upsertPlacement(existing: ImagePlacement[], next: ImagePlacement, max = 2) -> ImagePlacement[]` — pure helpers, no other task consumes them.

- [ ] **Step 1: Write the failing pure-logic tests**

Create `frontend-customer/src/lib/__tests__/blog-images.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractHeadings, upsertPlacement } from "@/lib/blog-images";

describe("extractHeadings", () => {
  it("returns each <h2> text in order", () => {
    const html = "<h2>Intro</h2><p>hi</p><h2>Stretch first</h2><p>bend</p>";
    expect(extractHeadings(html)).toEqual(["Intro", "Stretch first"]);
  });

  it("returns an empty array when there are no headings", () => {
    expect(extractHeadings("<p>just text</p>")).toEqual([]);
  });
});

describe("upsertPlacement", () => {
  it("adds a new placement", () => {
    const result = upsertPlacement([], { heading: "A", photo_id: "p1" });
    expect(result).toEqual([{ heading: "A", photo_id: "p1" }]);
  });

  it("replaces the placement for the same heading rather than duplicating", () => {
    const existing = [{ heading: "A", photo_id: "p1" }];
    const result = upsertPlacement(existing, { heading: "A", photo_id: "p2" });
    expect(result).toEqual([{ heading: "A", photo_id: "p2" }]);
  });

  it("caps at 2 placements, dropping the oldest", () => {
    const existing = [
      { heading: "A", photo_id: "p1" },
      { heading: "B", photo_id: "p2" },
    ];
    const result = upsertPlacement(existing, { heading: "C", photo_id: "p3" });
    expect(result).toEqual([
      { heading: "B", photo_id: "p2" },
      { heading: "C", photo_id: "p3" },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/blog-images.test.ts`
Expected: FAIL — `Cannot find module '@/lib/blog-images'`.

- [ ] **Step 3: Implement the pure helpers**

Create `frontend-customer/src/lib/blog-images.ts`:

```ts
export interface ImagePlacement {
  heading: string;
  photo_id: string;
}

const HEADING_RE = /<h2>(.*?)<\/h2>/g;

export function extractHeadings(bodyHtml: string): string[] {
  return [...bodyHtml.matchAll(HEADING_RE)].map((m) => m[1]);
}

export function upsertPlacement(
  existing: ImagePlacement[],
  next: ImagePlacement,
  max = 2,
): ImagePlacement[] {
  const withoutSameHeading = existing.filter((p) => p.heading !== next.heading);
  const combined = [...withoutSameHeading, next];
  return combined.slice(Math.max(0, combined.length - max));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend-customer && npx vitest run src/lib/__tests__/blog-images.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire cover + inline photo controls into the editor**

Edit `frontend-customer/src/lib/blog-api.ts`, add to `BlogPostAdmin` (after `body_html`):

```ts
export interface CoverPhoto {
  id: string;
  signed_url: string;
  alt_text: string;
}

export interface ImagePlacement {
  heading: string;
  photo_id: string;
}
```

```ts
export interface BlogPostAdmin {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  meta_description: string;
  tags: string[];
  body_html: string;
  status: "draft" | "published";
  source: "manual" | "ai" | "autopilot";
  cover_photo: string | null;
  cover_photo_signed_url: string | null;
  image_placements: ImagePlacement[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}
```

Edit `frontend-customer/src/app/admin/blog/[id]/page.tsx`. Add imports:

```tsx
import { PhotoPicker } from "@/components/admin/photo-picker";
import { extractHeadings, upsertPlacement } from "@/lib/blog-images";
import type { Photo } from "@/types/photo";
```

Add a Cover Photo control and an inline-placements list editor, placed after the existing excerpt/meta fields and before `<PostEditor>` (mirrors `course-form.tsx`'s `PhotoPicker` wiring at `course-form.tsx:424-450`):

```tsx
      <PhotoPicker
        label={t("blog.coverPhoto")}
        value={post.cover_photo}
        previewUrl={post.cover_photo_signed_url}
        onSelect={(photo: Photo) =>
          patch({ cover_photo: photo.id, cover_photo_signed_url: photo.signed_url })
        }
        onClear={() => patch({ cover_photo: null, cover_photo_signed_url: null })}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("blog.inlinePhotos")}</p>
        {post.image_placements.map((placement) => (
          <div key={placement.heading} className="flex items-center gap-2">
            <select
              value={placement.heading}
              onChange={(e) =>
                patch({
                  image_placements: upsertPlacement(
                    post.image_placements.filter((p) => p.heading !== placement.heading),
                    { heading: e.target.value, photo_id: placement.photo_id },
                  ),
                })
              }
            >
              {extractHeadings(post.body_html).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            {/* No previewUrl here: image_placements only carries {heading,
                photo_id} — the API doesn't resolve a signed preview per
                placement (only the cover photo gets that treatment, since
                it's the one shown before any picker interaction). Reopening
                an existing placement shows the generic photo icon rather
                than a thumbnail until the coach picks again; swap/remove
                still works correctly. Add a resolved-preview field here if
                that gap turns out to matter in practice. */}
            <PhotoPicker
              value={placement.photo_id}
              onSelect={(photo: Photo) =>
                patch({
                  image_placements: upsertPlacement(post.image_placements, {
                    heading: placement.heading,
                    photo_id: photo.id,
                  }),
                })
              }
              onClear={() =>
                patch({
                  image_placements: post.image_placements.filter((p) => p.heading !== placement.heading),
                })
              }
            />
          </div>
        ))}
        {post.image_placements.length < 2 && extractHeadings(post.body_html).length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              patch({
                image_placements: upsertPlacement(post.image_placements, {
                  heading: extractHeadings(post.body_html)[0],
                  photo_id: "",
                }),
              })
            }
          >
            {t("blog.addInlinePhoto")}
          </Button>
        )}
      </div>
```

`patch()` (already defined at `[id]/page.tsx` — see the existing `const patch = (fields: Partial<BlogPostAdmin>) => ...`) merges into local state; the existing `save()` call already PATCHes the full post including whatever new keys are in state, so `cover_photo`/`image_placements` ride along without changing `save()`.

Add the three new i18n keys to `frontend-customer/messages/en/admin.json`'s `blog` block: `"coverPhoto": "Cover photo"`, `"inlinePhotos": "Inline photos"`, `"addInlinePhoto": "Add inline photo"`; and the `tr/admin.json` equivalents: `"coverPhoto": "Kapak fotoğrafı"`, `"inlinePhotos": "İçerik fotoğrafları"`, `"addInlinePhoto": "İçerik fotoğrafı ekle"`.

- [ ] **Step 6: Verify the build**

Run: `cd frontend-customer && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Manual verification**

Run `make dev`. As a coach with at least 2 uploaded photos and an existing multi-section blog draft: open the post editor, set a cover photo (confirm it persists after save + reload), add an inline photo bound to one of the post's headings (confirm the heading dropdown lists the post's real `<h2>` headings), save, then view the published post on the public site and confirm the image renders inline after that heading. Generate a new AI post on a paid tenant with photos in the library and confirm it sometimes arrives with a cover/inline photo already chosen (nondeterministic — the model may legitimately choose none; re-run if needed).

- [ ] **Step 8: Commit**

```bash
git add frontend-customer/src/lib/blog-images.ts frontend-customer/src/lib/__tests__/blog-images.test.ts frontend-customer/src/lib/blog-api.ts frontend-customer/src/app/admin/blog/[id]/page.tsx frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "feat(blog): manual cover photo + inline photo placement controls in the editor"
```

---

## Rollout notes

Tasks 1-4 (nav) and Tasks 5-9 (blog images) are independent of each other — either half can ship alone. Within the blog-images half, Tasks 5→6→7→8→9 are strictly sequential (each depends on the previous task's model/API surface). Within the nav half, Task 1 must land before Task 3 (Task 3 adds a fourth item to the `ai` section Task 1 creates); Task 2 and Task 4 have no ordering dependency on anything else.
