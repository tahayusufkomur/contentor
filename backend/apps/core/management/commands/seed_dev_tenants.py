"""Seed the one dev/test tenant: ``demo-yoga`` on the Pro plan, every feature on.

One tenant keeps manual testing simple: one coach (the owner) and one student
(Priya, who owns a course, a subscription and lesson progress), with sample
content for every feature — courses, downloads, live classes/streams, billing
catalog, mailbox, community, notifications, site assistant, blog + autopilot
queue, email campaigns, usage analytics, filters and tags. e2e runs against the
same tenant (``e2e/helpers/auth.ts``).

``--reset`` deletes every other tenant first, so dev and prod both end up with
exactly this one. Logins: in DEBUG, any email on a ``demo-*`` login page signs
in instantly; in prod, sign in as superadmin and use "Log in as" (tenant →
coach, coach → student).

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
from django.db import connection, transaction
from django_tenants.utils import schema_context, tenant_context

from apps.accounts.models import User
from apps.core.constants import REGION_DEFAULT_LOCALE, REGION_GLOBAL
from apps.core.models import Domain, PlatformPlan, PlatformSubscription, Tenant
from apps.demo_seed import calendar_content, seeding_helpers
from apps.demo_seed.registry import load_niche

# (slug, plan tier, niche key, depth config). The depth keys are the explicit
# count / on-off kwargs of the seeding helpers (no plan-limit enforcement here).
# One student on purpose — the login a tester uses — so ``pro_edge_cases`` (which
# would refund her purchase and put her subscription past_due) stays off.
DEV_TENANTS = [
    (
        "demo-yoga",
        "pro",
        "yoga",
        {
            "include_live": True,
            "students": 1,
            "courses": 10,
            "mailbox": 1,
            "community": 5,
            "notifications": "full",
            "assistant": 5,
            "blog_extras": 3,
            "pro_edge_cases": False,
        },
    ),
]

# Used only when the plan row does not exist yet (fresh / test DB); a seeded
# DB reuses the canonical row from `seed_plans`.
_PLAN_DEFAULTS = {
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
    help = "Seed the one dev/test tenant (demo-yoga, Pro); --reset removes every other tenant."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Tear down and recreate tenants that already exist.",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete every other tenant (schema + domains + row) first.",
        )

    def handle(self, *args, **options):
        force = options["force"]

        if options["reset"]:
            keep = {slug for slug, *_ in DEV_TENANTS}
            others = Tenant.objects.exclude(schema_name="public").exclude(slug__in=keep)
            for slug in list(others.values_list("slug", flat=True)):
                self._teardown(slug)

        for slug, tier, niche, depth in DEV_TENANTS:
            if Tenant.objects.filter(slug=slug).exists():
                if not force:
                    self.stdout.write(f"⊘ {slug} (already exists — pass --force to recreate)")
                    continue
                self._teardown(slug)

            self.stdout.write(self.style.NOTICE(f"\n→ Seeding {slug} ({tier} / {niche})"))
            self._seed_tenant(slug, tier, niche, depth)

        self.stdout.write(self.style.SUCCESS("\nDev tenant ready."))
        self._print_logins()

    def _print_logins(self):
        scheme = "http" if settings.DEBUG else "https"
        domain = settings.CONTENTOR_DOMAIN
        self.stdout.write(f"""
Logins
  superadmin  {scheme}://{domain}/admin  (CONTENTOR_SUPERUSERS account)
  coach       {scheme}://demo-yoga.{domain}/admin  coach@demo-yoga.test
  student     {scheme}://demo-yoga.{domain}/login  priya@demo.test
  DEBUG: any email on the demo-yoga login page signs in instantly.
  Prod: sign in as superadmin, then "Log in as" (tenant -> coach, coach -> student).""")

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
        # Atomic: a failed DROP must not leave the row deleted and the schema
        # orphaned. Quoted: signup-created schemas can contain hyphens.
        with transaction.atomic(), connection.cursor() as cursor:
            cursor.execute("DELETE FROM core_platformsubscription WHERE tenant_id = %s", [tenant.id])
            Domain.objects.filter(tenant=tenant).delete()
            schema = tenant.schema_name
            tenant.delete()
            cursor.execute(f"DROP SCHEMA IF EXISTS {connection.ops.quote_name(schema)} CASCADE")

    # ------------------------------------------------------------------
    # Plans
    # ------------------------------------------------------------------

    def _resolve_plan(self, tier):
        """Reuse the canonical PlatformPlan named ``tier`` (seeded by
        ``seed_plans``); a fresh/test DB gets a minimal row backfilled."""
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

        # A schema no Tenant row owns is an orphan (an aborted run, or a
        # transactional test's flush, which drops rows but not schemas); reusing
        # it would collide with its leftover users, so start clean.
        schema = tenant_data["schema_name"]
        if not Tenant.objects.filter(schema_name=schema).exists():
            with connection.cursor() as cursor:
                cursor.execute(f"DROP SCHEMA IF EXISTS {connection.ops.quote_name(schema)} CASCADE")

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
