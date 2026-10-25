"""Edits of one of her photos: the colours it is made of, its background removed, or the photo extended,
cleaned up or changed by the image model.

An edit never changes the photo it starts from. It makes a new photo in her Media, one of her own photos
(made light and indexed like an upload, apps.media.own_photos), and the studio puts that one on the cover,
where Undo takes it off again.

Edits run as Celery jobs the studio follows, as it follows a new photo from the library service
(apps.core.curated_images.views): a job's state is kept in the cache under its id, with the schema that
started it, so a tenant can only follow its own. The background remover is our own service on the home
servers (rembg, infra/cutout, settings.CUTOUT_URL) and costs nothing per photo; the image model
(settings.GEMINI_API_KEY, the key the logo marks use) bills each edit, so each one counts against the month's
new photos.

Runs inside the tenant context (media is a TENANT_APP).
"""

import base64
import io
import logging
import uuid

import requests
from django.conf import settings
from django.core.cache import cache
from django.db import connection

from apps.core.storage import build_s3_path, get_s3_client

from . import own_photos
from .models import Photo

logger = logging.getLogger(__name__)

JOB_TTL = 3600
COLOURS_TTL = 30 * 86400
MAX_COLOURS = 6
INSTRUCTION_MAX = 200
CUTOUT, EXPAND, ERASE, CHANGE = "cutout", "expand", "erase", "change"
MODEL_EDITS = (EXPAND, ERASE, CHANGE)

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_MODEL_TIMEOUT = 120
_CUTOUT_TIMEOUT = 120
# The shapes the image model draws in (its imageConfig.aspectRatio), by width over height.
_ASPECTS = {
    "1:1": 1,
    "2:3": 2 / 3,
    "3:2": 3 / 2,
    "3:4": 3 / 4,
    "4:3": 4 / 3,
    "4:5": 4 / 5,
    "5:4": 5 / 4,
    "9:16": 9 / 16,
    "16:9": 16 / 9,
    "21:9": 21 / 9,
}
# Said with every edit: the model may change what she asked for, and nothing else, and never adds words.
_KEEP = (
    " Keep everything else exactly as it is: the people, their faces and bodies, the light, the colours and"
    " the framing. Photorealistic. No text, no letters, no logos, no watermark."
)
_PROMPTS = {
    EXPAND: "Extend this photograph outward so that it fills the whole frame, continuing the scene naturally"
    " beyond its edges, as if the camera had seen more of it.",
    ERASE: "Take this out of the photograph: {words}. Fill the space it leaves so that it looks as if it was"
    " never there.",
    CHANGE: "Edit this photograph: {words}.",
}


class EditError(Exception):
    """Why an edit could not be made, in words safe to show her."""


def ai_available() -> bool:
    return bool(settings.GEMINI_API_KEY)


def cutout_available() -> bool:
    return bool(settings.CUTOUT_URL)


CUTOUTS_PER_HOUR = 60  # the remover is one CPU service for every site: one site may not fill its hours


def take_cutout() -> bool:
    """Count one background removal for this site this hour; False once it has had CUTOUTS_PER_HOUR."""
    key = f"photo-edits:cutouts:{connection.schema_name}"
    cache.add(key, 0, timeout=3600)
    try:
        return cache.incr(key) <= CUTOUTS_PER_HOUR
    except ValueError:  # the hour ran out between the two calls
        return True


# --- what a photo is made of ------------------------------------------------


def _read(photo) -> bytes:
    answer = get_s3_client().get_object(Bucket=settings.AWS_BUCKET_NAME, Key=photo.s3_key)
    return answer["Body"].read()


def _hex(rgb) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb[:3])


