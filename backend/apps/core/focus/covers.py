"""The covers job (spec §5.2): once the outline is written, the Designer drafts
four cover styles, design recipes ``CoverArt`` draws (no image file), all on
one photo: hers first, else the top library match copied into her Media. Each
round is appended to ``FocusCreation.covers``; "Four more styles" is another
round on the same photo. When the model fails, code draws four fixed styles,
so she always has covers to pick from. A copilot run on the agents worker.
A kind whose cover is a photo only (COVER "photo", a post's, G7) gets no
styles: the photo row, and "Use this photo" (``use_photo``)."""

import functools
import json
import logging
import re
from typing import Literal

from django.conf import settings
from django.db import connection, transaction
from pydantic import BaseModel
from rest_framework import serializers

from apps.core import ai as core_ai
from apps.core import languages
from apps.core.copilot import runs
from apps.core.curated_images import cache, client
from apps.core.onboarding import ai_compose
from apps.core.onboarding.ai_curate import CoachBrief, photo_query
from apps.core.storage import generate_presigned_download_url
from apps.media import designs, own_photos
from apps.media.design_recipe import LAYOUTS, validate_recipe
from apps.media.models import Design
from apps.tenant_config.models import CopilotRun, FocusCreation

from . import jobs, kinds

logger = logging.getLogger(__name__)

STEP = {"specialist": "designer", "label": "Drafting covers"}
COUNT = 4
SUBTITLE_MAX = 60
NO_PHOTO = ("title",)  # layouts that draw no photo
# A tapped photo's id ("own:<uuid>" or a library id): nothing that could reach a path or a URL.
ASSET_ID = re.compile(r"[A-Za-z0-9._:-]{1,128}")
# Round n falls back to FALLBACK[n % 2] (n from 0), in the primary panel, the display font, no subtitle.
FALLBACK = (("full", "panel", "title", "band"), ("framed", "photo", "panel", "full"))
# Static per kind, byte-identical across tenants (prompt caching); ``{noun}`` is the kind's word.
SYSTEM = (
    "You are the designer drafting four covers for an online {noun}, each in its own layout. Layouts: "
    "'full' (the photo fills the cover, the title over it), 'panel' (the photo beside a colour panel with "
    "the title), 'title' (the title alone on colour, no photo), 'band' (a colour band across the photo), "
    "'framed' (the photo in a frame on colour), 'photo' (the photo above, the title below). Give four "
    "styles with four different layouts, and vary the panel colour and the type (display or body font, "
    "upper case or not) so each one looks distinct. Avoid the 'earlier_layouts' where you can. The "
    f"subtitle is at most {SUBTITLE_MAX} characters, taken from the {{noun}} description or outline "
    "word for word or shortened, or empty; never invent a claim, a result or a number. photo_query: "
    "two to five plain words for what the shared photo should show."
)


@functools.cache  # ``cache`` is the curated-images module here
def system_for(kind: str) -> str:
    return SYSTEM.replace("{noun}", kinds.get(kind).NOUN)


# The layouts drafted on a plain photo: a cutout needs one whose background she removed.
DRAFTED = tuple(layout for layout in LAYOUTS if layout != "cutout")


class CoverStyle(BaseModel):
    layout: Literal[DRAFTED]
    panel: Literal["primary", "accent", "ink", "paper", "primary-dark", "accent-dark"]
    title_font: Literal["display", "body"]
    upper: bool
    subtitle: str


class CoverPlan(BaseModel):
    photo_query: str
    styles: list[CoverStyle]


def start(creation, *, ahead: bool) -> CopilotRun | None:
    """A queued covers run (a new round). ``ahead``: she is not waiting on it
    yet. None for a kind whose cover is not drafted styles. Call on the locked
    creation, inside the writing transaction."""
    if kinds.get(creation.kind).COVER != "styles":
        return None
    return jobs.queue(creation, "covers", specialist="designer", ahead=ahead)


