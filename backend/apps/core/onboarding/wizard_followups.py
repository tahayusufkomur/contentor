"""AI follow-up questions for the wizard's "describe what you do" step.

One small structured call turns the coach's free-text description into at
most two short follow-up questions; the answers come back through the
normal wizard-state PATCH (answers["description_followups"]) and feed
ai_compose's brief at provisioning. Fail-soft by design: any provider
failure, missing key, or blown budget returns {"questions": []} so the
wizard simply skips the step — never an error the UI must handle.
"""

import logging

from django.conf import settings
from pydantic import BaseModel, Field
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core import ai as core_ai
from apps.core import ipblock
from apps.core.throttling import WizardFollowupThrottle

from . import ai_compose, wizard_catalog
from .wizard import _resolve_tenant_from_wizard_token

logger = logging.getLogger(__name__)

MAX_OUTPUT_TOKENS = 300

SYSTEM_PROMPT = """You help a website copywriter interview a solo coach who
just described their business in a couple of sentences.

Return up to 2 short follow-up questions (in the language named in the
brief) whose answers would most improve the coach's website copy — for
example who their students are, what makes their approach different, or
what a new student should expect in the first session.

Hard rules:
- At most 2 questions, each a single sentence under 160 characters.
- Never ask for anything the description already answers.
- Never ask for prices, credentials, statistics, or private details.
- If the description is too thin to ask anything useful, return no
  questions rather than generic filler.
"""


class _Followups(BaseModel):
    questions: list[str] = Field(default_factory=list)


def generate_questions(description: str, *, locale: str, tenant_schema: str) -> list[str]:
    """0-2 follow-up questions, [] on any failure. Spend is recorded against
    the same OnboardingAiUsage monthly budget ai_compose draws from."""
    if not ai_compose.compose_available():
        return []
    language = "Turkish" if locale == "tr" else "English"
    user = f"Language: {language}\n<description>\n{description}\n</description>"
    try:
        parsed, cost, _model = core_ai.structured(
            system=SYSTEM_PROMPT,
            user=user,
            output_model=_Followups,
            model=settings.ONBOARDING_AI_MODEL,
            max_tokens=MAX_OUTPUT_TOKENS,
        )
    except core_ai.AiError as exc:
        ai_compose.record_spend(tenant_schema, float(getattr(exc, "cost_usd", 0) or 0))
        logger.warning("wizard followups AI failed for %s: %s", tenant_schema, exc)
        return []
    ai_compose.record_spend(tenant_schema, float(cost or 0))
    questions = [q.strip()[: wizard_catalog.FOLLOWUP_QUESTION_MAX_LEN] for q in parsed.questions if q and q.strip()]
    return questions[: wizard_catalog.FOLLOWUP_MAX_QUESTIONS]


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([WizardFollowupThrottle])
def wizard_describe_followups(request):
    if (denied := ipblock.blocked_response(request)) is not None:
        return denied
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err
    description = str(request.data.get("description") or "")[: wizard_catalog.DESCRIPTION_MAX_LEN]
    if not description.strip():
        return Response({"questions": []})
    locale = "tr" if tenant.region == "tr" else "en"
    return Response({"questions": generate_questions(description, locale=locale, tenant_schema=tenant.schema_name)})
