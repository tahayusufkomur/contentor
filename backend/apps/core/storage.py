import logging
from functools import lru_cache

import boto3
from botocore.config import Config
from django.conf import settings
from django.db import connection
from django_tenants.utils import get_public_schema_name

logger = logging.getLogger(__name__)


def get_s3_client(external=False):
    endpoint = settings.AWS_ENDPOINT
    if external and settings.AWS_ENDPOINT_EXTERNAL:
        endpoint = settings.AWS_ENDPOINT_EXTERNAL
    return _s3_client(settings.AWS_ACCESS_KEY_ID, settings.AWS_SECRET_ACCESS_KEY, endpoint or None)


# boto3.client() costs ~10ms, so building one per presign made list endpoints
# (783-row curated logo catalog) take seconds. Keyed on every setting it reads,
# so override_settings in tests gets its own client. Clients are thread-safe.
@lru_cache(maxsize=8)
def _s3_client(access_key_id, secret_access_key, endpoint):
    kwargs = {
        "aws_access_key_id": access_key_id,
        "aws_secret_access_key": secret_access_key,
        # Path-style + v4 keep MinIO happy and are harmless for Hetzner.
        "config": Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    }
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client("s3", **kwargs)


def storage_folder(tenant) -> str:
    """The tenant's folder under tenants/: its address, except a site named in
    /setup keeps the folder of its temporary address (its schema), so the
    files stored before the name stay its own."""
    from .constants import SITE_PLACEHOLDER_PREFIX

    if tenant.schema_name.startswith(SITE_PLACEHOLDER_PREFIX):
        return tenant.schema_name
    return tenant.slug


def get_tenant_slug():
    tenant = getattr(connection, "tenant", None)
    if tenant and hasattr(tenant, "slug"):
        return storage_folder(tenant)
    return "unknown"


def build_s3_path(category, *parts):
    slug = get_tenant_slug()
    joined = "/".join(str(p) for p in parts)
    return f"tenants/{slug}/{category}/{joined}"


def is_tenant_scoped_key(s3_key):
    """True if s3_key belongs to the CURRENT tenant's storage prefix.

    Client-supplied keys (the upload 'complete' endpoints) must be validated
    against this — otherwise a coach can point a record at, and get a presigned
    URL for, any object in the bucket (including other tenants')."""
    if not isinstance(s3_key, str) or ".." in s3_key:
        return False
    return s3_key.startswith(f"tenants/{get_tenant_slug()}/")


# Keys outside every tenant's folder that any tenant may be handed a link to:
# the demo seed's assets and the superadmin's platform art (the curated logo
# and photo catalogs). The rest of the bucket is one tenant's private storage,
# or ours (logs/archive/, activity/archive/).
SHARED_KEY_PREFIXES = ("demo/", "platform/")


def is_signable_key(s3_key):
    """True if the CURRENT tenant may be handed a download link to s3_key: its
    own storage or a shared prefix.

    The signer asks this itself, because the key is often a value a coach or a
    student wrote (a thumbnail_url, a block's url, an avatar_key), and a guard
    on each of those fields is one forgotten field away from handing out
    another tenant's files."""
    if not isinstance(s3_key, str) or ".." in s3_key.split("/"):
        return False
    if s3_key.startswith(SHARED_KEY_PREFIXES) or s3_key.startswith(f"tenants/{get_tenant_slug()}/"):
        return True
    # The platform inbox files its attachments inside schema_context("public"),
    # where there is no tenant row and the slug reads "unknown".
    return connection.schema_name == get_public_schema_name() and s3_key.startswith("tenants/unknown/")


# Content types that could execute as active content if served inline from the
# storage origin — never legitimate coach-uploaded media.
_BLOCKED_CONTENT_TYPES = {
    "text/html",
    "application/xhtml+xml",
    "application/javascript",
    "text/javascript",
}


def is_blocked_content_type(content_type):
    return (content_type or "").split(";")[0].strip().lower() in _BLOCKED_CONTENT_TYPES


def generate_presigned_upload_url(s3_key, content_type="application/octet-stream"):
    client = get_s3_client(external=True)
    return client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.AWS_BUCKET_NAME,
            "Key": s3_key,
            "ContentType": content_type,
        },
        ExpiresIn=settings.AWS_PRESIGNED_EXPIRY,
    )


def generate_presigned_download_url(s3_key, expiry=3600):
    """A presigned download link, or "" for a key this tenant may not read."""
    if not is_signable_key(s3_key):
        logger.warning("storage: refused to sign %r for tenant %s", s3_key, get_tenant_slug())
        return ""
    client = get_s3_client(external=True)
    return client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": settings.AWS_BUCKET_NAME,
            "Key": s3_key,
        },
        ExpiresIn=expiry,
    )


def sign_if_s3_key(value):
    """Return a presigned download URL for S3 keys, or the original value if
    HTTP or empty. A key this tenant may not read comes back as ""."""
    if not value:
        return value
    if isinstance(value, str) and not value.startswith("http"):
        return generate_presigned_download_url(value)
    return value
