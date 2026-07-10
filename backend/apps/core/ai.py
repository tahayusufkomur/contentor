"""Shared AI provider layer
(docs/superpowers/specs/2026-07-09-shared-ai-provider-design.md).

Every AI feature calls Claude through this module. Two providers behind the
two call shapes in the codebase (stream_text for chat, structured for
schema-validated generation), selected by settings.AI_PROVIDER:

- "anthropic" (prod, and any env that should bill the API key): SDK calls
  with prompt caching on the system block.
- "cli" (local dev): the developer's Claude subscription via the ``claude``
  CLI. ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN are stripped from the
  subprocess env so the CLI can never silently bill the key; cost is always
  Decimal("0") — subscription usage must not accrue against USD budget caps.

Prompt-caching contract: the ``system`` argument must be byte-frozen per
feature (persona / knowledge base / static prompt only). Tenant state
travels in the user turn — never interpolate it into ``system`` (it would
fragment the Anthropic cache per tenant).
"""

import os
import shutil
from decimal import Decimal

from django.conf import settings

CLI_TIMEOUT_SECONDS = 120

# $ per 1M tokens: (input, output, cache_read, cache_write). Cache-write here
# assumes the 5-minute TTL (1.25x input), not the 1-hour tier.
_MODEL_PRICES = {
    "claude-sonnet-5": {"input": 2.00, "output": 10.00, "cache_read": 0.20, "cache_write": 2.50},
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00, "cache_read": 0.10, "cache_write": 1.25},
}
_DEFAULT_PRICES = _MODEL_PRICES["claude-sonnet-5"]


class AiError(Exception):
    """The provider failed before, during, or after a call (including
    schema-validation failure on a completed call). Carries the estimated
    cost of the (possibly billed) attempt so callers can still accrue it
    against their budget kill-switches."""

    def __init__(self, message, cost_usd=Decimal("0")):
        super().__init__(message)
        self.cost_usd = cost_usd


def estimate_cost(usage, model):
    """Anthropic usage object -> estimated USD."""
    prices = _MODEL_PRICES.get(model, _DEFAULT_PRICES)

    def per_m(tokens, price):
        return (Decimal(tokens or 0) / Decimal(1_000_000)) * Decimal(str(price))

    return (
        per_m(getattr(usage, "input_tokens", 0), prices["input"])
        + per_m(getattr(usage, "output_tokens", 0), prices["output"])
        + per_m(getattr(usage, "cache_read_input_tokens", 0), prices["cache_read"])
        + per_m(getattr(usage, "cache_creation_input_tokens", 0), prices["cache_write"])
    )


def available():
    """Provider preflight -> (ok, reason).
    Reasons: ok | no_api_key | cli_no_binary | cli_no_token."""
    if settings.AI_PROVIDER == "cli":
        if shutil.which(settings.AI_CLI_BIN) is None:
            return False, "cli_no_binary"
        if not os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
            return False, "cli_no_token"
        return True, "ok"
    if not settings.ANTHROPIC_API_KEY:
        return False, "no_api_key"
    return True, "ok"


def _anthropic_client():
    from anthropic import Anthropic

    # timeout=100 covers the slowest call (brand pack, 6000 output tokens).
    return Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=100.0, max_retries=1)


def _cli_env():
    # Subscription auth only: with ANTHROPIC_API_KEY present the CLI would
    # bill the API key instead of the subscription.
    return {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")}
