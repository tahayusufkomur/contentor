"""Coach-supplied brand names are interpolated into emails: they must be escaped."""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db(transaction=True)
def test_signup_rejects_a_brand_with_no_usable_slug(restore_public):
    client = APIClient(HTTP_HOST="shared-test.localhost")
    payload = {"email": "kanji@example.com", "name": "Kanji", "brand_name": "日本語"}
    with patch("apps.core.email.send_email", return_value=True) as send:
        resp = client.post("/api/v1/onboarding/signup/", payload, format="json")
    assert resp.status_code == 400, resp.content
    assert "letters or numbers" in resp.json()["detail"]
    send.assert_not_called()


@pytest.mark.django_db(transaction=True)
def test_signup_email_escapes_brand_name(restore_public):
    client = APIClient(HTTP_HOST="shared-test.localhost")
    payload = {"email": "xss@example.com", "name": "Mallory", "brand_name": "<b>x</b> Studio"}

    with patch("apps.core.email.send_email", return_value=True) as send:
        resp = client.post("/api/v1/onboarding/signup/", payload, format="json")

    assert resp.status_code == 200, resp.content
    html = send.call_args.kwargs["html"]
    assert "&lt;b&gt;x&lt;/b&gt; Studio" in html
    assert "<b>x</b>" not in html


def test_action_email_is_branded_escaped_and_has_a_text_alternative():
    from apps.core.email import action_email

    html, text = action_email(
        heading="Confirm <your> email",
        intro="Verify <b>x</b>",
        button="Go",
        link="https://x.test/signup/verify?token=abc&v=1",
        expires="Expires in 15 minutes.",
    )
    assert "Contentor" in html
    assert 'href="https://x.test/signup/verify?token=abc&amp;v=1"' in html
    assert "&lt;b&gt;x&lt;/b&gt;" in html and "<b>x</b>" not in html
    assert "Or copy" not in html  # the raw token is not repeated under the button
    assert "https://x.test/signup/verify?token=abc&v=1" in text


def test_magic_link_email_escapes_the_coach_brand():
    from apps.core.email import send_magic_link

    with patch("apps.core.email.send_email", return_value=True) as send:
        send_magic_link("s@example.com", "https://x.test/cb?token=1", brand_name="<img src=x onerror=1>")
    html = send.call_args.args[2]
    assert "&lt;img" in html and "<img" not in html
