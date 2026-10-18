"""Covers: opening a draft, keeping it, undoing it from History, and what a course or event row shows.

Rows are made directly except in the adopt tests, which go through the event create serializers
so that the series hook runs.
"""

import json
import uuid
from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.serializers import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.copilot import views as copilot_views
from apps.core.storage import build_s3_path
from apps.courses.models import Course
from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
from apps.live.serializers import LiveClassCreateSerializer, OnsiteEventCreateSerializer
from apps.media import designs
from apps.media.models import Design, Photo
from apps.tenant_config.models import CopilotAudit, TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="designs-coach@x.com", name="Coach", password="x", role="owner", is_staff=True
    )


@pytest.fixture()
def client(coach):
    c = APIClient(HTTP_HOST=HOST)
    c.force_authenticate(user=coach)
    return c


@pytest.fixture()
def site(tenant_ctx):
    """The site's config row, put back as it was when the test is done."""
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    before = {field: getattr(cfg, field) for field in ("style", "palette", "logo_url", "logo_id")}
    yield cfg
    TenantConfig.objects.filter(pk=cfg.pk).update(**before)


def photo(name):
    # "demo/" is a shared prefix every tenant may be handed a link to.
    return Photo.objects.create(s3_key=f"demo/{name}.jpg", title=name)


def course(coach, title="Yoga Basics", thumbnail=None):
    return Course.objects.create(title=title, instructor=coach, thumbnail=thumbnail)


def session(coach, title="Morning Flow", thumbnail=None, days=3):
    when = timezone.now() + timedelta(days=days)
    return LiveClass.objects.create(title=title, instructor=coach, scheduled_at=when, thumbnail=thumbnail)


def on(picture):
    """A recipe drawn on this photo (none: title only)."""
    return {"photo": {"id": str(picture.pk) if picture else None}}


def kept(kind, key, picture):
    draft = designs.open_draft(kind, key, recipe=on(picture))
    designs.keep(draft)
    return draft


def keep_with_history(coach, draft):
    """Keep it the way the designs API does, History row included."""
    result, inverse = designs.keep(draft)
    action = {"kind": "keep_cover", "design_id": result["design_id"], "title": result["title"], "made_by": ""}
    audit_id = copilot_views._record_audit(connection.tenant, coach, action, result, inverse)
    assert audit_id is not None
    return result, inverse, audit_id


def undo(client, audit_id):
    return client.post("/api/v1/admin/copilot/undo/", {"audit_id": audit_id}, format="json")


def create_session(serializer_class, coach, **data):
    data.setdefault("scheduled_at", (timezone.now() + timedelta(days=5)).isoformat())
    serializer = serializer_class(data=data)
    serializer.is_valid(raise_exception=True)
    return serializer.save(instructor=coach)


# --- opening a draft -------------------------------------------------------


def test_open_draft_reuses_the_targets_draft(coach):
    item = course(coach)
    first = designs.open_draft("course", str(item.pk), made_by="designer")
    again = designs.open_draft("course", str(item.pk), recipe={"layout": "full"})
    assert again.pk == first.pk
    assert Design.objects.count() == 1
    assert (first.kind, first.state, first.made_by) == ("cover", "draft", "designer")
    assert again.recipe["layout"] == "panel"  # the draft she already has comes back untouched


def test_open_draft_starts_on_the_current_cover(coach):
    current = photo("current")
    covered = course(coach, thumbnail=current)
    bare = course(coach, title="No cover yet")
    series = [session(coach, thumbnail=current, days=day) for day in (1, 2)]
    assert designs.open_draft("course", str(covered.pk)).recipe["photo"]["id"] == str(current.pk)
    assert designs.open_draft("course", str(bare.pk)).recipe["photo"]["id"] is None
    assert designs.open_draft("live", series[0].title).recipe["photo"]["id"] == str(current.pk)


