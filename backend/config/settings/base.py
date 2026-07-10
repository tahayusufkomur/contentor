import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "insecure-dev-key")

ALLOWED_HOSTS = os.environ.get("DJANGO_ALLOWED_HOSTS", "*").split(",")

# --- django-tenants configuration ---
SHARED_APPS = [
    "django_tenants",
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.admin",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "apps.core",
    "apps.accounts",
    # No models — registers API admin sites for both SPAs via admin_panels.py
    # autodiscovery.
    "apps.adminkit",
    # Platform-level email campaigns (public schema; superadmin → coaches).
    "apps.platform_email",
    "apps.domains",
    # Coach mailbox models also live in the public schema — those public rows
    # are the superadmin platform inbox. Still tenant-listed below for coaches.
    "apps.mailbox",
]

TENANT_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.admin",
    "apps.accounts",
    "apps.tenant_config",
    "apps.filters",
    "apps.tags",
    "apps.courses",
    "apps.downloads",
    "apps.live",
    "apps.media",
    "apps.billing",
    "apps.email_campaigns",
    "apps.notifications",
    "apps.mailbox",
    "apps.usage",
    "apps.community",
    "apps.blog",
]

INSTALLED_APPS = list(SHARED_APPS) + [app for app in TENANT_APPS if app not in SHARED_APPS]

TENANT_MODEL = "core.Tenant"
TENANT_DOMAIN_MODEL = "core.Domain"
DATABASE_ROUTERS = ("apps.core.routers.TenantRouter", "django_tenants.routers.TenantSyncRouter")

AUTH_USER_MODEL = "accounts.User"

MIDDLEWARE = [
    "apps.core.middleware.region.RegionResolverMiddleware",
    "apps.core.middleware.tenant.HeaderAwareTenantMiddleware",
    "apps.core.middleware.demo_readonly.DemoReadOnlyMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.rate_limit.TenantRateLimitMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django_tenants.postgresql_backend",
        "NAME": os.environ.get("POSTGRES_DB", "contentor"),
        "USER": os.environ.get("POSTGRES_USER", "contentor"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "changeme"),
        "HOST": os.environ.get("POSTGRES_HOST", "localhost"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        },
    }
}

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/1")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "UTC"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.TenantJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_RATES": {
        "community_posts": "10/hour",
        "community_comments": "60/hour",
        "help_bot": "10/min",
        # Anonymous marketing-site chat: per-IP burst + daily ceiling.
        "help_bot_public_burst": "5/min",
        "help_bot_public_day": "40/day",
        "ai_rate": "20/min",
        # Public student-assistant chat (anon-per-IP and signed-in-per-user
        # share the same rates): per-IP/per-user burst + daily ceiling.
        "student_bot_burst": "5/min",
        "student_bot_day": "30/day",
    },
}

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

CORS_ALLOW_ALL_ORIGINS = True

AUTH_PASSWORD_VALIDATORS = []

AUTHENTICATION_BACKENDS = [
    "apps.accounts.backends.AdminJWTBackend",
    "django.contrib.auth.backends.ModelBackend",
]

LANGUAGE_CODE = "en"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
LANGUAGES = [
    ("en", "English"),
    ("tr", "Türkçe"),
]
LOCALE_PATHS = [BASE_DIR / "locale"]

CONTENTOR_DOMAIN = os.environ.get("CONTENTOR_DOMAIN", "contentor.localhost")
# Scheme for building external (Stripe redirect/return) URLs. https in prod;
# dev overrides to http (Traefik serves no TLS locally).
SITE_SCHEME = os.environ.get("SITE_SCHEME", "https")
CONTENTOR_SUPERUSERS = [
    email.strip() for email in os.environ.get("CONTENTOR_SUPERUSERS", "").split(",") if email.strip()
]
MAGIC_LINK_EXPIRY_MINUTES = 15
JWT_EXPIRY_DAYS = 7

# --- Google OAuth ---
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "")

# --- Resend ---
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "noreply@contentor.com")
# Fixed From address for the superadmin platform inbox (public-schema mailbox).
PLATFORM_SUPPORT_FROM = os.environ.get("PLATFORM_SUPPORT_FROM", "support@contentor.app")

