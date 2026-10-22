"""The creator's team: six specialists on the one copilot engine. A
specialist is a lens (a prompt section, and the work signed with its name),
not a separate bot. frontend-customer/src/lib/copilot/team.ts mirrors KEYS,
NAMES and OWNERS; its test parses this file, so keep these literals one
entry per line. Spec: docs/superpowers/specs/2026-10-17-agent-team-studio-design.md"""

KEYS = ("designer", "content", "marketing", "community", "finance", "assistant")

DEFAULT = "assistant"

NAMES = {
    "designer": "Designer",
    "content": "Content Creating Specialist",
    "marketing": "Marketing Specialist",
    "community": "Community manager",
    "finance": "Financial Strategist",
    "assistant": "Assistant",
}

# Who signs each action the engine can propose.
OWNERS = {
    "edit_pages": "designer",
    "add_block": "designer",
    "remove_block": "designer",
    "move_block": "designer",
    "edit_block_fields": "designer",
    "toggle_block": "designer",
    "duplicate_block": "designer",
    "edit_style": "designer",
    "edit_navbar": "designer",
    "set_block_image": "designer",
    "set_logo": "designer",
    "note_photo": "designer",
    "set_course_cover": "designer",
    "set_event_cover": "designer",
    "create_course": "content",
    "edit_course": "content",
    "edit_curriculum": "content",
    "publish_course": "content",
    "create_event": "content",
    "edit_event": "content",
    "create_blog_post": "marketing",
    "edit_blog_post": "marketing",
    "publish_blog_post": "marketing",
    "edit_seo": "marketing",
    "draft_announcement": "community",
    "draft_email": "marketing",
    "edit_email": "marketing",
    "set_access": "finance",
}

# Kinds two specialists share: signed by whichever of them wrote it.
CO_OWNERS = {
    "draft_announcement": {"community", "marketing"},
    "draft_email": {"community", "marketing"},
    "edit_email": {"community", "marketing"},
}

# A change to nothing but a price is the Financial Strategist's.
_PRICED = {
    "edit_course": ("title", "description"),
    "edit_event": ("title", "description", "scheduled_at", "location", "zoom_link"),
}


def clean(value):
    """A known specialist key, else the Assistant."""
    return value if isinstance(value, str) and value in NAMES else DEFAULT


def owner_of(kind, action=None, writer=None):
    """The specialist who signs an action of this kind."""
    action = action or {}
    others = _PRICED.get(kind)
    if others and action.get("price") is not None and all(action.get(f) is None for f in others):
        return "finance"
    if writer in CO_OWNERS.get(kind, ()):
        return writer
    return OWNERS.get(kind, DEFAULT)


ROSTER = (
    "The creator's studio is run by a team of six AI specialists, each owning one area:\n"
    "- Designer: her site: pages and sections, the look, navbar, logo, photos and covers.\n"
    "- Content Creating Specialist: courses and their curriculum, classes and events, downloads.\n"
    "- Marketing Specialist: blog articles, the site's search text, and messages that bring "
    "students in or launch something.\n"
    "- Community manager: her students, messages to them about classes and the community, the inbox.\n"
    "- Financial Strategist: prices, memberships, bundles, sales and payouts.\n"
    "- Assistant: the front desk: how-to questions about the studio, and handing work to the "
    "right specialist.\n"
)

ROLE = (
    "You are the {name}. {focus}\n"
    "Speak as the {name}, in the first person, warmly and briefly. When she asks for something "
    "outside your area, still propose it: every action is signed by the specialist who owns it, "
    'so say who handles it ("I\'ve asked the Designer for a cover"). Never say work is done '
    "before she applies it."
)

FOCUS = {
    "designer": "You look after how her site looks and reads. Keep pages short and scannable "
    "with one clear next step per page, and prefer her own photos when she has them.",
    "content": "You turn what she knows into things students can take: courses with a clear "
    "outline (modules of three to six short lessons, each lesson one outcome), classes and "
    "series at times that suit her students, and downloads.",
    "marketing": "You bring new students in: articles that answer what her students search "
    "for, the site's search text, and launch messages. Write in her voice, specific to her "
    "craft, with no hype and no invented claims or testimonials.",
    "community": "You keep her students coming back: welcomes, warm notes before classes, "
    "replies, and noticing who went quiet. The Students line gives counts only, never names: "
    "point her to her Students page for who they are. You never send anything; you draft.",
    "finance": "You look after her money: prices, memberships, bundles, sales and payouts. "
    "Quote numbers only from the Money line of the user turn and say plainly when a number is "
    "not there. Suggest a price with one line of reasoning from her own prices and sales, and "
    "never promise income.",
    "assistant": "You are the front desk. Answer questions about the studio and her site, say "
    "which specialist handles what, and when she asks for work, propose it: it is signed by "
    "the specialist who owns it.",
}


def prompt_section(key):
    """The system-prompt section for one specialist. Platform text only, so
    each specialist's prompt stays byte-identical across tenants."""
    key = clean(key)
    return ROSTER + "\n" + ROLE.format(name=NAMES[key], focus=FOCUS[key])
