"""seed_wizard_mockup_tenant --niche: the scratch tenant can be reseeded
from any demo_seed niche so tools/wizard-mockups can capture per-niche
screenshot sets. Validation only — the full handle() path (schema create +
template seed) is exercised by the capture tool itself, not the suite."""

import pytest
from django.core.management.base import CommandError

from apps.core.management.commands.seed_wizard_mockup_tenant import (
    DEFAULT_NICHE,
    resolve_niche,
)


def test_accepts_known_niche():
    assert resolve_niche("belly_dance") == "belly_dance"


def test_default_niche_is_valid():
    assert resolve_niche(DEFAULT_NICHE) == DEFAULT_NICHE


def test_rejects_unknown_niche_with_available_list():
    with pytest.raises(CommandError, match="belly_dance"):
        resolve_niche("underwater_basket_weaving")
