"""A coach's own photos: made light for the web, then made findable.

Every photo a coach uploads is re-encoded as AVIF at a size a site can use (a
phone photo is 5-10 MB; a page needs about a tenth of that), then handed to the
image service's private collection, in a space of this tenant's own, which
describes and indexes it the way it does its catalog. From then on a search for
"teaching a class" finds her photo of exactly that, and its description is the
alt text.

The service takes minutes to hours and may be down. Nothing here waits for it:
a photo is on her site as soon as it is uploaded, found by its name and shape
until the description arrives.

Runs inside the tenant context (media is a TENANT_APP).
"""

import hashlib
import io
import logging
import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import connection
from django.db.models import Q

from apps.core.curated_images import client as catalog
from apps.core.storage import generate_presigned_download_url, get_s3_client

from .models import Photo

logger = logging.getLogger(__name__)

# Where a photo stands: uploaded and not yet optimized; optimized and waiting
# for the service to take it; being described there; findable; or left out of
# the index (still on her site, found by its name).
PENDING, QUEUED, INDEXING, READY, FAILED = "pending", "queued", "indexing", "ready", "failed"
IN_FLIGHT = (PENDING, QUEUED, INDEXING)
MAX_EDGE = 2400  # px on the long side: a full-width hero on a 2x screen
AVIF_QUALITY = 68
CONTENT_TYPE = "image/avif"
MAX_SOURCE_BYTES = 40 * 1024 * 1024  # larger than any camera JPEG; a guard, not a product limit
SMALL_EDGE = 1200  # px on the long side: below it a photo looks soft in a large slot
# The id a coach's own photo goes by where catalog images go by their asset id
# (the composer's used-photo lists, RemoteImage.asset_id).
OWN = "own:"
_OPTIMIZED = "optimized"  # object metadata: this file is already our AVIF


def space_of(tenant) -> str:
    """This tenant's space in the service's private collection: one per tenant
    per installation, so dev and prod (one service account) never share."""
    name = re.sub(r"[^A-Za-z0-9._-]", "-", f"{settings.CONTENTOR_DOMAIN}.{tenant.schema_name}")
    if len(name) > 64:
        name = f"{name[:43]}.{hashlib.sha1(name.encode()).hexdigest()[:20]}"  # noqa: S324 - a name, not a secret
    return name


def optimize(body: bytes) -> tuple[bytes, int, int]:
    """(AVIF bytes, width, height): upright, at most MAX_EDGE on the long side.
    Raises on anything that is not a still image Pillow can read."""
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(body)) as im:
        if getattr(im, "is_animated", False):
            raise ValueError("animated image")
        im.draft("RGB", (MAX_EDGE, MAX_EDGE))  # a JPEG decodes straight to about the size needed
        profile = im.info.get("icc_profile")
        im = ImageOps.exif_transpose(im)  # the pixels upright; the EXIF (and its GPS) is left behind
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA" if "A" in im.getbands() or "transparency" in im.info else "RGB")
        im.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        im.save(out, "AVIF", quality=AVIF_QUALITY, speed=6, **({"icc_profile": profile} if profile else {}))
        return out.getvalue(), im.width, im.height


def enqueue_upload(photo) -> None:
    """A photo that just arrived through an upload endpoint: optimized and
    indexed when it is one she put in her library (`.../photo/...`), left alone
    when the key is anything else a client may register (a logo, a catalog copy)."""
    if "/photo/" in (photo.s3_key or ""):
        enqueue(photo)


def enqueue(photo) -> None:
    """Mark a just-uploaded photo as hers and start its optimize-and-index run
    once the row is committed."""
    from django.db import transaction

    from apps.core import tasks

    Photo.objects.filter(pk=photo.pk).update(index_status=PENDING)
    photo.index_status = PENDING
    tenant_id, photo_id = connection.tenant.id, str(photo.pk)
    transaction.on_commit(lambda: tasks.process_own_photo.delay(tenant_id, photo_id))


def _read(photo) -> tuple[bytes, bool]:
    """(the stored file, whether it is already our AVIF)."""
    answer = get_s3_client().get_object(Bucket=settings.AWS_BUCKET_NAME, Key=photo.s3_key)
    return answer["Body"].read(), _OPTIMIZED in (answer.get("Metadata") or {})


