from unittest.mock import MagicMock, patch

import pytest

from apps.domains.cloudflare import get_cloudflare
from apps.domains.cloudflare.base import CloudflareError
from apps.domains.cloudflare.client import CloudflareClient
from apps.domains.cloudflare.fake import FakeCloudflare


def _resp(success=True, result=None):
    m = MagicMock()
    m.raise_for_status.return_value = None
    m.json.return_value = {"success": success, "result": result or {}, "errors": [] if success else [{"code": 1003}]}
    return m


def test_factory_returns_fake(settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    assert isinstance(get_cloudflare(), FakeCloudflare)


def test_create_zone_returns_nameservers():
    cf = FakeCloudflare()
    out = cf.create_zone("freecoach.com")
    assert out["zone_id"]
    assert out["name_servers"] == ["a.ns.cloudflare.com", "b.ns.cloudflare.com"]


def test_upsert_dns_record_returns_id():
    cf = FakeCloudflare()
    zone = cf.create_zone("freecoach.com")["zone_id"]
    rid = cf.upsert_dns_record(zone_id=zone, type="CNAME", name="freecoach.com", content="tunnel.example", proxied=True)
    assert rid


def test_ssl_status_active():
    cf = FakeCloudflare()
    zone = cf.create_zone("freecoach.com")["zone_id"]
    assert cf.get_ssl_status(zone_id=zone) == "active"


def test_client_wraps_unsuccessful_response(settings):
    settings.CLOUDFLARE_API_TOKEN = "t"
    settings.CLOUDFLARE_ACCOUNT_ID = "acct"
    with patch("apps.domains.cloudflare.client.requests.request", return_value=_resp(success=False)):
        with pytest.raises(CloudflareError):
            CloudflareClient().get_ssl_status(zone_id="z1")


def test_enable_email_routing_uses_correct_endpoints_and_verbs(settings):
    settings.CLOUDFLARE_API_TOKEN = "t"
    settings.CLOUDFLARE_ACCOUNT_ID = "acct"
    with patch("apps.domains.cloudflare.client.requests.request", return_value=_resp(result={})) as req:
        CloudflareClient().enable_email_routing(zone_id="z1", forward_to="coach@x.com")
    calls = [(c.args[0], c.args[1]) for c in req.call_args_list]
    assert ("POST", "https://api.cloudflare.com/client/v4/zones/z1/email/routing/dns") in calls
    assert ("PUT", "https://api.cloudflare.com/client/v4/zones/z1/email/routing/rules/catch_all") in calls
