"""Push payload builders — same shape as apps.notifications.payloads so the
existing student service worker renders them unchanged."""

from django.utils.translation import gettext as _

from apps.notifications.payloads import _brand


def _trim(text: str, limit: int = 120) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def community_post_payload(author_name: str, body: str) -> dict:
    return {
        **_brand(),
        "title": _("%(author)s posted in the community") % {"author": author_name},
        "body": _trim(body),
        "url": "/community",
    }


def community_comment_payload(commenter_name: str, body: str) -> dict:
    return {
        **_brand(),
        "title": _("%(commenter)s commented on your post") % {"commenter": commenter_name},
        "body": _trim(body),
        "url": "/community",
    }
