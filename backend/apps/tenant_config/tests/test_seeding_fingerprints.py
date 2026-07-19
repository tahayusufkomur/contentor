"""refresh_seeded_fingerprints: post-seed AI edits must not read as coach edits."""

import pytest

from apps.tenant_config.models import SeededObject
from apps.tenant_config.seeding import fingerprint_for, refresh_seeded_fingerprints, register_seeded

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture()
def download(tenant_ctx):
    from apps.downloads.models import DownloadFile

    obj = DownloadFile.objects.create(title="Seeded Guide")
    yield obj
    SeededObject.objects.all().delete()
    obj.delete()


def test_refresh_updates_fingerprint_after_mutation(download):
    register_seeded([download], niche="yoga")
    row = SeededObject.objects.get(object_id=str(download.pk))
    old_fp = row.fingerprint

    download.title = "AI Renamed Guide"
    download.save(update_fields=["title"])
    refresh_seeded_fingerprints([download])

    row.refresh_from_db()
    assert row.fingerprint != old_fp
    assert row.fingerprint == fingerprint_for(download)


def test_refresh_ignores_unregistered_objects(download):
    # No register_seeded call — must be a no-op, not an error.
    refresh_seeded_fingerprints([download])
    assert SeededObject.objects.count() == 0
