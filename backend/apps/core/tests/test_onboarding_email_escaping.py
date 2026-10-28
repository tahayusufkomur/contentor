"""Signup emails: no site name yet, and what goes into them is escaped."""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db(transaction=True)
def test_signup_asks_no_site_name_and_a_resend_keeps_the_address(restore_public):
    """The site is named in /setup: signup gives it a temporary address, and a
    resend's link creates the same site as the first email's."""
    from apps.accounts.tokens import verify_signup_token
    from apps.core.constants import SITE_PLACEHOLDER_PREFIX

    client = APIClient(HTTP_HOST="shared-test.localhost")
    payload = {"email": "new@example.com", "name": "Mallory <b>x</b>"}
    with patch("apps.core.email.send_email", return_value=True) as send:
        first = client.post("/api/v1/onboarding/signup/", payload, format="json")
        again = client.post("/api/v1/onboarding/signup/", {**payload, "site": first.json()["site"]}, format="json")
        forged = client.post("/api/v1/onboarding/signup/", {**payload, "site": "shared-test"}, format="json")
    assert first.status_code == 200, first.content
    site = first.json()["site"]
    assert site.startswith(SITE_PLACEHOLDER_PREFIX)
    assert again.json()["site"] == site
    assert forged.json()["site"] not in ("shared-test", site)  # only a free temporary address is kept
    html = send.call_args_list[0].kwargs["html"]
    assert "create your site" in html
    token = html.split("/signup/verify?token=")[1].split('"')[0]
    assert verify_signup_token(token)["site"] == site


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
