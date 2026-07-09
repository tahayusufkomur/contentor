# AI Blog System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public `/blog` on every coach site (manual free for all; AI generation Starter 5/mo, Pro 30/mo) with guided + autopilot modes, and a platform SEO blog on contentor.app — per spec `docs/superpowers/specs/2026-07-09-ai-blog-design.md`.

**Architecture:** New tenant app `apps.blog` (posts, topic queue, autopilot rule) + public-schema meter/models in `apps.core`, mirroring the proven Brand Pack AI pattern (single `messages.parse` call, cached static prompt, `LogoAiUsage`-style two-tier accounting) and the recurring-announcements Celery dispatch. One provider interface with two backends: Anthropic SDK (prod) and the Claude CLI on the developer's subscription (local dev), copying the help bot's CLI conventions.

**Tech Stack:** Django 5.1 + DRF + django-tenants, Celery, Anthropic SDK (`messages.parse` + Pydantic), `claude` CLI (dev), Next.js 14 App Router, TipTap 2.27, nh3, `markdown` (new dep).

## Global Constraints

- Quota semantics: **each successful AI generation = 1 credit**; failures record USD but never consume credits (spec §2).
- Plan limits: `PlatformPlan.max_ai_blog_posts` — Free 0, starter 5, pro 30 (`seed_plans.py`).
- Provider values: `BLOG_AI_PROVIDER` = `"anthropic"` (default) | `"cli"` — same convention as `HELP_BOT_PROVIDER`.
- CLI provider MUST strip `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the subprocess env (otherwise the CLI silently bills the API key instead of the subscription) and pass `--disallowedTools "*" --max-turns 1`.
- Model output is **markdown sections**, never HTML; server renders + sanitizes with an explicit nh3 allowlist before persisting `body_html`.
- Public DRF endpoints MUST set `authentication_classes = []` — `AllowAny` alone is not enough (`TenantJWTAuthentication` is the DRF default; see CLAUDE.md).
- Don't hardcode migration numbers — the shared working tree has other agents' uncommitted migrations (e.g. `core/0016_helpbotusage`); always run `make makemigrations` and commit whatever number it produces.
- After creating new migrations, run backend tests once with `make test-fresh` (reuse-db gotcha), then targeted runs are fine.
- Before every commit: `git branch --show-current` must print `main` and `git log --oneline -1` must match what you last saw — the working tree is shared with concurrent agents (verify, then commit only files you touched).
- Dev stack must be running for tests: `make dev` (tests run inside the django container).
- Coach-facing UI: non-technical users — no raw slugs/paths front-and-center (slug under "Advanced"), visual pickers, i18n keys in BOTH `messages/en/admin.json` and `messages/tr/admin.json`.
- Pre-commit must pass; frontends aren't covered by pre-commit — run `npx tsc --noEmit` (or `npm run build`) in each touched frontend before its commit.

---

## Phase 1 — Backend: limits, models, AI engine

### Task 1: Plan limit + BlogAiUsage meter (public schema)

**Files:**
- Modify: `backend/apps/core/models.py` (add `PlatformPlan.max_ai_blog_posts`; add `BlogAiUsage` at end of file, after `HelpBotUsage` if present)
- Modify: `backend/apps/core/management/commands/seed_plans.py`
- Modify: `backend/apps/core/admin_panels.py` (expose new plan field to superadmin plan editor)
- Test: `backend/apps/core/tests/test_blog_ai_usage.py`

**Interfaces:**
- Produces: `BlogAiUsage(tenant_schema, month, generations_used, usd_spent)` with unique `(tenant_schema, month)`; `PlatformPlan.max_ai_blog_posts: PositiveIntegerField(default=0)`. Task 4's helpers and Task 6's views consume both.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/core/tests/test_blog_ai_usage.py
"""BlogAiUsage meter + plan limit field (public schema)."""

import pytest
from django.db import IntegrityError

from apps.core.models import BlogAiUsage, PlatformPlan

pytestmark = pytest.mark.django_db


def test_blog_ai_usage_unique_per_tenant_month():
    BlogAiUsage.objects.create(tenant_schema="t1", month="2026-07")
    with pytest.raises(IntegrityError):
        BlogAiUsage.objects.create(tenant_schema="t1", month="2026-07")


def test_blog_ai_usage_defaults():
    row = BlogAiUsage.objects.create(tenant_schema="t1", month="2026-07")
    assert row.generations_used == 0
    assert row.usd_spent == 0


def test_platform_plan_blog_limit_defaults_to_zero():
    plan = PlatformPlan.objects.create(name="testplan", price_monthly=0)
    assert plan.max_ai_blog_posts == 0
```

Note: if `PlatformPlan.objects.create` needs more required kwargs, copy the minimal kwargs from an existing test that creates a `PlatformPlan` (`grep -rn "PlatformPlan.objects.create" backend/apps/*/tests/`).

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/core/tests/test_blog_ai_usage.py -v`
Expected: FAIL — `ImportError: cannot import name 'BlogAiUsage'`

- [ ] **Step 3: Implement**

In `backend/apps/core/models.py`, inside `PlatformPlan` (next to `max_campaign_emails`):

```python
    # AI blog generations included per calendar month (0 = feature not in plan).
    max_ai_blog_posts = models.PositiveIntegerField(default=0)