def test_open_draft_validates_a_recipe_and_copies_a_design(coach):
    first, second = course(coach), course(coach, title="Other")
    made = designs.open_draft("course", str(first.pk), recipe={"layout": "full", "words": {"label": "New"}})
    assert made.recipe["layout"] == "full"
    assert made.recipe["words"] == {"label": "New", "title": None, "subtitle": ""}
    assert made.recipe["version"] == 1  # completed, not stored as typed
    with pytest.raises(ValidationError):
        designs.open_draft("course", str(second.pk), recipe={"layout": "poster"})
    copy = designs.open_draft("course", str(second.pk), from_id=str(made.pk))
    assert copy.pk != made.pk
    assert (copy.target_key, copy.recipe) == (str(second.pk), made.recipe)


def test_open_draft_refuses_a_missing_design_to_copy(coach):
    item = course(coach)
    for from_id in (str(uuid.uuid4()), "not-a-uuid"):
        with pytest.raises(designs.DesignError, match="design"):
            designs.open_draft("course", str(item.pk), from_id=from_id)
    assert not Design.objects.exists()


def test_open_draft_refuses_a_target_with_no_rows(coach):
    for kind, key in (
        ("course", "999999"),
        ("course", "nope"),
        ("live", "Nothing"),
        ("zoom", "Nothing"),
        ("bogus", "x"),
    ):
        with pytest.raises(designs.DesignError):
            designs.open_draft(kind, key)
    assert not Design.objects.exists()


def test_open_draft_stores_a_course_by_its_id(coach):
    item = course(coach)
    # "0007"-style keys find the course; the design must still be filed under str(pk) to ever show.
    draft = designs.open_draft("course", f"0{item.pk}")
    assert draft.target_key == str(item.pk)
    assert designs.open_draft("course", str(item.pk)).pk == draft.pk


def test_kind_of_names_every_row_kind():
    models = (Course, LiveClass, LiveStream, ZoomClass, OnsiteEvent)
    assert [designs.kind_of(model()) for model in models] == list(designs.TARGET_KINDS)


# --- keep ------------------------------------------------------------------


def test_keep_course_sets_thumbnail_and_returns_inverse(coach):
    old, new = photo("old"), photo("new")
    item = course(coach, thumbnail=old)
    draft = designs.open_draft("course", str(item.pk), recipe=on(new))
    result, inverse = designs.keep(draft)
    item.refresh_from_db()
    draft.refresh_from_db()
    assert item.thumbnail_id == new.pk
    assert draft.state == "kept"
    assert draft.kept_at is not None
    assert result == {
        "id": item.pk,  # the record that was touched: what the page showing it reloads on after an Undo
        "design_id": str(draft.pk),
        "title": "Yoga Basics",
        "target_kind": "course",
        "target_key": str(item.pk),
    }
    assert inverse == {
        "kind": "restore_cover_design",
        "design_id": str(draft.pk),
        "previous_id": None,
        "target_kind": "course",
        "target_key": str(item.pk),
        "thumbnails": {str(item.pk): str(old.pk)},
    }
    json.dumps([result, inverse])  # both are stored in JSON columns


def test_keep_series_sets_every_row(coach):
    old, new = photo("old"), photo("new")
    morning = [session(coach, thumbnail=old, days=day) for day in (1, 2, 3)]
    evening = session(coach, title="Evening Flow", thumbnail=old)
    draft = designs.open_draft("live", "Morning Flow", recipe=on(new))
    result, inverse = designs.keep(draft)
    assert {row.thumbnail_id for row in LiveClass.objects.filter(title="Morning Flow")} == {new.pk}
    evening.refresh_from_db()
    assert evening.thumbnail_id == old.pk
    assert set(inverse["thumbnails"]) == {str(row.pk) for row in morning}
    assert (result["title"], result["target_kind"], result["target_key"]) == ("Morning Flow", "live", "Morning Flow")
    # a series is touched through its first row
    assert result["id"] == designs.target_rows("live", "Morning Flow")[0].pk
    assert result["id"] in {row.pk for row in morning}
    assert result["design_id"] == str(draft.pk)


def test_keep_without_a_photo_clears_the_rows_photo(coach):
    old = photo("old")
    item = course(coach, thumbnail=old)
    _, inverse = designs.keep(designs.open_draft("course", str(item.pk), recipe=on(None)))
    item.refresh_from_db()
    assert item.thumbnail_id is None  # a title-only cover shows, so the row wears no photo
    assert designs.cover_for(item, {})["photos"] == {}
    assert inverse["thumbnails"] == {str(item.pk): str(old.pk)}


