"""A platform campaign can be aimed at one creator language; an unset language counts as English."""

import pytest

from apps.accounts.models import User
from apps.email_campaigns import brand
from apps.platform_email.recipients import resolve_recipients
from apps.platform_email.serializers import validate_recipient_filter

pytestmark = pytest.mark.django_db


@pytest.fixture()
def creators(restore_public):
    rows = {"empty": "", "en": "en", "tr": "tr", "pl": "pl"}
    return {
        key: User.objects.create(email=f"{key}@lang.test", role="coach", is_active=True, preferred_locale=value)
        for key, value in rows.items()
    }


def _emails(recipient_filter):
    return {email.split("@")[0] for email in resolve_recipients(recipient_filter).values_list("email", flat=True)}


def test_no_language_means_every_creator(creators):
    assert _emails({"type": "all_coaches"}) == {"empty", "en", "tr", "pl"}


def test_polish_reaches_only_polish_creators(creators):
    assert _emails({"type": "all_coaches", "language": "pl"}) == {"pl"}


def test_english_includes_creators_with_no_language(creators):
    assert _emails({"type": "all_coaches", "language": "en"}) == {"empty", "en"}


def test_the_language_narrows_every_filter_type(creators):
    ids = [c.pk for c in creators.values()]
    assert _emails({"type": "individual", "user_ids": ids, "language": "tr"}) == {"tr"}


def test_an_unknown_language_is_refused(creators):
    from rest_framework.serializers import ValidationError

    with pytest.raises(ValidationError):
        validate_recipient_filter({"type": "all_coaches", "language": "xx"})


def test_the_platform_kit_speaks_the_campaigns_language():
    assert brand.platform_kit()["language"] == "en"
    assert brand.platform_kit("tr")["language"] == "tr"


def test_the_send_renders_in_the_campaigns_language(creators):
    from unittest.mock import patch

    from apps.email_campaigns.starters import compose
    from apps.platform_email import tasks
    from apps.platform_email.models import PlatformEmailCampaign

    campaign = PlatformEmailCampaign.objects.create(
        status="sending",
        subject="Merhaba",
        design=compose(None, heading="Haberler"),
        recipient_filter={"type": "all_coaches", "language": "tr"},
    )
    with patch.object(tasks, "send_email", return_value=True) as send:
        tasks.send_platform_campaign_emails(campaign.id)
    assert send.call_count == 1
    assert 'lang="tr"' in send.call_args.kwargs["html"]
