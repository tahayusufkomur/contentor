import pytest

from apps.accounts.models import User
from apps.courses.models import Course, Lesson, Module
from apps.tenant_config.models import SeededObject
from apps.tenant_config.seeding import fingerprint_for, register_seeded

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="own@x.com",
        name="Own",
        password="x",  # noqa: S106
        role="owner",
        is_staff=True,
    )


@pytest.fixture()
def course(owner):
    c = Course.objects.create(title="Demo A", slug="demo-a-seedtest", instructor=owner)
    m = Module.objects.create(course=c, title="M1", order=1)
    Lesson.objects.create(module=m, title="L1", order=1, content_html="<p>hi</p>")
    yield c
    SeededObject.objects.all().delete()
    c.delete()


def test_fingerprint_stable_and_lesson_sensitive(course):
    fp1 = fingerprint_for(course)
    assert fp1 == fingerprint_for(course)  # stable across recomputes
    lesson = Lesson.objects.get(module__course=course)
    lesson.content_html = "<p>coach edited this</p>"
    lesson.save()
    assert fingerprint_for(course) != fp1  # lesson edits protect the course


def test_register_seeded_idempotent(course):
    register_seeded([course], niche="general")
    register_seeded([course], niche="general")  # re-run must not raise
    rows = SeededObject.objects.all()
    assert rows.count() == 1
    row = rows.get()
    assert row.object_id == str(course.pk)
    assert row.niche == "general"
    assert row.fingerprint == fingerprint_for(course)


def test_seed_template_registers_all_objects(tenant_ctx, owner):
    """Real seed run: everything created gets a registry row. Cleans up via
    the registry itself so the shared test schema stays usable."""
    from django.db import connection
    from django.forms.models import model_to_dict

    from apps.core.demo.seed_template import seed_template_into_tenant
    from apps.courses.models import Course as CourseModel
    from apps.downloads.models import DownloadFile
    from apps.media.models import Photo
    from apps.tenant_config.models import TenantConfig

    tenant = connection.tenant
    tenant.owner_email = owner.email
    # transaction=True tests don't roll back: snapshot the shared schema's
    # TenantConfig so the seeder's CONFIG merge can be undone afterwards.
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="T")
    cfg_snapshot = model_to_dict(cfg)
    seed_template_into_tenant(tenant, "general")
    try:
        registered = SeededObject.objects.count()
        assert registered > 0
        # Spot-check coverage: every seeded course/download/photo is registered.
        from django.contrib.contenttypes.models import ContentType

        for model in (CourseModel, DownloadFile, Photo):
            ct = ContentType.objects.get_for_model(model)
            assert SeededObject.objects.filter(content_type=ct).count() == model.objects.count(), model
    finally:
        # Tear down by walking the registry (order: content, then media).
        for row in SeededObject.objects.select_related("content_type"):
            model = row.content_type.model_class()
            model.objects.filter(pk=row.object_id).delete()
            row.delete()
        # Restore the shared TenantConfig the seeder merged into.
        cfg.refresh_from_db()
        for field, value in cfg_snapshot.items():
            if field not in ("id", "logo"):
                setattr(cfg, field, value)
        cfg.save()
