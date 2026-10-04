from .base import *  # noqa: F401, F403
from .base import _env_bool  # noqa: E402

DEBUG = True

# Dev serves over http (Traefik has no local TLS); Stripe redirect URLs must match.
SITE_SCHEME = "http"

DOMAINS_BYPASS_ENABLED = True

# No LiveCraft configured → fake it (point LIVECRAFT_URL at a running
# `make dev` in ../livecraft, e.g. http://host.docker.internal:7800, for real video).
if not LIVECRAFT_URL:  # noqa: F405
    LIVECRAFT_FAKE = True

EMAIL_SINK_ENABLED = _env_bool("EMAIL_SINK_ENABLED", True)

# The e2e suite's student/anonymous traffic all comes from one client IP, and
# back-to-back specs (plus retries) blow the prod 100/min bucket — the 429s
# then surface as dead-end UI states (e.g. community renders "isn't
# available") that hang specs until their timeout. Prod keeps the middleware
# default.
TENANT_RATE_LIMIT_DEFAULT = 1000
