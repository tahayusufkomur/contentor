"""Covers she designed, from a draft to the cover of a course or an event series.

`open_draft` starts (or resumes) a draft, `keep` makes it the cover, and `cover_for` is what a course
or event row then shows. A design belongs to a course (its id) or to an event series (the event kind
and the exact title). Keep writes the design's photo to every row of the target, and a row shows the
design only while it still wears that photo: a cover she changes by hand wins, and a photo she deletes
takes the design down with it (thumbnails are SET_NULL).

Keep is a History row in the copilot (apps.core.copilot.views): this module builds the row's inverse
(kind `restore_cover_design`) and applies it. Models of other apps are imported inside the functions,
as apps/core does, because the course and live serializers import this module.
"""

from contextlib import contextmanager

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.storage import generate_presigned_download_url, sign_if_s3_key

from .design_recipe import validate_recipe
from .models import Design, Photo


class DesignError(Exception):
    """Why a design could not be opened, kept or undone, in words safe to show her."""


TARGET_KINDS = ("course", "live", "stream", "zoom", "onsite")

_MEMO = "_cover_designs"
# The words of copilot.views.SNAPSHOT_STALE, which History shows for every other snapshot it refuses.
_STALE = "it was changed since, so undoing it would overwrite newer work"


# --- targets ---------------------------------------------------------------


def _model(target_kind):
    """The model behind a target kind. An unknown kind is refused here: content.event_model
    would quietly answer with live classes."""
    if target_kind == "course":
        from apps.courses.models import Course

        return Course
    if target_kind not in TARGET_KINDS:
        raise DesignError("that is not something you can design a cover for")
    from apps.core.copilot import content

    return content.event_model(target_kind)


def _gone(target_kind):
    from apps.core.copilot.content import EVENT_KINDS

    noun = "course" if target_kind == "course" else EVENT_KINDS[target_kind][4]
    return DesignError(f"that {noun} no longer exists")


def kind_of(obj) -> str:
    """`course` for a course, otherwise the event kind of its model (live, stream, zoom, onsite)."""
    from apps.core.copilot.content import EVENT_KINDS
    from apps.courses.models import Course

    if isinstance(obj, Course):
        return "course"
    return {spec[0]: kind for kind, spec in EVENT_KINDS.items()}[type(obj).__name__]


def _target_of(obj):
    kind = kind_of(obj)
    return kind, (str(obj.pk) if kind == "course" else obj.title)


def target_rows(target_kind: str, target_key: str) -> list:
    """The course, or every event of that kind with exactly that title (a series)."""
    model = _model(target_kind)
    if target_kind != "course":
        return list(model.objects.filter(title=target_key))
    try:
        return list(model.objects.filter(pk=int(target_key)))
    except (TypeError, ValueError):  # not an id
        return []


def target_title(target_kind: str, target_key: str) -> str:
    if target_kind != "course":
        return target_key
    rows = target_rows(target_kind, target_key)
    return rows[0].title if rows else ""


# --- drafts ----------------------------------------------------------------


def _recipe_photo(recipe):
    """The id of the photo a recipe is drawn on, or None. Read paths (every course list) go through
    this, so a recipe that is not shaped as expected must not take them down."""
    photo = recipe.get("photo") if isinstance(recipe, dict) else None
    return (photo.get("id") if isinstance(photo, dict) else None) or None


def _photo_exists(photo_id):
    return Photo.objects.filter(pk=photo_id).exists()


def _design(design_id):
    try:
        return Design.objects.filter(pk=design_id).first()
    except (ValueError, DjangoValidationError):  # not a uuid
        return None


def open_draft(
    target_kind: str, target_key: str, *, recipe: dict | None = None, from_id: str | None = None, made_by: str = ""
) -> Design:
    """The target's draft, started if it has none: from `recipe` (validated), from a copy of design
    `from_id`'s recipe, or else on the photo the target wears now. A draft she already has comes back
    as it is, whatever is passed. Raises DesignError when the target has no rows.

    ponytail: nothing stops a target having two drafts (two opens racing, or an Undo reviving a design
    beside the draft she opened since); the one updated last comes back. Add a unique constraint on
    drafts if that ever bites."""
    rows = target_rows(target_kind, target_key)
    if not rows:
        raise _gone(target_kind)
    target_key = str(rows[0].pk) if target_kind == "course" else target_key  # "07" files under "7"
    draft = Design.objects.filter(kind="cover", target_kind=target_kind, target_key=target_key, state="draft").first()
    if draft is not None:
        return draft
    if recipe is not None:
        recipe = validate_recipe(recipe, photo_exists=_photo_exists)
    elif from_id:
        source = _design(from_id)
        if source is None:
            raise DesignError("that design no longer exists")
        recipe = source.recipe
    else:
        recipe = validate_recipe({"photo": {"id": rows[0].thumbnail_id}}, photo_exists=_photo_exists)
    return Design.objects.create(target_kind=target_kind, target_key=target_key, recipe=recipe, made_by=made_by)


