"""Impersonation service: mint a redeemable login-as link for a target user.

Used by the admin-kit row actions. Keeps the token/URL/audit logic in one
place so both the platform (superadmin) and studio (coach) sites issue
identical, auditable handoffs.
"""

from __future__ import annotations

import logging
import uuid

from django.db import connection
from django_tenants.utils import tenant_context

from .models import User
from .tokens import create_impersonation_token

logger = logging.getLogger("apps.accounts.impersonation")


def _primary_domain(tenant) -> str | None:
    domain = tenant.domains.filter(is_primary=True).first() or tenant.domains.first()
    return domain.domain if domain else None


def _landing_path(role: str, is_staff: bool) -> str:
    # Staff/owners land in the admin panel; students on their dashboard (the
    # student-area layout that carries the impersonation banner).
    return "/admin" if (is_staff or role in ("owner", "coach")) else "/dashboard"


def issue_impersonation(request, *, tenant, target_user, scope: str) -> dict:
    """Return an admin-action result dict redirecting to a redeemable login link.

    `tenant` is the target's home tenant (a core.Tenant); `target_user` lives in
    that tenant's schema. `scope` records who authorized it ("platform" | "studio").
    """
    domain = _primary_domain(tenant)
    if not domain:
        return {"detail": f"{tenant.name} has no routable domain yet — cannot open a session."}

    impersonator = getattr(request.user, "email", "") or "unknown"
    jti = uuid.uuid4().hex
    token = create_impersonation_token(
        tenant_schema=tenant.schema_name,
        target_user_id=target_user.id,
        impersonator_email=impersonator,
        scope=scope,
        jti=jti,
    )
    landing = _landing_path(target_user.role, getattr(target_user, "is_staff", False))
    url = f"{request.scheme}://{domain}/impersonate?token={token}&next={landing}"

    logger.info(
        "impersonation issued: by=%s scope=%s tenant=%s target=%s(%s) jti=%s",
        impersonator,
        scope,
        tenant.schema_name,
        target_user.email,
        target_user.id,
        jti,
    )
    return {"redirect": url, "detail": f"Opening a session as {target_user.email}…"}


def tenant_admin_user(tenant):
    """The user a superadmin lands as when entering a tenant: its staff owner."""
    with tenant_context(tenant):
        owner = (
            User.objects.filter(is_staff=True).order_by("id").first()
            or User.objects.filter(role="owner").order_by("id").first()
        )
        if owner is None:
            return None
        # Detach from the schema-bound queryset so callers can read it after
        # the context exits (only scalar attrs are needed downstream).
        return owner


def impersonate_tenant_admin(request, tenant, *, scope: str = "platform") -> dict:
    owner = tenant_admin_user(tenant)
    if owner is None:
        return {"detail": f"{tenant.name} has no owner/admin account to log in as."}
    return issue_impersonation(request, tenant=tenant, target_user=owner, scope=scope)


def impersonate_same_tenant_user(request, target_user, *, scope: str = "studio") -> dict:
    """Coach → student within the current tenant schema."""
    return issue_impersonation(request, tenant=connection.tenant, target_user=target_user, scope=scope)
