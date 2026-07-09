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
            "ai_model": settings.BLOG_AI_MODEL
            if settings.BLOG_AI_PROVIDER == "anthropic"
            else settings.BLOG_AI_CLI_MODEL,
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
    """The tenant's current AI-blog quota. Reads platform_subscription.plan —
    the SAME source has_paid_platform_plan uses — not the Tenant.plan FK,
    which is set at signup and never kept in sync with the live subscription."""
    from apps.core.models import PlatformSubscription

    try:
        plan = tenant.platform_subscription.plan
    except PlatformSubscription.DoesNotExist:
        return 0
    return plan.max_ai_blog_posts or 0


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
