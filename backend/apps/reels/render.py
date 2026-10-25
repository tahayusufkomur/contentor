"""A reel made into a file: the job the video service renders (infra/video/graph.py) and what is kept of it.

The captions and title are an ASS file (ass.py) in the look's fonts (fonts.py); the end card is a page of the
coach's site photographed by the browser sidecar, as the photo studio's downloads are
(apps.media.design_export); cutaways are photos from the site's storage, the coach's own first.

Runs inside the tenant context (reels is a TENANT_APP).
"""

import base64
import hashlib
import io
import json
import logging
import uuid

import requests
from django.conf import settings
from django.core import signing
from django.db import connection

from apps.core.storage import build_s3_path, generate_presigned_download_url, get_s3_client, sign_if_s3_key

from . import ass, fonts, framing, moments
from . import words as w
from .models import Reel

logger = logging.getLogger(__name__)

OPTIONS = {
    "cuts": True,  # pauses cut out
    "title": True,  # the hook over the clip
    "progress": True,  # a bar along the bottom
    "end_card": True,  # the site, its QR code and a line, for the last seconds
    "clean_audio": True,  # denoised and evened out
    "cutaways": False,  # a photo over the clip for a moment, for each photo idea
    "language": "",  # captions translated into this language ("" = as spoken)
    "end_text": "",  # the end card's line ("" = END_LINES in the captions' language)
}
END_LINES = {
    "en": "More on my site",
    "de": "Mehr auf meiner Website",
    "es": "Más en mi web",
    "fr": "La suite sur mon site",
    "it": "Di più sul mio sito",
    "nl": "Meer op mijn site",
    "pl": "Więcej na mojej stronie",
    "pt": "Mais no meu site",
    "tr": "Devamı sitemde",
}
END_SECONDS = 2.5
CUTAWAY_SECONDS = 2.5
SOURCE_SECONDS = 6 * 3600  # the video service's link to the video
RENDER_TIMEOUT = 30 * 60
_SALT = "contentor.reel-render"
TOKEN_AGE = 120


class RenderError(Exception):
    """The video service could not make the reel."""


def available() -> bool:
    return bool(settings.VIDEO_URL)


def options_of(reel) -> dict:
    return {**OPTIONS, **{k: v for k, v in (reel.options or {}).items() if k in OPTIONS}}


def kit() -> dict:
    """What reels are drawn with: the look's colours and fonts, the colour words light up in, and the site's
    name, address and logo for the end card."""
    from apps.email_campaigns import brand
    from apps.tenant_config import sections
    from apps.tenant_config.models import TenantConfig

    cfg = TenantConfig.objects.select_related("logo").first()
    style_id = cfg.style if cfg and sections.style(cfg.style) else sections.default_style()
    palette = cfg.palette if cfg and cfg.palette else ""
    found = brand.kit(connection.tenant, cfg)
    # A signed storage link, not one on the site: the browser sidecar reaches the site over plain http only
    # (TLS ends at Cloudflare), and an https picture of it would not load on the end card.
    logo = ""
    if cfg and cfg.logo and cfg.logo.s3_key:
        logo = generate_presigned_download_url(cfg.logo.s3_key)
    elif cfg and cfg.logo_url:
        logo = sign_if_s3_key(cfg.logo_url) or ""
    return {
        "colors": found["colors"],
        "highlight": ass.highlight(found["colors"]),
        "look": f"{style_id}:{palette}" if palette else style_id,
        "fonts": {k: v for k, v in ((sections.style(style_id) or {}).get("fonts") or {}).items() if k != "googleQuery"},
        "name": found["name"],
        "site": found["site"],
        "host": found["host"],
        "logo": logo,
        "language": found["language"],
    }


def source_url(video) -> str:
    """A link the video service reads the video from: the storage's own address (inside Docker in dev)."""
    return get_s3_client().generate_presigned_url(
        "get_object", Params={"Bucket": settings.AWS_BUCKET_NAME, "Key": video.s3_key}, ExpiresIn=SOURCE_SECONDS
    )


def spans(reel, words) -> list[list[float]]:
    return w.keep(words, reel.start, reel.end, options_of(reel)["cuts"])


def translation_key(reel) -> str:
    """What a translation's timing depends on: trimming the reel or cutting its pauses makes it stale."""
    raw = f"{reel.video.s3_key}:{reel.start}:{reel.end}:{options_of(reel)['cuts']}"
    return hashlib.sha1(raw.encode(), usedforsecurity=False).hexdigest()[:12]


def phrases(reel) -> list[dict] | None:
    """The reel's translated captions, if it is set to a language and they are up to date."""
    language = options_of(reel)["language"]
    found = reel.translation or {}
    if not language or found.get("language") != language or found.get("of") != translation_key(reel):
        return None
    return found.get("groups") or []


PHRASE = 34  # characters of a translated sentence on screen at once


