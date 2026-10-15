# ruff: noqa: E501 (her content is long sentences)
"""Seed the footage coach: Mara Lindqvist on ``maralindqvist.<domain>``, the
lived-in yoga school the landing's product footage is recorded on
(scripts/footage/record.ts).

Every screen the camera visits has content in her voice: five courses, a
weekly live class, sixty students with three months of sales and progress, a
busy community, an inbox, articles and campaigns. Her public site is composed
by the real composer (the agent hub; ``--no-compose`` keeps the skeleton
pages) and a Stripe test-mode account is attached so checkout works.

Always rebuilds the tenant from scratch. Dev only. Students wear the faces in
static/footage_faces (AI headshots, one per name); her logo is static/footage_logo.webp. Photos are placeholders:
course, article and class covers reuse the photographs the composer placed on
her site (the demo yoga set without it); the owner swaps them later.
"""

from __future__ import annotations

import io
import random
import re
import unicodedata
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.utils import timezone
from django_tenants.utils import schema_context, tenant_context

from apps.accounts.models import User
from apps.core.constants import REGION_GLOBAL
from apps.core.currency import tenant_charge_currency
from apps.core.management.commands.seed_dev_tenants import Command as DevTenants
from apps.core.models import Domain, PlatformSubscription, Tenant
from apps.core.onboarding import ai_compose
from apps.core.onboarding import site_composer as sc
from apps.core.onboarding.compose import build_config_overrides
from apps.core.tasks import _create_default_config
from apps.demo_seed import seeding_helpers

SLUG = "maralindqvist"
BRAND = "Mara Lindqvist"
OWNER_EMAIL = f"mara@{SLUG}.test"
TZ = ZoneInfo("Europe/Stockholm")
FEE = Decimal("0.06")  # Pro plan transaction fee

# The site-eval yoga brief (e2e/fixtures/site-eval-briefs.json), in wizard answers.
DESCRIPTION = (
    "I teach slow vinyasa and yin to people who sit at a desk all day. Most of my students arrive stiff, "
    "tired and a little intimidated by yoga. My classes are 45 minutes, built around the hips, spine and "
    "shoulders, with plenty of options for tight bodies."
)
ANSWERS = {
    "niche": "yoga",
    "description": DESCRIPTION,
    "description_followups": {
        "items": [
            {
                "q": "Who is your ideal student?",
                "a": "Office workers in their 30s to 50s, mostly women, who have tried a gym class and felt out of place.",
            }
        ]
    },
    "goals": ["sell_courses", "run_live_classes", "build_community"],
    "style": "journal",
}

# Placeholders until the owner picks photographs (mirrored into dev MinIO).
PHOTO_KEYS = [f"demo/photos/yoga_{n}.jpg" for n in (1, 2, 3, 6, 7, 8, 9, 10)] + [
    f"demo/photos/pilates_{n}.jpg" for n in (1, 2, 4, 5)
]
VIDEO_KEYS = [f"demo/videos/yoga_{n}.mp4" for n in range(1, 6)]

# (title, price, description, module, [(lesson, seconds, note)])
COURSES = [
    (
        "Desk Reset",
        0,
        "Ten minutes a day to undo the chair: neck, upper back and hips, at your desk or on the floor beside it.",
        "The daily reset",
        [
            ("Why your hips hate your chair", 400, "What eight hours of sitting does to the front of the hips."),
            ("Neck and shoulders, at the desk", 560, "Five movements you can do without leaving your seat."),
            ("Wake up the upper back", 605, "Gentle extension for a spine that curls forward all day."),
            ("The two-minute hip opener", 270, "The one to do between meetings."),
            ("A breath that ends the workday", 430, "Three minutes of slow breathing to close the laptop for real."),
            ("Your ten-minute routine", 705, "Everything together, start to finish."),
        ],
    ),
    (
        "Hips & Hamstrings in 4 Weeks",
        49,
        "A four-week plan for hips and hamstrings that have been sitting for years. Twenty minutes a day, no forcing.",
        "Four weeks, step by step",
        [
            ("Where tight hips come from", 480, "Why stretching harder is not the answer."),
            ("Week 1: the gentle floor sequence", 1210, "Lying down, supported, nothing to prove."),
            ("Week 2: lunges with support", 1150, "Low lunges with a chair and blocks."),
            ("Week 2: hamstrings without forcing", 1080, "Folding forward with bent knees and patience."),
            ("Week 3: pigeon, and kinder versions of it", 1320, "Three ways into pigeon, one for every hip."),
            ("Week 3: the long yin hold", 1500, "Five-minute holds that let the hips let go."),
            ("Week 4: putting it together", 1260, "A flowing sequence from everything so far."),
            ("Week 4: your 30-minute flow", 1830, "The practice to keep once the four weeks are over."),
        ],
    ),
    (
        "A Kinder Back",
        59,
        "Seven lessons for a lower back that aches by evening: mobility, gentle strength and what to do on a bad day.",
        "Back care",
        [
            ("Understanding your lower back", 540, "What the ache is telling you, in plain words."),
            ("Cat, cow and everything between", 760, "Moving the spine one segment at a time."),
            ("A core that supports, not grips", 920, "Deep core work you can do lying down."),
            ("Twists for a stiff spine", 840, "Seated and lying twists, small and slow."),
            ("Bridges and backbends, slowly", 980, "Building the back of the body without strain."),
            ("When your back flares up", 610, "A short sequence for the days it hurts."),
            ("A 25-minute back care practice", 1500, "The whole course in one practice."),
        ],
    ),
    (
        "Slow Flow for Better Sleep",
        39,
        "Evening practices that slow a racing mind: a gentle flow, yin and breathing to fall asleep to.",
        "Evenings",
        [
            ("Why evening practice is different", 420, "Less effort, longer holds, softer light."),
            ("Legs up the wall", 600, "The easiest pose there is, and why it works."),
            ("A slow flow for the end of the day", 1260, "Twenty minutes, one breath per movement."),
            ("Yin for a racing mind", 1380, "Long holds to quiet a busy head."),
            ("Breathing to fall asleep", 540, "The four-seven-eight breath, in bed."),
            ("Your 20-minute bedtime routine", 1200, "The practice to do before lights out."),
        ],
    ),
    (
        "Shoulders & Neck for Screen Days",
        29,
        "Short practices for the forward head, tight shoulders and the 3 pm neck ache.",
        "Screen days",
        [
            ("The forward-head habit", 450, "What the screen does to your neck, and how to notice it."),
            ("Opening the chest", 720, "Undoing the rounded shoulders of a laptop day."),
            ("Shoulder blades that move", 680, "Mobility for the upper back and shoulder blades."),
            ("Neck release, gently", 590, "Slow, small movements for a sore neck."),
            ("A 15-minute desk-side practice", 900, "Everything together, next to your desk."),
        ],
    ),
]

