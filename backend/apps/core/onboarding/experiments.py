"""Deterministic A/B bucketing for the onboarding wizard holdout.

No feature-flag library is used platform-wide; this is the minimal primitive.
The bucket is a stable function of a per-tenant seed, so it never changes and
needs no persistence to be reproducible (we persist it anyway, on Tenant, for
cheap funnel queries).
"""

import hashlib

WIZARD_BUCKET_CONTROL = "control"
WIZARD_BUCKET_TREATMENT = "treatment"
WIZARD_BUCKETS = (WIZARD_BUCKET_CONTROL, WIZARD_BUCKET_TREATMENT)


def assign_wizard_bucket(seed: str) -> str:
    """Stable 50/50 split. Uses the low bit of a SHA-256 of the seed, so it is
    independent of Python's hash randomization and reproducible across runs."""
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return WIZARD_BUCKET_TREATMENT if digest[-1] & 1 else WIZARD_BUCKET_CONTROL
