"""
Yoga Studio — demo data for the Contentor platform.

This module provides tenant configuration, branding, landing page sections,
and three complete courses with lessons for a yoga-themed demo tenant.
"""

TENANT = {
    "name": "Yoga Studio",
    "slug": "demo-yoga",
    "subdomain": "demo-yoga",
    "schema_name": "demo_yoga",
    "domain": "demo-yoga.contentor.localhost",
}

CONFIG = {
    "brand_name": "Yoga Studio",
    "theme": "forest",
    "dark_mode_enabled": True,
    "font_family": "Nunito",
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
        "cta": {"text": "Start Your Practice", "href": "/courses"},
        "show_login": True,
    },
    "landing_sections": {
        "hero": {
            "enabled": True,
            "headline": "Find Your Balance Through Yoga",
            "subheadline": (
                "Transform your body and mind with guided yoga practices. "
                "Whether you're a complete beginner or an experienced yogi, "
                "our courses will deepen your practice and bring you peace."
            ),
            "cta_text": "Browse Programs",
            "cta_href": "/courses",
            "bg_image_url": "demo/photos/yoga_6.jpg",
        },
        "about": {
            "enabled": True,
            "heading": "About Me",
            "body": (
                "Certified yoga instructor with over 12 years of teaching "
                "experience in Hatha, Vinyasa, and Ashtanga traditions. "
                "I believe yoga is a journey of self-discovery — meeting "
                "yourself on the mat with compassion, breath, and intention."
            ),
            "image_url": "demo/photos/yoga_7.jpg",
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
                    "name": "Priya R.",
                    "text": (
                        "These classes changed my life. The beginner course "
                        "gave me a solid foundation, and now I practice every "
                        "morning before work. My flexibility and focus have "
                        "improved so much."
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "Sarah L.",
                    "text": (
                        "The Vinyasa Flow course is beautifully structured. "
                        "Each lesson builds on the last, and the cues are so "
                        "clear that I always feel safe pushing my edge."
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "Marcus T.",
                    "text": (
                        "I was skeptical about learning yoga online, but the "
                        "video quality and detailed alignment instructions "
                        "made it feel like a private session. Highly recommend!"
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
                    "q": "Do I need to be flexible to start yoga?",
                    "a": (
                        "Absolutely not! Flexibility is a result of yoga, not "
                        "a prerequisite. Our beginner course starts with "
                        "gentle movements and modifications so you can "
                        "practice safely at any level."
                    ),
                },
                {
                    "q": "What equipment do I need?",
                    "a": (
                        "A yoga mat is recommended but not required. You may "
                        "also find blocks and a strap helpful for certain "
                        "poses. Wear comfortable clothing that allows free "
                        "movement."
                    ),
                },
                {
                    "q": "Can I access the courses on mobile?",
                    "a": (
                        "Yes! The platform is fully responsive. You can "
                        "stream lessons on your phone, tablet, or computer "
                        "— perfect for practicing anywhere."
                    ),
                },
                {
                    "q": "How long do I have access to the courses?",
                    "a": (
                        "Once you enroll, you get lifetime access to the "
                        "course material. Rewatch lessons as many times as "
                        "you like and learn at your own pace."
                    ),
                },
            ],
        },
        "cta": {
            "enabled": True,
            "heading": "Ready to Begin Your Journey?",
            "button_text": "Join Now",
            "button_href": "/courses",
        },
    },
}

