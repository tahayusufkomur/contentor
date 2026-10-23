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
    # A colourway left by another test (the copilot's edit_style one sets
    # "sage") would recolour the email: reset it with the style.
    cfg.palette = kw.pop("palette", "")
    for field, value in kw.items():
        setattr(cfg, field, value)
    cfg.save()
    return cfg


def _html(tenant, announcement):
    """An announcement email, as the engine draws it."""
    from apps.notifications import transactional

    email = email_render.announcement_email(announcement, "https://t.example.com", "https://t.example.com/unsub")
    return email.subject, transactional.render(email, tenant)


def test_render_has_title_cta_and_unsub(tenant_ctx):
    _cfg()
    a = Announcement.objects.create(title="Hello", body="<p>Body</p>", link="/courses/x", filters_json={})
    subject, html = _html(tenant_ctx, a)
    assert subject == "Hello"
    assert "Body" in html
    assert "https://t.example.com/courses/x" in html  # CTA absolute
    assert "unsubscribe" in html.lower()
    assert primary_hex("journal") in html  # the look's brand colour


def test_a_title_is_text_in_the_email_never_markup(tenant_ctx):
    _cfg()
    a = Announcement.objects.create(title="<b>New</b> <script>alert(1)</script>", body="<p>Body</p>", filters_json={})
    _subject, html = _html(tenant_ctx, a)
    assert "<script" not in html and "<b>" not in html
    assert "&lt;b&gt;New&lt;/b&gt; &lt;script&gt;alert(1)&lt;/script&gt;" in html


def test_unsubscribe_token_roundtrip(tenant_ctx):
    token = email_render.unsubscribe_url(tenant_ctx, email="a@b.com").split("t=")[1]
    data = email_render.decode_unsubscribe(token)
    assert data["email"] == "a@b.com"
    assert data["schema"] == tenant_ctx.schema_name
