"""Registry of AI-built sections: one component, numbered immutable versions."""

import pytest
from django.db import IntegrityError, transaction

from apps.core.models import CxComponent, CxVersion

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _clean():
    CxComponent.objects.all().delete()
    yield
    CxComponent.objects.all().delete()


def test_versions_are_numbered_once_per_component():
    component = CxComponent.objects.create(pk="cx_0000abcd", name="Itinerary", author_tenant_schema="yoga_school")
    CxVersion.objects.create(component=component, n=1, spec={"csl": 1})
    with pytest.raises(IntegrityError), transaction.atomic():
        CxVersion.objects.create(component=component, n=1, spec={"csl": 1})
    assert component.visibility == "private" and str(component.versions.get()) == "cx_0000abcd@1"


def test_deleting_a_component_deletes_its_versions():
    component = CxComponent.objects.create(pk="cx_0000abce", name="X", author_tenant_schema="s")
    CxVersion.objects.create(component=component, n=1, spec={})
    component.delete()
    assert not CxVersion.objects.exists()
