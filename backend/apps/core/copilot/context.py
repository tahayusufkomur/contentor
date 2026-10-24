"""Where the coach is when she talks to the assistant: the admin page, the
record open on it, and what she is trying to do there.

Trust boundary: the client sends a path and an intent key. Neither is copied
into the model's turn. The path is matched against ADMIN_PAGES and only our
own page name goes in; a record is looked up in the tenant's own tables; an
intent selects one of the steers below. Unknown values are dropped."""

import re

from django_tenants.utils import tenant_context

# The admin's pages by their nav names (frontend-customer lib/admin-nav.ts).
ADMIN_PAGES = {
    "/admin": "Home",
    "/admin/courses": "Courses",
    "/admin/live": "Classes & events",
    "/admin/downloads": "Downloads",
    "/admin/students": "People",
    "/admin/community": "Community",
    "/admin/inbox": "Inbox",
    "/admin/messages": "Messages",
    "/admin/messages/email": "Email",
    "/admin/messages/email/templates": "Email templates",
    "/admin/blog": "Blog",
    "/admin/payouts": "Payouts",
    "/admin/store": "Store",
    "/admin/media": "Media",
    "/admin/assistant": "Student assistant",
    "/admin/settings": "General settings",
    "/admin/billing": "Your plan",
}

# What "Describe it" beside a create button asks for. The coach's sentence is
# the message; this tells the model the answer is a draft, not a conversation.
INTENTS = {
    "draft_course": (
        "The coach typed this into the 'Describe it' field beside New course. "
        "Propose ONE create_course card: a clear title, a description of two or "
        "three sentences in her voice, 4 to 6 modules with 3 to 5 lesson titles "
        "each, and a price only if she named one (otherwise free). Choose the "
        "details yourself; ask only if the sentence names no subject at all."
    ),
    "draft_event": (
        "The coach typed this into the 'Describe it' field on Classes & events. "
        "Propose create_event cards: one for a single class, or one per date "
        "for a series (weekly unless she says otherwise, at most 12). Pick the "
        "event_kind from her words (live class by default, onsite when she "
        "names a place, zoom when she names Zoom, stream for a broadcast). "
        "Ask only if she gave no day or time at all."
    ),
}

_PATH = re.compile(r"^/admin(/[A-Za-z0-9_\-]+)*$")
RECORD_TEXT_MAX = 500
MAX_RECORD_MODULES = 30
MAX_RECORD_LESSONS = 20


def _page_of(path):
    """Longest ADMIN_PAGES prefix on a segment boundary, and what follows it."""
    best = max((p for p in ADMIN_PAGES if path == p or path.startswith(p + "/")), key=len, default=None)
    if best is None or (best == "/admin" and path != "/admin"):
        return None, ""
    return best, path[len(best) :].strip("/")


def _course_record(slug):
    from apps.billing.ways import describe, ways_of
    from apps.courses.models import Course

    course = Course.objects.filter(slug=slug).prefetch_related("modules__lessons").first()
    if course is None:
        return None
    lines = [
        f"Open on this page: course {course.id} '{course.title[:120]}' "
        f"({'published' if course.is_published else 'draft'}, access: {describe(ways_of(course))})",
        f"  description: {course.description[:RECORD_TEXT_MAX] or '(none)'}",
        "  curriculum (module id | title, then its lessons as lesson id | title; "
        "(empty) = no video or text yet, and it cannot go live until none is):",
    ]
    modules = list(course.modules.all())[:MAX_RECORD_MODULES]
    for module in modules:
        lines.append(f"    module {module.id} | {module.title[:80]}")
        for lesson in list(module.lessons.all())[:MAX_RECORD_LESSONS]:
            empty = lesson.empty()
            lines.append(f"      lesson {lesson.id} | {lesson.title[:80]}{' (empty)' if empty else ''}")
    if not modules:
        lines.append("    (no modules yet)")
    return "\n".join(lines)


