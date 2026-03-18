import importlib
import logging

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from django_tenants.utils import tenant_context

from apps.accounts.models import User
from apps.core.models import Domain, PlatformPlan, Tenant

logger = logging.getLogger(__name__)


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

        # Load niche data module
        try:
            data = importlib.import_module(
                f"apps.core.management.commands.demo_data.{niche}"
            )
        except ModuleNotFoundError:
            raise CommandError(f"No demo data module found for niche: {niche}")

        tenant_data = data.TENANT
        config_data = data.CONFIG
        courses_data = data.COURSES

        # Resolve owner email from CONTENTOR_SUPERUSERS
        superuser_emails = getattr(settings, "CONTENTOR_SUPERUSERS", [])
        if not superuser_emails:
            raise CommandError(
                "CONTENTOR_SUPERUSERS env var is empty. "
                "Need at least one email for the demo owner."
            )
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

        # Get pro plan
        try:
            pro_plan = PlatformPlan.objects.get(name="pro")
        except PlatformPlan.DoesNotExist:
            raise CommandError(
                "PlatformPlan 'pro' not found. Run seed_plans first."
            )

        # Create tenant
        tenant = Tenant.objects.create(
            name=tenant_data["name"],
            slug=slug,
            subdomain=tenant_data["subdomain"],
            schema_name=tenant_data["schema_name"],
            owner_email=owner_email,
            plan=pro_plan,
            provisioning_status="ready",
        )
        self.stdout.write(f"Created tenant: {tenant.name}")

        # Create domain
        Domain.objects.create(
            domain=tenant_data["domain"],
            tenant=tenant,
            is_primary=True,
        )
        self.stdout.write(f"Created domain: {tenant_data['domain']}")

        # Create schema
        tenant.create_schema(check_if_exists=True, verbosity=0)
        self.stdout.write(f"Created schema: {tenant.schema_name}")

        downloads_data = getattr(data, "DOWNLOADS", [])
        students_data = getattr(data, "STUDENTS", [])

        # Seed data inside tenant context
        with tenant_context(tenant):
            self._seed_config(config_data)
            owner = self._seed_owner(owner_email)
            courses = self._seed_courses(courses_data, owner)
            if downloads_data:
                self._seed_downloads(downloads_data)
            if students_data:
                self._seed_students(students_data, courses)

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDemo tenant ready at: {tenant_data['domain']}"
            )
        )

    def _seed_config(self, config_data):
        from apps.tenant_config.models import TenantConfig

        TenantConfig.objects.create(**config_data)
        self.stdout.write(f"Created TenantConfig: {config_data['brand_name']}")

    def _seed_owner(self, email):
        owner = User.objects.create_user(
            email=email,
            name="Demo Owner",
            role="owner",
            is_staff=True,
        )
        self.stdout.write(f"Created owner: {email}")
        return owner

    def _seed_courses(self, courses_data, instructor):
        from apps.courses.models import Course, Lesson, Module

        created_courses = []
        for course_data in courses_data:
            # Copy to avoid mutating the template data
            course_fields = {
                k: v for k, v in course_data.items()
                if k not in ("lessons", "module_title")
            }
            lessons_data = course_data["lessons"]
            module_title = course_data["module_title"]

            course = Course(instructor=instructor, **course_fields)
            course.save()

            module = Module.objects.create(
                course=course,
                title=module_title,
                order=1,
            )

            for lesson_data in lessons_data:
                Lesson.objects.create(module=module, **lesson_data)

            created_courses.append(course)
            self.stdout.write(
                f"  Course: {course.title} "
                f"({len(lessons_data)} lessons)"
            )
        return created_courses

    def _seed_downloads(self, downloads_data):
        from apps.downloads.models import DownloadFile

        for dl in downloads_data:
            DownloadFile.objects.create(**dl)
        self.stdout.write(f"  Downloads: {len(downloads_data)} files")

    def _seed_students(self, students_data, courses):
        from apps.courses.models import Enrollment

        students = []
        for s in students_data:
            user = User.objects.create_user(
                email=s["email"],
                name=s["name"],
                role="student",
            )
            students.append(user)

        # Enroll each student in random courses
        import random
        for student in students:
            # Each student enrolls in 1-3 courses
            enrolled_courses = random.sample(
                courses, k=min(random.randint(1, 3), len(courses))
            )
            for course in enrolled_courses:
                Enrollment.objects.create(user=student, course=course)

        total_enrollments = Enrollment.objects.count()
        self.stdout.write(
            f"  Students: {len(students)} users, "
            f"{total_enrollments} enrollments"
        )
