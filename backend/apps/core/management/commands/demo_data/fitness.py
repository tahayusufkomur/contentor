"""
Fitness Academy — demo data for the Contentor platform.

This module provides tenant configuration, branding, landing page sections,
and three complete courses with lessons for a fitness-themed demo tenant.
"""

TENANT = {
    "name": "Fitness Academy",
    "slug": "demo-fitness",
    "subdomain": "demo-fitness",
    "schema_name": "demo_fitness",
    "domain": "demo-fitness.localhost",
}

CONFIG = {
    "brand_name": "Fitness Academy",
    "theme": "ember",
    "dark_mode_enabled": True,
    "font_family": "Inter",
    "onboarding_completed": True,
    "enabled_modules": [
        "courses",
        "live",
        "community",
        "downloads",
        "billing",
        "campaigns",
        "analytics",
        "pages",
    ],
    "navbar_config": {
        "links": [
            {"label": "Programs", "href": "/courses"},
            {"label": "Calendar", "href": "/calendar"},
            {"label": "About", "href": "/about"},
            {"label": "FAQ", "href": "/faq"},
        ],
        "cta": {"text": "Start Training", "href": "/courses"},
        "show_login": True,
    },
    "landing_sections": {
        "hero": {
            "enabled": True,
            "headline": "Transform Your Body, Elevate Your Life",
            "subheadline": (
                "Science-backed fitness programs designed to build strength, "
                "burn fat, and boost your confidence. Train anywhere, anytime "
                "with expert-led video workouts."
            ),
            "cta_text": "Browse Programs",
            "cta_href": "/courses",
            "bg_image_url": "demo/photos/fitness_6.jpg",
        },
        "about": {
            "enabled": True,
            "heading": "About Me",
            "body": (
                "Certified personal trainer and sports science graduate with "
                "over 8 years of coaching experience. I specialize in "
                "functional training, HIIT, and strength programming for all "
                "fitness levels. My mission is to make professional-grade "
                "training accessible to everyone — no gym required."
            ),
            "image_url": "demo/photos/fitness_7.jpg",
        },
        "courses": {
            "enabled": True,
            "heading": "Featured Programs",
        },
        "testimonials": {
            "enabled": True,
            "heading": "What Students Say",
            "items": [
                {
                    "name": "Marcus T.",
                    "text": (
                        "The Total Body Transformation program completely "
                        "changed my routine. I lost 12 kg in three months "
                        "and feel stronger than ever. The structured approach "
                        "kept me accountable every single day."
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "Sarah L.",
                    "text": (
                        "As a busy mom, I needed workouts I could do at home. "
                        "The HIIT Power Program fits perfectly into my "
                        "schedule — 30 minutes, maximum results. I have so "
                        "much more energy now!"
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "David K.",
                    "text": (
                        "The Strength & Conditioning course gave me the "
                        "foundation I was missing. My lifts have improved "
                        "dramatically and I finally understand proper form "
                        "and programming."
                    ),
                    "avatar_url": "",
                },
            ],
        },
        "faq": {
            "enabled": True,
            "heading": "Frequently Asked Questions",
            "items": [
                {
                    "q": "Do I need any equipment?",
                    "a": (
                        "The Total Body Transformation course requires no "
                        "equipment at all — just your bodyweight. The HIIT "
                        "and Strength programs recommend a set of dumbbells "
                        "and a resistance band, but we always show bodyweight "
                        "alternatives."
                    ),
                },
                {
                    "q": "I'm a complete beginner — is this for me?",
                    "a": (
                        "Absolutely! Each program includes form breakdowns "
                        "and beginner modifications for every exercise. "
                        "Start with the free Total Body Transformation "
                        "course and progress at your own pace."
                    ),
                },
                {
                    "q": "Can I access the workouts on my phone?",
                    "a": (
                        "Yes! The platform is fully responsive. Stream "
                        "lessons on your phone, tablet, or computer — "
                        "perfect for training at home, in the gym, or "
                        "while traveling."
                    ),
                },
                {
                    "q": "How long do I have access to the courses?",
                    "a": (
                        "Once you enroll, you get lifetime access to the "
                        "course material. Rewatch lessons as many times as "
                        "you like and train at your own pace."
                    ),
                },
            ],
        },
        "cta": {
            "enabled": True,
            "heading": "Ready to Start Training?",
            "button_text": "Join Now",
            "button_href": "/courses",
        },
    },
}

COURSES = [
    {
        "title": "Total Body Transformation",
        "description": (
            "A complete beginner-friendly program covering full-body fitness "
            "fundamentals. Learn proper form, build functional strength, and "
            "develop a sustainable training habit — no equipment needed."
        ),
        "pricing_type": "free",
        "price": 0,
        "order": 1,
        "is_published": True,
        "thumbnail_url": "demo/photos/fitness_1.jpg",
        "module_title": "Foundation",
        "lessons": [
            {
                "title": "Welcome to Your Fitness Journey",
                "order": 1,
                "video_url": "demo/videos/fitness_1.mp4",
                "duration_seconds": 360,
                "is_free_preview": True,
                "content_html": (
                    "<p>Welcome to Total Body Transformation! In this "
                    "opening lesson we set your training goals, discuss "
                    "nutrition basics, and prepare your body for the "
                    "program ahead.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Understand the principles of progressive overload "
                    "and adaptation</li>"
                    "<li>Learn how to set realistic and measurable fitness "
                    "goals</li>"
                    "<li>Set up your training space for safe and effective "
                    "workouts</li></ul>"
                ),
            },
            {
                "title": "Bodyweight Fundamentals",
                "order": 2,
                "video_url": "demo/videos/fitness_2.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Master the essential bodyweight movements that form "
                    "the foundation of every great training program. We "
                    "cover squats, push-ups, lunges, and planks with full "
                    "form breakdowns.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Execute a proper bodyweight squat with correct "
                    "depth and alignment</li>"
                    "<li>Perform push-ups with full range of motion and "
                    "core engagement</li>"
                    "<li>Hold a plank with proper spinal alignment for "
                    "60 seconds</li></ul>"
                ),
            },
            {
                "title": "Core Activation & Stability",
                "order": 3,
                "video_url": "demo/videos/fitness_3.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>A strong core is the foundation of all movement. "
                    "This lesson targets your deep stabilizers with "
                    "anti-rotation drills, dead bugs, and hollow body "
                    "progressions.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Activate the transverse abdominis and pelvic "
                    "floor for spinal stability</li>"
                    "<li>Perform dead bugs and bird dogs with precise "
                    "control</li>"
                    "<li>Progress from basic planks to hollow body holds"
                    "</li></ul>"
                ),
            },
            {
                "title": "Mobility & Recovery",
                "order": 4,
                "video_url": "demo/videos/fitness_4.mp4",
                "duration_seconds": 360,
                "is_free_preview": False,
                "content_html": (
                    "<p>Recovery is where results happen. Learn dynamic "
                    "stretching routines, foam rolling techniques, and "
                    "mobility flows that keep your joints healthy and "
                    "your muscles ready to perform.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform a 10-minute dynamic warm-up for any "
                    "workout</li>"
                    "<li>Use foam rolling to release tension in major "
                    "muscle groups</li>"
                    "<li>Build a post-workout stretching routine for "
                    "faster recovery</li></ul>"
                ),
            },
            {
                "title": "Full-Body Circuit Challenge",
                "order": 5,
                "video_url": "demo/videos/fitness_5.mp4",
                "duration_seconds": 540,
                "is_free_preview": False,
                "content_html": (
                    "<p>Put everything together in a high-energy full-body "
                    "circuit. This workout combines all the movements you "
                    "have learned into a 30-minute calorie-burning session.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Complete a structured circuit with proper rest "
                    "intervals</li>"
                    "<li>Maintain good form under fatigue throughout the "
                    "workout</li>"
                    "<li>Track your performance to measure progress over "
                    "time</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "HIIT Power Program",
        "description": (
            "High-intensity interval training designed to maximize fat burn "
            "and cardiovascular fitness in minimal time. Each session is "
            "under 30 minutes with scalable intensity for all levels."
        ),
        "pricing_type": "paid",
        "price": 49,
        "order": 2,
        "is_published": True,
        "thumbnail_url": "demo/photos/fitness_2.jpg",
        "module_title": "High Intensity",
        "lessons": [
            {
                "title": "HIIT Science & Warm-Up Protocol",
                "order": 1,
                "video_url": "demo/videos/fitness_1.mp4",
                "duration_seconds": 360,
                "is_free_preview": True,
                "content_html": (
                    "<p>Understand the science behind high-intensity "
                    "interval training and why it is one of the most "
                    "time-efficient methods for fat loss and cardio "
                    "fitness. We also cover the essential warm-up.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Understand work-to-rest ratios and how they "
                    "affect training outcomes</li>"
                    "<li>Perform a HIIT-specific dynamic warm-up to "
                    "prevent injury</li>"
                    "<li>Learn how to scale intensity using heart rate "
                    "zones</li></ul>"
                ),
            },
            {
                "title": "Tabata Blast",
                "order": 2,
                "video_url": "demo/videos/fitness_2.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Experience the classic Tabata protocol — 20 seconds "
                    "of all-out effort followed by 10 seconds of rest for "
                    "8 rounds. This lesson features four Tabata blocks "
                    "targeting the full body.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Execute explosive movements like jump squats and "
                    "burpees with proper form</li>"
                    "<li>Maintain maximum effort during each 20-second "
                    "work interval</li>"
                    "<li>Modify exercises to match your current fitness "
                    "level</li></ul>"
                ),
            },
            {
                "title": "EMOM Endurance Builder",
                "order": 3,
                "video_url": "demo/videos/fitness_3.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Every Minute On the Minute training builds both "
                    "strength and conditioning. Perform a set number of "
                    "reps at the top of each minute and rest for the "
                    "remainder before the next round begins.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Structure an EMOM workout for different fitness "
                    "goals</li>"
                    "<li>Pace yourself to maintain quality reps across "
                    "all rounds</li>"
                    "<li>Combine pushing, pulling, and lower-body moves "
                    "in one session</li></ul>"
                ),
            },
            {
                "title": "Plyometric Power",
                "order": 4,
                "video_url": "demo/videos/fitness_4.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Plyometrics train your fast-twitch muscle fibers "
                    "for explosive power. This lesson covers box jumps, "
                    "tuck jumps, plyo push-ups, and lateral bounds with "
                    "safe landing mechanics.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Land softly with proper knee tracking to protect "
                    "your joints</li>"
                    "<li>Build explosive power with progressive plyometric "
                    "drills</li>"
                    "<li>Integrate plyometrics into HIIT circuits for "
                    "maximum calorie burn</li></ul>"
                ),
            },
            {
                "title": "HIIT Finisher & Cool-Down",
                "order": 5,
                "video_url": "demo/videos/fitness_5.mp4",
                "duration_seconds": 540,
                "is_free_preview": False,
                "content_html": (
                    "<p>End the program with an intense full-body HIIT "
                    "finisher that tests everything you have built. "
                    "We close with a guided cool-down and recovery "
                    "stretching sequence.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Push through a 20-minute HIIT challenge with "
                    "confidence</li>"
                    "<li>Monitor your heart rate recovery as a measure "
                    "of improved fitness</li>"
                    "<li>Perform a structured cool-down to reduce muscle "
                    "soreness</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "Strength & Conditioning",
        "description": (
            "Build real-world strength with a structured progressive "
            "overload program. Learn compound lifts, unilateral training, "
            "and periodization principles used by professional athletes."
        ),
        "pricing_type": "paid",
        "price": 69,
        "order": 3,
        "is_published": True,
        "thumbnail_url": "demo/photos/fitness_3.jpg",
        "module_title": "Build Strength",
        "lessons": [
            {
                "title": "Principles of Strength Training",
                "order": 1,
                "video_url": "demo/videos/fitness_1.mp4",
                "duration_seconds": 390,
                "is_free_preview": True,
                "content_html": (
                    "<p>Strength training is more than lifting heavy — it "
                    "is about smart programming. This lesson covers "
                    "progressive overload, rep ranges, tempo, and how to "
                    "structure a training week.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Understand progressive overload and how to apply "
                    "it week over week</li>"
                    "<li>Choose the right rep ranges for strength versus "
                    "hypertrophy goals</li>"
                    "<li>Plan a balanced weekly training split</li></ul>"
                ),
            },
            {
                "title": "The Big Lifts — Squat & Deadlift",
                "order": 2,
                "video_url": "demo/videos/fitness_2.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>The squat and deadlift are the king and queen of "
                    "strength exercises. We break down every phase of "
                    "each lift with cues for safety and maximum force "
                    "production.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform a barbell back squat with proper depth "
                    "and bracing</li>"
                    "<li>Execute a conventional deadlift with a neutral "
                    "spine throughout</li>"
                    "<li>Identify and correct common form errors in both "
                    "lifts</li></ul>"
                ),
            },
            {
                "title": "Upper Body Pressing & Pulling",
                "order": 3,
                "video_url": "demo/videos/fitness_3.mp4",
                "duration_seconds": 450,
                "is_free_preview": False,
                "content_html": (
                    "<p>Balance your physique and prevent injury with "
                    "equal attention to pressing and pulling movements. "
                    "This lesson covers bench press, overhead press, "
                    "rows, and pull-up progressions.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Set up a safe bench press with proper shoulder "
                    "retraction</li>"
                    "<li>Build pulling strength with barbell rows and "
                    "pull-up progressions</li>"
                    "<li>Maintain a balanced push-to-pull ratio to "
                    "protect your shoulders</li></ul>"
                ),
            },
            {
                "title": "Unilateral & Accessory Work",
                "order": 4,
                "video_url": "demo/videos/fitness_4.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Single-leg and single-arm exercises fix muscle "
                    "imbalances and build stability. Learn Bulgarian "
                    "split squats, single-arm presses, and targeted "
                    "accessory work for weak points.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Identify and address left-right strength "
                    "imbalances</li>"
                    "<li>Perform Bulgarian split squats and single-leg "
                    "Romanian deadlifts</li>"
                    "<li>Program accessory exercises to support your "
                    "main lifts</li></ul>"
                ),
            },
            {
                "title": "Periodization & Program Design",
                "order": 5,
                "video_url": "demo/videos/fitness_5.mp4",
                "duration_seconds": 600,
                "is_free_preview": False,
                "content_html": (
                    "<p>Learn how to design your own training programs "
                    "using linear and undulating periodization. This "
                    "capstone lesson gives you the tools to keep "
                    "progressing for years to come.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Apply linear periodization to plan training "
                    "blocks of 4 to 6 weeks</li>"
                    "<li>Use deload weeks strategically to avoid "
                    "overtraining</li>"
                    "<li>Build a personalized 12-week strength program "
                    "from scratch</li></ul>"
                ),
            },
        ],
    },
]

DOWNLOADS = [
    {
        "title": "12-Week Training Plan (PDF)",
        "file_url": "demo/photos/fitness_8.jpg",
        "file_size": 2_500_000,
        "download_count": 198,
        "pricing_type": "free",
    },
    {
        "title": "Nutrition & Macro Guide",
        "file_url": "demo/photos/fitness_9.jpg",
        "file_size": 1_400_000,
        "download_count": 156,
        "pricing_type": "free",
    },
    {
        "title": "Advanced Periodization Templates",
        "file_url": "demo/photos/fitness_10.jpg",
        "file_size": 900_000,
        "download_count": 243,
        "pricing_type": "paid",
    },
]

STUDENTS = [
    {"email": "marcus@demo.test", "name": "Marcus Thompson"},
    {"email": "sarah@demo.test", "name": "Sarah Liu"},
    {"email": "david@demo.test", "name": "David Kowalski"},
    {"email": "jessica@demo.test", "name": "Jessica Rivera"},
    {"email": "ryan@demo.test", "name": "Ryan Patel"},
]

# ---------------------------------------------------------------------------
# Subscription plans offered by this coach
# ---------------------------------------------------------------------------

SUBSCRIPTION_PLANS = [
    {
        "name": "Monthly Pass",
        "description": "Access all subscription courses and live classes for one month.",
        "price": "49.00",
        "currency": "TRY",
        "sort_order": 1,
        # "access" lists course titles (by index in COURSES) that this plan unlocks
        "access_course_indices": [1, 2],
    },
    {
        "name": "Annual Pass",
        "description": "Full year of unlimited access — save 40% compared to monthly.",
        "billing_interval_months": 12,
        "price": "349.00",
        "currency": "TRY",
        "sort_order": 2,
        "access_course_indices": [1, 2],
    },
]

# ---------------------------------------------------------------------------
# Bundles
# ---------------------------------------------------------------------------

BUNDLES = [
    {
        "name": "Complete Fitness Collection",
        "description": "All three programs at a discounted price. Build your foundation and train like a pro.",
        "price": "79.00",
        "currency": "TRY",
        # Indices into COURSES
        "course_indices": [0, 1, 2],
    },
]

# ---------------------------------------------------------------------------
# Live classes & streams (seeded as past/scheduled events)
# ---------------------------------------------------------------------------

LIVE_CLASSES = [
    {
        "title": "Open Gym Session",
        "description": "Bring your questions and we'll work through exercises together.",
        "duration_minutes": 60,
        "pricing_type": "free",
        "price": 0,
    },
    {
        "title": "HIIT Bootcamp LIVE",
        "description": "Intense 45-minute HIIT session — bring a towel and water!",
        "duration_minutes": 45,
        "pricing_type": "paid",
        "price": 15,
    },
    {
        "title": "Form & Technique Q&A",
        "description": "Live feedback on your exercise form and technique.",
        "duration_minutes": 45,
        "pricing_type": "paid",
        "price": 0,
    },
]

# Recurring weekly live class template — seed command creates instances for 8 weeks
RECURRING_LIVE_CLASS = {
    "title": "Weekly Strength Class",
    "description": "Our signature weekly strength training class — open to all levels.",
    "duration_minutes": 60,
    "pricing_type": "free",
    "price": 0,
    "day_of_week": 2,  # Wednesday (0=Mon)
    "hour": 19,
    "minute": 0,
    "weeks": 8,
}

LIVE_STREAMS = [
    {
        "title": "Friday Night Workout Party",
        "description": "Weekly community stream — free for everyone!",
        "duration_minutes": 90,
        "pricing_type": "free",
        "price": 0,
    },
]

ZOOM_CLASSES = [
    {
        "title": "Personal Training — Small Group",
        "description": "Intimate 4-person coaching session via Zoom. Camera on required.",
        "zoom_link": "https://zoom.us/j/1234567890",
        "duration_minutes": 60,
        "pricing_type": "paid",
        "price": 25,
    },
    {
        "title": "Beginner Orientation (Zoom)",
        "description": "Meet the coach and get oriented before your first program.",
        "zoom_link": "https://zoom.us/j/9876543210",
        "duration_minutes": 60,
        "pricing_type": "free",
        "price": 0,
    },
]

ONSITE_EVENTS = [
    {
        "title": "Weekend Fitness Bootcamp",
        "description": "Full-day in-person bootcamp covering HIIT, strength, and mobility.",
        "location": "Fitness Hub Istanbul",
        "address": "Cihangir Mah. Sıraselviler Cd. No:42, Beyoğlu, Istanbul",
        "max_capacity": 20,
        "duration_minutes": 240,
        "pricing_type": "paid",
        "price": 120,
    },
    {
        "title": "Community Workout Meetup",
        "description": "Free outdoor workout session — bring friends!",
        "location": "Kadıköy Sahil Parkı",
        "address": "Caferağa Mah. Moda Cd. No:18, Kadıköy, Istanbul",
        "max_capacity": 50,
        "duration_minutes": 180,
        "pricing_type": "free",
        "price": 0,
    },
]

# ---------------------------------------------------------------------------
# Payments, subscriptions & progress generated for STUDENTS
#
# Format:
#   "purchases"    — list of course indices the student bought outright
#   "bundle_index" — index into BUNDLES the student purchased (or None)
#   "subscription" — plan index into SUBSCRIPTION_PLANS (or None)
#   "progress"     — list of (course_idx, lesson_idx, watched_seconds, completed)
# ---------------------------------------------------------------------------

STUDENT_BILLING = [
    {
        # Marcus: bought HIIT course, subscribed monthly, good progress
        "email": "marcus@demo.test",
        "purchases": [1],
        "bundle_index": None,
        "subscription_plan_index": 0,
        "progress": [
            (0, 0, 360, True),
            (0, 1, 420, True),
            (0, 2, 300, False),
            (1, 0, 360, True),
            (1, 1, 200, False),
        ],
    },
    {
        # Sarah: bought the bundle, fully completed Total Body Transformation
        "email": "sarah@demo.test",
        "purchases": [],
        "bundle_index": 0,
        "subscription_plan_index": None,
        "progress": [
            (0, 0, 360, True),
            (0, 1, 420, True),
            (0, 2, 480, True),
            (0, 3, 360, True),
            (0, 4, 540, True),
            (1, 0, 100, False),
        ],
    },
    {
        # David: annual subscriber, light progress
        "email": "david@demo.test",
        "purchases": [],
        "bundle_index": None,
        "subscription_plan_index": 1,
        "progress": [
            (0, 0, 360, True),
            (2, 0, 200, False),
        ],
    },
    {
        # Jessica: bought Strength & Conditioning course individually
        "email": "jessica@demo.test",
        "purchases": [2],
        "bundle_index": None,
        "subscription_plan_index": None,
        "progress": [
            (2, 0, 390, True),
            (2, 1, 480, True),
            (2, 2, 450, True),
            (2, 3, 180, False),
        ],
    },
    {
        # Ryan: free course only, no purchases
        "email": "ryan@demo.test",
        "purchases": [],
        "bundle_index": None,
        "subscription_plan_index": None,
        "progress": [
            (0, 0, 360, True),
            (0, 1, 100, False),
        ],
    },
]
