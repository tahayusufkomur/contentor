"""Seed a real (non-demo) tenant from a niche template.

Sibling to `apps.core.management.commands.seed_demo_tenant` — that command
creates an `is_demo=True` marketing tenant with full students/payments. This
module is the live-tenant variant: it runs against an already-provisioned
tenant (owner already created, TenantConfig already exists) and writes
content as drafts so the coach can review and publish.

Shared between two callers:
  - the onboarding endpoint (via the Celery task) at signup time
  - manual `seed_template` management command (handy for QA / re-runs)
"""

from __future__ import annotations

import importlib
import logging
import secrets
from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone
from django_tenants.utils import tenant_context

if TYPE_CHECKING:
    from collections.abc import Callable

logger = logging.getLogger(__name__)

# Modest targets vs. the demo command — coaches don't need 50 courses to feel
# the platform is alive, and over-seeding makes cleanup painful.
TARGET_COURSES = 12
TARGET_VIDEOS = 40
TARGET_PHOTOS = 60

# Live events span: coaches don't need 2 years of seeded events. A handful in
# the recent past + near future is enough to make the calendar feel populated.
LIVE_PAST_WEEKS = 4
LIVE_FUTURE_WEEKS = 8


class TemplateSeedError(Exception):
    pass


def _resolve_niche_module(niche: str):
    try:
        return importlib.import_module(f"apps.core.management.commands.demo_data.{niche}")
    except ModuleNotFoundError as exc:
        raise TemplateSeedError(f"No demo data module found for niche: {niche}") from exc


def available_niches() -> list[str]:
    """Return the list of niche keys that can be seeded.

    Discovered by importing the demo_data package and listing submodules that
    have a `TENANT` attribute — keeps the source of truth in one place.
    """
    import pkgutil

    from apps.core.management.commands import demo_data

    keys = []
    for mod_info in pkgutil.iter_modules(demo_data.__path__):
        name = mod_info.name
        try:
            mod = importlib.import_module(f"apps.core.management.commands.demo_data.{name}")
        except ImportError:
            logger.warning("Skipping demo_data module %s: import failed", name)
            continue
        if hasattr(mod, "TENANT") and hasattr(mod, "CONFIG"):
            keys.append(name)
    return sorted(keys)


def seed_template_into_tenant(
    tenant,
    niche: str,
    *,
    writer: Callable[[str], None] | None = None,
) -> None:
    """Seed niche content into a live (non-demo) tenant.

    Assumes the tenant is already provisioned: schema created, owner User
    exists in the tenant schema, TenantConfig exists. The function:

      - Merges the niche's CONFIG into the existing TenantConfig (preserving
        the coach's brand_name and locale).
      - Creates photos / courses / downloads / live events as drafts.
      - Skips demo synthetic users, students, payments, and student progress.

    Raises TemplateSeedError on a missing niche module. Other exceptions
    propagate so the surrounding Celery task can mark the tenant failed.
    """
    log = writer or logger.info
    data = _resolve_niche_module(niche)

    config_data = dict(data.CONFIG)
    courses_data = list(data.COURSES)
    downloads_data = list(getattr(data, "DOWNLOADS", []))
    plans_data = list(getattr(data, "SUBSCRIPTION_PLANS", []))
    bundles_data = list(getattr(data, "BUNDLES", []))
    live_classes_data = list(getattr(data, "LIVE_CLASSES", []))
    live_streams_data = list(getattr(data, "LIVE_STREAMS", []))
    zoom_classes_data = list(getattr(data, "ZOOM_CLASSES", []))
    onsite_events_data = list(getattr(data, "ONSITE_EVENTS", []))

    expanded_courses = _expand_courses(courses_data, TARGET_COURSES)

    with tenant_context(tenant):
        # Tenant config is created at provision time; merge in theme/landing
        # without clobbering the coach's brand_name or locale.
        photo_map = _seed_photos(config_data, expanded_courses)
        _merge_config(tenant, config_data, photo_map)

        owner = _resolve_owner(tenant)
        with transaction.atomic():
            courses = _seed_courses(expanded_courses, owner, photo_map)
            _seed_extra_videos(courses_data, TARGET_VIDEOS)
            _seed_extra_photos(courses_data, config_data, TARGET_PHOTOS)
            if downloads_data:
                _seed_downloads(downloads_data)

            charge_currency = _tenant_charge_currency(tenant)
            sub_plans = _seed_subscription_plans(plans_data, courses, charge_currency)
            bundles = _seed_bundles(bundles_data, courses, charge_currency)

            from apps.media.models import Photo

            all_photos = list(Photo.objects.all())
            _seed_live_classes(live_classes_data, owner, all_photos)
            _seed_live_streams(live_streams_data, owner, all_photos)
            _seed_zoom_classes(zoom_classes_data, owner, all_photos)
            _seed_onsite_events(onsite_events_data, owner, all_photos)

        log(
            f"Seeded niche '{niche}': {len(courses)} courses, "
            f"{len(sub_plans)} subscription plans, {len(bundles)} bundles"
        )