# Priya first: issue_login_token picks the first student, the one the camera follows.
STUDENTS = [
    "Priya Raghavan",
    "Lena Fischer",
    "Tomás Reyes",
    "Hannah Okafor",
    "Sofia Marchetti",
    "Daniel Weber",
    "Aiko Sato",
    "Grace Mensah",
    "Elena Petrova",
    "Marcus Hill",
    "Ingrid Berg",
    "Nadia Haddad",
    "Chloé Martin",
    "Ruth Adeyemi",
    "Julia Nowak",
    "Fatima Zahra",
    "Emma Lindgren",
    "Olivia Brooks",
    "Mei Chen",
    "Laura Gómez",
    "Sara Johansson",
    "Amara Diallo",
    "Katarzyna Wiśniewska",
    "Hélène Dubois",
    "Rachel Cohen",
    "Ana Ribeiro",
    "Freya Nilsson",
    "Zeynep Yılmaz",
    "Clara Weiss",
    "Isabel Navarro",
    "Mia Andersson",
    "Leila Karimi",
    "Charlotte Evans",
    "Yuki Tanaka",
    "Paula Costa",
    "Birgit Larsen",
    "Ewa Kowalczyk",
    "Nora Lindholm",
    "Maya Shapiro",
    "Lucía Fernández",
    "Tanya Ivanova",
    "Kirsten Holm",
    "Jonas Eriksson",
    "Ben Carter",
    "Stefan Novak",
    "Omar Farouk",
    "Henrik Dahl",
    "Lukas Meyer",
    "Astrid Sandberg",
    "Rosa Moreno",
    "Vera Hoffmann",
    "Anja Kraus",
    "Esther Mbeki",
    "Ines Duarte",
    "Lotte de Vries",
    "Selin Aksoy",
    "Camille Laurent",
    "Hanna Virtanen",
    "Agnes Holmberg",
    "Tara Singh",
]

# (student, subject, [(inbound?, hours ago, text)]); newest thread first.
INBOX = [
    (
        "Lena Fischer",
        "Sciatica and the hips course",
        [
            (
                True,
                30,
                "Hi Mara, I have mild sciatica on my left side. Is Hips & Hamstrings safe for me, or should I start with A Kinder Back?",
            ),
            (
                False,
                27,
                "Hi Lena, start with A Kinder Back for two weeks. Lessons 1 to 3 are gentle on the sciatic nerve. Skip deep forward folds for now, and tell me how it feels.",
            ),
            (True, 2, "Thank you! Starting tonight after work."),
        ],
    ),
    (
        "Tomás Reyes",
        "Thursday replay?",
        [
            (True, 20, "I missed Thursday's slow flow because of a late meeting. Is there a replay?"),
            (
                False,
                19,
                "Yes: every live class is in your dashboard under Live classes, Past, within an hour of the class ending. Enjoy it!",
            ),
        ],
    ),
    (
        "Hannah Okafor",
        "A membership as a gift",
        [
            (True, 50, "Can I buy a membership as a birthday present for my sister?"),
            (False, 46, "What a lovely idea. Tell me her name and I'll set it up with a note from you."),
            (True, 44, "Her name is Anna, same surname. Thank you so much!"),
        ],
    ),
    (
        "Sofia Marchetti",
        "Thank you",
        [
            (
                True,
                70,
                "Six weeks of Desk Reset and the neck ache I used to get every Friday is gone. I didn't think ten minutes could do that. Thank you.",
            ),
            (
                False,
                66,
                "Sofia, this made my week. Ten minutes every day beats an hour once a month, and you did the work.",
            ),
        ],
    ),
    (
        "Daniel Weber",
        "Is this okay for a stiff man?",
        [
            (True, 96, "Most people in the photos are women. Are the classes okay for a very stiff 48-year-old man?"),
            (
                False,
                90,
                "Absolutely. A third of Thursday's class are men, and the stiffest bodies get the most out of it. Every pose has a version with a chair or a block.",
            ),
        ],
    ),
    (
        "Aiko Sato",
        "Pausing my membership",
        [
            (True, 130, "I'm travelling for three weeks in November. Can I pause instead of cancelling?"),
            (
                False,
                125,
                "Of course. I've paused it from 1 to 22 November: nothing will be charged, and your progress stays where it is.",
            ),
        ],
    ),
    (
        "Grace Mensah",
        "Which mat do you use?",
        [
            (True, 170, "Which mat do you use in the videos? Mine slides on my wooden floor."),
            (False, 160, "I use a 4 mm natural rubber mat. Anything rubber rather than PVC will stop the sliding."),
        ],
    ),
]