def process(photo) -> None:
    """Optimize the stored file in place, then hand it to the index. The key
    stays the same, so anything already pointing at the photo keeps working.
    A file that cannot be optimized is left exactly as it was uploaded."""
    client = get_s3_client()
    try:
        size = client.head_object(Bucket=settings.AWS_BUCKET_NAME, Key=photo.s3_key)["ContentLength"]
        if size > MAX_SOURCE_BYTES:
            raise ValueError(f"{size} bytes")
        body, optimized = _read(photo)
        if not optimized:
            body, width, height = optimize(body)
            client.put_object(
                Bucket=settings.AWS_BUCKET_NAME,
                Key=photo.s3_key,
                Body=body,
                ContentType=CONTENT_TYPE,
                Metadata={_OPTIMIZED: "1"},
            )
            Photo.objects.filter(pk=photo.pk).update(
                content_type=CONTENT_TYPE, file_size=len(body), width=width, height=height
            )
        # Web-ready from here on, whatever the index does.
        Photo.objects.filter(pk=photo.pk, index_status=PENDING).update(index_status=QUEUED)
    except Exception as exc:
        # Not a still image we can read (a GIF animation, an SVG, a HEIC, a
        # file that never arrived): it stays as it is and out of the index.
        logger.warning("own photo %s left as uploaded: %s", photo.pk, exc)
        Photo.objects.filter(pk=photo.pk).update(index_status=FAILED)
        return
    submit(photo, body)


def submit(photo, body: bytes | None = None) -> bool:
    """Hand the photo to the service's index. False (and still queued, for the
    next sweep) when the service cannot take it right now."""
    if not catalog.available():
        return False
    try:
        if body is None:
            body, _ = _read(photo)
        upload = catalog.private_upload(
            body,
            f"{_words(photo.title) or 'photo'}.avif",
            CONTENT_TYPE,
            space=space_of(connection.tenant),
        )
    except Exception as exc:  # the service, or storage: neither may lose her photo
        logger.warning("own photo %s not indexed yet: %s", photo.pk, exc)
        return False
    Photo.objects.filter(pk=photo.pk).update(catalog_id=upload.upload_id, index_status=INDEXING)
    photo.catalog_id, photo.index_status = upload.upload_id, INDEXING
    _apply(photo, upload)
    return True


def _apply(photo, upload) -> None:
    """Move the photo to where the service says its upload stands."""
    if upload.status == "ready":
        changes = {"index_status": READY}
        if upload.description and not photo.alt_text:
            changes["alt_text"] = upload.description[:300]
        Photo.objects.filter(pk=photo.pk).update(**changes)
    elif upload.status == "failed":
        logger.warning("own photo %s could not be indexed: %s", photo.pk, upload.failure)
        Photo.objects.filter(pk=photo.pk).update(index_status=FAILED)


def sync() -> int:
    """One pass over this tenant's photos still on their way: optimize what a
    lost job left behind, resend what the service never got, ask it about the
    rest. Returns how many are still on their way. Stops at the first failure:
    a service that is down is not asked once per photo."""
    in_flight = Photo.objects.filter(index_status__in=IN_FLIGHT)
    for photo in in_flight.order_by("created_at"):
        try:
            if photo.index_status == PENDING:
                process(photo)
            elif photo.index_status == QUEUED or not photo.catalog_id:
                if not submit(photo):
                    break
            else:
                upload = catalog.private_status(photo.catalog_id)
                if upload is None:
                    # The service no longer has it: send it again.
                    Photo.objects.filter(pk=photo.pk).update(catalog_id="", index_status=QUEUED)
                else:
                    _apply(photo, upload)
        except catalog.CuratedImageError as exc:
            logger.warning("own photos sync stopped at %s: %s", photo.pk, exc)
            break
    return in_flight.count()


def forget(photo) -> None:
    """Take a deleted photo out of the service too. Best effort: a leftover
    there is found by no one (results map back to photos that still exist)."""
    if not photo.catalog_id or not catalog.available():
        return
    try:
        catalog.private_delete(photo.catalog_id)
    except catalog.CuratedImageError as exc:
        logger.warning("own photo %s stays in the index: %s", photo.pk, exc)


# ── finding them ─────────────────────────────────────────────────────────────


def preferred() -> bool:
    """The coach said her site should show her own photos (the setup
    interview's photos question), and has some."""
    from apps.core.models import Tenant
    from apps.tenant_config import interview_brief as brief

    tenant = Tenant.objects.filter(pk=getattr(connection.tenant, "pk", None)).first()
    return bool(tenant) and brief.answers_of(tenant).get("photos") == brief.OWN_PHOTOS and has_any()


