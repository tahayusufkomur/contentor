"""Seed the three canonical dev tenants (fitness / pilates / yoga).

Replaces the marketing "demo website" subsystem (``seed_all_demos`` /
``seed_demo_tenant``) with a small, plan-scaled set of real, published tenants
for local development and e2e. Each tenant is a genuine coach account — a real
owner login, ``is_published=True`` (so anonymous browsing / e2e never hits the
preview gate) and ``template_niche`` set (so the tenant_config serializer's
``niche`` field resolves and the builder gets niche-appropriate block defaults).

Depth is scaled by plan tier so the three tenants exercise the free / starter /
pro feature envelopes:

* ``demo-fitness`` (free)    — no live events, 5 courses, 8 students, no mailbox, no
  community, no notifications, no site assistant, no blog autopilot/topic queue.
* ``demo-pilates`` (starter) — live on, 8 courses, 40 students, 3 mailbox conversations,
  3 community posts, "light" notifications (one announcement + template only), site
  assistant enabled with 3 knowledge entries, no blog autopilot/topic queue.
* ``demo-yoga`` (pro)        — live on, 10 courses, 80 students, 5 mailbox conversations,
  5 community posts, "full" notifications (+ recurring schedule, email opt-out, push
  subscription), site assistant enabled with 5 knowledge entries, blog autopilot enabled
  with a 3-idea topic queue.

All three tenants additionally get a spread of ``UsageEvent`` rows (usage analytics
dashboards), a "Level" filter assigned to their courses, and a handful of Tags spread
across their courses/videos/photos/downloads — none of these three features have a
plan-tier gate, so they're seeded identically everywhere. Blog posts + email campaigns
(``calendar_content``) are likewise seeded identically across all three tiers; only the
autopilot queue on top of them (``seed_blog_extras``) is plan-gated, and pro-only.

Content wiring is delegated to ``apps.demo_seed.seeding_helpers`` — these helpers
re-query the tenant DB for what they need (they do NOT thread prior-step outputs),
so there is a REQUIRED CALL ORDER that this command follows exactly:

    seed_photos            → seed_config / seed_courses
                           → seed_downloads / seed_subscription_plans / seed_bundles
                           → seed_live_bundle / seed_students
                           → seed_purchases_and_progress   (resolves the rest by query)
                           → seed_mailbox                  (needs seed_students' rows)
                           → seed_community                (needs seed_students' rows)
                           → seed_notifications             (needs seed_students' rows)
                           → seed_assistant                 (no dependency on other steps)
                           → seed_usage                     (needs seed_students' rows)
                           → seed_filters                   (needs seed_courses' rows)
                           → seed_tags                      (needs courses/downloads/photos/
                                                              videos from the steps above)
                           → calendar_content.seed_blog_posts / seed_email_campaigns
                           → seed_blog_extras               (needs seed_blog_posts' BlogPost
                                                              rows to already exist — it adds
                                                              the topic-idea queue "on top of"
                                                              them, not a hard query dependency,
                                                              but conceptually comes after)

Idempotent: an existing slug is skipped unless ``--force`` is passed, which tears
the tenant (schema + domain) down and reseeds it, mirroring the old
``seed_all_demos --force`` semantics.
"""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection
from django_tenants.utils import schema_context, tenant_context

from apps.accounts.models import User
from apps.core.constants import REGION_DEFAULT_LOCALE, REGION_GLOBAL
from apps.core.models import Domain, PlatformPlan, PlatformSubscription, Tenant
from apps.demo_seed import calendar_content, seeding_helpers
from apps.demo_seed.registry import load_niche

