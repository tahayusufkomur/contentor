"""The final visual check of a finished site, before the coach goes live.

Every page the interview built is screenshotted (infra/browser: desktop in the
site's own colour scheme and in its other one, and a phone), SITE_QA_MODEL
reviews each page's screenshots, and what it can fix safely is fixed through
the copilot's own doors, so every change is in the coach's "what changed"
trail with its undo. What needs a person is logged for us.

State lives in TenantConfig.setup_flow["qa"]:
  {status: checking|done|failed, started, sig, runs, pages, fixed: [..], open: [..]}

Fail-soft like the rest of onboarding: a check that cannot run never blocks
going live.
"""

import hashlib
import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from decimal import Decimal
from typing import Literal

import requests
from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django_tenants.utils import tenant_context
from pydantic import BaseModel

from apps.core import ai as core_ai

from .models import TenantConfig

logger = logging.getLogger(__name__)

MAX_RUNS = 2  # per site: the first check, and one more after the coach's changes
STALE_AFTER = timedelta(minutes=15)  # a check still "checking" after this died
MAX_FIXES = 12  # per run
DESKTOP, PHONE = 1280, 390
CAPTURE_TIMEOUT = 120
REVIEW_TIMEOUT = 180
# ponytail: the task holds one Celery slot for the whole check (minutes);
# move it to its own queue if page builds start waiting behind it.
PARALLEL_PAGES = 3

SYSTEM_PROMPT = (
    "You are the last pair of eyes on a coach's brand-new website before it "
    "goes live. You get screenshots of ONE page: the desktop view in the "
    "site's own colour scheme, the desktop view in its other scheme (visitors "
    "can switch), and the phone view. Each view is cut into strips, top to "
    "bottom.\n"
    "Report what a careful designer would not let ship:\n"
    "- a logo or image in a visible background box, or with a halo, that does "
    "not belong on the page's colour\n"
    "- text that is cut off, overlapping, unreadable against what is behind "
    "it, or left as a placeholder\n"
    "- a broken, missing, stretched or badly cropped image, or a photo that "
    "plainly does not show the coach's subject\n"
    "- a section that is empty, half-rendered, duplicated or visibly "
    "misaligned\n"
    "- anything that breaks in only one colour scheme, or only on the phone\n"
    "Report only defects you can see in the screenshots. Do not report taste "
    "(a photo or colour you would have chosen differently), the bar offering "
    "to install the site as an app, or a list that says it has nothing yet. "
    "A page with nothing wrong gets an empty list.\n"
    "For each finding give: where (which view, which part of the page), the "
    "issue in one plain sentence, a severity (blocker: looks broken to any "
    "visitor; noticeable: a visitor would likely notice; minor), and a fix "
    "when one of these fits:\n"
    "- clean_logo: the header logo sits in a background box. No other fields.\n"
    "- swap_image: replace a section's photo. block_id and field from the "
    "block list; value is a short description of the photo wanted.\n"
    "- rewrite_text: replace one text field of a block, to fix text that "
    "overflows or is a placeholder. block_id and field from the block list; "
    "value is the new text, in the same language, no longer than the old.\n"
    "- hide_block: hide a section that is empty or broken beyond a text or "
    "photo fix. block_id from the block list. Never the first section.\n"
    "- none: it needs a person (layout, colour and code problems).\n"
    "Use block ids and field names exactly as the block list gives them."
)


class Finding(BaseModel):
    where: str
    issue: str
    severity: Literal["blocker", "noticeable", "minor"]
    fix: Literal["none", "clean_logo", "swap_image", "rewrite_text", "hide_block"] = "none"
    block_id: str = ""
    field: str = ""
    value: str = ""


class PageReview(BaseModel):
    findings: list[Finding]


def available() -> bool:
    from apps.core.onboarding import ai_compose

    return bool(
        settings.SITE_QA_BROWSER_URL and core_ai.vision_provider() is not None and ai_compose.compose_available()
    )


