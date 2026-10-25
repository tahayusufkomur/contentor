"""The designs API (/api/v1/designs/): what she can design a cover for, her drafts, Keep, and who may use it.

Rows are made directly; the engine behind the endpoints is tested in test_designs.py.
"""

import uuid
from datetime import timedelta

import pytest
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django_tenants.utils import tenant_context
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import Domain, Tenant
from apps.core.storage import build_s3_path
from apps.courses.models import Course
from apps.downloads.models import DownloadFile
from apps.live.models import LiveClass, OnsiteEvent, ZoomClass
from apps.media import designs
from apps.media.models import Design, Photo
from apps.tenant_config.models import CopilotAudit, TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

HOST = "shared-test.localhost"
DESIGNS = "/api/v1/designs/"
TARGETS = "/api/v1/designs/targets/"
KEPT_REFUSED = "a kept cover can't be changed; edit a copy"


@pytest.fixture()
def coach(tenant_ctx):
    return User.objects.create_user(
        email="design-views-coach@x.com", name="Coach", password="x", role="owner", is_staff=True
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


@pytest.fixture()
def generated(tenant_ctx, settings):
    """3 of this month's 20 new photos used. The count lives in the cache and outlasts a run, so it
    is set here and cleared again."""
    from apps.core.curated_images.views import _count_key

    settings.CURATED_IMAGE_GENERATE_MONTHLY_LIMIT = 20
    cache.set(_count_key(), 3)
    yield
    cache.delete(_count_key())


def photo(name):
    # "demo/" is a shared prefix every tenant may be handed a link to.
    return Photo.objects.create(s3_key=f"demo/{name}.jpg", title=name)


def course(coach, title="Yoga Basics", thumbnail=None, **fields):
    return Course.objects.create(title=title, instructor=coach, thumbnail=thumbnail, **fields)


def session(coach, title="Morning Flow", thumbnail=None, days=3, model=LiveClass, **fields):
    when = timezone.now() + timedelta(days=days)
    return model.objects.create(title=title, instructor=coach, scheduled_at=when, thumbnail=thumbnail, **fields)


def on(picture):
    """A recipe drawn on this photo (none: title only)."""
    return {"photo": {"id": str(picture.pk) if picture else None}}


def kept(kind, key, picture):
    draft = designs.open_draft(kind, key, recipe=on(picture))
    designs.keep(draft)
    return draft


def url(design):
    return f"{DESIGNS}{design.pk}/"


# --- who may use it --------------------------------------------------------


def test_student_gets_403(tenant_ctx):
    student = User.objects.create_user(email="design-views-student@x.com", name="S", password="x", role="student")
    signed_in, anonymous = APIClient(HTTP_HOST=HOST), APIClient(HTTP_HOST=HOST)
    signed_in.force_authenticate(user=student)
    some = f"{DESIGNS}{uuid.uuid4()}/"
    calls = [
        ("GET", TARGETS),
        ("GET", DESIGNS),
        ("POST", DESIGNS),
        ("GET", some),
        ("PATCH", some),
        ("DELETE", some),
        ("POST", f"{some}keep/"),
    ]
    for method, path in calls:
        assert signed_in.generic(method, path).status_code == 403, (method, path)
        assert anonymous.generic(method, path).status_code in (401, 403), (method, path)


def test_designs_are_tenant_scoped(coach, tenant_ctx):
    made = designs.open_draft("course", str(course(coach).pk))
    connection.set_schema_to_public()
    other = Tenant.objects.create(
        schema_name="designs_other",
        name="Designs Other",
        slug="designs-other",
        subdomain="designs-other",
        owner_email="owner@designs-other.test",
        region="global",
    )
    Domain.objects.create(domain="designs-other.localhost", tenant=other, is_primary=True)
    try:
        other.create_schema(check_if_exists=True, verbosity=0)  # a copy of shared_test's, without its rows
        with tenant_context(other):
            outsider = User.objects.create_user(
                email="outsider@designs-other.test", name="Outsider", password="x", role="owner", is_staff=True
            )
        api = APIClient(HTTP_HOST="designs-other.localhost")
        api.force_authenticate(user=outsider)

        assert api.get(url(made)).status_code == 404
        assert api.patch(url(made), {"recipe": {}}, format="json").status_code == 404
        assert api.delete(url(made)).status_code == 404
        assert api.post(f"{url(made)}keep/").status_code == 404
        assert api.get(DESIGNS).json() == []
        assert api.get(TARGETS).json()["targets"] == []
    finally:
        connection.set_schema_to_public()
        Tenant.objects.get(pk=other.pk).delete(force_drop=True)
        connection.set_tenant(tenant_ctx)
    assert Design.objects.get(pk=made.pk).state == "draft"  # none of that touched it


# --- drafts ----------------------------------------------------------------


def test_create_then_patch_draft(coach, client):
    current = photo("current")
    item = course(coach, thumbnail=current)
    key = str(item.pk)

    created = client.post(DESIGNS, {"target_kind": "course", "target_key": key}, format="json")
    assert created.status_code == 201, created.content
    draft = created.json()
    assert (draft["kind"], draft["state"]) == ("cover", "draft")
    assert (draft["target_kind"], draft["target_key"]) == ("course", key)
    assert (draft["title"], draft["made_by"], draft["kept_at"]) == ("Yoga Basics", "", None)
    assert draft["recipe"]["photo"]["id"] == str(current.pk)  # it starts on the cover the course wears now
    assert draft["photos"][str(current.pk)].startswith("http")
    assert {"id", "run_id", "created_at", "updated_at", "logo_url", "look"} <= set(draft)

    # one draft per target: asking again returns it, whatever else is sent
    again = client.post(
        DESIGNS, {"target_kind": "course", "target_key": key, "recipe": {"layout": "full"}}, format="json"
    )
    assert again.status_code == 200
    assert (again.json()["id"], again.json()["recipe"]["layout"]) == (draft["id"], "panel")
    assert Design.objects.count() == 1

    path = f"{DESIGNS}{draft['id']}/"
    patched = client.patch(path, {"recipe": {"layout": "full", "words": {"title": "Start here"}}}, format="json")
    assert patched.status_code == 200, patched.content
    recipe = patched.json()["recipe"]
    assert (recipe["layout"], recipe["words"]["title"], recipe["version"]) == ("full", "Start here", 1)
    assert recipe["photo"]["id"] is None  # the recipe sent replaces the stored one; what it leaves out is default
    assert client.get(path).json()["recipe"] == recipe

    # a refused save changes nothing
    for body in ({"recipe": {"layout": "poster"}}, {"recipe": {"photo": {"id": str(uuid.uuid4())}}}, {}):
        assert client.patch(path, body, format="json").status_code == 400, body
    assert Design.objects.get(pk=draft["id"]).recipe == recipe

    assert client.delete(path).status_code == 204
    assert not Design.objects.exists()
    assert client.get(path).status_code == 404


def test_a_draft_whose_photo_was_deleted_can_still_be_saved(coach, client):
    gone, other = photo("gone"), photo("other")
    gone_id = str(gone.pk)  # delete() clears the instance's pk
    draft = designs.open_draft("course", str(course(coach).pk), recipe=on(gone))
    gone.delete()  # in Media, while the studio was open
    path = url(draft)

    # the editor sends the whole recipe back, the deleted photo's id included: her words still save
    saved = client.patch(path, {"recipe": {"photo": {"id": gone_id}, "words": {"title": "Start here"}}}, format="json")
    assert saved.status_code == 200, saved.content
    assert saved.json()["recipe"]["words"]["title"] == "Start here"
    assert saved.json()["recipe"]["photo"]["id"] == gone_id  # as it was: the renderer draws its placeholder
    assert saved.json()["photos"] == {}

    # that one id only: a different one still has to be one of her photos
    assert client.patch(path, {"recipe": {"photo": {"id": str(uuid.uuid4())}}}, format="json").status_code == 400
    assert Design.objects.get(pk=draft.pk).recipe["photo"]["id"] == gone_id
    swapped = client.patch(path, {"recipe": {"photo": {"id": str(other.pk)}}}, format="json")
    assert swapped.status_code == 200 and swapped.json()["recipe"]["photo"]["id"] == str(other.pk)


def test_a_title_with_a_nul_or_a_lone_surrogate_is_saved_without_it(coach, client):
    draft = designs.open_draft("course", str(course(coach).pk))
    # As a client writes them in JSON: the test client cannot send a lone surrogate itself.
    for body in (
        r'{"recipe": {"words": {"title": "Sp\u0000ring"}}}',
        r'{"recipe": {"words": {"title": "Sp\ud800ring"}}}',
    ):
        saved = client.generic("PATCH", url(draft), body, content_type="application/json")
        assert saved.status_code == 200, saved.content
        assert saved.json()["recipe"]["words"]["title"] == "Spring"


@pytest.mark.parametrize("key", [r"Sp\u0000ring", r"Sp\ud800ring"], ids=["nul", "lone-surrogate"])
def test_create_refuses_a_target_key_no_title_can_hold(coach, client, key):
    """No title holds a NUL or a lone surrogate and a query for one raises, so it is a 400 like any other key
    with nothing behind it. Sent as JSON text: the test client cannot send a lone surrogate itself."""
    for kind in ("live", "stream", "zoom", "onsite"):
        body = f'{{"target_kind": "{kind}", "target_key": "{key}"}}'
        refused = client.generic("POST", DESIGNS, body, content_type="application/json")
        assert refused.status_code == 400 and refused.json()["detail"], kind
    assert not Design.objects.exists()


def test_create_refuses_what_it_cannot_open(coach, client):
    item = course(coach)
    post = lambda body: client.post(DESIGNS, body, format="json")  # noqa: E731
    cannot = [
        {},
        {"target_kind": "bogus", "target_key": "x"},
        {"target_kind": "course", "target_key": "999999"},
        {"target_kind": "live", "target_key": "Nothing"},
        {"target_kind": "course", "target_key": str(item.pk), "from": str(uuid.uuid4())},
    ]
    for body in cannot:
        response = post(body)
        assert response.status_code == 400 and response.json()["detail"], body
    # a bad recipe is rendered as DRF renders a validation error
    bad = post({"target_kind": "course", "target_key": str(item.pk), "recipe": {"layout": "poster"}})
    assert bad.status_code == 400 and "layout" in str(bad.json())
    assert not Design.objects.exists()


def test_create_from_a_design_copies_its_recipe(coach, client):
    first, second = course(coach), course(coach, title="Other")
    done = designs.open_draft("course", str(first.pk), recipe={"layout": "framed", "words": {"label": "New"}})
    designs.keep(done)

    copy = client.post(
        DESIGNS, {"target_kind": "course", "target_key": str(second.pk), "from": str(done.pk)}, format="json"
    )

    assert copy.status_code == 201, copy.content
    assert copy.json()["id"] != str(done.pk) and copy.json()["state"] == "draft"
    assert copy.json()["recipe"] == done.recipe
    assert copy.json()["title"] == "Other"


def test_list_filters_by_state(coach, client):
    first, second = course(coach, "A"), course(coach, "B")
    draft = designs.open_draft("course", str(first.pk))
    retired = kept("course", str(second.pk), photo("one"))
    newest = kept("course", str(second.pk), photo("two"))  # retires the first
    series = session(coach)
    series_draft = designs.open_draft("live", series.title)
    assert Design.objects.get(pk=retired.pk).state == "retired"

    def listed(**params):
        response = client.get(DESIGNS, params)
        assert response.status_code == 200, response.content
        return {row["id"]: row for row in response.json()}

    everything = listed()
    assert set(everything) == {str(draft.pk), str(newest.pk), str(series_draft.pk)}  # a retired one is history
    assert set(listed(state="draft")) == {str(draft.pk), str(series_draft.pk)}
    assert set(listed(state="kept")) == {str(newest.pk)}
    assert everything[str(draft.pk)]["title"] == "A"
    assert everything[str(newest.pk)]["title"] == "B"
    assert everything[str(series_draft.pk)]["title"] == "Morning Flow"  # a series is its title
    assert client.get(DESIGNS, {"state": "retired"}).status_code == 400


def test_list_query_count_does_not_grow_with_designs(coach, client):
    def add(count, start):
        for number in range(start, start + count):
            item = course(coach, title=f"Course {number}")
            kept("course", str(item.pk), photo(f"kept{number}"))
            other = course(coach, title=f"Other {number}")
            designs.open_draft("course", str(other.pk), recipe=on(photo(f"draft{number}")))

    def queries(expected):
        with CaptureQueriesContext(connection) as captured:
            listed = client.get(DESIGNS).json()
        assert len(listed) == expected and all(row["photos"] for row in listed)
        return len(captured)

    add(2, 0)
    few = queries(4)
    add(3, 2)
    assert queries(10) == few


def test_patch_kept_refused(coach, client):
    item = course(coach)
    done = kept("course", str(item.pk), photo("chosen"))
    recipe = Design.objects.get(pk=done.pk).recipe

    for response in (client.patch(url(done), {"recipe": {"layout": "full"}}, format="json"), client.delete(url(done))):
        assert response.status_code == 400
        assert response.json()["detail"] == KEPT_REFUSED
    after = Design.objects.get(pk=done.pk)
    assert (after.state, after.recipe) == ("kept", recipe)
    assert client.get(url(done)).status_code == 200

    # "edit a copy": a draft started from it
    copy = client.post(
        DESIGNS, {"target_kind": "course", "target_key": str(item.pk), "from": str(done.pk)}, format="json"
    )
    assert copy.status_code == 201 and copy.json()["state"] == "draft"
    editable = client.patch(f"{DESIGNS}{copy.json()['id']}/", {"recipe": {"layout": "full"}}, format="json")
    assert editable.status_code == 200


def test_unknown_design_404(client):
    path = f"{DESIGNS}{uuid.uuid4()}/"
    assert client.get(path).status_code == 404
    assert client.patch(path, {"recipe": {}}, format="json").status_code == 404
    assert client.delete(path).status_code == 404
    assert client.post(f"{path}keep/").status_code == 404


# --- keep ------------------------------------------------------------------


def test_keep_records_history_row(coach, client):
    old, new = photo("old"), photo("new")
    item = course(coach, thumbnail=old)
    draft = designs.open_draft("course", str(item.pk), recipe=on(new), made_by="designer")

    response = client.post(f"{url(draft)}keep/")

    assert response.status_code == 200, response.content
    body = response.json()
    assert body["result"]["id"] == item.pk  # the record touched, which is what History reloads on
    assert body["result"]["design_id"] == str(draft.pk)
    row = CopilotAudit.objects.get(pk=body["audit_id"])
    assert row.kind == "keep_cover"
    assert row.summary == "Kept a new cover for 'Yoga Basics'"
    assert row.payload == {
        "kind": "keep_cover",
        "design_id": str(draft.pk),
        "title": "Yoga Basics",
        "made_by": "designer",
    }
    assert row.result == body["result"]  # passed through as the engine made it
    assert row.inverse["kind"] == "restore_cover_design"
    assert row.inverse["thumbnails"] == {str(item.pk): str(old.pk)}
    item.refresh_from_db()
    draft.refresh_from_db()
    assert (item.thumbnail_id, draft.state) == (new.pk, "kept")

    feed = {entry["id"]: entry for entry in client.get("/api/v1/admin/copilot/audit/").json()["entries"]}
    assert (feed[body["audit_id"]]["by"], feed[body["audit_id"]]["undoable"]) == ("designer", True)


def test_keep_refuses_what_it_cannot_keep(coach, client):
    item = course(coach)
    done = kept("course", str(item.pk), photo("chosen"))
    again = client.post(f"{url(done)}keep/")
    assert again.status_code == 400 and "draft" in again.json()["detail"]

    other = course(coach, title="Other")
    gone = photo("gone")
    draft = designs.open_draft("course", str(other.pk), recipe=on(gone))
    gone.delete()
    history = CopilotAudit.objects.count()  # History rows outlive the test that wrote them
    lost = client.post(f"{url(draft)}keep/")
    assert lost.status_code == 400 and "photo no longer exists" in lost.json()["detail"]
    assert Design.objects.get(pk=draft.pk).state == "draft"
    assert CopilotAudit.objects.count() == history  # nothing happened, so nothing is in History


# --- targets ---------------------------------------------------------------


def test_targets_lists_downloads_after_the_series(coach, client, site, generated):
    stock = Photo.objects.create(s3_key=build_s3_path("curated", "asset-4.webp"), title="stock")
    guide = DownloadFile.objects.create(title="Guide", thumbnail=stock)
    DownloadFile.objects.create(title="Draft guide", is_published=False)
    session(coach, "Morning Flow")
    design = kept("download", str(guide.pk), stock)

    body = client.get(TARGETS).json()

    assert [(t["target_kind"], t["title"]) for t in body["targets"]][0] == ("live", "Morning Flow")
    by_title = {t["title"]: t for t in body["targets"]}
    assert by_title["Guide"]["target_key"] == str(guide.pk)
    assert (by_title["Guide"]["status"], by_title["Guide"]["cover"]["id"]) == ("published", str(design.pk))
    assert by_title["Guide"]["created_at"] is not None
    assert (by_title["Draft guide"]["status"], by_title["Draft guide"]["photo_url"]) == ("draft", None)
    assert body["in_use"] == {"asset-4": "Guide"}


def test_targets_groups_series_and_marks_in_use(coach, client, site, generated):
    site.style, site.palette, site.logo, site.logo_url = "atelier", "dusk", None, "https://cdn.example.com/logo.png"
    site.save()
    stock = Photo.objects.create(s3_key=build_s3_path("curated", "asset-9.webp"), title="stock")
    hers = Photo.objects.create(s3_key=build_s3_path("uploads", "mine.avif"), catalog_id="own-7")

    yoga = course(coach, "Yoga Basics", thumbnail=stock, is_published=True)
    course(coach, "Breathwork", order=1)
    anatomy = course(coach, "Anatomy", order=1)
    morning = [session(coach, thumbnail=hers, days=day) for day in (3, 1, -2)]
    zoom = session(coach, "Zoom Circle", days=2, model=ZoomClass)
    lower = session(coach, "morning flow", days=5)  # not the same title, so not the same series
    session(coach, "Retreat", days=-10, model=OnsiteEvent)

    design = kept("course", str(yoga.pk), stock)
    anatomy_draft = designs.open_draft("course", str(anatomy.pk))
    morning_draft = designs.open_draft("live", "Morning Flow")

    response = client.get(TARGETS)

    assert response.status_code == 200, response.content
    body = response.json()
    assert set(body) == {
        "targets",
        "in_use",
        "look",
        "logo_url",
        "generations_left",
        "photo_ai",
        "cutout",
        "export",
        "words_ai",
    }
    assert body["look"] == "atelier:dusk"
    assert body["logo_url"] == "https://cdn.example.com/logo.png"
    assert body["generations_left"] == 17
    assert body["in_use"] == {"asset-9": "Yoga Basics", "own-7": "Morning Flow"}

    targets = body["targets"]
    # courses by order then title, then series by their next session; those with none last
    assert [(t["target_kind"], t["title"]) for t in targets] == [
        ("course", "Yoga Basics"),
        ("course", "Anatomy"),
        ("course", "Breathwork"),
        ("live", "Morning Flow"),
        ("zoom", "Zoom Circle"),
        ("live", "morning flow"),
        ("onsite", "Retreat"),
    ]
    by_title = {t["title"]: t for t in targets}
    assert {key for t in targets for key in t} == {
        "target_kind",
        "target_key",
        "title",
        "sessions",
        "next_at",
        "status",
        "created_at",
        "photo_url",
        "cover",
        "draft_id",
        "path",
    }
    # the page of her site each is on: what a QR code on its cover opens
    assert {t["target_kind"]: t["path"] for t in targets if t["target_kind"] != "course"} == {
        "live": "/events",
        "zoom": "/events",
        "onsite": "/events",
    }
    assert all(t["path"].startswith("/courses/") for t in targets if t["target_kind"] == "course")

    yoga_target = by_title["Yoga Basics"]
    assert (yoga_target["target_key"], yoga_target["status"]) == (str(yoga.pk), "published")
    assert yoga_target["photo_url"].startswith("http")
    assert yoga_target["cover"]["id"] == str(design.pk)
    assert yoga_target["cover"]["look"] == "atelier:dusk"
    assert (yoga_target["sessions"], yoga_target["next_at"], yoga_target["draft_id"]) == (None, None, None)
    assert (by_title["Breathwork"]["status"], by_title["Breathwork"]["photo_url"]) == ("draft", None)
    assert by_title["Breathwork"]["cover"] is None
    assert by_title["Anatomy"]["draft_id"] == str(anatomy_draft.pk)

    flow = by_title["Morning Flow"]
    assert (flow["target_key"], flow["sessions"], flow["status"]) == ("Morning Flow", 3, None)
    assert parse_datetime(flow["next_at"]) == morning[1].scheduled_at  # the soonest one still to come
    assert flow["draft_id"] == str(morning_draft.pk)
    assert flow["photo_url"].startswith("http")
    assert (by_title["Zoom Circle"]["sessions"], parse_datetime(by_title["Zoom Circle"]["next_at"])) == (
        1,
        zoom.scheduled_at,
    )
    assert by_title["morning flow"]["sessions"] == 1
    assert parse_datetime(by_title["morning flow"]["next_at"]) == lower.scheduled_at
    assert (by_title["Retreat"]["sessions"], by_title["Retreat"]["next_at"]) == (1, None)


def test_a_course_target_says_when_it_was_made_and_a_series_does_not(coach, client):
    """A course's cover can carry a "New" badge, which reads the course's creation date; a series' date
    badge reads its next session (`next_at`), so a series has no creation date to give."""
    fresh = course(coach, "Fresh course")
    old = course(coach, "Old course")
    Course.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=90))
    session(coach, "Morning Flow")

    response = client.get(TARGETS)

    assert response.status_code == 200, response.content
    targets = {target["title"]: target for target in response.json()["targets"]}
    assert parse_datetime(targets["Fresh course"]["created_at"]) == Course.objects.get(pk=fresh.pk).created_at
    assert parse_datetime(targets["Old course"]["created_at"]) == Course.objects.get(pk=old.pk).created_at
    assert Course.objects.get(pk=old.pk).created_at < timezone.now() - timedelta(days=60)  # the update took
    assert targets["Morning Flow"]["created_at"] is None


