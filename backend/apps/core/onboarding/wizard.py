"""Pre-provision onboarding wizard endpoints.

Auth model: the wizard token (or a still-valid signup token) travels in the
request BODY, like every other onboarding endpoint — no JWT exists yet.
Public views MUST keep @authentication_classes([]) (project rule).
"""

import logging
from decimal import Decimal

from rest_framework.decorators import api_view, authentication_classes, permission_classes, renderer_classes
from rest_framework.permissions import AllowAny
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response

from apps.billing.providers import ProviderError, get_provider
from apps.core.ai_sse import EventStreamRenderer, sse_frame, stream_response

from . import wizard_catalog

logger = logging.getLogger(__name__)

#: Provisioning states in which the wizard is still being filled in. See the
#: PATCH guard in wizard_state for why 'provisioned' belongs here.
WIZARD_OPEN_STATUSES = ("pending", "provisioned")

# One free AI refinement at the reveal (Phase 2 decision 4). The auto-generated
# design itself is always free; this budgets follow-up chat edits. The ongoing
# monthly allowance lives on the plan (max_site_ai_updates) and is enforced by
# the admin Site AI panel, not here.
REVEAL_FREE_APPLIES = 1


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_catalog_view(request):
    """Option sets for the wizard UI. Public + cacheable: ids only, no PII."""
    return Response(wizard_catalog.catalog_payload())


def _resolve_tenant_from_wizard_token(request):
    """Wizard-token variant of views._resolve_tenant_from_signup_token.

    Returns (payload, tenant, error_response); exactly one of (tenant, error)
    is None. Accepts wizard tokens and still-valid signup tokens.
    """
    from django.utils.text import slugify

    from apps.accounts.tokens import verify_wizard_token
    from apps.core.i18n_helpers import msg
    from apps.core.models import Tenant

    token = request.data.get("token")
    if not token:
        return None, None, Response({"detail": msg(request, "token_required")}, status=400)
    try:
        payload = verify_wizard_token(token)
    except Exception:
        return None, None, Response({"detail": msg(request, "token_invalid_or_expired")}, status=400)

    region = payload.get("region", "global")
    slug = slugify(payload["brand_name"])[:63]
    try:
        tenant = Tenant.objects.get(slug=slug, region=region)
    except Tenant.DoesNotExist:
        return None, None, Response({"detail": msg(request, "tenant_not_found")}, status=404)
    if tenant.owner_email != payload["email"]:
        return None, None, Response({"detail": "Token does not match tenant owner."}, status=403)
    return payload, tenant, None


def _state_body(tenant) -> dict:
    return {
        "slug": tenant.slug,
        "status": tenant.provisioning_status,
        "template_status": tenant.template_seed_status,
        "has_paid_platform_plan": tenant.has_paid_platform_plan,
        "wizard_bucket": tenant.wizard_bucket,
        "state": tenant.wizard_state or {},
    }


