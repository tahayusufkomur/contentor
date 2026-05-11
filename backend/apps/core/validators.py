from django.core.exceptions import ValidationError

from .constants import RESERVED_SLUGS


def validate_tenant_slug(slug: str) -> None:
    if not slug:
        raise ValidationError("Slug is required.")
    if slug.lower() in RESERVED_SLUGS:
        raise ValidationError(f"'{slug}' is a reserved subdomain and cannot be used.")
