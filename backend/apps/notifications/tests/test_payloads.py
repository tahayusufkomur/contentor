import pytest

from apps.notifications.payloads import announcement_payload, strip_to_text

pytestmark = pytest.mark.django_db(transaction=True)


def test_strip_to_text_removes_tags():
    assert strip_to_text("<p>Hello <b>world</b></p>") == "Hello world"


def test_strip_to_text_drops_scripts():
    assert "alert" not in strip_to_text("<script>alert(1)</script>hi")


def test_announcement_payload_uses_plaintext(tenant_ctx):
    p = announcement_payload("Title", "<p>Bold <b>news</b></p>", url="/x")
    assert p["body"] == "Bold news"
    assert p["url"] == "/x"
    assert p["tag"] == "announcement"
