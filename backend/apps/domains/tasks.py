from __future__ import annotations

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import CustomDomain
from .provisioning import provision
from .registrar import get_registrar


@shared_task(bind=True, max_retries=10, default_retry_delay=60)
def provision_domain(self, custom_domain_id: int) -> None:
    cd = CustomDomain.objects.get(pk=custom_domain_id)
    try:
        provision(cd)
    except Exception as exc:  # noqa: BLE001 — retry transient failures (e.g. SSL pending)
        raise self.retry(exc=exc)


@shared_task
def renew_domain(custom_domain_id: int) -> None:
    cd = CustomDomain.objects.get(pk=custom_domain_id)
    get_registrar().renew(domain=cd.domain)
    base = cd.expires_at or timezone.now()
    cd.expires_at = base + timedelta(days=365)
    cd.save(update_fields=["expires_at", "updated_at"])