def test_keep_twice_keeps_one(coach, client):
    first_photo, second_photo = photo("first"), photo("second")
    item = course(coach)
    key = str(item.pk)
    first = designs.open_draft("course", key, recipe=on(first_photo))
    _, _, first_audit = keep_with_history(coach, first)
    second = designs.open_draft("course", key, recipe=on(second_photo))
    assert second.pk != first.pk  # the first one is kept, so it is no draft any more
    _, second_inverse, second_audit = keep_with_history(coach, second)
    assert second_inverse["previous_id"] == str(first.pk)
    assert dict(Design.objects.values_list("pk", "state")) == {first.pk: "retired", second.pk: "kept"}

    assert undo(client, first_audit).status_code == 400  # only the newest change can be undone
    assert dict(Design.objects.values_list("pk", "state")) == {first.pk: "retired", second.pk: "kept"}
    item.refresh_from_db()
    assert item.thumbnail_id == second_photo.pk
    assert second_audit != first_audit


def test_keep_refuses_what_it_cannot_do(coach):
    item = course(coach)
    done = kept("course", str(item.pk), photo("chosen"))
    with pytest.raises(designs.DesignError, match="draft"):
        designs.keep(done)  # already kept

    other = course(coach, title="Other")
    gone = photo("gone")
    draft = designs.open_draft("course", str(other.pk), recipe=on(gone))
    gone.delete()
    with pytest.raises(designs.DesignError, match="photo no longer exists"):
        designs.keep(draft)
    draft.refresh_from_db()
    other.refresh_from_db()
    assert draft.state == "draft"  # nothing was written
    assert other.thumbnail_id is None

    third = course(coach, title="Third")
    stray = designs.open_draft("course", str(third.pk))
    third.delete()
    with pytest.raises(designs.DesignError, match="course no longer exists"):
        designs.keep(stray)

    fourth = course(coach, title="Fourth")
    lost = designs.open_draft("course", str(fourth.pk))
    Design.objects.filter(pk=lost.pk).delete()  # deleted in another tab
    with pytest.raises(designs.DesignError, match="design no longer exists"):
        designs.keep(lost)


# --- undo ------------------------------------------------------------------


def test_restore_cover_brings_back_previous_and_draft(coach):
    a, b = photo("a"), photo("b")
    item = course(coach)
    first = kept("course", str(item.pk), a)
    second = designs.open_draft("course", str(item.pk), recipe=on(b))
    _, inverse = designs.keep(second)

    designs.restore_cover(inverse)

    first.refresh_from_db()
    second.refresh_from_db()
    item.refresh_from_db()
    assert (first.state, second.state) == ("kept", "draft")
    assert second.kept_at is None
    assert item.thumbnail_id == a.pk
    assert designs.cover_for(item, {})["id"] == str(first.pk)


def test_restore_refused_when_photo_gone(coach):
    old, new = photo("old"), photo("new")
    item = course(coach, thumbnail=old)
    draft = designs.open_draft("course", str(item.pk), recipe=on(new))
    _, inverse = designs.keep(draft)
    old.delete()

    with pytest.raises(designs.DesignError, match="photo no longer exists"):
        designs.restore_cover(inverse)

    draft.refresh_from_db()
    item.refresh_from_db()
    assert (draft.state, item.thumbnail_id) == ("kept", new.pk)  # nothing was changed


def test_restore_refused_when_the_cover_is_not_the_kept_one_any_more(coach):
    item = course(coach)
    first = designs.open_draft("course", str(item.pk), recipe=on(photo("a")))
    _, first_inverse = designs.keep(first)
    designs.keep(designs.open_draft("course", str(item.pk), recipe=on(photo("b"))))
    with pytest.raises(designs.DesignError, match="changed since"):
        designs.restore_cover(first_inverse)
    assert Design.objects.filter(state="kept").count() == 1