def carry_out(tenant, run_id) -> None:
    request = CopilotRun.objects.get(pk=run_id).request or {}
    creation = FocusCreation.objects.get(pk=request.get("focus"))
    adapter = kinds.get(creation.kind)
    record = adapter.record(creation.record_id)
    if record is None:  # deleted meanwhile: nothing to draw for
        runs.finish(run_id, True, {"text": "Drew no covers."})
        return
    runs.emit(run_id, "step", {**STEP, "state": "start"})
    rounds = (creation.covers or {}).get("rounds") or []
    shown = [recipe["layout"] for round_ in rounds for recipe in round_]
    label = "contentor:focus-ahead" if request.get("ahead") else "contentor:copilot"
    try:
        styles, query = _plan(tenant, creation, record, shown, label)
    except core_ai.AiError:
        logger.warning("focus covers: model failed, using the fixed styles schema=%s", tenant.schema_name)
        styles, query = [], photo_query(CoachBrief.from_tenant(tenant), adapter.cover_facts(record)["title"])
    styles = _four(styles, len(rounds))
    picked = None if rounds else pick_photo(query)  # the first round only: one copy into her Media
    with transaction.atomic():
        # The creation first, then the run: the order her requests lock them in.
        locked = FocusCreation.objects.select_for_update().get(pk=creation.pk)
        if not jobs.active(run_id):  # Stop won while the model drew
            return
        if adapter.record(locked.record_id) is None:  # deleted while the model drew
            runs.finish(run_id, True, {"text": "Drew no covers."})
            return
        current = locked.covers or {}
        query = current.get("query") or query  # hers, said while the model drew, beats the model's
        photo_id = current.get("photo")  # the one she chose, if she did, even while the first round drew
        photo_id = photo_id if photo_id and designs._photo_exists(photo_id) else None
        if photo_id is None and not current.get("rounds"):
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


def _plan(tenant, creation, record, shown: list, label: str) -> tuple[list, str]:
    if not ai_compose.compose_available():
        raise core_ai.AiError("ai_unavailable")
    adapter = kinds.get(creation.kind)
    facts = adapter.cover_facts(record)
    look, _logo = designs.site_look({})
    turn = {
        adapter.NOUN: facts["title"],  # "course": its title, as the course's turn has always said it
        "description": facts["description"],
        "level": (creation.answers or {}).get("level", ""),
        "look": look,
        "notes": (creation.brief or {}).get("notes", ""),
        "followups": (creation.brief or {}).get("followups", []),
        "earlier_layouts": shown,
    }
    try:
        parsed, cost, _model = core_ai.structured(
            system=system_for(creation.kind),
            user=json.dumps(turn, ensure_ascii=False),
            output_model=CoverPlan,
            model=settings.COPILOT_MODEL,
            max_tokens=2000,
            label=label,
            effort="low",
            language=languages.site_language(),
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant.schema_name, getattr(exc, "cost_usd", None) or 0)
        raise
    ai_compose.record_spend(tenant.schema_name, cost)
    query = parsed.photo_query.strip() or photo_query(CoachBrief.from_tenant(tenant), facts["title"])
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


def photo_for(asset_id: str):
    """The Photo a tapped asset id stands for: hers as it is, a library photo
    copied into her Media (§5.2, one download). None when it cannot be had."""
    if not isinstance(asset_id, str) or not ASSET_ID.fullmatch(asset_id):
        return None
    try:
        if asset_id.startswith(own_photos.OWN):
            return own_photos.photo_of(asset_id)
        image = client.get(asset_id)
        return cache.cache_remote_image(image) if image else None
    except Exception:  # the library, storage or the network: never a 500 for her tap
        logger.warning("focus covers: photo %r not available", asset_id, exc_info=True)
        return None


def _acting(creation):
    """The creation, locked, while the cover is her question; else None. Call
    inside ``transaction.atomic()``: a double tap or a stale screen changes nothing."""
    from . import flow

    locked = flow._locked(creation)
    return locked if flow.current_field(locked) == "cover" else None


def _answered(locked, value: str) -> None:
    from . import flow

    recipe = kinds.get(locked.kind).RECIPE
    question = next(q for q in recipe.questions if q.id == "cover")
    locked.answers = {**(locked.answers or {}), "cover": value}
    flow._say(locked, question, flow._label(recipe, question, value))
    locked.save(update_fields=["answers", "updated_at"])


def set_photo(creation, photo) -> None:
    """The photo for the cover, in every photo style of the round on screen
    (no model call). Later rounds draw on it too."""
    with transaction.atomic():
        locked = _acting(creation)
        if locked is None:
            return
        current = locked.covers or {}
        photo_id, rounds = str(photo.pk), current.get("rounds") or []
        if rounds:
            rounds = [*rounds[:-1], [_with_photo(recipe, photo_id) for recipe in rounds[-1]]]
        locked.covers = {**current, "photo": photo_id, "rounds": rounds}
        locked.save(update_fields=["covers", "updated_at"])


def use_photo(creation, photo) -> None:
    """ "Use this photo", for a kind whose cover is a photo only: it goes on
    the record and the cover question is answered. Once only."""
    with transaction.atomic():
        locked = _acting(creation)
        adapter = kinds.get(creation.kind)
        if locked is not None and adapter.COVER == "photo":
            adapter.set_photo(locked.record_id, str(photo.pk))
            _answered(locked, "kept")


