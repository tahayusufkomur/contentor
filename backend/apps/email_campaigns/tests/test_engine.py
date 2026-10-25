"""The email engine: the renderer (MailCraft's, ported), her brand kit and tokens, her catalog in item
blocks, lasting picture links, cleaning what is stored, and the templates made for her at setup."""

import io
import re
from datetime import timedelta
from unittest import mock

import pytest
from django.core import signing
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.blog.models import BlogPost
from apps.courses.models import Course
from apps.email_campaigns import brand, catalog, images, render, starters
from apps.email_campaigns.models import EmailTemplate, TemplateSource
from apps.live.models import LiveClass
from apps.media.models import Photo
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db

SITE = "http://shared-test.localhost"
KEY = "tenants/shared-test/photo/"
KIT = {
    "name": "Glow <Studio>",
    "site": "https://glow.test",
    "host": "glow.test",
    "logo": "https://glow.test/logo.png",
    "mark": "https://glow.test/pwa-icon?size=192",
    "colors": {**brand.FALLBACK_COLORS, "primary": "#123456"},
    "fonts": {"heading": "'Newsreader', Georgia, serif", "body": "Helvetica, Arial, sans-serif"},
    "radius": 8,
    "socials": [{"network": "instagram", "url": "https://instagram.com/glow"}],
    "address": "1 Studio Lane",
    "language": "en",
}


def _design(*body, header=(), footer=()):
    return {
        "version": 1,
        "settings": {"backgroundColor": "brand:surface", "bodyBackgroundColor": "#ffffff", "defaultFont": "brand:body"},
        "header": {"blocks": list(header)},
        "body": {"blocks": list(body)},
        "footer": {"blocks": list(footer)},
    }


def _block(kind, data=None, **style):
    return {"id": f"{kind}-1", "type": kind, "data": data or {}, "style": style}


@pytest.fixture()
def config(tenant_ctx):
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Glow")
    cfg.brand_name, cfg.style, cfg.palette, cfg.timezone = "Glow", "journal", "", "Europe/Berlin"
    cfg.social_links = {"instagram": "https://instagram.com/glow", "tiktok": "", "x": "not a link"}
    cfg.navbar_config = {"links": [{"href": "/about", "label": "About me"}, {"href": "https://elsewhere.test/x"}]}
    cfg.save()
    return cfg


@pytest.fixture()
def owner(tenant_ctx):
    return User.objects.create_user(
        email="owner@glow.test",
        name="Ana Lind",
        password="secret123",  # noqa: S106  # pragma: allowlist secret
        role="owner",
    )


# ── the renderer ───────────────────────────────────────────────────────────────────────────────


def test_tokens_links_and_items_resolve_before_drawing():
    design = _design(
        _block("heading", {"text": "Hi"}, color="brand:primary", fontFamily="brand:heading"),
        _block("button", {"text": "Go", "url": "/courses/yoga"}, backgroundColor="brand:accent"),
        _block("text", {"html": '<p>See <a href="/about">me</a></p>'}, color="brand:nope"),
        {"id": "i1", "type": "item", "data": {"ref": "course:1"}, "style": {}},
        {"id": "i2", "type": "item", "data": {"ref": "course:404"}, "style": {}},
    )
    item = {"ref": "course:1", "title": "Yoga", "url": "https://glow.test/courses/yoga", "image": "", "meta": "€49"}
    resolved, warnings = brand.resolve(design, KIT, {"course:1": item})

    heading, button, text, found, missing = resolved["body"]["blocks"]
    assert (heading["style"]["color"], heading["style"]["fontFamily"]) == ("#123456", KIT["fonts"]["heading"])
    assert button["data"]["url"] == "https://glow.test/courses/yoga"
    assert 'href="https://glow.test/about"' in text["data"]["html"]
    assert text["style"]["color"] == "brand:nope"  # not a token: left as written (and drawn in the default)
    assert found["data"]["_item"] == item and "_item" not in missing["data"]
    assert len(warnings) == 1 and "course:404" in warnings[0]
    assert design["body"]["blocks"][0]["style"]["color"] == "brand:primary"  # the stored design is untouched


def test_the_rendered_email_is_table_html_with_her_brand_and_no_tokens():
    design = _design(
        _block("heading", {"text": "<b>Spring</b>"}, color="brand:primary"),
        header=[_block("brandHeader", {"variant": "logoName"})],
        footer=[_block("brandFooter", {"showSocial": True, "showAddress": True, "note": "Hi & bye"})],
    )
    resolved, _ = brand.resolve(design, KIT, {})
    html = render.render(resolved, kit=KIT, subject="Spring <news>", preheader="Soon")

    assert "brand:" not in html and "<b>Spring</b>" not in html and "&lt;b&gt;Spring&lt;/b&gt;" in html
    assert "<title>Spring &lt;news&gt;</title>" in html
    assert 'src="https://glow.test/logo.png"' in html and "Glow &lt;Studio&gt;" in html
    assert "/static/email/social/instagram-dark.png" in html and "https://instagram.com/glow" in html
    assert "1 Studio Lane" in html and "Hi &amp; bye" in html
    assert "{{UnsubscribeUrl}}" in html
    assert "Soon" in html.split("<body", 1)[1][:400]  # the hidden preview line comes first
    assert "data:image" not in html and ".svg" not in html  # nothing an inbox hides


