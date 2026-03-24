"""
Face Yoga Studio — demo data for the Contentor platform.

This module provides tenant configuration, branding, landing page sections,
and three complete courses with lessons for a face-yoga-themed demo tenant.
"""

TENANT = {
    "name": "Face Yoga Studio",
    "slug": "demo-faceyoga",
    "subdomain": "demo-faceyoga",
    "schema_name": "demo_faceyoga",
    "domain": "demo-faceyoga.contentor.localhost",
}

CONFIG = {
    "brand_name": "Face Yoga Studio",
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
        "cta": {"text": "Start Glowing", "href": "/courses"},
        "show_login": True,
    },
    "landing_sections": {
        "hero": {
            "enabled": True,
            "headline": "Natural Beauty Through Face Yoga",
            "subheadline": (
                "Tone, lift, and rejuvenate your face with simple daily exercises. "
                "No injections, no products — just your hands and a few minutes "
                "a day for visible, lasting results."
            ),
            "cta_text": "Browse Programs",
            "cta_href": "/courses",
            "bg_image_url": "demo/photos/face_yoga_4.png",
        },
        "about": {
            "enabled": True,
            "heading": "About Me",
            "body": (
                "Certified face yoga instructor and holistic wellness coach with "
                "over 6 years of experience. After seeing dramatic results in my "
                "own skin, I dedicated my career to teaching natural facial "
                "rejuvenation techniques that anyone can do at home."
            ),
            "image_url": "demo/photos/face_yoga_5.png",
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
                    "name": "Sarah W.",
                    "text": (
                        "After just three weeks of the Basics course, my "
                        "jawline is noticeably more defined. I cannot believe "
                        "something so simple actually works!"
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "Mei C.",
                    "text": (
                        "The Anti-Aging Routines course is my daily ritual now. "
                        "My forehead lines have softened and my skin looks so "
                        "much more lifted and radiant."
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "Astrid N.",
                    "text": (
                        "Sculpt & Tone gave me cheekbones I did not know I "
                        "had! The targeted exercises are so effective and only "
                        "take ten minutes a day."
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
                    "q": "How soon will I see results?",
                    "a": (
                        "Most students notice subtle changes within 2-3 weeks "
                        "of daily practice. More significant lifting and toning "
                        "typically appear after 6-8 weeks of consistent work."
                    ),
                },
                {
                    "q": "Do I need any equipment?",
                    "a": (
                        "No equipment at all! All exercises use your own hands "
                        "and facial muscles. A mirror is helpful so you can "
                        "check your form, but that is all you need."
                    ),
                },
                {
                    "q": "Can I access the courses on mobile?",
                    "a": (
                        "Yes! The platform is fully responsive. You can stream "
                        "lessons on your phone, tablet, or computer — perfect "
                        "for following along during your morning routine."
                    ),
                },
                {
                    "q": "How long do I have access to the courses?",
                    "a": (
                        "Once you enroll, you get lifetime access to the course "
                        "material. Rewatch lessons as many times as you like "
                        "and progress at your own pace."
                    ),
                },
            ],
        },
        "cta": {
            "enabled": True,
            "heading": "Ready to Transform Your Face Naturally?",
            "button_text": "Join Now",
            "button_href": "/courses",
        },
    },
}