def _with_photo(recipe: dict, photo_id: str) -> dict:
    if recipe["layout"] in NO_PHOTO:
        return recipe
    return validate_recipe({**recipe, "photo": {**recipe["photo"], "id": photo_id}}, photo_exists=designs._photo_exists)


def _draft(locked, index):
    """The record's cover draft holding the style at ``index`` of the round on
    screen (started if it has none; an older one takes this style). None for an
    index outside the round, or a record deleted meanwhile."""
    rounds = (locked.covers or {}).get("rounds") or []
    if not isinstance(index, int) or isinstance(index, bool) or not rounds or not 0 <= index < len(rounds[-1]):
        return None
    adapter = kinds.get(locked.kind)
    record = adapter.record(locked.record_id)
    if record is None:
        return None
    recipe = validate_recipe(rounds[-1][index], photo_exists=designs._photo_exists)
    draft = designs.open_draft(*adapter.cover_target(record), recipe=recipe, made_by="designer")
    if draft.recipe != recipe:
        draft.recipe, draft.made_by = recipe, "designer"
        draft.save(update_fields=["recipe", "made_by", "updated_at"])
    return draft


def keep(creation, index, user) -> None:
    """ "Use this cover": the style becomes the record's cover, with its Undo in
    History, and the cover question is answered. Once only."""
    from apps.core.copilot.views import _record_audit

    with transaction.atomic():
        locked = _acting(creation)
        if locked is None:
            return
        try:
            draft = _draft(locked, index)
            if draft is None:
                return
            result, inverse = designs.keep(draft)
        except (designs.DesignError, serializers.ValidationError):  # the record or the photo is gone
            logger.warning("focus covers: keep refused creation=%s", locked.pk, exc_info=True)
            return
        action = {"kind": "keep_cover", "design_id": str(draft.pk), "title": result["title"], "made_by": "designer"}
        with transaction.atomic():  # a savepoint: a failed audit write never undoes the keep
            _record_audit(connection.tenant, user, action, result, inverse)
        _answered(locked, "kept")


def later(creation) -> None:
    with transaction.atomic():
        locked = _acting(creation)
        if locked is not None:
            _answered(locked, "later")


def more(creation) -> None:
    """Four more styles: another round, refused while one is being drawn."""
    with transaction.atomic():
        locked = _acting(creation)
        if locked is not None and jobs.status(locked, "covers") != "building":
            start(locked, ahead=False)


def open_for_edit(creation, index) -> str | None:
    """The draft's id for the photo studio ("I'll edit it"); None when refused."""
    with transaction.atomic():
        locked = _acting(creation)
        if locked is None:
            return None
        try:
            draft = _draft(locked, index)
        except (designs.DesignError, serializers.ValidationError):
            return None
        return str(draft.pk) if draft else None


def photo_row(creation, tenant, query: str, page: int) -> dict:
    """The row under the drafts: her photos first (page 1), then library
    matches. The library being down leaves hers; never an error."""
    query = query.strip() or (creation.covers or {}).get("query") or ""
    if not query:
        adapter = kinds.get(creation.kind)
        record = adapter.record(creation.record_id)
        query = photo_query(CoachBrief.from_tenant(tenant), adapter.cover_facts(record)["title"] if record else "")
    images = [(i, True) for i in own_photos.search(query, aspect="16:9", limit=8)] if page == 1 else []
    has_next = False
    try:
        found = client.search(query, orientation=client.WIDE, page=page)
        images += [(i, False) for i in found.results]
        has_next = found.has_next
    except Exception:
        logger.warning("focus covers: library search failed for %r", query, exc_info=True)
    return {
        "results": [
            {"asset_id": i.asset_id, "url": i.preview_url, "title": i.title, "mine": mine} for i, mine in images
        ],
        "has_next": has_next,
    }


def payload(creation) -> dict | None:
    """The cover step's state: the current round's drafts as ``CoverDesign``s
    (what ``CoverArt`` draws), the shared photo and its query. None until a
    covers job has been queued; a photo-only cover has no drafts, only her
    words for the photo row."""
    pk = jobs.run_id(creation, "covers")
    covers = creation.covers or {}
    if pk is None:
        if kinds.get(creation.kind).COVER != "photo":
            return None
        return {
            "status": "ready",
            "run": None,
            "round": 0,
            "drafts": [],
            "photo": None,
            "query": covers.get("query", ""),
        }
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
