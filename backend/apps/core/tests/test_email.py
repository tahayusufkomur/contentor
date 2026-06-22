from unittest.mock import patch

from django.test import override_settings

from apps.core import email


@override_settings(RESEND_API_KEY="re_test", RESEND_FROM_EMAIL="x@y.com")
def test_send_email_passes_headers():
    with patch.object(email.resend.Emails, "send") as mock:
        ok = email.send_email("a@b.com", "Hi", "<p>x</p>", headers={"List-Unsubscribe": "<https://u>"})
    assert ok is True
    assert mock.call_args.args[0]["headers"] == {"List-Unsubscribe": "<https://u>"}


@override_settings(RESEND_API_KEY="re_test", RESEND_FROM_EMAIL="x@y.com")
def test_send_email_without_headers_omits_key():
    with patch.object(email.resend.Emails, "send") as mock:
        ok = email.send_email("a@b.com", "Hi", "<p>x</p>")
    assert ok is True
    assert "headers" not in mock.call_args.args[0]
