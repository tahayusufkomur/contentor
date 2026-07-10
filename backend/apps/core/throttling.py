"""Shared throttle classes for the AI endpoints. Task 12 (hardening) re-keys
these onto the real client IP; until then they behave like AnonRateThrottle."""

from rest_framework.throttling import AnonRateThrottle


class AiThreadThrottle(AnonRateThrottle):
    scope = "ai_thread"


class AiHumanMessageThrottle(AnonRateThrottle):
    scope = "ai_human_message"


class AiHumanRequestThrottle(AnonRateThrottle):
    scope = "ai_human_request"
