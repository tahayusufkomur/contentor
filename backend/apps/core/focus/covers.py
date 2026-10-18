"""The covers job (spec §5.2): once the outline is written, the Designer drafts
four cover styles, design recipes ``CoverArt`` draws (no image file), all on
one photo: hers first, else the top library match copied into her Media. Each
round is appended to ``FocusCreation.covers``; "Four more styles" is another
round on the same photo. When the model fails, code draws four fixed styles,
so she always has covers to pick from. A copilot run on the agents worker."""

import json
import logging
from typing import Literal

from django.conf import settings
from django.db import transaction
from pydantic import BaseModel

from apps.core import ai as core_ai
from apps.core.copilot import runs
from apps.core.curated_images import cache, client
from apps.core.onboarding import ai_compose
from apps.core.onboarding.ai_curate import CoachBrief, photo_query
from apps.core.storage import generate_presigned_download_url
from apps.media import designs, own_photos
from apps.media.design_recipe import LAYOUTS, validate_recipe
from apps.media.models import Design
from apps.tenant_config.models import CopilotRun, FocusCreation

from . import jobs

logger = logging.getLogger(__name__)

STEP = {"specialist": "designer", "label": "Drafting covers"}
COUNT = 4
SUBTITLE_MAX = 60
NO_PHOTO = ("title",)  # layouts that draw no photo
# Round n falls back to FALLBACK[n % 2] (n from 0), in the primary panel, the display font, no subtitle.
FALLBACK = (("full", "panel", "title", "band"), ("framed", "photo", "panel", "full"))
SYSTEM = (
    "You are the designer drafting four covers for an online course, each in its own layout. Layouts: "
    "'full' (the photo fills the cover, the title over it), 'panel' (the photo beside a colour panel with "
    "the title), 'title' (the title alone on colour, no photo), 'band' (a colour band across the photo), "
    "'framed' (the photo in a frame on colour), 'photo' (the photo above, the title below). Give four "
    "styles with four different layouts, and vary the panel colour and the type (display or body font, "
    "upper case or not) so each one looks distinct. Avoid the 'earlier_layouts' where you can. The "
    f"subtitle is at most {SUBTITLE_MAX} characters, taken from the course description or outline "
    "word for word or shortened, or empty; never invent a claim, a result or a number. photo_query: "
    "two to five plain words for what the shared photo should show."
)


class CoverStyle(BaseModel):
    layout: Literal[LAYOUTS]
    panel: Literal["primary", "accent", "ink", "paper", "primary-dark", "accent-dark"]
    title_font: Literal["display", "body"]
    upper: bool
    subtitle: str


class CoverPlan(BaseModel):
    photo_query: str
    styles: list[CoverStyle]


def start(creation, *, ahead: bool) -> CopilotRun:
    """A queued covers run (a new round). ``ahead``: she is not waiting on it
    yet. Call on the locked creation, inside the writing transaction."""
    return jobs.queue(creation, "covers", specialist="designer", ahead=ahead)


def carry_out(tenant, run_id) -> None:
    from apps.courses.models import Course

    request = CopilotRun.objects.get(pk=run_id).request or {}
    creation = FocusCreation.objects.get(pk=request.get("focus"))
    course = Course.objects.filter(pk=creation.record_id).first()
    if course is None:  # deleted meanwhile: nothing to draw for
        runs.finish(run_id, True, {"text": "Drew no covers."})
        return
    runs.emit(run_id, "step", {**STEP, "state": "start"})
    rounds = (creation.covers or {}).get("rounds") or []
    shown = [recipe["layout"] for round_ in rounds for recipe in round_]
    label = "contentor:focus-ahead" if request.get("ahead") else "contentor:copilot"
    try:
        styles, query = _plan(tenant, creation, course, shown, label)
    except core_ai.AiError:
        logger.warning("focus covers: model failed, using the fixed styles schema=%s", tenant.schema_name)
        styles, query = [], photo_query(CoachBrief.from_tenant(tenant), course.title)
    styles = _four(styles, len(rounds))
    picked = None if rounds else pick_photo(query)  # the first round only: one copy into her Media
    with transaction.atomic():
        if not jobs.active(run_id):  # Stop won while the model drew
            return
        locked = FocusCreation.objects.select_for_update().get(pk=creation.pk)
        current = locked.covers or {}
        if current.get("rounds"):  # later rounds keep the photo as it is now (she may have changed it)
            photo_id, query = current.get("photo"), current.get("query", query)
            photo_id = photo_id if photo_id and designs._photo_exists(photo_id) else None
        else:
            photo_id = str(picked.pk) if picked else None
        recipes = [recipe_for(style, photo_id) for style in styles]
        locked.covers = {
            **current,
            "photo": photo_id,
            "rounds": [*(current.get("rounds") or []), recipes],
            "query": query,
        }
        locked.save(update_fields=["covers", "updated_at"])
    runs.emit(run_id, "step", {**STEP, "state": "done"})
    runs.finish(run_id, True, {"text": "Drew four covers."})