COURSES = [
    {
        "title": "Yoga for Beginners",
        "description": (
            "A gentle introduction to the foundations of yoga. Learn proper "
            "alignment, essential poses, breathing techniques, and how to "
            "build a sustainable daily practice — no experience required."
        ),
        "pricing_type": "free",
        "price": 0,
        "order": 1,
        "is_published": True,
        "thumbnail_url": "demo/photos/yoga_1.jpg",
        "module_title": "Getting Started",
        "lessons": [
            {
                "title": "Welcome to Yoga",
                "order": 1,
                "video_url": "demo/videos/yoga_1.mp4",
                "duration_seconds": 420,
                "is_free_preview": True,
                "content_html": (
                    "<p>Welcome to your yoga journey! In this opening lesson "
                    "we explore the philosophy behind yoga, set intentions "
                    "for your practice, and learn how to create a calm, "
                    "focused space on your mat.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Understand the origins and core principles of "
                    "yoga</li>"
                    "<li>Learn diaphragmatic breathing (Ujjayi Pranayama) "
                    "to calm the nervous system</li>"
                    "<li>Set up your practice space for safe, mindful "
                    "training</li></ul>"
                ),
            },
            {
                "title": "Standing Poses & Alignment",
                "order": 2,
                "video_url": "demo/videos/yoga_2.mp4",
                "duration_seconds": 380,
                "is_free_preview": False,
                "content_html": (
                    "<p>Standing poses build the strength and stability that "
                    "support every other posture. We'll break down Mountain "
                    "Pose, Warrior I, Warrior II, and Triangle with precise "
                    "alignment cues.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Root through the feet and stack joints for "
                    "stability</li>"
                    "<li>Engage the legs and core without gripping or "
                    "tension</li>"
                    "<li>Use alignment markers to self-correct in each "
                    "pose</li></ul>"
                ),
            },
            {
                "title": "Forward Folds & Hip Openers",
                "order": 3,
                "video_url": "demo/videos/yoga_3.mp4",
                "duration_seconds": 450,
                "is_free_preview": False,
                "content_html": (
                    "<p>Forward folds release tension in the hamstrings and "
                    "lower back, while hip openers improve mobility for "
                    "seated meditation. We cover Standing Forward Fold, "
                    "Pigeon Pose, and Lizard Pose.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Hinge from the hips rather than rounding the "
                    "spine</li>"
                    "<li>Use props and modifications for tight "
                    "hamstrings</li>"
                    "<li>Breathe into resistance to gradually deepen each "
                    "stretch</li></ul>"
                ),
            },
            {
                "title": "Balance & Core Strength",
                "order": 4,
                "video_url": "demo/videos/yoga_4.mp4",
                "duration_seconds": 400,
                "is_free_preview": False,
                "content_html": (
                    "<p>Balance poses sharpen focus and build deep core "
                    "stability. We practice Tree Pose, Eagle Pose, and Boat "
                    "Pose with tips to find steadiness even when you "
                    "wobble.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Activate the bandhas for internal stability</li>"
                    "<li>Use a drishti (gaze point) to maintain "
                    "balance</li>"
                    "<li>Build core endurance through static and dynamic "
                    "holds</li></ul>"
                ),
            },
            {
                "title": "Your First Sun Salutation",
                "order": 5,
                "video_url": "demo/videos/yoga_5.mp4",
                "duration_seconds": 540,
                "is_free_preview": False,
                "content_html": (
                    "<p>The Sun Salutation (Surya Namaskar) weaves breath "
                    "and movement into a flowing sequence. We'll learn "
                    "Surya Namaskar A step by step and practice it as a "
                    "complete warm-up routine.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Link each pose to an inhale or exhale for a "
                    "moving meditation</li>"
                    "<li>Transition smoothly between Plank, Chaturanga, "
                    "and Upward Dog</li>"
                    "<li>Build stamina by repeating the sequence at your "
                    "own pace</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "Vinyasa Flow",
        "description": (
            "Elevate your practice with dynamic, breath-synchronized "
            "movement. This course teaches flowing transitions, creative "
            "sequencing, and intermediate poses that build strength, "
            "flexibility, and focus."
        ),
        "pricing_type": "paid",
        "price": 39,
        "order": 2,
        "is_published": True,
        "thumbnail_url": "demo/photos/yoga_2.jpg",
        "module_title": "Flow with Breath",
        "lessons": [
            {
                "title": "Breath & Movement Connection",
                "order": 1,
                "video_url": "demo/videos/yoga_1.mp4",
                "duration_seconds": 430,
                "is_free_preview": True,
                "content_html": (
                    "<p>Vinyasa means linking breath to movement. In this "
                    "lesson you will master the rhythm of inhale-to-expand "
                    "and exhale-to-fold that drives every flow sequence.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Synchronize Ujjayi breath with each transition</li>"
                    "<li>Understand the one-breath-one-movement principle"
                    "</li>"
                    "<li>Build awareness of when to initiate and complete "
                    "each pose</li></ul>"
                ),
            },
            {
                "title": "Sun Salutation B & Variations",
                "order": 2,
                "video_url": "demo/videos/yoga_2.mp4",
                "duration_seconds": 460,
                "is_free_preview": False,
                "content_html": (
                    "<p>Surya Namaskar B adds Chair Pose and Warrior I to "
                    "the classic sequence, increasing intensity. We also "
                    "explore creative variations to keep your flow fresh "
                    "and engaging.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Execute Sun Salutation B with clean transitions"
                    "</li>"
                    "<li>Add low lunge twists and side plank variations</li>"
                    "<li>Modify the sequence for different energy levels"
                    "</li></ul>"
                ),
            },
            {
                "title": "Arm Balances & Inversions",
                "order": 3,
                "video_url": "demo/videos/yoga_3.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Take flight with Crow Pose, Side Crow, and "
                    "Forearm Stand. This lesson builds the wrist strength, "
                    "core engagement, and confidence to go upside down "
                    "safely.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Prepare the wrists and shoulders for weight "
                    "bearing</li>"
                    "<li>Find the tipping point in Crow Pose using core "
                    "lift</li>"
                    "<li>Use the wall as a spotter for Forearm Stand "
                    "practice</li></ul>"
                ),
            },
            {
                "title": "Backbends & Heart Openers",
                "order": 4,
                "video_url": "demo/videos/yoga_4.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Backbends release tension in the chest and hip "
                    "flexors while energizing the entire body. We progress "
                    "from Cobra to Camel to Wheel Pose with safe warm-up "
                    "strategies.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Warm up the thoracic spine before deep "
                    "backbends</li>"
                    "<li>Engage the glutes and legs to protect the lower "
                    "back</li>"
                    "<li>Use breath to deepen the opening without forcing"
                    "</li></ul>"
                ),
            },
            {
                "title": "Full Vinyasa Flow Sequence",
                "order": 5,
                "video_url": "demo/videos/yoga_5.mp4",
                "duration_seconds": 600,
                "is_free_preview": False,
                "content_html": (
                    "<p>Bring everything together in a complete 20-minute "
                    "Vinyasa flow. We move through standing sequences, "
                    "balances, backbends, and a final cool-down with deep "
                    "stretches and Savasana.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Flow through a full sequence with smooth "
                    "transitions</li>"
                    "<li>Maintain breath awareness from start to finish</li>"
                    "<li>Customize the flow to match your energy and "
                    "goals</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "Advanced Asanas",
        "description": (
            "Push your boundaries with advanced postures, deep backbends, "
            "arm balances, and challenging inversions. This course is for "
            "dedicated practitioners ready to explore the full depth of "
            "their physical practice."
        ),
        "pricing_type": "paid",
        "price": 59,
        "order": 3,
        "is_published": True,
        "thumbnail_url": "demo/photos/yoga_3.jpg",
        "module_title": "Master Advanced Poses",
        "lessons": [
            {
                "title": "Foundations for Advanced Practice",
                "order": 1,
                "video_url": "demo/videos/yoga_1.mp4",
                "duration_seconds": 400,
                "is_free_preview": True,
                "content_html": (
                    "<p>Before attempting advanced asanas, we must refine "
                    "our foundations. This lesson covers mobility "
                    "assessments, targeted warm-ups, and the mindset "
                    "needed to approach challenging poses safely.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Assess your current mobility and identify areas "
                    "to develop</li>"
                    "<li>Design a warm-up routine specific to advanced "
                    "postures</li>"
                    "<li>Cultivate patience and non-attachment to "
                    "outcomes</li></ul>"
                ),
            },
            {
                "title": "Deep Backbends & Drops",
                "order": 2,
                "video_url": "demo/videos/yoga_2.mp4",
                "duration_seconds": 470,
                "is_free_preview": False,
                "content_html": (
                    "<p>We progress from Wheel Pose into deeper "
                    "expressions — drop-backs from standing, Scorpion "
                    "Pose, and King Pigeon. Safety and spinal health are "
                    "the top priority throughout.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Build the shoulder and thoracic mobility for "
                    "drop-backs</li>"
                    "<li>Use controlled breathing to manage intensity</li>"
                    "<li>Know when to back off and when to press deeper"
                    "</li></ul>"
                ),
            },
            {
                "title": "Advanced Arm Balances",
                "order": 3,
                "video_url": "demo/videos/yoga_3.mp4",
                "duration_seconds": 490,
                "is_free_preview": False,
                "content_html": (
                    "<p>Fly higher with Eight-Angle Pose, Firefly, and "
                    "Peacock Pose. This lesson combines strength, "
                    "flexibility, and fearlessness into gravity-defying "
                    "postures.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Develop the hip flexibility needed for arm "
                    "balance entries</li>"
                    "<li>Strengthen the wrists and forearms for sustained "
                    "holds</li>"
                    "<li>Use drills and progressions to build toward each "
                    "pose</li></ul>"
                ),
            },
            {
                "title": "Headstand & Shoulderstand Mastery",
                "order": 4,
                "video_url": "demo/videos/yoga_4.mp4",
                "duration_seconds": 440,
                "is_free_preview": False,
                "content_html": (
                    "<p>Inversions are the crown jewels of a yoga practice. "
                    "We refine Headstand and Shoulderstand with leg "
                    "variations, transitions between inversions, and long "
                    "holds that build endurance.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Align the neck and shoulders safely in "
                    "Headstand</li>"
                    "<li>Transition between Headstand and Forearm Stand "
                    "fluidly</li>"
                    "<li>Hold inversions for extended periods with steady "
                    "breath</li></ul>"
                ),
            },
            {
                "title": "Peak Pose Flow",
                "order": 5,
                "video_url": "demo/videos/yoga_5.mp4",
                "duration_seconds": 620,
                "is_free_preview": False,
                "content_html": (
                    "<p>The capstone lesson: a full advanced flow that "
                    "builds toward a peak pose sequence combining deep "
                    "backbends, arm balances, and inversions in one "
                    "powerful practice.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Sequence intelligently toward a peak pose</li>"
                    "<li>Integrate strength, flexibility, and breath "
                    "mastery</li>"
                    "<li>Cool down thoroughly with counter-poses and "
                    "Savasana</li></ul>"
                ),
            },
        ],
    },
]

DOWNLOADS = [
    {
        "title": "Beginner Yoga Pose Guide (PDF)",
        "file_url": "demo/photos/yoga_8.jpg",
        "file_size": 2_800_000,
        "download_count": 178,
        "pricing_type": "free",
    },
    {
        "title": "Sun Salutation Cheat Sheet",
        "file_url": "demo/photos/yoga_9.jpg",
        "file_size": 1_100_000,
        "download_count": 94,
        "pricing_type": "free",
    },
    {
        "title": "Advanced Asanas Sequence Chart",
        "file_url": "demo/photos/yoga_10.jpg",
        "file_size": 950_000,
        "download_count": 203,
        "pricing_type": "paid",
    },
]

STUDENTS = [
    {"email": "priya@demo.test", "name": "Priya Raghavan"},
    {"email": "sarah@demo.test", "name": "Sarah Lindgren"},
    {"email": "marcus@demo.test", "name": "Marcus Torres"},
    {"email": "akiko@demo.test", "name": "Akiko Tanaka"},
    {"email": "david@demo.test", "name": "David Okonkwo"},
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
        "name": "Complete Yoga Collection",
        "description": "All three courses at a discounted price. From beginner foundations to advanced asanas.",
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
        "title": "Open Mat Session",
        "description": "Bring your questions and we'll practice poses together.",
        "duration_minutes": 60,
        "pricing_type": "free",
        "price": 0,
    },
    {
        "title": "Power Vinyasa LIVE",
        "description": "Intensive 45-minute power flow — bring your mat and water!",
        "duration_minutes": 45,
        "pricing_type": "paid",
        "price": 15,
    },
    {
        "title": "Alignment Q&A",
        "description": "Live feedback on your pose alignment and form.",
        "duration_minutes": 45,
        "pricing_type": "paid",
        "price": 0,
    },
]

# Recurring weekly live class template — seed command creates instances for 8 weeks
RECURRING_LIVE_CLASS = {
    "title": "Weekly Vinyasa Flow",
    "description": "Our signature weekly yoga class — open to all levels.",
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
        "title": "Sunday Morning Meditation & Flow",
        "description": "Weekly community stream — free for everyone!",
        "duration_minutes": 90,
        "pricing_type": "free",
        "price": 0,
    },
]

ZOOM_CLASSES = [
    {
        "title": "Private Yoga Coaching — Small Group",
        "description": "Intimate 4-person alignment session via Zoom. Camera on required.",
        "zoom_link": "https://zoom.us/j/1234567890",
        "duration_minutes": 60,
        "pricing_type": "paid",
        "price": 25,
    },
    {
        "title": "Beginner Orientation (Zoom)",
        "description": "Meet the instructor and get oriented before your first course.",
        "zoom_link": "https://zoom.us/j/9876543210",
        "duration_minutes": 60,
        "pricing_type": "free",
        "price": 0,
    },
]

ONSITE_EVENTS = [
    {
        "title": "Weekend Yoga Workshop",
        "description": "Full-day in-person workshop covering alignment, inversions, and breathwork.",
        "location": "Yoga Shala Istanbul",
        "address": "Cihangir Mah. Sıraselviler Cd. No:42, Beyoğlu, Istanbul",
        "max_capacity": 20,
        "duration_minutes": 240,
        "pricing_type": "paid",
        "price": 120,
    },
    {
        "title": "Community Yoga Meetup",
        "description": "Free outdoor yoga session in the park — bring friends!",
        "location": "Kadıköy Yoga Park",
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
        # Priya: bought Vinyasa course, subscribed monthly, good progress
        "email": "priya@demo.test",
        "purchases": [1],
        "bundle_index": None,
        "subscription_plan_index": 0,
        "progress": [
            (0, 0, 420, True),
            (0, 1, 380, True),
            (0, 2, 300, False),
            (1, 0, 430, True),
            (1, 1, 200, False),
        ],
    },
    {
        # Sarah: bought the bundle, fully completed beginners
        "email": "sarah@demo.test",
        "purchases": [],
        "bundle_index": 0,
        "subscription_plan_index": None,
        "progress": [
            (0, 0, 420, True),
            (0, 1, 380, True),
            (0, 2, 450, True),
            (0, 3, 400, True),
            (0, 4, 540, True),
            (1, 0, 100, False),
        ],
    },
    {
        # Marcus: annual subscriber, light progress
        "email": "marcus@demo.test",
        "purchases": [],
        "bundle_index": None,
        "subscription_plan_index": 1,
        "progress": [
            (0, 0, 420, True),
            (2, 0, 200, False),
        ],
    },
    {
        # Akiko: bought Advanced Asanas course individually
        "email": "akiko@demo.test",
        "purchases": [2],
        "bundle_index": None,
        "subscription_plan_index": None,
        "progress": [
            (2, 0, 400, True),
            (2, 1, 470, True),
            (2, 2, 490, True),
            (2, 3, 180, False),
        ],
    },
    {
        # David: free course only, no purchases
        "email": "david@demo.test",
        "purchases": [],
        "bundle_index": None,
        "subscription_plan_index": None,
        "progress": [
            (0, 0, 420, True),
            (0, 1, 100, False),
        ],
    },
]
