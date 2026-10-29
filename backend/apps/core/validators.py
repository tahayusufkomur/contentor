from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _

from .constants import RESERVED_SLUGS


def validate_tenant_slug(slug: str) -> None:
    if not slug:
        raise ValidationError(_("Slug is required."))
    if slug.lower() in RESERVED_SLUGS:
        raise ValidationError(_("'%(slug)s' is a reserved subdomain and cannot be used.") % {"slug": slug})
