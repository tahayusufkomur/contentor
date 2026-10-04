"""Wizard holdout bucketing — the A/B test is over.

Every new tenant lands in "control" (the guided /setup flow). The function and
the persisted ``Tenant.wizard_bucket`` stay so existing call sites, historical
rows and the funnel report keep working.
"""

WIZARD_BUCKET_CONTROL = "control"
WIZARD_BUCKET_TREATMENT = "treatment"
WIZARD_BUCKETS = (WIZARD_BUCKET_CONTROL, WIZARD_BUCKET_TREATMENT)


def assign_wizard_bucket(seed: str) -> str:
    """Always "control" — the experiment ended (2026-10-04). ``seed`` is kept
    for call-site compatibility."""
    return WIZARD_BUCKET_CONTROL