def test_undo_endpoint_restores_cover(coach, client):
    old, new = photo("old"), photo("new")
    item = course(coach, thumbnail=old)
    draft = designs.open_draft("course", str(item.pk), recipe=on(new))
    _, _, audit_id = keep_with_history(coach, draft)

    entry = CopilotAudit.objects.get(pk=audit_id)
    assert (entry.kind, entry.summary) == ("keep_cover", "Kept a new cover for 'Yoga Basics'")
    assert entry.inverse["kind"] == "restore_cover_design"
    assert entry.inverse["after"]  # History stamped what the Keep left behind
    feed = {row["id"]: row for row in client.get("/api/v1/admin/copilot/audit/").json()["entries"]}
    assert feed[audit_id]["undoable"] is True

    response = undo(client, audit_id)

    assert response.status_code == 200, response.content
    # the course, so the admin page showing it reloads (as after Undo of set_course_cover)
    assert response.json() == {"undone": "keep_cover", "id": item.pk}
    item.refresh_from_db()
    draft.refresh_from_db()
    assert item.thumbnail_id == old.pk
    assert draft.state == "draft"
    assert CopilotAudit.objects.get(pk=audit_id).undone_at is not None
    assert designs.cover_for(item, {}) is None


def test_undo_refused_when_the_cover_changed_since(coach, client):
    old, new, hers = photo("old"), photo("new"), photo("hers")
    item = course(coach, thumbnail=old)
    draft = designs.open_draft("course", str(item.pk), recipe=on(new))
    _, _, audit_id = keep_with_history(coach, draft)
    item.thumbnail = hers  # she changed the cover by hand afterwards
    item.save(update_fields=["thumbnail"])
    feed = {row["id"]: row for row in client.get("/api/v1/admin/copilot/audit/").json()["entries"]}
    assert feed[audit_id]["undoable"] is False

    response = undo(client, audit_id)

    assert response.status_code == 400
    assert "overwrite newer work" in response.json()["detail"]
    item.refresh_from_db()
    draft.refresh_from_db()
    assert (item.thumbnail_id, draft.state) == (hers.pk, "kept")


def test_undo_says_so_when_the_photo_is_gone(coach, client):
    old, new = photo("old"), photo("new")
    item = course(coach, thumbnail=old)
    draft = designs.open_draft("course", str(item.pk), recipe=on(new))
    _, _, audit_id = keep_with_history(coach, draft)
    old.delete()

    response = undo(client, audit_id)

    assert response.status_code == 400
    assert "no longer exists" in response.json()["detail"]
    assert CopilotAudit.objects.get(pk=audit_id).undone_at is None
    draft.refresh_from_db()
    assert draft.state == "kept"


def test_a_session_added_later_does_not_stale_the_undo(coach, client):
    old, new = photo("old"), photo("new")
    first = session(coach, thumbnail=old, days=1)
    draft = designs.open_draft("live", "Morning Flow", recipe=on(new))
    _, _, audit_id = keep_with_history(coach, draft)
    later = create_session(LiveClassCreateSerializer, coach, title="Morning Flow")  # wears the series photo

    response = undo(client, audit_id)

    assert response.status_code == 200, response.content
    assert response.json()["id"] == first.pk  # a series is reported through its first row
    first.refresh_from_db()
    later.refresh_from_db()
    assert first.thumbnail_id == old.pk  # only the rows that Keep wrote to are restored
    assert later.thumbnail_id == new.pk


def test_undo_leaves_the_copy_she_opened_the_newest_draft(coach, client):
    """Keep, then "Edit a copy", then Undo: the design taken back is a draft again, but her copy is the one
    the studio and the targets list go on with."""
    item = course(coach)
    key = str(item.pk)
    done = designs.open_draft("course", key, recipe=on(photo("chosen")))
    _, _, audit_id = keep_with_history(coach, done)
    copy = designs.open_draft("course", key, from_id=str(done.pk))
    assert copy.pk != done.pk

    assert undo(client, audit_id).status_code == 200

    done.refresh_from_db()
    assert done.state == "draft"
    assert designs.open_draft("course", key).pk == copy.pk
    targets = {t["target_key"]: t for t in client.get("/api/v1/designs/targets/").json()["targets"]}
    assert targets[key]["draft_id"] == str(copy.pk)