def sentence_runs(reel_words) -> list[list]:
    """The words by sentence, a long run without a full stop cut every 16 words or at a pause."""
    runs, current = [], []
    for word in reel_words:
        if current and (w.ends_sentence(current[-1][2]) or len(current) >= 16 or word[0] - current[-1][1] >= 1.0):
            runs.append(current)
            current = []
        current.append(word)
    return [*runs, current] if current else runs


def phrases_of(text: str, start: float, end: float) -> list[dict]:
    """A translated sentence shown a phrase at a time over the sentence's own time, each phrase on screen for
    its share of the characters. Phrases are of about even length: no lone last word."""
    count = max(1, -(-len(text) // PHRASE))
    target = len(text) / count + 4
    parts, current = [], []
    for word in text.split():
        if current and len(parts) < count - 1 and len(" ".join([*current, word])) > target:
            parts.append(" ".join(current))
            current = []
        current.append(word)
    if current:
        parts.append(" ".join(current))
    total, at, out = sum(len(p) for p in parts) or 1, start, []
    for part in parts:
        until = at + (end - start) * len(part) / total
        out.append({"start": round(at, 3), "end": round(until, 3), "text": part})
        at = until
    return out


def translate(reel) -> dict:
    """The reel's captions translated into its language, a sentence at a time (a translation needs the whole
    thought) shown a phrase at a time, on the reel's clock. Raises moments.TranslationError."""
    language = options_of(reel)["language"]
    words = w.words_of(reel.video)
    runs = sentence_runs(w.reel_words(words, reel.start, reel.end, spans(reel, words)))
    lines = moments.translate([w.text_of(run) for run in runs], language)
    groups = []
    for i, (run, line) in enumerate(zip(runs, lines, strict=True)):
        end = run[-1][1] + ass.HOLD
        if i + 1 < len(runs):
            end = min(end, runs[i + 1][0][0])
        groups += phrases_of(line, run[0][0], end)
    return {"language": language, "groups": groups, "of": translation_key(reel)}


def fingerprint(reel) -> str:
    """Everything a render is drawn from: a reel whose fingerprint has moved since is stale."""
    opts = options_of(reel)
    data = [
        reel.video.s3_key,
        reel.start,
        reel.end,
        reel.title if opts["title"] else "",
        reel.style,
        framing.frame_of(reel),
        opts,
        phrases(reel),
        reel.cutaways if opts["cutaways"] else [],
    ]
    return hashlib.sha1(json.dumps(data, sort_keys=True, default=str).encode(), usedforsecurity=False).hexdigest()


# --- the end card -------------------------------------------------------------------------------------


def token_for(reel) -> str:
    return signing.dumps({"r": str(reel.pk), "t": connection.schema_name}, salt=_SALT)


def read_token(token: str) -> str | None:
    """The reel id of a token this site signed in the last two minutes, or None."""
    try:
        data = signing.loads(token, salt=_SALT, max_age=TOKEN_AGE)
    except signing.BadSignature:
        return None
    if not isinstance(data, dict) or data.get("t") != connection.schema_name:
        return None
    return str(data.get("r"))


def end_card_of(reel, found_kit=None) -> dict:
    """What the end card shows: the site's name, address (and its QR code) and a line."""
    found_kit = found_kit or kit()
    opts = options_of(reel)
    language = (opts["language"] or reel.video.captions_language or found_kit["language"] or "en")[:2]
    return {
        "look": found_kit["look"],
        "colors": found_kit["colors"],
        "name": found_kit["name"],
        "site": found_kit["site"],
        "host": found_kit["host"],
        "logo": found_kit["logo"],
        "line": opts["end_text"].strip()[:80] or END_LINES.get(language, END_LINES["en"]),
    }


def end_card(reel) -> str | None:
    """The end card as a base64 PNG, 1080x1920; None when the browser sidecar is off or could not draw it
    (the reel then simply ends)."""
    from apps.media import design_export

    if not design_export.available():
        return None
    host = connection.tenant.domains.order_by("-is_primary").values_list("domain", flat=True).first()
    try:
        res = requests.post(
            f"{settings.SITE_QA_BROWSER_URL.rstrip('/')}/render",
            json={
                "url": f"http://{host}/render/reel/{token_for(reel)}",
                "width": 1080,
                "format": "png",
                "selector": "[data-render-reel]",
            },
            timeout=60,
        )
        res.raise_for_status()
        return res.json()["image"]
    except (requests.RequestException, KeyError, ValueError) as exc:
        logger.warning("reel %s: no end card: %s", reel.pk, exc)
        return None


# --- cutaways -----------------------------------------------------------------------------------------


def find_photos(reel) -> list[dict]:
    """A photo for each of the reel's photo ideas inside its stretch: one of the coach's own when they prefer
    those and one matches, else the catalog's (copied into the site's storage). [{"at", "photo"}]"""
    from apps.core.curated_images import cache as curated
    from apps.core.curated_images import client
    from apps.media import own_photos

    found = []
    for idea in (reel.ideas or [])[:2]:
        at, query = idea.get("at"), str(idea.get("query") or "").strip()
        if not query or not isinstance(at, int | float) or not reel.start <= at < reel.end:
            continue
        photo = None
        try:
            if own_photos.preferred():
                hits = own_photos.search(query, aspect="9:16", limit=1)
                photo = own_photos.photo_of(hits[0].asset_id) if hits else None
            if photo is None:
                hits = client.search(query, orientation="portrait").results
                photo = curated.cache_remote_image(hits[0]) if hits else None
        except Exception:  # never the reason a reel can't be made: it goes without that photo
            logger.exception("reel %s: no photo for %r", reel.pk, query)
        if photo is not None:
            found.append({"at": at, "photo": str(photo.pk)})
    return found


def _jpeg(photo) -> str:
    """The photo as a base64 JPEG big enough to fill the frame (the coach's own photos are AVIF)."""
    from PIL import Image, ImageOps

    body = get_s3_client().get_object(Bucket=settings.AWS_BUCKET_NAME, Key=photo.s3_key)["Body"].read()
    with Image.open(io.BytesIO(body)) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((2400, 2400))
        out = io.BytesIO()
        im.save(out, "JPEG", quality=88)
    return base64.b64encode(out.getvalue()).decode()


def cutaways_on_reel(reel, kept) -> list[dict]:
    """The reel's cutaways on its own clock: [{"photo", "start", "end"}], none in its last seconds."""
    length = w.length_of(kept)
    out = []
    for cut in reel.cutaways or []:
        at = w.on_reel(cut.get("at", -1), reel.start, kept)
        if at is None or length < CUTAWAY_SECONDS + 1:
            continue
        at = min(at, round(length - CUTAWAY_SECONDS - 0.5, 3))
        out.append({"photo": cut.get("photo"), "start": max(0.0, at), "end": round(max(0.0, at) + CUTAWAY_SECONDS, 3)})
    return out


# --- the render ---------------------------------------------------------------------------------------


def job_for(reel, upload: str) -> dict:
    from apps.media.models import Photo

    video, opts = reel.video, options_of(reel)
    words = w.words_of(video)
    kept = spans(reel, words)
    frame, found_kit = framing.frame_of(reel), kit()
    translated = phrases(reel)
    captions = ass.build(
        words=w.reel_words(words, reel.start, reel.end, kept),
        length=w.length_of(kept),
        style=reel.style,
        colors=found_kit["colors"],
        language=opts["language"] if translated is not None else video.captions_language,
        title=reel.title if opts["title"] else "",
        layout=frame["layout"],
        phrases=translated,
    )
    cuts = []
    if opts["cutaways"]:
        placed = cutaways_on_reel(reel, kept)
        photos = {str(p.pk): p for p in Photo.objects.filter(pk__in=[c["photo"] for c in placed if c["photo"]])}
        cuts = [
            {"image": _jpeg(photos[c["photo"]]), "start": c["start"], "end": c["end"]}
            for c in placed
            if c["photo"] in photos
        ]
    return {
        "source": source_url(video),
        "start": reel.start,
        "end": reel.end,
        "keep": kept,
        "layout": frame["layout"],
        "crop": frame["keys"],
        "captions": captions,
        "fonts": fonts.files(reel.style, found_kit["fonts"]),
        "cutaways": cuts,
        "progress": found_kit["highlight"] if opts["progress"] else None,
        "end_card": end_card(reel) if opts["end_card"] else None,
        "end_seconds": END_SECONDS,
        "clean_audio": opts["clean_audio"],
        "upload": upload,
    }


def run(reel) -> None:
    """Make the reel's file (in the video worker) and keep it, or record that it could not be made."""
    key = build_s3_path("reels", f"{reel.pk}-{uuid.uuid4().hex[:8]}.mp4")
    upload = get_s3_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.AWS_BUCKET_NAME, "Key": key, "ContentType": "video/mp4"},
        ExpiresIn=3600,
    )
    try:
        stamp = fingerprint(reel)
        res = requests.post(
            f"{settings.VIDEO_URL.rstrip('/')}/render", json=job_for(reel, upload), timeout=RENDER_TIMEOUT
        )
        if res.status_code != 200:
            raise RenderError(f"{res.status_code}: {res.text[:500]}")
        made = res.json()
    except Exception as exc:  # whatever went wrong, the coach is told it did not work and can try again
        logger.warning("reel %s could not be rendered: %s", reel.pk, exc)
        Reel.objects.filter(pk=reel.pk).update(status=Reel.FAILED, error="The video could not be made. Try again.")
        return
    old = reel.file_key
    Reel.objects.filter(pk=reel.pk).update(
        status=Reel.READY,
        error="",
        file_key=key,
        file_size=int(made.get("size") or 0),
        duration=float(made.get("duration") or 0),
        rendered=stamp,
    )
    if old and old != key:
        forget(old)


def forget(key: str) -> None:
    """A reel's old file deleted from storage, quietly (a leftover file costs only space)."""
    try:
        get_s3_client().delete_object(Bucket=settings.AWS_BUCKET_NAME, Key=key)
    except Exception as exc:  # noqa: BLE001 (best effort)
        logger.warning("reel file %s not deleted: %s", key, exc)
