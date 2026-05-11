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


def create_signup_token(email: str, name: str, brand_name: str) -> str:
    payload = {
        "email": email,
        "name": name,
        "brand_name": brand_name,
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


def create_jwt(user, tenant) -> str:
    payload = {
        "user_id": user.id,
        "tenant_id": tenant.schema_name,
        "role": user.role,
        "region": getattr(tenant, "region", None) or getattr(user, "region", "global"),
        "exp": datetime.now(tz=UTC) + timedelta(days=settings.JWT_EXPIRY_DAYS),
        "iat": datetime.now(tz=UTC),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
