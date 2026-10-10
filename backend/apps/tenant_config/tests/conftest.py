import pytest


@pytest.fixture
def tenant_with_interview(tenant_ctx):
    """The shared test tenant (in tenant context), named and with interview
    answers settled enough for a logo brief."""
    from apps.core.models import Tenant

    answers = {
        "niche": "face_yoga",
        "teaches": "face yoga",
        "description": "I teach women over 40 face yoga and facial massage.",
        "tone": "calm",
        "style": "atelier",
        "palette": "",
    }
    Tenant.objects.filter(pk=tenant_ctx.pk).update(
        name="Elara Face Yoga", wizard_state={"flow": "interview", "answers": answers}
    )
    tenant_ctx.refresh_from_db()
    return tenant_ctx, dict(answers)
