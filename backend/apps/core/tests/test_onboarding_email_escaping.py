"""Coach-supplied brand names are interpolated into emails: they must be escaped."""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient


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
