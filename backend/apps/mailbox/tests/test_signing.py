from django.test import override_settings

from apps.mailbox import signing


@override_settings(MAILBOX_INBOUND_SECRET="topsecret")
def test_sign_and_verify_roundtrip():
    body = b'{"to":"info@coach.com"}'
    sig = signing.sign_payload(body, "topsecret")
    assert signing.verify_inbound_signature(body, sig) is True


@override_settings(MAILBOX_INBOUND_SECRET="topsecret")
def test_verify_rejects_tampered_body():
    sig = signing.sign_payload(b"original", "topsecret")
    assert signing.verify_inbound_signature(b"tampered", sig) is False


@override_settings(MAILBOX_INBOUND_SECRET="topsecret")
def test_verify_rejects_empty_signature():
    assert signing.verify_inbound_signature(b"x", "") is False


@override_settings(MAILBOX_INBOUND_SECRET="")
def test_verify_false_when_secret_unset():
    sig = signing.sign_payload(b"x", "whatever")
    assert signing.verify_inbound_signature(b"x", sig) is False