```

At the end of the file (mirror `LogoAiUsage`/`HelpBotUsage`):

```python
class BlogAiUsage(models.Model):
    """Durable per-tenant-per-month accounting for AI blog generation
    (apps.blog.ai) — same design as LogoAiUsage: DB-backed so a Redis restart
    can't reset billing-relevant state.

    ``usd_spent`` accrues on EVERY attempt (success or failure) so a
    systematic-failure loop still trips the global kill-switch;
    ``generations_used`` (the plan quota) increments only on success.
    Platform-blog generations record under tenant_schema="public" (USD only —
    no quota applies there).
    """

    tenant_schema = models.CharField(max_length=63)
    month = models.CharField(max_length=7)  # "YYYY-MM"
    generations_used = models.PositiveIntegerField(default=0)
    usd_spent = models.DecimalField(max_digits=8, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "core"
        constraints = [
            models.UniqueConstraint(fields=["tenant_schema", "month"], name="uniq_blog_ai_usage_tenant_month"),
        ]

    def __str__(self):
        return f"{self.tenant_schema} {self.month}: {self.generations_used} posts / ${self.usd_spent}"
```

In `seed_plans.py`, find where the starter/pro plan rows set `max_campaign_emails` (`grep -n "max_campaign_emails" backend/apps/core/management/commands/seed_plans.py`) and add to those defaults dicts: `"max_ai_blog_posts": 5` (starter), `"max_ai_blog_posts": 30` (pro). Also add the same key to the `update_fields`/refresh path if the command updates existing plans (follow exactly what it does for `max_campaign_emails`).

In `backend/apps/core/admin_panels.py`, add `"max_ai_blog_posts"` to the `PlatformPlan` admin's `fields` tuple (next to `max_campaign_emails`).

- [ ] **Step 4: Generate migration + run tests**

Run: `make makemigrations && make test-fresh`
Expected: one new migration in `apps/core/migrations/` (two operations: AddField + CreateModel); full suite PASS including the 3 new tests.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/core/models.py backend/apps/core/migrations/ backend/apps/core/management/commands/seed_plans.py backend/apps/core/admin_panels.py backend/apps/core/tests/test_blog_ai_usage.py
git commit -m "feat(blog): plan-gated AI blog quota field + BlogAiUsage meter"
```

---

### Task 2: `apps.blog` tenant app + models

**Files:**
- Create: `backend/apps/blog/__init__.py`, `backend/apps/blog/apps.py`, `backend/apps/blog/models.py`, `backend/apps/blog/migrations/__init__.py`, `backend/apps/blog/tests/__init__.py`
- Modify: `backend/config/settings/base.py` (append `"apps.blog"` to `TENANT_APPS`, after `"apps.community"`)
- Test: `backend/apps/blog/tests/test_models.py`

**Interfaces:**
- Produces: `BlogPost` (statuses `draft|published`, sources `manual|ai|autopilot`, `unique_slug(title)` helper), `BlogTopicIdea` (statuses `available|used|dismissed`), `BlogAutopilot` (singleton `pk=1` via `BlogAutopilot.load()`, fields mirroring `RecurringAnnouncement`: `frequency`, `generate_time`, `weekday`, `day_of_month`, `next_run_at`, `is_enabled`, `auto_publish`, `last_skip_notice_month`). All tenant-schema.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/blog/tests/test_models.py
"""BlogPost slugging, BlogAutopilot singleton, topic queue basics."""

import pytest

from apps.blog.models import BlogAutopilot, BlogPost, BlogTopicIdea, unique_slug

pytestmark = pytest.mark.django_db


def test_unique_slug_deduplicates():
    BlogPost.objects.create(title="Morning Habits", slug=unique_slug("Morning Habits"))
    assert unique_slug("Morning Habits") == "morning-habits-2"


def test_unique_slug_truncates_and_kebabs():
    slug = unique_slug("A" * 300 + " çok güzel Bir Başlık!!")
    assert len(slug) <= 60
    assert " " not in slug and slug == slug.lower()


def test_autopilot_singleton():
    a = BlogAutopilot.load()
    b = BlogAutopilot.load()
    assert a.pk == b.pk == 1
    assert a.is_enabled is False and a.auto_publish is False


def test_topic_defaults_available():
    t = BlogTopicIdea.objects.create(title="5 stretches", angle="quick wins")
    assert t.status == "available"
```

NOTE: these run in a tenant schema — check how existing tenant-app tests get one (`backend/conftest.py` fixtures; e.g. how `apps/notifications/tests/test_recurring_dispatch.py` does it) and apply the same fixture/mark.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/blog/tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'apps.blog'`

- [ ] **Step 3: Implement**

```python
# backend/apps/blog/apps.py
from django.apps import AppConfig


class BlogConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.blog"
```

```python
# backend/apps/blog/models.py
"""Coach blog: public posts on the tenant site, an AI topic queue, and the
autopilot schedule rule. See docs/superpowers/specs/2026-07-09-ai-blog-design.md."""

from django.conf import settings
from django.db import models
from django.utils.text import slugify

MAX_SLUG_LEN = 60


def unique_slug(title):
    """Kebab slug from a title, unique among BlogPosts (suffix -2, -3, …).
    Always derived server-side — never trusted from AI or client input."""
    base = slugify(title)[:MAX_SLUG_LEN].strip("-") or "post"
    slug, n = base, 1
    while BlogPost.objects.filter(slug=slug).exists():
        n += 1
        slug = f"{base[: MAX_SLUG_LEN - len(str(n)) - 1]}-{n}"
    return slug


class BlogPost(models.Model):
    STATUS = [("draft", "Draft"), ("published", "Published")]
    SOURCE = [("manual", "Manual"), ("ai", "AI"), ("autopilot", "Autopilot")]

    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=70, unique=True)
    body_html = models.TextField(blank=True, default="")  # sanitized HTML only
    excerpt = models.CharField(max_length=300, blank=True, default="")
    meta_description = models.CharField(max_length=170, blank=True, default="")
    tags = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=12, choices=STATUS, default="draft")
    source = models.CharField(max_length=12, choices=SOURCE, default="manual")
    ai_model = models.CharField(max_length=60, blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "blog"
        ordering = ["-created_at"]

    def __str__(self):
        return f"BlogPost<{self.pk}:{self.slug}:{self.status}>"


class BlogTopicIdea(models.Model):
    """AI-suggested topics. Batched 12-at-a-time on the cheap model so picking
    a topic never costs a per-decision LLM call (token-efficiency contract)."""

    STATUS = [("available", "Available"), ("used", "Used"), ("dismissed", "Dismissed")]

    title = models.CharField(max_length=200)
    angle = models.CharField(max_length=300, blank=True, default="")
    status = models.CharField(max_length=12, choices=STATUS, default="available")
    batch_id = models.CharField(max_length=36, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "blog"
        ordering = ["created_at"]


class BlogAutopilot(models.Model):
    """Singleton (pk=1) per tenant: the hands-off generation schedule.
    Field shapes mirror notifications.RecurringAnnouncement so the shared
    recurrence.next_occurrence() math applies unchanged."""

    FREQ = [("weekly", "Weekly"), ("monthly", "Monthly")]

    is_enabled = models.BooleanField(default=False)
    frequency = models.CharField(max_length=10, choices=FREQ, default="weekly")
    generate_time = models.TimeField(default="09:00")
    weekday = models.SmallIntegerField(null=True, blank=True)  # 0=Mon..6=Sun (weekly)
    day_of_month = models.SmallIntegerField(null=True, blank=True)  # 1..31 (monthly)
    auto_publish = models.BooleanField(default=False)  # False = review-first draft
    next_run_at = models.DateTimeField(null=True, blank=True)
    # "YYYY-MM" of the last out-of-credits notice, so a weekly schedule doesn't
    # nag the coach 4x in an exhausted month.
    last_skip_notice_month = models.CharField(max_length=7, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "blog"

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
```

Append `"apps.blog"` to `TENANT_APPS` in `backend/config/settings/base.py` (after `"apps.community"`).

- [ ] **Step 4: Generate migration + run tests**

Run: `make makemigrations && make test-fresh`
Expected: `apps/blog/migrations/0001_initial.py` created; suite PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/apps/blog/ backend/config/settings/base.py
git commit -m "feat(blog): tenant models — BlogPost, topic queue, autopilot singleton"
```

---

### Task 3: Markdown renderer + prompts + output schemas (`ai.py` part 1)

**Files:**
- Create: `backend/apps/blog/ai.py`
- Modify: `backend/requirements/base.txt` (add `markdown>=3.6,<4` next to `anthropic`)
- Test: `backend/apps/blog/tests/test_render.py`

**Interfaces:**
- Produces: pydantic models `_Section {heading, body_markdown}`, `_BlogDraft {title, slug, meta_description, excerpt, tags, sections}`, `_TopicBatch {topics: [{title, angle}]}`; `render_body(sections) -> str` (sanitized HTML); constants `BLOG_STATIC_PROMPT`, `TOPIC_STATIC_PROMPT`, `PROMPT_VERSION`; `brand_brief(config, course_titles) -> str`; `BlogAiError(message, cost_usd)`.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/blog/tests/test_render.py
"""Deterministic markdown->sanitized-HTML rendering. No AI, no network."""

from apps.blog.ai import _Section, render_body


def test_render_sections_to_headed_html():
    html = render_body(
        [
            _Section(heading="Why it matters", body_markdown="Strong start.\n\n- one\n- two"),
            _Section(heading="", body_markdown="Closing *thought*."),
        ]
    )
    assert "<h2>Why it matters</h2>" in html
    assert "<li>one</li>" in html
    assert "<em>thought</em>" in html
    assert "<h2></h2>" not in html  # empty headings dropped


def test_render_strips_dangerous_html():
    html = render_body(
        [_Section(heading="<script>alert(1)</script>Hi", body_markdown='<img src=x onerror=alert(1)> ok\n\n<a href="javascript:x()">l</a>')]
    )
    assert "<script" not in html and "onerror" not in html and "javascript:" not in html


def test_render_is_deterministic():
    sections = [_Section(heading="A", body_markdown="**b** and [l](https://x.com)")]
    assert render_body(sections) == render_body(sections)
    assert '<a href="https://x.com"' in render_body(sections)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/blog/tests/test_render.py -v`
Expected: FAIL — no module `apps.blog.ai`

- [ ] **Step 3: Implement**

Add `markdown>=3.6,<4` to `backend/requirements/base.txt`, then rebuild the django image (`docker compose build django && make dev` — or `docker compose exec django pip install "markdown>=3.6,<4"` for the fast loop, but the rebuild must happen before this task's commit).

```python
# backend/apps/blog/ai.py
"""AI blog generation engine (see spec §5). Token-efficiency contract:

- ONE model call per post via structured output — no outline/draft chains.
- The static prompts below are byte-frozen and cached (cache_control:
  ephemeral); per-tenant state travels in the small user message only. Never
  interpolate tenant data into the static prompts (it would fragment the
  cache). Bump PROMPT_VERSION on any static-prompt change.
- The model emits markdown sections, never HTML (~30% cheaper); render_body()
  converts + sanitizes server-side.
- Topics are batched 12-at-a-time on the cheap model into BlogTopicIdea.

Two providers behind one call shape (BLOG_AI_PROVIDER, matching the help
bot's convention): "anthropic" (prod; SDK messages.parse + prompt caching)
and "cli" (local dev on the developer's Claude subscription; ANTHROPIC_API_KEY
is stripped from the subprocess env so the CLI can't silently bill it).
"""

from datetime import UTC, datetime
from decimal import Decimal

from django.conf import settings
from pydantic import BaseModel, Field

from apps.core.models import BlogAiUsage
from apps.tenant_config.logo_ai import _estimate_cost  # shared price table

PROMPT_VERSION = 1
MAX_OUTPUT_TOKENS = 3000
TOPIC_MAX_OUTPUT_TOKENS = 1200
CLI_TIMEOUT_SECONDS = 120

# ── Output contracts ─────────────────────────────────────────────────────────


class _Section(BaseModel):
    heading: str = ""  # empty = continuation paragraphs, no <h2>
    body_markdown: str


class _BlogDraft(BaseModel):
    title: str
    slug: str
    meta_description: str
    excerpt: str
    tags: list[str] = Field(default_factory=list)
    sections: list[_Section]


class _TopicIdea(BaseModel):
    title: str
    angle: str = ""


class _TopicBatch(BaseModel):
    topics: list[_TopicIdea]


class BlogAiError(Exception):
    """Generation failed after the call was (possibly) billed. Carries the
    estimated cost so callers can still record it against the kill-switch."""

    def __init__(self, message, cost_usd=Decimal("0")):
        super().__init__(message)
        self.cost_usd = cost_usd


# ── Static prompts (cached; never interpolate tenant data here) ──────────────

BLOG_STATIC_PROMPT = """You are a professional blog writer for a coaching \
business (a coach who sells courses and coaching to their audience). You \
write one complete, publish-ready blog post per request.

Voice and quality rules:
- Warm, expert, plain language. Write like the coach talking to their \
audience — no corporate filler, no "in today's fast-paced world" openers.
- Write in the SAME LANGUAGE as the brand brief (Turkish brief → Turkish \
post, English brief → English post).
- Be concrete and practical: steps, examples, small routines the reader can \
do today. Never invent statistics, studies, client stories or testimonials.
- Never promise income, guaranteed results, or medical outcomes.

Structure rules:
- 800-1200 words total, split into 4-7 sections.
- Each section: a short heading (empty string for the intro section) and \
1-3 paragraphs of markdown.
- Markdown subset ONLY: paragraphs separated by blank lines, **bold**, \
*italic*, "- " bullet lists, and [text](https://...) links sparingly. \
No headings inside body_markdown, no images, no HTML, no code blocks.

Metadata rules:
- title: compelling, ≤70 characters, contains the topic's main keyword.
- slug: kebab-case, ≤60 characters, ascii.
- meta_description: ≤155 characters, invites the click, no clickbait.
- excerpt: 1-2 sentences (≤40 words) teasing the post for a listing page.
- tags: 3-6 lowercase short tags in the post's language."""

TOPIC_STATIC_PROMPT = """You are a content strategist for a coaching \
business. Given a brand brief and a list of already-covered blog titles, \
propose exactly 12 NEW blog topic ideas that would attract this coach's \
audience via search.

Rules:
- Same language as the brand brief.
- Mix formats: how-to, listicle, myth-busting, beginner guide, common \
mistakes, seasonal angles.
- Specific to this niche and audience — no generic "5 productivity tips".
- Must not duplicate or trivially rephrase any already-covered title.
- Each idea: a post title (≤70 chars) plus one line on the angle."""


def brand_brief(config, course_titles=(), tenant=None):
    """~200-token plain-text brief. Everything tenant-specific goes HERE (the
    cacheable static prompt must stay byte-identical across tenants)."""
    lines = [
        "<brand_brief>",
        f"Brand: {(config.brand_name if config else '') or 'a coaching brand'}",
        f"About: {(config.meta_description if config else '') or '-'}",
    ]
    if course_titles:
        lines.append("Their courses: " + "; ".join(list(course_titles)[:6]))
    lines.append("Audience: this coach's students and prospective students.")
    lines.append("</brand_brief>")
    return "\n".join(lines)


# ── Markdown -> sanitized HTML ───────────────────────────────────────────────

_BLOG_TAGS = {"p", "br", "strong", "em", "b", "i", "ul", "ol", "li", "h2", "h3", "blockquote", "a"}
_BLOG_ATTRS = {"a": {"href"}}


def render_body(sections):
    """Deterministic markdown->HTML for the restricted subset the prompt
    allows, then nh3-sanitized. This is the trust boundary: nothing
    model-generated reaches body_html except through here."""
    import markdown as md

    import nh3

    parts = []
    for s in sections:
        heading = (s.heading or "").strip()
        if heading:
            parts.append(f"## {heading}")
        body = (s.body_markdown or "").strip()
        if body:
            parts.append(body)
    raw = md.markdown("\n\n".join(parts), extensions=[])  # core syntax only
    # The "## " headings arrive as h2 from markdown; clamp everything else.
    return nh3.clean(raw, tags=_BLOG_TAGS, attributes=_BLOG_ATTRS)
```

- [ ] **Step 4: Run tests**

Run: `docker compose exec django pytest apps/blog/tests/test_render.py -v`
Expected: 3 PASS. (If nh3 rejects the `attributes` kwarg shape, mirror the exact call in `apps/tenant_config/defaults.py:sanitize_rich_text`.)

- [ ] **Step 5: Commit**

```bash
git add backend/apps/blog/ai.py backend/apps/blog/tests/test_render.py backend/requirements/base.txt
git commit -m "feat(blog): AI output schemas, cached prompts, sanitizing markdown renderer"
```

---

### Task 4: Providers + generation + quota helpers (`ai.py` part 2) + settings

**Files:**
- Modify: `backend/apps/blog/ai.py` (append)
- Modify: `backend/config/settings/base.py` (BLOG_AI_* block after the HELP_BOT block)
- Modify: `.env.prod.example` (document BLOG_AI_* prod vars)
- Test: `backend/apps/blog/tests/test_ai.py`

**Interfaces:**
- Consumes: `_BlogDraft`, `_TopicBatch`, `render_body`, `brand_brief`, `BlogAiError` (Task 3); `BlogAiUsage` (Task 1).
- Produces (used by Tasks 6-7 and 11):
  - `generate_post(brief, topic, instructions="") -> DraftResult` where `DraftResult.fields` is a dict ready for `BlogPost(**fields)` minus slug/status (`{title, body_html, excerpt, meta_description, tags, ai_model}`) and `DraftResult.cost_usd: Decimal`
  - `generate_topics(brief, existing_titles) -> (list[{title, angle}], Decimal)`
  - `availability(tenant) -> {"enabled", "eligible", "remaining", "limit", "reason"}` (reason: `None|"upgrade_required"|"quota_exhausted"|"disabled"|"budget"`)
  - `current_month()`, `tenant_usage(schema, month)`, `global_spend(month)`, `record_attempt_cost(schema, usd, month)`, `record_success(schema, month)`

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/blog/tests/test_ai.py
"""Provider selection, CLI envelope parsing, quota/availability logic.
No network, no real subprocess (mirrors test_help_bot.py style)."""

import json
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

import pytest

from apps.blog import ai
from apps.core.models import BlogAiUsage, PlatformPlan

pytestmark = pytest.mark.django_db

SCHEMA = "blog_ai_test"
MONTH = "2026-07"

DRAFT_JSON = json.dumps(
    {
        "title": "Morning Habits That Stick",
        "slug": "morning-habits",
        "meta_description": "Five tiny habits.",
        "excerpt": "Start smaller than you think.",
        "tags": ["habits"],
        "sections": [{"heading": "", "body_markdown": "Start **small**."}],
    }
)


def _cli_envelope(result_text):
    return json.dumps({"type": "result", "result": result_text, "total_cost_usd": 0})


def test_cli_provider_parses_envelope_and_validates(settings, monkeypatch):
    settings.BLOG_AI_PROVIDER = "cli"
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(DRAFT_JSON), stderr="")
    with mock.patch("subprocess.run", return_value=completed) as run:
        parsed, cost = ai._call_structured("sys", "user", ai._BlogDraft, max_tokens=ai.MAX_OUTPUT_TOKENS)
    assert parsed.title == "Morning Habits That Stick"
    assert cost == Decimal("0")
    argv = run.call_args.args[0]
    assert "--disallowedTools" in argv and "--max-turns" in argv
    env = run.call_args.kwargs["env"]
    assert "ANTHROPIC_API_KEY" not in env and "ANTHROPIC_AUTH_TOKEN" not in env


def test_cli_provider_strips_code_fences(settings):
    settings.BLOG_AI_PROVIDER = "cli"
    fenced = "```json\n" + DRAFT_JSON + "\n```"
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(fenced), stderr="")
    with mock.patch("subprocess.run", return_value=completed):
        parsed, _ = ai._call_structured("sys", "user", ai._BlogDraft, max_tokens=100)
    assert parsed.slug == "morning-habits"


