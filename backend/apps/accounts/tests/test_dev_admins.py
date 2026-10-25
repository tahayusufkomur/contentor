"""Local dev: the developer's email as an owner of every tenant, after the tenant's own owner."""

import pytest
from django.core.management import call_command

from apps.accounts import dev_admins
from apps.accounts.models import User

DEV = "dev@contentor.test"


@pytest.mark.django_db(transaction=True)
class TestDevAdmins:
    def test_a_new_owner_brings_the_developer_along_after_her(self, settings, tenant_ctx):
        settings.DEV_TENANT_ADMINS = [DEV]
        coach = User.objects.create_user(email="coach@dev-admins.test", name="Coach", role="owner", is_staff=True)
        dev = User.objects.get(email=DEV)
        assert (dev.role, dev.is_staff) == ("owner", True)
        # the coach stays "the owner" (the first one) everywhere the app looks for her
        assert User.objects.filter(role="owner").order_by("id").first() == coach

    def test_a_student_with_the_email_is_raised_and_others_left_alone(self, settings, tenant_ctx):
        settings.DEV_TENANT_ADMINS = [DEV]
        User.objects.create_user(email=DEV, name="Dev", role="student")
        assert dev_admins.grant() == 1
        assert User.objects.get(email=DEV).role == "owner"
        assert dev_admins.grant() == 0  # once
        User.objects.create_user(email="student@dev-admins.test", name="S", role="student")
        assert User.objects.filter(role="owner").count() == 1

    def test_off_without_the_setting(self, tenant_ctx):
        User.objects.create_user(email="coach@dev-admins.test", name="Coach", role="owner", is_staff=True)
        assert not User.objects.filter(email=DEV).exists()

    def test_the_command_is_for_local_dev_only(self, settings):
        from django.core.management.base import CommandError

        settings.DEBUG = False
        with pytest.raises(CommandError):
            call_command("dev_tenant_admins")
