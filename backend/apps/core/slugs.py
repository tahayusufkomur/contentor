"""The one slugify. Django's drops letters NFKD can't fold (ı, ł, ß), so "Işık Yoga" became "isk-yoga".
Everything else (ğ ş ç ö ü ä ą ę ś ź ż ć ń ó İ) folds through NFKD. Mirrored by `siteSlug` in
frontend-customer/src/lib/slug.ts. Existing slugs are stored, never recomputed: only new ones use this."""

from django.utils.text import slugify as legacy_slugify  # Django's, which drops ı ł ß: only to find slugs it stored

_UNFOLDABLE = str.maketrans({"ı": "i", "ł": "l", "Ł": "l", "ß": "ss"})


def slugify(value: str) -> str:
    return legacy_slugify(str(value).translate(_UNFOLDABLE))
