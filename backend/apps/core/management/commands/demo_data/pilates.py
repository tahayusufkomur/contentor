"""
Pilates Studio — demo data for the Contentor platform.

This module provides tenant configuration, branding, landing page sections,
and three complete courses with lessons for a pilates-themed demo tenant.
"""

TENANT = {
    "name": "Pilates Studio",
    "slug": "demo-pilates",
    "subdomain": "demo-pilates",
    "schema_name": "demo_pilates",
    "domain": "demo-pilates.contentor.localhost",
}

CONFIG = {
    "brand_name": "Pilates Studio",
    "theme": "ocean",
    "dark_mode_enabled": True,
    "font_family": "DM Sans",
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
            "headline": "Transform Your Body with Pilates",
            "subheadline": (
                "Build core strength, improve flexibility, and move with "
                "confidence. Join our studio and discover the power of "
                "mindful movement."
            ),
            "cta_text": "Browse Programs",
            "cta_href": "/courses",
            "bg_image_url": "demo/photos/pilates_4.jpg",
        },
        "about": {
            "enabled": True,
            "heading": "About Me",
            "body": (
                "Certified Pilates instructor with over 12 years of "
                "experience in mat and reformer Pilates. I specialise in "
                "helping people of all fitness levels build a strong, "
                "balanced body through precise, controlled movement — no "
                "gym required, just a mat and commitment."
            ),
            "image_url": "demo/photos/pilates_5.jpg",
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
                    "name": "Clara D.",
                    "text": (
                        "After just four weeks my posture improved "
                        "dramatically. The lessons are clear, well-paced, "
                        "and I can feel every muscle engaging properly."
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "Marco T.",
                    "text": (
                        "I was sceptical about online Pilates, but the "
                        "detailed cues and camera angles make it feel like "
                        "a private session. My back pain is finally gone!"
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "Hana Y.",
                    "text": (
                        "The Full Body Sculpt course pushed me in the best "
                        "way. I feel stronger, more flexible, and genuinely "
                        "look forward to every workout."
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
                        "All our courses are mat-based. You only need a "
                        "yoga or Pilates mat and enough space to lie down "
                        "and stretch your arms out. Optional props like a "
                        "resistance band are noted in individual lessons."
                    ),
                },
                {
                    "q": "Is Pilates suitable for beginners?",
                    "a": (
                        "Absolutely! The Pilates Fundamentals course starts "
                        "from scratch with breathing, alignment, and basic "
                        "movements. No prior experience is needed."
                    ),
                },
                {
                    "q": "Can I access the courses on mobile?",
                    "a": (
                        "Yes! The platform is fully responsive. You can "
                        "stream lessons on your phone, tablet, or computer "
                        "— perfect for practising anywhere."
                    ),
                },
                {
                    "q": "How long do I have access to the courses?",
                    "a": (
                        "Once you enrol, you get lifetime access to the "
                        "course material. Rewatch lessons as many times as "
                        "you like and progress at your own pace."
                    ),
                },
            ],
        },
        "cta": {
            "enabled": True,
            "heading": "Ready to Feel Stronger?",
            "button_text": "Join Now",
            "button_href": "/courses",
        },
    },
}