def test_cli_provider_raises_blog_ai_error_on_failure(settings):
    settings.BLOG_AI_PROVIDER = "cli"
    completed = SimpleNamespace(returncode=1, stdout="", stderr="boom")
    with mock.patch("subprocess.run", return_value=completed):
        with pytest.raises(ai.BlogAiError):
            ai._call_structured("sys", "user", ai._BlogDraft, max_tokens=100)


def test_generate_post_returns_rendered_fields(settings):
    settings.BLOG_AI_PROVIDER = "cli"
    completed = SimpleNamespace(returncode=0, stdout=_cli_envelope(DRAFT_JSON), stderr="")
    with mock.patch("subprocess.run", return_value=completed):
        result = ai.generate_post("<brand_brief>x</brand_brief>", "Morning habits")
    assert result.fields["title"] == "Morning Habits That Stick"
    assert "<strong>small</strong>" in result.fields["body_html"]
    assert "slug" not in result.fields  # slugs are re-derived server-side


def _tenant(plan_limit, paid=True):
    plan = PlatformPlan.objects.create(name=f"p{plan_limit}", price_monthly=1, max_ai_blog_posts=plan_limit)
    return SimpleNamespace(schema_name=SCHEMA, plan=plan, has_paid_platform_plan=paid)


def test_availability_upgrade_required_for_free(settings):
    settings.ANTHROPIC_API_KEY = "k"
    status = ai.availability(_tenant(0, paid=False))
    assert status["eligible"] is False and status["reason"] == "upgrade_required"


def test_availability_quota_exhausted(settings):
    settings.ANTHROPIC_API_KEY = "k"
    BlogAiUsage.objects.create(tenant_schema=SCHEMA, month=ai.current_month(), generations_used=5)
    status = ai.availability(_tenant(5))
    assert status["remaining"] == 0 and status["reason"] == "quota_exhausted"


def test_availability_budget_kill_switch(settings):
    settings.ANTHROPIC_API_KEY = "k"
    settings.BLOG_AI_MONTHLY_BUDGET_USD = 1.0
    BlogAiUsage.objects.create(tenant_schema="other", month=ai.current_month(), usd_spent=Decimal("2"))
    status = ai.availability(_tenant(5))
    assert status["enabled"] is False and status["reason"] == "budget"


def test_record_attempt_and_success_two_tier():
    ai.record_attempt_cost(SCHEMA, Decimal("0.03"), month=MONTH)
    row = ai.tenant_usage(SCHEMA, month=MONTH)
    assert row.usd_spent == Decimal("0.03") and row.generations_used == 0
    ai.record_success(SCHEMA, month=MONTH)
    row.refresh_from_db()
    assert row.generations_used == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose exec django pytest apps/blog/tests/test_ai.py -v`
Expected: FAIL — `_call_structured` etc. not defined.

- [ ] **Step 3: Implement — append to `backend/apps/blog/ai.py`**

```python
# ── Providers ────────────────────────────────────────────────────────────────


def _call_structured(system_prompt, user_prompt, output_model, max_tokens):
    """One structured-output model call -> (validated output_model, cost).
    Provider-agnostic: everything above this line behaves identically for
    "anthropic" and "cli". Raises BlogAiError on any provider failure."""
    if settings.BLOG_AI_PROVIDER == "cli":
        return _cli_structured(system_prompt, user_prompt, output_model, max_tokens)
    return _anthropic_structured(system_prompt, user_prompt, output_model, max_tokens)


def _anthropic_structured(system_prompt, user_prompt, output_model, max_tokens):
    from anthropic import Anthropic

    model = settings.BLOG_AI_MODEL if output_model is _BlogDraft else settings.BLOG_AI_TOPIC_MODEL
    client = Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=100.0, max_retries=1)
    response = client.messages.parse(
        model=model,
        max_tokens=max_tokens,
        system=[{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_prompt}],
        output_format=output_model,
    )
    return response.parsed_output, _estimate_cost(response.usage, model)


