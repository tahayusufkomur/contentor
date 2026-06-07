import os

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F401, F403
from .base import _env_bool

DEBUG = False
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True

# --- Behind the Cloudflare tunnel ---------------------------------------------
# TLS is terminated at Cloudflare's edge; the cloudflared -> Caddy -> Django hops
# are plain HTTP. Trust the forwarded proto (Caddy forces it to https) so the
# SSL redirect + secure cookies don't loop, and use the public host for URLs.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

# CSRF must trust the public origins, including any tenant subdomain. Django 4+
# accepts a wildcard host in CSRF_TRUSTED_ORIGINS.
CSRF_TRUSTED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "DJANGO_CSRF_TRUSTED_ORIGINS",
        "https://contentor.app,https://tr.contentor.app,https://*.contentor.app",
    ).split(",")
    if o.strip()
]

# Cross-origin API access (e.g. apex calling a tenant API). The regex covers
# every *.contentor.app subdomain; the explicit list is an optional add-on.
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("DJANGO_CORS_ALLOWED_ORIGINS", "").split(",") if o.strip()
]
CORS_ALLOWED_ORIGIN_REGEXES = [r"^https://([a-z0-9-]+\.)*contentor\.app$"]

# WhiteNoise serves collected static (incl. the Django admin) straight from the
# app, so no static volume needs to be shared with the edge proxy. apps.media
# still uploads user files to S3 via boto3 (default storage stays filesystem).
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

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
