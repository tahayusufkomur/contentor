import boto3
from botocore.config import Config
from django.conf import settings
from django.db import connection


def get_s3_client(external=False):
    kwargs = {
        "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
        "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
        # Path-style + v4 keep MinIO happy and are harmless for Hetzner.
        "config": Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    }
    endpoint = settings.AWS_ENDPOINT
    if external and settings.AWS_ENDPOINT_EXTERNAL:
        endpoint = settings.AWS_ENDPOINT_EXTERNAL
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.client("s3", **kwargs)


def get_tenant_slug():
    tenant = getattr(connection, "tenant", None)
    if tenant and hasattr(tenant, "slug"):
        return tenant.slug
    return "unknown"


def build_s3_path(category, *parts):
    slug = get_tenant_slug()
    joined = "/".join(str(p) for p in parts)
    return f"tenants/{slug}/{category}/{joined}"


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
    """Return a presigned download URL for S3 keys, or the original value if HTTP or empty."""
    if not value:
        return value
    if isinstance(value, str) and not value.startswith("http"):
        return generate_presigned_download_url(value)
    return value