def _cli_structured(system_prompt, user_prompt, output_model, max_tokens):
    """Local-dev provider: one blocking `claude -p` run on the developer's
    subscription. The CLI has no parse-forced structured output, so the
    schema contract is appended to the system prompt and the result is
    validated with the SAME pydantic model as the anthropic path."""
    import json as _json
    import os
    import subprocess
    import tempfile

    from pydantic import ValidationError

    schema_note = (
        "\n\nRespond with ONLY a JSON object (no prose, no code fences) matching this JSON schema:\n"
        + _json.dumps(output_model.model_json_schema())
    )
    cmd = [
        settings.BLOG_AI_CLI_BIN,
        "-p",
        user_prompt,
        "--model",
        settings.BLOG_AI_CLI_MODEL,
        "--system-prompt",
        system_prompt + schema_note,
        "--disallowedTools",
        "*",
        "--max-turns",
        "1",
        "--output-format",
        "json",
    ]
    # Subscription auth only: with ANTHROPIC_API_KEY present the CLI would
    # bill the API key instead of the subscription.
    env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
    try:
        proc = subprocess.run(  # noqa: S603 — fixed argv, no shell
            cmd,
            capture_output=True,
            text=True,
            timeout=CLI_TIMEOUT_SECONDS,
            env=env,
            cwd=tempfile.gettempdir(),
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BlogAiError(f"claude CLI not runnable: {exc}") from exc
    if proc.returncode != 0:
        raise BlogAiError(f"claude CLI failed (rc={proc.returncode}): {(proc.stderr or '')[:500]}")
    try:
        envelope = _json.loads(proc.stdout)
        text = (envelope.get("result") or "").strip()
        if text.startswith("```"):
            text = text.strip("`\n")
            if text.startswith("json"):
                text = text[4:].lstrip()
        parsed = output_model.model_validate_json(text)
    except (ValueError, ValidationError) as exc:
        raise BlogAiError(f"claude CLI output did not match schema: {exc}") from exc
    # Subscription usage — nothing accrues against the USD caps.
    return parsed, Decimal("0")


# ── High-level generation ────────────────────────────────────────────────────


class DraftResult:
    def __init__(self, fields, cost_usd):
        self.fields = fields
        self.cost_usd = cost_usd


def generate_post(brief, topic, instructions=""):
    """ONE model call -> BlogPost-ready field dict. Slug and status are
    intentionally absent (callers re-derive the slug via models.unique_slug
    and decide status). Raises BlogAiError on failure."""
    user_prompt = f"{brief}\n\nWrite a blog post about: {topic}"
    if instructions:
        user_prompt += f"\n\nThe coach's extra instructions: {instructions[:500]}"
    parsed, cost = _call_structured(BLOG_STATIC_PROMPT, user_prompt, _BlogDraft, MAX_OUTPUT_TOKENS)
    body_html = render_body(parsed.sections)
    if not body_html.strip():
        raise BlogAiError("model returned an empty post", cost_usd=cost)
    return DraftResult(
        {
            "title": str(parsed.title)[:200],
            "body_html": body_html,
            "excerpt": str(parsed.excerpt)[:300],
            "meta_description": str(parsed.meta_description)[:170],
            "tags": [str(t).lower()[:30] for t in parsed.tags[:6]],
            "ai_model": settings.BLOG_AI_MODEL if settings.BLOG_AI_PROVIDER == "anthropic" else settings.BLOG_AI_CLI_MODEL,
        },
        cost,
    )


def generate_topics(brief, existing_titles=()):
    """One cheap-model call -> 12 topic dicts. Costs budget USD, never quota."""
    titles = "; ".join(list(existing_titles)[:20]) or "-"
    user_prompt = f"{brief}\n\nAlready-covered titles: {titles}"
    parsed, cost = _call_structured(TOPIC_STATIC_PROMPT, user_prompt, _TopicBatch, TOPIC_MAX_OUTPUT_TOKENS)
    topics = [{"title": str(t.title)[:200], "angle": str(t.angle)[:300]} for t in parsed.topics[:12]]
    if not topics:
        raise BlogAiError("model returned no topics", cost_usd=cost)
    return topics, cost


# ── Availability + usage accounting (mirrors logo_ai) ────────────────────────


def current_month():
    return datetime.now(UTC).strftime("%Y-%m")


def tenant_usage(tenant_schema, month=None):
    row, _ = BlogAiUsage.objects.get_or_create(tenant_schema=tenant_schema, month=month or current_month())
    return row


def global_spend(month=None):
    from django.db.models import Sum

    total = BlogAiUsage.objects.filter(month=month or current_month()).aggregate(t=Sum("usd_spent"))["t"]
    return total or Decimal("0")


def record_attempt_cost(tenant_schema, usd, month=None):
    """Charged on EVERY call attempt (success or failure) — kill-switch integrity."""
    from django.db.models import F

    row = tenant_usage(tenant_schema, month=month)
    BlogAiUsage.objects.filter(pk=row.pk).update(usd_spent=F("usd_spent") + usd)


def record_success(tenant_schema, month=None):
    """Only a successful, validated generation consumes a quota credit."""
    from django.db.models import F

    row = tenant_usage(tenant_schema, month=month)
    BlogAiUsage.objects.filter(pk=row.pk).update(generations_used=F("generations_used") + 1)


def _provider_configured():
    if settings.BLOG_AI_PROVIDER == "cli":
        import shutil

        return shutil.which(settings.BLOG_AI_CLI_BIN) is not None
    return bool(settings.ANTHROPIC_API_KEY)


def plan_limit(tenant):
    plan = getattr(tenant, "plan", None)
    return getattr(plan, "max_ai_blog_posts", 0) or 0


def availability(tenant, month=None):
    """The single gate every generation path checks. Shape mirrors the Brand
    Pack status endpoint so the frontend upsell pattern transfers."""
    month = month or current_month()
    limit = plan_limit(tenant)
    eligible = tenant.has_paid_platform_plan and limit > 0
    used = tenant_usage(tenant.schema_name, month=month).generations_used
    remaining = max(0, limit - used)
    budget_ok = global_spend(month=month) < Decimal(str(settings.BLOG_AI_MONTHLY_BUDGET_USD))
    enabled = _provider_configured() and budget_ok
    if not eligible:
        reason = "upgrade_required"
    elif not _provider_configured():
        reason = "disabled"
    elif not budget_ok:
        reason = "budget"
    elif remaining <= 0:
        reason = "quota_exhausted"
    else:
        reason = None
    return {"enabled": enabled, "eligible": eligible, "remaining": remaining, "limit": limit, "reason": reason}
```

Settings block in `backend/config/settings/base.py` (directly after the HELP_BOT block):

```python
# --- AI blog generation (apps.blog.ai) ---
# "anthropic" (prod: API key + prompt caching) or "cli" (local dev on the
# developer's Claude subscription; reuses the help bot's CLI container
# install + CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`).
BLOG_AI_PROVIDER = os.environ.get("BLOG_AI_PROVIDER", "anthropic")
BLOG_AI_MODEL = os.environ.get("BLOG_AI_MODEL", "claude-sonnet-5")
BLOG_AI_TOPIC_MODEL = os.environ.get("BLOG_AI_TOPIC_MODEL", "claude-haiku-4-5")
BLOG_AI_CLI_MODEL = os.environ.get("BLOG_AI_CLI_MODEL", "sonnet")
BLOG_AI_CLI_BIN = os.environ.get("BLOG_AI_CLI_BIN", "claude")
# Global monthly USD kill-switch across ALL blog AI (attempts included).
BLOG_AI_MONTHLY_BUDGET_USD = float(os.environ.get("BLOG_AI_MONTHLY_BUDGET_USD", "30"))
```

`.env.prod.example`: add under the existing AI section —

```
# AI blog generation (prod uses the Anthropic API; owner-provided key above)
BLOG_AI_PROVIDER=anthropic
BLOG_AI_MONTHLY_BUDGET_USD=30
```

Local `.env` (developer does this by hand, document in commit message): `BLOG_AI_PROVIDER=cli` + existing `CLAUDE_CODE_OAUTH_TOKEN`.

- [ ] **Step 4: Run tests**

Run: `docker compose exec django pytest apps/blog/tests/ -v`
Expected: all PASS (render + ai + models).

- [ ] **Step 5: Commit**

```bash
git add backend/apps/blog/ai.py backend/apps/blog/tests/test_ai.py backend/config/settings/base.py .env.prod.example
git commit -m "feat(blog): anthropic+cli providers, generation, quota/budget accounting"
```

---

## Phase 2 — Backend: APIs + autopilot

### Task 5: Public blog API

**Files:**
- Create: `backend/apps/blog/serializers.py`, `backend/apps/blog/views.py`, `backend/apps/blog/urls.py`
- Modify: `backend/config/urls.py`
- Test: `backend/apps/blog/tests/test_public_api.py`

**Interfaces:**
- Produces: `GET /api/v1/blog/posts/` (paginated, published only: `title, slug, excerpt, tags, published_at`) and `GET /api/v1/blog/posts/<slug>/` (adds `body_html, meta_description`). Consumed by both Next.js public sites.

- [ ] **Step 1: Write the failing test**

```python
# backend/apps/blog/tests/test_public_api.py
"""Public endpoints: published-only, no auth required, drafts 404."""

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.blog.models import BlogPost

pytestmark = pytest.mark.django_db


@pytest.fixture()
def posts():
    BlogPost.objects.create(title="Pub", slug="pub", status="published", published_at=timezone.now(), body_html="<p>x</p>")
    BlogPost.objects.create(title="Draft", slug="draft", status="draft")


def test_list_returns_only_published_without_auth(posts):
    res = APIClient().get("/api/v1/blog/posts/")
    assert res.status_code == 200
    slugs = [p["slug"] for p in res.data["results"]]
    assert slugs == ["pub"]
    assert "body_html" not in res.data["results"][0]  # list stays light


def test_detail_serves_published(posts):
    res = APIClient().get("/api/v1/blog/posts/pub/")
    assert res.status_code == 200
    assert res.data["body_html"] == "<p>x</p>"


def test_detail_404s_draft(posts):
    assert APIClient().get("/api/v1/blog/posts/draft/").status_code == 404
```

(Use the same tenant-schema test fixture approach as Task 2. If the test client needs a tenant Host header, copy how existing public-endpoint tests do it — `grep -rn "APIClient()" backend/apps/tenant_config/tests/ | head`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec django pytest apps/blog/tests/test_public_api.py -v`
Expected: FAIL — 404 (no route).

- [ ] **Step 3: Implement**

```python
# backend/apps/blog/serializers.py
from rest_framework import serializers

from .models import BlogAutopilot, BlogPost, BlogTopicIdea


class BlogPostListSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogPost
        fields = ("slug", "title", "excerpt", "tags", "published_at")


class BlogPostDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogPost
        fields = ("slug", "title", "excerpt", "meta_description", "tags", "body_html", "published_at")


class BlogPostAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogPost
        fields = (
            "id", "slug", "title", "excerpt", "meta_description", "tags",
            "body_html", "status", "source", "ai_model", "published_at",
            "created_at", "updated_at",
        )
        read_only_fields = ("id", "source", "ai_model", "published_at", "created_at", "updated_at")


class BlogTopicIdeaSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogTopicIdea
        fields = ("id", "title", "angle", "status")
        read_only_fields = ("id", "status")


class BlogAutopilotSerializer(serializers.ModelSerializer):
    class Meta:
        model = BlogAutopilot
        fields = ("is_enabled", "frequency", "generate_time", "weekday", "day_of_month", "auto_publish", "next_run_at")
        read_only_fields = ("next_run_at",)

    def validate(self, attrs):
        freq = attrs.get("frequency", getattr(self.instance, "frequency", "weekly"))
        if freq == "weekly" and attrs.get("weekday", getattr(self.instance, "weekday", None)) is None:
            raise serializers.ValidationError({"weekday": "required for weekly"})
        if freq == "monthly" and attrs.get("day_of_month", getattr(self.instance, "day_of_month", None)) is None:
            raise serializers.ValidationError({"day_of_month": "required for monthly"})
        return attrs
```

```python
# backend/apps/blog/views.py  (public half; Task 6 appends the admin half)
"""Blog API: public read endpoints + coach admin endpoints (Task 6)."""

from rest_framework import generics
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny

from .models import BlogPost
from .serializers import BlogPostDetailSerializer, BlogPostListSerializer


class _PublicPagination(PageNumberPagination):
    page_size = 12


class PublicPostList(generics.ListAPIView):
    """Anonymous — served on every tenant's public site. authentication_classes
    MUST stay empty (TenantJWTAuthentication is the DRF default)."""

    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = BlogPostListSerializer
    pagination_class = _PublicPagination

    def get_queryset(self):
        return BlogPost.objects.filter(status="published").order_by("-published_at")


class PublicPostDetail(generics.RetrieveAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = BlogPostDetailSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return BlogPost.objects.filter(status="published")
```

```python
# backend/apps/blog/urls.py
from django.urls import path

from .views import PublicPostDetail, PublicPostList

urlpatterns = [
    path("posts/", PublicPostList.as_view(), name="blog-public-list"),
    path("posts/<slug:slug>/", PublicPostDetail.as_view(), name="blog-public-detail"),
]
```

`backend/config/urls.py` — add with the other v1 includes:

```python
    path("api/v1/blog/", include("apps.blog.urls")),
    path("api/v1/admin/blog/", include("apps.blog.admin_urls")),  # Task 6 creates this
```

(Add only the first line now; add the second in Task 6.)

- [ ] **Step 4: Run tests + commit**

Run: `docker compose exec django pytest apps/blog/tests/test_public_api.py -v` → PASS.

```bash
git add backend/apps/blog/serializers.py backend/apps/blog/views.py backend/apps/blog/urls.py backend/config/urls.py backend/apps/blog/tests/test_public_api.py
git commit -m "feat(blog): public read API (published-only list + detail)"
```

---

### Task 6: Coach admin API — CRUD, status, generate, topics, autopilot

**Files:**
- Modify: `backend/apps/blog/views.py` (append admin views)
- Create: `backend/apps/blog/admin_urls.py`
- Modify: `backend/config/urls.py` (add the admin include)
- Test: `backend/apps/blog/tests/test_admin_api.py`

**Interfaces:**
- Consumes: `ai.availability/generate_post/generate_topics/record_*` (Task 4), `unique_slug` (Task 2), serializers (Task 5).
- Produces (paths relative to `/api/v1/admin/blog/`, all `IsCoachOrOwner`):
  - `posts/` CRUD (`BlogPostAdminSerializer`; PATCHing `status` manages `published_at`)
  - `ai/status/` → availability dict
  - `generate/` POST `{topic_id?|custom_topic?, instructions?}` → `{post, remaining}` or `{post: null, source: <reason>, remaining}`
  - `topics/` GET (available only) / POST (refill batch), `topics/<id>/dismiss/` POST
  - `autopilot/` GET/PATCH (PATCH recomputes `next_run_at`)

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/blog/tests/test_admin_api.py
"""Coach admin API: gating reasons, generation flow (AI mocked), publish
transitions, autopilot next_run computation. Auth as a coach/owner user —
copy the authenticated-client fixture from apps/tenant_config/tests/test_logo_ai_views.py."""

from decimal import Decimal
from unittest import mock

import pytest

from apps.blog import ai
from apps.blog.models import BlogAutopilot, BlogPost, BlogTopicIdea

pytestmark = pytest.mark.django_db

# fixture `coach_client` (authenticated APIClient) and `paid_tenant` /
# `free_tenant` — copy the exact pattern test_logo_ai_views.py uses.


def _draft_result():
    return ai.DraftResult(
        {"title": "T", "body_html": "<p>b</p>", "excerpt": "e", "meta_description": "m", "tags": ["t"], "ai_model": "x"},
        Decimal("0.03"),
    )


def test_generate_upgrade_required_for_free_tenant(coach_client, free_tenant):
    res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    assert res.status_code == 200
    assert res.data["post"] is None and res.data["source"] == "upgrade_required"


def test_generate_creates_draft_and_consumes_credit(coach_client, paid_tenant):
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()):
        res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "habits"}, format="json")
    assert res.status_code == 200
    post = BlogPost.objects.get(pk=res.data["post"]["id"])
    assert post.status == "draft" and post.source == "ai" and post.slug
    assert ai.tenant_usage(paid_tenant.schema_name).generations_used == 1


def test_generate_failure_records_cost_not_credit(coach_client, paid_tenant):
    with mock.patch.object(ai, "generate_post", side_effect=ai.BlogAiError("bad", cost_usd=Decimal("0.02"))):
        res = coach_client.post("/api/v1/admin/blog/generate/", {"custom_topic": "x"}, format="json")
    assert res.data["source"] == "error"
    usage = ai.tenant_usage(paid_tenant.schema_name)
    assert usage.usd_spent == Decimal("0.02") and usage.generations_used == 0


def test_generate_marks_topic_used(coach_client, paid_tenant):
    topic = BlogTopicIdea.objects.create(title="Sleep myths", angle="")
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()):
        coach_client.post("/api/v1/admin/blog/generate/", {"topic_id": topic.id}, format="json")
    topic.refresh_from_db()
    assert topic.status == "used"


def test_publish_transition_sets_published_at(coach_client, paid_tenant):
    post = BlogPost.objects.create(title="x", slug="x")
    res = coach_client.patch(f"/api/v1/admin/blog/posts/{post.id}/", {"status": "published"}, format="json")
    assert res.status_code == 200
    post.refresh_from_db()
    assert post.published_at is not None
    coach_client.patch(f"/api/v1/admin/blog/posts/{post.id}/", {"status": "draft"}, format="json")
    post.refresh_from_db()
    assert post.published_at is None


def test_autopilot_patch_computes_next_run(coach_client, paid_tenant):
    res = coach_client.patch(
        "/api/v1/admin/blog/autopilot/",
        {"is_enabled": True, "frequency": "weekly", "weekday": 0, "generate_time": "09:00"},
        format="json",
    )
    assert res.status_code == 200
    assert BlogAutopilot.load().next_run_at is not None