@api_view(["POST", "PATCH"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_state(request):
    """POST = read current wizard state (resume); PATCH = merge-save answers.

    The token rides in the body for both verbs so it never lands in access
    logs. PATCH is last-write-wins per answer key — fine for a single coach.
    """
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err

    if request.method == "PATCH":
        # 'provisioned' is mid-wizard for the content-first flow: the schema is
        # created early (at the content step) so the coach can write a real
        # course/event/post, but the wizard is still running and must keep
        # saving answers. 'provisioning'/'ready'/'failed' really are closed.
        if tenant.provisioning_status not in WIZARD_OPEN_STATUSES or tenant.template_seed_status in (
            "seeding",
            "ready",
            "skipped",
        ):
            return Response({"detail": "wizard_closed"}, status=409)

        answers_in = request.data.get("answers") or {}
        if not isinstance(answers_in, dict):
            return Response({"detail": "answers must be an object."}, status=400)
        errors = wizard_catalog.validate_answers(answers_in)
        if errors:
            return Response({"detail": "invalid_answers", "errors": errors}, status=400)

        from django.utils import timezone

        state = dict(tenant.wizard_state or {})
        state.setdefault("version", 1)
        answers = dict(state.get("answers") or {})
        answers.update(answers_in)
        state["answers"] = answers

        stamps = dict(state.get("step_timestamps") or {})
        now = timezone.now().isoformat()
        for key in answers_in:
            stamps[key] = now
        state["step_timestamps"] = stamps

        current_step = request.data.get("current_step")
        if isinstance(current_step, str) and 0 < len(current_step) <= 40:
            state["current_step"] = current_step
        if isinstance(request.data.get("finished_rest_for_me"), bool):
            state["finished_rest_for_me"] = request.data["finished_rest_for_me"]

        tenant.wizard_state = state
        tenant.save(update_fields=["wizard_state"])
        logger.info("wizard state saved slug=%s keys=%s", tenant.slug, sorted(answers_in))

        # Business chapter complete (niche + description present): kick off the
        # AI curated-logo rank so it's ready by the time the coach reaches the
        # logo step. Fail-silent; the logo step falls back to the keyword rank.
        if {"description", "goals"} & set(answers_in) and answers.get("niche") and answers.get("description"):
            from ..tasks import rank_curated_logos

            rank_curated_logos.delay(tenant.id)

    return Response(_state_body(tenant))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_finalize(request):
    """ "Create my platform": fill unanswered steps with recommended defaults,
    sync the legacy template fields, and enqueue provisioning. Idempotent —
    a second call is a cheap status echo, never a second enqueue."""
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err

    if tenant.template_seed_status in ("seeding", "ready", "skipped") or tenant.provisioning_status != "pending":
        return Response(
            {"slug": tenant.slug, "status": tenant.provisioning_status, "template_status": tenant.template_seed_status}
        )

    state = dict(tenant.wizard_state or {})
    answers = dict(state.get("answers") or {})
    defaults = wizard_catalog.recommended_answers(answers.get("niche") or "general")
    merged = {**defaults, **answers}
    merged["page_layouts"] = {**defaults["page_layouts"], **(answers.get("page_layouts") or {})}
    state["answers"] = merged
    state.setdefault("version", 1)

    tenant.wizard_state = state
    tenant.template_niche = merged["niche"]
    tenant.template_goals = list(merged.get("goals") or [])[:20]
    tenant.template_seed_status = "seeding"
    tenant.save(update_fields=["wizard_state", "template_niche", "template_goals", "template_seed_status"])

    from ..tasks import provision_tenant

    provision_tenant.delay(tenant.id, payload["email"], payload.get("name", ""), merged["niche"])
    logger.info("wizard finalized slug=%s niche=%s goals=%s", tenant.slug, merged["niche"], tenant.template_goals)
    return Response({"slug": tenant.slug, "status": "pending", "template_status": "seeding"}, status=202)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_provision(request):
    """Enqueue early schema provisioning for the token's tenant. Idempotent:
    only 'pending' tenants enqueue; any other state just reports its status.
    The frontend polls this same view every 1.5s until 'provisioned', so the
    'pending' guard must flip synchronously here — the task is the only other
    thing that changes provisioning_status, and it may not start running for
    several polls (worker backlog, slow migration), which used to re-enqueue a
    duplicate on every intervening tick. select_for_update closes the window
    between two near-simultaneous polls too."""
    from django.db import transaction

    from ..tasks import provision_wizard_schema

    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err:
        return err
    if tenant.provisioning_status == "pending":
        with transaction.atomic():
            locked = type(tenant).objects.select_for_update().get(pk=tenant.pk)
            won_race = locked.provisioning_status == "pending"
            if won_race:
                locked.provisioning_status = "provisioning"
                locked.save(update_fields=["provisioning_status"])
        tenant.provisioning_status = locked.provisioning_status
        if won_race:
            provision_wizard_schema.delay(tenant.id, tenant.owner_email, tenant.name)
    return Response({"status": tenant.provisioning_status})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_compose(request):
    """Trigger compose-at-reveal for the content-first flow. Only a provisioned
    tenant composes; the frontend polls onboarding/status until 'ready'."""
    from ..tasks import compose_wizard_site

    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err:
        return err
    if tenant.provisioning_status == "provisioned":
        compose_wizard_site.delay(tenant.id)
    return Response({"status": tenant.provisioning_status})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_checkout(request):
    """Contextual upgrade inside the wizard: Stripe Checkout for a platform
    plan BEFORE provisioning. The tenant row already exists, so the standard
    webhook attaches the PlatformSubscription; no wizard-specific completion
    handling is needed."""
    from django.db import transaction

    from apps.core.constants import REGION_DEFAULT_CURRENCY
    from apps.core.models import PlatformPlan

    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err

    if tenant.has_paid_platform_plan:
        return Response({"detail": "already_subscribed"}, status=409)

    try:
        plan = PlatformPlan.objects.get(pk=request.data.get("plan_id"))
    except (PlatformPlan.DoesNotExist, ValueError, TypeError):
        return Response({"detail": "plan_not_found"}, status=404)
    if getattr(plan, "is_free", False):
        return Response({"detail": "plan_not_purchasable"}, status=400)

    with transaction.atomic():
        locked = type(tenant).objects.select_for_update().get(pk=tenant.pk)
        if not locked.billing_currency:
            locked.billing_currency = REGION_DEFAULT_CURRENCY.get(locked.region, "USD")
            locked.save(update_fields=["billing_currency"])
        tenant.billing_currency = locked.billing_currency

    price_entry = (plan.prices or {}).get(tenant.billing_currency, {}) if isinstance(plan.prices, dict) else {}
    if not price_entry.get("stripe_price_id"):
        return Response({"detail": "price_not_available", "currency": tenant.billing_currency}, status=400)

    scheme = "https" if request.is_secure() else "http"
    origin = f"{scheme}://{request.get_host()}"

    # Get-or-create the REAL coach User row now, instead of passing a
    # pk-less placeholder to the provider. Mirrors provision_tenant's own
    # coach-user creation exactly (same (email, region) lookup key), so
    # when provisioning later runs its own get_or_create for the same
    # pair it just reuses this row — idempotent, no duplicate/conflict.
    # A placeholder pk=None here would serialize into Stripe checkout
    # metadata as the literal string "None", which the
    # checkout.session.completed webhook's _resolve_user cannot parse
    # back into a user — silently dropping the paid subscription.
    from apps.accounts.models import User
    from apps.core.constants import REGION_DEFAULT_LOCALE

    region = tenant.region or "global"
    user, _ = User.objects.get_or_create(
        email=payload["email"],
        region=region,
        defaults={
            "name": payload.get("name", ""),
            "role": "coach",
            "preferred_locale": REGION_DEFAULT_LOCALE.get(region, "en"),
            "accessible_regions": [],
        },
    )
    locale = "tr" if tenant.region == "tr" else "en"
    try:
        session = get_provider(tenant).create_checkout_session(
            tenant=tenant,
            user=user,
            plan=plan,
            success_url=f"{origin}/signup/verify?upgraded=1",
            cancel_url=f"{origin}/signup/verify?upgraded=0",
            locale=locale,
        )
    except ProviderError as exc:
        logger.warning("wizard checkout failed slug=%s plan=%s: %s", tenant.slug, plan.pk, exc)
        return Response({"detail": exc.code}, status=400)

    logger.info("wizard checkout started slug=%s plan=%s currency=%s", tenant.slug, plan.pk, tenant.billing_currency)
    return Response({"checkout_url": session.url, "provider": get_provider(tenant).name})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_checkout_sync(request):
    """Return-from-checkout probe: `?upgraded=1&session_id=…` posts the
    session id here and we activate the subscription server-side instead of
    waiting for the `checkout.session.completed` webhook — which local dev
    never receives (no `stripe listen`) and which prod can deliver after the
    redirect. Idempotent with the webhook; always answers the wizard state
    body so the client reads one shape from state/ and here."""
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err is not None:
        return err

    if not tenant.has_paid_platform_plan:
        session_id = request.data.get("session_id")
        if isinstance(session_id, str) and session_id.strip():
            from apps.billing.views.webhooks_platform import sync_platform_checkout_session

            if sync_platform_checkout_session(tenant, session_id.strip()):
                tenant = type(tenant).objects.get(pk=tenant.pk)
                logger.info("wizard checkout synced slug=%s", tenant.slug)
    return Response(_state_body(tenant))


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@renderer_classes([JSONRenderer, EventStreamRenderer])
def wizard_site_edit_preview(request):
    """Stream a proposed site edit for the coach's natural-language
    instruction. Free — only Apply consumes a reveal allowance. USD is
    charged on every attempt (kill-switch integrity) regardless of outcome."""
    from apps.core.onboarding import site_ai

    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err:
        return err
    instruction = (request.data.get("instruction") or "").strip()[:400]

    def frames():
        yield sse_frame({"type": "phase", "phase": "thinking"})
        cost = Decimal("0")
        try:
            pages, extras, cost = site_ai.preview_edit(tenant, instruction)
            yield sse_frame({"type": "done", "pages": pages})
        except Exception:
            logger.exception("wizard site-edit preview failed slug=%s", tenant.slug)
            yield sse_frame({"type": "error", "source": "error"})
        finally:
            site_ai.record_attempt_cost(tenant.schema_name, cost)

    return stream_response(frames())


def _apply_last_preview(tenant, pages):
    from apps.core.onboarding import site_ai

    site_ai.apply_edit(tenant, pages)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def wizard_site_edit_apply(request):
    """Persist the last-previewed pages, decrementing the reveal's single free
    apply. 402 (not a hard block — Publish stays available) once spent; the
    admin Site AI panel enforces the monthly plan quota separately.

    Deliberately does NOT call site_ai.record_update(): that increments
    updates_used, the SAME counter site_ai.availability() reads for the paid
    admin panel's monthly quota. The reveal's one free apply is tracked
    entirely by wizard_state["reveal_applies_used"] below and must stay
    outside that meter — otherwise using the reveal's free apply would show
    up as spent allowance in the coach's own /admin/site-ai panel.
    """
    payload, tenant, err = _resolve_tenant_from_wizard_token(request)
    if err:
        return err
    state = dict(tenant.wizard_state or {})
    used = int(state.get("reveal_applies_used", 0))
    if used >= REVEAL_FREE_APPLIES:
        return Response({"detail": "reveal_quota_exhausted", "remaining": 0}, status=402)

    _apply_last_preview(tenant, request.data.get("pages") or {})

    state["reveal_applies_used"] = used + 1
    tenant.wizard_state = state
    tenant.save(update_fields=["wizard_state"])
    logger.info("wizard site-edit applied slug=%s remaining=%d", tenant.slug, REVEAL_FREE_APPLIES - (used + 1))
    return Response({"remaining": REVEAL_FREE_APPLIES - (used + 1)})