# ----------------------------------------------------------------------
# Config merge
# ----------------------------------------------------------------------

# These keys come from the demo data and would overwrite values the coach
# typed at signup or that depend on their region — skip them.
_CONFIG_SKIP_KEYS = {"brand_name", "default_locale", "onboarding_completed"}


def _merge_config(tenant, config_data: dict, photo_map: dict) -> None:
    from apps.tenant_config.defaults import pages_from_landing_sections
    from apps.tenant_config.models import TenantConfig

    config = TenantConfig.objects.first()
    if config is None:
        # Shouldn't happen — provision_tenant always creates one — but if a
        # template re-run hits a freshly-wiped tenant, fall back to create.
        merged = {k: v for k, v in config_data.items() if k not in _CONFIG_SKIP_KEYS}
        merged["brand_name"] = tenant.name
        sections = merged.get("landing_sections", {})
        _inject_photo_ids(sections, photo_map)
        merged["pages"] = pages_from_landing_sections(sections, brand_name=tenant.name)
        TenantConfig.objects.create(**merged)
        return

    for key, value in config_data.items():
        if key in _CONFIG_SKIP_KEYS:
            continue
        if not hasattr(config, key):
            continue
        if key == "landing_sections" and isinstance(value, dict):
            value = dict(value)
            _inject_photo_ids(value, photo_map)
        setattr(config, key, value)
    # Derive the builder pages from the (photo-injected) niche landing sections,
    # replacing the placeholder defaults provision created.
    config.pages = pages_from_landing_sections(config.landing_sections or {}, brand_name=config.brand_name)
    config.save()


def _inject_photo_ids(sections: dict, photo_map: dict) -> None:
    hero = sections.get("hero")
    if isinstance(hero, dict) and hero.get("bg_image_url"):
        photo = photo_map.get(hero["bg_image_url"])
        if photo:
            hero["bg_image_photo_id"] = str(photo.pk)
    about = sections.get("about")
    if isinstance(about, dict) and about.get("image_url"):
        photo = photo_map.get(about["image_url"])
        if photo:
            about["image_photo_id"] = str(photo.pk)


# ----------------------------------------------------------------------
# Owner lookup
# ----------------------------------------------------------------------


def _resolve_owner(tenant):
    """The owner is created by `provision_tenant` in the tenant schema. Look it
    up by email; if missing (shouldn't happen), fall back to the first owner."""
    from apps.accounts.models import User

    try:
        return User.objects.get(email=tenant.owner_email, role="owner")
    except User.DoesNotExist:
        owner = User.objects.filter(role="owner").first()
        if owner is None:
            raise TemplateSeedError(
                f"Tenant {tenant.slug} has no owner user in its schema — provision step never ran."
            ) from None
        return owner