def test_personalize_escapes_values_and_drops_the_unsubscribe_link_when_there_is_none():
    html = render.render(
        _design(_block("text", {"html": "<p>Hi {{FirstName}}</p>"}), footer=[_block("brandFooter")]), kit=KIT
    )
    mine = render.personalize(html, {"FirstName": "<script>", "UnsubscribeUrl": "https://glow.test/u?t=a&b"})
    assert "Hi &lt;script&gt;" in mine and 'href="https://glow.test/u?t=a&amp;b"' in mine
    receipt = render.personalize(html, {"FirstName": "Bo"})
    assert "Unsubscribe" not in receipt and "{{UnsubscribeUrl}}" not in receipt
    # A subject line or the plain-text part takes the name as written.
    assert render.personalize("Hi {{FirstName}}", {"FirstName": "D'Arcy"}, escape=False) == "Hi D'Arcy"


def test_an_item_block_shows_its_picture_title_price_and_button():
    item = {
        "title": "Face Yoga",
        "summary": "Ten minutes a day.",
        "meta": "€49",
        "url": "https://glow.test/courses/face",
        "image": "https://glow.test/api/v1/email/i/tok/",
    }
    card = {"id": "i", "type": "item", "data": {"layout": "card", "buttonText": "Join", "_item": item}, "style": {}}
    row = {**card, "data": {**card["data"], "layout": "row"}}
    html_card = render.render(_design(card), kit=KIT)
    html_row = render.render(_design(row), kit=KIT)
    for html in (html_card, html_row):
        assert "Face Yoga" in html and "€49" in html and "Ten minutes a day." in html and "Join" in html
        assert html.count('href="https://glow.test/courses/face"') >= 2  # the title and the button
    assert "/api/v1/email/i/tok/?a=16:9" in html_card and "/api/v1/email/i/tok/?a=1:1" in html_row
    gone = {"id": "i", "type": "item", "data": {"ref": "course:9"}, "style": {}}
    assert "Face Yoga" not in render.render(_design(gone), kit=KIT)


def test_social_icons_are_hosted_pngs_and_lucide_icons_fall_back_to_text():
    social = _block("social", {"platforms": [{"type": "twitter", "url": "https://x.com/glow"}, {"type": "myspace"}]})
    card = _block(
        "card", {"heading": "H", "showIcon": True, "iconMode": "lucide", "iconName": "star", "iconEmoji": "🌿"}
    )
    html = render.render(_design(social, card), kit=KIT)
    assert "https://glow.test/static/email/social/x-color.png" in html and "myspace" not in html.lower()
    assert "🌿" in html and "data:image/svg" not in html


def test_style_values_never_break_out_of_their_attribute():
    evil = '#fff" onmouseover="alert(1)'
    design = _design(
        _block("button", {"text": "x", "url": "#"}, backgroundColor=evil, fontFamily='x"; background:url(a)')
    )
    html = render.render(design, kit=KIT)
    assert "onmouseover" not in html and "url(a)" not in html


# ── cleaning what is stored ────────────────────────────────────────────────────────────────────


def test_clean_design_keeps_known_blocks_and_safe_rich_text():
    design = _design(
        _block("text", {"html": '<p onclick="x()">Hi <script>alert(1)</script><a href="javascript:x">a</a></p>'}),
        _block("bogus"),
        {
            "id": "c",
            "type": "columns",
            "data": {"columns": [{"id": "k", "blocks": [_block("html", {"html": "<img src=x onerror=y>"})]}]},
            "style": {},
        },
        {"id": "i", "type": "item", "data": {"ref": "course:1", "_item": {"title": "stale"}}, "style": {}},
    )
    clean = brand.clean_design(design)
    text, columns, item = clean["body"]["blocks"]
    assert "script" not in text["data"]["html"] and "onclick" not in text["data"]["html"]
    assert "javascript" not in text["data"]["html"]
    assert "onerror" not in columns["data"]["columns"][0]["blocks"][0]["data"]["html"]
    assert "_item" not in item["data"]
    with pytest.raises(brand.DesignError):
        brand.clean_design({"body": {"blocks": [_block("spacer")] * (brand.MAX_BLOCKS + 1)}})
    with pytest.raises(brand.DesignError):
        brand.clean_design("not a design")