# (author or None for Mara, hours ago, body, pinned, [(commenter or None, body)], reactions)
COMMUNITY = [
    (
        None,
        330,
        "Welcome! Tell us where you sit all day and which part of you complains first. I'll start: kitchen table, left hip.",
        True,
        [
            ("Priya Raghavan", "Open-plan office. My neck, by 3 pm."),
            ("Daniel Weber", "A car. I drive for work, so hips and hamstrings."),
            ("Ingrid Berg", "Home office, lower back. Every single day."),
            ("Mei Chen", "Standing desk that I never stand at. Shoulders."),
        ],
        24,
    ),
    (
        "Priya Raghavan",
        3,
        "Day 10 of Desk Reset. I did the two-minute hip opener in a meeting room between calls and nobody noticed 😄",
        False,
        [
            ("Hannah Okafor", "The meeting-room yoga club! I'm in."),
            (None, "This is exactly what it's for. Proud of you, Priya."),
        ],
        17,
    ),
    (
        "Elena Petrova",
        9,
        "Does anyone else feel emotional in the long yin holds? Week 3 got me.",
        False,
        [
            ("Sofia Marchetti", "Every time. Mara says the hips hold a lot."),
            ("Julia Nowak", "Yes! I thought it was just me."),
            (None, "Completely normal. Stay with the breath, and let it pass."),
        ],
        12,
    ),
    (
        "Daniel Weber",
        22,
        "First live class as the stiffest man in the room. Survived. Coming back Thursday.",
        False,
        [
            ("Tomás Reyes", "Welcome, Daniel. It gets easier, I promise."),
        ],
        15,
    ),
    (
        None,
        30,
        "New this week: a 15-minute shoulders and neck practice for screen days. It's lesson 5 of Shoulders & Neck.",
        False,
        [],
        11,
    ),
    (
        "Lena Fischer",
        46,
        "Pigeon pose is still my nemesis, but the version with the block finally works. Small win.",
        False,
        [
            ("Rachel Cohen", "Small wins are the whole game."),
        ],
        9,
    ),
    (
        "Hannah Okafor",
        70,
        "Question: do you do the bedtime routine before or after brushing your teeth? Asking for my overthinking brain.",
        False,
        [
            ("Freya Nilsson", "After! Then straight to bed."),
            ("Nadia Haddad", "Before, so I'm not tempted to scroll."),
        ],
        8,
    ),
    (
        "Sofia Marchetti",
        90,
        "Six weeks in: no more Friday neck ache. If you're on the fence about doing it daily, do it daily.",
        False,
        [
            ("Chloé Martin", "Needed to hear this today."),
        ],
        21,
    ),
    (
        "Aiko Sato",
        120,
        "Practising from a hotel room in Osaka this week. A rolled towel works as a block.",
        False,
        [],
        10,
    ),
    (
        None,
        140,
        "Saturday's mat class in Vasastan has 6 spots left. Bring a friend who sits too much.",
        False,
        [
            ("Ingrid Berg", "Booked, and bringing my colleague!"),
        ],
        7,
    ),
    (
        "Tomás Reyes",
        170,
        "Thursday's slow flow was exactly what I needed after this week. Legs up the wall is now part of my evening.",
        False,
        [],
        13,
    ),
    (
        "Grace Mensah",
        200,
        "Switched to a rubber mat on Mara's advice. No more sliding. Thanks for the recommendations, everyone.",
        False,
        [],
        6,
    ),
    (
        "Priya Raghavan",
        240,
        "Week 3 of Hips & Hamstrings: I can touch my shins standing up. Two weeks ago it was my knees.",
        False,
        [
            ("Laura Gómez", "That's huge, congratulations!"),
        ],
        19,
    ),
    ("Marcus Hill", 300, "Bought A Kinder Back after my physio suggested yoga. Lesson 3 is gold.", False, [], 5),
]

