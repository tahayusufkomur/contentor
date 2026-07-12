# backend/apps/accounts/tests/test_issue_login_token.py
from io import StringIO

import jwt
import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.models import User


@pytest.mark.django_db
def test_refuses_when_not_debug(settings):
    settings.DEBUG = False
    with pytest.raises(CommandError):
        call_command("issue_login_token", "--role", "superadmin")


@pytest.mark.django_db
def test_superadmin_token_is_a_decodable_jwt(settings):
    settings.DEBUG = True
    User.objects.create_user(email="root@contentor.app", name="Root", is_superuser=True, is_staff=True)
    out = StringIO()
    call_command("issue_login_token", "--role", "superadmin", stdout=out)
    token = out.getvalue().strip()
    assert token
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    assert isinstance(payload, dict)


@pytest.mark.django_db
def test_no_superuser_raises(settings):
    settings.DEBUG = True
    # The command looks up superusers in the public schema; guarantee the "no
    # superuser" precondition here rather than relying on cross-test state (the
    # shared test DB doesn't isolate committed public-schema users). This delete
    # rolls back with the test's transaction, so other tests are unaffected.
    from django_tenants.utils import schema_context

    with schema_context("public"):
        User.objects.filter(is_superuser=True).delete()
    with pytest.raises(CommandError):
        call_command("issue_login_token", "--role", "superadmin")
