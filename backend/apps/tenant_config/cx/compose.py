"""AI components: compose a new section from a coach's description, refine
one with an instruction, list the coach's own. Metered by the Site AI quota
(apps.core.onboarding.site_ai) until components get their own numbers.

Runs inside the request's tenant context. Every function returns a
JSON-ready dict and never raises for AI trouble:
{"block": dict | None, "source": "ai" | "disabled" | "upgrade_required" |
 "quota_exhausted" | "error", "remaining": int, "missing": [str]}."""

from __future__ import annotations

import copy
import logging
import secrets
from decimal import Decimal
from time import monotonic as _now

from django.conf import settings

from apps.core import ai as core_ai
from apps.core.models import CxComponent, CxVersion
from apps.core.onboarding import site_ai, site_composer
from apps.tenant_config import sections
from apps.tenant_config.defaults import CX_BLOCK_TYPE, KNOWN_PAGE_KEYS
from apps.tenant_config.serializers import TenantConfigSerializer

from . import prompt as cx_prompt
from .blocks import REF_RE, clean_cx_block, content_of
from .draft import CxDraft, assemble
from .validate import validate_spec

logger = logging.getLogger(__name__)

PROMPT_MIN = 8
INSTRUCTION_MIN = 3
PROMPT_MAX = 600
MAX_TOKENS = 12000
TIMEOUT_SECONDS = 90  # under Cloudflare's ~100 s edge cap
# One request must end before that cap, or the coach is charged for a result the
# browser never gets: no repair round after REPAIR_BUDGET seconds, no more photo
# searches after IMAGE_BUDGET (measured from the start of the request).
REPAIR_BUDGET = 40
IMAGE_BUDGET = 70
MAX_IMAGES = 8
MY_LIMIT = 50
_EMPTY_IMAGE = {"url": None, "photo_id": None, "alt": None}


class CxError(Exception):
    def __init__(self, message, cost_usd):
        super().__init__(message)
        self.cost_usd = cost_usd


def _result(source, remaining, block=None, missing=()):
    return {"block": block, "source": source, "remaining": remaining, "missing": list(missing)}


def _gate(tenant):
    """(refusal source or None, remaining compositions this month)."""
    if not core_ai.available()[0]:
        return "disabled", 0
    quota = site_ai.availability(tenant)
    return (None if quota["enabled"] else quota["reason"]), quota["remaining"]


def _context(tenant):
    from apps.tenant_config.models import TenantConfig

    config = TenantConfig.objects.first()
    style_id = (config.style if config else "") or ""
    brand = (config.brand_name if config else "") or tenant.name or ""
    return style_id, brand, site_composer._coach_data(tenant, brand)


def _generate(turn, started):
    """(spec, content, missing, cost) from the model with one repair round.
    A spec that still has errors after the repair is used in its cleaned
    form. Raises CxError when nothing renderable came back."""
    cost = Decimal("0")
    errors: list[str] = []
    best = None
    for attempt in range(2):
        if attempt and _now() - started > REPAIR_BUDGET:
            break
        user = turn if attempt == 0 else cx_prompt.repair_turn(turn, errors)
        try:
            draft, spent, _model = core_ai.structured(
                system=cx_prompt.system_prompt(),
                user=user,
                output_model=CxDraft,
                model=settings.ONBOARDING_AI_MODEL,
                max_tokens=MAX_TOKENS,
                label="contentor:cx-compose",
                timeout_seconds=TIMEOUT_SECONDS,
                effort="medium",
            )
        except core_ai.AiError as exc:
            cost += exc.cost_usd
            errors = [f"your answer could not be used: {str(exc)[:200]}"]
            continue
        cost += Decimal(str(spent or 0))
        raw, content = assemble(draft)
        spec, errors = validate_spec(raw)
        if spec is None:
            continue
        missing = [str(m)[:80] for m in draft.missing_capabilities[:5]]
        result = (spec, sections._clean_fields(spec["fields"], content), missing)
        if not errors:
            return (*result, cost)
        best = result
    if best is not None:
        return (*best, cost)
    raise CxError("; ".join(errors)[:500], cost)


def _photo_slots(spec, content):
    """(field spec, target dict, key) for every image slot in the content."""
    for name, field in spec["fields"].items():
        if field["type"] == "image":
            yield field, content, name
        elif field["type"] == "items":
            for sub, sub_field in field["fields"].items():
                if sub_field["type"] == "image":
                    for item in content.get(name) or []:
                        yield sub_field, item, sub


def _has_photo(value):
    return isinstance(value, dict) and bool(value.get("photo_id"))


def _find(field, ctx, words, used):
    brief = {"subject": field.get("role") or ctx["topic"]}
    try:
        image, photo = site_composer._find_photo(
            site_composer._queries(brief, ctx, words), field.get("aspect", "4:3"), used, ctx
        )
    except Exception:  # a photo must never sink the section
        logger.exception("cx photo search failed")
        image = photo = None
    if photo is None:
        return dict(_EMPTY_IMAGE)
    used.add(image.asset_id)
    return {"url": None, "photo_id": str(photo.pk), "alt": (image.description or field.get("role") or "")[:200]}


def _fill_images(content, spec, coach, brand, style_id, started):
    """Fill every image slot that has no photo yet (in place). At most
    MAX_IMAGES searches; the rest stay empty for the coach to pick."""
    ctx = site_composer._ctx(coach["niche"], brand, coach.get("description", ""), coach.get("topic", ""))
    words = (sections.style(style_id) or {}).get("photoWords", "")
    used: set[str] = set()
    searched = 0
    for field, target, key in _photo_slots(spec, content):
        if _has_photo(target.get(key)):
            continue
        in_budget = searched < MAX_IMAGES and _now() - started < IMAGE_BUDGET
        target[key] = _find(field, ctx, words, used) if in_budget else dict(_EMPTY_IMAGE)
        searched += 1


