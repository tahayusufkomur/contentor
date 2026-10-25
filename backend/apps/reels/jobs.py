"""Reels as jobs on the `video` queue (tasks.py): finding a video's moments (its words first, from Scribe if
need be), scanning their faces, and rendering.

The studio follows a video's search by its state in the cache, kept under the schema that started it, and a
render by its reel's status. One search per video at a time; per site, SEARCHES_PER_HOUR and
RENDERS_PER_HOUR, as the video service is one machine's CPU for every site.

Runs inside the tenant context (reels is a TENANT_APP).
"""

import logging
from datetime import timedelta

import requests
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.utils import timezone

from apps.courses import captions

from . import framing, moments, render
from .models import Reel

logger = logging.getLogger(__name__)

SEARCH_TTL = 3 * 3600
RUNNING = ("transcribing", "picking", "framing")
WAIT = 15  # seconds between looks at Scribe while the words are on their way
WAIT_MAX = 45 * 60
SEARCHES_PER_HOUR = 12
RENDERS_PER_HOUR = 40
STALE_RENDER = timedelta(minutes=35)  # longer than the worst render: its worker died
SCAN_FPS = 4


class JobError(Exception):
    """Why a job could not start, in words safe to show the coach."""


def _key(video_id) -> str:
    return f"reels:search:{connection.schema_name}:{video_id}"


def search_state(video_id) -> dict:
    """{"status": idle | transcribing | picking | framing | done | failed, "detail", "reels": [ids]}."""
    return cache.get(_key(video_id)) or {"status": "idle", "detail": "", "reels": []}


def _set(video_id, status: str, detail: str = "", **more) -> None:
    cache.set(_key(video_id), {"status": status, "detail": detail, "reels": [], **more}, SEARCH_TTL)


def fail_search(video_id, detail: str) -> None:
    _set(video_id, "failed", detail)


def _take(kind: str, per_hour: int) -> bool:
    key = f"reels:{kind}:{connection.schema_name}"
    cache.add(key, 0, timeout=3600)
    try:
        return cache.incr(key) <= per_hour
    except ValueError:  # the hour ran out between the two calls
        return True


def words_state(video) -> str:
    """The video's words for reels, as captions.ensure_words sees them, without asking Scribe for anything."""
    if video.has_words:
        return "ready"
    state = captions.status(video)
    return "unavailable" if state is None else "failed" if state == "failed" else "working"


def start_search(video, count: int, made_by: str = "coach") -> dict:
    """Start finding `count` reels in the video (a search already running is left to finish)."""
    from . import tasks

    state = search_state(video.pk)
    if state["status"] in RUNNING:
        return state
    if not _take("searches", SEARCHES_PER_HOUR):
        raise JobError("That's a lot of reels for one hour. Try again a little later.")
    # (Scribe is asked by the job, in the video worker: the web process can't reach it in prod)
    found = words_state(video)
    if found == "unavailable":
        raise JobError("This video has no transcript, so reels can't be made from it. Upload your own video.")
    if found == "failed":
        raise JobError("No speech was found in this video, so there is nothing to caption.")
    _set(video.pk, "picking" if found == "ready" else "transcribing", count=count, made_by=made_by)
    tasks.find_reels.delay(connection.tenant.id, video.pk, count, made_by, 0)
    return search_state(video.pk)


def run_search(video, count: int, made_by: str, waited: int) -> int | None:
    """One step of a search (in the video worker): seconds until the next step while the words are on their
    way, else None once it is done or failed."""
    if not video.has_words:
        try:
            if video.captions_job:
                captions.collect(video)  # rather than wait for the sweep
            else:
                captions.ensure_words(video)  # a new file, or captions from before Scribe sent words
        except requests.RequestException:
            pass  # Scribe is away for a moment: look again next time
        video.refresh_from_db()
        if not video.has_words:
            # Scribe is done with this file and gave no words, or can't do it at all
            over = video.captions_key == video.s3_key and not video.captions_job
            if over or captions.status(video) is None or waited >= WAIT_MAX:
                fail_search(video.pk, "The video could not be transcribed. Try again later.")
                return None
            _set(video.pk, "transcribing", count=count, made_by=made_by)
            return WAIT
    _set(video.pk, "picking", count=count, made_by=made_by)
    taken = list(video.reels.values_list("start", "end"))
    picked = moments.pick(video, count, taken)
    if not picked:
        fail_search(video.pk, "No moments long enough for a reel were found in this video.")
        return None
    reels = [
        Reel.objects.create(
            video=video,
            start=m["start"],
            end=m["end"],
            title=m["title"],
            caption=m["caption"],
            score=m["score"],
            ideas=m["ideas"],
            made_by=made_by,
        )
        for m in picked
    ]
    ids = [str(r.pk) for r in reels]
    _set(video.pk, "framing", reels=ids)
    for reel in reels:
        scan(reel)
    _set(video.pk, "done", reels=ids)
    return None


def scan(reel) -> None:
    """The faces around the reel's stretch, from the video service, for the crop to follow; quietly none
    when the service is off or fails (the reel is then framed in the middle)."""
    if not render.available():
        return
    start = max(0.0, reel.start - framing.MARGIN)
    end = reel.end + framing.MARGIN
    try:
        res = requests.post(
            f"{settings.VIDEO_URL.rstrip('/')}/faces",
            json={"url": render.source_url(reel.video), "start": start, "end": end, "fps": SCAN_FPS},
            timeout=600,
        )
        res.raise_for_status()
        data = res.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("reel %s: faces not scanned: %s", reel.pk, exc)
        return
    faces = {
        "from": round(start, 3),
        "to": round(end, 3),
        "width": data.get("width"),
        "height": data.get("height"),
        "samples": data.get("samples") or [],
    }
    Reel.objects.filter(pk=reel.pk).update(faces=faces)
    reel.faces = faces


def start_scan(reel) -> None:
    from . import tasks

    if render.available():
        tasks.scan_reel.delay(connection.tenant.id, str(reel.pk))


def start_render(reel) -> None:
    from . import tasks

    if not render.available():
        raise JobError("Making reels into videos is not on for this site.")
    if status_of(reel) == Reel.RENDERING:
        return
    if not _take("renders", RENDERS_PER_HOUR):
        raise JobError("That's a lot of videos for one hour. Try again a little later.")
    Reel.objects.filter(pk=reel.pk).update(status=Reel.RENDERING, error="", updated_at=timezone.now())
    reel.status = Reel.RENDERING
    tasks.render_reel.delay(connection.tenant.id, str(reel.pk))


def status_of(reel) -> str:
    """The reel's status, a render "running" for longer than any takes counting as failed."""
    if reel.status == Reel.RENDERING and reel.updated_at and timezone.now() - reel.updated_at > STALE_RENDER:
        return Reel.FAILED
    return reel.status