def _plan(tenant, creation, course, shown: list, label: str) -> tuple[list, str]:
    if not ai_compose.compose_available():
        raise core_ai.AiError("ai_unavailable")
    look, _logo = designs.site_look({})
    turn = {
        "course": course.title,
        "description": course.description,
        "level": (creation.answers or {}).get("level", ""),
        "look": look,
        "notes": (creation.brief or {}).get("notes", ""),
        "earlier_layouts": shown,
    }
    try:
        parsed, cost, _model = core_ai.structured(
            system=SYSTEM,
            user=json.dumps(turn, ensure_ascii=False),
            output_model=CoverPlan,
            model=settings.COPILOT_MODEL,
            max_tokens=2000,
            label=label,
            effort="low",
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant.schema_name, getattr(exc, "cost_usd", None) or 0)
        raise
    ai_compose.record_spend(tenant.schema_name, cost)
    query = parsed.photo_query.strip() or photo_query(CoachBrief.from_tenant(tenant), course.title)
    return parsed.styles, query


def _four(styles: list, round_index: int) -> list:
    """The first four distinct layouts of the plan, the rest from the round's fixed styles."""
    picked = {}
    for style in styles:
        picked.setdefault(style.layout, style)
    for layout in FALLBACK[round_index % 2]:
        picked.setdefault(
            layout, CoverStyle(layout=layout, panel="primary", title_font="display", upper=False, subtitle="")
        )
    return list(picked.values())[:COUNT]


def recipe_for(style, photo_id: str | None) -> dict:
    """A clean recipe for one style on the shared photo (none for a layout that draws no photo)."""
    style = style if isinstance(style, CoverStyle) else CoverStyle(**style)
    return validate_recipe(
        {
            "layout": style.layout,
            "panel": style.panel,
            "photo": {"id": None if style.layout in NO_PHOTO else photo_id},
            "words": {"subtitle": style.subtitle.strip()[:SUBTITLE_MAX]},
            "styles": {"title": {"font": style.title_font, "upper": style.upper}},
        },
        photo_exists=designs._photo_exists,
    )


def pick_photo(query: str):
    """Her best wide photo for the query, else the top library match copied
    into her Media (one download). None when neither can be had."""
    try:
        found = own_photos.search(query, aspect="16:9", limit=1)
        mine = own_photos.photo_of(found[0].asset_id) if found else None
        if mine is not None:
            return mine
        results = client.search(query, orientation=client.WIDE).results
        return cache.cache_remote_image(results[0]) if results else None
    except Exception:  # never the reason she has no covers
        logger.warning("focus covers: no photo for %r", query, exc_info=True)
        return None


def payload(creation) -> dict | None:
    """The cover step's state: the current round's drafts as ``CoverDesign``s
    (what ``CoverArt`` draws), the shared photo and its query. None until a
    covers job has been queued."""
    pk = jobs.run_id(creation, "covers")
    if pk is None:
        return None
    covers = creation.covers or {}
    rounds = covers.get("rounds") or []
    context = {}
    drafts = [
        {**designs.design_payload(Design(recipe=recipe), context), "id": f"d{index}"}
        for index, recipe in enumerate(rounds[-1] if rounds else [])
    ]
    photo_id = covers.get("photo")
    photo = designs._photos(context, [photo_id]).get(photo_id) if photo_id else None
    return {
        "status": jobs.status(creation, "covers"),
        "run": pk,
        "round": len(rounds),
        "drafts": drafts,
        "photo": {"id": photo_id, "url": generate_presigned_download_url(photo.s3_key)} if photo else None,
        "query": covers.get("query", ""),
    }
