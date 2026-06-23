from apps.domains.cloudflare import get_cloudflare
from apps.domains.cloudflare.fake import FakeCloudflare


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