# ----------------------------------------------------------------------
# Course expansion (mirrors seed_demo_tenant._expand_courses, smaller target)
# ----------------------------------------------------------------------


def _expand_courses(base_courses, target):
    if len(base_courses) >= target:
        return base_courses[:target]

    expanded = []
    pricing_types = ["free", "paid"]
    prices = [0, 19, 29, 39, 49, 59]

    for i in range(target):
        template = base_courses[i % len(base_courses)]
        course = {**template}
        if i < len(base_courses):
            expanded.append(course)
            continue
        batch = (i // len(base_courses)) + 1
        course["title"] = f"{template['title']} — Volume {batch}"
        course["order"] = i + 1
        pt = pricing_types[i % len(pricing_types)]
        course["pricing_type"] = pt
        course["price"] = 0 if pt == "free" else prices[i % len(prices)]
        course["lessons"] = [dict(lesson) for lesson in template["lessons"]]
        expanded.append(course)
    return expanded


# ----------------------------------------------------------------------
# Seed helpers (live-tenant variants)
# ----------------------------------------------------------------------


def _seed_photos(config_data, courses_data):
    from apps.media.models import Photo

    photo_keys = set()
    sections = config_data.get("landing_sections", {})
    for section in sections.values():
        if isinstance(section, dict):
            for key in ("bg_image_url", "image_url"):
                if section.get(key):
                    photo_keys.add(section[key])
    for course in courses_data:
        if course.get("thumbnail_url"):
            photo_keys.add(course["thumbnail_url"])

    photo_map = {}
    for s3_key in photo_keys:
        photo = Photo.objects.create(s3_key=s3_key, title=s3_key.split("/")[-1])
        photo_map[s3_key] = photo
    return photo_map


def _seed_courses(courses_data, instructor, photo_map):
    from apps.courses.models import Course, Lesson, Module, Video

    created = []
    for course_data in courses_data:
        course_fields = {k: v for k, v in course_data.items() if k not in ("lessons", "module_title")}
        course_fields = _coerce_pricing(course_fields)
        # Force draft state — coach should review before publishing to students.
        course_fields["is_published"] = False
        lessons_data = course_data["lessons"]
        module_title = course_data["module_title"]
        thumbnail_url = course_fields.get("thumbnail_url", "")
        photo = photo_map.get(thumbnail_url)

        course = Course(instructor=instructor, thumbnail=photo, **course_fields)
        course.save()

        module = Module.objects.create(course=course, title=module_title, order=1)
        for lesson_data in lessons_data:
            lesson_data = dict(lesson_data)
            video_url = lesson_data.pop("video_url", "")
            duration = lesson_data.get("duration_seconds", 0)
            video = None
            if video_url:
                video = Video.objects.create(
                    title=lesson_data["title"],
                    s3_key=video_url,
                    duration_seconds=duration,
                )
            Lesson.objects.create(
                module=module,
                video=video,
                video_url=video_url,
                **lesson_data,
            )
        created.append(course)
    return created


def _seed_extra_videos(base_courses, target):
    from apps.courses.models import Video

    existing = Video.objects.count()
    needed = max(0, target - existing)
    if needed == 0:
        return
    video_keys = []
    for course in base_courses:
        for lesson in course.get("lessons", []):
            if lesson.get("video_url"):
                video_keys.append((lesson["video_url"], lesson["title"], lesson.get("duration_seconds", 300)))
    if not video_keys:
        return
    for i in range(needed):
        s3_key, title, duration = video_keys[i % len(video_keys)]
        Video.objects.create(
            title=f"{title} ({i + 1})",
            s3_key=s3_key,
            duration_seconds=duration + (secrets.randbelow(91) - 30),
            file_size=10_000_000 + secrets.randbelow(190_000_001),
        )


def _seed_extra_photos(base_courses, config_data, target):
    from apps.media.models import Photo

    existing = Photo.objects.count()
    needed = max(0, target - existing)
    if needed == 0:
        return
    photo_keys = []
    for course in base_courses:
        if course.get("thumbnail_url"):
            photo_keys.append(course["thumbnail_url"])
    sections = config_data.get("landing_sections", {})
    for section in sections.values():
        if isinstance(section, dict):
            for key in ("bg_image_url", "image_url"):
                if section.get(key) and section[key] not in photo_keys:
                    photo_keys.append(section[key])
    if not photo_keys:
        return
    categories = ["Thumbnail", "Banner", "Background", "Hero", "Gallery"]
    for i in range(needed):
        s3_key = photo_keys[i % len(photo_keys)]
        category = categories[i % len(categories)]
        Photo.objects.create(
            s3_key=s3_key,
            title=f"{category} {i + 1}",
            file_size=50_000 + secrets.randbelow(4_950_001),
        )


def _coerce_pricing(data: dict) -> dict:
    """Demote 'paid' entries with a missing/zero price to free — several niche
    templates ship paid items without an amount, which would seed an unbuyable
    'paid for 0' storefront item."""
    if data.get("pricing_type") == "paid" and not float(data.get("price") or 0):
        data = dict(data)
        data["pricing_type"] = "free"
        data["price"] = 0
    return data


def _seed_downloads(downloads_data):
    from apps.downloads.models import DownloadFile

    for dl in downloads_data:
        DownloadFile.objects.create(**_coerce_pricing(dl))


def _tenant_charge_currency(tenant) -> str:
    """Currency the tenant charges students in — keep seeded prices consistent
    with what Stripe will actually charge."""
    from apps.core.currency import tenant_charge_currency

    return tenant_charge_currency(tenant)


def _seed_subscription_plans(plans_data, courses, currency="TRY"):
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess
    from apps.courses.models import Course

    if not plans_data:
        return []
    course_ct = ContentType.objects.get_for_model(Course)
    created = []
    for plan_data in plans_data:
        plan = SubscriptionPlan.objects.create(
            name=plan_data["name"],
            description=plan_data.get("description", ""),
            price=Decimal(plan_data["price"]),
            currency=plan_data.get("currency") or currency,
            billing_interval_months=plan_data.get("billing_interval_months", 1),
            sort_order=plan_data.get("sort_order", 0),
        )
        for idx in plan_data.get("access_course_indices", []):
            if idx < len(courses):
                SubscriptionPlanAccess.objects.create(
                    plan=plan,
                    content_type=course_ct,
                    object_id=courses[idx].pk,
                )
        created.append(plan)
    return created


def _seed_bundles(bundles_data, courses, currency="TRY"):
    from django.contrib.contenttypes.models import ContentType

    from apps.billing.models import Bundle, BundleItem
    from apps.courses.models import Course

    if not bundles_data:
        return []
    course_ct = ContentType.objects.get_for_model(Course)
    created = []
    for bundle_data in bundles_data:
        bundle = Bundle.objects.create(
            name=bundle_data["name"],
            description=bundle_data.get("description", ""),
            price=Decimal(bundle_data["price"]),
            currency=bundle_data.get("currency") or currency,
        )
        for idx in bundle_data.get("course_indices", []):
            if idx < len(courses):
                BundleItem.objects.create(
                    bundle=bundle,
                    content_type=course_ct,
                    object_id=courses[idx].pk,
                )
        created.append(bundle)
    return created


def _live_window_cursor(interval_weeks):
    now = timezone.now()
    start = now - timedelta(weeks=LIVE_PAST_WEEKS)
    end = now + timedelta(weeks=LIVE_FUTURE_WEEKS)
    interval = timedelta(weeks=interval_weeks)
    return now, start, end, interval


def _seed_live_classes(live_classes_data, instructor, photos):
    from apps.live.models import LiveClass

    if not live_classes_data:
        return
    _, start, end, interval = _live_window_cursor(2)
    cursor = start
    count = 0
    while cursor < end:
        template = _coerce_pricing(live_classes_data[count % len(live_classes_data)])
        scheduled_at = cursor.replace(hour=10 + secrets.randbelow(11), minute=0, second=0, microsecond=0)
        photo = secrets.choice(photos) if photos else None
        LiveClass.objects.create(
            title=template["title"],
            description=template.get("description", ""),
            instructor=instructor,
            pricing_type=template.get("pricing_type", "free"),
            price=template.get("price", 0),
            duration_minutes=template.get("duration_minutes", 60),
            thumbnail=photo,
            thumbnail_url=photo.s3_key if photo else "",
            scheduled_at=scheduled_at,
            status="draft",
        )
        count += 1
        cursor += interval


def _seed_live_streams(live_streams_data, instructor, photos):
    from apps.live.models import LiveStream

    if not live_streams_data:
        return
    _, start, end, interval = _live_window_cursor(4)
    cursor = start
    count = 0
    while cursor < end:
        template = _coerce_pricing(live_streams_data[count % len(live_streams_data)])
        scheduled_at = cursor.replace(hour=20, minute=0, second=0, microsecond=0)
        photo = secrets.choice(photos) if photos else None
        LiveStream.objects.create(
            title=template["title"],
            description=template.get("description", ""),
            instructor=instructor,
            pricing_type=template.get("pricing_type", "free"),
            price=template.get("price", 0),
            duration_minutes=template.get("duration_minutes", 90),
            thumbnail=photo,
            thumbnail_url=photo.s3_key if photo else "",
            scheduled_at=scheduled_at,
            status="draft",
        )
        count += 1
        cursor += interval


def _seed_zoom_classes(zoom_data, instructor, photos):
    from apps.live.models import ZoomClass

    if not zoom_data:
        return
    _, start, end, interval = _live_window_cursor(2)
    cursor = start
    count = 0
    while cursor < end:
        template = _coerce_pricing(zoom_data[count % len(zoom_data)])
        scheduled_at = cursor.replace(hour=14 + secrets.randbelow(6), minute=0, second=0, microsecond=0)
        photo = secrets.choice(photos) if photos else None
        ZoomClass.objects.create(
            title=template["title"],
            description=template.get("description", ""),
            instructor=instructor,
            zoom_link=template.get("zoom_link", ""),
            zoom_meeting_id=template.get("zoom_meeting_id", ""),
            pricing_type=template.get("pricing_type", "free"),
            price=template.get("price", 0),
            duration_minutes=template.get("duration_minutes", 60),
            thumbnail=photo,
            thumbnail_url=photo.s3_key if photo else "",
            scheduled_at=scheduled_at,
            status="draft",
        )
        count += 1
        cursor += interval


def _seed_onsite_events(onsite_data, instructor, photos):
    from apps.live.models import OnsiteEvent

    if not onsite_data:
        return
    _, start, end, interval = _live_window_cursor(4)
    cursor = start
    count = 0
    while cursor < end:
        template = _coerce_pricing(onsite_data[count % len(onsite_data)])
        days_to_sat = (5 - cursor.weekday()) % 7
        scheduled_at = (cursor + timedelta(days=days_to_sat)).replace(hour=10, minute=0, second=0, microsecond=0)
        photo = secrets.choice(photos) if photos else None
        OnsiteEvent.objects.create(
            title=template["title"],
            description=template.get("description", ""),
            instructor=instructor,
            location=template.get("location", ""),
            address=template.get("address", ""),
            max_capacity=template.get("max_capacity"),
            pricing_type=template.get("pricing_type", "free"),
            price=template.get("price", 0),
            duration_minutes=template.get("duration_minutes", 240),
            thumbnail=photo,
            thumbnail_url=photo.s3_key if photo else "",
            scheduled_at=scheduled_at,
            status="draft",
        )
        count += 1
        cursor += interval