# (title, days ago or None for a draft, excerpt, [paragraphs])
ARTICLES = [
    (
        "Why your hips feel tight after a day at the desk",
        4,
        "Sitting shortens the front of the hips. Here is what that means, and the two-minute fix.",
        [
            "Eight hours in a chair keep your hip flexors short and your glutes switched off. By evening the front of the hips feels like a rubber band pulled tight.",
            "Stretching harder rarely helps. What helps is moving the hips through their whole range, gently, every day.",
            "Try this tonight: a low lunge with your back knee on a cushion, one minute each side, breathing slowly. Then lie on your back with your knees bent and let them sway side to side.",
        ],
    ),
    (
        "Ten minutes a day beats an hour on Sunday",
        11,
        "Why a short daily practice changes a stiff body faster than one long class.",
        [
            "Your body adapts to what you do most often. One long class a week is lovely, but the other six days of sitting win.",
            "Ten minutes a day is enough to remind your hips, spine and shoulders how to move.",
            "Pick a fixed moment: after the last meeting, before dinner, or before bed. Same time, same mat, every day.",
        ],
    ),
    (
        "A kinder way to stretch your lower back",
        18,
        "Five gentle movements for a lower back that aches by evening.",
        [
            "A sore lower back usually wants movement, not force.",
            "Start on hands and knees with cat and cow, slowly. Then a child's pose with your knees wide, and a lying twist to each side.",
            "Finish with your legs on a chair for three minutes. Let the floor hold your back.",
        ],
    ),
    (
        "Legs up the wall: the easiest pose for better sleep",
        25,
        "The simplest evening practice there is, and why it calms a busy mind.",
        [
            "Lie on your back with your legs resting up a wall. That's the whole pose.",
            "It lets the legs drain after a day of sitting and slows the breath without trying.",
            "Stay for five minutes before bed. If your hamstrings complain, move a little further from the wall.",
        ],
    ),
    (
        "What to do when your neck aches by 3 pm",
        33,
        "The forward-head habit, and three movements you can do at your desk.",
        [
            "Most afternoon neck ache comes from the head drifting forward toward the screen.",
            "Every hour, slide your chin back gently, roll your shoulders back three times and look over each shoulder.",
            "Raise your screen to eye level. It's the cheapest yoga prop you'll ever buy.",
        ],
    ),
    (
        "How to start yoga when you feel stiff and out of place",
        41,
        "You don't need to be flexible to start. You need a class built for where you are.",
        [
            "Many of my students tried a gym class once and felt like the stiffest person in the room. They were often right, and that's exactly why they belong here.",
            "Start with short practices, use props without shame, and skip anything that hurts.",
            "Flexibility is a result, not an entry requirement.",
        ],
    ),
    (
        "Yin yoga for people who can't sit still",
        None,
        "Long holds for busy minds: how to make them bearable, then lovely.",
        [
            "Yin asks you to stay. For a busy mind, that is the hard part.",
            "Start with three-minute holds and a timer, so you stop checking the clock.",
        ],
    ),
]

# (subject, days ago (negative: scheduled ahead), recipients, summary)
CAMPAIGNS = [
    ("New on the blog: why your hips feel tight after work", 4, 312, "All students and subscribers"),
    ("Six spots left for Saturday's mat class", 9, 186, "Students in Stockholm"),
    ("Your four-week hips plan starts Monday", 16, 298, "All students and subscribers"),
    ("Your November practice calendar", -4, 0, "All students and subscribers"),
]


def _ascii(text):
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()


# One AI-generated headshot per student (Pix4Less), served as this app's static
# files: avatar_url is a 200-char field, too short for a signed storage URL.
FACES = Path(__file__).resolve().parents[2] / "static" / "footage_faces"
# Her mark: a Pix4Less logo (generated for her, a seated side bend), installed
# as a catalog pick lands so the header tints it and sets her name beside it.
LOGO_ASSET = "30eabd19-4829-4151-839e-68f9bc5a418f"
LOGO_FILE = FACES.parent / "footage_logo.webp"


def _face(name):
    slug = re.sub(r"[^a-z]+", "-", _ascii(name).lower()).strip("-")
    return f"{settings.STATIC_URL}footage_faces/{slug}.webp" if (FACES / f"{slug}.webp").exists() else ""


