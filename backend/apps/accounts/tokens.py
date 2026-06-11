from datetime import UTC, datetime, timedelta

import jwt
from django.conf import settings


def create_magic_link_token(email: str, tenant_schema: str, tenant_slug: str) -> str:
    payload = {
        "email": email,
        "tenant_id": tenant_schema,
        "tenant_slug": tenant_slug,
        "purpose": "magic_link",
        "exp": datetime.now(tz=UTC) + timedelta(minutes=settings.MAGIC_LINK_EXPIRY_MINUTES),
        "iat": datetime.now(tz=UTC),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def verify_magic_link_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    if payload.get("purpose") != "magic_link":
        raise jwt.InvalidTokenError("Invalid token purpose")
    return payload


def create_signup_token(email: str, name: str, brand_name: str, region: str = "global") -> str:
    payload = {
        "email": email,
        "name": name,
        "brand_name": brand_name,
        "region": region,
        "purpose": "signup",
        "exp": datetime.now(tz=UTC) + timedelta(minutes=settings.MAGIC_LINK_EXPIRY_MINUTES),
        "iat": datetime.now(tz=UTC),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def verify_signup_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    if payload.get("purpose") != "signup":
        raise jwt.InvalidTokenError("Invalid token purpose")
    return payload


def create_jwt(user, tenant, region: str | None = None, extra_claims: dict | None = None) -> str:
    payload = {
        "user_id": user.id,
        "tenant_id": tenant.schema_name,
        "role": user.role,
        "region": region or getattr(tenant, "region", None) or getattr(user, "region", "global"),
        "exp": datetime.now(tz=UTC) + timedelta(days=settings.JWT_EXPIRY_DAYS),
        "iat": datetime.now(tz=UTC),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


# Impersonation: a privileged admin (superadmin or coach) mints a one-time,
# short-lived token authorizing a login *as* another user. It is redeemed on
# the target tenant's domain (`impersonate_verify`), which exchanges it for a
# normal session JWT carrying an `imp` claim so the session knows — and can
# surface — that it is impersonated. The `jti` makes it single-use.
IMPERSONATION_EXPIRY_SECONDS = 120


def create_impersonation_token(
    *, tenant_schema: str, target_user_id: int, impersonator_email: str, scope: str, jti: str
) -> str:
    payload = {
        "purpose": "impersonation",
        "tenant_id": tenant_schema,
        "target_user_id": target_user_id,
        "impersonator_email": impersonator_email,
        "scope": scope,  # "platform" (superadmin) | "studio" (coach)
        "jti": jti,
        "exp": datetime.now(tz=UTC) + timedelta(seconds=IMPERSONATION_EXPIRY_SECONDS),
        "iat": datetime.now(tz=UTC),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def verify_impersonation_token(token: str) -> dict:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    if payload.get("purpose") != "impersonation":
        raise jwt.InvalidTokenError("Invalid token purpose")
    return payload
