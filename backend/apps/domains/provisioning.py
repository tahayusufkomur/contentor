from __future__ import annotations

import logging

from apps.core.models import Domain

from .cloudflare import get_cloudflare
from .email_auth import get_resend_domains
from .registrar import get_registrar

logger = logging.getLogger(__name__)


def _step_register(cd) -> None:
    if cd.registrar_status == "registered":
        return
    reg = get_registrar()
    reg.register(domain=cd.domain, contact=cd.contact, nameservers=[])
    cd.registrar_status = "registered"
    cd.save(update_fields=["registrar_status", "updated_at"])


def _step_dns_zone(cd) -> None:
    if cd.cloudflare_zone_id:
        return
    cf = get_cloudflare()
    zone = cf.create_zone(cd.domain)
    cd.cloudflare_zone_id = zone["zone_id"]
    cd.save(update_fields=["cloudflare_zone_id", "updated_at"])
    # Point the registered domain's nameservers at Cloudflare.
    get_registrar().set_nameservers(domain=cd.domain, nameservers=zone["name_servers"])


def _step_dns_records(cd) -> None:
    cf = get_cloudflare()
    from django.conf import settings

    tunnel = settings.CLOUDFLARE_TUNNEL_HOSTNAME or "tunnel.contentor.app"
    cf.upsert_dns_record(zone_id=cd.cloudflare_zone_id, type="CNAME", name=cd.domain, content=tunnel, proxied=True)
    cf.upsert_dns_record(zone_id=cd.cloudflare_zone_id, type="CNAME", name=f"www.{cd.domain}", content=tunnel, proxied=True)


def _step_email_auth(cd) -> None:
    if cd.resend_domain_id:
        return
    resend = get_resend_domains()
    out = resend.create_domain(cd.domain)
    cd.resend_domain_id = out["resend_domain_id"]
    cd.save(update_fields=["resend_domain_id", "updated_at"])
    cf = get_cloudflare()
    for rec in out["records"]:
        cf.upsert_dns_record(
            zone_id=cd.cloudflare_zone_id, type=rec["type"], name=rec["name"], content=rec["value"], proxied=False
        )
    if cd.forward_to_email:
        cf.enable_email_routing(zone_id=cd.cloudflare_zone_id, forward_to=cd.forward_to_email)


def _step_ssl(cd) -> None:
    cf = get_cloudflare()
    status = cf.get_ssl_status(zone_id=cd.cloudflare_zone_id)
    if status != "active":
        raise RuntimeError("SSL not yet active")  # Celery retries


def _step_live(cd) -> None:
    Domain.objects.get_or_create(
        domain=cd.domain,
        defaults={"tenant": cd.tenant, "is_primary": cd.is_primary, "ssl_status": "active"},
    )


# Ordered list of (status-after-step, module-level function name).
# provision() resolves each name via globals() at call time so tests can
# monkeypatch module attributes (e.g. provisioning._step_register = boom).
_STEPS = [
    ("registering", "_step_register"),
    ("dns_zone", "_step_dns_zone"),
    ("dns_records", "_step_dns_records"),
    ("email_auth", "_step_email_auth"),
    ("ssl", "_step_ssl"),
    ("live", "_step_live"),
]


def provision(cd) -> None:
    if cd.provisioning_status == "live":
        return
    _g = globals()
    for status, step_name in _STEPS:
        cd.provisioning_status = status
        cd.failed_step = ""
        cd.save(update_fields=["provisioning_status", "failed_step", "updated_at"])
        try:
            _g[step_name](cd)
        except Exception:
            cd.provisioning_status = "failed"
            cd.failed_step = status
            cd.save(update_fields=["provisioning_status", "failed_step", "updated_at"])
            logger.exception("Provisioning failed for %s at %s", cd.domain, status)
            raise
    cd.provisioning_status = "live"
    cd.save(update_fields=["provisioning_status", "updated_at"])
