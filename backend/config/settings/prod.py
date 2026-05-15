import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401, F403
from .base import _env_bool

DEBUG = False
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = []
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# Production refuses bypass mode under any condition. Settings-level guardrail
# so a misconfigured environment never reaches Stripe code paths with bypass on.
# We re-read os.environ directly (rather than trusting the cached base
# attribute) so the guard is robust when prod is loaded after base was first
# imported under different env state (e.g. in tests).
BILLING_BYPASS_ENABLED = _env_bool("BILLING_BYPASS_ENABLED", False)
if BILLING_BYPASS_ENABLED:
    raise ImproperlyConfigured(
        "BILLING_BYPASS_ENABLED must be false in production. " "Unset the env var or set it to 'false'."
    )

# Silence unused-import warnings; the import is for side-effect (re-export).
_ = os
