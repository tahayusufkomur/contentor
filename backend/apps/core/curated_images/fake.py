"""Offline fixture catalog for dev and e2e (CURATED_IMAGE_API_FAKE=true).

Eight images kept back from the catalog that moved into curated-image-api, so
the picker, the wizard and the blog writer all have something real to choose
without the stack reaching the network. Ranking is deliberately crude token
overlap: enough that a query for "yoga" surfaces the yoga photo, not a pretense
of the service's relevance model.

Fixture asset ids are UUID5-derived from their filenames, so a blog draft that
stored "curated:<id>" between two Celery tasks still resolves after a restart.
Production refuses this mode (config/settings/prod.py).
"""

import json
from functools import lru_cache
from pathlib import Path

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"


@lru_cache(maxsize=1)
def _entries() -> list[dict]:
    return json.loads((FIXTURE_DIR / "fixtures.json").read_text())


def _to_image(entry: dict):
    from .client import RemoteImage

    path = str(FIXTURE_DIR / entry["file"])
    # No signed URL exists offline; the local path IS the byte source, and the
    # preview URL is served by the same view that serves any tenant photo once
    # the image is cached. Until then the picker shows the fixture endpoint.
    return RemoteImage(
        asset_id=entry["asset_id"],
        title=entry["title"],
        description=entry["description"],
        tags=list(entry["tags"]),
        width=entry["width"],
        height=entry["height"],
        preview_url=f"/api/v1/curated-images/{entry['asset_id']}/preview/",
        web_url=f"/api/v1/curated-images/{entry['asset_id']}/preview/",
        local_path=path,
    )


def _orientation(entry: dict) -> str:
    width, height = entry["width"], entry["height"]
    return "landscape" if width > height else "portrait" if width < height else "square"


def _tokens(text: str) -> set[str]:
    return {token for token in text.lower().replace(",", " ").split() if len(token) > 2}


_SESSION_KEY = "curated-images:fake-session:{sid}"
_SESSION_TTL = 86400  # the service expires a search session after 24h idle


def _session_seen(session_id: str) -> list[str]:
    from django.core.cache import cache

    return list(cache.get(_SESSION_KEY.format(sid=session_id)) or []) if session_id else []


def _session_remember(session_id: str, asset_ids: list[str]) -> None:
    from django.core.cache import cache

    if not session_id or not asset_ids:
        return
    seen = _session_seen(session_id)
    seen += [a for a in asset_ids if a not in seen]
    cache.set(_SESSION_KEY.format(sid=session_id), seen, timeout=_SESSION_TTL)


def search(
    query: str, *, orientation: str | None, page: int, per_page: int, session_id: str = "", shuffle: bool = False
):
    """Offline stand-in for the service's search, including its session
    semantics: with a session id the same image is never handed back twice, and
    once every match has been shown the cycle restarts at the top and says so.
    Callers exercise their "another please" path offline exactly as in prod."""
    from uuid import uuid4

    from .client import SearchPage

    rows = [entry for entry in _entries() if not orientation or _orientation(entry) == orientation]
    if query:
        # A query FILTERS as well as ranks, mirroring the service's lexical
        # search: a topic the catalog has no words for comes back empty, so
        # callers exercise their no-results path offline too.
        wanted = _tokens(query)

        def score(entry: dict) -> int:
            return len(wanted & _tokens(f"{entry['title']} {entry['description']} {' '.join(entry['tags'])}"))

        rows = sorted((entry for entry in rows if score(entry)), key=lambda entry: -score(entry))

    sessioned = bool(session_id or shuffle)
    if not sessioned:
        start = (page - 1) * per_page
        window = rows[start : start + per_page]
        return SearchPage(
            results=[_to_image(entry) for entry in window],
            page=page,
            has_next=len(rows) > start + per_page,
        )

    session_id = session_id or uuid4().hex
    seen = set(_session_seen(session_id))
    unseen = [entry for entry in rows if entry["asset_id"] not in seen]
    restarted = not unseen and bool(rows)
    window = (unseen or rows)[:per_page]
    _session_remember(session_id, [entry["asset_id"] for entry in window])
    return SearchPage(
        results=[_to_image(entry) for entry in window],
        page=page,
        has_next=len(unseen) > per_page,
        session_id=session_id,
        shuffle_cycle_restarted=restarted,
    )


def get(asset_id: str):
    for entry in _entries():
        if entry["asset_id"] == asset_id:
            return _to_image(entry)
    return None


def entries() -> list[dict]:
    """The fixture catalog itself — tests assert against real entries rather
    than hard-coding asset ids."""
    return list(_entries())


def fixture_path(asset_id: str) -> str:
    entry = next((e for e in _entries() if e["asset_id"] == asset_id), None)
    return str(FIXTURE_DIR / entry["file"]) if entry else ""


_JOB_PREFIX = "fake-job-"


def generate(prompt: str):
    """Offline generation: "creates" whichever fixture best matches the prompt
    and finishes at once, so the picker's generate path runs end to end."""
    from .client import GenerationJob

    wanted = _tokens(prompt)
    entry = max(
        _entries(),
        key=lambda e: len(wanted & _tokens(f"{e['title']} {e['description']} {' '.join(e['tags'])}")),
    )
    return GenerationJob(job_id=f"{_JOB_PREFIX}{entry['asset_id']}", status="fulfilled", image=_to_image(entry))


def generation(job_id: str):
    from .client import GenerationJob

    image = get(job_id.removeprefix(_JOB_PREFIX)) if job_id.startswith(_JOB_PREFIX) else None
    return GenerationJob(job_id=job_id, status="fulfilled", image=image) if image else None
