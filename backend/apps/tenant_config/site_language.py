"""A site's language: the creator can change it until the site has gone live; after that only the superadmin can.

"Gone live" means went live once (`Tenant.is_published`, or `setup_flow.completed_at`, which go-live stamps), so hiding
the site again does not unlock it. A change before go-live redrafts what setup already wrote in the old language.
"""

import logging
from contextlib import suppress
from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.db.models import F
from django.utils.translation import override
from django_tenants.utils import schema_context

from apps.core import languages

logger = logging.getLogger(__name__)
REDRAFT_FAILED = "language_redraft_failed"  # in setup_progress: the last redraft did not finish; `change` redoes it


class SiteLanguageLocked(Exception):  # noqa: N818 (the name the callers and the brief use)
    """The site is live, so its language stays as it is."""


def is_locked(tenant) -> bool:
    if tenant.is_published:
        return True
    from .models import TenantConfig

    with schema_context(tenant.schema_name):
        flow = TenantConfig.objects.values_list("setup_flow", flat=True).first()
    return bool((flow or {}).get("completed_at"))


def stored(tenant) -> str:
    """The language the site row holds (not resolved: one that is not enabled shows as it is)."""
    from .models import TenantConfig

    with schema_context(tenant.schema_name):
        return TenantConfig.objects.values_list("default_locale", flat=True).first() or languages.DEFAULT


def change(tenant, code: str, *, force: bool = False) -> None:
    """Save the site's language. Before go-live the draft content follows it (`redraft`, after the commit); `force`
    (the superadmin) changes a live site and leaves what is written as it is. The language the site already has is
    a no-op, unless the last redraft did not finish: then the same call redoes it."""
    from .models import TenantConfig

    if code not in languages.enabled():
        raise ValueError(f"language {code!r} is not enabled")
    locked = is_locked(tenant)
    if locked and not force:
        raise SiteLanguageLocked(code)
    with schema_context(tenant.schema_name):
        unfinished = (TenantConfig.objects.values_list("setup_progress", flat=True).first() or {}).get(REDRAFT_FAILED)
        if code == stored(tenant) and not (unfinished and not locked):
            return
        TenantConfig.objects.update(default_locale=code)
        cache.delete(f"tenant:{tenant.schema_name}:config")
    if not locked:
        transaction.on_commit(lambda: _redraft_after_commit(tenant))


def _redraft_after_commit(tenant) -> None:
    """The language is saved, so a redraft that fails is logged, never raised into the request."""
    try:
        redraft(tenant)
    except Exception:
        logger.exception("site language redraft failed schema=%s", tenant.schema_name)
        _mark_redraft(tenant, failed=True)


def _mark_redraft(tenant, *, failed: bool) -> None:
    from .models import TenantConfig

    with schema_context(tenant.schema_name), transaction.atomic():
        config = TenantConfig.objects.select_for_update().first()
        progress = dict(config.setup_progress or {})
        if failed:
            progress[REDRAFT_FAILED] = True
        elif not progress.pop(REDRAFT_FAILED, None):
            return
        config.setup_progress = progress
        config.save(update_fields=["setup_progress"])


def _default_labels() -> dict[str, set[str]]:
    """href -> the default header link label in every language: one written before the site changed language is
    still a default, one the creator renamed is not."""
    from apps.core.onboarding.compose import COPY

    from .interview_milestones import NAV

    labels: dict[str, set[str]] = {}
    for code in languages.CODES:
        with override(code):
            for href, text in (*NAV, ("/store", COPY["nav_store"])):
                labels.setdefault(href, set()).add(str(text))
    return labels


def _relabel_header(tenant) -> None:
    """The header's default texts (links and button) take the site's new language; the creator's own wording stays."""
    from apps.core.onboarding.compose import COPY

    from .defaults import header_cta
    from .interview_milestones import NAV, _default_cta_texts
    from .models import TenantConfig

    with override(languages.site_language()):
        now = {href: str(text) for href, text in (*NAV, ("/store", COPY["nav_store"]))}
        led = {href: header_cta([href]) for href in ("/courses", "/events", "/contact")}
    defaults = _default_labels()
    nav = dict(TenantConfig.objects.values_list("navbar_config", flat=True).first() or {})
    links = [
        {**link, "label": now[link["href"]]} if link.get("label") in defaults.get(link.get("href"), ()) else link
        for link in nav.get("links") or []
    ]
    cta = nav.get("cta")
    if cta and cta.get("text") in _default_cta_texts() and cta.get("href") in led:
        cta = led[cta["href"]]
    if links != (nav.get("links") or []) or cta != nav.get("cta"):
        TenantConfig.objects.update(navbar_config={**nav, "links": links, **({"cta": cta} if cta else {})})


