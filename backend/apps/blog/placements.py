"""Serve-time rendering of BlogPost.image_placements.

body_html itself NEVER stores image URLs — presigned URLs expire — so inline
images are resolved to fresh signed URLs and injected into the HTML at
serialization time only."""

import html as html_lib
import uuid

from apps.core.storage import generate_presigned_download_url


def resolve_placements(post):
    """[{heading, photo_id, url, alt}] for placements whose Photo still
    exists. Malformed ids and deleted photos drop out (fail open)."""
    from apps.media.models import Photo

    placements = post.image_placements or []
    valid_ids = []
    for placement in placements:
        try:
            valid_ids.append(uuid.UUID(str(placement.get("photo_id", ""))))
        except ValueError:
            continue
    photos = {str(photo.id): photo for photo in Photo.objects.filter(id__in=valid_ids)}
    out = []
    for placement in placements:
        photo = photos.get(str(placement.get("photo_id", "")))
        if photo is None or not photo.s3_key:
            continue
        out.append(
            {
                "heading": placement.get("heading", ""),
                "photo_id": str(photo.id),
                "url": generate_presigned_download_url(photo.s3_key),
                "alt": photo.alt_text or photo.title,
            }
        )
    return out


def inject_placement_images(body_html, resolved):
    """Insert a <figure><img/></figure> after the first <h2> whose text equals
    the placement heading (HTML-escaped comparison — markdown rendering
    escaped the stored headings the same way). Unmatched headings skip."""
    result = body_html or ""
    for item in resolved:
        heading = item.get("heading", "")
        if not heading:
            continue
        marker = f"<h2>{html_lib.escape(heading)}</h2>"
        idx = result.find(marker)
        if idx < 0:
            continue
        insert_at = idx + len(marker)
        figure = (
            f'<figure class="blog-inline-image"><img src="{html_lib.escape(item["url"])}" '
            f'alt="{html_lib.escape(item["alt"])}" loading="lazy" /></figure>'
        )
        result = result[:insert_at] + figure + result[insert_at:]
    return result
