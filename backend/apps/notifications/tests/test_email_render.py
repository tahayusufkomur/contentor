import pytest

from apps.notifications import email_render
from apps.notifications.models import Announcement
from apps.tenant_config.models import TenantConfig
from apps.tenant_config.sections import primary_hex

pytestmark = pytest.mark.django_db(transaction=True)


def _cfg(**kw):
    # Reuse-and-reset in place — never delete the tenant's shared TenantConfig
    # row. See test_announcement_email.py's _cfg() for why: under
    # pytest-xdist, TenantConfig.objects.all().delete() here can delete the
    # row a concurrently-running worker's test (e.g. tenant_config's
    # test_setup_status.py) is mid-request on, raising DoesNotExist there.
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Zen")
    cfg.brand_name = kw.pop("brand_name", "Zen")
    cfg.style = kw.pop("style", "journal")
    for field, value in kw.items():
        setattr(cfg, field, value)
    cfg.save()
    return cfg


def test_render_has_title_cta_and_unsub(tenant_ctx):
    cfg = _cfg()
    a = Announcement.objects.create(title="Hello", body="<p>Body</p>", link="/courses/x", filters_json={})
    a.email_unsub_url = "https://t.example.com/unsub"
    subject, html = email_render.announcement_email_html(a, cfg, "https://t.example.com")
    assert subject == "Hello"
    assert "Body" in html
    assert "https://t.example.com/courses/x" in html  # CTA absolute
    assert "unsubscribe" in html.lower()
    assert primary_hex("journal") in html  # the look's brand colour


def test_unsubscribe_token_roundtrip(tenant_ctx):
    token = email_render.unsubscribe_url(tenant_ctx, email="a@b.com").split("t=")[1]
    data = email_render.decode_unsubscribe(token)
    assert data["email"] == "a@b.com"
    assert data["schema"] == tenant_ctx.schema_name
