"""A reel's cover: the still it opens on for its first second, the coach's hook over a frame of her video in
one of four designs, in her look. The same picture is what she posts as the reel's cover.

The frames come from the video service (/frames: a couple a second, scored for a clear, sharp face turned to
the camera). A model then looks at each reel's frames, cropped as the cover shows them, and orders the best
three first: on the hub when it can open our storage's links (prod), else through the vision provider
(dev's claude CLI, or the API key); without either, the video service's own order stands. The cover itself
is a page of the site (/render/reel/<token>/cover) photographed by the browser sidecar, as the end card is.

Runs inside the tenant context (reels is a TENANT_APP).
"""

import base64
import io
import json
import logging
import uuid
from decimal import Decimal
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.db import connection
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.core.onboarding import ai_compose
from apps.core.storage import build_s3_path, generate_presigned_download_url, get_s3_client

from .models import Reel

logger = logging.getLogger(__name__)

DESIGNS = ("editorial", "bold", "poster", "series")
# The design an idea starts in, by its kind: the loud one for a laugh or a bold claim.
DEFAULT_DESIGN = {"funny": "bold", "hook": "bold", "send": "poster", "insight": "editorial"}
COUNT = 6  # frames offered per reel
PICKED = 3  # of which the model's choice, first
SECONDS = 1.0  # the cover's time at the start of the reel
CELL = (270, 480)  # a frame on the contact sheet, cropped 9:16 as the cover shows it
LOOK_SYSTEM = (
    "You choose the cover photos of short vertical videos (Instagram Reels, TikTok, YouTube Shorts). Each "
    "image is a contact sheet of numbered stills from one clip, each cropped as the cover will show it, with "
    "the clip's hook written over it later. For each sheet, give the numbers of its three best stills, best "
    "first. A good cover still shows the person's face clearly: eyes open and looking at or near the camera, "
    "an expressive, natural face (a smile, surprise, a word said with feeling), sharp and well lit, the kind "
    "of face that makes someone stop and watch. Leave out a still that is blurred, mid-blink, caught with an "
    "awkward half-open mouth, turned away, or with the face cut off."
)
_LOCAL_HOSTS = ("localhost", "127.0.0.1", "minio")


class Choice(BaseModel):
    sheet: int
    best: list[int]


class Choices(BaseModel):
    sheets: list[Choice]


def design_of(reel) -> str:
    design = (reel.cover or {}).get("design")
    return design if design in DESIGNS else DEFAULT_DESIGN.get(reel.kind, "editorial")


def frame_of(reel) -> dict | None:
    """The frame the cover is made of: the one she chose, else the best."""
    frames = reel.frames or []
    chosen = (reel.cover or {}).get("frame")
    return next((f for f in frames if f.get("key") == chosen), frames[0] if frames else None)


def label_of(reel) -> str:
    return str((reel.cover or {}).get("label") or "")


def card(reel, found_kit: dict | None = None) -> dict:
    """What a cover is drawn from, on the cover page, the editor and the idea cards (components/reels/
    reel-cover.tsx). `found_kit` (render.kit()) adds the site's name, look and colours."""
    frame = frame_of(reel)
    out = {
        "design": design_of(reel),
        "title": reel.title,
        "label": label_of(reel),
        "photo": generate_presigned_download_url(frame["key"]) if frame else "",
        "face": frame.get("face") if frame else None,
        "aspect": frame.get("aspect") if frame else None,
    }
    if found_kit is not None:
        out.update(
            name=found_kit["name"],
            look=found_kit["look"],
            colors=found_kit["colors"],
            highlight=found_kit["highlight"],
        )
    return out


def fingerprint(reel) -> list:
    """What the cover is drawn from, for render.fingerprint."""
    frame = frame_of(reel)
    return [design_of(reel), reel.title, label_of(reel), frame.get("key") if frame else ""]


def find(reel) -> list[dict]:
    """The reel's cover frames from the video service, kept in storage (its old ones deleted); quietly none
    when the service is off or fails, and the reel then opens without a cover."""
    from . import render

    if not render.available():
        return []
    try:
        res = requests.post(
            f"{settings.VIDEO_URL.rstrip('/')}/frames",
            json={"url": render.source_url(reel.video), "start": reel.start, "end": reel.end, "count": COUNT},
            timeout=600,
        )
        res.raise_for_status()
        data = res.json()
    except (requests.RequestException, ValueError) as exc:
        logger.warning("reel %s: no cover frames: %s", reel.pk, exc)
        return []
    aspect = round(data["width"] / data["height"], 4) if data.get("width") and data.get("height") else None
    client = get_s3_client()
    found = []
    for still in data.get("frames") or []:
        try:
            body = base64.b64decode(still["image"], validate=True)
        except (KeyError, TypeError, ValueError):
            continue
        key = build_s3_path("reels/frames", f"{reel.pk}-{uuid.uuid4().hex[:8]}.jpg")
        client.put_object(Bucket=settings.AWS_BUCKET_NAME, Key=key, Body=body, ContentType="image/jpeg")
        at = round(reel.start + float(still.get("t") or 0), 3)
        found.append({"at": at, "key": key, "face": still.get("face"), "aspect": aspect, "pick": False})
    old = [f.get("key") for f in reel.frames or [] if f.get("key")]
    Reel.objects.filter(pk=reel.pk).update(frames=found)
    reel.frames = found
    for key in old:
        render.forget(key)
    return found


