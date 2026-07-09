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

from decimal import Decimal

from pydantic import BaseModel, Field

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
