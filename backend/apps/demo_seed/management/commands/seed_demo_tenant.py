import logging
import random
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.utils import timezone
from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.core.demo.views import DEMO_COACH_EMAIL, DEMO_STUDENT_EMAIL
from apps.core.models import Domain, PlatformPlan, Tenant
from apps.demo_seed.registry import load_niche

logger = logging.getLogger(__name__)

TARGET_COURSES = 50
TARGET_VIDEOS = 200
TARGET_PHOTOS = 400


class Command(BaseCommand):
    help = "Seed a demo tenant with niche-specific content"

    def add_arguments(self, parser):
        parser.add_argument(
            "--niche",
            required=True,
            help="Niche template to use (e.g. belly_dance)",
        )

    def handle(self, *args, **options):
        niche = options["niche"]

        try:
            data = load_niche(niche)
        except FileNotFoundError:
            raise CommandError(f"No demo data module found for niche: {niche}") from None

        tenant_data = data.TENANT
        config_data = data.CONFIG
        courses_data = data.COURSES

        superuser_emails = getattr(settings, "CONTENTOR_SUPERUSERS", [])
        if not superuser_emails:
            raise CommandError("CONTENTOR_SUPERUSERS env var is empty. Need at least one email for the demo owner.")
        owner_email = superuser_emails[0]

        # Teardown existing demo tenant if present
        slug = tenant_data["slug"]
        try:
            existing = Tenant.objects.get(slug=slug)
            self.stdout.write(f"Found existing tenant '{slug}', tearing down...")
            Domain.objects.filter(tenant=existing).delete()
            schema = existing.schema_name
            existing.delete()
            with connection.cursor() as cursor:
                cursor.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
            self.stdout.write(f"Dropped schema '{schema}' and deleted tenant")
        except Tenant.DoesNotExist:
            pass

        try:
            pro_plan = PlatformPlan.objects.get(name="pro")
        except PlatformPlan.DoesNotExist:
            raise CommandError("PlatformPlan 'pro' not found. Run seed_plans first.") from None

        tenant = Tenant.objects.create(
            name=tenant_data["name"],
            slug=slug,
            subdomain=tenant_data["subdomain"],
            schema_name=tenant_data["schema_name"],
            owner_email=owner_email,
            plan=pro_plan,
            provisioning_status="ready",
            is_demo=True,
        )
        self.stdout.write(f"Created tenant: {tenant.name} (is_demo=True)")

        # Derive the host from the active platform domain so demos resolve in
        # every environment (demo-yoga.localhost in dev, demo-yoga.contentor.app
        # in prod) — the marketing gallery builds the same `<subdomain>.<base>`
        # host. The module's hardcoded "domain" is a dev-only reference.
        demo_domain = f"{tenant_data['subdomain']}.{settings.CONTENTOR_DOMAIN}"
        Domain.objects.create(
            domain=demo_domain,
            tenant=tenant,
            is_primary=True,
        )
        self.stdout.write(f"Created domain: {demo_domain}")

        tenant.create_schema(check_if_exists=True, verbosity=0)
        self.stdout.write(f"Created schema: {tenant.schema_name}")

        downloads_data = getattr(data, "DOWNLOADS", [])
        students_data = getattr(data, "STUDENTS", [])
        plans_data = getattr(data, "SUBSCRIPTION_PLANS", [])
        bundles_data = getattr(data, "BUNDLES", [])
        live_classes_data = getattr(data, "LIVE_CLASSES", [])
        live_streams_data = getattr(data, "LIVE_STREAMS", [])
        recurring_live_class = getattr(data, "RECURRING_LIVE_CLASS", None)
        zoom_classes_data = getattr(data, "ZOOM_CLASSES", [])
        onsite_events_data = getattr(data, "ONSITE_EVENTS", [])
        student_billing_data = getattr(data, "STUDENT_BILLING", [])

        # Multiply courses to reach TARGET_COURSES
        expanded_courses = self._expand_courses(courses_data, TARGET_COURSES)

        with tenant_context(tenant):
            photo_map = self._seed_photos(config_data, expanded_courses)
            self._seed_config(config_data, photo_map)
            owner = self._seed_owner(owner_email)
            self._seed_demo_synthetic_users()
            courses = self._seed_courses(expanded_courses, owner, photo_map)
            self._seed_extra_videos(courses_data, TARGET_VIDEOS)
            self._seed_extra_photos(courses_data, config_data, TARGET_PHOTOS)
            if downloads_data:
                self._seed_downloads(downloads_data)

            # Billing: plans, bundles, live events
            sub_plans = self._seed_subscription_plans(plans_data, courses)
            bundles = self._seed_bundles(bundles_data, courses)

            # Collect all photos for random assignment to events
            from apps.media.models import Photo

            all_photos = list(Photo.objects.all())

            self._seed_live_classes(live_classes_data, owner, all_photos)
            self._seed_recurring_live_classes(recurring_live_class, owner, all_photos)
            self._seed_live_streams(live_streams_data, owner, all_photos)
            self._seed_zoom_classes(zoom_classes_data, owner, all_photos)
            self._seed_onsite_events(onsite_events_data, owner, all_photos)
            # Events are created with the model default status="draft", which the
            # student-facing lists hide. Publish them so the demo's live/calendar
            # pages show real upcoming/past events instead of an empty state.
            self._publish_seeded_events()

            # Blog posts + email campaigns so the coach content calendar
            # (/admin/calendar) shows a full Live + Blog + Email mix.
            from apps.demo_seed.calendar_content import seed_blog_posts, seed_email_campaigns

            blog_posts = seed_blog_posts(owner)
            email_campaigns = seed_email_campaigns(owner)
            self.stdout.write(f"  Blog posts: {len(blog_posts)} created")
            self.stdout.write(f"  Email campaigns: {len(email_campaigns)} created")

            # Students with purchases, subscriptions, and progress
            if students_data:
                self._seed_students_full(
                    students_data,
                    student_billing_data,
                    courses,
                    sub_plans,
                    bundles,
                    owner,
                )

            # Give the shared "explore as student" demo user a real account so the
            # student portal (dashboard, subscriptions, my courses) isn't empty when
            # a visitor — or the flowmap crawler — browses the demo as a student.
            self._seed_demo_student_billing(courses, sub_plans)

            # One sent email campaign so the coach email pages (list + detail) show
            # real data instead of an empty "No campaigns yet" / failed-to-load state.
            self._seed_demo_email_campaign(owner)

        self.stdout.write(self.style.SUCCESS(f"\nDemo tenant ready at: {demo_domain}"))

    # ------------------------------------------------------------------
    # Course multiplication
    # ------------------------------------------------------------------

    def _expand_courses(self, base_courses, target):
        """Repeat base course templates to reach the target count with varied titles."""
        if len(base_courses) >= target:
            return base_courses[:target]

        expanded = []
        pricing_types = ["free", "paid"]
        prices = [0, 19, 29, 39, 49, 59, 69, 79]

        for i in range(target):
            template = base_courses[i % len(base_courses)]
            course = {**template}

            if i < len(base_courses):
                # Keep original courses unchanged
                expanded.append(course)
                continue

            # Vary the title and metadata
            batch = (i // len(base_courses)) + 1
            course["title"] = f"{template['title']} — Volume {batch}"
            course["order"] = i + 1

            # Vary pricing
            pt = pricing_types[i % len(pricing_types)]
            course["pricing_type"] = pt
            course["price"] = 0 if pt == "free" else prices[i % len(prices)]

            # Alternate published status (90% published)
            course["is_published"] = i % 10 != 0

            # Deep-copy lessons to avoid mutation
            course["lessons"] = [dict(lesson) for lesson in template["lessons"]]

            expanded.append(course)

        return expanded

    # ------------------------------------------------------------------
    # Seed helpers
    # ------------------------------------------------------------------

    def _seed_photos(self, config_data, courses_data):
        from apps.media.models import Photo

        photo_keys = set()

        # Collect from landing sections
        sections = config_data.get("landing_sections", {})
        for section in sections.values():
            if isinstance(section, dict):
                for key in ("bg_image_url", "image_url"):
                    if section.get(key):
                        photo_keys.add(section[key])

        # Collect from courses
        for course in courses_data:
            if course.get("thumbnail_url"):
                photo_keys.add(course["thumbnail_url"])

        photo_map = {}
        for s3_key in photo_keys:
            photo = Photo.objects.create(s3_key=s3_key, title=s3_key.split("/")[-1])
            photo_map[s3_key] = photo

        self.stdout.write(f"  Photos: {len(photo_map)} created")
        return photo_map

    def _seed_config(self, config_data, photo_map):
        from apps.tenant_config.defaults import default_pages
        from apps.tenant_config.models import TenantConfig

        # Inject photo IDs into landing_sections
        sections = config_data.get("landing_sections", {})
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

        # Demo tenants get the same starter page blocks as real provisioned
        # tenants — otherwise /courses and the other public pages render empty.
        config_data.setdefault("pages", default_pages(config_data["brand_name"]))

        TenantConfig.objects.create(**config_data)
        self.stdout.write(f"  Config: {config_data['brand_name']}")

    def _seed_owner(self, email):
        owner = User.objects.create_user(
            email=email,
            name="Demo Owner",
            role="owner",
            is_staff=True,
        )
        self.stdout.write(f"  Owner: {email}")
        return owner

    def _seed_demo_synthetic_users(self):
        """Pre-seed the two users the demo entry endpoint hands out JWTs for.

        Lives in the tenant schema; each demo tenant gets its own pair so a
        visitor exploring yoga can't reuse a token from the pilates demo.
        """
        User.objects.create_user(
            email=DEMO_COACH_EMAIL,
            name="Demo Coach",
            role="owner",
            is_staff=True,
        )
        User.objects.create_user(
            email=DEMO_STUDENT_EMAIL,
            name="Demo Student",
            role="student",
        )
        self.stdout.write(f"  Demo users: {DEMO_COACH_EMAIL}, {DEMO_STUDENT_EMAIL}")

    def _seed_courses(self, courses_data, instructor, photo_map):
        from apps.courses.models import Course, Lesson, Module, Video

        created_courses = []
        for course_data in courses_data:
            course_fields = {k: v for k, v in course_data.items() if k not in ("lessons", "module_title")}
            lessons_data = course_data["lessons"]
            module_title = course_data["module_title"]

            # Link thumbnail Photo if available
            thumbnail_url = course_fields.get("thumbnail_url", "")
            photo = photo_map.get(thumbnail_url)

            course = Course(instructor=instructor, thumbnail=photo, **course_fields)
            course.save()

            module = Module.objects.create(course=course, title=module_title, order=1)

            for lesson_data in lessons_data:
                lesson_data = dict(lesson_data)  # copy to avoid mutating demo data
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

            created_courses.append(course)
        self.stdout.write(f"  Courses: {len(created_courses)} created")
        return created_courses

    def _seed_extra_videos(self, base_courses, target):
        """Create additional standalone Video objects to reach the target count."""
        from apps.courses.models import Video

        existing = Video.objects.count()
        needed = max(0, target - existing)
        if needed == 0:
            self.stdout.write(f"  Videos: {existing} already exist (target {target})")
            return

        # Collect all video S3 keys from base courses
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
                title=f"{title} (Extra {i + 1})",
                s3_key=s3_key,
                duration_seconds=duration + random.randint(-30, 60),
                file_size=random.randint(10_000_000, 200_000_000),
            )

        total = Video.objects.count()
        self.stdout.write(f"  Videos: {total} total ({needed} extra created)")

    def _seed_extra_photos(self, base_courses, config_data, target):
        """Create additional Photo objects to reach the target count."""
        from apps.media.models import Photo

        existing = Photo.objects.count()
        needed = max(0, target - existing)
        if needed == 0:
            self.stdout.write(f"  Photos: {existing} already exist (target {target})")
            return

        # Collect all photo S3 keys from base courses and config
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

        categories = [
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

        for i in range(needed):
            s3_key = photo_keys[i % len(photo_keys)]
            category = categories[i % len(categories)]
            Photo.objects.create(
                s3_key=s3_key,
                title=f"{category} Photo {i + 1}",
                file_size=random.randint(50_000, 5_000_000),
            )

        total = Photo.objects.count()
        self.stdout.write(f"  Photos: {total} total ({needed} extra created)")

    def _seed_downloads(self, downloads_data):
        from apps.downloads.models import DownloadFile

        for dl in downloads_data:
            DownloadFile.objects.create(**dl)
        self.stdout.write(f"  Downloads: {len(downloads_data)} files")

    # ------------------------------------------------------------------
    # Subscription plans
    # ------------------------------------------------------------------

    def _seed_subscription_plans(self, plans_data, courses):
        from django.contrib.contenttypes.models import ContentType

        from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess
        from apps.courses.models import Course

        if not plans_data:
            return []

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

        self.stdout.write(f"  Subscription plans: {len(created_plans)} created")
        return created_plans

    # ------------------------------------------------------------------
    # Bundles
    # ------------------------------------------------------------------

    def _seed_bundles(self, bundles_data, courses):
        from django.contrib.contenttypes.models import ContentType

        from apps.billing.models import Bundle, BundleItem
        from apps.courses.models import Course

        if not bundles_data:
            return []

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

        self.stdout.write(f"  Bundles: {len(created_bundles)} created")
        return created_bundles

    # ------------------------------------------------------------------
    # Live classes & streams — 2 years of events (1yr past + 1yr future)
    # ------------------------------------------------------------------

    def _seed_live_classes(self, live_classes_data, instructor, photos):
        """Repeat live class templates every 2 weeks across 2 years."""
        from apps.live.models import LiveClass

        if not live_classes_data:
            return

        now = timezone.now()
        start = now - timedelta(days=365)
        end = now + timedelta(days=365)
        interval = timedelta(weeks=2)
        count = 0

        cursor = start
        while cursor < end:
            template = live_classes_data[count % len(live_classes_data)]
            scheduled_at = cursor.replace(hour=random.randint(10, 20), minute=0, second=0, microsecond=0)
            photo = random.choice(photos) if photos else None

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
            )
            count += 1
            cursor += interval

        self.stdout.write(f"  Live classes: {count} created (2-year span)")

    def _seed_live_streams(self, live_streams_data, instructor, photos):
        """Repeat live stream templates monthly across 2 years."""
        from apps.live.models import LiveStream

        if not live_streams_data:
            return

        now = timezone.now()
        start = now - timedelta(days=365)
        end = now + timedelta(days=365)
        interval = timedelta(weeks=4)
        count = 0

        cursor = start
        while cursor < end:
            template = live_streams_data[count % len(live_streams_data)]
            scheduled_at = cursor.replace(hour=20, minute=0, second=0, microsecond=0)
            photo = random.choice(photos) if photos else None

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
            )
            count += 1
            cursor += interval

        self.stdout.write(f"  Live streams: {count} created (2-year span)")

    def _seed_recurring_live_classes(self, recurring_data, instructor, photos):
        """Create weekly recurring live class spanning 1yr past + 1yr future."""
        from apps.live.models import LiveClass

        if not recurring_data:
            return

        now = timezone.now()
        title = recurring_data["title"]
        desc = recurring_data.get("description", "")
        pricing_type = recurring_data.get("pricing_type", "free")
        price = recurring_data.get("price", 0)
        duration_minutes = recurring_data.get("duration_minutes", 60)
        day_of_week = recurring_data.get("day_of_week", 2)
        hour = recurring_data.get("hour", 19)
        minute = recurring_data.get("minute", 0)

        # Find the next occurrence of the target day
        days_ahead = day_of_week - now.weekday()
        if days_ahead <= 0:
            days_ahead += 7
        next_date = (now + timedelta(days=days_ahead)).replace(hour=hour, minute=minute, second=0, microsecond=0)

        # 52 weeks past + 52 weeks future
        past_start = next_date - timedelta(weeks=52)
        count = 0
        photo = random.choice(photos) if photos else None

        for i in range(104):
            d = past_start + timedelta(weeks=i)
            LiveClass.objects.create(
                title=f"{title} — {d.strftime('%b %d')}",
                description=desc,
                instructor=instructor,
                pricing_type=pricing_type,
                price=price,
                duration_minutes=duration_minutes,
                thumbnail=photo,
                thumbnail_url=photo.s3_key if photo else "",
                scheduled_at=d,
            )
            count += 1

        self.stdout.write(f"  Recurring live classes: {count} created (2-year span)")

    def _seed_zoom_classes(self, zoom_data, instructor, photos):
        """Repeat zoom class templates every 2 weeks across 2 years."""
        from apps.live.models import ZoomClass

        if not zoom_data:
            return

        now = timezone.now()
        start = now - timedelta(days=365)
        end = now + timedelta(days=365)
        interval = timedelta(weeks=2)
        count = 0

        cursor = start
        while cursor < end:
            template = zoom_data[count % len(zoom_data)]
            scheduled_at = cursor.replace(hour=random.randint(14, 19), minute=0, second=0, microsecond=0)
            photo = random.choice(photos) if photos else None

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
            )
            count += 1
            cursor += interval

        self.stdout.write(f"  Zoom classes: {count} created (2-year span)")

    def _seed_onsite_events(self, onsite_data, instructor, photos):
        """Repeat onsite event templates monthly across 2 years."""
        from apps.live.models import OnsiteEvent

        if not onsite_data:
            return

        now = timezone.now()
        start = now - timedelta(days=365)
        end = now + timedelta(days=365)
        interval = timedelta(weeks=4)
        count = 0

        cursor = start
        while cursor < end:
            template = onsite_data[count % len(onsite_data)]
            # Onsite events on Saturdays at 10:00
            days_to_sat = (5 - cursor.weekday()) % 7
            scheduled_at = (cursor + timedelta(days=days_to_sat)).replace(hour=10, minute=0, second=0, microsecond=0)
            photo = random.choice(photos) if photos else None

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
            )
            count += 1
            cursor += interval

        self.stdout.write(f"  On-site events: {count} created (2-year span)")

    # ------------------------------------------------------------------
    # Students with billing, subscriptions & progress
    # ------------------------------------------------------------------

    def _seed_students_full(self, students_data, billing_data, courses, sub_plans, bundles, owner):
        from django.contrib.contenttypes.models import ContentType

        from apps.billing.models import Bundle, Payment, PaymentItem, Subscription
        from apps.courses.models import Course, Enrollment, Lesson, Progress

        course_ct = ContentType.objects.get_for_model(Course)
        bundle_ct = ContentType.objects.get_for_model(Bundle)

        # Build email -> billing map
        billing_map = {b["email"]: b for b in billing_data}

        # Pre-fetch lessons per course (only base courses, not expanded)
        lessons_by_course = {}
        for i, course in enumerate(courses):
            lessons_by_course[i] = list(Lesson.objects.filter(module__course=course).order_by("module__order", "order"))

        students = []
        total_payments = 0
        total_subscriptions = 0
        total_progress = 0

        now = timezone.now()

        for s in students_data:
            user = User.objects.create_user(email=s["email"], name=s["name"], role="student")
            students.append(user)

            billing = billing_map.get(s["email"])
            if not billing:
                # No billing data — just enroll in a random free course
                free_courses = [c for c in courses[:3] if c.pricing_type == "free"]
                if free_courses:
                    Enrollment.objects.create(user=user, course=free_courses[0])
                continue

            # --- Course purchases (one_time payments) ---
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
                    provider_payment_id=f"demo-{user.pk}-course-{course.pk}",
                )
                PaymentItem.objects.create(
                    payment=payment,
                    content_type=course_ct,
                    object_id=course.pk,
                    item_price=course.price,
                    submerchant_payout=round(course.price * Decimal("0.94"), 2),
                )
                Enrollment.objects.get_or_create(user=user, course=course, defaults={"payment_id": payment.pk})
                total_payments += 1

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
                    provider_payment_id=f"demo-{user.pk}-bundle-{bundle.pk}",
                )
                PaymentItem.objects.create(
                    payment=payment,
                    content_type=bundle_ct,
                    object_id=bundle.pk,
                    item_price=bundle.price,
                    submerchant_payout=round(bundle.price * Decimal("0.94"), 2),
                )
                # Enroll in all courses in the bundle
                for item in bundle.items.all():
                    if item.content_type == course_ct:
                        Enrollment.objects.get_or_create(
                            user=user,
                            course_id=item.object_id,
                            defaults={"payment_id": payment.pk},
                        )
                total_payments += 1

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
                # Create the subscription payment
                Payment.objects.create(
                    student=user,
                    payment_type="subscription",
                    status="completed",
                    amount=plan.price,
                    platform_fee=round(plan.price * Decimal("0.06"), 2),
                    submerchant_payout=round(plan.price * Decimal("0.94"), 2),
                    currency=plan.currency,
                    provider="bypass",
                    provider_payment_id=f"demo-{user.pk}-sub-{plan.pk}",
                    subscription=subscription,
                )
                # Enroll in subscription-accessible courses
                for access in plan.access_items.all():
                    if access.content_type == course_ct:
                        Enrollment.objects.get_or_create(
                            user=user,
                            course_id=access.object_id,
                        )
                total_payments += 1
                total_subscriptions += 1

            # --- Enroll in free courses if not already enrolled ---
            free_courses = [c for c in courses[:3] if c.pricing_type == "free"]
            for fc in free_courses:
                Enrollment.objects.get_or_create(user=user, course=fc)

            # --- Progress ---
            for course_idx, lesson_idx, watched, completed in billing.get("progress", []):
                if course_idx not in lessons_by_course:
                    continue
                lessons = lessons_by_course[course_idx]
                if lesson_idx >= len(lessons):
                    continue
                Progress.objects.create(
                    user=user,
                    lesson=lessons[lesson_idx],
                    watched_seconds=watched,
                    completed=completed,
                )
                total_progress += 1

        total_enrollments = Enrollment.objects.count()
        self.stdout.write(
            f"  Students: {len(students)} users, {total_enrollments} enrollments, "
            f"{total_payments} payments, {total_subscriptions} subscriptions, "
            f"{total_progress} progress records"
        )

    def _seed_demo_student_billing(self, courses, sub_plans):
        """Populate the shared demo student (DEMO_STUDENT_EMAIL) with an active
        subscription, a one-time course purchase, and some progress.

        The demo "View as student" entry point and the flowmap crawler both log in
        as this one synthetic user. Without billing, the student portal renders
        empty states (no subscription, no purchased courses), which makes the demo
        and the captured flows look broken. This is read-only demo data; the demo
        read-only middleware prevents visitors from mutating it.
        """
        from datetime import timedelta
        from decimal import Decimal

        from django.contrib.contenttypes.models import ContentType
        from django.utils import timezone

        from apps.billing.models import Payment, PaymentItem, Subscription
        from apps.courses.models import Course, Enrollment, Lesson, Progress

        student = User.objects.filter(email=DEMO_STUDENT_EMAIL).first()
        if student is None:
            return

        course_ct = ContentType.objects.get_for_model(Course)
        now = timezone.now()

        # --- Active subscription to the first plan ---
        if sub_plans:
            plan = sub_plans[0]
            subscription = Subscription.objects.create(
                student=student,
                plan=plan,
                billing_amount=plan.price,
                billing_currency=plan.currency,
                status="active",
                current_period_start=now - timedelta(days=8),
                current_period_end=now + timedelta(days=22),
            )
            Payment.objects.create(
                student=student,
                payment_type="subscription",
                status="completed",
                amount=plan.price,
                platform_fee=round(plan.price * Decimal("0.06"), 2),
                submerchant_payout=round(plan.price * Decimal("0.94"), 2),
                currency=plan.currency,
                provider="bypass",
                provider_payment_id=f"demo-{student.pk}-sub-{plan.pk}",
                subscription=subscription,
            )
            for access in plan.access_items.all():
                if access.content_type == course_ct:
                    Enrollment.objects.get_or_create(user=student, course_id=access.object_id)

        # --- One-time purchase of the first paid course ---
        paid_course = next((c for c in courses if c.pricing_type == "paid" and c.price), None)
        if paid_course is not None:
            payment = Payment.objects.create(
                student=student,
                payment_type="one_time",
                status="completed",
                amount=paid_course.price,
                platform_fee=round(paid_course.price * Decimal("0.06"), 2),
                submerchant_payout=round(paid_course.price * Decimal("0.94"), 2),
                currency="TRY",
                provider="bypass",
                provider_payment_id=f"demo-{student.pk}-course-{paid_course.pk}",
            )
            PaymentItem.objects.create(
                payment=payment,
                content_type=course_ct,
                object_id=paid_course.pk,
                item_price=paid_course.price,
                submerchant_payout=round(paid_course.price * Decimal("0.94"), 2),
            )
            Enrollment.objects.get_or_create(user=student, course=paid_course, defaults={"payment_id": payment.pk})

        # --- A bit of progress on the first enrolled course so "Continue learning" shows ---
        first_enrollment = Enrollment.objects.filter(user=student).order_by("id").first()
        if first_enrollment is not None:
            lessons = list(
                Lesson.objects.filter(module__course=first_enrollment.course).order_by("module__order", "order")
            )
            for idx, lesson in enumerate(lessons[:3]):
                Progress.objects.get_or_create(
                    user=student,
                    lesson=lesson,
                    defaults={"watched_seconds": 300, "completed": idx < 2},
                )

        self.stdout.write(f"  Demo student billing: {DEMO_STUDENT_EMAIL} (subscription + purchase + progress)")

    def _publish_seeded_events(self):
        """Promote seeded events out of the default 'draft' status.

        Events are created via the model directly (bypassing the create serializer
        that would set 'scheduled'), so they keep status='draft' and the student
        lists — which filter status__in=[scheduled,live,ended] — hide them all.
        Mark future events 'scheduled' and past events 'ended' so the demo's live
        and calendar pages render real data.
        """
        from django.utils import timezone

        from apps.live.models import LiveClass, LiveStream, OnsiteEvent, ZoomClass

        now = timezone.now()
        total = 0
        for model in (LiveClass, LiveStream, ZoomClass, OnsiteEvent):
            total += model.objects.filter(scheduled_at__gte=now).update(status="scheduled")
            total += model.objects.filter(scheduled_at__lt=now).update(status="ended")
        self.stdout.write(f"  Published events: {total} (scheduled/ended by date)")

    def _seed_demo_email_campaign(self, owner):
        """Seed one already-sent email campaign with recipients so the coach email
        pages show real history instead of an empty / failed-to-load state."""
        from datetime import timedelta

        from django.utils import timezone

        from apps.email_campaigns.models import CampaignRecipient, CampaignStatus, EmailCampaign, RecipientStatus

        students = list(User.objects.filter(role="student").order_by("id")[:8])
        sent_at = timezone.now() - timedelta(days=3)
        rendered_html = (
            '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;'
            'padding:32px;color:#1a1a1a">'
            '<h1 style="font-size:24px">New classes just dropped 🧘</h1>'
            "<p>Hi there,</p>"
            "<p>We've just added a fresh round of weekly Vinyasa Flow sessions to the "
            "calendar — open to all levels. Reserve your spot and keep your practice going.</p>"
            '<p style="margin:28px 0"><a href="#" style="background:#16a34a;color:#fff;'
            'padding:12px 24px;border-radius:8px;text-decoration:none">View the schedule</a></p>'
            "<p>See you on the mat,<br/>The Yoga Studio team</p>"
            "</div>"
        )
        campaign = EmailCampaign.objects.create(
            subject="New classes just dropped 🧘",
            template_id="demo-welcome",
            template_name="Welcome / Announcement",
            sender=owner,
            recipient_filter={"all": True},
            recipient_count=len(students),
            success_count=len(students),
            failure_count=0,
            status=CampaignStatus.SENT,
            rendered_html=rendered_html,
            recipient_summary="All students",
            sent_at=sent_at,
        )
        for student in students:
            CampaignRecipient.objects.create(
                campaign=campaign,
                user_id=student.pk,
                user_name=student.name,
                user_email=student.email,
                status=RecipientStatus.SENT,
                sent_at=sent_at,
            )
        self.stdout.write(f"  Email campaign: 1 sent to {len(students)} recipients")