def test_targets_of_a_site_with_nothing_to_design(client, generated):
    body = client.get(TARGETS).json()
    assert body["targets"] == [] and body["in_use"] == {}
    assert body["generations_left"] == 17


def test_target_photo_url_falls_back_to_the_legacy_thumbnail_url(coach, client):
    """A row with no photo of its own can still wear the free-text link older rows carry: it lists with
    that link, signed the way the course serializers sign it."""
    chosen = photo("chosen")
    course(coach, "Link only", thumbnail_url="https://cdn.example.com/cover.jpg")
    course(coach, "Key only", thumbnail_url=build_s3_path("uploads", "old.jpg"))
    course(coach, "Not hers", thumbnail_url="tenants/someone-else/old.jpg")  # a key this site may not be handed
    course(coach, "Photo wins", thumbnail=chosen, thumbnail_url="https://cdn.example.com/old.jpg")
    course(coach, "Bare")
    session(coach, "Link class", thumbnail_url="https://cdn.example.com/class.jpg")

    response = client.get(TARGETS)

    assert response.status_code == 200, response.content
    targets = {target["title"]: target for target in response.json()["targets"]}
    assert targets["Link only"]["photo_url"] == "https://cdn.example.com/cover.jpg"
    assert "uploads/old.jpg" in targets["Key only"]["photo_url"]
    assert targets["Link class"]["photo_url"] == "https://cdn.example.com/class.jpg"  # a series, by its first row
    assert "demo/chosen.jpg" in targets["Photo wins"]["photo_url"]  # the photo, not the old link
    assert targets["Not hers"]["photo_url"] is None
    assert targets["Bare"]["photo_url"] is None


def test_targets_query_count_does_not_grow_with_rows(coach, client):
    def add(count, start):
        for number in range(start, start + count):
            picture = photo(f"p{number}")
            item = course(coach, title=f"Course {number}", thumbnail=picture)
            kept("course", str(item.pk), picture)
            designs.open_draft("course", str(item.pk))
            session(coach, title=f"Class {number}", thumbnail=picture, days=number + 1)
            kept("live", f"Class {number}", picture)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            assert client.get(TARGETS).status_code == 200
        return len(captured)

    add(2, 0)
    few = queries()
    add(3, 2)
    assert queries() == few