def _crop(image, face, aspect=9 / 16):
    """The 9:16 window of the frame the cover shows: around the face, else the middle."""
    width, height = image.size
    if width / height > aspect:
        w = round(height * aspect)
        centre = (face[0] + face[2] / 2) * width if face else width / 2
        left = min(max(0, round(centre - w / 2)), width - w)
        return image.crop((left, 0, left + w, height))
    h = round(width / aspect)
    centre = (face[1] + face[3] / 2) * height if face else height / 2
    top = min(max(0, round(centre - h / 2)), height - h)
    return image.crop((0, top, width, top + h))


def sheet(reel) -> bytes:
    """The reel's frames side by side, numbered from 1, each cropped as the cover shows it: one JPEG."""
    from PIL import Image, ImageDraw, ImageFont

    frames = (reel.frames or [])[:COUNT]
    columns = 3
    rows = -(-len(frames) // columns)
    out = Image.new("RGB", (CELL[0] * columns, CELL[1] * rows), "white")
    font = ImageFont.load_default(size=40)
    client = get_s3_client()
    for i, frame in enumerate(frames):
        body = client.get_object(Bucket=settings.AWS_BUCKET_NAME, Key=frame["key"])["Body"].read()
        with Image.open(io.BytesIO(body)) as im:
            cell = _crop(im.convert("RGB"), frame.get("face")).resize(CELL)
        x, y = (i % columns) * CELL[0], (i // columns) * CELL[1]
        out.paste(cell, (x, y))
        draw = ImageDraw.Draw(out)
        draw.rounded_rectangle((x + 10, y + 10, x + 66, y + 66), radius=12, fill="black")
        draw.text((x + 38, y + 38), str(i + 1), fill="white", font=font, anchor="mm")
    buffer = io.BytesIO()
    out.save(buffer, "JPEG", quality=85)
    return buffer.getvalue()


def _reachable(url: str) -> bool:
    """Whether the hub, on its own machine, can open a storage link (dev's storage is the Mac's localhost)."""
    host = urlparse(url).hostname or ""
    return host not in _LOCAL_HOSTS and not host.endswith(".localhost")


def _ask_hub(sheets: list[bytes], label: str) -> Choices | None:
    """The model's choice on the hub, which downloads the sheets from storage; None when it can't open them."""
    client, keys = get_s3_client(), []
    try:
        for body in sheets:
            key = build_s3_path("reels/sheets", f"{uuid.uuid4().hex}.jpg")
            client.put_object(Bucket=settings.AWS_BUCKET_NAME, Key=key, Body=body, ContentType="image/jpeg")
            keys.append(key)
        urls = [generate_presigned_download_url(key, expiry=900) for key in keys]
        if not all(url and _reachable(url) for url in urls):
            return None
        parsed, _cost, _model = core_ai.agentc_look(
            system=LOOK_SYSTEM,
            user=json.dumps({"sheets": len(sheets), "note": "Image N is sheet N."}),
            urls=urls,
            output_model=Choices,
            label=label,
            timeout_seconds=300,
        )
        return parsed
    finally:
        from . import render

        for key in keys:
            render.forget(key)


def _ask_vision(sheets: list[bytes]) -> Choices:
    content = [{"type": "text", "text": json.dumps({"sheets": len(sheets), "note": "Image N is sheet N."})}]
    content += [
        {
            "type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(b).decode()},
        }
        for b in sheets
    ]
    cost = Decimal("0")
    try:
        parsed, cost, _model = core_ai.structured_messages(
            system=LOOK_SYSTEM,
            messages=[{"role": "user", "content": content}],
            output_model=Choices,
            model=settings.COPILOT_MODEL,
            max_tokens=4000,
            effort="low",
            timeout_seconds=240,
        )
    except core_ai.AiError as exc:
        cost = exc.cost_usd
        raise
    finally:
        ai_compose.record_spend(connection.schema_name, cost)
    return parsed


def judge(reels, background: bool = False) -> None:
    """Each reel's frames ordered by a model that looked at them, its three best first (marked "pick"); left
    in the video service's order when no model can look. One call for all of them."""
    reels = [r for r in reels if len(r.frames or []) > 1]
    if not reels:
        return
    label = "contentor:reels-ahead-covers" if background else "contentor:reels-covers"
    try:
        sheets = [sheet(r) for r in reels]
        choices = None
        if settings.AI_PROVIDER == "agentc" and ai_compose.compose_available():
            choices = _ask_hub(sheets, label)
        if choices is None and core_ai.vision_provider():
            choices = _ask_vision(sheets)
    except Exception as exc:  # never the reason ideas can't be made: the video service's order stands
        logger.warning("reels: no model chose cover frames: %s", exc)
        return
    if choices is None:
        return
    for choice in choices.sheets:
        if not 1 <= choice.sheet <= len(reels):
            continue
        reel = reels[choice.sheet - 1]
        frames = (reel.frames or [])[:COUNT]
        best = list(dict.fromkeys(n - 1 for n in choice.best if 1 <= n <= len(frames)))[:PICKED]
        ordered = [{**frames[i], "pick": True} for i in best]
        ordered += [{**f, "pick": False} for i, f in enumerate(frames) if i not in best]
        Reel.objects.filter(pk=reel.pk).update(frames=ordered)
        reel.frames = ordered
