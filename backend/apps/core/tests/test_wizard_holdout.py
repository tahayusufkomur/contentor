"""The wizard holdout bucket must be deterministic (same seed -> same bucket),
roughly even across many seeds, and drawn only from the known set."""

from apps.core.onboarding.experiments import WIZARD_BUCKETS, assign_wizard_bucket


def test_bucket_is_deterministic_for_a_seed():
    assert assign_wizard_bucket("coach@example.com") == assign_wizard_bucket("coach@example.com")


def test_bucket_is_always_a_known_value():
    for i in range(200):
        assert assign_wizard_bucket(f"seed-{i}") in WIZARD_BUCKETS


def test_distribution_is_roughly_even_over_many_seeds():
    treatment = sum(1 for i in range(2000) if assign_wizard_bucket(f"user-{i}") == "treatment")
    # 50/50 with generous slack for hash noise over 2000 draws.
    assert 850 <= treatment <= 1150


def test_distinct_seeds_can_differ():
    buckets = {assign_wizard_bucket(f"x{i}") for i in range(20)}
    assert buckets == set(WIZARD_BUCKETS)  # both buckets appear