def test_a_keep_that_loses_a_race_is_refused_cleanly(coach, monkeypatch):
    """Two keeps of one target at once: the database allows one kept design, and the second hears why
    instead of a server error."""
    item = course(coach)
    key = str(item.pk)
    mine = designs.open_draft("course", key, recipe=on(photo("mine")))
    rival = Design(kind="cover", target_kind="course", target_key=key, recipe={}, state="kept")
    save = Design.save

    def racing_save(self, *args, **kwargs):
        if self.pk == mine.pk and self.state == "kept":
            save(rival, force_insert=True)  # the other keep gets in just before this one writes
        return save(self, *args, **kwargs)

    monkeypatch.setattr(Design, "save", racing_save)
    with pytest.raises(designs.DesignError, match="changed since"):
        designs.keep(mine)

    mine.refresh_from_db()
    item.refresh_from_db()
    assert (mine.state, item.thumbnail_id) == ("draft", None)  # nothing of it was written
    assert not Design.objects.filter(state="kept").exists()


def test_an_undo_that_loses_a_race_is_refused_cleanly(coach, monkeypatch):
    item = course(coach)
    key = str(item.pk)
    first = kept("course", key, photo("a"))
    second = designs.open_draft("course", key, recipe=on(photo("b")))
    _, inverse = designs.keep(second)
    rival = Design(kind="cover", target_kind="course", target_key=key, recipe={}, state="kept")
    save = Design.save

    def racing_save(self, *args, **kwargs):
        result = save(self, *args, **kwargs)
        if self.pk == second.pk and self.state == "draft":
            save(rival, force_insert=True)  # another keep lands as the undone design steps down
        return result

    monkeypatch.setattr(Design, "save", racing_save)
    with pytest.raises(designs.DesignError, match="changed since"):
        designs.restore_cover(inverse)

    assert dict(Design.objects.values_list("pk", "state")) == {first.pk: "retired", second.pk: "kept"}


# --- what a row shows ------------------------------------------------------


def test_design_hidden_when_photo_replaced(coach):
    chosen, other = photo("chosen"), photo("other")
    item = course(coach)
    design = kept("course", str(item.pk), chosen)
    item.refresh_from_db()
    assert designs.cover_for(item, {})["id"] == str(design.pk)

    item.thumbnail = other  # a plain photo cover she picked since
    item.save(update_fields=["thumbnail"])

    assert designs.cover_for(item, {}) is None


def test_cover_for_needs_a_kept_design(coach):
    item = course(coach)
    draft = designs.open_draft("course", str(item.pk), recipe=on(None))
    assert designs.cover_for(item, {}) is None  # a draft changes nothing on the site
    designs.keep(draft)
    assert designs.cover_for(item, {})["id"] == str(draft.pk)
    assert designs.cover_for(course(coach, title="Other"), {}) is None


def test_payload_skips_deleted_photo(coach):
    chosen = photo("chosen")
    item = course(coach)
    design = kept("course", str(item.pk), chosen)
    payload = designs.design_payload(design, {})
    assert list(payload["photos"]) == [str(chosen.pk)]
    assert payload["photos"][str(chosen.pk)].startswith("http")

    chosen.delete()
    design.refresh_from_db()
    item.refresh_from_db()

    assert designs.design_payload(design, {})["photos"] == {}  # the renderer draws its placeholder
    assert item.thumbnail_id is None  # the row's FK went with the photo,
    assert designs.cover_for(item, {}) is None  # so the cover hides, like a plain photo cover would


def test_cover_payload_carries_the_look_and_the_logo(coach, site):
    item = course(coach)
    design = kept("course", str(item.pk), photo("chosen"))
    item.refresh_from_db()

    site.style, site.palette, site.logo, site.logo_url = "atelier", "dusk", photo("logo"), ""
    site.save()
    payload = designs.cover_for(item, {})
    assert set(payload) == {"id", "recipe", "photos", "logo_url", "look"}
    assert payload["id"] == str(design.pk)
    assert payload["recipe"] == design.recipe
    assert payload["look"] == "atelier:dusk"
    assert payload["logo_url"].startswith("http")

    site.palette, site.logo, site.logo_url = "", None, "https://cdn.example.com/logo.png"
    site.save()
    payload = designs.cover_for(item, {})
    assert (payload["look"], payload["logo_url"]) == ("atelier", "https://cdn.example.com/logo.png")

    site.logo_url = ""
    site.save()
    assert designs.cover_for(item, {})["logo_url"] is None