# --- EmailCraft ---
EMAILCRAFT_TOKEN = os.environ.get("EMAILCRAFT_TOKEN", "")
EMAILCRAFT_BASE_URL = os.environ.get("EMAILCRAFT_BASE_URL", "https://mailcraft.contentor.app")

# --- S3 / Object Storage ---
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
AWS_BUCKET_NAME = os.environ.get("AWS_BUCKET_NAME", "contentor-dev-private")
AWS_ENDPOINT = os.environ.get("AWS_ENDPOINT", "")
# Browser-facing endpoint for presigned URLs. Inside compose Django reaches
# MinIO at http://minio:9000 but the browser must use http://localhost:9000;
# presigned signatures include the host, so signing must use this endpoint.
AWS_ENDPOINT_EXTERNAL = os.environ.get("AWS_ENDPOINT_EXTERNAL", "")
AWS_PRESIGNED_EXPIRY = int(os.environ.get("AWS_PRESIGNED_EXPIRY", "3600"))

# Inbound mailbox webhook carries base64 attachments (≤ ~25 MB email + overhead).
DATA_UPLOAD_MAX_MEMORY_SIZE = 30 * 1024 * 1024

# --- GetStream Video ---
GETSTREAM_API_KEY = os.environ.get("GETSTREAM_API_KEY", "")
GETSTREAM_API_SECRET = os.environ.get("GETSTREAM_API_SECRET", "")

# --- AI provider (apps.core.ai) ---
# "anthropic" (prod: API key + prompt caching) or "cli" (local dev: the
# developer's Claude subscription via the `claude` CLI; needs the binary in
# the container — dev compose builds with INSTALL_CLAUDE_CLI=1 — and
# CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`).
AI_PROVIDER = os.environ.get("AI_PROVIDER", "anthropic")
AI_CLI_BIN = os.environ.get("AI_CLI_BIN", "claude")
# Dev default is haiku: local runs test plumbing/UI, not output quality, and
# it's faster + lighter on the developer's subscription quota. Set
# AI_CLI_MODEL=sonnet when a dev session needs prod-quality output.
AI_CLI_MODEL = os.environ.get("AI_CLI_MODEL", "haiku")

# --- Logo Studio AI Brand Pack (paid-tier feature; unset key = fully off) ---
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
LOGO_AI_MODEL = os.environ.get("LOGO_AI_MODEL", "claude-sonnet-5")
# Global monthly USD kill-switch, summed across all tenants (LogoAiUsage).
LOGO_AI_MONTHLY_BUDGET_USD = float(os.environ.get("LOGO_AI_MONTHLY_BUDGET_USD", "15"))
# Hard per-tenant cap on successful packs per calendar month.
LOGO_AI_MONTHLY_PACK_LIMIT = int(os.environ.get("LOGO_AI_MONTHLY_PACK_LIMIT", "5"))

# --- Ask Contentor help bot (apps.tenant_config.help_bot; provider from AI_PROVIDER) ---
HELP_BOT_MODEL = os.environ.get("HELP_BOT_MODEL", "claude-sonnet-5")
# Per-tenant + global monthly USD caps and a per-tenant question cap.
HELP_BOT_TENANT_MONTHLY_USD = float(os.environ.get("HELP_BOT_TENANT_MONTHLY_USD", "1"))
HELP_BOT_GLOBAL_MONTHLY_USD = float(os.environ.get("HELP_BOT_GLOBAL_MONTHLY_USD", "50"))
HELP_BOT_TENANT_MONTHLY_QUESTIONS = int(os.environ.get("HELP_BOT_TENANT_MONTHLY_QUESTIONS", "200"))
# Anonymous marketing-site chat (apps.core.help): its own monthly bucket,
# also counted into the global kill-switch above.
HELP_BOT_PUBLIC_MONTHLY_USD = float(os.environ.get("HELP_BOT_PUBLIC_MONTHLY_USD", "10"))
HELP_BOT_PUBLIC_MONTHLY_QUESTIONS = int(os.environ.get("HELP_BOT_PUBLIC_MONTHLY_QUESTIONS", "500"))

# Retention window for AiTranscript rows (audit content, not billing state —
# purged by a beat task; the *Usage meters are permanent).
AI_TRANSCRIPT_RETENTION_DAYS = int(os.environ.get("AI_TRANSCRIPT_RETENTION_DAYS", "90"))