def test_topics_refill_uses_topic_batch(coach_client, paid_tenant):
    with mock.patch.object(ai, "generate_topics", return_value=([{"title": f"t{i}", "angle": ""} for i in range(12)], Decimal("0.004"))):
        res = coach_client.post("/api/v1/admin/blog/topics/", format="json")
    assert res.status_code == 200
    assert BlogTopicIdea.objects.filter(status="available").count() == 12
```

- [ ] **Step 2: Run to verify failure**

Run: `docker compose exec django pytest apps/blog/tests/test_admin_api.py -v` → FAIL (404s).

- [ ] **Step 3: Implement — append to `backend/apps/blog/views.py`**

```python
import logging
import uuid

from django.db import connection
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from . import ai
from .models import BlogAutopilot, BlogTopicIdea, unique_slug
from .serializers import BlogAutopilotSerializer, BlogPostAdminSerializer, BlogTopicIdeaSerializer

logger = logging.getLogger(__name__)


class BlogPostAdminViewSet(viewsets.ModelViewSet):
    permission_classes = [IsCoachOrOwner]
    serializer_class = BlogPostAdminSerializer

    def get_queryset(self):
        return BlogPost.objects.all().order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, slug=unique_slug(serializer.validated_data.get("title", "")))

    def perform_update(self, serializer):
        instance = serializer.instance
        new_status = serializer.validated_data.get("status", instance.status)
        published_at = instance.published_at
        if new_status == "published" and instance.status != "published":
            published_at = timezone.now()
        elif new_status == "draft":
            published_at = None
        serializer.save(published_at=published_at)


def _brief_for_current_tenant():
    from apps.courses.models import Course
    from apps.tenant_config.models import TenantConfig

    config = TenantConfig.objects.first()
    titles = list(Course.objects.values_list("title", flat=True)[:6])
    return ai.brand_brief(config, titles)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def blog_ai_status(request):
    return Response(ai.availability(connection.tenant))


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

    try:
        result = ai.generate_post(_brief_for_current_tenant(), topic, instructions)
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
    post = BlogPost.objects.create(
        slug=unique_slug(result.fields["title"]),
        status="draft",
        source="ai",
        created_by=request.user,
        **result.fields,
    )
    if topic_obj:
        BlogTopicIdea.objects.filter(pk=topic_obj.pk).update(status="used")
    return Response({"post": BlogPostAdminSerializer(post).data, "source": "ai", "remaining": status["remaining"] - 1})


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def blog_topics(request):
    """GET: the available queue. POST: refill (one cheap-model batch call —
    budget-metered, never quota-metered)."""
    tenant = connection.tenant
    if request.method == "GET":
        qs = BlogTopicIdea.objects.filter(status="available")
        return Response(BlogTopicIdeaSerializer(qs, many=True).data)
    status = ai.availability(tenant)
    if status["reason"] in ("upgrade_required", "disabled", "budget"):
        return Response({"topics": [], "source": status["reason"]})
    existing = list(BlogPost.objects.values_list("title", flat=True)[:20])
    try:
        topics, cost = ai.generate_topics(_brief_for_current_tenant(), existing)
    except ai.BlogAiError as exc:
        ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
        return Response({"topics": [], "source": "error"})
    ai.record_attempt_cost(tenant.schema_name, cost)
    batch = str(uuid.uuid4())
    rows = [BlogTopicIdea(title=t["title"], angle=t["angle"], batch_id=batch) for t in topics]
    BlogTopicIdea.objects.bulk_create(rows)
    qs = BlogTopicIdea.objects.filter(status="available")
    return Response({"topics": BlogTopicIdeaSerializer(qs, many=True).data, "source": "ai"})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def blog_topic_dismiss(request, topic_id):
    BlogTopicIdea.objects.filter(pk=topic_id, status="available").update(status="dismissed")
    return Response(status=204)


@api_view(["GET", "PATCH"])
@permission_classes([IsCoachOrOwner])
def blog_autopilot(request):
    rule = BlogAutopilot.load()
    if request.method == "GET":
        return Response(BlogAutopilotSerializer(rule).data)
    serializer = BlogAutopilotSerializer(rule, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    rule = serializer.save()
    if rule.is_enabled:
        from datetime import date

        from apps.notifications.recurrence import next_occurrence
        from apps.tenant_config.models import TenantConfig

        cfg = TenantConfig.objects.first()
        rule.next_run_at = next_occurrence(
            frequency=rule.frequency,
            send_time=rule.generate_time,
            weekday=rule.weekday,
            day_of_month=rule.day_of_month,
            after_utc=timezone.now(),
            tz_name=(cfg.timezone if cfg else "UTC"),
            start_date=date.today(),
        )
    else:
        rule.next_run_at = None
    rule.save(update_fields=["next_run_at"])
    return Response(BlogAutopilotSerializer(rule).data)
```

(`generate_time` arrives as a string; DRF's TimeField on the serializer handles parsing. If `date.today()` trips a lint rule about naive dates, use `timezone.localdate()`.)

```python
# backend/apps/blog/admin_urls.py
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BlogPostAdminViewSet,
    blog_ai_status,
    blog_autopilot,
    blog_generate,
    blog_topic_dismiss,
    blog_topics,
)

router = DefaultRouter()
router.register("posts", BlogPostAdminViewSet, basename="blog-admin-posts")

urlpatterns = [
    path("ai/status/", blog_ai_status, name="blog-ai-status"),
    path("generate/", blog_generate, name="blog-generate"),
    path("topics/", blog_topics, name="blog-topics"),
    path("topics/<int:topic_id>/dismiss/", blog_topic_dismiss, name="blog-topic-dismiss"),
    path("autopilot/", blog_autopilot, name="blog-autopilot"),
    path("", include(router.urls)),
]
```

Add `path("api/v1/admin/blog/", include("apps.blog.admin_urls")),` to `config/urls.py` (next to the other `/api/v1/admin/` includes).

- [ ] **Step 4: Run tests + full suite + commit**

Run: `docker compose exec django pytest apps/blog/tests/ -v` → PASS, then `make test` → PASS.

```bash
git add backend/apps/blog/ backend/config/urls.py
git commit -m "feat(blog): coach admin API — CRUD, gated generate, topic queue, autopilot"
```

---

### Task 7: Autopilot Celery dispatch + coach notification

**Files:**
- Create: `backend/apps/blog/tasks.py`
- Modify: `backend/config/celery.py` (beat entry)
- Test: `backend/apps/blog/tests/test_autopilot.py`

**Interfaces:**
- Consumes: `BlogAutopilot`, `BlogTopicIdea`, `BlogPost`, `unique_slug` (Task 2); `ai.*` (Task 4); `next_occurrence` (existing); `send_to_subscriptions` + `announcement_payload` (existing notifications app).
- Produces: beat task `dispatch_due_blog_autopilot` (every 15 min) → `generate_autopilot_post.delay(schema_name)`.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/blog/tests/test_autopilot.py
"""Exactly-once claim, draft-vs-publish, out-of-credit skip notice (once per
month), empty-queue refill. Mirrors test_recurring_dispatch.py structure —
call the per-tenant functions directly inside the tenant schema; mock ai.*
and the push service."""

from datetime import timedelta
from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone

from apps.blog import ai, tasks
from apps.blog.models import BlogAutopilot, BlogPost, BlogTopicIdea

pytestmark = pytest.mark.django_db


def _due_rule(**kw):
    rule = BlogAutopilot.load()
    rule.is_enabled = True
    rule.frequency = "weekly"
    rule.weekday = 0
    rule.next_run_at = timezone.now() - timedelta(minutes=5)
    for k, v in kw.items():
        setattr(rule, k, v)
    rule.save()
    return rule


def _draft_result():
    return ai.DraftResult(
        {"title": "T", "body_html": "<p>b</p>", "excerpt": "e", "meta_description": "m", "tags": [], "ai_model": "x"},
        Decimal("0.03"),
    )


def test_claim_advances_next_run_exactly_once(paid_tenant):
    rule = _due_rule()
    old = rule.next_run_at
    with mock.patch.object(tasks.generate_autopilot_post, "delay") as spawn:
        tasks._dispatch_for_current_tenant(paid_tenant.schema_name)
        tasks._dispatch_for_current_tenant(paid_tenant.schema_name)  # second run: not due anymore
    rule.refresh_from_db()
    assert rule.next_run_at > old
    assert spawn.call_count == 1


def test_generate_creates_draft_and_notifies(paid_tenant):
    _due_rule(auto_publish=False)
    BlogTopicIdea.objects.create(title="Sleep myths", angle="")
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()), mock.patch.object(tasks, "_notify_coach") as notify:
        tasks._generate_for_current_tenant(paid_tenant)
    post = BlogPost.objects.get()
    assert post.status == "draft" and post.source == "autopilot" and post.created_by is None
    assert BlogTopicIdea.objects.get().status == "used"
    notify.assert_called_once()


def test_generate_auto_publish(paid_tenant):
    _due_rule(auto_publish=True)
    BlogTopicIdea.objects.create(title="x", angle="")
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()), mock.patch.object(tasks, "_notify_coach"):
        tasks._generate_for_current_tenant(paid_tenant)
    post = BlogPost.objects.get()
    assert post.status == "published" and post.published_at is not None


def test_out_of_credits_notifies_once_per_month(paid_tenant):
    rule = _due_rule()
    with mock.patch.object(ai, "availability", return_value={"reason": "quota_exhausted", "remaining": 0, "limit": 5, "enabled": True, "eligible": True}), mock.patch.object(tasks, "_notify_coach") as notify:
        tasks._generate_for_current_tenant(paid_tenant)
        tasks._generate_for_current_tenant(paid_tenant)
    assert notify.call_count == 1
    rule.refresh_from_db()
    assert rule.last_skip_notice_month == ai.current_month()
    assert BlogPost.objects.count() == 0


def test_empty_queue_triggers_refill(paid_tenant):
    _due_rule()
    with mock.patch.object(ai, "generate_post", return_value=_draft_result()), mock.patch.object(
        ai, "generate_topics", return_value=([{"title": "fresh", "angle": ""}], Decimal("0.004"))
    ) as refill, mock.patch.object(tasks, "_notify_coach"):
        tasks._generate_for_current_tenant(paid_tenant)
    refill.assert_called_once()
    assert BlogPost.objects.get().title == "T"
```

- [ ] **Step 2: Run to verify failure** — `docker compose exec django pytest apps/blog/tests/test_autopilot.py -v` → FAIL (no `tasks` module).

- [ ] **Step 3: Implement**

