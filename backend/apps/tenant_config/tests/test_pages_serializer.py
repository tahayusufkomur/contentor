"""Page-builder serializer tests: hybrid theme-lock style-override clamping and
coach-saved page-template validation + asset signing."""

import pytest
from rest_framework import serializers

from apps.media.models import Photo
from apps.tenant_config.models import TenantConfig
from apps.tenant_config.serializers import TenantConfigSerializer


class TestValidatePagesStyle:
    def test_valid_style_override_is_kept(self):
        out = TenantConfigSerializer().validate_pages(
            {
                "home": {
                    "blocks": [
                        {
                            "id": "a",
                            "type": "richText",
                            "style": {"background": "muted", "spacing": "spacious", "align": "center"},
                        }
                    ]
                }
            }
        )
        assert out["home"]["blocks"][0]["style"] == {
            "background": "muted",
            "spacing": "spacious",
            "align": "center",
        }

    def test_theme_locked_default_has_no_style_key(self):
        # No style, and a no-op style, both round-trip WITHOUT a `style` key —
        # byte-identical to the pre-feature payload (theme-lock preserved).
        out = TenantConfigSerializer().validate_pages(
            {
                "home": {
                    "blocks": [
                        {"id": "a", "type": "hero", "heading": "Hi"},
                        {"id": "b", "type": "hero", "style": {"background": "default", "spacing": "normal"}},
                    ]
                }
            }
        )
        assert "style" not in out["home"]["blocks"][0]
        assert "style" not in out["home"]["blocks"][1]

    def test_text_color_kept_on_content_and_dynamic_blocks(self):
        # textColor is allowed on every block (content blocks colour heading+body,
        # dynamic blocks colour the section heading) and sits alongside other
        # overrides. hero allows it too (no-image layouts).
        out = TenantConfigSerializer().validate_pages(
            {
                "home": {
                    "blocks": [
                        {"id": "a", "type": "richText", "style": {"textColor": "brand"}},
                        {"id": "b", "type": "courseGrid", "style": {"textColor": "muted", "spacing": "compact"}},
                        {"id": "c", "type": "hero", "style": {"textColor": "muted"}},
                    ]
                }
            }
        )
        blocks = out["home"]["blocks"]
        assert blocks[0]["style"] == {"textColor": "brand"}
        assert blocks[1]["style"] == {"textColor": "muted", "spacing": "compact"}
        assert blocks[2]["style"] == {"textColor": "muted"}

    def test_text_color_noop_and_invalid_dropped(self):
        # "default" is the no-op (cleared like background:default); unknown values
        # (e.g. a raw colour) are dropped so pages stay theme-safe.
        out = TenantConfigSerializer().validate_pages(
            {
                "home": {
                    "blocks": [
                        {"id": "a", "type": "richText", "style": {"textColor": "default"}},
                        {"id": "b", "type": "richText", "style": {"textColor": "#ff0000"}},
                    ]
                }
            }
        )
        assert "style" not in out["home"]["blocks"][0]
        assert "style" not in out["home"]["blocks"][1]

    def test_invalid_and_disallowed_style_values_are_dropped(self):
        out = TenantConfigSerializer().validate_pages(
            {
                "home": {
                    "blocks": [
                        # raw hex bg + bad align enum + bogus key -> all dropped (cta allows bg+align)
                        {"id": "a", "type": "cta", "style": {"background": "#ff0000", "align": "justify", "bogus": 1}},
                        # gallery does not allow `align`
                        {"id": "b", "type": "gallery", "style": {"spacing": "compact", "align": "center"}},
                        # video does not allow `background`
                        {"id": "c", "type": "video", "style": {"background": "primary", "spacing": "none"}},
                    ]
                }
            }
        )
        blocks = out["home"]["blocks"]
        assert "style" not in blocks[0]
        assert blocks[1]["style"] == {"spacing": "compact"}
        assert blocks[2]["style"] == {"spacing": "none"}

    def test_unknown_pages_and_blocks_dropped_and_ids_minted(self):
        out = TenantConfigSerializer().validate_pages(
            {
                "home": {
                    "blocks": [
                        {"type": "richText", "body": "b"},  # missing id -> minted
                        {"id": "x", "type": "NOPE"},  # unknown type -> dropped
                    ]
                },
                "evil": {"blocks": []},  # unknown page -> dropped
            }
        )
        assert list(out.keys()) == ["home"]
        assert len(out["home"]["blocks"]) == 1
        assert out["home"]["blocks"][0]["id"].startswith("blk_")


class TestValidatePageTemplates:
    def test_round_trip_minted_ids_and_garbage_dropped(self):
        out = TenantConfigSerializer().validate_page_templates(
            [
                {
                    "name": "My home",
                    "category": "home",
                    "blocks": [{"id": "x", "type": "richText", "style": {"spacing": "compact"}}],
                },
                "garbage",  # non-dict -> skipped
                {"blocks": [{"type": "banner", "text": "t"}]},  # no name/id -> defaults
            ]
        )
        assert [t["name"] for t in out] == ["My home", "Untitled"]
        assert all(t["id"].startswith("tmpl_") for t in out)
        assert out[0]["blocks"][0]["style"] == {"spacing": "compact"}
        assert out[1]["blocks"][0]["id"].startswith("blk_")  # minted for the id-less banner

    def test_capped_at_50(self):
        out = TenantConfigSerializer().validate_page_templates([{"name": f"t{i}", "blocks": []} for i in range(60)])
        assert len(out) == 50

    def test_non_list_rejected(self):
        with pytest.raises(serializers.ValidationError):
            TenantConfigSerializer().validate_page_templates({"nope": 1})


class TestRichTextSanitization:
    def test_unsafe_html_stripped_safe_kept(self):
        out = TenantConfigSerializer().validate_pages(
            {
                "home": {
                    "blocks": [
                        {
                            "id": "a",
                            "type": "richText",
                            "body": "<p>ok <b>bold</b></p><script>alert(1)</script>"
                            '<img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a>',
                        }
                    ]
                }
            }
        )
        body = out["home"]["blocks"][0]["body"]
        assert "<script" not in body
        assert "onerror" not in body
        assert "javascript:" not in body
        assert "<b>bold</b>" in body  # safe formatting preserved

    def test_plain_text_body_unchanged(self):
        out = TenantConfigSerializer().validate_pages(
            {"home": {"blocks": [{"id": "a", "type": "richText", "body": "Just plain text"}]}}
        )
        assert out["home"]["blocks"][0]["body"] == "Just plain text"


@pytest.mark.django_db(transaction=True)
class TestPageTemplateAssetSigning:
    def test_saved_template_images_are_signed_on_read(self, tenant_ctx, monkeypatch):
        import apps.tenant_config.serializers as ser

        monkeypatch.setattr(ser, "generate_presigned_download_url", lambda s3_key, *a, **k: f"signed://{s3_key}")
        photo = Photo.objects.create(s3_key="photos/hero.jpg", title="Hero", file_size=1024)
        config = TenantConfig.objects.create(
            brand_name="Test",
            page_templates=[
                {
                    "id": "tmpl_1",
                    "name": "Home",
                    "category": "home",
                    "blocks": [
                        {"id": "b1", "type": "hero", "bgImage": {"url": None, "photo_id": str(photo.id)}},
                    ],
                }
            ],
        )
        try:
            data = ser.TenantConfigSerializer(config).data
            img = data["page_templates"][0]["blocks"][0]["bgImage"]
            # `url` was None on input; re-derived from photo_id on read.
            assert img["url"] == "signed://photos/hero.jpg"
        finally:
            config.delete()