COURSES = [
    {
        "title": "Face Yoga Basics",
        "description": (
            "A beginner-friendly introduction to face yoga fundamentals. "
            "Learn the core exercises for forehead, eyes, cheeks, and jawline "
            "that form the foundation of every effective routine."
        ),
        "pricing_type": "free",
        "price": 0,
        "order": 1,
        "is_published": True,
        "thumbnail_url": "demo/photos/face_yoga_1.png",
        "module_title": "Getting Started",
        "lessons": [
            {
                "title": "What Is Face Yoga?",
                "order": 1,
                "video_url": "demo/videos/face_yoga_1.mp4",
                "duration_seconds": 360,
                "is_free_preview": True,
                "content_html": (
                    "<p>Welcome to face yoga! In this opening lesson we "
                    "explore the science behind facial exercises, how they "
                    "stimulate collagen production, and how to set up a "
                    "daily practice.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Understand how facial muscles respond to targeted "
                    "exercise</li>"
                    "<li>Learn the dos and don'ts of safe face yoga</li>"
                    "<li>Set up a realistic daily practice schedule</li></ul>"
                ),
            },
            {
                "title": "Forehead Smoothing Exercises",
                "order": 2,
                "video_url": "demo/videos/face_yoga_2.mp4",
                "duration_seconds": 330,
                "is_free_preview": False,
                "content_html": (
                    "<p>Target the frontalis muscle to reduce forehead lines "
                    "and prevent new ones from forming. These gentle resistance "
                    "exercises smooth the forehead area naturally.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform forehead lifts with fingertip resistance</li>"
                    "<li>Release tension in the frontalis muscle</li>"
                    "<li>Prevent habitual brow-raising that deepens lines"
                    "</li></ul>"
                ),
            },
            {
                "title": "Eye Area Exercises",
                "order": 3,
                "video_url": "demo/videos/face_yoga_3.mp4",
                "duration_seconds": 390,
                "is_free_preview": False,
                "content_html": (
                    "<p>The delicate eye area benefits greatly from gentle "
                    "face yoga. Learn exercises that lift drooping eyelids, "
                    "reduce puffiness, and minimize crow's feet.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Strengthen the orbicularis oculi for firmer eyes"
                    "</li>"
                    "<li>Reduce under-eye puffiness with lymphatic tapping"
                    "</li>"
                    "<li>Open up the eye area for a more youthful look</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Cheek Lifting & Plumping",
                "order": 4,
                "video_url": "demo/videos/face_yoga_4.mp4",
                "duration_seconds": 360,
                "is_free_preview": False,
                "content_html": (
                    "<p>Full, lifted cheeks are a hallmark of youthful skin. "
                    "These exercises target the zygomatic muscles to create "
                    "natural volume and definition.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Lift sagging cheeks with smile-and-hold exercises"
                    "</li>"
                    "<li>Create natural cheek volume through muscle toning"
                    "</li>"
                    "<li>Improve nasolabial fold appearance over time</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Jawline & Neck Toning",
                "order": 5,
                "video_url": "demo/videos/face_yoga_5.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Define your jawline and tone the neck area with "
                    "exercises that target the platysma and masseter muscles. "
                    "Say goodbye to double chin and neck sagging.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform jaw-clenching exercises for definition</li>"
                    "<li>Tone the platysma to reduce neck sagging</li>"
                    "<li>Release jaw tension for a slimmer face shape</li>"
                    "</ul>"
                ),
            },
        ],
    },
    {
        "title": "Anti-Aging Routines",
        "description": (
            "Targeted face yoga routines designed to combat the visible signs "
            "of aging. Focus on deep wrinkle reduction, skin elasticity, and "
            "lymphatic drainage for a naturally youthful appearance."
        ),
        "pricing_type": "paid",
        "price": 39,
        "order": 2,
        "is_published": True,
        "thumbnail_url": "demo/photos/face_yoga_2.png",
        "module_title": "Turn Back Time",
        "lessons": [
            {
                "title": "Facial Massage for Circulation",
                "order": 1,
                "video_url": "demo/videos/face_yoga_1.mp4",
                "duration_seconds": 390,
                "is_free_preview": True,
                "content_html": (
                    "<p>Boost blood flow and deliver nutrients to your skin "
                    "with targeted facial massage techniques. Better "
                    "circulation means healthier, more radiant skin.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform upward massage strokes for lymphatic "
                    "drainage</li>"
                    "<li>Use pressure points to boost circulation</li>"
                    "<li>Incorporate facial massage into your daily "
                    "routine</li></ul>"
                ),
            },
            {
                "title": "Deep Wrinkle Reduction",
                "order": 2,
                "video_url": "demo/videos/face_yoga_2.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Target established wrinkles with advanced resistance "
                    "exercises and massage techniques that stimulate collagen "
                    "and relax overactive muscles.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Apply resistance exercises to deep forehead lines"
                    "</li>"
                    "<li>Soften nasolabial folds with targeted movements</li>"
                    "<li>Relax muscles that cause expression lines</li></ul>"
                ),
            },
            {
                "title": "Lymphatic Drainage Routine",
                "order": 3,
                "video_url": "demo/videos/face_yoga_3.mp4",
                "duration_seconds": 360,
                "is_free_preview": False,
                "content_html": (
                    "<p>Reduce puffiness and detoxify your skin with a "
                    "complete lymphatic drainage routine. These gentle "
                    "techniques de-puff the face and enhance skin clarity.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Follow the lymphatic pathways of the face and neck"
                    "</li>"
                    "<li>Reduce morning puffiness in under five minutes</li>"
                    "<li>Improve skin clarity through regular drainage</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Lip & Mouth Area Exercises",
                "order": 4,
                "video_url": "demo/videos/face_yoga_4.mp4",
                "duration_seconds": 330,
                "is_free_preview": False,
                "content_html": (
                    "<p>Combat lip lines, marionette lines, and a downturned "
                    "mouth with exercises that tone the orbicularis oris and "
                    "surrounding muscles.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Reduce vertical lip lines with resistance "
                    "exercises</li>"
                    "<li>Lift the corners of the mouth naturally</li>"
                    "<li>Plump the lip area by improving muscle tone</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Complete Anti-Aging Routine",
                "order": 5,
                "video_url": "demo/videos/face_yoga_5.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Bring all anti-aging techniques together in a "
                    "complete 10-minute daily routine that targets every "
                    "area of the face for maximum rejuvenation.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform a full-face anti-aging routine in 10 "
                    "minutes</li>"
                    "<li>Sequence exercises for maximum effectiveness</li>"
                    "<li>Track your progress with before-and-after photos"
                    "</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "Sculpt & Tone",
        "description": (
            "Advanced face yoga for sculpted facial contours. Define your "
            "cheekbones, sharpen your jawline, and create symmetry with "
            "targeted exercises that reshape your face naturally."
        ),
        "pricing_type": "paid",
        "price": 49,
        "order": 3,
        "is_published": True,
        "thumbnail_url": "demo/photos/face_yoga_3.png",
        "module_title": "Shape Your Face",
        "lessons": [
            {
                "title": "Cheekbone Sculpting",
                "order": 1,
                "video_url": "demo/videos/face_yoga_1.mp4",
                "duration_seconds": 390,
                "is_free_preview": True,
                "content_html": (
                    "<p>Define and lift your cheekbones with advanced "
                    "exercises that target the malar fat pad and zygomatic "
                    "muscles for a naturally contoured look.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform cheekbone-lifting resistance exercises</li>"
                    "<li>Reduce mid-face sagging with targeted movements</li>"
                    "<li>Create the appearance of higher cheekbones "
                    "naturally</li></ul>"
                ),
            },
            {
                "title": "V-Shape Jawline Exercises",
                "order": 2,
                "video_url": "demo/videos/face_yoga_2.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Achieve a defined, V-shaped jawline with advanced "
                    "exercises that slim the lower face and tighten the "
                    "area under the chin.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Target the submental area for double chin "
                    "reduction</li>"
                    "<li>Define the jaw angle with resistance exercises</li>"
                    "<li>Slim the lower face through consistent practice"
                    "</li></ul>"
                ),
            },
            {
                "title": "Facial Symmetry Correction",
                "order": 3,
                "video_url": "demo/videos/face_yoga_3.mp4",
                "duration_seconds": 450,
                "is_free_preview": False,
                "content_html": (
                    "<p>Most faces have subtle asymmetry. Learn exercises "
                    "that address imbalances by strengthening the weaker "
                    "side and releasing tension on the dominant side.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Identify your facial asymmetries in the mirror</li>"
                    "<li>Perform single-side exercises to correct "
                    "imbalances</li>"
                    "<li>Release habitual tension patterns that cause "
                    "asymmetry</li></ul>"
                ),
            },
            {
                "title": "Neck & Decolletage Toning",
                "order": 4,
                "video_url": "demo/videos/face_yoga_4.mp4",
                "duration_seconds": 360,
                "is_free_preview": False,
                "content_html": (
                    "<p>Extend your sculpting practice to the neck and "
                    "decolletage. These exercises tone the platysma, reduce "
                    "neck bands, and create a smoother, more youthful "
                    "neckline.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Tone the platysma to reduce visible neck bands</li>"
                    "<li>Smooth and firm the decolletage area</li>"
                    "<li>Improve posture for a longer, leaner neck</li></ul>"
                ),
            },
            {
                "title": "Full Sculpting Routine",
                "order": 5,
                "video_url": "demo/videos/face_yoga_5.mp4",
                "duration_seconds": 540,
                "is_free_preview": False,
                "content_html": (
                    "<p>Your ultimate sculpting routine! Combine cheekbone "
                    "lifting, jawline definition, symmetry work, and neck "
                    "toning into a powerful daily practice.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform a complete sculpting routine in 12 minutes"
                    "</li>"
                    "<li>Customize the routine for your specific goals</li>"
                    "<li>Maintain results with a sustainable long-term "
                    "practice</li></ul>"
                ),
            },
        ],
    },
]

DOWNLOADS = [
    {
        "title": "Face Yoga Daily Routine (PDF)",
        "file_url": "demo/photos/face_yoga_3.png",
        "file_size": 1_800_000,
        "download_count": 203,
        "pricing_type": "free",
    },
    {
        "title": "Before & After Tracking Sheet",
        "file_url": "demo/photos/face_yoga_4.png",
        "file_size": 950_000,
        "download_count": 147,
        "pricing_type": "free",
    },
    {
        "title": "Advanced Sculpting Exercise Guide",
        "file_url": "demo/photos/face_yoga_5.png",
        "file_size": 2_400_000,
        "download_count": 89,
        "pricing_type": "paid",
    },
]

STUDENTS = [
    {"email": "sarah@demo.test", "name": "Sarah Williams"},
    {"email": "mei@demo.test", "name": "Mei Chen"},
    {"email": "astrid@demo.test", "name": "Astrid Nilsson"},
    {"email": "yuki@demo.test", "name": "Yuki Tanaka"},
    {"email": "grace@demo.test", "name": "Grace Okafor"},
]

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
        "name": "Complete Face Yoga Collection",
        "description": "All three courses at a discounted price. Master the basics, fight aging, and sculpt your dream face.",
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
        "title": "Open Practice Session",
        "description": "Bring your questions and we'll practise face yoga techniques together.",
        "duration_minutes": 45,
        "pricing_type": "free",
        "price": 0,
    },
    {
        "title": "Jawline Sculpting LIVE",
        "description": "Intensive 30-minute jawline sculpting drill — grab a mirror!",
        "duration_minutes": 45,
        "pricing_type": "paid",
        "price": 15,
    },
    {
        "title": "Technique Q&A",
        "description": "Live feedback on your face yoga form and technique.",
        "duration_minutes": 60,
        "pricing_type": "paid",
        "price": 0,
    },
]

# Recurring weekly live class template — seed command creates instances for 8 weeks
RECURRING_LIVE_CLASS = {
    "title": "Weekly Face Yoga Flow",
    "description": "Our signature weekly face yoga session — open to all levels.",
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
        "title": "Friday Self-Care Stream",
        "description": "Weekly community self-care stream — free for everyone!",
        "duration_minutes": 90,
        "pricing_type": "free",
        "price": 0,
    },
]