# --- AI blog generation (apps.blog.ai; provider comes from AI_PROVIDER) ---
BLOG_AI_MODEL = os.environ.get("BLOG_AI_MODEL", "claude-sonnet-5")
BLOG_AI_TOPIC_MODEL = os.environ.get("BLOG_AI_TOPIC_MODEL", "claude-haiku-4-5")
# Global monthly USD kill-switch across ALL blog AI (attempts included).
BLOG_AI_MONTHLY_BUDGET_USD = float(os.environ.get("BLOG_AI_MONTHLY_BUDGET_USD", "30"))

# --- Student site assistant (apps.tenant_config.student_bot; provider from AI_PROVIDER) ---
STUDENT_BOT_MODEL = os.environ.get("STUDENT_BOT_MODEL", "claude-haiku-4-5")
STUDENT_BOT_MAX_OUTPUT_TOKENS = int(os.environ.get("STUDENT_BOT_MAX_OUTPUT_TOKENS", "600"))
STUDENT_BOT_TENANT_MONTHLY_USD = float(os.environ.get("STUDENT_BOT_TENANT_MONTHLY_USD", "3"))
STUDENT_BOT_GLOBAL_MONTHLY_USD = float(os.environ.get("STUDENT_BOT_GLOBAL_MONTHLY_USD", "50"))

# --- AI assistants v2 ---
ASSISTANT_HUMAN_IDLE_RELEASE_MIN = int(os.environ.get("ASSISTANT_HUMAN_IDLE_RELEASE_MIN", "30"))

# --- Web Push (VAPID) ---
# Generate a keypair once with: vapid --gen ; vapid --applicationServerKey
# Store VAPID_PRIVATE_KEY as a double-quoted multi-line PEM in .env (python-dotenv
# supports this). VAPID_PUBLIC_KEY is the base64url Application Server Key printed
# by `vapid --applicationServerKey`.
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:admin@contentor.app")


# --- Billing / Platform subscriptions ---
def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


# Bypass mode short-circuits Stripe in dev/test. Production refuses this in
# `config.settings.prod`.
BILLING_BYPASS_ENABLED = _env_bool("BILLING_BYPASS_ENABLED", True)

# Fake GetStream service for offline/dev use. Production refuses this (prod.py).
LIVE_FAKE_ENABLED = _env_bool("LIVE_FAKE_ENABLED", False)

# Dev-only email sink: stores outbound mail in DB instead of calling Resend.
# Lets local e2e tests read magic links / verification codes without a real inbox.
# Production refuses this (prod.py).
EMAIL_SINK_ENABLED = _env_bool("EMAIL_SINK_ENABLED", False)

# Demo tenants (is_demo=True) reject mutating requests and show a read-only banner.
# Disable locally (dev.py sets this False) to make demo tenants fully interactive
# for testing. MUST stay True in production so marketing demos can't be edited.
DEMO_READONLY_ENABLED = _env_bool("DEMO_READONLY_ENABLED", True)

# Days a `past_due` PlatformSubscription stays before the dunning sweep downgrades.
PAST_DUE_GRACE_DAYS = int(os.environ.get("PAST_DUE_GRACE_DAYS", "7"))

# Canonical name of the Free plan. Used by seed_plans and the dunning downgrade.
BILLING_FREE_PLAN_NAME = os.environ.get("BILLING_FREE_PLAN_NAME", "Free")

# Stripe credentials. Empty in dev/CI unless explicitly wired.
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")

# Stripe Price IDs per plan and presentment currency. seed_plans reads these
# into PlatformPlan.prices[currency].stripe_price_id. Empty values are allowed
# in Phase 0; downstream callers must handle PRICE_NOT_AVAILABLE.
STRIPE_PRICE_STARTER_USD = os.environ.get("STRIPE_PRICE_STARTER_USD", "")
STRIPE_PRICE_PRO_USD = os.environ.get("STRIPE_PRICE_PRO_USD", "")
STRIPE_PRICE_STARTER_TRY = os.environ.get("STRIPE_PRICE_STARTER_TRY", "")
STRIPE_PRICE_PRO_TRY = os.environ.get("STRIPE_PRICE_PRO_TRY", "")