def test_the_text_part_reads_like_the_email():
    item = {"title": "Face Yoga", "meta": "€49", "url": "https://glow.test/c"}
    design = _design(
        _block("heading", {"text": "Spring"}),
        _block("text", {"html": "<p>It&#x27;s here</p><ul><li>One</li></ul>"}),
        _block("button", {"text": "Go", "url": "https://glow.test/go"}),
        {"id": "i", "type": "item", "data": {"_item": item}, "style": {}},
    )
    text = brand.to_text(design, KIT)
    assert "Spring" in text and "It's here" in text and "Go: https://glow.test/go" in text
    assert "Face Yoga" in text and "https://glow.test/c" in text


# ── her kit and her catalog ────────────────────────────────────────────────────────────────────


def test_the_kit_comes_from_her_look_logo_and_socials(tenant_ctx, config):
    config.logo = Photo.objects.create(s3_key=f"{KEY}logo.png")
    config.save(update_fields=["logo"])
    kit = brand.kit(tenant_ctx)
    assert (kit["name"], kit["site"], kit["host"]) == ("Glow", SITE, "shared-test.localhost")
    assert kit["colors"]["primary"] == "#2c2520" and kit["colors"]["muted"] == "#645c55"
    assert kit["fonts"]["heading"] == "'Newsreader', Georgia, serif"
    assert kit["socials"] == [{"network": "instagram", "url": "https://instagram.com/glow"}]
    assert kit["logo"].startswith(f"{SITE}/api/v1/email/i/") and kit["mark"] == f"{SITE}/pwa-icon?size=192"
    token = kit["logo"].split("/i/", 1)[1].rstrip("/")
    assert signing.loads(token, salt="email_campaigns.image") == f"{KEY}logo.png"


def test_her_catalog_links_her_live_pages_and_nothing_else(tenant_ctx, config, owner):
    cover = Photo.objects.create(s3_key=f"{KEY}cover.avif")
    course = Course.objects.create(
        title="Face Yoga", slug="face", description="<p>Ten minutes</p>", instructor=owner, price=49,
        pricing_type="paid", is_published=True, thumbnail=cover,
    )  # fmt: skip
    Course.objects.create(title="Draft", slug="draft", instructor=owner, is_published=False)
    soon = LiveClass.objects.create(title="Morning", instructor=owner, scheduled_at=timezone.now() + timedelta(days=2))
    LiveClass.objects.create(title="Old", instructor=owner, scheduled_at=timezone.now() - timedelta(days=2))
    BlogPost.objects.create(title="Why", slug="why", status="published")

    items = {i["ref"]: i for i in catalog.items(tenant_ctx)}
    assert items[f"course:{course.id}"]["url"] == f"{SITE}/courses/face"
    assert items[f"course:{course.id}"]["image"].startswith(f"{SITE}/api/v1/email/i/")
    assert items[f"course:{course.id}"]["summary"] == "Ten minutes"
    assert items[f"course:{course.id}"]["meta"].endswith("49")
    assert [i["title"] for i in items.values() if i["kind"] == "course"] == ["Face Yoga"]
    assert f"live:{soon.id}" in items and items[f"live:{soon.id}"]["kindLabel"] == "Live session"
    assert [i["title"] for i in items.values() if i["kind"] == "live"] == ["Morning"]
    assert items["page:about"]["url"] == f"{SITE}/about"
    assert not [i for i in items.values() if "elsewhere" in i["url"]]

    found = catalog.find(
        ["next:event", "latest:course", f"course:{course.id}", "course:999999", "latest:post"], tenant_ctx
    )
    assert found["next:event"]["title"] == "Morning" and found["latest:course"]["title"] == "Face Yoga"
    assert found["latest:post"]["title"] == "Why" and "course:999999" not in found


# ── lasting picture links ──────────────────────────────────────────────────────────────────────


class _S3:
    """An in-memory bucket with the two calls the image route makes."""

    def __init__(self, objects):
        self.objects = dict(objects)

    def get_object(self, Bucket, Key):  # noqa: N803 — boto3's names
        from botocore.exceptions import ClientError

        if Key not in self.objects:
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        body, ctype = self.objects[Key]
        return {"Body": io.BytesIO(body), "ContentType": ctype, "ContentLength": len(body)}

    def put_object(self, Bucket, Key, Body, ContentType):  # noqa: N803
        self.objects[Key] = (Body, ContentType)


def _avif(width=1600, height=1200):
    out = io.BytesIO()
    Image.new("RGB", (width, height), (200, 120, 90)).save(out, "AVIF")
    return out.getvalue()