```python
# backend/apps/blog/tasks.py
"""Autopilot: Celery beat sweeps tenants every 15 min; due rules atomically
claim (advance next_run_at) then spawn a per-tenant generation task — the
exact pattern of notifications.dispatch_due_recurrences."""

import logging
from datetime import date

from celery import shared_task
from django.utils import timezone
from django_tenants.utils import get_tenant_model, tenant_context

logger = logging.getLogger(__name__)


@shared_task
def dispatch_due_blog_autopilot():
    for tenant in get_tenant_model().objects.exclude(schema_name="public"):
        with tenant_context(tenant):
            try:
                _dispatch_for_current_tenant(tenant.schema_name)
            except Exception:  # noqa: BLE001  one tenant must not break the rest
                logger.exception("blog autopilot dispatch failed for %s", tenant.schema_name)


def _dispatch_for_current_tenant(schema_name):
    from apps.notifications.recurrence import next_occurrence
    from apps.tenant_config.models import TenantConfig

    from .models import BlogAutopilot

    now = timezone.now()
    rule = BlogAutopilot.objects.filter(pk=1, is_enabled=True, next_run_at__lte=now).first()
    if rule is None:
        return
    cfg = TenantConfig.objects.first()
    new_next = next_occurrence(
        frequency=rule.frequency,
        send_time=rule.generate_time,
        weekday=rule.weekday,
        day_of_month=rule.day_of_month,
        after_utc=now,
        tz_name=(cfg.timezone if cfg else "UTC"),
        start_date=date.today(),
    )
    # Exactly-once claim: only the worker that advances next_run_at spawns.
    claimed = BlogAutopilot.objects.filter(pk=rule.pk, next_run_at=rule.next_run_at).update(next_run_at=new_next)
    if claimed:
        generate_autopilot_post.delay(schema_name)


@shared_task
def generate_autopilot_post(schema_name):
    tenant_model = get_tenant_model()
    try:
        tenant = tenant_model.objects.get(schema_name=schema_name)
    except tenant_model.DoesNotExist:
        return
    with tenant_context(tenant):
        try:
            _generate_for_current_tenant(tenant)
        except Exception:  # noqa: BLE001
            logger.exception("blog autopilot generation failed for %s", schema_name)


def _notify_coach(title, body_html):
    """Web-push to the coach/owner's own devices (never students)."""
    from apps.notifications.models import PushSubscription
    from apps.notifications.payloads import announcement_payload
    from apps.notifications.services import send_to_subscriptions

    subs = PushSubscription.objects.filter(user__role__in=("coach", "owner"))
    send_to_subscriptions(subs, announcement_payload(title, body_html, url="/admin/blog"))


def _generate_for_current_tenant(tenant):
    from . import ai
    from .models import BlogAutopilot, BlogPost, BlogTopicIdea, unique_slug
    from .views import _brief_for_current_tenant

    rule = BlogAutopilot.load()
    status = ai.availability(tenant)
    if status["reason"]:
        month = ai.current_month()
        if status["reason"] == "quota_exhausted" and rule.last_skip_notice_month != month:
            BlogAutopilot.objects.filter(pk=rule.pk).update(last_skip_notice_month=month)
            _notify_coach(
                "Blog autopilot paused",
                "<p>You've used all your AI blog posts for this month — autopilot will resume next month.</p>",
            )
        return

    topic = BlogTopicIdea.objects.filter(status="available").first()
    if topic is None:
        existing = list(BlogPost.objects.values_list("title", flat=True)[:20])
        try:
            topics, cost = ai.generate_topics(_brief_for_current_tenant(), existing)
        except ai.BlogAiError as exc:
            ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
            return
        ai.record_attempt_cost(tenant.schema_name, cost)
        BlogTopicIdea.objects.bulk_create([BlogTopicIdea(title=t["title"], angle=t["angle"]) for t in topics])
        topic = BlogTopicIdea.objects.filter(status="available").first()
        if topic is None:
            return

    try:
        result = ai.generate_post(_brief_for_current_tenant(), topic.title, topic.angle)
    except ai.BlogAiError as exc:
        ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
        return
    except Exception:
        ai.record_attempt_cost(tenant.schema_name, 0)
        logger.exception("blog autopilot: AI call failed")
        return

    ai.record_attempt_cost(tenant.schema_name, result.cost_usd)
    ai.record_success(tenant.schema_name)
    publish = rule.auto_publish
    post = BlogPost.objects.create(
        slug=unique_slug(result.fields["title"]),
        status="published" if publish else "draft",
        published_at=timezone.now() if publish else None,
        source="autopilot",
        **result.fields,
    )
    BlogTopicIdea.objects.filter(pk=topic.pk).update(status="used")
    if publish:
        _notify_coach("New blog post published", f"<p>Autopilot published “{post.title}” on your site.</p>")
    else:
        _notify_coach("Your new blog post is ready", f"<p>“{post.title}” is waiting for your review.</p>")
```

`backend/config/celery.py` — add to the beat schedule dict (copy the exact structure of the existing entries):

```python
    "dispatch-due-blog-autopilot": {
        "task": "apps.blog.tasks.dispatch_due_blog_autopilot",
        "schedule": 900.0,  # 15 min — blog cadence is daily-at-best
    },
```

- [ ] **Step 4: Run tests + commit**

Run: `docker compose exec django pytest apps/blog/tests/ -v && make test` → PASS.

```bash
git add backend/apps/blog/tasks.py backend/apps/blog/tests/test_autopilot.py backend/config/celery.py
git commit -m "feat(blog): autopilot beat dispatch, generation task, coach push notices"
```

---

## Phase 3 — Coach frontend (frontend-customer)

### Task 8: API client + admin blog list page + nav

**Files:**
- Create: `frontend-customer/src/lib/blog-api.ts`
- Create: `frontend-customer/src/app/admin/blog/page.tsx`
- Modify: `frontend-customer/src/components/admin/admin-shell.tsx` (nav item in the Content group, near Pages)
- Modify: `frontend-customer/messages/en/admin.json` + `frontend-customer/messages/tr/admin.json`

**Interfaces:**
- Produces: `blog-api.ts` exports used by Tasks 8-9: `BlogPostAdmin`, `BlogAiStatus`, `TopicIdea`, `AutopilotSettings` types; `listPosts, getPost, createPost, updatePost, deletePost, fetchAiStatus, generatePost, listTopics, refillTopics, dismissTopic, getAutopilot, updateAutopilot`.

- [ ] **Step 1: Write the API client**

```typescript
// frontend-customer/src/lib/blog-api.ts
// Thin client for the coach blog endpoints (backend/apps/blog). Mirrors
// brand-pack-api.ts conventions.
import { clientFetch } from "@/lib/api-client";

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
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BlogAiStatus {
  enabled: boolean;
  eligible: boolean;
  remaining: number;
  limit: number;
  reason: "upgrade_required" | "quota_exhausted" | "disabled" | "budget" | null;
}

export interface TopicIdea {
  id: number;
  title: string;
  angle: string;
}

export interface AutopilotSettings {
  is_enabled: boolean;
  frequency: "weekly" | "monthly";
  generate_time: string;
  weekday: number | null;
  day_of_month: number | null;
  auto_publish: boolean;
  next_run_at: string | null;
}

export interface GenerateResponse {
  post: BlogPostAdmin | null;
  source: "ai" | "upgrade_required" | "quota_exhausted" | "disabled" | "budget" | "error";
  remaining: number;
}

const BASE = "/api/v1/admin/blog";

export const listPosts = () =>
  clientFetch<{ results: BlogPostAdmin[] }>(`${BASE}/posts/`);
export const getPost = (id: number) =>
  clientFetch<BlogPostAdmin>(`${BASE}/posts/${id}/`);
export const createPost = (body: Partial<BlogPostAdmin>) =>
  clientFetch<BlogPostAdmin>(`${BASE}/posts/`, { method: "POST", body: JSON.stringify(body) });
export const updatePost = (id: number, body: Partial<BlogPostAdmin>) =>
  clientFetch<BlogPostAdmin>(`${BASE}/posts/${id}/`, { method: "PATCH", body: JSON.stringify(body) });
export const deletePost = (id: number) =>
  clientFetch<void>(`${BASE}/posts/${id}/`, { method: "DELETE" });
export const fetchAiStatus = () => clientFetch<BlogAiStatus>(`${BASE}/ai/status/`);
export const generatePost = (body: { topic_id?: number; custom_topic?: string; instructions?: string }) =>
  clientFetch<GenerateResponse>(`${BASE}/generate/`, { method: "POST", body: JSON.stringify(body) });
export const listTopics = () => clientFetch<TopicIdea[]>(`${BASE}/topics/`);
export const refillTopics = () =>
  clientFetch<{ topics: TopicIdea[]; source: string }>(`${BASE}/topics/`, { method: "POST" });
export const dismissTopic = (id: number) =>
  clientFetch<void>(`${BASE}/topics/${id}/dismiss/`, { method: "POST" });
export const getAutopilot = () => clientFetch<AutopilotSettings>(`${BASE}/autopilot/`);
export const updateAutopilot = (body: Partial<AutopilotSettings>) =>
  clientFetch<AutopilotSettings>(`${BASE}/autopilot/`, { method: "PATCH", body: JSON.stringify(body) });
```

NOTE: if the DELETE/dismiss endpoints return 204 with no body, check how `clientFetch` handles empty bodies (known Cloudflare/204 gotcha in this codebase — `contentor-empty-response-204-gotcha`). If `clientFetch` still does unconditional `res.json()`, return `Response`-level handling the way other DELETE callers in the codebase do it (`grep -rn 'method: "DELETE"' frontend-customer/src/lib/`).

- [ ] **Step 2: Build the list page**

`frontend-customer/src/app/admin/blog/page.tsx` — "use client" page composed of existing primitives (`Card`, `Button`, `Badge`, `EmptyState`, `Skeleton`, `toast` from sonner — copy the import set from `src/app/(public)/store/page.tsx` / neighboring admin pages). Structure:

- Header row: title `t("blog.title")` + two buttons: "New post" (creates `createPost({title: t("blog.untitled")})` then routes to `/admin/blog/{id}`) and "Write with AI" (opens the Task 9 dialog; render the button disabled with an upgrade tooltip when `status.reason === "upgrade_required"`).
- Credits meter: when `eligible`, a small line `t("blog.creditsLeft", {remaining, limit})` ("{remaining} of {limit} AI posts left this month").
- Posts list: rows with title, status `Badge` (draft/published), source badge when `source !== "manual"` (`t("blog.aiBadge")`), relative date; row click → `/admin/blog/{id}`; overflow menu with Delete (confirm dialog — destructive-action confirm per house rules).
- Autopilot card (Task 9 fills in the form; this task renders the card shell with enable state from `getAutopilot()`).
- Upsell state: when `reason === "upgrade_required"`, an upgrade card matching the Brand Pack upsell (see `studio-wall.tsx:148` for copy/pattern), linking to `/admin/billing`.
- Empty state: `EmptyState` with `t("blog.empty")`.

- [ ] **Step 3: Nav + i18n**

In `admin-shell.tsx`, add to the same group as Pages (`href: "/admin/pages"`):

```tsx
        { label: t("nav.items.blog"), href: "/admin/blog", icon: Newspaper },
```

(`import { Newspaper } from "lucide-react"` alongside the existing icon imports.)

Add to `messages/en/admin.json` (and Turkish equivalents in `tr/admin.json`):

```json
"nav": { "items": { "blog": "Blog" } },
"blog": {
  "title": "Blog",
  "untitled": "Untitled post",
  "empty": "No posts yet. Write one yourself or let AI draft it for you.",
  "newPost": "New post",
  "writeWithAi": "Write with AI",
  "creditsLeft": "{remaining} of {limit} AI posts left this month",
  "aiBadge": "AI",
  "draft": "Draft",
  "published": "Published",
  "deleteConfirm": "Delete this post? This cannot be undone.",
  "upgradeTitle": "AI blog writing is a paid feature",
  "upgradeBody": "Upgrade to Starter (5 AI posts/month) or Pro (30 AI posts/month) and let Contentor write for you."
}
```