def _post_record(pk):
    from apps.blog.models import BlogPost

    post = BlogPost.objects.filter(pk=pk).first() if pk.isdigit() else None
    if post is None:
        return None
    return (
        f"Open on this page: blog post {post.id} '{post.title[:120]}' ({post.status})\n"
        f"  summary: {post.excerpt[:RECORD_TEXT_MAX] or '(none)'}"
    )


_RECORDS = {"/admin/courses": _course_record, "/admin/blog": _post_record}

MAX_EMAIL_BLOCKS = 25
# What a block is about: the first of these it has.
_BLOCK_WORDS = ("ref", "text", "html", "title", "heading", "label", "alt")
EDIT_EMAIL_STEER = (
    "  Whatever she asks about an email here (write it, make it a promotion, feature a course, shorter, "
    "warmer, another photo) is about THIS email: propose edit_email, which changes it right in her editor. "
    "draft_email would start a separate email: only when she asks for a new one."
)


def _email_text(head, design):
    from django.utils.html import strip_tags

    from apps.email_campaigns.brand import blocks_of

    lines = [head, "  its blocks, top to bottom (id type: first words):"]
    for block in list(blocks_of(design))[:MAX_EMAIL_BLOCKS]:
        data = block.get("data") or {}
        words = next((str(data[k]) for k in _BLOCK_WORDS if data.get(k)), "")
        lines.append(f"    {block.get('id')} {block.get('type')}: {' '.join(strip_tags(words).split())[:80]}")
    if len(lines) == 2:
        lines.append("    (none yet)")
    return "\n".join([*lines, EDIT_EMAIL_STEER])


def _draft_in_editor(rest):
    from apps.email_campaigns.models import CampaignStatus, EmailCampaign

    match = re.fullmatch(r"(\d+)/edit", rest)
    email = EmailCampaign.objects.filter(pk=match[1], status=CampaignStatus.DRAFT).first() if match else None
    if email is None:
        return None, None
    head = (
        f"Open in the email editor: her email draft {email.id}, subject '{email.subject[:120] or '(none yet)'}', "
        f"preheader '{email.preheader[:120] or '(none)'}'"
    )
    return _email_text(head, email.design), {"kind": "campaign", "id": email.id}


def _template_in_editor(rest):
    from apps.email_campaigns.models import EmailTemplate

    email = EmailTemplate.objects.filter(pk=rest).first() if rest.isdigit() else None
    if email is None:
        return None, None
    head = (
        f"Open in the email editor: her email template {email.id} '{email.name[:120]}', "
        f"subject '{email.subject[:120] or '(none yet)'}'"
    )
    return _email_text(head, email.design), {"kind": "template", "id": email.id}


# The email editor's pages: what is open there, and the email edit_email changes.
_EMAIL_EDITORS = {"/admin/messages/email": _draft_in_editor, "/admin/messages/email/templates": _template_in_editor}


def clean(tenant, raw):
    """The converse body's ``context`` -> {"page", "path", "record", "email",
    "intent"}, or None when it names no admin page. ``email`` is the one open
    in the email editor ({"kind": "campaign"|"template", "id"}), else None."""
    if not isinstance(raw, dict):
        return None
    path = str(raw.get("path") or "")[:200].rstrip("/") or "/"
    if not _PATH.match(path):
        return None
    page, rest = _page_of(path)
    if page is None:
        return None
    record = None
    lookup = _RECORDS.get(page)
    key = rest.split("/")[0]
    if lookup and key and key != "new":
        with tenant_context(tenant):
            record = lookup(key)
    email = None
    if page in _EMAIL_EDITORS:
        with tenant_context(tenant):
            record, email = _EMAIL_EDITORS[page](rest)
    intent = raw.get("intent")
    return {
        "page": ADMIN_PAGES[page],
        "path": page,
        "record": record,
        "email": email,
        "intent": intent if isinstance(intent, str) and intent in INTENTS else None,
    }


def lines(context):
    """The user-turn paragraphs for a cleaned context."""
    if not context:
        return []
    out = [f"The coach is on the admin page: {context['page']} ({context['path']})"]
    if context.get("record"):
        out.append(context["record"])
    if context.get("intent"):
        out.append(INTENTS[context["intent"]])
    return out