def colours_of(body: bytes) -> list[str]:
    """The colours a picture is made of, most of it first, as #rrggbb: what the studio offers beside her
    look's palette. Near twins are left out, and so is what is see-through (a cutout's background)."""
    from PIL import Image

    with Image.open(io.BytesIO(body)) as im:
        im.thumbnail((96, 96))
        rgba = im.convert("RGBA")
    # the see-through part of a cutout is no colour of the photo
    pixels = [p[:3] for p in rgba.getdata() if p[3] > 128]
    if not pixels:
        return []
    sample = Image.new("RGB", (len(pixels), 1))
    sample.putdata(pixels)
    quantized = sample.quantize(colors=12, method=Image.Quantize.MEDIANCUT)
    palette = quantized.getpalette() or []
    counts = sorted(quantized.getcolors() or [], reverse=True)
    picked: list[tuple[int, int, int]] = []
    for _count, index in counts:
        rgb = tuple(palette[index * 3 : index * 3 + 3])
        if len(rgb) == 3 and all(sum((a - b) ** 2 for a, b in zip(rgb, kept, strict=True)) > 900 for kept in picked):
            picked.append(rgb)
        if len(picked) == MAX_COLOURS:
            break
    return [_hex(rgb) for rgb in picked]


def colours(photo) -> list[str]:
    """`colours_of` her photo, read once and kept (a photo never changes its pixels: an edit is a new one)."""
    key = f"photo-colours:{connection.schema_name}:{photo.pk}"
    found = cache.get(key)
    if found is None:
        try:
            found = colours_of(_read(photo))
        except Exception as exc:  # unreadable, or storage is away: no colours, never an error
            logger.warning("photo %s colours not read: %s", photo.pk, exc)
            return []
        cache.set(key, found, COLOURS_TTL)
    return found


# --- jobs ------------------------------------------------------------------


def _job_key(job_id: str) -> str:
    return f"photo-edits:job:{job_id}"


def job(job_id: str) -> dict | None:
    """A job of this tenant's: its state ("running", "done" or "failed") and, once done, its photo's id."""
    state = cache.get(_job_key(job_id))
    return state if state and state.get("schema") == connection.schema_name else None


def _set(job_id: str, **state) -> None:
    cache.set(_job_key(job_id), {"schema": connection.schema_name, **state}, JOB_TTL)


def fail(job_id: str) -> None:
    """The job could not even begin (its photo was deleted meanwhile)."""
    _set(job_id, status="failed")


def start(photo, kind: str, *, aspect: float | None = None, words: str = "") -> str:
    """Queue an edit of `photo` and return its job id."""
    from apps.core import tasks

    job_id = uuid.uuid4().hex
    _set(job_id, status="running")
    tasks.edit_photo.delay(connection.tenant.id, job_id, str(photo.pk), kind, aspect, words)
    return job_id


def run(job_id: str, photo, kind: str, aspect: float | None, words: str) -> None:
    """Make the edit (in the job's worker) and record how it ended."""
    try:
        body = _read(photo)
        made = _cutout(body) if kind == CUTOUT else _model_edit(body, photo, kind, aspect, words)
        new = _store(photo, made, kind)
    except Exception as exc:  # whatever went wrong, she is told it did not work, and can try again
        logger.warning("photo %s edit %s failed: %s", photo.pk, kind, exc)
        _set(job_id, status="failed")
        return
    _set(job_id, status="done", photo=str(new.pk))


_SUFFIX = {CUTOUT: "no background", EXPAND: "extended", ERASE: "cleaned up", CHANGE: "changed"}


def _store(source, body: bytes, kind: str):
    """The edit as a new photo of hers, beside the one it came from."""
    from PIL import Image

    from apps.core.platform.uploads import _store_object

    with Image.open(io.BytesIO(body)) as im:
        width, height = im.size
        mime = Image.MIME.get(im.format or "", "image/png")
    key = build_s3_path("photo", f"{uuid.uuid4().hex}.{'png' if mime == 'image/png' else 'jpg'}")
    _store_object(key, io.BytesIO(body), mime)
    title = f"{source.title or 'Photo'} ({_SUFFIX[kind]})"[:200]
    photo = Photo.objects.create(
        s3_key=key,
        title=title,
        alt_text=source.alt_text,
        content_type=mime,
        file_size=len(body),
        width=width,
        height=height,
    )
    # one of her own photos from here on: made light (a cutout keeps its see-through background) and indexed
    own_photos.enqueue(photo)
    return photo


# --- the background remover --------------------------------------------------


