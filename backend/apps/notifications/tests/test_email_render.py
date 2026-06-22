import pytest

from apps.notifications import email_render
from apps.notifications.models import Announcement
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def _cfg(**kw):
    TenantConfig.objects.all().delete()
    return TenantConfig.objects.create(brand_name=kw.pop("brand_name", "Zen"), theme=kw.pop("theme", "ocean"), **kw)


def test_render_has_title_cta_and_unsub(tenant_ctx):
    cfg = _cfg()
    a = Announcement.objects.create(title="Hello", body="<p>Body</p>", link="/courses/x", filters_json={})
    a.email_unsub_url = "https://t.example.com/unsub"
    subject, html = email_render.announcement_email_html(a, cfg, "https://t.example.com")
    assert subject == "Hello"
    assert "Body" in html
    assert "https://t.example.com/courses/x" in html  # CTA absolute
    assert "unsubscribe" in html.lower()
    assert email_render.THEME_EMAIL_COLORS["ocean"] in html


def test_unsubscribe_token_roundtrip(tenant_ctx):
    token = email_render.unsubscribe_url(tenant_ctx, email="a@b.com").split("t=")[1]
    data = email_render.decode_unsubscribe(token)
    assert data["email"] == "a@b.com"
    assert data["schema"] == tenant_ctx.schema_name
