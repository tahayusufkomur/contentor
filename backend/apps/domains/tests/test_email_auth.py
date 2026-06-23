from apps.domains.email_auth import get_resend_domains
from apps.domains.email_auth.fake import FakeResendDomains


def test_factory_returns_fake(settings):
    settings.DOMAINS_BYPASS_ENABLED = True
    assert isinstance(get_resend_domains(), FakeResendDomains)


def test_create_domain_returns_records():
    r = FakeResendDomains()
    out = r.create_domain("freecoach.com")
    assert out["resend_domain_id"]
    types = {rec["type"] for rec in out["records"]}
    assert {"TXT", "MX"} & types  # SPF/DKIM (TXT) + return-path (MX)


def test_status_verified():
    r = FakeResendDomains()
    out = r.create_domain("freecoach.com")
    assert r.get_status(resend_domain_id=out["resend_domain_id"]) == "verified"
