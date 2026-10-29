"""Reels' jobs (apps.reels.jobs) on their own queue, `video`, whose worker takes one at a time: a render holds
the video service's CPU, and a site build must never wait behind one."""

import contextlib
import logging

from celery import shared_task
from django.utils import translation
from django.utils.translation import gettext as _
from django_tenants.utils import tenant_context

from apps.core import languages

logger = logging.getLogger(__name__)


@contextlib.contextmanager
def _in_tenant(tenant):
    """The tenant's schema, with what the job says to the creator (errors the studio shows) in her language."""
    with tenant_context(tenant), translation.override(languages.creator_language()):
        yield


def _tenant(tenant_id):
    from apps.core.models import Tenant

    return Tenant.objects.filter(id=tenant_id).first()


@shared_task(queue="video", ignore_result=True)
def find_reels(tenant_id, video_id, count, made_by="coach", waited=0):
    """Find a video's moments as reel ideas; while its words are on their way, look again in a moment."""
    from apps.courses.models import Video

    from . import jobs

    tenant = _tenant(tenant_id)
    if tenant is None:
        return
    with _in_tenant(tenant):
        video = Video.objects.filter(pk=video_id).first()
        if video is None:
            jobs.fail_search(video_id, _("The video was deleted."))
            return
        try:
            wait = jobs.run_search(video, count, made_by, waited)
        except Exception:
            logger.exception("reels: finding moments of video %s failed", video_id)
            jobs.fail_search(video_id, _("Something went wrong while finding moments. Try again."))
            return
    if wait:
        find_reels.apply_async((tenant_id, video_id, count, made_by, waited + wait), countdown=wait)


@shared_task(queue="video", ignore_result=True)
def scan_reel(tenant_id, reel_id):
    """Scan the faces around a reel trimmed past its last scan."""
    from . import jobs
    from .models import Reel

    tenant = _tenant(tenant_id)
    if tenant is None:
        return
    with _in_tenant(tenant):
        reel = Reel.objects.select_related("video").filter(pk=reel_id).first()
        if reel is not None:
            jobs.scan(reel)


@shared_task(queue="video", ignore_result=True)
def render_reel(tenant_id, reel_id):
    """Make a reel's video file."""
    from . import render
    from .models import Reel

    tenant = _tenant(tenant_id)
    if tenant is None:
        return
    with _in_tenant(tenant):
        reel = Reel.objects.select_related("video").filter(pk=reel_id).first()
        if reel is not None:
            render.run(reel)