def _words_only(content):
    """Content without photos, for the prompt."""
    out = {}
    for key, value in content.items():
        if isinstance(value, list):
            out[key] = [
                {k: v for k, v in item.items() if not isinstance(v, dict)} for item in value if isinstance(item, dict)
            ]
        elif not isinstance(value, dict):
            out[key] = value
    return out


def _merge(old, new, spec):
    """New words win; photos the coach already has survive (by field, and
    by position inside lists)."""
    out = {**old, **new}
    for name, field in spec["fields"].items():
        if field["type"] == "image" and _has_photo(old.get(name)):
            out[name] = old[name]
        elif field["type"] == "items":
            subs = [k for k, s in field["fields"].items() if s["type"] == "image"]
            before = old.get(name) if isinstance(old.get(name), list) else []
            for i, item in enumerate(out.get(name) or []):
                previous = before[i] if i < len(before) and isinstance(before[i], dict) else {}
                for sub in subs:
                    if isinstance(item, dict) and not _has_photo(item.get(sub)) and _has_photo(previous.get(sub)):
                        item[sub] = previous[sub]
    return sections._clean_fields(spec["fields"], out)


def _save(tenant, ref, spec, content, prompt_text, missing):
    """Append a version to the coach's own component named by ``ref``, or
    start a new component. Returns the new ref ("cx_xxxxxxxx@n")."""
    component_id = ref.split("@")[0] if isinstance(ref, str) and REF_RE.match(ref) else None
    component = (
        CxComponent.objects.filter(pk=component_id, author_tenant_schema=tenant.schema_name).first()
        if component_id
        else None
    )
    if component is None:
        component = CxComponent.objects.create(
            pk=f"cx_{secrets.token_hex(4)}", name=spec["name"], author_tenant_schema=tenant.schema_name
        )
    n = component.latest_version + 1
    CxVersion.objects.create(
        component=component, n=n, spec=spec, content=content, prompt=prompt_text, missing_capabilities=missing
    )
    component.latest_version = n
    component.name = spec["name"]
    component.summary = spec["summary"]
    component.save(update_fields=["latest_version", "name", "summary", "updated_at"])
    return f"{component.pk}@{n}"


def _block(spec, content, ref, block_id=None):
    block = {
        "id": block_id or f"blk_{secrets.token_hex(4)}",
        "type": CX_BLOCK_TYPE,
        "enabled": True,
        "cx": {"ref": ref, "spec": spec},
        **copy.deepcopy(content),
    }
    TenantConfigSerializer()._sign_tree(block)
    return block


def compose(tenant, prompt_text, page_key="home"):
    source, remaining = _gate(tenant)
    if source:
        return _result(source, remaining)
    request = str(prompt_text or "").strip()[:PROMPT_MAX]
    if len(request) < PROMPT_MIN:
        return _result("error", remaining)
    page = page_key if page_key in KNOWN_PAGE_KEYS else "home"
    started = _now()
    style_id, brand, coach = _context(tenant)
    try:
        spec, content, missing, cost = _generate(cx_prompt.compose_turn(request, page, coach, style_id), started)
    except CxError as exc:
        site_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
        logger.warning("cx compose failed for %s: %s", tenant.schema_name, exc)
        return _result("error", remaining)
    site_ai.record_attempt_cost(tenant.schema_name, cost)
    _fill_images(content, spec, coach, brand, style_id, started)
    ref = _save(tenant, None, spec, content, request, missing)
    site_ai.record_update(tenant.schema_name)
    return _result("ai", max(0, remaining - 1), _block(spec, content, ref), missing)


def refine(tenant, raw_block, instruction):
    source, remaining = _gate(tenant)
    if source:
        return _result(source, remaining)
    current = clean_cx_block(raw_block)
    change = str(instruction or "").strip()[:PROMPT_MAX]
    if current is None or len(change) < INSTRUCTION_MIN:
        return _result("error", remaining)
    old_content = content_of(current)
    started = _now()
    style_id, brand, coach = _context(tenant)
    turn = cx_prompt.refine_turn(change, current["cx"]["spec"], _words_only(old_content), coach, style_id)
    try:
        spec, content, missing, cost = _generate(turn, started)
    except CxError as exc:
        site_ai.record_attempt_cost(tenant.schema_name, exc.cost_usd)
        logger.warning("cx refine failed for %s: %s", tenant.schema_name, exc)
        return _result("error", remaining)
    site_ai.record_attempt_cost(tenant.schema_name, cost)
    merged = _merge(old_content, content, spec)
    _fill_images(merged, spec, coach, brand, style_id, started)
    ref = _save(tenant, current["cx"]["ref"], spec, merged, change, missing)
    site_ai.record_update(tenant.schema_name)
    return _result("ai", max(0, remaining - 1), _block(spec, merged, ref, current["id"]), missing)


def my_components(tenant):
    rows = []
    # ponytail: one version query per component (≤ MY_LIMIT); prefetch when the list grows.
    for component in CxComponent.objects.filter(author_tenant_schema=tenant.schema_name)[:MY_LIMIT]:
        version = component.versions.filter(n=component.latest_version).first()
        if version is None:
            continue
        content = copy.deepcopy(version.content)
        TenantConfigSerializer()._sign_tree(content)
        rows.append(
            {
                "id": component.pk,
                "name": component.name,
                "summary": component.summary,
                "ref": f"{component.pk}@{version.n}",
                "spec": version.spec,
                "content": content,
            }
        )
    return {"components": rows}
