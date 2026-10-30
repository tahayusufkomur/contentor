"""Client for LiveCraft, our self-hosted live video product (sibling repo ../livecraft).

LiveCraft owns everything video — LiveKit, the room UI, moderation, chat,
recording. Contentor decides who may join a session and as what, then embeds
the join link LiveCraft returns in an iframe. Room name = the model's
``room_name`` ("<tenant-slug>-<hex>"); participant identity = ``u<user pk>``.

With ``LIVECRAFT_FAKE`` (dev without a LiveCraft, tests) no request is made and
join links are inert ``about:blank`` placeholders that still name the room.
"""

import hashlib
import hmac
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TIMEOUT = (2, 10)


class LiveCraftError(Exception):
    """LiveCraft refused or could not be reached."""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


def identity(user_id):
    return f"u{user_id}"


def _request(method, path, **kwargs):
    try:
        res = requests.request(
            method,
            f"{settings.LIVECRAFT_URL.rstrip('/')}/api/v1{path}",
            headers={"X-API-Key": settings.LIVECRAFT_API_KEY},
            timeout=TIMEOUT,
            **kwargs,
        )
    except requests.RequestException as exc:
        raise LiveCraftError(f"LiveCraft unreachable: {exc}") from exc
    if not res.ok:
        raise LiveCraftError(f"LiveCraft {method} {path} → {res.status_code}: {res.text[:200]}", res.status_code)
    return res


def create_room(room, *, title, layout, auto_record=False, whiteboard_url=None, watermark=False):
    """layout: "meeting" (interactive class) or "broadcast" (live stream).
    whiteboard_url: a prepared board (Excalidraw file) LiveCraft fetches for the host's whiteboard.
    watermark: students and viewers see their own name over the video (hosts switch it in the room)."""
    if settings.LIVECRAFT_FAKE:
        return
    body = {"room": room, "title": title, "layout": layout, "auto_record": auto_record}
    if whiteboard_url:
        body["whiteboard_url"] = whiteboard_url
    if watermark:
        body["watermark"] = True
    _request("POST", "/rooms", json=body)


def end_room(room):
    """Disconnect everyone. Never raises: ending must not block marking a session ended."""
    if settings.LIVECRAFT_FAKE:
        return
    try:
        _request("DELETE", f"/rooms/{room}")
    except LiveCraftError:
        logger.exception("Failed to end LiveCraft room %s", room)


def join_url(room, user, *, role, lang):
    """role: "host", "participant" (may publish) or "viewer" (watch + chat).
    lang: the language the room opens in for this person (LiveCraft falls back to English)."""
    who = identity(user.id)
    if settings.LIVECRAFT_FAKE:
        return f"about:blank#livecraft-fake/{room}/{who}/{role}"
    body = {"identity": who, "name": user.name or user.email, "role": role, "lang": lang}
    res = _request("POST", f"/rooms/{room}/join", json=body)
    return res.json()["join_url"]


def valid_signature(body: bytes, header: str) -> bool:
    """LiveCraft signs callbacks as ``sha256=<hex HMAC of the body, keyed by our API key>``."""
    key = settings.LIVECRAFT_API_KEY
    expected = "sha256=" + hmac.new(key.encode(), body, hashlib.sha256).hexdigest()
    return bool(key) and hmac.compare_digest(expected, header or "")
