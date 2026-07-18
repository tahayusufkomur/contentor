import os

from .base import *  # noqa: F401, F403
from .base import _env_bool  # noqa: E402

DEBUG = True

# Dev serves over http (Traefik has no local TLS); Stripe redirect URLs must match.
SITE_SCHEME = "http"

DOMAINS_BYPASS_ENABLED = True

# Make demo tenants fully interactive locally: no read-only block, no demo banner,
# so you can actually create/edit content while testing.
DEMO_READONLY_ENABLED = False

# No GetStream keys → run live classes against the offline fake.
if "LIVE_FAKE_ENABLED" not in os.environ:
    LIVE_FAKE_ENABLED = not GETSTREAM_API_KEY  # noqa: F405

EMAIL_SINK_ENABLED = _env_bool("EMAIL_SINK_ENABLED", True)

# The e2e suite's student/anonymous traffic all comes from one client IP, and
# back-to-back specs (plus retries) blow the prod 100/min bucket — the 429s
# then surface as dead-end UI states (e.g. community renders "isn't
# available") that hang specs until their timeout. Prod keeps the middleware
# default.
TENANT_RATE_LIMIT_DEFAULT = 1000
