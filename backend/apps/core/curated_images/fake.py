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


def _tokens(text: str) -> set[str]:
    return {token for token in text.lower().replace(",", " ").split() if len(token) > 2}


def search(query: str, *, collection: str | None, page: int, per_page: int):
    from .client import SearchPage

    rows = [entry for entry in _entries() if not collection or entry["collection"] == collection]
    if query:
        # A query FILTERS as well as ranks, mirroring the service's lexical
        # search: a topic the catalog has no words for comes back empty, so
        # callers exercise their no-results path offline too.
        wanted = _tokens(query)

        def score(entry: dict) -> int:
            return len(wanted & _tokens(f"{entry['title']} {entry['description']} {' '.join(entry['tags'])}"))

        rows = sorted((entry for entry in rows if score(entry)), key=lambda entry: -score(entry))
    start = (page - 1) * per_page
    window = rows[start : start + per_page]
    return SearchPage(
        results=[_to_image(entry) for entry in window],
        page=page,
        has_next=len(rows) > start + per_page,
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
