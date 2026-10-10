"""TypeSafe's Jev: fast typed judgments (pick one of a set) over a coach's own
words, where a keyword table runs out. Advisory only: no key, a timeout or a
low-confidence pick returns None and the caller keeps its own answer."""

import hashlib
import json
import logging

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

URL = "https://api.typesafe.ai/v1/systemone"
TIMEOUT_SECONDS = 5
CACHE_SECONDS = 24 * 3600
NONE = "none"


def choose(state, instructions: str, options: dict[str, str], min_confidence: float = 0.6) -> str | None:
    """One key of ``options`` that ``state`` fits, or None (no key, no match,
    unsure, or the service failed). A "none of these" option is always added."""
    key_ = settings.TYPESAFE_API_KEY
    if not key_ or not state:
        return None
    criteria = {**options, NONE: "None of the other options fits."}
    body = {
        "state": state,
        "model": settings.TYPESAFE_MODEL,
        "questions": {"pick": {"type": "choice", "instructions": instructions, "criteria": criteria}},
    }
    key = "jev:" + hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
    if (hit := cache.get(key)) is not None:
        return hit or None
    try:
        resp = requests.post(URL, json=body, headers={"Authorization": f"Bearer {key_}"}, timeout=TIMEOUT_SECONDS)
        resp.raise_for_status()
        answer = resp.json()["answers"]["pick"]
    except (requests.RequestException, ValueError, KeyError):
        logger.warning("jev choice failed", exc_info=True)
        return None  # not cached: the next call tries again
    picked = answer.get("choice")
    result = picked if picked in options and (answer.get("confidence") or 0) >= min_confidence else None
    cache.set(key, result or "", CACHE_SECONDS)
    return result