def _restart_email_starters(tenant) -> None:
    """The starters she never edited are made again in the new language; one she edited stays, and its twin is
    not made."""
    from apps.email_campaigns import starters
    from apps.email_campaigns.models import EmailTemplate, TemplateSource

    from .setup_flow import _update_flow

    mine = EmailTemplate.objects.filter(source=TemplateSource.STARTER)
    if not mine.exists():
        return  # none made yet: they will be, in the new language
    untouched = mine.filter(updated_at__lte=F("created_at") + timedelta(seconds=2))
    kept = set(mine.exclude(pk__in=untouched).values_list("category", flat=True))
    untouched.delete()
    _update_flow(tenant, lambda _config, flow: flow.pop("email_starters", None))
    for made in starters.ensure(tenant):
        if made.category in kept:
            made.delete()


def starter_post():
    """The first post setup wrote when the creator has not touched it (and it is the only post), else None."""
    from apps.blog.models import BlogPost

    from .models import SeededObject
    from .seeding import fingerprint_for

    posts = list(BlogPost.objects.all()[:2])
    if len(posts) != 1 or posts[0].status != "draft":
        return None
    post = posts[0]
    seeded = SeededObject.objects.filter(
        content_type__model="blogpost", object_id=str(post.pk), fingerprint=fingerprint_for(post)
    )
    return post if seeded.exists() else None


def _kept(kind: str, flow: dict, answers: dict) -> bool:
    """A draft whose step she completed, that she approved on the review screen, or that went live is hers: only an
    open draft is redrafted. (A class has no publish state, so only her approval counts for one.)"""
    from .setup_flow import content_snapshot

    if kind in (flow.get("done") or []) or answers.get(f"{kind}_review") == "approved":
        return True
    item = content_snapshot(flow).get(kind)
    return kind in ("course", "post") and bool(item and item["is_published"])


def redraft(tenant) -> None:
    """The AI's text she has not touched is written again in the site's new language: the header's default texts,
    the pages built (not one she edited), the open drafts (not one she completed, approved or published), the
    starter emails and the first post. The slow work is queued. A step that fails is logged and the others still
    run; the redraft is then marked unfinished, so the same `change` call redoes it."""
    from apps.core import tasks

    from . import interview_milestones, setup_flow
    from .interview_brief import answers_of
    from .models import TenantConfig

    failed = False

    def step(name, fn, *args, **kwargs):
        nonlocal failed
        try:
            fn(*args, **kwargs)
        except Exception:
            failed = True
            logger.exception("site language redraft step failed schema=%s step=%s", tenant.schema_name, name)

    def build(page):
        with suppress(setup_flow.FlowError):  # not a page setup builds
            setup_flow.build_page(tenant, page, force=True)

    def first_post():
        if starter_post() is not None:
            tasks.regenerate_starter_post.delay(tenant.id)

    with schema_context(tenant.schema_name):
        step("header", _relabel_header, tenant)
        config = TenantConfig.objects.first()
        flow = (config.setup_flow if config else None) or {}
        edited = set(((config.setup_progress if config else None) or {}).get("pages_edited") or [])
        answers = answers_of(tenant)
        for page, built in (flow.get("page_builds") or {}).items():
            if (built or {}).get("status") == "ready" and page not in edited:
                step(f"page:{page}", build, page)
        for kind, ref in (flow.get("drafts") or {}).items():
            if kind in setup_flow.DRAFT_MODELS and ref and not _kept(kind, flow, answers):
                step(f"draft:{kind}", interview_milestones.redraft, tenant, answers, kind, "words")
        step("starters", _restart_email_starters, tenant)
        step("post", first_post)
    _mark_redraft(tenant, failed=failed)