# --- keep and undo ---------------------------------------------------------


@contextmanager
def _atomic(refusal):
    """`transaction.atomic()` where losing a race for the one kept design a target may have (the
    database refuses the second) is a refusal she can read, not a server error."""
    try:
        with transaction.atomic():
            yield
    except IntegrityError:
        raise DesignError(refusal) from None


def keep(design: Design) -> tuple[dict, dict]:
    """Make a draft the cover of its course or event series: its photo (none included) goes onto every
    row of the target, and the design kept before it is retired. Returns `(result, inverse)` for the
    History row; `restore_cover(inverse)` is Undo. As for the other cover changes, `result["id"]` is
    the record that was touched (the course, or the first row of the series), which is what the page
    showing it reloads on when History undoes this; the design's own id is `result["design_id"]`."""
    with _atomic("that cover was changed since"):
        try:
            # Locked and current: a double submit waits here and then finds it kept.
            design.refresh_from_db(from_queryset=Design.objects.select_for_update())
        except Design.DoesNotExist:
            raise DesignError("that design no longer exists") from None
        if design.state != "draft":
            raise DesignError("only a draft can be kept")
        rows = target_rows(design.target_kind, design.target_key)
        if not rows:
            raise _gone(design.target_kind)
        photo_id = _recipe_photo(design.recipe)
        if photo_id and not _photo_exists(photo_id):
            raise DesignError("that photo no longer exists")
        previous = (
            Design.objects.select_for_update()
            .filter(kind=design.kind, target_kind=design.target_kind, target_key=design.target_key, state="kept")
            .first()
        )
        inverse = {
            "kind": "restore_cover_design",
            "design_id": str(design.pk),
            "previous_id": str(previous.pk) if previous else None,
            "target_kind": design.target_kind,
            "target_key": design.target_key,
            "thumbnails": {str(row.pk): str(row.thumbnail_id) if row.thumbnail_id else None for row in rows},
        }
        # The old one goes first: the database allows one kept design per target.
        if previous is not None:
            previous.state = "retired"
            previous.save(update_fields=["state", "updated_at"])
        design.state, design.kept_at = "kept", timezone.now()
        design.save(update_fields=["state", "kept_at", "updated_at"])
        for row in rows:
            row.thumbnail_id = photo_id
            row.save(update_fields=["thumbnail"])
    result = {
        "id": rows[0].pk,
        "design_id": str(design.pk),
        "title": target_title(design.target_kind, design.target_key),
        "target_kind": design.target_kind,
        "target_key": design.target_key,
    }
    return result, inverse


def cover_state(inverse: dict) -> list:
    """What Undo would overwrite, for History's stamp: the target's kept design, and the cover of each
    row Keep wrote to (those rows only: a session added to the series later must not make Undo stale)."""
    kept = (
        Design.objects.filter(
            kind="cover", target_kind=inverse["target_kind"], target_key=inverse["target_key"], state="kept"
        )
        .values_list("pk", flat=True)
        .first()
    )
    rows = _model(inverse["target_kind"]).objects.filter(pk__in=list(inverse["thumbnails"]))
    covers = sorted(
        [pk, str(photo_id) if photo_id else None] for pk, photo_id in rows.values_list("pk", "thumbnail_id")
    )
    return [str(kept) if kept else None, covers]


def restore_cover(inverse: dict) -> None:
    """Undo a Keep: the kept design is a draft again, the one it retired is kept again (if it is still
    there), and the rows wear the photos they had. Raises DesignError, having changed nothing, when
    the cover is no longer the kept one or a photo it would bring back is gone."""
    kind, thumbnails = inverse["target_kind"], inverse["thumbnails"]
    rows = list(_model(kind).objects.filter(pk__in=list(thumbnails)))
    if not rows:
        raise _gone(kind)
    photo_ids = {thumbnails[str(row.pk)] for row in rows} - {None}
    if photo_ids and Photo.objects.filter(pk__in=photo_ids).count() != len(photo_ids):
        raise DesignError("that photo no longer exists")
    with _atomic(_STALE):
        design = Design.objects.select_for_update().filter(pk=inverse["design_id"], state="kept").first()
        if design is None:
            raise DesignError(_STALE)
        design.state, design.kept_at = "draft", None
        # Not "updated_at": the copy she may have opened since is newer than this one, and the newest
        # draft is the one the studio resumes.
        design.save(update_fields=["state", "kept_at"])
        if inverse["previous_id"]:
            Design.objects.filter(pk=inverse["previous_id"], state="retired").update(
                state="kept", updated_at=timezone.now()
            )
        for row in rows:
            row.thumbnail_id = thumbnails[str(row.pk)]
            row.save(update_fields=["thumbnail"])