def test_cover_for_reads_once_per_context(coach):
    items = []
    for number in range(4):
        item = course(coach, title=f"Course {number}")
        kept("course", str(item.pk), photo(f"p{number}"))
        items.append(Course.objects.get(pk=item.pk))
    context = {}
    with CaptureQueriesContext(connection) as first:
        designs.cover_for(items[0], context)
    with CaptureQueriesContext(connection) as rest:
        payloads = [designs.cover_for(item, context) for item in items[1:]]
    assert len(first) <= 3  # kept designs, their photos, the site config
    assert len(rest) == 0
    assert all(payloads)


# --- a series --------------------------------------------------------------


@pytest.mark.parametrize(
    ("kind", "serializer", "extra"),
    [("live", LiveClassCreateSerializer, {}), ("onsite", OnsiteEventCreateSerializer, {"location": "Berlin"})],
)
def test_new_session_adopts_series_cover(coach, kind, serializer, extra):
    chosen = photo("chosen")
    existing = create_session(serializer, coach, title="Morning Flow", **extra)
    design = kept(kind, "Morning Flow", chosen)

    new = create_session(serializer, coach, title="Morning Flow", **extra)
    other = create_session(serializer, coach, title="Evening Flow", **extra)

    new.refresh_from_db()
    other.refresh_from_db()
    assert new.thumbnail_id == chosen.pk
    assert other.thumbnail_id is None
    assert designs.cover_for(new, {})["id"] == str(design.pk)
    existing.refresh_from_db()
    assert existing.thumbnail_id == chosen.pk  # Keep wrote to it already


def test_new_session_keeps_the_cover_it_was_given(coach):
    chosen, hers = photo("chosen"), photo("hers")
    session(coach)
    kept("live", "Morning Flow", chosen)
    own = create_session(LiveClassCreateSerializer, coach, title="Morning Flow", thumbnail=str(hers.pk))
    assert own.thumbnail_id == hers.pk
    by_url = create_session(
        LiveClassCreateSerializer, coach, title="Morning Flow", thumbnail_url="https://x.test/a.jpg"
    )
    assert by_url.thumbnail_id is None


def test_new_session_of_a_photoless_series_or_gone_photo_stays_bare(coach):
    session(coach)
    kept("live", "Morning Flow", None)
    assert create_session(LiveClassCreateSerializer, coach, title="Morning Flow").thumbnail_id is None

    session(coach, title="Evening Flow")
    chosen = photo("chosen")
    kept("live", "Evening Flow", chosen)
    chosen.delete()
    assert create_session(LiveClassCreateSerializer, coach, title="Evening Flow").thumbnail_id is None


def test_renamed_session_leaves_series(coach):
    chosen, other = photo("chosen"), photo("other")
    stays, leaves = session(coach, days=1), session(coach, days=2)
    design = kept("live", "Morning Flow", chosen)

    leaves.title = "Evening Flow"
    leaves.save(update_fields=["title"])
    stays.refresh_from_db()
    leaves.refresh_from_db()
    assert designs.cover_for(stays, {})["id"] == str(design.pk)
    assert designs.cover_for(leaves, {}) is None  # it shows its photo plainly, like any other session

    _, inverse = designs.keep(designs.open_draft("live", "Morning Flow", recipe=on(other)))
    leaves.refresh_from_db()
    assert set(inverse["thumbnails"]) == {str(stays.pk)}
    assert leaves.thumbnail_id == chosen.pk


# --- photos in use ---------------------------------------------------------


def test_in_use_assets_names_the_course_or_series_using_each_photo(coach):
    catalog = Photo.objects.create(s3_key=build_s3_path("curated", "asset-9.webp"), title="stock")
    hers = Photo.objects.create(s3_key=build_s3_path("uploads", "mine.avif"), catalog_id="own-7")
    plain = photo("plain")  # neither a catalog copy nor in her index
    course(coach, title="Yoga Basics", thumbnail=catalog)
    course(coach, title="Uncovered")
    session(coach, thumbnail=hers, days=1)
    session(coach, thumbnail=hers, days=2)
    session(coach, title="Evening Flow", thumbnail=plain)

    assert designs.in_use_assets() == {"asset-9": "Yoga Basics", "own-7": "Morning Flow"}