# (slug, plan tier, niche key, depth config). Depth scales content volume by
# plan tier; the seeding helpers take these as explicit count / include_live
# kwargs (no plan-limit enforcement happens here). ``notifications`` is a 3-way
# level gate rather than a count (0/"" = skip, "light" = starter, "full" = pro)
# because the feature's plan gate is "full for pro, light for starter" — not a
# simple on/off or more-of-the-same-thing scale like mailbox/community/
# assistant below. ``assistant`` is a simple starter+pro on/off gate (spec D2,
# same 2-way shape as mailbox/community) — the int is the knowledge-entry
# count passed straight to ``seed_assistant``, not a distinct depth tier.
# ``blog_extras`` (spec D7) is a stricter PRO-ONLY on/off gate — 0 for both
# free AND starter, nonzero for pro only — because blog autopilot is a pro
# feature, unlike assistant/mailbox/community's starter+pro gate. The int is
# the topic-idea count passed straight to ``seed_blog_extras``.
# ``pro_edge_cases`` (spec D8) is also PRO-ONLY, same shape as ``blog_extras`` —
# but unlike every other key above, it doesn't gate a separate helper call;
# ``seed_purchases_and_progress`` runs unconditionally for all three tiers, and
# this bool just asks that one call to additionally push one Payment/
# Subscription it already created into a refunded / past_due edge state.
DEV_TENANTS = [
    (
        "demo-fitness",
        "free",
        "fitness",
        {
            "include_live": False,
            "students": 8,
            "courses": 5,
            "mailbox": 0,
            "community": 0,
            "notifications": "",
            "assistant": 0,
            "blog_extras": 0,
            "pro_edge_cases": False,
        },
    ),
    (
        "demo-pilates",
        "starter",
        "pilates",
        {
            "include_live": True,
            "students": 40,
            "courses": 8,
            "mailbox": 3,
            "community": 3,
            "notifications": "light",
            "assistant": 3,
            "blog_extras": 0,
            "pro_edge_cases": False,
        },
    ),
    (
        "demo-yoga",
        "pro",
        "yoga",
        {
            "include_live": True,
            "students": 80,
            "courses": 10,
            "mailbox": 5,
            "community": 5,
            "notifications": "full",
            "assistant": 5,
            "blog_extras": 3,
            "pro_edge_cases": True,
        },
    ),
]

# Minimal PlatformPlan fields used only when a tier's plan row does not already
# exist (fresh / test DB). In a seeded dev/prod DB the canonical rows created by
# `seed_plans` are reused. Mirrors the tier shape from seed_plans. No "free"
# entry: the free tier always reuses the canonical BILLING_FREE_PLAN_NAME row
# via `.get()` (see `_resolve_plan`), never get_or_create, so it never needs
# defaults of its own.
_PLAN_DEFAULTS = {
    "starter": {
        "price_monthly": 19,
        "transaction_fee_pct": 8,
        "max_students": 100,
        "max_storage_gb": 100,
        "max_streaming_hours": 100,
        "max_campaign_emails": 1000,
        "is_live_enabled": True,
    },
    "pro": {
        "price_monthly": 49,
        "transaction_fee_pct": 6,
        "max_students": 500,
        "max_storage_gb": 500,
        "max_streaming_hours": 500,
        "max_campaign_emails": 5000,
        "is_live_enabled": True,
    },
}


