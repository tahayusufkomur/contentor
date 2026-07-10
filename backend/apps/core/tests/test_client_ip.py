"""client_ip precedence + throttle identity keying."""

from django.test import RequestFactory

from apps.core.net import client_ip
from apps.core.throttling import AiThreadThrottle


def test_precedence_cf_then_xff_then_remote():
    rf = RequestFactory()
    r = rf.get("/", HTTP_CF_CONNECTING_IP="1.2.3.4", HTTP_X_FORWARDED_FOR="9.9.9.9, 8.8.8.8", REMOTE_ADDR="10.0.0.1")
    assert client_ip(r) == "1.2.3.4"
    r = rf.get("/", HTTP_X_FORWARDED_FOR="9.9.9.9, 8.8.8.8", REMOTE_ADDR="10.0.0.1")
    assert client_ip(r) == "9.9.9.9"
    r = rf.get("/", REMOTE_ADDR="10.0.0.1")
    assert client_ip(r) == "10.0.0.1"


def test_throttle_ident_uses_client_ip():
    rf = RequestFactory()
    r = rf.get("/", HTTP_CF_CONNECTING_IP="1.2.3.4", REMOTE_ADDR="10.0.0.1")
    r.user = None
    assert AiThreadThrottle().get_ident(r) == "1.2.3.4"