def cover(*queries: str):
    """A wide photo of hers for a course or class cover (a media.Photo), or
    None: one that no page and no other cover shows yet, best match first."""
    from apps.core.models import Tenant

    if not preferred():
        return None
    state = Tenant.objects.filter(pk=connection.tenant.pk).values_list("wizard_state", flat=True).first() or {}
    placed = {a for ids in ((state.get("site_plan") or {}).get("used_assets") or {}).values() for a in ids}
    covers = Photo.objects.filter(
        Q(courses__isnull=False)
        | Q(live_classes__isnull=False)
        | Q(live_streams__isnull=False)
        | Q(onsite_events__isnull=False)
    ).values_list("pk", flat=True)
    taken = placed | {f"{OWN}{pk}" for pk in covers}
    found = search(next((q for q in queries if q), ""), aspect="16:9", exclude=taken, limit=1)
    return photo_of(found[0].asset_id) if found else None


def own_photos():
    """Every photo the coach uploaded herself that a site can show (one that
    could not be read at all has no size and is left out)."""
    return Photo.objects.exclude(index_status="").exclude(index_status=FAILED, width__isnull=True)


def has_any() -> bool:
    return own_photos().exists()


def orientation_of(photo) -> str | None:
    if not photo.width or not photo.height:
        return None
    ratio = photo.width / photo.height
    return "landscape" if ratio > 1.1 else "portrait" if ratio < 0.9 else "square"


MIN_KEPT = 0.6  # how much of a photo a slot must still show after cropping it to its shape


def _ratio(aspect) -> float | None:
    try:
        width, height = (float(x) for x in str(aspect).split(":"))
        return width / height
    except (ValueError, ZeroDivisionError):
        return None


def _fits(photo, aspect) -> bool:
    """A slot crops a photo to its own shape. One that would lose more than
    two fifths (an upright photo in a wide banner) is left for a slot it
    suits; a photo of unknown size fits any."""
    slot = _ratio(aspect)
    if not slot or not photo.width or not photo.height:
        return True
    own = photo.width / photo.height
    return min(own, slot) / max(own, slot) >= MIN_KEPT


def _words(text: str) -> str:
    return " ".join(re.findall(r"[A-Za-z0-9]+", text or ""))[:80]


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(w) > 2}


def as_image(photo, described=None):
    """A coach's photo in the shape catalog images take, so one code path
    places both. ``described``: the service's result for it, when it has one.
    Until it is described it has no description (never a guess at what it shows)."""
    url = generate_presigned_download_url(photo.s3_key)
    return catalog.RemoteImage(
        asset_id=f"{OWN}{photo.pk}",
        title=photo.title,
        description=photo.alt_text or (described.description if described else ""),
        tags=list(described.tags) if described else [],
        width=photo.width,
        height=photo.height,
        preview_url=url,
        web_url=url,
        subject_placement=described.subject_placement if described else None,
    )


def photo_of(asset_id: str):
    """The Photo behind an ``own:<id>`` asset id, or None."""
    if not str(asset_id).startswith(OWN):
        return None
    try:
        return Photo.objects.filter(pk=str(asset_id)[len(OWN) :]).first()
    except (ValueError, TypeError, ValidationError):
        return None


def search(query: str = "", *, aspect: str | None = None, exclude=(), limit: int = 12) -> list:
    """Her photos that suit a slot of ``aspect`` ("4:5"; none = any shape),
    best first, as catalog-shaped images: the ones of the slot's own
    orientation that the service ranks for ``query`` (it has seen what they
    show), then the rest by how many words of the query their name and
    description share, the slot's orientation before a shape it would crop.
    ``exclude``: asset ids already placed. Never raises."""
    taken = {str(a) for a in exclude}
    orientation = catalog.orientation_of(aspect) if aspect else None
    candidates = [p for p in own_photos() if f"{OWN}{p.pk}" not in taken and _fits(p, aspect)]
    if not candidates:
        return []
    rest = {str(p.pk): p for p in candidates}
    found = []
    by_upload = {p.catalog_id: p for p in candidates if p.index_status == READY and p.catalog_id}
    if by_upload and catalog.available():
        try:
            ranked = catalog.private_search(query, space=space_of(connection.tenant), orientation=orientation)
        except Exception as exc:  # never the reason a page has no photo
            logger.warning("own photo search failed: %s", exc)
            ranked = []
        for upload_id, described in ranked:
            photo = by_upload.get(upload_id)
            if photo is not None and rest.pop(str(photo.pk), None) is not None:
                found.append(as_image(photo, described))
    want = _tokens(query)
    by_name = sorted(
        rest.values(),
        key=lambda p: (
            orientation is not None and orientation_of(p) not in (None, orientation),  # a crop goes last
            -len(want & _tokens(f"{p.title} {p.alt_text}")),
            p.created_at,
        ),
    )
    ranked = [*found, *(as_image(p) for p in by_name)]
    # A small photo only where nothing sharper is left (stable: the order above stands).
    ranked.sort(key=lambda i: bool(i.width and i.height and max(i.width, i.height) < SMALL_EDGE))
    return ranked[:limit]
