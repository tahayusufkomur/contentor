import pytest

from apps.accounts.models import User
from apps.accounts.serializers import StudentListSerializer

pytestmark = pytest.mark.django_db(transaction=True)


def test_student_serializer_exposes_usage_fields(tenant_ctx):
    user = User.objects.create_user(email="s@u.com", name="S", password="x", role="student")
    user.last_display_mode = "pwa"
    user.last_platform = "ios"
    user.save(update_fields=["last_display_mode", "last_platform"])
    data = StudentListSerializer(user).data
    assert data["last_display_mode"] == "pwa"
    assert data["last_platform"] == "ios"
