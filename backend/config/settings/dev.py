from .base import *  # noqa: F401, F403

DEBUG = True

# Dev serves over http (Traefik has no local TLS); Stripe redirect URLs must match.
SITE_SCHEME = "http"

DOMAINS_BYPASS_ENABLED = True

# Make demo tenants fully interactive locally: no read-only block, no demo banner,
# so you can actually create/edit content while testing.
DEMO_READONLY_ENABLED = False