def adopt_series_cover(event) -> None:
    """A session created into a series that has a cover wears the series' photo, so the cover shows on
    it too. A session given a cover of its own, or a series without a photo, is left as it is."""
    if event.thumbnail_id or event.thumbnail_url:
        return
    design = Design.objects.filter(
        kind="cover", target_kind=kind_of(event), target_key=event.title, state="kept"
    ).first()
    photo_id = _recipe_photo(design.recipe) if design else None
    if photo_id and _photo_exists(photo_id):
        event.thumbnail_id = photo_id
        event.save(update_fields=["thumbnail"])


# --- what a row shows ------------------------------------------------------


def _memo(context):
    return context.setdefault(_MEMO, {})


def _photos(context, photo_ids):
    """Her photos by id, each read once per context (None for one she no longer has)."""
    photos = _memo(context).setdefault("photos", {})
    new = [photo_id for photo_id in photo_ids if photo_id not in photos]
    if new:
        photos.update(dict.fromkeys(new))
        photos.update({str(photo.pk): photo for photo in Photo.objects.filter(pk__in=new).only("s3_key")})
    return photos


def read_photos(rows, context):
    """The photos of these designs, all in one read, so that drawing each of them (design_payload) finds its
    photo in `context` instead of reading it."""
    _photos(context, [photo_id for design in rows if (photo_id := _recipe_photo(design.recipe))])


def _kept(context):
    """Every kept cover design by (target kind, target key), read once per context together with
    their photos. ponytail: all of them, not just the rows being shown; a tenant has tens of courses
    and series. Filter by target if a list ever grows into the thousands."""
    memo = _memo(context)
    if "kept" not in memo:
        kept = {(d.target_kind, d.target_key): d for d in Design.objects.filter(kind="cover", state="kept")}
        read_photos(kept.values(), context)
        memo["kept"] = kept
    return memo["kept"]


def site_look(context: dict) -> tuple[str, str | None]:
    """The look covers are drawn in ("style" or "style:palette") and the site's logo link, read once
    per context."""
    memo = _memo(context)
    if "look" not in memo:
        from apps.tenant_config.models import TenantConfig

        cfg = TenantConfig.objects.select_related("logo").first()
        look = logo = ""
        if cfg is not None:
            look = f"{cfg.style}:{cfg.palette}" if cfg.palette else cfg.style
            if cfg.logo_id and cfg.logo.s3_key:
                logo = generate_presigned_download_url(cfg.logo.s3_key)
            else:
                logo = sign_if_s3_key(cfg.logo_url)
        memo["look"] = (look, logo or None)
    return memo["look"]


def design_payload(design: Design, context: dict) -> dict:
    """Everything the renderer needs to draw a design: the recipe, the link of its photo (left out when
    the photo is gone: the renderer draws its placeholder), the logo and the look."""
    photo_id = _recipe_photo(design.recipe)
    photo = _photos(context, [photo_id]).get(photo_id) if photo_id else None
    # "" when we may not hand out a link to that key: the same as a photo that is gone.
    url = generate_presigned_download_url(photo.s3_key) if photo and photo.s3_key else ""
    look, logo_url = site_look(context)
    return {
        "id": str(design.pk),
        "recipe": design.recipe,
        "photos": {photo_id: url} if url else {},
        "logo_url": logo_url,
        "look": look,
    }


def cover_for(obj, context: dict) -> dict | None:
    """The cover design a course or event row shows, or None for the plain photo. `context` is the
    serializer's: what is read for one row is kept there for the rest."""
    design = _kept(context).get(_target_of(obj))
    if design is None or _recipe_photo(design.recipe) != (str(obj.thumbnail_id) if obj.thumbnail_id else None):
        return None
    return design_payload(design, context)


def in_use_assets() -> dict[str, str]:
    """The catalog photos on her courses and series, so the studio can say where one is in use: the
    catalog asset id of a Contentor photo, or the index id of one of her own, mapped to the title of
    the course or series wearing it (the first one, courses first)."""
    from apps.core.copilot import content
    from apps.core.curated_images.cache import asset_id_from_key
    from apps.courses.models import Course

    in_use = {}
    for model in (Course, *(content.event_model(kind) for kind in content.EVENT_KINDS)):
        covers = model.objects.filter(thumbnail__isnull=False).values_list(
            "title", "thumbnail__s3_key", "thumbnail__catalog_id"
        )
        for title, s3_key, catalog_id in covers:
            for asset_id in (asset_id_from_key(s3_key), catalog_id):
                if asset_id:
                    in_use.setdefault(asset_id, title)
    return in_use