CUTOUT_EDGE = 1600  # px on the long side: more than a cover shows, and the model works at 1024


def _cutout(body: bytes) -> bytes:
    """Her photo with its background removed, as a PNG that is see-through around the subject. It is sent
    at CUTOUT_EDGE at most: the cutout is drawn and kept at that size, and a full-size photo would hold
    the service's memory for nothing."""
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(body)) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((CUTOUT_EDGE, CUTOUT_EDGE))
        sent = io.BytesIO()
        im.save(sent, "JPEG", quality=95)
    res = requests.post(
        f"{settings.CUTOUT_URL.rstrip('/')}/remove",
        data=sent.getvalue(),
        headers={"Content-Type": "application/octet-stream"},
        timeout=_CUTOUT_TIMEOUT,
    )
    res.raise_for_status()
    if not res.content.startswith(b"\x89PNG"):
        raise EditError("the background remover sent no picture")
    return trimmed(res.content)


SOLID = 128  # the alpha from which a pixel is the subject's, for trimming: below it are edges and specks


def trimmed(png: bytes) -> bytes:
    """The cutout without the see-through margin around its subject (a person beside a desk leaves half the
    photo empty), so the subject fills the frame a cover stands it in. The box is the subject's solid part
    with a margin for its soft edge: a faint speck the model left far away would otherwise keep the whole
    margin. Nothing solid left is an error."""
    from PIL import Image

    with Image.open(io.BytesIO(png)) as im:
        im = im.convert("RGBA")
        box = im.getchannel("A").point(lambda v: 255 if v >= SOLID else 0).getbbox()
        if box is None:
            raise EditError("the background remover found nothing in the photo")
        pad = round(0.02 * max(im.size))
        left, top, right, bottom = box
        box = (max(0, left - pad), max(0, top - pad), min(im.width, right + pad), min(im.height, bottom + pad))
        out = io.BytesIO()
        im.crop(box).save(out, "PNG")
        return out.getvalue()


# --- the image model ---------------------------------------------------------


def nearest_aspect(ratio: float) -> str:
    """The image model's shape nearest a width over height (a frame twice as wide is as far as one half as
    wide)."""
    import math

    return min(_ASPECTS, key=lambda name: abs(math.log(ratio / _ASPECTS[name])))


def _model_edit(body: bytes, photo, kind: str, aspect: float | None, words: str) -> bytes:
    """The photo as the image model edits it: grown to `aspect`, or with `words` taken out or changed. The
    other edits keep the photo's own shape."""
    from PIL import Image

    with Image.open(io.BytesIO(body)) as im:
        own = im.width / im.height
        # The model reads PNG and JPEG; her photos are AVIF once they are made light. A cutout's see-through
        # background goes white (as JPEG it would be black).
        if "A" in im.getbands():
            ground = Image.new("RGB", im.size, (255, 255, 255))
            ground.paste(im, mask=im.getchannel("A"))
            im = ground
        out = io.BytesIO()
        im.convert("RGB").save(out, "JPEG", quality=92)
    shape = nearest_aspect(aspect if kind == EXPAND and aspect else own)
    prompt = _PROMPTS[kind].format(words=words.strip()[:INSTRUCTION_MAX]) + _KEEP
    response = requests.post(
        _ENDPOINT.format(model=settings.PHOTO_EDIT_MODEL),
        headers={"x-goog-api-key": settings.GEMINI_API_KEY},
        json={
            "contents": [
                {
                    "parts": [
                        {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(out.getvalue()).decode()}},
                        {"text": prompt},
                    ]
                }
            ],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {"aspectRatio": shape, "imageSize": settings.PHOTO_EDIT_SIZE},
            },
        },
        timeout=_MODEL_TIMEOUT,
    )
    response.raise_for_status()
    payload = response.json()
    for part in ((payload.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []:
        data = (part.get("inlineData") or {}).get("data")
        if data:
            return base64.b64decode(data)
    reason = (payload.get("candidates") or [{}])[0].get("finishReason") or payload.get("promptFeedback")
    raise EditError(f"the image model made no picture ({reason})")
