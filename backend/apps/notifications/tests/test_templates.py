import pytest

from apps.accounts.models import User
from apps.notifications.models import AnnouncementTemplate
from apps.notifications.serializers import AnnouncementTemplateSerializer
from apps.notifications.templates_builtin import builtin_templates

pytestmark = pytest.mark.django_db(transaction=True)


def test_builtins_fill_brand():
    items = builtin_templates("Zen Studio")
    assert len(items) >= 5
    assert all(t["id"].startswith("builtin:") and t["builtin"] for t in items)
    assert any("Zen Studio" in t["title"] or "Zen Studio" in t["body"] for t in items)


def test_custom_template_create_and_list(tenant_ctx):
    u = User.objects.create_user(email="c@m.com", name="C", password="x", role="owner")  # noqa: S106
    t = AnnouncementTemplate.objects.create(name="Mine", title="Hi", body="<p>b</p>", created_by=u)
    data = AnnouncementTemplateSerializer(t).data
    assert data["name"] == "Mine"
    assert data["builtin"] is False