class Command(BaseCommand):
    help = "Rebuild the footage coach (Mara Lindqvist on maralindqvist.<domain>) for the landing's product footage."

    def add_arguments(self, parser):
        parser.add_argument("--no-compose", action="store_true", help="Keep skeleton pages (no agent hub needed).")

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_footage_coach is dev-only (DEBUG must be True).")
        self.rng = random.Random(7)  # noqa: S311 (same content every rebuild)
        self.now = timezone.now()

        dev = DevTenants(stdout=self.stdout, stderr=self.stderr)
        if Tenant.objects.filter(slug=SLUG).exists():
            dev._teardown(SLUG)
        tenant = self._create_tenant(dev._resolve_plan("pro"))

        with tenant_context(tenant):
            owner = User.objects.get(role="owner")
            photos = self._config_and_photos(tenant)
            courses = self._courses(owner, photos)
            self._plans_and_downloads(courses)
            self._live(owner, photos)
            students = self._students()
            self._sales_and_progress(tenant, students, courses)
            self._inbox(owner, students)
            self._community(owner, students)
            self._articles(owner, photos)
            self._campaigns(owner)
        seeding_helpers.seed_notifications(tenant, level="full")
        with tenant_context(tenant):
            from apps.notifications.models import Announcement

            Announcement.objects.update(
                title="New: a 15-minute practice for screen days",
                body="<p>Lesson 5 of Shoulders &amp; Neck is live: fifteen minutes next to your desk.</p>",
            )
        seeding_helpers.seed_assistant(tenant)
        seeding_helpers.seed_usage(tenant, days=30)
        seeding_helpers.seed_filters(tenant)
        seeding_helpers.seed_tags(tenant)
        seeding_helpers.seed_blog_extras(tenant)

        try:
            call_command("seed_connect_test", tenant=SLUG, stdout=self.stdout)
            # Stripe's checkout shows the account's name: hers, not the test data's URL.
            import stripe

            tenant.refresh_from_db()
            stripe.api_key = settings.STRIPE_SECRET_KEY
            stripe.Account.modify(
                tenant.stripe_account_id,
                business_profile={"name": BRAND, "url": f"https://{SLUG}.contentor.app"},
                settings={"payments": {"statement_descriptor": "MARA LINDQVIST YOGA"}},
            )
        except Exception as exc:  # no sk_test key or no network: checkout won't work, the rest does
            self.stderr.write(f"  ! Stripe test account not attached: {exc}")

        if options["no_compose"]:
            self.stdout.write("  skeleton pages kept (--no-compose)")
        elif not ai_compose.compose_available():
            self.stderr.write("  ! agent hub unavailable (make ai-check): skeleton pages kept")
        else:
            self.stdout.write("  composing her site with the real composer (a few minutes)...")
            sc.compose_site(tenant)
            self._covers_from_site(tenant)
        self._logo(tenant)  # after the covers: they reuse every non-demo photo
        cache.delete(f"tenant:{tenant.schema_name}:config")
        self._report(tenant)

    # ------------------------------------------------------------------

    def _create_tenant(self, plan):
        # A schema no Tenant row owns is an orphan from an aborted run.
        with connection.cursor() as cursor:
            cursor.execute(f"DROP SCHEMA IF EXISTS {connection.ops.quote_name(SLUG)} CASCADE")
        tenant = Tenant.objects.create(
            name=BRAND,
            slug=SLUG,
            subdomain=SLUG,
            schema_name=SLUG,
            owner_email=OWNER_EMAIL,
            region=REGION_GLOBAL,
            plan=plan,
            provisioning_status="ready",
            is_published=True,
            template_niche="yoga",
            wizard_state={"answers": ANSWERS},
        )
        Domain.objects.create(domain=f"{SLUG}.{settings.CONTENTOR_DOMAIN}", tenant=tenant, is_primary=True)
        tenant.create_schema(check_if_exists=True, verbosity=0)
        # Mirrors seed_dev_tenants: a paid plan needs the public coach + subscription row.
        with schema_context("public"):
            coach, _ = User.objects.get_or_create(
                email=OWNER_EMAIL,
                region=REGION_GLOBAL,
                defaults={"name": BRAND, "role": "coach", "accessible_regions": []},
            )
            PlatformSubscription.objects.create(
                tenant=tenant,
                user=coach,
                plan=plan,
                status=PlatformSubscription.STATUS_ACTIVE,
                provider=PlatformSubscription.PROVIDER_MANUAL,
            )
        with tenant_context(tenant):
            User.objects.create_user(
                email=OWNER_EMAIL,
                name=BRAND,
                role="owner",
                is_staff=True,
                region=REGION_GLOBAL,
                accessible_regions=[],
            )
        self.stdout.write(f"→ {SLUG}.{settings.CONTENTOR_DOMAIN} created")
        return tenant

    def _config_and_photos(self, tenant):
        from apps.media.models import Photo
        from apps.tenant_config.models import TenantConfig

        _create_default_config(tenant, "en")
        overrides = build_config_overrides(ANSWERS, brand_name=BRAND, landing_sections={})
        config = TenantConfig.objects.get()
        config.brand_name = BRAND
        config.navbar_config = overrides["navbar_config"]
        config.enabled_modules = overrides["enabled_modules"]
        config.style = "journal"
        config.pages = sc.skeleton_pages("journal", niche="yoga", brand_name=BRAND, description=DESCRIPTION)
        config.timezone = "Europe/Stockholm"
        config.meta_description = "Slow vinyasa and yin for people who sit at a desk all day."
        config.onboarding_completed = True
        config.setup_guide_dismissed = True
        config.save()
        return [
            Photo.objects.create(
                s3_key=key, title=f"Studio photo {i + 1}", file_size=self.rng.randint(400_000, 3_000_000)
            )
            for i, key in enumerate(PHOTO_KEYS)
        ]

    def _courses(self, owner, photos):
        from apps.courses.models import Course, Lesson, Module, Video

        courses = []
        for i, (title, price, description, module_title, lessons) in enumerate(COURSES):
            course = Course(
                instructor=owner,
                title=title,
                description=description,
                price=price,
                pricing_type="paid" if price else "free",
                is_published=True,
                order=i + 1,
                thumbnail=photos[i],
                thumbnail_url=photos[i].s3_key,
            )
            course.save()
            module = Module.objects.create(course=course, title=module_title, order=1)
            for j, (lesson, seconds, note) in enumerate(lessons):
                key = VIDEO_KEYS[(i + j) % len(VIDEO_KEYS)]
                video = Video.objects.create(title=lesson, s3_key=key, duration_seconds=seconds)
                Lesson.objects.create(
                    module=module,
                    title=lesson,
                    order=j + 1,
                    video=video,
                    video_url=key,
                    duration_seconds=seconds,
                    content_html=f"<p>{note}</p>",
                    is_free_preview=j == 0,
                )
            Course.objects.filter(pk=course.pk).update(created_at=self.now - timedelta(days=200 - 30 * i))
            courses.append(course)
        return courses

    def _plans_and_downloads(self, courses):
        from apps.billing.models import SubscriptionPlan, SubscriptionPlanAccess
        from apps.courses.models import Course
        from apps.downloads.models import DownloadFile

        course_ct = ContentType.objects.get_for_model(Course)
        for name, description, price, months in (
            ("Studio membership", "Every course and the weekly live classes.", "29.00", 1),
            ("Studio membership, yearly", "Every course and the weekly live classes, two months free.", "290.00", 12),
        ):
            plan = SubscriptionPlan.objects.create(
                name=name,
                description=description,
                price=Decimal(price),
                currency=tenant_charge_currency(),
                billing_interval_months=months,
                sort_order=months,
            )
            for course in courses[1:]:
                SubscriptionPlanAccess.objects.create(plan=plan, content_type=course_ct, object_id=course.pk)
        DownloadFile.objects.create(
            title="Desk reset card (printable)", file_url=PHOTO_KEYS[5], file_size=1_200_000, download_count=214
        )
        DownloadFile.objects.create(
            title="Bedtime routine checklist", file_url=PHOTO_KEYS[6], file_size=860_000, download_count=131
        )

    def _live(self, owner, photos):
        from apps.live.models import LiveClass, OnsiteEvent

        local = self.now.astimezone(TZ)

        def at(days, hour, minute=0):
            day = (local + timedelta(days=days)).date()
            return datetime(day.year, day.month, day.day, hour, minute, tzinfo=TZ)

        def event(model, title, description, when, minutes, photo, **extra):
            model.objects.create(
                title=title,
                description=description,
                instructor=owner,
                pricing_type="free",
                price=0,
                duration_minutes=minutes,
                thumbnail=photo,
                thumbnail_url=photo.s3_key,
                scheduled_at=when,
                status="ended" if when < self.now else "scheduled",
                **extra,
            )

        thursday = (3 - local.weekday()) % 7
        for week in range(-6, 7):
            when = at(thursday + 7 * week, 18, 30)
            event(
                LiveClass,
                f"Thursday slow flow, {when:%b %-d}",
                "Forty-five minutes of slow vinyasa for hips, spine and shoulders. Every level welcome.",
                when,
                45,
                photos[0],
            )
        tuesday = (1 - local.weekday()) % 7 or 7
        for week in range(4):
            event(
                LiveClass,
                "Lunchtime desk break",
                "Twenty minutes to reset your neck and back in the middle of the day.",
                at(tuesday + 7 * week, 12, 15),
                20,
                photos[1],
            )
        event(
            LiveClass,
            "Ask Mara: back care Q&A",
            "Bring your questions about stiff and sore backs. Live, with demonstrations.",
            at(thursday + 6, 19),
            40,
            photos[2],
        )
        event(
            OnsiteEvent,
            "Saturday mat class in Vasastan",
            "A small in-person class for hips and backs. Mats and blocks provided.",
            at((5 - local.weekday()) % 7 + 7, 10),
            75,
            photos[3],
            location="The Vasastan yoga room",
            address="Dalagatan 12, Stockholm",
            max_capacity=16,
        )

    def _students(self):
        return [
            User.objects.create_user(
                email=_ascii(f"{name.split()[0]}.{name.split()[-1][0]}@demo.test").lower(),
                name=name,
                role="student",
                avatar_url=_face(name),
            )
            for name in STUDENTS
        ]

    def _sales_and_progress(self, tenant, students, courses):
        """Members since up to five months ago (a payment a month), course
        purchases over the last hundred days, and progress through it all."""
        from apps.billing.models import Payment, PaymentItem, Subscription, SubscriptionPlan
        from apps.courses.models import Course, Enrollment, Lesson, Progress

        currency = tenant_charge_currency(tenant)
        course_ct = ContentType.objects.get_for_model(Course)
        monthly, yearly = SubscriptionPlan.objects.order_by("billing_interval_months")
        rng = self.rng

        def pay(student, amount, when, kind, course=None, subscription=None):
            amount = Decimal(amount)
            fee = (amount * FEE).quantize(Decimal("0.01"))
            payment = Payment.objects.create(
                student=student,
                payment_type=kind,
                status="completed",
                amount=amount,
                platform_fee=fee,
                submerchant_payout=amount - fee,
                currency=currency,
                provider="bypass",
                provider_payment_id=f"footage-{student.pk}-{when:%Y%m%d}-{kind}",
                subscription=subscription,
            )
            if course is not None:
                PaymentItem.objects.create(
                    payment=payment,
                    content_type=course_ct,
                    object_id=course.pk,
                    item_price=amount,
                    submerchant_payout=amount - fee,
                )
            Payment.objects.filter(pk=payment.pk).update(created_at=when)
            return payment

        def enroll(student, course, when, payment=None):
            enrollment, _ = Enrollment.objects.get_or_create(
                user=student, course=course, defaults={"payment_id": payment.pk if payment else None}
            )
            Enrollment.objects.filter(pk=enrollment.pk).update(enrolled_at=when)

        joined = {}
        for i, student in enumerate(students):
            if i < 34:  # members: 30 monthly, 4 yearly
                start = self.now - timedelta(days=rng.randint(8, 150), hours=rng.randint(0, 23))
                plan = monthly if i < 30 else yearly
                subscription = Subscription.objects.create(
                    student=student,
                    plan=plan,
                    billing_amount=plan.price,
                    billing_currency=currency,
                    status="active",
                    current_period_start=start,
                    current_period_end=start + timedelta(days=30 * plan.billing_interval_months),
                )
                when = start
                while when <= self.now:
                    pay(student, plan.price, when, "subscription", subscription=subscription)
                    last = when
                    when += timedelta(days=30 * plan.billing_interval_months)
                Subscription.objects.filter(pk=subscription.pk).update(
                    created_at=start,
                    current_period_start=last,
                    current_period_end=last + timedelta(days=30 * plan.billing_interval_months),
                )
                for course in courses[1:]:
                    enroll(student, course, start)
                joined[student.pk] = start
            if i >= 20:  # course buyers (some members bought before joining)
                for course in rng.sample(courses[1:], rng.choice([0, 1, 1, 2])):
                    when = self.now - timedelta(days=rng.uniform(0.2, 100))
                    payment = pay(student, course.price, when, "one_time", course=course)
                    enroll(student, course, when, payment)
                    joined[student.pk] = min(joined.get(student.pk, when), when)
            first = joined.setdefault(student.pk, self.now - timedelta(days=rng.randint(3, 160)))
            enroll(student, courses[0], first)
            # Seen in the last two weeks; four in ten use her site as an installed app.
            app = rng.random() < 0.4
            User.objects.filter(pk=student.pk).update(
                date_joined=first,
                last_login=max(first, self.now - timedelta(hours=rng.uniform(1, 330))),
                last_display_mode="pwa" if app else "browser",
                last_platform=rng.choice(["ios", "android"]) if app else "desktop",
                first_pwa_at=max(first, self.now - timedelta(days=rng.uniform(1, 28))) if app else None,
            )

        lessons = {
            c.pk: list(Lesson.objects.filter(module__course=c).order_by("module__order", "order")) for c in courses
        }
        camera = {courses[0].pk: 6, courses[1].pk: 5, courses[2].pk: 2}  # Priya's progress, on camera
        for enrollment in Enrollment.objects.select_related("user"):
            course_lessons = lessons[enrollment.course_id]
            if enrollment.user_id == students[0].pk:
                done = camera.get(enrollment.course_id, 0)
            else:
                done = rng.randint(0, len(course_lessons))
            for lesson in course_lessons[:done]:
                Progress.objects.create(
                    user=enrollment.user, lesson=lesson, completed=True, watched_seconds=lesson.duration_seconds
                )
            if done < len(course_lessons) and (enrollment.user_id == students[0].pk or rng.random() < 0.6):
                lesson = course_lessons[done]
                Progress.objects.create(
                    user=enrollment.user,
                    lesson=lesson,
                    watched_seconds=int(lesson.duration_seconds * rng.uniform(0.2, 0.8)),
                )

    def _inbox(self, owner, students):
        from apps.mailbox.models import Conversation, Message

        by_name = {s.name: s for s in students}
        for n, (name, subject, messages) in enumerate(INBOX):
            student = by_name[name]
            conversation = Conversation.objects.create(
                subject=subject, student=student, counterparty_email=student.email, counterparty_name=name
            )
            for inbound, hours, text in messages:
                message = Message.objects.create(
                    conversation=conversation,
                    direction="inbound" if inbound else "outbound",
                    from_email=student.email if inbound else owner.email,
                    to_email=owner.email if inbound else student.email,
                    text=text,
                    is_read=not (n == 0 and inbound),
                )
                when = self.now - timedelta(hours=hours)
                Message.objects.filter(pk=message.pk).update(created_at=when)
            Conversation.objects.filter(pk=conversation.pk).update(
                created_at=self.now - timedelta(hours=messages[0][1]),
                last_message_at=when,
                unread_count=1 if n == 0 and inbound else 0,
            )

    def _community(self, owner, students):
        from apps.community.models import REACTION_EMOJIS, Comment, CommunityMember, CommunitySettings, Post, Reaction

        settings_obj = CommunitySettings.load()
        settings_obj.is_enabled = True
        settings_obj.welcome_message = "Welcome! Tell us where you sit all day and which part of you complains first."
        settings_obj.save(update_fields=["is_enabled", "welcome_message"])

        by_name = {s.name: s for s in students}
        members = {
            user.pk: CommunityMember.objects.create(user=user, display_name=user.name, avatar_url=user.avatar_url)
            for user in [owner, *students[:40]]
        }
        pool = [members[s.pk] for s in students[:40]]

        def member(name):
            return members[owner.pk if name is None else by_name[name].pk]

        for author, hours, body, pinned, comments, reactions in COMMUNITY:
            posted = self.now - timedelta(hours=hours)
            post = Post.objects.create(author=member(author), body=body, is_pinned=pinned)
            for k, (commenter, text) in enumerate(comments):
                comment = Comment.objects.create(post=post, author=member(commenter), body=text)
                Comment.objects.filter(pk=comment.pk).update(
                    created_at=posted + timedelta(minutes=40 + 90 * k + self.rng.randint(0, 30))
                )
            for k, reactor in enumerate(self.rng.sample([m for m in pool if m != post.author], reactions)):
                Reaction.objects.create(member=reactor, post=post, emoji=REACTION_EMOJIS[k % 4])
            Post.objects.filter(pk=post.pk).update(
                created_at=posted, comment_count=len(comments), reaction_count=reactions
            )

    def _articles(self, owner, photos):
        from apps.blog.models import BlogPost, unique_slug

        for i, (title, days, excerpt, paragraphs) in enumerate(ARTICLES):
            written = self.now - timedelta(days=days if days is not None else 1)
            post = BlogPost.objects.create(
                title=title,
                slug=unique_slug(title),
                status="published" if days is not None else "draft",
                published_at=written if days is not None else None,
                created_by=owner,
                excerpt=excerpt,
                meta_description=excerpt,
                body_html="".join(f"<p>{p}</p>" for p in paragraphs),
                source="manual",
                cover_photo=photos[(i + 5) % len(photos)],
            )
            BlogPost.objects.filter(pk=post.pk).update(created_at=written)

    def _campaigns(self, owner):
        from apps.email_campaigns.models import CampaignStatus, EmailCampaign

        for i, (subject, days, recipients, summary) in enumerate(CAMPAIGNS):
            sent = days > 0
            EmailCampaign.objects.create(
                subject=subject,
                template_id=f"footage-tpl-{i}",
                template_name="Mara's newsletter",
                sender=owner,
                recipient_filter={"type": "all"},
                recipient_count=recipients,
                success_count=recipients,
                status=CampaignStatus.SENT if sent else CampaignStatus.SCHEDULED,
                sent_at=self.now - timedelta(days=days) if sent else None,
                scheduled_at=None if sent else self.now - timedelta(days=days),
                recipient_summary=summary,
            )

    def _covers_from_site(self, tenant):
        """Courses, articles and classes wear the photographs the composer
        placed on her site, so every frame shows the same photography."""
        from apps.blog.models import BlogPost
        from apps.courses.models import Course
        from apps.live.models import LiveClass, OnsiteEvent
        from apps.media.models import Photo

        with tenant_context(tenant):
            placed = list(Photo.objects.exclude(s3_key__startswith="demo/").order_by("id"))
            if not placed:
                return
            for i, course in enumerate(Course.objects.order_by("order")):
                photo = placed[i % len(placed)]
                Course.objects.filter(pk=course.pk).update(thumbnail=photo, thumbnail_url=photo.s3_key)
            for i, post in enumerate(BlogPost.objects.order_by("id")):
                BlogPost.objects.filter(pk=post.pk).update(cover_photo=placed[(i + 5) % len(placed)])
            for model in (LiveClass, OnsiteEvent):
                for i, event in enumerate(model.objects.order_by("id")):
                    photo = placed[(i + 2) % len(placed)]
                    model.objects.filter(pk=event.pk).update(thumbnail=photo, thumbnail_url=photo.s3_key)
            self.stdout.write(f"  covers: {len(placed)} site photographs reused")

    def _logo(self, tenant):
        from PIL import Image

        from apps.core.curated_images.cache import CONTENT_TYPE, tenant_key_for
        from apps.core.curated_logos.clean import clean_curated_png
        from apps.core.platform.uploads import _store_object
        from apps.media.models import Photo
        from apps.tenant_config.interview_milestones import apply_logo

        with tenant_context(tenant):
            body = clean_curated_png(LOGO_FILE.read_bytes(), "WEBP")
            width, height = Image.open(io.BytesIO(body)).size
            key = tenant_key_for(LOGO_ASSET)
            _store_object(key, io.BytesIO(body), CONTENT_TYPE)
            Photo.objects.create(
                s3_key=key,
                title="Seated side bend",
                content_type=CONTENT_TYPE,
                file_size=len(body),
                width=width,
                height=height,
            )
            apply_logo(tenant, {"logo": {"mode": "curated", "asset_id": LOGO_ASSET, "layout": "horizontal"}})

    def _report(self, tenant):
        from apps.billing.models import Payment, Subscription
        from apps.blog.models import BlogPost
        from apps.community.models import Post
        from apps.courses.models import Course, Progress
        from apps.email_campaigns.models import EmailCampaign
        from apps.live.models import LiveClass
        from apps.mailbox.models import Conversation

        with tenant_context(tenant):
            counts = {
                "courses": Course.objects.count(),
                "students": User.objects.filter(role="student").count(),
                "members": Subscription.objects.filter(status="active").count(),
                "sales": Payment.objects.count(),
                "sales (last 30 days)": Payment.objects.filter(created_at__gte=self.now - timedelta(days=30)).count(),
                "progress rows": Progress.objects.count(),
                "live classes": LiveClass.objects.count(),
                "conversations": Conversation.objects.count(),
                "community posts": Post.objects.count(),
                "articles": BlogPost.objects.count(),
                "campaigns": EmailCampaign.objects.count(),
            }
        for name, n in counts.items():
            self.stdout.write(f"  {name:22} {n}")
        empty = [name for name, n in counts.items() if not n]
        if empty:
            raise CommandError(f"empty on camera: {', '.join(empty)}")
        self.stdout.write(
            self.style.SUCCESS(
                f"\nReady: http://{SLUG}.{settings.CONTENTOR_DOMAIN}/ "
                f"(coach: issue_login_token --role coach --tenant {SLUG}; student: Priya Raghavan)"
            )
        )
