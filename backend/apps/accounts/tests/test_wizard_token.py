import jwt as pyjwt
import pytest
from django.conf import settings as dj_settings

from apps.accounts.tokens import create_signup_token, create_wizard_token, verify_wizard_token


def test_wizard_token_round_trip():
    token = create_wizard_token("a@b.com", "Coach", "Glow Studio", region="tr")
    payload = verify_wizard_token(token)
    assert payload["email"] == "a@b.com"
    assert payload["name"] == "Coach"
    assert payload["brand_name"] == "Glow Studio"
    assert payload["region"] == "tr"
    assert payload["purpose"] == "wizard"


def test_wizard_verify_accepts_signup_token():
    # Continuity: the short-lived signup token stays valid for wizard calls
    # during its 15-minute window.
    token = create_signup_token("a@b.com", "Coach", "Glow Studio")
    assert verify_wizard_token(token)["purpose"] == "signup"


def test_wizard_verify_rejects_other_purposes():
    bad = pyjwt.encode(
        {"email": "a@b.com", "purpose": "magic_link"},
        dj_settings.SECRET_KEY,
        algorithm="HS256",
    )
    with pytest.raises(pyjwt.InvalidTokenError):
        verify_wizard_token(bad)


def test_wizard_token_expires_by_days_setting(settings):
    settings.WIZARD_TOKEN_EXPIRY_DAYS = -1
    token = create_wizard_token("a@b.com", "Coach", "Glow Studio")
    with pytest.raises(pyjwt.ExpiredSignatureError):
        verify_wizard_token(token)