COURSES = [
    {
        "title": "Pilates Fundamentals",
        "description": (
            "A beginner-friendly introduction to the core principles of "
            "Pilates. Learn proper breathing, spinal alignment, and the "
            "essential mat exercises that form the foundation of every "
            "Pilates practice — no experience required."
        ),
        "pricing_type": "free",
        "price": 0,
        "order": 1,
        "is_published": True,
        "thumbnail_url": "demo/photos/pilates_1.jpg",
        "module_title": "Getting Started",
        "lessons": [
            {
                "title": "Introduction to Pilates",
                "order": 1,
                "video_url": "demo/videos/pilates_1.mp4",
                "duration_seconds": 420,
                "is_free_preview": True,
                "content_html": (
                    "<p>Welcome to the world of Pilates! In this opening "
                    "lesson we explore the method created by Joseph Pilates "
                    "and understand why breath, control, and precision "
                    "matter.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Understand the six principles of Pilates: "
                    "concentration, control, centering, flow, precision, "
                    "and breathing</li>"
                    "<li>Learn lateral thoracic breathing for core "
                    "engagement</li>"
                    "<li>Set up your mat space for safe, focused "
                    "training</li></ul>"
                ),
            },
            {
                "title": "Pelvic Placement & Neutral Spine",
                "order": 2,
                "video_url": "demo/videos/pilates_2.mp4",
                "duration_seconds": 360,
                "is_free_preview": False,
                "content_html": (
                    "<p>Finding neutral spine and understanding pelvic "
                    "placement is essential for every Pilates exercise. "
                    "We will practise imprint and neutral positions so "
                    "you can protect your lower back during movement.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Identify neutral spine and imprint positions</li>"
                    "<li>Engage the deep stabilisers — transverse "
                    "abdominis and pelvic floor</li>"
                    "<li>Maintain correct pelvic placement during leg "
                    "movements</li></ul>"
                ),
            },
            {
                "title": "The Hundred",
                "order": 3,
                "video_url": "demo/videos/pilates_3.mp4",
                "duration_seconds": 380,
                "is_free_preview": False,
                "content_html": (
                    "<p>The Hundred is the classic Pilates warm-up that "
                    "fires up your core and gets the blood flowing. We "
                    "break it down step by step with modifications for "
                    "every level.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform the Hundred with correct breath "
                    "pattern</li>"
                    "<li>Scale the exercise using leg position "
                    "modifications</li>"
                    "<li>Maintain a stable torso while pumping the "
                    "arms</li></ul>"
                ),
            },
            {
                "title": "Roll-Up & Roll-Down",
                "order": 4,
                "video_url": "demo/videos/pilates_4.mp4",
                "duration_seconds": 400,
                "is_free_preview": False,
                "content_html": (
                    "<p>The Roll-Up builds spinal articulation and deep "
                    "abdominal strength. Learn to peel your spine off the "
                    "mat one vertebra at a time for a smooth, controlled "
                    "movement.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Articulate the spine sequentially during the "
                    "roll-up</li>"
                    "<li>Use the breath to deepen abdominal "
                    "engagement</li>"
                    "<li>Apply modifications if hamstring tightness "
                    "limits range</li></ul>"
                ),
            },
            {
                "title": "Beginner Mat Flow",
                "order": 5,
                "video_url": "demo/videos/pilates_5.mp4",
                "duration_seconds": 540,
                "is_free_preview": False,
                "content_html": (
                    "<p>Time to put it all together! This lesson links "
                    "every fundamental exercise into a flowing 20-minute "
                    "mat sequence that you can practise daily.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Connect exercises with smooth transitions</li>"
                    "<li>Maintain breath-movement coordination throughout "
                    "the flow</li>"
                    "<li>Build a daily practice habit with a ready-made "
                    "routine</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "Core Strength",
        "description": (
            "Take your Pilates practice deeper with targeted core work. "
            "This course focuses on the powerhouse — obliques, deep "
            "abdominals, and back extensors — to build the strength and "
            "stability that powers every movement."
        ),
        "pricing_type": "paid",
        "price": 39,
        "order": 2,
        "is_published": True,
        "thumbnail_url": "demo/photos/pilates_2.jpg",
        "module_title": "Powerhouse Training",
        "lessons": [
            {
                "title": "Activating the Powerhouse",
                "order": 1,
                "video_url": "demo/videos/pilates_1.mp4",
                "duration_seconds": 450,
                "is_free_preview": True,
                "content_html": (
                    "<p>The powerhouse is the engine of Pilates. In this "
                    "lesson we target the deep core muscles — transverse "
                    "abdominis, multifidus, and pelvic floor — to build "
                    "a rock-solid centre.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Isolate and activate the deep core stabilisers"
                    "</li>"
                    "<li>Differentiate between bracing and hollowing "
                    "strategies</li>"
                    "<li>Apply powerhouse activation to every Pilates "
                    "exercise</li></ul>"
                ),
            },
            {
                "title": "Oblique Sculpt Series",
                "order": 2,
                "video_url": "demo/videos/pilates_2.mp4",
                "duration_seconds": 400,
                "is_free_preview": False,
                "content_html": (
                    "<p>Strong obliques improve rotation, side-bending, "
                    "and overall trunk stability. This lesson delivers a "
                    "targeted series of criss-cross, side plank, and "
                    "mermaid variations.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform criss-cross with proper form and "
                    "control</li>"
                    "<li>Build side plank endurance through progressive "
                    "variations</li>"
                    "<li>Integrate rotation safely without straining the "
                    "neck</li></ul>"
                ),
            },
            {
                "title": "Back Extensors & Spine Strength",
                "order": 3,
                "video_url": "demo/videos/pilates_3.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>A strong core includes the posterior chain. We "
                    "focus on swan, swimming, and back extension exercises "
                    "to balance your anterior core work and protect the "
                    "spine.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Execute swan dive with controlled spinal "
                    "extension</li>"
                    "<li>Perform the swimming exercise with opposite-limb "
                    "coordination</li>"
                    "<li>Balance flexion and extension for a healthy, "
                    "resilient spine</li></ul>"
                ),
            },
            {
                "title": "Plank & Stability Progressions",
                "order": 4,
                "video_url": "demo/videos/pilates_4.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Planks are the ultimate test of core integration. "
                    "We progress from forearm plank to leg pull front and "
                    "leg pull back, adding dynamic challenges to keep the "
                    "core guessing.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Hold a perfect plank with neutral alignment</li>"
                    "<li>Progress to dynamic plank variations with leg "
                    "lifts</li>"
                    "<li>Build endurance and anti-rotation strength</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Advanced Core Flow",
                "order": 5,
                "video_url": "demo/videos/pilates_5.mp4",
                "duration_seconds": 510,
                "is_free_preview": False,
                "content_html": (
                    "<p>Bring every core exercise together in an intense "
                    "30-minute flow. This session challenges your strength, "
                    "control, and endurance from start to finish.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Link core exercises into a seamless, challenging "
                    "flow</li>"
                    "<li>Maintain form and breath under fatigue</li>"
                    "<li>Track progress and set benchmarks for your core "
                    "strength</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "Full Body Sculpt",
        "description": (
            "A comprehensive Pilates programme that works every muscle "
            "group. Combine mat exercises with standing work, balance "
            "challenges, and flowing sequences to sculpt a lean, strong "
            "body from head to toe."
        ),
        "pricing_type": "paid",
        "price": 59,
        "order": 3,
        "is_published": True,
        "thumbnail_url": "demo/photos/pliates_3.jpg",
        "module_title": "Total Body Programme",
        "lessons": [
            {
                "title": "Lower Body Burn",
                "order": 1,
                "video_url": "demo/videos/pilates_1.mp4",
                "duration_seconds": 450,
                "is_free_preview": True,
                "content_html": (
                    "<p>Sculpt your glutes, inner thighs, and hamstrings "
                    "with this targeted lower-body session. We use "
                    "classic Pilates side-lying and bridge variations to "
                    "build lean muscle.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform side-lying leg series for inner and "
                    "outer thighs</li>"
                    "<li>Progress bridge variations for glute strength"
                    "</li>"
                    "<li>Maintain pelvic stability during single-leg "
                    "movements</li></ul>"
                ),
            },
            {
                "title": "Upper Body & Arms",
                "order": 2,
                "video_url": "demo/videos/pilates_2.mp4",
                "duration_seconds": 400,
                "is_free_preview": False,
                "content_html": (
                    "<p>Pilates is not just about the core — strong arms "
                    "and shoulders matter too. This lesson uses push-up "
                    "progressions, tricep dips, and arm circles to tone "
                    "and strengthen the upper body.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Execute the Pilates push-up with spinal "
                    "articulation</li>"
                    "<li>Build shoulder stability with arm circle "
                    "variations</li>"
                    "<li>Integrate upper-body work with core "
                    "engagement</li></ul>"
                ),
            },
            {
                "title": "Balance & Standing Pilates",
                "order": 3,
                "video_url": "demo/videos/pilates_3.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Take Pilates off the mat with standing balance "
                    "exercises that challenge proprioception, ankle "
                    "stability, and full-body coordination.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform single-leg balance sequences with "
                    "control</li>"
                    "<li>Improve proprioception through weight-shifting "
                    "drills</li>"
                    "<li>Apply Pilates alignment principles in a standing "
                    "position</li></ul>"
                ),
            },
            {
                "title": "Flexibility & Mobility",
                "order": 4,
                "video_url": "demo/videos/pilates_4.mp4",
                "duration_seconds": 390,
                "is_free_preview": False,
                "content_html": (
                    "<p>Strength without flexibility leads to imbalance. "
                    "This lesson combines dynamic stretching with Pilates "
                    "spine articulation exercises to restore range of "
                    "motion throughout the body.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Improve hip flexor and hamstring flexibility</li>"
                    "<li>Increase thoracic spine mobility with rotation "
                    "drills</li>"
                    "<li>Create a balanced body through targeted "
                    "stretching</li></ul>"
                ),
            },
            {
                "title": "Full Body Sculpt Flow",
                "order": 5,
                "video_url": "demo/videos/pilates_5.mp4",
                "duration_seconds": 600,
                "is_free_preview": False,
                "content_html": (
                    "<p>Everything comes together in this capstone lesson. "
                    "A complete 40-minute flow that hits every muscle "
                    "group — lower body, core, upper body, and balance — "
                    "for the ultimate Pilates workout.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform a polished full-body Pilates routine"
                    "</li>"
                    "<li>Transition seamlessly between mat and standing "
                    "exercises</li>"
                    "<li>Track your progress and build confidence in your "
                    "practice</li></ul>"
                ),
            },
        ],
    },
]

DOWNLOADS = [
    {
        "title": "Pilates Alignment Guide (PDF)",
        "file_url": "demo/photos/pilates_4.jpg",
        "file_size": 2_500_000,
        "download_count": 156,
        "pricing_type": "free",
    },
    {
        "title": "Core Activation Cheat Sheet",
        "file_url": "demo/photos/pilates_5.jpg",
        "file_size": 1_200_000,
        "download_count": 93,
        "pricing_type": "free",
    },
    {
        "title": "Weekly Pilates Schedule Planner",
        "file_url": "demo/photos/pilates_1.jpg",
        "file_size": 800_000,
        "download_count": 201,
        "pricing_type": "paid",
    },
]

STUDENTS = [
    {"email": "clara@demo.test", "name": "Clara Dubois"},
    {"email": "marco@demo.test", "name": "Marco Torres"},
    {"email": "hana@demo.test", "name": "Hana Yoshida"},
    {"email": "liam@demo.test", "name": "Liam O'Brien"},
    {"email": "priya@demo.test", "name": "Priya Sharma"},
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
        "name": "Complete Pilates Collection",
        "description": "All three courses at a discounted price. Build a strong foundation and sculpt your entire body.",
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
        "title": "Open Reformer Session",
        "description": "Bring your questions and we'll work through reformer fundamentals together.",
        "duration_minutes": 60,
        "pricing_type": "free",
        "price": 0,
    },
    {
        "title": "Core Blast LIVE",
        "description": "Intensive 45-minute core-focused Pilates session — bring a mat and water!",
        "duration_minutes": 45,
        "pricing_type": "paid",
        "price": 15,
    },
    {
        "title": "Form Check Q&A",
        "description": "Live feedback on your form and alignment for any Pilates exercise.",
        "duration_minutes": 45,
        "pricing_type": "paid",
        "price": 0,
    },
]

# Recurring weekly live class template — seed command creates instances for 8 weeks
RECURRING_LIVE_CLASS = {
    "title": "Weekly Mat Pilates",
    "description": "Our signature weekly mat Pilates class — open to all levels.",
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
        "title": "Friday Evening Stretch",
        "description": "Weekly community stretch stream — free for everyone!",
        "duration_minutes": 90,
        "pricing_type": "free",
        "price": 0,
    },
]

ZOOM_CLASSES = [
    {
        "title": "Private Coaching — Small Group",
        "description": "Intimate 4-person coaching session via Zoom. Camera on required.",
        "zoom_link": "https://zoom.us/j/1234567890",
        "duration_minutes": 60,
        "pricing_type": "paid",
        "price": 25,
    },
    {
        "title": "Beginner Orientation (Zoom)",
        "description": "Meet the instructor and get oriented before your first Pilates course.",
        "zoom_link": "https://zoom.us/j/9876543210",
        "duration_minutes": 60,
        "pricing_type": "free",
        "price": 0,
    },
]

ONSITE_EVENTS = [
    {
        "title": "Weekend Pilates Intensive",
        "description": "Full-day in-person workshop covering mat work, reformer basics, and recovery techniques.",
        "location": "Pilates Studio Istanbul",
        "address": "Cihangir Mah. Sıraselviler Cd. No:42, Beyoğlu, Istanbul",
        "max_capacity": 20,
        "duration_minutes": 240,
        "pricing_type": "paid",
        "price": 120,
    },
    {
        "title": "Community Mat Session",
        "description": "Free outdoor mat Pilates in the park — bring friends!",
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
        # Clara: bought Core Strength course, subscribed monthly, good progress
        "email": "clara@demo.test",
        "purchases": [1],
        "bundle_index": None,
        "subscription_plan_index": 0,
        "progress": [
            (0, 0, 420, True),
            (0, 1, 360, True),
            (0, 2, 300, False),
            (1, 0, 450, True),
            (1, 1, 200, False),
        ],
    },
    {
        # Marco: bought the bundle, fully completed fundamentals
        "email": "marco@demo.test",
        "purchases": [],
        "bundle_index": 0,
        "subscription_plan_index": None,
        "progress": [
            (0, 0, 420, True),
            (0, 1, 360, True),
            (0, 2, 380, True),
            (0, 3, 400, True),
            (0, 4, 540, True),
            (1, 0, 100, False),
        ],
    },
    {
        # Hana: annual subscriber, light progress
        "email": "hana@demo.test",
        "purchases": [],
        "bundle_index": None,
        "subscription_plan_index": 1,
        "progress": [
            (0, 0, 420, True),
            (2, 0, 200, False),
        ],
    },
    {
        # Liam: bought Full Body Sculpt course individually
        "email": "liam@demo.test",
        "purchases": [2],
        "bundle_index": None,
        "subscription_plan_index": None,
        "progress": [
            (2, 0, 450, True),
            (2, 1, 400, True),
            (2, 2, 420, True),
            (2, 3, 180, False),
        ],
    },
    {
        # Priya: free course only, no purchases
        "email": "priya@demo.test",
        "purchases": [],
        "bundle_index": None,
        "subscription_plan_index": None,
        "progress": [
            (0, 0, 420, True),
            (0, 1, 100, False),
        ],
    },
]
