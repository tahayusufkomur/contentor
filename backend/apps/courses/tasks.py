import logging

import requests
from celery import shared_task
from django_tenants.utils import tenant_context

logger = logging.getLogger(__name__)


@shared_task
def sweep_captions():
    """Every five minutes: send Scribe each video whose captions don't match
    its file yet (a new upload, a replaced file, a live recording alike), and
    collect what it has finished (apps.courses.captions)."""
    from apps.core.models import Tenant

    from . import captions

    if not captions.available():
        return
    for tenant in Tenant.objects.exclude(schema_name="public"):
        try:
            with tenant_context(tenant):
                for video in captions.due():
                    captions.submit(video)
                for video in captions.pending():
                    captions.collect(video)
        except requests.RequestException as e:
            logger.warning("captions: Scribe unreachable, next sweep retries: %s", e)
            return
        except Exception:
            logger.exception("captions sweep skipped %s", tenant.schema_name)
