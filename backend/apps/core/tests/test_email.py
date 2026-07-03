from unittest.mock import patch

from django.test import override_settings

from apps.core import email

_RESEND_SETTINGS = {
    "RESEND_API_KEY": "re_test",  # pragma: allowlist secret
    "RESEND_FROM_EMAIL": "x@y.com",
    "EMAIL_SINK_ENABLED": False,
}


@override_settings(**_RESEND_SETTINGS)
def test_send_email_passes_headers():
    with patch.object(email.resend.Emails, "send") as mock:
        ok = email.send_email("a@b.com", "Hi", "<p>x</p>", headers={"List-Unsubscribe": "<https://u>"})
    assert ok is True
    assert mock.call_args.args[0]["headers"] == {"List-Unsubscribe": "<https://u>"}


@override_settings(**_RESEND_SETTINGS)
def test_send_email_without_headers_omits_key():
    with patch.object(email.resend.Emails, "send") as mock:
        ok = email.send_email("a@b.com", "Hi", "<p>x</p>")
    assert ok is True
    assert "headers" not in mock.call_args.args[0]


@override_settings(**_RESEND_SETTINGS)
def test_send_email_uses_explicit_from_email():
    with patch.object(email.resend.Emails, "send") as mock:
        ok = email.send_email("a@b.com", "Hi", "<p>x</p>", from_email="info@coach.com")
    assert ok is True
    assert mock.call_args.args[0]["from"] == "info@coach.com"


@override_settings(**_RESEND_SETTINGS)
def test_send_email_from_email_with_name_is_wrapped():
    with patch.object(email.resend.Emails, "send") as mock:
        ok = email.send_email("a@b.com", "Hi", "<p>x</p>", from_name="Coach", from_email="info@coach.com")
    assert ok is True
    assert mock.call_args.args[0]["from"] == "Coach <info@coach.com>"