class Command(BaseCommand):
    help = "Seed the three canonical dev tenants (fitness/pilates/yoga), plan-scaled."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Tear down and recreate tenants that already exist.",
        )

    def handle(self, *args, **options):
        force = options["force"]

        for slug, tier, niche, depth in DEV_TENANTS:
            if Tenant.objects.filter(slug=slug).exists():
                if not force:
                    self.stdout.write(f"⊘ {slug} (already exists — pass --force to recreate)")
                    continue
                self._teardown(slug)

            self.stdout.write(self.style.NOTICE(f"\n→ Seeding {slug} ({tier} / {niche})"))
            self._seed_tenant(slug, tier, niche, depth)

        self.stdout.write(self.style.SUCCESS("\nDev tenants ready."))

    # ------------------------------------------------------------------
    # Teardown
    # ------------------------------------------------------------------

    def _teardown(self, slug):
        """Drop the tenant's schema + domain rows (mirrors seed_demo_tenant).

        PlatformSubscription.tenant is on_delete=CASCADE, so a plain
        ``tenant.delete()`` removes the row correctly — but Django's deletion
        collector, while resolving that cascade, ALSO walks
        PlatformSubscription's own reverse relations, including
        ``apps.billing.Payment.platform_subscription`` (on_delete=SET_NULL,
        deliberately ``db_constraint=False`` per that field's own comment,
        because it's a tenant-schema table). The collector's SET_NULL bulk
        UPDATE targets ``billing_payment`` unconditionally regardless of
        whether any row references it, and this command runs in the public
        schema (not the tenant's) — so that UPDATE fails with "relation
        billing_payment does not exist". Deleting any PlatformSubscription row
        via raw SQL first sidesteps the ORM collector for it entirely; the
        subsequent ``tenant.delete()`` then finds nothing left to cascade.
        """
        tenant = Tenant.objects.get(slug=slug)
        self.stdout.write(f"  Tearing down existing '{slug}'...")
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM core_platformsubscription WHERE tenant_id = %s", [tenant.id])
        Domain.objects.filter(tenant=tenant).delete()
        schema = tenant.schema_name
        tenant.delete()
        with connection.cursor() as cursor:
            cursor.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE")

    # ------------------------------------------------------------------
    # Plans
    # ------------------------------------------------------------------

    def _resolve_plan(self, tier):
        """Reuse the canonical PlatformPlan for this tier.

        ``starter``/``pro`` map to plans named exactly that (matching
        ``seed_plans``' rows) — a fresh/test DB has none of these yet, so
        get_or_create backfills a minimal plan row. ``free`` is different: the
        canonical free-tier plan is NOT named "free" — it's named
        ``settings.BILLING_FREE_PLAN_NAME`` (default "Free"), and it is always
        already seeded (by ``seed_plans`` and by migration
        ``0005_backfill_free_plan``), so we must reuse that exact row rather
        than get_or_create a second, duplicate lowercase "free" row. If it's
        somehow missing, let DoesNotExist surface — running this command
        without ``seed_plans`` having run first is a footgun that should fail
        loudly, not silently create a duplicate.
        """
        if tier == "free":
            free_name = getattr(settings, "BILLING_FREE_PLAN_NAME", "Free")
            return PlatformPlan.objects.get(name=free_name)
        plan, _ = PlatformPlan.objects.get_or_create(name=tier, defaults=_PLAN_DEFAULTS[tier])
        return plan

    # ------------------------------------------------------------------
    # Per-tenant seed
    # ------------------------------------------------------------------

    def _seed_tenant(self, slug, tier, niche, depth):
        data = load_niche(niche)
        tenant_data = data.TENANT

        plan = self._resolve_plan(tier)
        region = REGION_GLOBAL
        preferred_locale = REGION_DEFAULT_LOCALE.get(region, "en")
        owner_email = f"coach@{tenant_data['subdomain']}.test"

        tenant = Tenant.objects.create(
            name=tenant_data["name"],
            slug=slug,
            subdomain=tenant_data["subdomain"],
            schema_name=tenant_data["schema_name"],
            owner_email=owner_email,
            region=region,
            plan=plan,
            provisioning_status="ready",
            is_published=True,
            template_niche=niche,
        )

        # Host mirrors the marketing gallery: <subdomain>.<platform-domain>, so
        # tenants resolve in every environment (…​.localhost dev, …​.contentor.app prod).
        host = f"{tenant_data['subdomain']}.{settings.CONTENTOR_DOMAIN}"
        Domain.objects.create(domain=host, tenant=tenant, is_primary=True)

        tenant.create_schema(check_if_exists=True, verbosity=0)

        # Public-schema coach user + PlatformSubscription — mirrors real signup
        # provisioning (apps/core/tasks.py's provision_tenant, ~line 320) and the
        # admin plan-editor's _sync_platform_subscription
        # (apps/core/admin_panels.py, ~line 154). PlatformSubscription lives in
        # the public schema and its `user` FK must point at a public-schema
        # User row (distinct from the tenant-schema owner created below — same
        # email, separate row per django-tenants' dual-listed apps.accounts).
        # Without this, Tenant.has_paid_platform_plan (which checks
        # is_subscription_active — an actual PlatformSubscription row — NOT
        # Tenant.plan) stays False even for starter/pro tenants, silently
        # breaking every paid-tier feature gated on it (site assistant, mailbox
        # identity, logo studio, quotas, blog AI). Free tier deliberately gets
        # no subscription row — that IS the correct free-tier state per
        # is_subscription_active's own docstring.
        with schema_context("public"):
            coach_user, _ = User.objects.get_or_create(
                email=owner_email,
                region=region,
                defaults={
                    "name": f"{tenant_data['name']} Coach",
                    "role": "coach",
                    "preferred_locale": preferred_locale,
                    "accessible_regions": [],
                },
            )
            if not plan.is_free:
                PlatformSubscription.objects.create(
                    tenant=tenant,
                    user=coach_user,
                    plan=plan,
                    status=PlatformSubscription.STATUS_ACTIVE,
                    provider=PlatformSubscription.PROVIDER_MANUAL,
                )

        with tenant_context(tenant):
            # Real owner — mirrors the provision_tenant (apps/core/tasks.py) shape:
            # role="owner", is_staff=True, region stamped, unusable password
            # (login is passwordless / magic-link). The seeding helpers resolve
            # this owner from the tenant schema (role="owner") for instructor /
            # sender wiring, so it MUST exist before any content seeding.
            owner = User.objects.create_user(
                email=owner_email,
                name=f"{tenant_data['name']} Coach",
                role="owner",
                is_staff=True,
                region=region,
                preferred_locale=preferred_locale,
                accessible_regions=[],
            )

        # Content wiring — the helpers each open their own tenant_context and
        # re-query the tenant DB, so ORDER IS LOAD-BEARING (see module docstring).
        include_live = depth["include_live"]
        students = depth["students"]
        courses = depth["courses"]

        # 1. Photos first — config + courses + live events reference them by s3_key.
        seeding_helpers.seed_photos(tenant, niche)
        # 2. Config + courses — courses must exist before plans/bundles/purchases.
        seeding_helpers.seed_config(tenant, niche)
        seeding_helpers.seed_courses(tenant, niche, count=courses)
        # 3. Downloads, billing catalog, live events, students.
        seeding_helpers.seed_downloads(tenant, niche)
        seeding_helpers.seed_subscription_plans(tenant, niche)
        seeding_helpers.seed_bundles(tenant, niche)
        live_summary = seeding_helpers.seed_live_bundle(tenant, niche, include_live=include_live)
        seeding_helpers.seed_students(tenant, niche, count=students)
        # 4. Purchases/subscriptions/progress last — resolves students/courses/
        #    plans/bundles from the DB. pro_edge_cases (D8) adds one refunded
        #    Payment + one past_due Subscription on top, pro tier only.
        seeding_helpers.seed_purchases_and_progress(tenant, niche, pro_edge_cases=depth.get("pro_edge_cases", False))
        # 5. Mailbox — starter+pro only (skipped on free via mailbox=0); needs
        #    the real seeded students from step 3.
        mailbox_count = depth.get("mailbox", 0)
        if mailbox_count:
            seeding_helpers.seed_mailbox(tenant, count=mailbox_count)

        # 6. Community — starter+pro only (skipped on free via community=0); also
        #    needs the real seeded students from step 3. Order vs. mailbox doesn't
        #    matter (independent apps) — placed after it for readability.
        community_count = depth.get("community", 0)
        if community_count:
            seeding_helpers.seed_community(tenant, count=community_count)

        # 7. Notifications/announcements — light for starter, full for pro (skipped
        #    on free). Also needs the real seeded students from step 3; order vs.
        #    mailbox/community doesn't matter (independent apps).
        notifications_level = depth.get("notifications", "")
        if notifications_level:
            seeding_helpers.seed_notifications(tenant, level=notifications_level)

        # 8. Site assistant — starter+pro only (skipped on free via
        #    assistant=0), same 2-way gate as mailbox/community. Unlike those,
        #    it has no dependency on students/courses (config + knowledge
        #    entries + links only), so it doesn't need to sit after step 3 —
        #    kept here for readability alongside the other plan-gated features.
        assistant_count = depth.get("assistant", 0)
        if assistant_count:
            seeding_helpers.seed_assistant(tenant, count=assistant_count)

        # 9. Usage analytics — called unconditionally for all three tiers (no
        #    plan gate, unlike mailbox/community/notifications/assistant
        #    above); also needs the real seeded students from step 3.
        seeding_helpers.seed_usage(tenant)

        # 10. Filters + tags — also called unconditionally for all three tiers
        #    (no plan gate, per Task D5). Assigns filter/tag metadata onto the
        #    courses/downloads/photos/videos seeded in steps 2-3, so must come
        #    after those.
        seeding_helpers.seed_filters(tenant)
        seeding_helpers.seed_tags(tenant)

        # Calendar lanes: blog posts + email campaigns so /admin/calendar reads
        # as a realistic Live + Blog + Email mix.
        with tenant_context(tenant):
            calendar_content.seed_blog_posts(owner)
            calendar_content.seed_email_campaigns(owner)

        # 11. Blog autopilot + topic-idea queue — pro only (skipped on free
        #     AND starter via blog_extras=0, a stricter gate than
        #     assistant/mailbox/community's starter+pro 2-way gate). Builds on
        #     top of the BlogPosts just seeded above but has no hard query
        #     dependency on them, so placed here purely for readability
        #     (topic ideas are conceptually "queued next" after the post
        #     backlog).
        blog_extras_count = depth.get("blog_extras", 0)
        if blog_extras_count:
            seeding_helpers.seed_blog_extras(tenant, count=blog_extras_count)

        live_total = sum(live_summary.values())
        self.stdout.write(
            f"  ✓ {slug}: {courses} courses, {students} students, {live_total} live events, published at {host}"
        )
