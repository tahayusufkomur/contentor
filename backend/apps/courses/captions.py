"""Captions for the coach's videos, written by Scribe, our own speech-to-text
service on the home servers (../scribe). The sweep (tasks.sweep_captions)
sends Scribe a link to each file whose captions are missing or stale, then
collects the WebVTT once Scribe is done.
"""

import logging

import requests
from django.conf import settings
from django.db.models import F, Q

from apps.core.storage import get_s3_client, get_tenant_slug

from .models import Video

logger = logging.getLogger(__name__)

# Long enough for a backlog to reach the file: S3 signs for 7 days at most.
LINK_SECONDS = 7 * 86400
TIMEOUT = (5, 30)


def available():
    return bool(settings.SCRIBE_URL)


def _own_prefixes():
    """Its own uploads and its live recordings only: the shared demo footage isn't hers."""
    return (f"tenants/{get_tenant_slug()}/", "recordings/")


def due():
    """This tenant's videos whose captions don't match the file."""
    own = Q()
    for prefix in _own_prefixes():
        own |= Q(s3_key__startswith=prefix)
    return Video.objects.filter(own).exclude(captions_key=F("s3_key"))


def status(video):
    """Where this file's captions stand, for the coach: waiting for the next
    sweep, working at Scribe, ready, or failed. None for a file that never
    gets any (Scribe off, the demo footage)."""
    key = video.s3_key
    if not available() or not key.startswith(_own_prefixes()):
        return None
    if video.captions_key != key:
        return "waiting"
    if video.captions_job:
        return "working"
    return "ready" if video.captions_vtt else "failed"


def pending():
    """Videos whose current file Scribe is still transcribing."""
    return Video.objects.exclude(captions_job="").filter(captions_key=F("s3_key"))


def submit(video):
    key = video.s3_key
    # The storage's own address, not the browser's: Scribe fetches the file
    # from the home servers (in dev, from inside Docker).
    url = get_s3_client().generate_presigned_url(
        "get_object", Params={"Bucket": settings.AWS_BUCKET_NAME, "Key": key}, ExpiresIn=LINK_SECONDS
    )
    job = _call("POST", "/v1/transcriptions", json={"media_url": url})
    Video.objects.filter(pk=video.pk, s3_key=key).update(
        captions_key=key, captions_job=job["id"], captions_vtt="", captions_language=""
    )


def collect(video):
    """Done: the captions are kept. Failed: none, and the reason logged. A job
    Scribe no longer knows is sent again on the next sweep."""
    job = _call("GET", f"/v1/transcriptions/{video.captions_job}", allow_404=True)
    mine = Video.objects.filter(pk=video.pk, captions_job=video.captions_job)
    if job is None:
        mine.update(captions_key="", captions_job="")
    elif job["status"] == "done":
        mine.update(captions_vtt=job["vtt"], captions_language=job["language"], captions_job="")
    elif job["status"] == "failed":
        logger.warning("captions: Scribe could not transcribe video %s (%s): %s", video.pk, video.s3_key, job["error"])
        mine.update(captions_job="")


def _call(method, path, json=None, allow_404=False):
    response = requests.request(
        method,
        settings.SCRIBE_URL.rstrip("/") + path,
        json=json,
        headers={"Authorization": f"Bearer {settings.SCRIBE_KEY}"},
        timeout=TIMEOUT,
    )
    if allow_404 and response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()