(Merge into the existing JSON structure — don't clobber sibling keys. TR translations: "Blog", "Başlıksız yazı", "Henüz yazı yok…", "Yeni yazı", "AI ile yaz", "Bu ay {remaining}/{limit} AI yazısı kaldı", etc.)

- [ ] **Step 4: Verify + commit**

Run: `cd frontend-customer && npx tsc --noEmit` → clean. Then in the browser (`make dev`): `/admin/blog` renders, nav item shows, New post creates and routes.

```bash
git add frontend-customer/src/lib/blog-api.ts frontend-customer/src/app/admin/blog/ frontend-customer/src/components/admin/admin-shell.tsx frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "feat(blog): coach admin blog list page, nav, API client"
```

---

### Task 9: Post editor + AI generate dialog + autopilot form

**Files:**
- Create: `frontend-customer/src/app/admin/blog/[id]/page.tsx`
- Create: `frontend-customer/src/components/admin/blog/post-editor.tsx`
- Create: `frontend-customer/src/components/admin/blog/generate-dialog.tsx`
- Create: `frontend-customer/src/components/admin/blog/autopilot-card.tsx`
- Modify: `frontend-customer/messages/en/admin.json` + `tr/admin.json` (editor/dialog/autopilot keys)

**Interfaces:**
- Consumes: everything from `blog-api.ts` (Task 8); TipTap setup copied from `src/components/admin/mailbox/message-editor.tsx`.

- [ ] **Step 1: TipTap body editor**

`post-editor.tsx`: copy the `useEditor` configuration from `message-editor.tsx` (StarterKit, Link, Placeholder, Underline — same versions already installed) with one change: `StarterKit.configure({ heading: { levels: [2, 3] } })` so coaches can use the same headings the AI emits. Props: `{ value: string; onChange: (html: string) => void }`; set `content: value` once and `onUpdate: ({ editor }) => onChange(editor.getHTML())`. Add a minimal toolbar (bold, italic, H2, H3, bullet list, link) using the same button idiom `message-editor.tsx` uses.

- [ ] **Step 2: Editor page**

`[id]/page.tsx` ("use client"): loads `getPost(id)`, renders

- Title input (large, borderless — house style), excerpt textarea (2 rows), tags input (comma-separated chips), meta description textarea with live character count (warn > 155).
- "Advanced" collapsible (Radix Collapsible) containing the slug input — non-technical coaches never see raw slugs by default.
- `PostEditor` for `body_html`.
- Footer bar: Save (PATCH via `updatePost`, toast on success), Publish/Unpublish toggle button (PATCH `{status}`), and for `source !== "manual"` a Regenerate button that calls `generatePost({custom_topic: post.title})` after a confirm dialog `t("blog.regenerateConfirm")` ("Regenerate this post from scratch? This uses 1 AI credit and replaces the current text.") — on success, replace local state with the fresh draft fields and PATCH them onto THIS post (don't create a second post: send the regenerated `title/body_html/excerpt/meta_description/tags` through `updatePost`, then `deletePost` the temporary post the generate endpoint created).
- View-on-site link (`/blog/{slug}`, target _blank) when published.

- [ ] **Step 3: Generate dialog**

`generate-dialog.tsx` (opened from the list page's "Write with AI"): on open, `listTopics()`; if empty, call `refillTopics()` and show skeleton chips meanwhile. Render:

- Topic suggestion chips (title + small angle text; an “x” on each chip calls `dismissTopic`); selecting a chip highlights it.
- "Or your own topic" input + optional instructions textarea (`t("blog.instructionsPlaceholder")`: "Anything specific you want it to cover?").
- Generate button → `generatePost({topic_id | custom_topic, instructions})`, full-dialog spinner with `t("blog.generating")` ("Writing your post — this takes about half a minute…"). On `source === "ai"` route to `/admin/blog/{post.id}`. On quota/budget/error sources show the mapped toast copy (`blog.errQuota`, `blog.errBudget`, `blog.errGeneric`).

- [ ] **Step 4: Autopilot card**

`autopilot-card.tsx` (rendered on the list page): switch for `is_enabled`; when on, show frequency select (weekly/monthly), weekday picker (7 labeled buttons) or day-of-month select (1-28) depending on frequency, time input, and the publish-mode radio: `t("blog.autopilotReview")` ("Save as draft and notify me — recommended") vs `t("blog.autopilotPublish")` ("Publish automatically"). Every change PATCHes via `updateAutopilot` (optimistic, toast on error) and re-renders `next_run_at` as `t("blog.nextRun", {date})`. When AI is not eligible, the card body is the upsell instead of the form.

- [ ] **Step 5: i18n keys**

Add to both locales under `"blog"`: `editorSave`, `editorPublish`, `editorUnpublish`, `editorAdvanced`, `editorSlug`, `editorTags`, `editorExcerpt`, `editorMeta`, `viewOnSite`, `regenerate`, `regenerateConfirm`, `generateTitle`, `topicYourOwn`, `instructionsPlaceholder`, `generating`, `errQuota` ("You're out of AI posts for this month."), `errBudget` ("AI writing is temporarily unavailable."), `errGeneric` ("Something went wrong — your credit was not used."), `autopilotTitle` ("Autopilot"), `autopilotHint` ("Contentor picks a topic and writes for you on a schedule."), `autopilotReview`, `autopilotPublish`, `nextRun` ("Next post: {date}"), `frequencyWeekly`, `frequencyMonthly`.

- [ ] **Step 6: Verify + commit**

`npx tsc --noEmit` clean; browser: create → AI generate (with `BLOG_AI_PROVIDER=cli` + `CLAUDE_CODE_OAUTH_TOKEN` in `.env`, restart django container) → draft opens in editor → edit → publish → unpublish. Toggle autopilot on, confirm `next_run_at` renders.

```bash
git add frontend-customer/src/app/admin/blog/ frontend-customer/src/components/admin/blog/ frontend-customer/messages/en/admin.json frontend-customer/messages/tr/admin.json
git commit -m "feat(blog): post editor (TipTap), AI generate dialog, autopilot settings"
```

---

### Task 10: Public blog pages on coach sites (SEO)

**Files:**
- Create: `frontend-customer/src/lib/blog-public.ts`
- Create: `frontend-customer/src/app/(public)/blog/page.tsx`
- Create: `frontend-customer/src/app/(public)/blog/[slug]/page.tsx`
- Modify: the public navbar component (locate via `grep -rn 'href="/store"' frontend-customer/src/components/` — add a Blog link with the same styling/mechanism)

**Interfaces:**
- Consumes: public API (Task 5); `getTenantSlug` + the fetch mechanics of `fetchTenantConfig` in `src/lib/tenant.ts`.

- [ ] **Step 1: Server-side fetch helper**

`blog-public.ts`: open `src/lib/tenant.ts:22-50` and reuse `fetchTenantConfig`'s exact base URL + `X-Tenant-Domain` header construction (Node fetch drops custom Host — the header is mandatory). Export:

```typescript
export async function fetchPublishedPosts(slug: string): Promise<BlogPostPublic[]>;   // GET /api/v1/blog/posts/  -> data.results
export async function fetchPublishedPost(slug: string, postSlug: string): Promise<BlogPostPublic | null>; // 404 -> null
```

with `BlogPostPublic = { slug, title, excerpt, meta_description?, tags, body_html?, published_at }`. Both `cache: "no-store"` (match `fetchTenantConfig`).

- [ ] **Step 2: Listing page**

`(public)/blog/page.tsx` — server component, `export const dynamic = "force-dynamic"` (same as `(public)/page.tsx`):

```tsx
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { fetchPublishedPosts } from "@/lib/blog-public";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const slug = await getTenantSlug();
  const config = await fetchTenantConfig(slug);
  return {
    title: `Blog — ${config?.brand_name ?? ""}`,
    description: config?.meta_description ?? "",
  };
}

export default async function BlogIndexPage() {
  const slug = await getTenantSlug();
  const posts = await fetchPublishedPosts(slug);
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Blog</h1>
      {posts.length === 0 && <p className="text-muted-foreground">No posts yet.</p>}
      <ul className="space-y-8">
        {posts.map((p) => (
          <li key={p.slug}>
            <Link href={`/blog/${p.slug}`} className="group block">
              <h2 className="text-xl font-semibold group-hover:underline">{p.title}</h2>
              <p className="text-muted-foreground mt-1">{p.excerpt}</p>
              <time className="text-sm text-muted-foreground" dateTime={p.published_at}>
                {new Date(p.published_at).toLocaleDateString()}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

(Match surrounding public pages' container classes — check `(public)/faq/page.tsx` and reuse its wrapper for visual consistency with the tenant theme.)

- [ ] **Step 3: Post page with per-post metadata + JSON-LD**

`(public)/blog/[slug]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { fetchTenantConfig, getTenantSlug } from "@/lib/tenant";
import { fetchPublishedPost } from "@/lib/blog-public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const tenant = await getTenantSlug();
  const post = await fetchPublishedPost(tenant, params.slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.meta_description || post.excerpt,
    openGraph: { title: post.title, description: post.meta_description || post.excerpt, type: "article" },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const tenant = await getTenantSlug();
  const [post, config] = await Promise.all([
    fetchPublishedPost(tenant, params.slug),
    fetchTenantConfig(tenant),
  ]);
  if (!post) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.meta_description || post.excerpt,
    datePublished: post.published_at,
    author: { "@type": "Organization", name: config?.brand_name ?? "" },
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-3xl font-bold">{post.title}</h1>
      <time className="text-sm text-muted-foreground block mt-2" dateTime={post.published_at}>
        {new Date(post.published_at).toLocaleDateString()}
      </time>
      <article
        className="prose prose-neutral dark:prose-invert mt-8 max-w-none"
        dangerouslySetInnerHTML={{ __html: post.body_html }}
      />
    </main>
  );
}
```

`body_html` is server-sanitized (nh3) before it ever reaches the DB — that is the trust boundary for this `dangerouslySetInnerHTML`. If the `prose` classes don't exist (no @tailwindcss/typography plugin), check how `rich-text-block.tsx` styles coach-authored HTML and reuse that instead of adding the plugin.

- [ ] **Step 4: Navbar link**

Find the public navbar (`grep -rn 'href="/store"\|"/courses"' frontend-customer/src/components/ | grep -iv admin | head`). Follow its exact mechanism: if links are hardcoded, add Blog unconditionally after Courses; if they're driven by `navbar_config`/enabled modules, register "blog" the same way those are registered (including the coach-facing toggle if one exists for store/events). Keep the label i18n'd if neighbors are.

- [ ] **Step 5: Verify + commit**

`npx tsc --noEmit` clean. Browser on a seeded tenant subdomain: publish a post in `/admin/blog`, open `/blog` and `/blog/<slug>`; view-source shows `<title>` = post title and the BlogPosting JSON-LD.

```bash
git add frontend-customer/src/lib/blog-public.ts "frontend-customer/src/app/(public)/blog/" frontend-customer/src/components/
git commit -m "feat(blog): public coach-site blog with per-post SEO metadata + JSON-LD"
```

---

## Phase 4 — Platform blog (contentor.app)

### Task 11: PlatformBlogPost + platform API + adminkit registration

**Files:**
- Modify: `backend/apps/core/models.py` (add `PlatformBlogPost`)
- Create: `backend/apps/blog/platform_views.py`, `backend/apps/blog/urls_platform.py`
- Modify: `backend/config/urls.py` (mount BEFORE the broader `/api/v1/platform/` include, like `platform_email`)
- Modify: `backend/apps/core/admin_panels.py` (register for the superadmin SPA)
- Test: `backend/apps/blog/tests/test_platform_api.py`

**Interfaces:**
- Consumes: `ai.generate_post/record_attempt_cost/record_success/global_spend` (Task 4 — records under `tenant_schema="public"`, quota check skipped), `IsSuperUser` from `apps.core.permissions`.
- Produces: public `GET /api/v1/platform/blog/posts/` + `.../posts/<slug>/` (published only), superadmin `POST /api/v1/platform/blog/generate/` `{topic, instructions?}` → `{post, source}`; `PlatformBlogPost` CRUD in the superadmin SPA via adminkit.

- [ ] **Step 1: Write the failing tests**

```python
# backend/apps/blog/tests/test_platform_api.py
"""Platform blog: public read, superadmin-only generate, USD-only metering
(runs in the PUBLIC schema — no tenant fixture)."""

from decimal import Decimal
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.blog import ai
from apps.core.models import BlogAiUsage, PlatformBlogPost

pytestmark = pytest.mark.django_db


def test_public_list_and_detail():
    PlatformBlogPost.objects.create(title="P", slug="p", status="published", published_at=timezone.now(), body_html="<p>x</p>")
    PlatformBlogPost.objects.create(title="D", slug="d", status="draft")
    client = APIClient()
    assert [x["slug"] for x in client.get("/api/v1/platform/blog/posts/").data["results"]] == ["p"]
    assert client.get("/api/v1/platform/blog/posts/d/").status_code == 404


def test_generate_requires_superuser():
    res = APIClient().post("/api/v1/platform/blog/generate/", {"topic": "x"}, format="json")
    assert res.status_code in (401, 403)


def test_generate_records_public_usage_no_quota(superadmin_client):
    result = ai.DraftResult(
        {"title": "T", "body_html": "<p>b</p>", "excerpt": "e", "meta_description": "m", "tags": [], "ai_model": "x"},
        Decimal("0.03"),
    )
    with mock.patch.object(ai, "generate_post", return_value=result):
        res = superadmin_client.post("/api/v1/platform/blog/generate/", {"topic": "why coaches need a website"}, format="json")
    assert res.status_code == 200 and res.data["post"]["slug"]
    row = BlogAiUsage.objects.get(tenant_schema="public")
    assert row.usd_spent == Decimal("0.03")
```

(`superadmin_client`: copy the superuser-authenticated client fixture from an existing platform-admin test — `grep -rn "is_superuser" backend/apps/*/tests/ | head`.)

- [ ] **Step 2: Run to verify failure**, then implement.

`PlatformBlogPost` in `apps/core/models.py` — same content fields as `BlogPost` (title/slug/body_html/excerpt/meta_description/tags/status/source/ai_model/created_by/published_at/timestamps, `app_label = "core"`, plus `unique=True` slug). Slug helper: a module-level `platform_unique_slug(title)` in `platform_views.py` using the same algorithm as `apps/blog/models.unique_slug` but querying `PlatformBlogPost` (three lines — don't over-abstract).

Append to `backend/apps/blog/serializers.py`:

```python
class PlatformBlogPostSerializer(serializers.ModelSerializer):
    class Meta:
        from apps.core.models import PlatformBlogPost as _Model

        model = _Model
        fields = (
            "id", "slug", "title", "excerpt", "meta_description", "tags",
            "body_html", "status", "source", "published_at",
        )
        read_only_fields = ("id", "source", "published_at")
```

(If the inline `Meta` import trips ruff, hoist it to a module-level `from apps.core.models import PlatformBlogPost` — core is a shared app, so the import is always safe.)

```python
# backend/apps/blog/platform_views.py
"""contentor.app platform blog: public read + superadmin generation.
Models live in apps.core (public schema); the AI engine is shared with the
coach blog. Generations meter USD under tenant_schema='public' — no quota."""

import logging

from django.conf import settings
from django.utils.text import slugify
from rest_framework import generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.models import PlatformBlogPost
from apps.core.permissions import IsSuperUser

from . import ai
from .serializers import PlatformBlogPostSerializer
from .views import _PublicPagination

logger = logging.getLogger(__name__)

# The platform's own static brief — the one place tenant data never applies.
PLATFORM_BRIEF = """<brand_brief>
Brand: Contentor
About: Contentor is an all-in-one platform where coaches and creators sell
courses, digital downloads, live sessions and community on their own website —
without technical skills. Audience: coaches, course creators, online educators
deciding how to build and grow their online coaching business.
</brand_brief>"""


def platform_unique_slug(title):
    base = slugify(title)[:60].strip("-") or "post"
    slug, n = base, 1
    while PlatformBlogPost.objects.filter(slug=slug).exists():
        n += 1
        slug = f"{base[: 60 - len(str(n)) - 1]}-{n}"
    return slug


class PlatformPostList(generics.ListAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = PlatformBlogPostSerializer
    pagination_class = _PublicPagination

    def get_queryset(self):
        return PlatformBlogPost.objects.filter(status="published").order_by("-published_at")


class PlatformPostDetail(generics.RetrieveAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    serializer_class = PlatformBlogPostSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return PlatformBlogPost.objects.filter(status="published")


@api_view(["POST"])
@permission_classes([IsSuperUser])
def platform_blog_generate(request):
    from decimal import Decimal

    data = request.data if isinstance(request.data, dict) else {}
    topic = str(data.get("topic") or "")[:200]
    if not topic:
        return Response({"post": None, "source": "error"}, status=400)
    if ai.global_spend() >= Decimal(str(settings.BLOG_AI_MONTHLY_BUDGET_USD)):
        return Response({"post": None, "source": "budget"})
    try:
        result = ai.generate_post(PLATFORM_BRIEF, topic, str(data.get("instructions") or "")[:500])
    except ai.BlogAiError as exc:
        ai.record_attempt_cost("public", exc.cost_usd)
        logger.exception("platform blog generate failed")
        return Response({"post": None, "source": "error"})
    ai.record_attempt_cost("public", result.cost_usd)
    post = PlatformBlogPost.objects.create(
        slug=platform_unique_slug(result.fields["title"]),
        status="draft",
        source="ai",
        created_by=request.user,
        **result.fields,
    )
    return Response({"post": PlatformBlogPostSerializer(post).data, "source": "ai"})
```

`urls_platform.py`: `posts/`, `posts/<slug:slug>/`, `generate/`. Mount in `config/urls.py` directly above the `api/v1/platform/` include:

```python
    path("api/v1/platform/blog/", include("apps.blog.urls_platform")),
```

Adminkit — in `backend/apps/core/admin_panels.py`:

```python
@platform_site.register(PlatformBlogPost)
class PlatformBlogPostAdmin(ModelAdmin):
    icon = "newspaper"
    description = "Contentor.app marketing blog posts (public SEO). Generate drafts from Admin → Blog."
    list_display = ("title", "slug", "status", "source", "published_at")
    search_fields = ("title", "slug")
    list_filters = ("status", "source")
    ordering = ("-created_at",)
    fields = ("title", "slug", "excerpt", "meta_description", "tags", "body_html", "status", "published_at")
```

(Copy the import/`ModelAdmin` idiom already in that file.)

- [ ] **Step 3: Migration + tests + commit**

Run: `make makemigrations && make test-fresh` → PASS.

```bash
git add backend/apps/core/ backend/apps/blog/ backend/config/urls.py
git commit -m "feat(blog): platform blog — public API, superadmin generate, adminkit CRUD"
```

---

### Task 12: contentor.app public /blog + sitemap

**Files:**
- Create: `frontend-main/src/app/blog/page.tsx`, `frontend-main/src/app/blog/[slug]/page.tsx`
- Create: `frontend-main/src/lib/platform-blog.ts`
- Create: `frontend-main/src/app/sitemap.ts`

**Interfaces:**
- Consumes: `GET /api/v1/platform/blog/posts/` (+detail) from Task 11.

- [ ] **Step 1:** `platform-blog.ts` — server fetch helper. Find how frontend-main server components reach Django (`grep -rn "process.env" frontend-main/src/lib/*.ts | grep -i "api\|django" | head`) and reuse that base URL. No tenant header needed — the internal `django` Host resolves to the public tenant, which is exactly right here. Export `fetchPlatformPosts()` and `fetchPlatformPost(slug)` (404 → null), `cache: "no-store"`.

- [ ] **Step 2:** Listing + detail pages: same structure as Task 10's two pages (metadata from post fields, BlogPosting JSON-LD with `author: {"@type": "Organization", name: "Contentor"}`), but styled with the landing design language — reuse the container/typography idioms from `frontend-main/src/components/landing/faq-section.tsx` and the site's shared header/footer layout so `/blog` looks native to the marketing site. i18n: static strings via the marketing i18n system if the surrounding layout requires it (`frontend-main/src/i18n/`), plain English otherwise — match whatever `pricing/page.tsx` does.

- [ ] **Step 3:** `sitemap.ts` (Next.js metadata route):

```typescript
import type { MetadataRoute } from "next";
import { fetchPlatformPosts } from "@/lib/platform-blog";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://contentor.app";
  const posts = await fetchPlatformPosts().catch(() => []);
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/blog`, changeFrequency: "daily", priority: 0.8 },
    ...posts.map((p) => ({
      url: `${base}/blog/${p.slug}`,
      lastModified: p.published_at ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
```

- [ ] **Step 4: Verify + commit** — `cd frontend-main && npx tsc --noEmit`; browser: `localhost/blog` (after generating a post via Task 13 or the API) renders; `localhost/sitemap.xml` includes blog URLs.

```bash
git add frontend-main/src/app/blog/ frontend-main/src/lib/platform-blog.ts frontend-main/src/app/sitemap.ts
git commit -m "feat(blog): contentor.app public blog + sitemap"
```

---

### Task 13: Superadmin compose page

**Files:**
- Create: `frontend-main/src/app/admin/blog/page.tsx`
- Create: `frontend-main/src/components/admin/blog-composer.tsx`
- Modify: superadmin nav (find where the existing `admin` routes — tenants/community/email/inbox — register their sidebar links: `grep -rn '"/admin/tenants"' frontend-main/src/` and add Blog the same way)

**Interfaces:**
- Consumes: `POST /api/v1/platform/blog/generate/`; adminkit CRUD from Task 11 (`/admin/m/...` model page handles edit/publish); frontend-main's authed fetch helper (grep how `admin/email` pages call the API).

- [ ] **Step 1:** `blog-composer.tsx`: topic input + instructions textarea + Generate button (spinner ~30s) hitting `/api/v1/platform/blog/generate/` with the superadmin auth the other admin pages use. On success, link the user to the adminkit model page for the new post (`/admin/m/<model-route-for-PlatformBlogPost>` — copy the route pattern the admin-kit `model-page.tsx` uses; verify by opening the SPA's Data section) where body/status/published_at are edited via the registered fields. TipTap is available in frontend-main if you'd rather edit inline — but v1 ships with the adminkit form; don't build a second editor.
- [ ] **Step 2:** `page.tsx`: renders the composer + a list of recent posts (`GET /api/v1/platform/blog/posts/` shows published; for drafts link into the adminkit list which shows everything).
- [ ] **Step 3:** Verify in browser (superadmin login → /admin/blog → generate with CLI provider → edit in Data section → publish → appears on /blog). Commit:

```bash
git add frontend-main/src/app/admin/blog/ frontend-main/src/components/admin/blog-composer.tsx frontend-main/src/
git commit -m "feat(blog): superadmin blog composer page"
```

---

## Phase 5 — Verification

### Task 14: Full verification sweep

- [ ] **Step 1:** `make test-fresh` — full backend suite green.
- [ ] **Step 2:** `make lint` — pre-commit clean (zero warnings).
- [ ] **Step 3:** Both frontends: `npm run build` (or the docker build) succeeds — pre-commit does NOT cover frontends.
- [ ] **Step 4:** End-to-end smoke with the CLI provider (`BLOG_AI_PROVIDER=cli`, `CLAUDE_CODE_OAUTH_TOKEN` set, `make dev`):
  1. Coach: `/admin/blog` → Write with AI → topic chip → draft opens (~30s) → edit → Publish → tenant-site `/blog/<slug>` renders with correct `<title>` + JSON-LD.
  2. Quota: set the tenant's plan `max_ai_blog_posts=1` in Django shell, generate once more → "out of credits" toast; `BlogAiUsage` row shows `generations_used=1`.
  3. Autopilot: enable weekly with `next_run_at` forced to the past via shell → run `docker compose exec django celery -A config call apps.blog.tasks.dispatch_due_blog_autopilot` (or trigger the function in shell) → draft appears + push notice logged.
  4. Superadmin: generate → publish → `contentor.app/blog` + `sitemap.xml`.
  5. Free tenant: `/admin/blog` shows the upsell; manual New post still works end-to-end.
- [ ] **Step 5:** Verify no live-key leakage: `git diff origin/main --stat` shows no `.env*` files staged; grep the new code for hardcoded keys.
- [ ] **Step 6:** Final commit of any fixups; report status honestly (what was browser-verified vs not).

---

## Self-review notes (already applied)

- Spec §5 provider values updated to `anthropic|cli` (help-bot convention); Dockerfile/compose CLI install already shipped with the help bot — no container work in this plan.
- Spec's `BLOG_AI_ENABLED` flag folded into `availability()`'s `disabled` reason (provider-unconfigured) — a separate flag added nothing.
- `cover_image` deferred to v2 per spec strikethrough.
- Regeneration (Task 9) reuses the generate endpoint then folds fields into the existing post — keeps the backend single-purpose; the temporary post is deleted client-side.
- Topic refill is budget-metered but never quota-metered (spec §5.4): enforced in both `blog_topics` POST and autopilot refill.
