from .base import *  # noqa: F401, F403

DEBUG = True

# Dev serves over http (Traefik has no local TLS); Stripe redirect URLs must match.
SITE_SCHEME = "http"
