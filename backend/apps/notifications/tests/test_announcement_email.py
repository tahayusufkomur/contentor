from unittest.mock import patch

import pytest

from apps.accounts.models import User
from apps.notifications import services
from apps.notifications.models import Announcement, AnnouncementRecipient, EmailOptOut
from apps.tenant_config.models import TenantConfig

pytestmark = pytest.mark.django_db(transaction=True)


def _cfg():
    # Reuse-and-reset TenantConfig's one shared row in place rather than
    # TenantConfig.objects.all().delete() + .create(). backend/conftest.py's
    # shared_test tenant schema is the SAME Postgres schema for every
    # pytest-xdist worker process, and other apps' tests (e.g.
    # apps/tenant_config/tests/test_setup_status.py) hold a Python reference
    # to this row across an HTTP round-trip. Deleting it out from under a
    # concurrently running worker raises TenantConfig.DoesNotExist there, or
    # silently redirects its request onto this file's freshly-created
    # replacement row (confirmed via a controlled-timing repro: the PATCH
    # landed on the wrong row and the victim's refresh_from_db() raised
    # DoesNotExist) — the cause of an intermittent xdist-only flake in
    # test_config_save_tracks_page_and_look_edits.
    cfg = TenantConfig.objects.first() or TenantConfig.objects.create(brand_name="Z")
    cfg.brand_name = "Z"
    cfg.theme = "ocean"
    cfg.save()
    return cfg


def _student(email):
    return User.objects.create_user(email=email, name="S", password="x", role="student")  # noqa: S106


def test_emails_recipients_except_optout(tenant_ctx):
    _cfg()
    u1, u2 = _student("a@b.com"), _student("c@d.com")
    EmailOptOut.objects.create(email="c@d.com")
    a = Announcement.objects.create(title="T", body="b", filters_json={}, also_email=True)
    AnnouncementRecipient.objects.create(announcement=a, user=u1)
    AnnouncementRecipient.objects.create(announcement=a, user=u2)
    with patch.object(services, "send_email", return_value=True) as mock:
        sent = services.send_announcement_emails(a)
    assert sent == 1
    assert mock.call_count == 1
    assert AnnouncementRecipient.objects.get(announcement=a, user=u1).email_status == "sent"
    assert AnnouncementRecipient.objects.get(announcement=a, user=u2).email_status == "none"


def test_fanout_triggers_email_only_when_also_email(tenant_ctx):
    _cfg()
    a = Announcement.objects.create(title="T", body="b", filters_json={}, also_email=True)
    with patch.object(services, "send_announcement_emails", return_value=0) as mock:
        services.send_announcement_to_recipients(a)
    assert mock.call_count == 1

    b = Announcement.objects.create(title="T2", body="b", filters_json={}, also_email=False)
    with patch.object(services, "send_announcement_emails", return_value=0) as mock:
        services.send_announcement_to_recipients(b)
    assert mock.call_count == 0