# --- Logging ------------------------------------------------------------------
# Everything goes to stdout so `docker logs` / the fleet telemetry collector see
# it. App loggers (`apps.*`) emit at DJANGO_LOG_LEVEL (default INFO) so business
# events — signups, logins, tenant provisioning, Stripe webhooks, campaign sends
# — are visible in prod without flipping DEBUG. Each line carries the active
# tenant schema via TenantContextFilter. Tune verbosity with DJANGO_LOG_LEVEL.
LOG_LEVEL = os.environ.get("DJANGO_LOG_LEVEL", "INFO").upper()

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "tenant_context": {"()": "apps.core.logging.TenantContextFilter"},
    },
    "formatters": {
        "console": {
            "format": "%(asctime)s %(levelname)-7s %(name)s [tenant=%(tenant)s] %(message)s",
            "datefmt": "%Y-%m-%dT%H:%M:%S%z",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "stream": "ext://sys.stdout",
            "formatter": "console",
            "filters": ["tenant_context"],
        },
    },
    # Root catches anything unconfigured at WARNING so third-party noise stays
    # quiet while real problems still surface.
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        # Our code — the events we actually want to watch.
        "apps": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        "config": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        # Django framework: keep request errors (5xx → ERROR, 4xx → WARNING).
        "django": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.server": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "django.security": {"handlers": ["console"], "level": "INFO", "propagate": False},
        # SQL is firehose-level; only show it when explicitly asked.
        "django.db.backends": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "celery": {"handlers": ["console"], "level": "INFO", "propagate": False},
        # Chatty libraries — clamp to WARNING.
        "urllib3": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "botocore": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "boto3": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "s3transfer": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "stripe": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "asyncio": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}

# Let Django's LOGGING config (above) own logging in the celery worker/beat
# processes too, instead of celery hijacking the root logger. The actual wiring
# is the `setup_logging` signal in config/celery.py.
CELERY_WORKER_HIJACK_ROOT_LOGGER = False

# --- Custom domains (apps.domains) -------------------------------------------
# When true, registrar/Cloudflare/Resend use deterministic fakes (no live API
# calls or real purchases). Overridden per-environment below.
DOMAINS_BYPASS_ENABLED = True
DOMAINS_MARKUP_MULTIPLIER = 1.20
DOMAINS_DEFAULT_CURRENCY = "EUR"
# Static USD->currency FX table (markup + ceil rounding absorbs drift). Keyed by
# ISO 4217. 1 USD = N units of the currency.
DOMAINS_FX_RATES = {"USD": 1.0, "EUR": 0.92, "TRY": 32.0}

# AWS Route 53 Domains. Dedicated credentials — the AWS_ACCESS_KEY_ID /
# AWS_SECRET_ACCESS_KEY above are the Hetzner S3 object-storage keys (boto3),
# which are a DIFFERENT account; Route 53 must not reuse them. The region is NOT
# configurable: Route 53 Domains is a global service pinned to us-east-1 in the
# registrar client (see apps/domains/registrar/route53.py).
AWS_ROUTE53_ACCESS_KEY_ID = os.environ.get("AWS_ROUTE53_ACCESS_KEY_ID", "")
AWS_ROUTE53_SECRET_ACCESS_KEY = os.environ.get("AWS_ROUTE53_SECRET_ACCESS_KEY", "")

# Cloudflare
CLOUDFLARE_API_TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_TUNNEL_HOSTNAME = os.environ.get("CLOUDFLARE_TUNNEL_HOSTNAME", "")

# Resend sender-auth reuses the existing RESEND_API_KEY defined above (used by
# apps.platform_email / apps.email_campaigns) — no separate key needed.

# --- Coach mailbox inbound webhook ---
MAILBOX_INBOUND_SECRET = os.environ.get("MAILBOX_INBOUND_SECRET", "")
CLOUDFLARE_EMAIL_WORKER_NAME = os.environ.get("CLOUDFLARE_EMAIL_WORKER_NAME", "")
# Domain for paid coaches' chosen `<x>@<domain>` mailbox addresses (e.g.
# "contentor.app"). Empty disables the platform-address tier entirely.
PLATFORM_MAIL_DOMAIN = os.environ.get("PLATFORM_MAIL_DOMAIN", "")
