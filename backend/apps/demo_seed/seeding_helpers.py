"""Reusable tenant content-seeding helpers.

Extracted from the legacy ``seed_demo_tenant`` management command so the new dev
seeder (Task C2's ``seed_dev_tenants``) and feature-coverage tasks can compose the
same proven content wiring without going through a Command class.

Each function seeds one slice of a tenant's content from a niche data module and
runs inside ``tenant_context(tenant)`` so callers can invoke them independently. All
demo-identity concerns from the source command are intentionally dropped:

* ``Tenant.is_demo`` (the field no longer exists),
* the synthetic ``demo-coach@`` / ``demo-student@`` "view-as" users,
* the hardcoded demo-student billing helper and the yoga-specific email campaign,
* the marketing-scale volume constants (2-year event spans, 400 photos, 200 videos,
  50 courses). Volume is parametrized via ``count`` / ``include_live`` with small
  breadth-over-bulk defaults instead.

The niche-driven content wiring is preserved verbatim: photos/videos still reference
the ``demo/photos/*`` / ``demo/videos/*`` S3 object keys from the niche JSONs (mirrored
into dev MinIO by ``scripts/mirror_demo_assets.py``).

Owner / student *identities* are provisioned by the orchestrator (C2); these helpers
resolve the tenant's owner (``role="owner"``) from the tenant schema and create the
student rows from the niche's ``STUDENTS`` list.
"""

from __future__ import annotations

import copy
import random
import uuid
from datetime import time, timedelta
from decimal import Decimal

from django.utils import timezone
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.demo_seed.registry import load_niche

# Breadth-over-bulk defaults. Callers scale volume by passing count / include_live.
DEFAULT_PHOTO_COUNT = 20
DEFAULT_COURSE_COUNT = 8
DEFAULT_LIVE_COUNT = 6
DEFAULT_STUDENT_COUNT = 10
DEFAULT_MAILBOX_CONVERSATION_COUNT = 3
DEFAULT_COMMUNITY_POST_COUNT = 3
DEFAULT_NOTIFICATION_RECIPIENT_COUNT = 5
DEFAULT_USAGE_DAYS = 14
DEFAULT_TAG_ITEM_COUNT = 10
DEFAULT_ASSISTANT_KNOWLEDGE_COUNT = 4
DEFAULT_BLOG_TOPIC_IDEA_COUNT = 3

_PHOTO_CATEGORIES = [
    "Thumbnail",
    "Banner",
    "Background",
    "Profile",
    "Product",
    "Gallery",
    "Hero",
    "Feature",
    "Social",
    "Promo",
]


# ---------------------------------------------------------------------------
# Internal utilities
# ---------------------------------------------------------------------------


def _niche_data(niche):
    """Accept either a niche key (str) or an already-loaded niche namespace."""
    if isinstance(niche, str):
        return load_niche(niche)
    return niche


def _get_owner():
    """The tenant's owner — provisioned by the orchestrator before seeding content.

    Must be called inside a ``tenant_context``.
    """
    return User.objects.filter(role="owner").order_by("id").first()


def _pick(photos):
    return random.choice(photos) if photos else None


def _content_photo_keys(config_data, courses_data):
    """Unique S3 photo keys referenced by landing sections + course thumbnails.

    Insertion-ordered (via dict) so photo creation is deterministic.
    """
    keys = {}
    sections = config_data.get("landing_sections", {})
    for section in sections.values():
        if isinstance(section, dict):
            for key in ("bg_image_url", "image_url"):
                if section.get(key):
                    keys.setdefault(section[key], None)
    for course in courses_data:
        if course.get("thumbnail_url"):
            keys.setdefault(course["thumbnail_url"], None)
    return list(keys)


