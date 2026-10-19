"""A download in focus mode (apps.core.focus.kinds.download): its draft is an
unpublished DownloadFile from her first answer (G4), the file question is
answered by the upload completing or "Add it later", and it goes live only
with a file, by her finish tap. The copy job itself is tested in
test_focus_copy.py."""

from decimal import Decimal
from unittest import mock

import pytest
from django.contrib.contenttypes.models import ContentType
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess
from apps.core import tasks
from apps.core.focus import copywriter, flow, pricing
from apps.core.focus.kinds import download
from apps.downloads.models import DownloadFile
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)

TOPIC = "A workbook for new runners"
FILE = "tenants/shared_test/downloads/runner-workbook.pdf"


@pytest.fixture()
def owner(tenant_ctx):
    TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Studio")
    return User.objects.create_user(
        email="focus-download@x.com",
        name="Owner",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture(autouse=True)
def on(settings):
    settings.FOCUS_KINDS = ["course", "download"]
    with mock.patch.object(tasks.run_focus_job, "delay"):
        yield


def _row(creation):
    return DownloadFile.objects.get(pk=creation.record_id)


def _give_file(creation):
    """The upload chain's last step (``upload/complete``): the file is on the draft."""
    DownloadFile.objects.filter(pk=creation.record_id).update(file_url=FILE, file_size=2_400_000)


def _at_finish(owner, *, file=True):
    """A download answered up to the finish step, free; ``file``: uploaded, else "Add it later"."""
    creation = flow.start(owner, "download", value=TOPIC)
    assert flow.current_field(creation) == "file"
    if file:
        _give_file(creation)
    creation = flow.answer(creation, "file", value="uploaded" if file else "later")
    assert flow.current_field(creation) == "review"
    creation.answers = {**creation.answers, "review": "ok", "cover": "later"}
    creation.save()
    creation = flow.answer(creation, "access", value="free")
    assert flow.current_field(creation) == "finish"
    return creation


def _student_sees(row) -> bool:
    student = User.objects.filter(email="student@x.com").first() or User.objects.create_user(
        email="student@x.com",
        name="S",
        password="x",
        role="student",  # noqa: S106
    )
    client = APIClient(HTTP_HOST="shared-test.localhost")
    client.force_authenticate(user=student)
    ids = [d["id"] for d in client.get("/api/v1/downloads/").json()["results"]]
    return row.pk in ids


# ── The brief's tests ───────────────────────────────────────────────────────


def test_a_draft_download_is_unpublished_until_finish(owner):
    creation = flow.start(owner, "download", value=TOPIC)
    row = _row(creation)
    assert (row.title, row.is_published) == ("Workbook for new runners", False)
    body = flow.state(creation)
    assert body["record"] == {
        "id": row.pk,
        "kind": "download",
        "title": "Workbook for new runners",
        "path": f"/admin/downloads/{row.pk}",
    }
    assert body["question"]["field"] == "file" and body["question"]["kind"] == "upload"
    assert body["question"]["specialist"] == "content"
    assert body["question"]["options"] == [{"value": "later", "label": "Add it later", "hint": ""}]

    creation = _at_finish(owner)
    assert not _row(creation).is_published
    assert not _student_sees(_row(creation))
    creation = flow.finish(creation, publish=True)
    assert _row(creation).is_published
    assert creation.answers["finish"] == "publish"
    assert _student_sees(_row(creation))


def test_publish_is_refused_without_a_file(owner):
    creation = _at_finish(owner, file=False)
    assert download.not_ready(_row(creation)) == "Add the file first"
    creation = flow.finish(creation, publish=True)
    assert not _row(creation).is_published
    assert creation.answers["finish"] == "draft"


def test_the_kept_line_asks_for_the_file_only_when_it_is_missing(owner):
    with_file = flow.finish(_at_finish(owner), publish=False)
    assert flow.closing_line(with_file) == "Saved as a draft. Publish it from this page when you're ready."
    without = flow.finish(_at_finish(owner, file=False), publish=False)
    assert (
        flow.closing_line(without) == "Saved as a draft. Add the file and publish it from this page when you're ready."
    )


def test_add_it_later_moves_on_and_finish_offers_only_keep(owner):
    creation = flow.start(owner, "download", value=TOPIC)
    creation = flow.answer(creation, "file", value="later")
    assert flow.current_field(creation) == "review"
    assert creation.runs.get("copy")  # the copy job waits for the file question, then drafts
    creation = _at_finish(owner, file=False)
    asked = flow.state(creation)["question"]
    assert [o["value"] for o in asked["options"]] == ["draft"]
    assert asked["why"].startswith("Add the file first.")
    assert asked["question"] == download.NOT_READY_LINE


def test_the_first_question_offers_four_format_starters(tenant_ctx):
    asked = flow.question("download", "topic")
    assert asked["starters"] == [
        {"label": "A workbook", "starter": "A workbook on "},
        {"label": "A checklist", "starter": "A checklist for "},
        {"label": "A recording", "starter": "A recording of "},
        {"label": "A template", "starter": "A template for "},
    ]
    assert (asked["starter"], asked["can_delegate"]) == ("A ", True)  # "My own idea…" and "You decide"
    assert "starters" not in flow.question("course", "topic")
    assert flow.working_title("A workbook on easy 5k plans", "download") == "Workbook on easy 5k plans"


# ── The file question ───────────────────────────────────────────────────────


def test_uploaded_without_a_file_is_asked_again(owner):
    creation = flow.start(owner, "download", value=TOPIC)
    creation = flow.answer(creation, "file", value="uploaded")
    assert flow.current_field(creation) == "file"
    assert "file" not in creation.answers


def test_a_file_dropped_on_the_page_answers_the_file_question(owner):
    creation = flow.start(owner, "download", value=TOPIC)
    _give_file(creation)  # dropped on the page's file row while the guide asked something else
    creation = flow.answer(creation, "file", value="uploaded")
    assert creation.answers["file"] == "uploaded"
    assert flow.state(creation)["answered"][-1] == {"field": "file", "label": "File added"}


def test_her_typed_words_at_the_file_question_are_not_an_answer(owner):
    creation = flow.start(owner, "download", value=TOPIC)
    with mock.patch("apps.core.onboarding.ai_compose.compose_available", return_value=False):
        creation = flow.answer(creation, "file", text="it's a pdf, I'll send it tonight")
    creation.refresh_from_db()
    assert flow.current_field(creation) == "file"


# ── Price, plan, copy and cover ─────────────────────────────────────────────


def test_suggest_price_reads_her_published_paid_downloads(owner):
    draft = DownloadFile.objects.create(title="Draft", is_published=False)
    assert (download.suggest_price(draft).amount, download.suggest_price(draft).reason) == (9, pricing.FALLBACK)
    DownloadFile.objects.create(title="Hidden", pricing_type="paid", price=Decimal("50"), is_published=False)
    assert download.suggest_price(draft).amount == 9  # a draft sells nothing
    DownloadFile.objects.create(title="No file yet", pricing_type="paid", price=Decimal("80"))
    assert download.suggest_price(draft).amount == 9  # not on sale without a file: never "sells for"
    DownloadFile.objects.create(title="Meal plan", pricing_type="paid", price=Decimal("12.40"), file_url=FILE)
    s = download.suggest_price(draft)
    assert s.amount == 12 and s.reason.startswith("Meal plan sells for")


def test_a_paid_price_and_a_membership_go_on_the_draft(owner):
    creation = flow.start(owner, "download", value=TOPIC)
    download.set_price(creation.record_id, "19.50")
    assert (_row(creation).pricing_type, _row(creation).price) == ("paid", Decimal("19.50"))
    plan = SubscriptionPlan.objects.create(name="All access", price=Decimal("20"), is_active=True)
    download.put_in_plan(creation.record_id, plan)
    assert _row(creation).pricing_type == "subscription"
    ct = ContentType.objects.get_for_model(DownloadFile)
    assert SubscriptionPlanAccess.objects.filter(plan=plan, content_type=ct, object_id=creation.record_id).exists()


def test_copy_facts_carry_the_file_name_and_size(owner):
    creation = flow.start(owner, "download", value=TOPIC)
    _give_file(creation)
    facts = download.copy_facts(creation, _row(creation))
    assert facts["topic"] == TOPIC
    assert (facts["file_name"], facts["file_size"]) == ("runner-workbook.pdf", "2.3 MB")
    assert copywriter.drafts("download")
    assert download.cover_target(_row(creation)) == ("download", str(creation.record_id))


def test_a_copy_finishing_after_publish_writes_nothing(owner):
    creation = flow.start(owner, "download", value=TOPIC)
    DownloadFile.objects.filter(pk=creation.record_id).update(is_published=True)
    assert copywriter._gone(creation, _row(creation))