def _signature(config) -> str:
    """What the check looked at: a site unchanged since is not checked again."""
    seen = [config.pages or {}, str(config.logo_id or ""), config.style or "", config.palette or ""]
    return hashlib.sha256(json.dumps(seen, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _built_pages(flow: dict) -> list[str]:
    builds = flow.get("page_builds") or {}
    return [key for key, build in builds.items() if (build or {}).get("status") == "ready"]


def ensure(tenant, config) -> dict | None:
    """The check as the go-live card shows it, started here when the finished
    site has not been checked as it is now. None when the check is off."""
    from .setup_flow import _update_flow

    flow = config.setup_flow or {}
    qa = flow.get("qa") or {}
    if not qa and not available():
        return None
    started = parse_datetime(qa.get("started") or "")
    running = qa.get("status") == "checking" and started and timezone.now() - started < STALE_AFTER
    wanted = (
        not running
        and (flow.get("status") or "done") != "done"  # setup over: the site is the coach's now
        and qa.get("sig") != _signature(config)
        and qa.get("runs", 0) < MAX_RUNS
        and _built_pages(flow)
        and available()
    )
    if wanted:
        from apps.core.tasks import site_qa_task

        def mutate(_config, flow):
            flow["qa"] = {
                **(flow.get("qa") or {}),
                "status": "checking",
                "started": timezone.now().isoformat(),
                "runs": (flow.get("qa") or {}).get("runs", 0) + 1,
            }

        qa = _update_flow(tenant, mutate)["qa"]
        site_qa_task.delay(tenant.id)
    elif qa.get("status") == "checking" and not running:
        qa = {**qa, "status": "failed"}  # the worker died mid-check
    return {"status": qa.get("status"), "pages": qa.get("pages", 0), "fixed": qa.get("fixed") or []}


# ── screenshots ──────────────────────────────────────────────────────────────


def _capture(url: str, slug: str, width: int, theme: str | None = None) -> dict:
    res = requests.post(
        f"{settings.SITE_QA_BROWSER_URL.rstrip('/')}/capture",
        # The preview cookie opens a site that is not published yet.
        json={"url": url, "width": width, "theme": theme, "cookies": [{"name": "contentor_preview", "value": slug}]},
        timeout=CAPTURE_TIMEOUT,
    )
    res.raise_for_status()
    return res.json()


def _views(url: str, slug: str) -> list[tuple[str, dict]]:
    """The page as visitors can see it: (label, capture) per view."""
    desktop = _capture(url, slug, DESKTOP)
    own = desktop["theme"]
    views = [(f"Desktop, the site's own colour scheme ({own})", desktop)]
    other = _capture(url, slug, DESKTOP, "light" if own != "light" else "dark")
    if other["theme"] != own:  # a site with the switch turned off has one scheme
        views.append((f"Desktop, the other colour scheme ({other['theme']})", other))
    views.append((f"Phone ({own})", _capture(url, slug, PHONE)))
    return views


# ── review ───────────────────────────────────────────────────────────────────


def _review(context: str, views: list[tuple[str, dict]]) -> tuple[PageReview, Decimal]:
    content = [{"type": "text", "text": context}]
    for label, capture in views:
        content.append({"type": "text", "text": f"{label}, {len(capture['tiles'])} strip(s) top to bottom:"})
        content += [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": tile}}
            for tile in capture["tiles"]
        ]
        if capture["issues"]:
            content.append({"type": "text", "text": "The browser also measured: " + "; ".join(capture["issues"])})
    review, cost, _ = core_ai.structured_messages(
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
        output_model=PageReview,
        model=settings.SITE_QA_MODEL,
        max_tokens=16000,
        effort="medium",
        timeout_seconds=REVIEW_TIMEOUT,
    )
    return review, cost


def _check_page(job: dict) -> dict:
    """One page, in a worker thread: no database here."""
    try:
        views = _views(job["url"], job["slug"])
        review, cost = _review(job["context"], views)
        return {"page": job["page"], "findings": review.findings, "cost": cost}
    except core_ai.AiError as exc:
        logger.warning("site-qa: review failed page=%s: %s", job["page"], exc)
        return {"page": job["page"], "error": str(exc), "cost": exc.cost_usd}
    except Exception as exc:  # the browser service, or a reply we cannot read
        logger.warning("site-qa: check failed page=%s: %s", job["page"], exc)
        return {"page": job["page"], "error": str(exc), "cost": Decimal("0")}


def _page_context(tenant, config, page: str, digest: str) -> str:
    from . import interview_brief as brief

    answers = brief.answers_of(tenant)
    lines = [line for line in digest.split("\n") if line.startswith("  ")]
    return (
        f"Brand: {config.brand_name or tenant.name}\n"
        f"Teaches: {brief.subject_of(answers) or 'not said'}\n"
        f"Page: {page}\n"
        "Blocks on this page (id, type, fields):\n" + ("\n".join(lines) or "  (none)")
    )


# ── fixes ────────────────────────────────────────────────────────────────────


def _block(config, page: str, block_id: str) -> dict | None:
    from apps.core.copilot import blocks

    for index, block in enumerate(blocks.page_blocks((config.pages or {}).get(page)) or []):
        if isinstance(block, dict) and block.get("id") == block_id:
            return {**block, "_first": index == 0}
    return None


def _clean_logo(config) -> dict | None:
    """The copilot action that swaps the logo for a clean cutout of itself,
    or None when the cleaner finds no background to take off."""
    import io

    from PIL import Image

    from apps.core.curated_logos.clean import MAX_SIZE, clean_curated_png
    from apps.core.platform.uploads import _store_object
    from apps.core.storage import build_s3_path, get_s3_client
    from apps.media.models import Photo

    logo = config.logo
    if logo is None:
        return None
    data = get_s3_client().get_object(Bucket=settings.AWS_BUCKET_NAME, Key=logo.s3_key)["Body"].read()
    cleaned = clean_curated_png(data)

    def ink(raw):
        """(opaque pixels, longest edge)."""
        with Image.open(io.BytesIO(raw)) as im:
            return sum(1 for a in im.convert("RGBA").getchannel("A").getdata() if a >= 128), max(im.size)

    if cleaned == data:
        return None
    (before, edge), (after, _) = ink(data), ink(cleaned)
    shrink = min(1.0, MAX_SIZE / edge) ** 2  # the cleaner also bounds the size
    if after > 0.98 * before * shrink:
        return None  # nothing came off: not a background the cleaner knows
    with Image.open(io.BytesIO(cleaned)) as im:
        width, height = im.size
    key = build_s3_path("photo", f"{uuid.uuid4().hex}.png")
    _store_object(key, io.BytesIO(cleaned), "image/png")
    photo = Photo.objects.create(
        s3_key=key,
        title=logo.title,
        alt_text=logo.alt_text,
        content_type="image/png",
        file_size=len(cleaned),
        width=width,
        height=height,
    )
    return {"kind": "set_logo", "tenant_photo_id": str(photo.pk)}


def _action(tenant, config, page: str, finding: Finding) -> tuple[dict, str] | None:
    """The copilot action for a finding's fix and what to tell the coach, or
    None when the fix does not hold up (an id the model made up, a section
    that must stay)."""
    from apps.core.copilot import photos

    from . import sections

    if finding.fix == "clean_logo":
        action = _clean_logo(config)
        return (action, "Gave your logo a clean, see-through background") if action else None
    block = _block(config, page, finding.block_id)
    if block is None:
        return None
    target = {"page": page, "block_id": block["id"]}
    if finding.fix == "hide_block":
        if block["_first"] or block.get("type") == "hero":
            return None
        return {"kind": "toggle_block", **target, "enabled": False}, f"Hid an unfinished section on your {page} page"
    if finding.fix == "rewrite_text" and finding.field and finding.value.strip():
        action = {"kind": "edit_block_fields", **target, "fields": {finding.field: finding.value}}
        return action, f"Tidied the wording on your {page} page"
    if finding.fix == "swap_image" and finding.value.strip():
        field = photos.image_field_for(block.get("type"), finding.field or None)
        current = block.get(field) if isinstance(block.get(field), dict) else {}
        from apps.media.models import Photo

        exclude = Photo.objects.filter(pk=current.get("photo_id")).values_list("s3_key", flat=True).first()
        photo_words = (sections.style(config.style) or {}).get("photoWords", "")
        image = photos.pick_photo(
            f"{finding.value} {photo_words}".strip(),
            tenant,
            field=field,
            exclude_s3_key=exclude,
            subject=f"{tenant.schema_name}:page:{page}:{block['id']}:{field}",
        )
        action = {"kind": "set_block_image", **target, "field": field, "curated_asset_id": image.asset_id}
        return action, f"Replaced a photo on your {page} page"
    return None


def _target(page: str, finding: Finding) -> tuple:
    """What a fix acts on: the same defect seen on another page or in another
    view is one fix."""
    return (finding.fix, "" if finding.fix == "clean_logo" else f"{page}:{finding.block_id}:{finding.field}")


def _apply(tenant, results: list[dict]) -> tuple[list[str], list[dict]]:
    """Fix what can be fixed -> (what was fixed, in the coach's words; what is
    left open)."""
    from apps.core.copilot.views import _execute, _record_audit

    found = [(r["page"], f) for r in results for f in r.get("findings") or []]
    fixed, tried, applied = [], set(), set()
    for page, finding in found:
        target = _target(page, finding)
        if finding.fix == "none" or finding.severity == "minor" or target in tried or len(tried) >= MAX_FIXES:
            continue
        tried.add(target)
        try:
            with tenant_context(tenant):
                planned = _action(tenant, TenantConfig.objects.first(), page, finding)
            if planned is None:
                continue
            action, said = planned
            outcome, inverse = _execute(tenant, None, action)
            _record_audit(tenant, None, action, outcome, inverse)
        except Exception as exc:  # a fix that fails leaves the site as it was
            logger.warning("site-qa: fix failed tenant=%s page=%s %s: %s", tenant.schema_name, page, target, exc)
            continue
        applied.add(target)
        if said not in fixed:
            fixed.append(said)
    left = [
        {"page": page, **finding.model_dump(include={"where", "issue", "severity", "fix"})}
        for page, finding in found
        if _target(page, finding) not in applied
    ]
    return fixed, left


# ── the run ──────────────────────────────────────────────────────────────────


def run(tenant) -> None:
    """The whole check, in the Celery worker. Never raises."""
    from apps.core.copilot.engine import _pages_digest
    from apps.core.onboarding import ai_compose

    from .setup_flow import PAGE_PATHS, _update_flow

    def finish(**qa):
        def mutate(config, flow):
            flow["qa"] = {**(flow.get("qa") or {}), **qa, "sig": _signature(config)}

        with tenant_context(tenant):
            _update_flow(tenant, mutate)

    try:
        with tenant_context(tenant):
            config = TenantConfig.objects.first()
            host = tenant.domains.order_by("-is_primary").values_list("domain", flat=True).first()
            digest = _pages_digest(tenant)
            jobs = []
            for page in _built_pages(config.setup_flow or {}):
                start = digest.find(f"page={page}\n")
                jobs.append(
                    {
                        "page": page,
                        "url": f"http://{host}{PAGE_PATHS.get(page, f'/{page}')}",
                        "slug": tenant.slug,
                        "context": _page_context(
                            tenant, config, page, digest[start:].split("\npage=")[0] if start >= 0 else ""
                        ),
                    }
                )
        with ThreadPoolExecutor(max_workers=PARALLEL_PAGES) as pool:
            results = list(pool.map(_check_page, jobs))
        cost = sum((r["cost"] for r in results), Decimal("0"))
        if cost:
            ai_compose.record_spend(tenant.schema_name, float(cost))
        checked = [r for r in results if "error" not in r]
        if not checked:
            finish(status="failed", pages=0, fixed=[], open=[])
            return
        fixed, left = _apply(tenant, checked)
        for entry in left:  # for us: mostly defects of a style or of the code
            level = logging.INFO if entry["severity"] == "minor" else logging.WARNING
            logger.log(level, "site-qa: open finding tenant=%s %s", tenant.schema_name, json.dumps(entry))
        logger.info(
            "site-qa: tenant=%s pages=%d/%d fixed=%d open=%d cost=$%s",
            tenant.schema_name,
            len(checked),
            len(jobs),
            len(fixed),
            len(left),
            cost,
        )
        finish(status="done", pages=len(checked), fixed=fixed, open=left)
    except Exception:
        logger.exception("site-qa: run failed tenant=%s", tenant.schema_name)
        finish(status="failed")