def _expand_courses(base_courses, target):
    """Repeat base course templates to reach ``target`` with varied titles/pricing.

    The original base courses are kept unchanged at the front of the list, so any
    index-based references in the niche JSON (STUDENT_BILLING purchases/progress,
    plan/bundle access indices) still resolve to the same courses.
    """
    if not base_courses:
        return []
    if len(base_courses) >= target:
        return base_courses[:target]

    expanded = []
    pricing_types = ["free", "paid"]
    prices = [0, 19, 29, 39, 49, 59, 69, 79]

    for i in range(target):
        template = base_courses[i % len(base_courses)]
        course = {**template}

        if i < len(base_courses):
            # Keep original courses unchanged.
            expanded.append(course)
            continue

        batch = (i // len(base_courses)) + 1
        course["title"] = f"{template['title']} — Volume {batch}"
        course["order"] = i + 1

        pt = pricing_types[i % len(pricing_types)]
        course["pricing_type"] = pt
        course["price"] = 0 if pt == "free" else prices[i % len(prices)]

        # Alternate published status (~90% published) for realistic list variety.
        course["is_published"] = i % 10 != 0

        course["lessons"] = [dict(lesson) for lesson in template["lessons"]]
        expanded.append(course)

    return expanded


def _spread_datetimes(count):
    """``count`` datetimes split roughly half past / half future, ~2 weeks apart.

    Produces both past ("ended") and upcoming ("scheduled") events so the demo's
    live + calendar pages show a realistic mix instead of only-future rows.
    """
    now = timezone.now()
    half = count // 2
    result = [now - timedelta(weeks=2 * i) for i in range(half, 0, -1)]
    result += [now + timedelta(weeks=2 * i) for i in range(1, count - half + 1)]
    return result


# ---------------------------------------------------------------------------
# Photos & config
# ---------------------------------------------------------------------------


def seed_photos(tenant, niche, *, count=DEFAULT_PHOTO_COUNT):
    """Create Photos for the tenant and return ``{s3_key: Photo}`` for the real keys.

    Creates one Photo per unique S3 key referenced by the niche's landing sections
    and course thumbnails (these carry the ``demo/photos/*`` keys that resolve in
    MinIO), then pads the media library up to ``count`` with reused keys so it reads
    as populated. Only the real keyed Photos are returned in the map.
    """
    data = _niche_data(niche)
    config_data = data.CONFIG
    courses_data = data.COURSES

    with tenant_context(tenant):
        from apps.media.models import Photo

        photo_map = {}
        for s3_key in _content_photo_keys(config_data, courses_data):
            photo_map[s3_key] = Photo.objects.create(s3_key=s3_key, title=s3_key.split("/")[-1])

        keys = list(photo_map.keys())
        i = 0
        while keys and Photo.objects.count() < count:
            s3_key = keys[i % len(keys)]
            category = _PHOTO_CATEGORIES[i % len(_PHOTO_CATEGORIES)]
            Photo.objects.create(
                s3_key=s3_key,
                title=f"{category} Photo {i + 1}",
                file_size=random.randint(50_000, 5_000_000),
            )
            i += 1

        return photo_map


def seed_config(tenant, niche):
    """Create the tenant's TenantConfig from the niche, linking hero/about photos.

    Looks up the already-seeded hero background + about image Photos by S3 key and
    injects their ids into ``landing_sections`` (call ``seed_photos`` first). Also
    seeds the same starter page blocks a real provisioned tenant gets, so the public
    pages don't render empty.
    """
    data = _niche_data(niche)
    # Deep-copy so we never mutate the shared niche namespace's CONFIG.
    config_data = copy.deepcopy(data.CONFIG)

    with tenant_context(tenant):
        from apps.media.models import Photo
        from apps.tenant_config.defaults import default_pages
        from apps.tenant_config.models import TenantConfig

        sections = config_data.get("landing_sections", {})

        hero = sections.get("hero")
        if isinstance(hero, dict) and hero.get("bg_image_url"):
            photo = Photo.objects.filter(s3_key=hero["bg_image_url"]).order_by("id").first()
            if photo:
                hero["bg_image_photo_id"] = str(photo.pk)

        about = sections.get("about")
        if isinstance(about, dict) and about.get("image_url"):
            photo = Photo.objects.filter(s3_key=about["image_url"]).order_by("id").first()
            if photo:
                about["image_photo_id"] = str(photo.pk)

        config_data.setdefault("pages", default_pages(config_data["brand_name"]))

        return TenantConfig.objects.create(**config_data)


# ---------------------------------------------------------------------------
# Courses & downloads
# ---------------------------------------------------------------------------


def seed_courses(tenant, niche, *, count=DEFAULT_COURSE_COUNT):
    """Create ``count`` courses (with modules, lessons, videos) for the tenant.

    The niche's base courses are kept unchanged at the front (index-stable for
    billing/plan references) and repeated with varied titles/pricing to reach
    ``count``. The tenant owner is used as instructor. Returns the created Courses
    in creation order.
    """
    data = _niche_data(niche)
    expanded = _expand_courses(data.COURSES, count)

    with tenant_context(tenant):
        from apps.courses.models import Course, Lesson, Module, Video
        from apps.media.models import Photo

        instructor = _get_owner()
        created_courses = []

        for course_data in expanded:
            course_fields = {k: v for k, v in course_data.items() if k not in ("lessons", "module_title")}
            lessons_data = course_data["lessons"]
            module_title = course_data["module_title"]

            thumbnail_url = course_fields.get("thumbnail_url", "")
            photo = None
            if thumbnail_url:
                photo = Photo.objects.filter(s3_key=thumbnail_url).order_by("id").first()

            course = Course(instructor=instructor, thumbnail=photo, **course_fields)
            course.save()

            module = Module.objects.create(course=course, title=module_title, order=1)

            for lesson_data in lessons_data:
                lesson_data = dict(lesson_data)  # copy to avoid mutating niche data
                video_url = lesson_data.pop("video_url", "")
                duration = lesson_data.get("duration_seconds", 0)

                video = None
                if video_url:
                    video = Video.objects.create(
                        title=lesson_data["title"],
                        s3_key=video_url,
                        duration_seconds=duration,
                    )

                Lesson.objects.create(module=module, video=video, video_url=video_url, **lesson_data)

            created_courses.append(course)

        return created_courses


def seed_downloads(tenant, niche):
    """Create the niche's DownloadFile rows. Returns the created objects."""
    data = _niche_data(niche)
    downloads_data = getattr(data, "DOWNLOADS", [])

    with tenant_context(tenant):
        from apps.downloads.models import DownloadFile

        return [DownloadFile.objects.create(**dl) for dl in downloads_data]


# ---------------------------------------------------------------------------
# Billing: subscription plans & bundles
# ---------------------------------------------------------------------------


def seed_subscription_plans(tenant, niche):
    """Create the niche's SubscriptionPlans + course access grants.

    Course access is resolved by index against the tenant's courses in creation
    order (seed_courses first). Returns the created plans.
    """
    data = _niche_data(niche)
    plans_data = getattr(data, "SUBSCRIPTION_PLANS", [])
    if not plans_data:
        return []

    with tenant_context(tenant):
        from django.contrib.contenttypes.models import ContentType

        from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess
        from apps.courses.models import Course

        courses = list(Course.objects.order_by("id"))
        course_ct = ContentType.objects.get_for_model(Course)
        created_plans = []

        for plan_data in plans_data:
            plan = SubscriptionPlan.objects.create(
                name=plan_data["name"],
                description=plan_data.get("description", ""),
                price=Decimal(plan_data["price"]),
                currency=plan_data.get("currency", "TRY"),
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
            created_plans.append(plan)

        return created_plans


def seed_bundles(tenant, niche):
    """Create the niche's Bundles + their course items (index-resolved). Returns them."""
    data = _niche_data(niche)
    bundles_data = getattr(data, "BUNDLES", [])
    if not bundles_data:
        return []

    with tenant_context(tenant):
        from django.contrib.contenttypes.models import ContentType

        from apps.billing.models import Bundle, BundleItem
        from apps.courses.models import Course

        courses = list(Course.objects.order_by("id"))
        course_ct = ContentType.objects.get_for_model(Course)
        created_bundles = []

        for bundle_data in bundles_data:
            bundle = Bundle.objects.create(
                name=bundle_data["name"],
                description=bundle_data.get("description", ""),
                price=Decimal(bundle_data["price"]),
                currency=bundle_data.get("currency", "TRY"),
            )
            for idx in bundle_data.get("course_indices", []):
                if idx < len(courses):
                    BundleItem.objects.create(
                        bundle=bundle,
                        content_type=course_ct,
                        object_id=courses[idx].pk,
                    )
            created_bundles.append(bundle)

        return created_bundles


# ---------------------------------------------------------------------------
# Live events
# ---------------------------------------------------------------------------


def _make_event(model, template, *, instructor, photo, scheduled_at, default_duration, extra=None):
    fields = {
        "title": template["title"],
        "description": template.get("description", ""),
        "instructor": instructor,
        "pricing_type": template.get("pricing_type", "free"),
        "price": template.get("price", 0),
        "duration_minutes": template.get("duration_minutes", default_duration),
        "thumbnail": photo,
        "thumbnail_url": photo.s3_key if photo else "",
        "scheduled_at": scheduled_at,
    }
    if extra:
        fields.update(extra)
    return model.objects.create(**fields)


def seed_live_bundle(tenant, niche, *, include_live: bool, count=DEFAULT_LIVE_COUNT):
    """Seed the tenant's live events (classes, streams, recurring, zoom, onsite).

    When ``include_live`` is False (e.g. the free plan tier) nothing is created and
    an empty summary is returned. Otherwise ~``count`` events of each type present in
    the niche are created, spread across past + future, then published out of the
    default ``draft`` status (future→scheduled, past→ended) so the student-facing
    live/calendar lists render them.

    Returns a dict of per-type counts.
    """
    summary = {"live_classes": 0, "recurring": 0, "live_streams": 0, "zoom_classes": 0, "onsite_events": 0}
    if not include_live:
        return summary

    data = _niche_data(niche)
    live_classes_data = getattr(data, "LIVE_CLASSES", [])
    live_streams_data = getattr(data, "LIVE_STREAMS", [])
    recurring_data = getattr(data, "RECURRING_LIVE_CLASS", None)
    zoom_classes_data = getattr(data, "ZOOM_CLASSES", [])
    onsite_events_data = getattr(data, "ONSITE_EVENTS", [])

    with tenant_context(tenant):
        from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass
        from apps.media.models import Photo

        instructor = _get_owner()
        photos = list(Photo.objects.all())
        schedule = _spread_datetimes(count)

        # Live classes — daytime.
        if live_classes_data:
            for i, when in enumerate(schedule):
                template = live_classes_data[i % len(live_classes_data)]
                scheduled_at = when.replace(hour=random.randint(10, 20), minute=0, second=0, microsecond=0)
                _make_event(
                    LiveClass,
                    template,
                    instructor=instructor,
                    photo=_pick(photos),
                    scheduled_at=scheduled_at,
                    default_duration=60,
                )
                summary["live_classes"] += 1

        # Recurring weekly live class (single template, date-suffixed titles).
        if recurring_data:
            duration = recurring_data.get("duration_minutes", 60)
            hour = recurring_data.get("hour", 19)
            minute = recurring_data.get("minute", 0)
            photo = _pick(photos)
            for when in schedule:
                d = when.replace(hour=hour, minute=minute, second=0, microsecond=0)
                LiveClass.objects.create(
                    title=f"{recurring_data['title']} — {d.strftime('%b %d')}",
                    description=recurring_data.get("description", ""),
                    instructor=instructor,
                    pricing_type=recurring_data.get("pricing_type", "free"),
                    price=recurring_data.get("price", 0),
                    duration_minutes=duration,
                    thumbnail=photo,
                    thumbnail_url=photo.s3_key if photo else "",
                    scheduled_at=d,
                )
                summary["recurring"] += 1

        # Live streams — evening.
        if live_streams_data:
            for i, when in enumerate(schedule):
                template = live_streams_data[i % len(live_streams_data)]
                scheduled_at = when.replace(hour=20, minute=0, second=0, microsecond=0)
                _make_event(
                    LiveStream,
                    template,
                    instructor=instructor,
                    photo=_pick(photos),
                    scheduled_at=scheduled_at,
                    default_duration=90,
                )
                summary["live_streams"] += 1

        # Zoom classes — afternoon.
        if zoom_classes_data:
            for i, when in enumerate(schedule):
                template = zoom_classes_data[i % len(zoom_classes_data)]
                scheduled_at = when.replace(hour=random.randint(14, 19), minute=0, second=0, microsecond=0)
                extra = {
                    "zoom_link": template.get("zoom_link", ""),
                    "zoom_meeting_id": template.get("zoom_meeting_id", ""),
                }
                _make_event(
                    ZoomClass,
                    template,
                    instructor=instructor,
                    photo=_pick(photos),
                    scheduled_at=scheduled_at,
                    default_duration=60,
                    extra=extra,
                )
                summary["zoom_classes"] += 1

        # Onsite events — Saturdays at 10:00.
        if onsite_events_data:
            for i, when in enumerate(schedule):
                template = onsite_events_data[i % len(onsite_events_data)]
                days_to_sat = (5 - when.weekday()) % 7
                scheduled_at = (when + timedelta(days=days_to_sat)).replace(hour=10, minute=0, second=0, microsecond=0)
                extra = {
                    "location": template.get("location", ""),
                    "address": template.get("address", ""),
                    "max_capacity": template.get("max_capacity"),
                }
                _make_event(
                    OnsiteEvent,
                    template,
                    instructor=instructor,
                    photo=_pick(photos),
                    scheduled_at=scheduled_at,
                    default_duration=240,
                    extra=extra,
                )
                summary["onsite_events"] += 1

        _publish_events()

    return summary


def _publish_events():
    """Promote seeded events out of the default ``draft`` status.

    Events are created via the models directly (bypassing the create serializer that
    would set ``scheduled``), so they stay ``draft`` and the student lists — which
    filter ``status__in=[scheduled, live, ended]`` — hide them all. Mark future events
    ``scheduled`` and past events ``ended``. Must run inside a ``tenant_context``.
    """
    from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

    now = timezone.now()
    for model in (LiveClass, LiveStream, ZoomClass, OnsiteEvent):
        model.objects.filter(scheduled_at__gte=now).update(status="scheduled")
        model.objects.filter(scheduled_at__lt=now).update(status="ended")


# ---------------------------------------------------------------------------
# Students, purchases & progress
# ---------------------------------------------------------------------------


def seed_students(tenant, niche, *, count=DEFAULT_STUDENT_COUNT):
    """Create up to ``count`` student users for the tenant. Returns them.

    Uses the niche's STUDENTS list first; if ``count`` exceeds it, synthesizes extra
    generic students. Purchases/subscriptions/progress are seeded separately by
    ``seed_purchases_and_progress``.
    """
    data = _niche_data(niche)
    students_data = list(getattr(data, "STUDENTS", []))

    with tenant_context(tenant):
        created = []
        for i in range(count):
            if i < len(students_data):
                email = students_data[i]["email"]
                name = students_data[i]["name"]
            else:
                n = i + 1
                email = f"student{n}@demo.test"
                name = f"Demo Student {n}"

            user = User.objects.filter(email=email).first()
            if user is None:
                user = User.objects.create_user(email=email, name=name, role="student")
            created.append(user)

        return created


def seed_purchases_and_progress(tenant, niche, *, pro_edge_cases: bool = False):
    """Seed purchases, subscriptions, enrollments and lesson progress for students.

    Resolves the tenant's students / courses / subscription plans / bundles from the
    tenant schema (create them first) and drives per-student billing from the niche's
    STUDENT_BILLING map (keyed by email; course/plan/bundle references are indices in
    creation order). Students without a billing entry are enrolled in a free course.
    Returns a totals summary dict.

    ``pro_edge_cases`` (Task D8, pro tier only): after the normal wiring above,
    additionally pushes one already-created one-time Payment through the same
    refund shape ``apps.billing.views.payments._do_refund`` produces for a real
    refund — the PaymentItem marked ``is_refunded``, a separate
    ``payment_type="refund"`` Payment row pointing back via ``original_payment``,
    the Enrollment deactivated, and the original Payment's ``status`` flipped to
    ``"refunded"`` (the model's own literal refund state) — and flips one
    already-created Subscription's ``status`` to ``"past_due"`` (a literal
    non-active value on ``Subscription.status`, distinct from the orthogonal
    ``cancel_at_period_end`` flag, which a still-``"active"`` subscription can
    carry through to its current period end; ``past_due`` is what the real
    Stripe webhook handlers set on a failed/unpaid invoice, so it's the more
    faithful "non-active" edge state to seed). Both reuse real seeded
    students/courses/plans already created above — no synthetic rows.
    """
    data = _niche_data(niche)
    billing_data = getattr(data, "STUDENT_BILLING", [])

    totals = {"payments": 0, "subscriptions": 0, "progress": 0, "enrollments": 0}

    with tenant_context(tenant):
        from django.contrib.contenttypes.models import ContentType

        from apps.billing.models import Bundle, Payment, PaymentItem, Subscription, SubscriptionPlan
        from apps.courses.models import Course, Enrollment, Lesson, Progress

        course_ct = ContentType.objects.get_for_model(Course)
        bundle_ct = ContentType.objects.get_for_model(Bundle)

        courses = list(Course.objects.order_by("id"))
        sub_plans = list(SubscriptionPlan.objects.order_by("id"))
        bundles = list(Bundle.objects.order_by("id"))

        billing_map = {b["email"]: b for b in billing_data}

        lessons_by_course = {
            i: list(Lesson.objects.filter(module__course=c).order_by("module__order", "order"))
            for i, c in enumerate(courses)
        }

        free_courses = [c for c in courses[:3] if c.pricing_type == "free"]
        now = timezone.now()

        for user in User.objects.filter(role="student").order_by("id"):
            billing = billing_map.get(user.email)
            if not billing:
                # No billing data — just enroll in a free course if one exists.
                if free_courses:
                    Enrollment.objects.get_or_create(user=user, course=free_courses[0])
                continue

            # --- Course purchases (one-time payments) ---
            for course_idx in billing.get("purchases", []):
                if course_idx >= len(courses):
                    continue
                course = courses[course_idx]
                payment = Payment.objects.create(
                    student=user,
                    payment_type="one_time",
                    status="completed",
                    amount=course.price,
                    platform_fee=round(course.price * Decimal("0.06"), 2),
                    submerchant_payout=round(course.price * Decimal("0.94"), 2),
                    currency="TRY",
                    provider="bypass",
                    provider_payment_id=f"seed-{user.pk}-course-{course.pk}",
                )
                PaymentItem.objects.create(
                    payment=payment,
                    content_type=course_ct,
                    object_id=course.pk,
                    item_price=course.price,
                    submerchant_payout=round(course.price * Decimal("0.94"), 2),
                )
                Enrollment.objects.get_or_create(user=user, course=course, defaults={"payment_id": payment.pk})
                totals["payments"] += 1

            # --- Bundle purchase ---
            bundle_idx = billing.get("bundle_index")
            if bundle_idx is not None and bundle_idx < len(bundles):
                bundle = bundles[bundle_idx]
                payment = Payment.objects.create(
                    student=user,
                    payment_type="one_time",
                    status="completed",
                    amount=bundle.price,
                    platform_fee=round(bundle.price * Decimal("0.06"), 2),
                    submerchant_payout=round(bundle.price * Decimal("0.94"), 2),
                    currency="TRY",
                    provider="bypass",
                    provider_payment_id=f"seed-{user.pk}-bundle-{bundle.pk}",
                )
                PaymentItem.objects.create(
                    payment=payment,
                    content_type=bundle_ct,
                    object_id=bundle.pk,
                    item_price=bundle.price,
                    submerchant_payout=round(bundle.price * Decimal("0.94"), 2),
                )
                for item in bundle.items.all():
                    if item.content_type == course_ct:
                        Enrollment.objects.get_or_create(
                            user=user, course_id=item.object_id, defaults={"payment_id": payment.pk}
                        )
                totals["payments"] += 1

            # --- Subscription ---
            plan_idx = billing.get("subscription_plan_index")
            if plan_idx is not None and plan_idx < len(sub_plans):
                plan = sub_plans[plan_idx]
                subscription = Subscription.objects.create(
                    student=user,
                    plan=plan,
                    billing_amount=plan.price,
                    billing_currency=plan.currency,
                    status="active",
                    current_period_start=now - timedelta(days=5),
                    current_period_end=now + timedelta(days=25),
                )
                Payment.objects.create(
                    student=user,
                    payment_type="subscription",
                    status="completed",
                    amount=plan.price,
                    platform_fee=round(plan.price * Decimal("0.06"), 2),
                    submerchant_payout=round(plan.price * Decimal("0.94"), 2),
                    currency=plan.currency,
                    provider="bypass",
                    provider_payment_id=f"seed-{user.pk}-sub-{plan.pk}",
                    subscription=subscription,
                )
                for access in plan.access_items.all():
                    if access.content_type == course_ct:
                        Enrollment.objects.get_or_create(user=user, course_id=access.object_id)
                totals["payments"] += 1
                totals["subscriptions"] += 1

            # --- Enroll in free courses if not already enrolled ---
            for fc in free_courses:
                Enrollment.objects.get_or_create(user=user, course=fc)

            # --- Progress ---
            for course_idx, lesson_idx, watched, completed in billing.get("progress", []):
                lessons = lessons_by_course.get(course_idx)
                if not lessons or lesson_idx >= len(lessons):
                    continue
                Progress.objects.create(
                    user=user,
                    lesson=lessons[lesson_idx],
                    watched_seconds=watched,
                    completed=completed,
                )
                totals["progress"] += 1

        if pro_edge_cases:
            # One refunded Payment — reuse the first completed one-time
            # purchase created above (course or bundle) rather than inventing a
            # new student/course. Mirrors the real refund flow's invariants
            # (see apps.billing.views.payments._do_refund) so the demo tenant's
            # billing state is internally consistent, not just a bare status flip.
            edge_payment = Payment.objects.filter(payment_type="one_time", status="completed").order_by("id").first()
            if edge_payment is not None:
                edge_item = edge_payment.items.first()
                if edge_item is not None:
                    edge_item.is_refunded = True
                    edge_item.save(update_fields=["is_refunded"])
                    Payment.objects.create(
                        student=edge_payment.student,
                        payment_type="refund",
                        status="completed",
                        amount=edge_item.item_price,
                        platform_fee=Decimal("0.00"),
                        submerchant_payout=Decimal("0.00"),
                        currency=edge_payment.currency,
                        provider="bypass",
                        provider_payment_id=f"seed-{edge_payment.student_id}-refund-{edge_payment.pk}",
                        original_payment=edge_payment,
                    )
                    if edge_item.content_type_id == course_ct.pk:
                        Enrollment.objects.filter(user=edge_payment.student, course_id=edge_item.object_id).update(
                            is_active=False
                        )
                edge_payment.status = "refunded"
                edge_payment.save(update_fields=["status"])
                totals["payments"] += 1

            # One non-active Subscription — flip the first active subscription
            # created above to "past_due" (what the real Stripe webhook path
            # sets on a failed/unpaid invoice; see
            # apps.billing.views.webhooks_connect._tenant_sub_status and
            # apps.billing.views.webhooks_connect._handle_marketplace_invoice_failed).
            edge_subscription = Subscription.objects.filter(status="active").order_by("id").first()
            if edge_subscription is not None:
                edge_subscription.status = "past_due"
                edge_subscription.save(update_fields=["status"])

        totals["enrollments"] = Enrollment.objects.count()
        return totals


# ---------------------------------------------------------------------------
# Mailbox (coach ↔ student messaging — tenant-schema conversations)
# ---------------------------------------------------------------------------

# Niche-agnostic back-and-forth: owner (outbound) / student (inbound), in order.
# The attachment lands on the 3rd message (owner sharing a file) of the first
# conversation only, so the demo shows exactly one attachment, not dozens.
_MAILBOX_EXCHANGE = [
    ("outbound", "Hi {name}, welcome aboard! Let me know if you have any questions getting started."),
    ("inbound", "Thanks so much! Quick question — where do I find the download for the first lesson?"),
    ("outbound", "It's linked right under the video player — attaching it here too just in case."),
    ("inbound", "Perfect, found it. Thank you!"),
]


def seed_mailbox(tenant, *, count=DEFAULT_MAILBOX_CONVERSATION_COUNT):
    """Create a few coach↔student Conversations with a realistic message back-and-forth.

    Resolves the tenant owner and up to ``count`` seeded students from the tenant
    schema (call ``seed_students`` first — this does not create students of its
    own), per this file's re-query convention. One message in the first
    conversation gets a MessageAttachment so the mailbox attachment UI has
    something to render. Returns the created Conversations.
    """
    with tenant_context(tenant):
        from apps.mailbox.models import Conversation, Message, MessageAttachment

        owner = _get_owner()
        students = list(User.objects.filter(role="student").order_by("id")[:count])

        created = []
        for i, student in enumerate(students):
            conversation = Conversation.objects.create(
                subject=f"Question from {student.name}" if student.name else "New message",
                student=student,
                counterparty_email=student.email,
                counterparty_name=student.name,
            )

            last_message = None
            for j, (direction, template) in enumerate(_MAILBOX_EXCHANGE):
                text = template.format(name=student.name or "there")
                if direction == "outbound":
                    from_email, to_email = owner.email, student.email
                else:
                    from_email, to_email = student.email, owner.email

                last_message = Message.objects.create(
                    conversation=conversation,
                    direction=direction,
                    from_email=from_email,
                    to_email=to_email,
                    text=text,
                    is_read=True,
                )

                if i == 0 and j == 2:
                    MessageAttachment.objects.create(
                        message=last_message,
                        filename="lesson-1-worksheet.pdf",
                        content_type="application/pdf",
                        size=248_000,
                        storage_key="demo/downloads/lesson-1-worksheet.pdf",
                    )

            conversation.last_message_at = last_message.created_at if last_message else None
            # The exchange ends on an inbound (student) message — realistic unread state
            # for the owner's inbox on the first conversation only.
            conversation.unread_count = 1 if i == 0 else 0
            conversation.save(update_fields=["last_message_at", "unread_count"])
            created.append(conversation)

        return created


# ---------------------------------------------------------------------------
# Community (forum-style posts / comments / reactions / reports)
# ---------------------------------------------------------------------------

# Niche-agnostic post bodies — cycled if `count` exceeds the list.
_COMMUNITY_POSTS = [
    "Just finished today's session — feeling great! 💪",
    "Does anyone have tips for staying consistent during busy weeks?",
    "Loving the new course content, thank you for putting this together!",
    "Quick reminder: don't forget to log your progress this week.",
    "What's everyone's favorite part of the program so far?",
]

_COMMUNITY_COMMENTS = [
    "Great point, thanks for sharing!",
    "I felt exactly the same way.",
    "This is really helpful, appreciate it.",
]


def _other_member(members, exclude, offset=1):
    """Returns a member other than ``exclude``, deterministically varied by
    ``offset``; falls back to ``exclude`` itself only when there is exactly
    one member total (owner-only tenant, no students).

    The naive ``(index + offset) % len(members)`` wraps back onto ``exclude``
    itself whenever ``offset`` is a multiple of ``len(members)``, so instead
    the offset is first collapsed into a shift of ``1..len(members) - 1``
    (via ``% (len(members) - 1)``) before being added to ``exclude``'s index
    — guaranteeing the result never lands back on ``exclude`` for any
    non-negative ``offset``, regardless of list length.
    """
    if len(members) <= 1:
        return members[0]
    shift = 1 + (offset % (len(members) - 1))
    idx = (members.index(exclude) + shift) % len(members)
    return members[idx]


def seed_community(tenant, *, count=DEFAULT_COMMUNITY_POST_COUNT):
    """Create CommunitySettings + members + a post/comment/reaction/report mix.

    Resolves the tenant owner and up to 5 seeded students from the tenant schema
    (call ``seed_students`` first — this does not create students of its own),
    per this file's re-query convention. Enables ``CommunitySettings`` and turns
    the owner plus resolved students into ``CommunityMember`` rows, then creates
    ``count`` Posts (authors cycled across members), a couple of Comments, a
    Reaction on every Post/Comment, and exactly one Report (on the first post)
    so the moderation-queue UI has something to show. Returns the created Posts.
    """
    with tenant_context(tenant):
        from apps.community.models import (
            REACTION_EMOJIS,
            Comment,
            CommunityMember,
            CommunitySettings,
            Post,
            Reaction,
            Report,
        )

        settings_obj = CommunitySettings.load()
        settings_obj.is_enabled = True
        settings_obj.welcome_message = "Welcome to our community! Introduce yourself below."
        settings_obj.save(update_fields=["is_enabled", "welcome_message"])

        owner = _get_owner()
        students = list(User.objects.filter(role="student").order_by("id")[:5])

        members = []
        for user in [owner, *students]:
            if user is None:
                continue
            member, _ = CommunityMember.objects.get_or_create(
                user=user, defaults={"display_name": user.name or user.email}
            )
            members.append(member)

        if not members:
            return []

        posts = []
        for i in range(count):
            author = members[i % len(members)]
            body = _COMMUNITY_POSTS[i % len(_COMMUNITY_POSTS)]
            post = Post.objects.create(author=author, body=body)
            posts.append(post)

        # A couple of Comments on the earliest posts, from a different member.
        comments = []
        for i, post in enumerate(posts[:2]):
            commenter = _other_member(members, post.author, offset=i + 1)
            comment = Comment.objects.create(
                post=post, author=commenter, body=_COMMUNITY_COMMENTS[i % len(_COMMUNITY_COMMENTS)]
            )
            comments.append(comment)
            post.comment_count = post.comments.count()
            post.save(update_fields=["comment_count"])

        # One Reaction per Post and per Comment, from a member other than the author.
        for i, post in enumerate(posts):
            reactor = _other_member(members, post.author, offset=i + 1)
            Reaction.objects.get_or_create(
                member=reactor, post=post, defaults={"emoji": REACTION_EMOJIS[i % len(REACTION_EMOJIS)]}
            )
            post.reaction_count = post.reactions.count()
            post.save(update_fields=["reaction_count"])

        for i, comment in enumerate(comments):
            reactor = _other_member(members, comment.author, offset=i + 1)
            Reaction.objects.get_or_create(member=reactor, comment=comment, defaults={"emoji": REACTION_EMOJIS[0]})
            comment.reaction_count = comment.reactions.count()
            comment.save(update_fields=["reaction_count"])

        # Exactly one Report — a member flagging the first post, to cover the
        # moderation-queue UI (not every tenant needs a pile of these).
        if posts:
            reporter = _other_member(members, posts[0].author, offset=1)
            Report.objects.get_or_create(
                reporter=reporter,
                post=posts[0],
                defaults={"reason": "spam", "detail": "Looks like spam/promotional content."},
            )

        return posts


# ---------------------------------------------------------------------------
# Notifications / announcements
# ---------------------------------------------------------------------------


def seed_notifications(tenant, *, level="full", count=DEFAULT_NOTIFICATION_RECIPIENT_COUNT):
    """Create Announcements + supporting notification rows for a tenant.

    Resolves the tenant owner and up to ``count`` seeded students from the
    tenant schema (call ``seed_students`` first — this does not create
    students of its own), per this file's re-query convention.

    This is a two-tier helper (unlike ``seed_mailbox``/``seed_community``'s
    on/off ``count``) because the plan gate for this feature is
    "full for pro, light for starter" rather than "same content, less of it":

    * ``level="light"`` (starter) — one sent ``Announcement`` targeting all
      students, its ``AnnouncementRecipient`` rows (alternating read/unread
      so both inbox states render), and one reusable ``AnnouncementTemplate``.
      No recurring schedule, opt-out, or push subscription — those are the
      "advanced" half of the feature, reserved for pro.
    * ``level="full"`` (pro) — everything in "light", plus one
      ``RecurringAnnouncement`` schedule, one ``EmailOptOut`` (a student who
      opted out of announcement emails), and one ``PushSubscription`` (a
      student with a registered — fake — push endpoint), so every
      notifications UI state has at least one row to render.

    Returns a dict of the created objects/lists.
    """
    with tenant_context(tenant):
        from apps.notifications.models import (
            Announcement,
            AnnouncementRecipient,
            AnnouncementTemplate,
            EmailOptOut,
            PushSubscription,
            RecurringAnnouncement,
        )

        owner = _get_owner()
        students = list(User.objects.filter(role="student").order_by("id")[:count])
        now = timezone.now()

        template = AnnouncementTemplate.objects.create(
            name="Welcome announcement",
            title="Welcome to the community!",
            body="<p>We're excited to have you here — check out this week's new content.</p>",
            link="/dashboard",
            link_label="Go to dashboard",
            created_by=owner,
        )

        announcement = Announcement.objects.create(
            title="New content just dropped!",
            body="<p>Check out this week's new lessons and resources.</p>",
            link="/courses",
            filters_json={"audience": "all_students"},
            status="sent",
            sent_at=now - timedelta(days=1),
            created_by=owner,
            recipient_count=len(students),
            also_email=level == "full",
        )

        recipients = []
        for i, student in enumerate(students):
            recipient = AnnouncementRecipient.objects.create(
                announcement=announcement,
                user=student,
                push_status="none",
                email_status="none",
                # Alternate read/unread so both inbox states render.
                read_at=now if i % 2 == 0 else None,
            )
            recipients.append(recipient)

        result = {
            "announcement": announcement,
            "template": template,
            "recipients": recipients,
        }

        if level == "light":
            return result

        # Full (pro) tier only — recurring schedule, email opt-out, push subscription.
        recurring = RecurringAnnouncement.objects.create(
            title="Weekly encouragement",
            body="<p>Keep up the great work this week!</p>",
            link="/community",
            link_label="Visit community",
            filters_json={"audience": "all_students"},
            also_email=True,
            frequency="weekly",
            send_time=time(9, 0),
            weekday=0,
            start_date=(now - timedelta(days=7)).date(),
            next_run_at=now + timedelta(days=6),
            is_active=True,
            created_by=owner,
        )
        result["recurring"] = recurring

        if students:
            opt_out_student = students[-1]
            result["opt_out"], _ = EmailOptOut.objects.get_or_create(
                email=opt_out_student.email,
                defaults={"user": opt_out_student},
            )

            push_student = students[0]
            result["push_subscription"], _ = PushSubscription.objects.get_or_create(
                endpoint=f"https://fcm.googleapis.com/fcm/send/demo-{tenant.slug}-{push_student.pk}",
                defaults={
                    "user": push_student,
                    "p256dh": "BDemoP256dhKey" + "X" * 72,
                    "auth": "demo-auth-secret-000000",
                    "user_agent": "Mozilla/5.0 (demo seed)",
                },
            )

        return result


def seed_usage(tenant, *, days=DEFAULT_USAGE_DAYS):
    """Create ``UsageEvent`` rows spread over the last ``days`` days for a tenant.

    Resolves up to 8 real seeded students from the tenant schema (call
    ``seed_students`` first — this does not create students of its own), per
    this file's re-query convention. Called unconditionally for all three plan
    tiers — unlike mailbox/community/notifications, usage analytics has no
    tier gate (see Task D4).

    ``UsageEvent`` (``apps.usage.models``) has no value/subject field beyond
    ``user`` — it's a daily per-(user, mode, platform) upsert, exactly what the
    real ``record_usage`` endpoint writes once per student per day. Both
    dashboards that read it — ``apps.usage.views.usage_summary`` (per-tenant)
    and ``apps.core.platform.views.platform_usage`` (cross-tenant rollup) —
    default to a trailing 30-day window and segment by ``mode`` (pwa/browser)
    per ``day``. A flat "one event repeated" seed would render as a flat line,
    so this varies both which students were "active" and their mode/platform
    per day: each day gets a different-sized slice of the student roster
    (cycling 2..N so the chart has visible peaks/valleys) with mode alternating
    per student/day and platform cycling through all four choices. 14 days
    comfortably clears the ``usage_summary``/``platform_usage`` 30-day window
    and the brief's "≥5 distinct days" requirement.

    Also stamps ``first_pwa_at`` / ``last_display_mode`` / ``last_platform`` on
    each student's most-recent day (mirrors what ``record_usage`` sets on the
    live User row), so the "installed students" dashboard metric has data too.

    Returns the list of created/reused ``UsageEvent`` rows.
    """
    with tenant_context(tenant):
        from apps.usage.models import UsageEvent

        students = list(User.objects.filter(role="student").order_by("id")[:8])
        if not students:
            return []

        today = timezone.now().date()
        platforms = ["ios", "android", "desktop", "other"]
        seen_last = set()
        events = []

        for day_offset in range(days):
            day = today - timedelta(days=day_offset)
            # Cycle the size of the "active today" slice (2..len(students)) so
            # the daily count varies instead of every day looking identical.
            active_count = 2 + (day_offset % max(1, len(students) - 1))
            todays_students = students[: min(active_count, len(students))]

            for i, student in enumerate(todays_students):
                mode = "pwa" if (i + day_offset) % 2 == 0 else "browser"
                platform = platforms[(i + day_offset) % len(platforms)]
                event, _created = UsageEvent.objects.get_or_create(
                    user=student,
                    mode=mode,
                    platform=platform,
                    day=day,
                )
                events.append(event)

                # day_offset counts down from "today" (0) to the oldest day, so
                # the first time we see a given student is their most-recent
                # usage — mirrors the live-row semantics of record_usage().
                if student.pk not in seen_last:
                    seen_last.add(student.pk)
                    student.last_display_mode = mode
                    student.last_platform = platform
                    if mode == "pwa" and student.first_pwa_at is None:
                        student.first_pwa_at = timezone.now() - timedelta(days=day_offset)
                    student.save(update_fields=["last_display_mode", "last_platform", "first_pwa_at"])

        return events


def seed_filters(tenant):
    """Create a generic "Level" ``FilterGroup`` with a few difficulty options
    and assign one to every seeded ``Course``.

    Unlike the niche-driven content helpers above, filters are a coach-
    configured taxonomy rather than niche content, so a single generic
    difficulty dimension ("Level": Beginner/Intermediate/Advanced) exercises
    the filters UI (``FilterGroup``/``FilterOption`` CRUD + Course assignment)
    identically regardless of niche. Called unconditionally for all three plan
    tiers (no plan gate on this feature, per Task D5). Re-queries the tenant's
    already-seeded courses (call ``seed_courses`` first — this does not create
    courses of its own), per this file's re-query convention.

    Returns a dict with the created ``group`` (``FilterGroup``) and ``options``
    (list of ``FilterOption``, in the order created).
    """
    with tenant_context(tenant):
        from apps.courses.models import Course
        from apps.filters.models import FilterGroup, FilterOption

        group, _ = FilterGroup.objects.get_or_create(
            name="Level",
            defaults={"applies_to": "course", "order": 0},
        )

        option_names = ["Beginner", "Intermediate", "Advanced"]
        options = []
        for i, name in enumerate(option_names):
            option, _ = FilterOption.objects.get_or_create(group=group, name=name, defaults={"order": i})
            options.append(option)

        courses = list(Course.objects.order_by("id"))
        for i, course in enumerate(courses):
            course.filter_options.add(options[i % len(options)])

        return {"group": group, "options": options}


def seed_tags(tenant, *, count=DEFAULT_TAG_ITEM_COUNT):
    """Create a handful of generic ``Tag`` rows and assign them across every
    seeded content type (courses, videos, photos, downloads).

    ``Tag`` is scoped per content type (``apps.tags.models.SCOPES``), so the
    same tag *names* are created once per scope — a "Popular" course tag and a
    "Popular" video tag are distinct rows, mirroring how a coach can reuse a
    label across content kinds in the real admin without them colliding.
    Assigns up to ``count`` items per content type, cycling through the scope's
    tag pool so coverage is spread across items rather than one tag on
    everything. Called unconditionally for all three plan tiers (no plan gate
    on this feature, per Task D5). Re-queries the tenant's already-seeded
    content (call ``seed_courses``/``seed_downloads``/``seed_photos`` first —
    videos come from ``seed_courses``' lessons) rather than requiring it
    threaded in, per this file's re-query convention. A niche with no
    downloads (``DownloadFile`` is niche-JSON-driven and can be a short or
    empty list) simply gets no download tags assigned — courses/videos/photos
    still do.

    Returns a dict of scope -> list of created ``Tag`` rows (in creation
    order), regardless of whether any items existed to tag in that scope.
    """
    tag_names = ["Popular", "New", "Staff Pick", "On Sale"]

    with tenant_context(tenant):
        from apps.courses.models import Course, Video
        from apps.downloads.models import DownloadFile
        from apps.media.models import Photo
        from apps.tags.models import Tag

        scoped_models = [
            ("course", Course),
            ("video", Video),
            ("photo", Photo),
            ("download", DownloadFile),
        ]

        result = {}
        for scope, model in scoped_models:
            tags = [Tag.objects.get_or_create(scope=scope, name=name)[0] for name in tag_names]
            result[scope] = tags

            items = list(model.objects.order_by("id")[:count])
            for i, item in enumerate(items):
                item.tags.add(tags[i % len(tags)])

        return result


# ---------------------------------------------------------------------------
# Site assistant (Task D6)
# ---------------------------------------------------------------------------

# Generic FAQ-style content — the site assistant is niche-agnostic (unlike most
# helpers above, there's no per-niche JSON backing this): a coach's knowledge
# base starts from the same kind of boilerplate questions regardless of what
# they teach.
_ASSISTANT_KNOWLEDGE_ENTRIES = [
    (
        "What are your business hours?",
        "I'm typically online weekdays 9am-5pm, but course content and downloads "
        "are available any time — the platform never closes.",
    ),
    (
        "How do I cancel my subscription?",
        "Head to Account > Billing and click \"Cancel subscription\". You'll keep "
        "access until the end of your current billing period.",
    ),
    (
        "How do I reset my password?",
        "Use the \"Forgot password\" link on the login page — we'll email you a "
        "reset link. Logins are passwordless by default via magic link.",
    ),
    (
        "Where can I find my course materials?",
        "All your enrolled courses are listed under \"My Courses\" — open any "
        "course to see its modules, lessons and downloads.",
    ),
    (
        "Can I get a refund?",
        "Reach out via the contact page within 14 days of purchase and we'll "
        "sort it out — refunds are handled case by case.",
    ),
]

# A couple of coach-approved links the assistant can offer (relative paths —
# the coach's own site pages; see AssistantLink's docstring on external https
# URLs also being allowed).
_ASSISTANT_LINKS = [
    ("Courses", "/courses", "Browse everything currently available"),
    ("Pricing", "/pricing", "See plans and what's included"),
]


def seed_assistant(tenant, *, count=DEFAULT_ASSISTANT_KNOWLEDGE_COUNT):
    """Enable the tenant's ``AssistantConfig`` singleton and populate it with
    a handful of generic ``AssistantKnowledgeEntry`` rows plus a couple of
    ``AssistantLink`` rows.

    Starter+pro only (spec D2's on/off gate) — call site gates on the depth
    config, same 2-way pattern as ``seed_mailbox``/``seed_community``. Unlike
    those, the assistant doesn't reference any other seeded content (no
    students/courses needed), so this has no ordering dependency on other
    seeding helpers beyond the tenant itself existing.

    Creates up to ``count`` knowledge entries (capped at the length of the
    static FAQ list above) and exactly 2 ``AssistantLink`` rows. Returns a
    dict with the created ``config``, ``entries`` and ``links``.
    """
    with tenant_context(tenant):
        from apps.tenant_config.models import AssistantConfig, AssistantKnowledgeEntry, AssistantLink

        config = AssistantConfig.load()
        config.enabled = True
        config.greeting = "Hi! I'm here to help — ask me anything about courses, billing, or getting started."
        config.suggested_questions = [
            "How do I cancel my subscription?",
            "Where can I find my course materials?",
        ]
        config.save(update_fields=["enabled", "greeting", "suggested_questions"])

        entries = []
        for title, content in _ASSISTANT_KNOWLEDGE_ENTRIES[:count]:
            entry, _ = AssistantKnowledgeEntry.objects.get_or_create(title=title, defaults={"content": content})
            entries.append(entry)

        links = []
        for i, (label, url, note) in enumerate(_ASSISTANT_LINKS):
            link, _ = AssistantLink.objects.get_or_create(
                label=label, defaults={"url": url, "note": note, "position": i}
            )
            links.append(link)

        return {"config": config, "entries": entries, "links": links}


# Niche-agnostic AI-suggested topic queue — plausible "what's next" ideas that
# read fine regardless of niche, same wellness-flavoured spirit as
# calendar_content's PUBLISHED_BLOG_TITLES.
_BLOG_TOPIC_IDEAS = [
    (
        "5 Ways to Stay Consistent This Season",
        "Practical, no-fluff listicle — easy to skim, easy to post as-is.",
    ),
    (
        "What I Wish I Knew When I Started",
        "Personal-story angle in the coach's own voice — builds relatability.",
    ),
    (
        "Common Beginner Mistakes (and Quick Fixes)",
        "Listicle format pairing each mistake with a one-line fix.",
    ),
    (
        "Behind the Scenes: How I Plan a Session",
        "Process/transparency angle for already-engaged students.",
    ),
    (
        "A Student Success Story Worth Sharing",
        "Social-proof angle — feature a real student win.",
    ),
]


def seed_blog_extras(tenant, *, count=DEFAULT_BLOG_TOPIC_IDEA_COUNT):
    """Populate the AI blog topic-idea queue and enable the autopilot schedule.

    Pro only (spec D7's tighter gate) — call site gates on
    ``depth["blog_extras"]``, 0 on free AND starter (stricter than
    ``seed_assistant``/``seed_mailbox``/``seed_community``'s starter+pro 2-way
    gate). Builds on top of the 8 ``BlogPost`` rows already created by
    ``calendar_content.seed_blog_posts`` (called earlier in the same
    tenant_context block in ``seed_dev_tenants``) — this function does not
    touch those; it adds "what's queued next": a batch of AI-suggested topic
    ideas plus the hands-off generation schedule that would eventually draft
    from them. No dependency on students/courses/posts, so — like
    ``seed_assistant`` — it has no ordering requirement beyond the tenant
    existing; it opens its own ``tenant_context`` so it can be called
    independently.

    Creates up to ``count`` ``BlogTopicIdea`` rows (capped at the static list
    length above) sharing one ``batch_id`` — mirrors the real batched
    generation shape (12-at-a-time on the cheap model per the model
    docstring) — and enables the singleton ``BlogAutopilot`` row (weekly,
    Monday 09:00, review-first: ``auto_publish`` stays False so a coach
    always sees a draft before it goes live). Returns a dict with the created
    ``ideas`` and the ``autopilot`` singleton.
    """
    with tenant_context(tenant):
        from apps.blog.models import BlogAutopilot, BlogTopicIdea

        batch_id = str(uuid.uuid4())
        ideas = []
        for title, angle in _BLOG_TOPIC_IDEAS[:count]:
            idea, _ = BlogTopicIdea.objects.get_or_create(title=title, defaults={"angle": angle, "batch_id": batch_id})
            ideas.append(idea)

        autopilot = BlogAutopilot.load()
        autopilot.is_enabled = True
        autopilot.frequency = "weekly"
        autopilot.generate_time = time(9, 0)
        autopilot.weekday = 0  # Monday
        autopilot.auto_publish = False
        autopilot.save(
            update_fields=["is_enabled", "frequency", "generate_time", "weekday", "auto_publish"]
        )

        return {"ideas": ideas, "autopilot": autopilot}