ZOOM_CLASSES = [
    {
        "title": "Private Coaching — Small Group",
        "description": "Intimate 4-person face yoga coaching session via Zoom. Camera on required.",
        "zoom_link": "https://zoom.us/j/1234567890",
        "duration_minutes": 60,
        "pricing_type": "paid",
        "price": 25,
    },
    {
        "title": "Beginner Orientation (Zoom)",
        "description": "Meet the instructor and get oriented before starting your face yoga journey.",
        "zoom_link": "https://zoom.us/j/9876543210",
        "duration_minutes": 60,
        "pricing_type": "free",
        "price": 0,
    },
]

ONSITE_EVENTS = [
    {
        "title": "Weekend Face Yoga Retreat",
        "description": "Full-day in-person workshop covering facial exercises, massage, and self-care rituals.",
        "location": "Wellness Studio Istanbul",
        "address": "Cihangir Mah. Sıraselviler Cd. No:42, Beyoğlu, Istanbul",
        "max_capacity": 20,
        "duration_minutes": 240,
        "pricing_type": "paid",
        "price": 120,
    },
    {
        "title": "Community Glow-Up Meetup",
        "description": "Free social face yoga evening — bring friends and glow together!",
        "location": "Kadıköy Cultural Center",
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
        # Sarah: bought Anti-Aging course, subscribed monthly, good progress
        "email": "sarah@demo.test",
        "purchases": [1],
        "bundle_index": None,
        "subscription_plan_index": 0,
        "progress": [
            (0, 0, 360, True),
            (0, 1, 330, True),
            (0, 2, 300, False),
            (1, 0, 390, True),
            (1, 1, 200, False),
        ],
    },
    {
        # Mei: bought the bundle, fully completed basics
        "email": "mei@demo.test",
        "purchases": [],
        "bundle_index": 0,
        "subscription_plan_index": None,
        "progress": [
            (0, 0, 360, True),
            (0, 1, 330, True),
            (0, 2, 390, True),
            (0, 3, 360, True),
            (0, 4, 420, True),
            (1, 0, 100, False),
        ],
    },
    {
        # Astrid: annual subscriber, light progress
        "email": "astrid@demo.test",
        "purchases": [],
        "bundle_index": None,
        "subscription_plan_index": 1,
        "progress": [
            (0, 0, 360, True),
            (2, 0, 200, False),
        ],
    },
    {
        # Yuki: bought Sculpt & Tone course individually
        "email": "yuki@demo.test",
        "purchases": [2],
        "bundle_index": None,
        "subscription_plan_index": None,
        "progress": [
            (2, 0, 390, True),
            (2, 1, 420, True),
            (2, 2, 450, True),
            (2, 3, 180, False),
        ],
    },
    {
        # Grace: free course only, no purchases
        "email": "grace@demo.test",
        "purchases": [],
        "bundle_index": None,
        "subscription_plan_index": None,
        "progress": [
            (0, 0, 360, True),
            (0, 1, 100, False),
        ],
    },
]
