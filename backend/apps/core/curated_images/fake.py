"""Offline fixture catalog for dev and e2e (CURATED_IMAGE_API_FAKE=true).

Eight images kept back from the catalog that moved into curated-image-api, so
the picker, the wizard and the blog writer all have something real to choose
without the stack reaching the network. Ranking is deliberately crude token
overlap: enough that a query for "yoga" surfaces the yoga photo, not a pretense
of the service's relevance model. Four logo marks (`kind: "logo"`, transparent
WebP) stand in for the service's logo catalog the same way.

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
        colors=tuple(entry.get("colors") or ()),
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
    query: str,
    *,
    orientation: str | None,
    page: int,
    per_page: int,
    session_id: str = "",
    shuffle: bool = False,
    kind: str = "photo",
):
    """Offline stand-in for the service's search, including its session
    semantics: with a session id the same image is never handed back twice, and
    once every match has been shown the cycle restarts at the top and says so.
    Callers exercise their "another please" path offline exactly as in prod."""
    from uuid import uuid4

    from .client import SearchPage

    rows = [
        entry
        for entry in _entries()
        if entry.get("kind", "photo") == kind and (not orientation or _orientation(entry) == orientation)
    ]
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


def entries(kind: str = "photo") -> list[dict]:
    """The fixture catalog itself — tests assert against real entries rather
    than hard-coding asset ids."""
    return [entry for entry in _entries() if entry.get("kind", "photo") == kind]


def fixture_path(asset_id: str) -> str:
    entry = next((e for e in _entries() if e["asset_id"] == asset_id), None)
    return str(FIXTURE_DIR / entry["file"]) if entry else ""


_JOB_PREFIX = "fake-job-"


def generate(prompt: str, kind: str = "photo"):
    """Offline generation: "creates" whichever fixture best matches the prompt
    and finishes at once, so the picker's generate path runs end to end."""
    from .client import GenerationJob

    wanted = _tokens(prompt)
    entry = max(
        entries(kind),
        key=lambda e: len(wanted & _tokens(f"{e['title']} {e['description']} {' '.join(e['tags'])}")),
    )
    return GenerationJob(job_id=f"{_JOB_PREFIX}{entry['asset_id']}", status="fulfilled", image=_to_image(entry))


def generation(job_id: str):
    from .client import GenerationJob

    image = get(job_id.removeprefix(_JOB_PREFIX)) if job_id.startswith(_JOB_PREFIX) else None
    return GenerationJob(job_id=job_id, status="fulfilled", image=image) if image else None


# ── the coach's own photos (client.private_*) ────────────────────────────────
#
# Offline stand-in for the service's private collection: an upload is "ready"
# at once and is described by its file name, which is all the offline search
# has to rank on. Kept in the cache so the web and Celery processes agree.

_PRIVATE_KEY = "curated-images:fake-private:{space}"
_PRIVATE_SPACE_OF = "curated-images:fake-private-upload:{upload_id}"
_PRIVATE_TTL = 30 * 86400


def _private_rows(space: str) -> list[dict]:
    from django.core.cache import cache

    return list(cache.get(_PRIVATE_KEY.format(space=space)) or [])


def _private_save(space: str, rows: list[dict]) -> None:
    from django.core.cache import cache

    cache.set(_PRIVATE_KEY.format(space=space), rows, _PRIVATE_TTL)


def _private_view(row: dict):
    from .client import OwnUpload

    return OwnUpload(upload_id=row["id"], status="ready", title=row["title"], description=row["description"])


def private_upload(body: bytes, filename: str, *, space: str, tags=()):
    import hashlib
    import io
    import uuid

    from django.core.cache import cache
    from PIL import Image

    digest = hashlib.sha256(body).hexdigest()
    rows = _private_rows(space)
    existing = next((r for r in rows if r["sha"] == digest), None)
    if existing:
        return _private_view(existing)
    try:
        with Image.open(io.BytesIO(body)) as im:
            width, height = im.size
    except Exception:
        width = height = 0
    title = " ".join(filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " ").split()) or "Uploaded image"
    row = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, f"fake-private:{space}:{digest}")),
        "sha": digest,
        "title": title,
        "description": f"A photo: {title}.",
        "tags": [str(t) for t in tags],
        "width": width,
        "height": height,
    }
    _private_save(space, [*rows, row])
    cache.set(_PRIVATE_SPACE_OF.format(upload_id=row["id"]), space, _PRIVATE_TTL)
    return _private_view(row)


def _private_find(upload_id: str) -> tuple[str, dict] | None:
    from django.core.cache import cache

    space = cache.get(_PRIVATE_SPACE_OF.format(upload_id=upload_id))
    row = next((r for r in _private_rows(space) if r["id"] == upload_id), None) if space else None
    return (space, row) if row else None


def private_status(upload_id: str):
    found = _private_find(upload_id)
    return _private_view(found[1]) if found else None


def private_search(query: str, *, space: str, orientation=None, per_page: int = 12):
    from .client import RemoteImage

    want = _tokens(query)
    rows = [r for r in _private_rows(space) if not orientation or _orientation(r) == orientation]
    scored = [(len(want & _tokens(f"{r['title']} {' '.join(r['tags'])}")), n, r) for n, r in enumerate(rows)]
    # A query keeps only what shares a word with it; no query lists the newest first.
    kept = [x for x in scored if x[0]] if want else scored
    kept.sort(key=lambda x: (-x[0], -x[1]))
    return [
        (
            r["id"],
            RemoteImage(
                asset_id=r["id"],
                title=r["title"],
                description=r["description"],
                tags=list(r["tags"]),
                width=r["width"] or None,
                height=r["height"] or None,
                preview_url="",
                web_url="",
            ),
        )
        for _, _, r in kept[:per_page]
    ]


def private_delete(upload_id: str) -> None:
    found = _private_find(upload_id)
    if found:
        _private_save(found[0], [r for r in _private_rows(found[0]) if r["id"] != upload_id])
