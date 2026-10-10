import pytest

from apps.tenant_config.models import LogoCandidate


@pytest.mark.django_db
def test_candidate_defaults_and_ordering(tenant_with_interview):
    LogoCandidate.objects.create(batch="b1", position=2, concept="two", archetype="wordmark", prompt="p", rank=1)
    LogoCandidate.objects.create(batch="b1", position=1, concept="one", archetype="mark_name", prompt="p", rank=2)
    rows = list(LogoCandidate.objects.filter(batch="b1"))
    assert [r.position for r in rows] == [2, 1]
    assert rows[0].state == "ready" and rows[0].source == "hub" and rows[0].vector is None and rows[0].png is None
