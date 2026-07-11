"""Serve-time photo resolution for BlogPost. Nothing in this module ever
runs before a save() — it only transforms an outgoing response payload, so
the signed URLs it produces are always fresh (see spec §3: a stored URL
would expire long before a published post stops being read)."""

import html as html_lib

from apps.core.storage import generate_presigned_download_url
from apps.media.models import Photo


def _sign(photo):
    return {
        "id": str(photo.id),
        "signed_url": generate_presigned_download_url(photo.s3_key),
        "alt_text": photo.alt_text,
    }


def resolve_cover_photo(post):
    if not post.cover_photo_id:
        return None
    return _sign(post.cover_photo)


def resolve_inline_photos(image_placements):
    """{photo_id: signed dict} for every id referenced in image_placements,
    one query for all of them (not one query per placement). Missing/deleted
    photos are simply absent from the returned dict —
    splice_image_placements skips any placement it can't resolve."""
    photo_ids = [p["photo_id"] for p in image_placements]
    if not photo_ids:
        return {}
    return {str(photo.id): _sign(photo) for photo in Photo.objects.filter(pk__in=photo_ids)}


def splice_image_placements(body_html, image_placements, resolved_photos):
    """resolved_photos: output of resolve_inline_photos(image_placements).
    Heading not found in the current body_html (e.g. hand-edited after
    generation) or photo no longer resolvable -> skip that placement, never
    error the whole response."""
    out = body_html
    for placement in image_placements:
        photo = resolved_photos.get(placement.get("photo_id"))
        if not photo:
            continue
        heading_html = f"<h2>{html_lib.escape(placement.get('heading', ''))}</h2>"
        if heading_html not in out:
            continue
        img = f'<img src="{photo["signed_url"]}" alt="{html_lib.escape(photo["alt_text"])}" loading="lazy">'
        out = out.replace(heading_html, heading_html + img, 1)
    return out
