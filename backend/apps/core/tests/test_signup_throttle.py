"""The public creator-signup endpoint is rate limited (audit P1-C).

It sends a verification email per call, so an unthrottled loop is an email-bomb
/ Resend-quota vector. SignupThrottle caps it at 5/min per IP.
"""

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

SIGNUP_URL = "/api/v1/onboarding/signup/"
SHARED_DOMAIN = "shared-test.localhost"


@pytest.mark.django_db(transaction=True)
@override_settings(EMAIL_SINK_ENABLED=False, RESEND_API_KEY="")
def test_signup_is_throttled(restore_public):
    # Sink off so this test doesn't commit DevOutboundEmail rows that would leak
    # into the email-sink tests; we only care that the 6th call is throttled.
    client = APIClient(HTTP_HOST=SHARED_DOMAIN)
    payload = {"email": "flood@example.com", "name": "Flooder", "brand_name": "Flood Brand"}

    statuses = [client.post(SIGNUP_URL, payload, format="json").status_code for _ in range(6)]

    # First 5 within the window are allowed; the 6th is throttled.
    assert statuses[:5] == [s for s in statuses[:5] if s != 429]
    assert 429 in statuses, f"expected a 429 within 6 rapid calls, got {statuses}"