def test_a_picture_link_streams_an_email_safe_copy_made_once(tenant_ctx):
    bucket = _S3({f"{KEY}a.avif": (_avif(), "image/avif")})
    url = images.stable_url(f"{KEY}a.avif", site=SITE)
    client = APIClient(HTTP_HOST="shared-test.localhost")
    with mock.patch.object(images, "get_s3_client", return_value=bucket):
        r = client.get(url.split(SITE, 1)[1] + "?a=16:9")
        again = client.get(url.split(SITE, 1)[1] + "?a=16:9")
    assert r.status_code == 200 and r["Content-Type"] == "image/jpeg" and "immutable" in r["Cache-Control"]
    picture = Image.open(io.BytesIO(r.content))
    assert picture.format == "JPEG" and picture.width == 1200 and abs(picture.width / picture.height - 16 / 9) < 0.02
    assert again.content == r.content and len(bucket.objects) == 2  # the copy is kept, not remade


def test_only_signed_keys_of_this_site_are_served(tenant_ctx):
    client = APIClient(HTTP_HOST="shared-test.localhost")
    other = images.stable_url("tenants/someone-else/photo/a.jpg", site=SITE).split(SITE, 1)[1]
    with mock.patch.object(images, "get_s3_client", return_value=_S3({})):
        assert client.get("/api/v1/email/i/not-a-token/").status_code == 404
        assert client.get(other).status_code == 404
        missing = images.stable_url(f"{KEY}gone.jpg", site=SITE).split(SITE, 1)[1]
        assert client.get(missing).status_code == 404


def test_outside_links_stay_and_only_our_route_takes_a_crop(settings):
    settings.AWS_BUCKET_NAME = "contentor-dev-private"
    assert images.stable_url_for(stored="https://cdn.test/a.jpg", site=SITE) == "https://cdn.test/a.jpg"
    expiring = "http://localhost:9000/contentor-dev-private/tenants/shared-test/photo/a%20b.png?X-Amz-Expires=3600"
    lasting = images.stable_url_for(stored=expiring, site=SITE)
    assert lasting.startswith(f"{SITE}/api/v1/email/i/")
    assert signing.loads(lasting.split("/i/", 1)[1].rstrip("/"), salt="email_campaigns.image") == (
        "tenants/shared-test/photo/a b.png"
    )
    assert images.with_aspect("https://cdn.test/a.jpg", "1:1") == "https://cdn.test/a.jpg"
    assert images.with_aspect(f"{SITE}/api/v1/email/i/t/?a=1:1", "16:9") == f"{SITE}/api/v1/email/i/t/?a=16:9"


# ── the templates made at setup ────────────────────────────────────────────────────────────────


def test_starters_are_made_once_in_her_style_with_her_words(tenant_ctx, config, owner):
    tenant_ctx.wizard_state = {
        "answers": {
            "offers": ["course", "live"],
            "email_style": "bold",
            "pitch": "Ten minutes a day.",
            "outcome": "More energy, Less stress",
        }
    }
    tenant_ctx.save(update_fields=["wizard_state"])

    made = starters.ensure(tenant_ctx)
    assert [t.category for t in made] == ["newsletter", "launch", "event", "note"]
    assert {t.source for t in made} == {TemplateSource.STARTER}
    assert starters.ensure(tenant_ctx) == []  # once, even after she deletes them
    EmailTemplate.objects.all().delete()
    assert starters.ensure(tenant_ctx) == []

    launch = next(t for t in made if t.category == "launch")
    words = repr(launch.design)
    assert "more energy and less stress" in words and "Ana" in words
    assert launch.design["header"]["blocks"][0]["style"]["backgroundColor"] == "brand:primary"  # bold
    refs = brand.refs_in(made[0].design)
    assert {"latest:post", "next:event", "latest:course"} <= set(refs)
    for template in made:  # every starter renders without a token or a variable left over (but the merge ones)
        html, _text, _warnings = brand.build(template.design, tenant_ctx)
        leftovers = set(re.findall(r"\{\{\s*(\w+)\s*\}\}", html))
        assert "brand:" not in html and leftovers <= {"FirstName", "UnsubscribeUrl"}


def test_compose_dresses_new_words_in_a_templates_styles():
    template = _design(
        _block("heading", {"text": "Old"}, color="brand:accent", fontSize=40),
        _block("text", {"html": "<p>Old</p>"}, color="brand:muted"),
        header=[_block("brandHeader")],
        footer=[_block("brandFooter")],
    )
    design = starters.compose(
        template, heading="New", body_html="<p>Hello</p>", refs=["next:event"], button_text="Go", button_url="/x"
    )
    heading, text, item, button = design["body"]["blocks"]
    assert heading["data"]["text"] == "New" and heading["style"]["fontSize"] == 40
    assert text["style"]["color"] == "brand:muted" and item["data"]["ref"] == "next:event"
    assert button["data"]["url"] == "/x" and design["header"] == template["header"]
    ids = [b["id"] for b in brand.blocks_of(design)]
    assert len(ids) == len(set(ids))
