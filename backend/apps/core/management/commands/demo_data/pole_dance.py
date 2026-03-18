"""
Pole Dance Studio — demo data for the Contentor platform.

This module provides tenant configuration, branding, landing page sections,
and three complete courses with lessons for a pole-dance-themed demo tenant.
"""

TENANT = {
    "name": "Pole Dance Studio",
    "slug": "demo-poledance",
    "subdomain": "demo-poledance",
    "schema_name": "demo_poledance",
    "domain": "demo-poledance.contentor.localhost",
}

CONFIG = {
    "brand_name": "Pole Dance Studio",
    "theme": "violet",
    "dark_mode_enabled": True,
    "font_family": "Poppins",
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
            {"label": "About", "href": "#about"},
            {"label": "FAQ", "href": "#faq"},
        ],
        "cta": {"text": "Start Training", "href": "/courses"},
        "show_login": True,
    },
    "landing_sections": {
        "hero": {
            "enabled": True,
            "headline": "Unleash Your Strength on the Pole",
            "subheadline": (
                "Build confidence, strength, and artistry through pole dance. "
                "Whether you are a total beginner or looking to master advanced "
                "tricks, our studio has a program for you."
            ),
            "cta_text": "Browse Programs",
            "cta_href": "/courses",
            "bg_image_url": "demo/photos/pole_6.jpg",
        },
        "about": {
            "enabled": True,
            "heading": "About Me",
            "body": (
                "Certified pole dance instructor and competitor with over 8 years "
                "of teaching experience. My mission is to make pole dance "
                "accessible to all body types and fitness levels — no gymnastics "
                "background required, just the courage to try something new."
            ),
            "image_url": "demo/photos/pole_7.jpg",
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
                    "name": "Jessica R.",
                    "text": (
                        "I was terrified of trying pole dance, but the Basics "
                        "course broke everything down so clearly. I can now do "
                        "a fireman spin and I feel incredible!"
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "Mia T.",
                    "text": (
                        "The spins and transitions course completely changed my "
                        "flow. I went from clunky moves to smooth, connected "
                        "sequences in just a few weeks."
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "Priya D.",
                    "text": (
                        "Advanced Pole Tricks pushed me beyond what I thought "
                        "was possible. The detailed progressions for each trick "
                        "made even the scary inversions feel safe."
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
                    "q": "Do I need to be strong to start?",
                    "a": (
                        "Not at all! Pole Basics is designed for complete "
                        "beginners. You will build strength as you progress "
                        "through the lessons. Everyone starts somewhere."
                    ),
                },
                {
                    "q": "What equipment do I need?",
                    "a": (
                        "You will need a pole (static or spinning) installed "
                        "securely at home or access to a local studio. Wear "
                        "shorts and a tank top so your skin can grip the pole."
                    ),
                },
                {
                    "q": "Can I access the courses on mobile?",
                    "a": (
                        "Yes! The platform is fully responsive. You can stream "
                        "lessons on your phone, tablet, or computer — perfect "
                        "for following along in your practice space."
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
            "heading": "Ready to Own the Pole?",
            "button_text": "Join Now",
            "button_href": "/courses",
        },
    },
}

COURSES = [
    {
        "title": "Pole Basics",
        "description": (
            "A beginner-friendly introduction to pole dance fundamentals. "
            "Learn proper grip, basic spins, floor work, and essential "
            "conditioning exercises to build your foundation safely."
        ),
        "pricing_type": "free",
        "price": 0,
        "order": 1,
        "is_published": True,
        "thumbnail_url": "demo/photos/pole_1.png",
        "module_title": "Getting Started",
        "lessons": [
            {
                "title": "Introduction to Pole Dance",
                "order": 1,
                "video_url": "demo/videos/pole_1.mp4",
                "duration_seconds": 420,
                "is_free_preview": True,
                "content_html": (
                    "<p>Welcome to the world of pole dance! In this opening "
                    "lesson we cover the history, styles, and safety essentials "
                    "you need before touching the pole.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Understand the different pole dance styles — sport, "
                    "exotic, and artistic</li>"
                    "<li>Learn pole safety and skin preparation basics</li>"
                    "<li>Set up your practice area for safe training</li></ul>"
                ),
            },
            {
                "title": "Grip & Conditioning",
                "order": 2,
                "video_url": "demo/videos/pole_2.mp4",
                "duration_seconds": 380,
                "is_free_preview": False,
                "content_html": (
                    "<p>A strong grip is everything in pole dance. This lesson "
                    "covers different grip techniques and conditioning drills "
                    "to build the hand, arm, and core strength you need.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Master basic grip, cup grip, and split grip</li>"
                    "<li>Build forearm endurance with targeted drills</li>"
                    "<li>Develop core strength for safe pole holds</li></ul>"
                ),
            },
            {
                "title": "Floor Work Fundamentals",
                "order": 3,
                "video_url": "demo/videos/pole_3.mp4",
                "duration_seconds": 450,
                "is_free_preview": False,
                "content_html": (
                    "<p>Floor work adds sensuality and grace to your pole "
                    "practice. Learn body rolls, transitions to and from the "
                    "floor, and flowing movements that connect your spins.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform smooth descents from standing to floor</li>"
                    "<li>Execute body waves and floor rolls with fluidity</li>"
                    "<li>Connect floor work to pole transitions "
                    "seamlessly</li></ul>"
                ),
            },
            {
                "title": "First Spins — Fireman & Chair",
                "order": 4,
                "video_url": "demo/videos/pole_4.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Time to leave the ground! The fireman spin and chair "
                    "spin are the gateway moves of pole dance. We break them "
                    "down step by step with safety spotting tips.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Execute a clean fireman spin on both sides</li>"
                    "<li>Perform the chair spin with proper leg extension</li>"
                    "<li>Land safely and control momentum</li></ul>"
                ),
            },
            {
                "title": "Basic Spin Combination",
                "order": 5,
                "video_url": "demo/videos/pole_5.mp4",
                "duration_seconds": 510,
                "is_free_preview": False,
                "content_html": (
                    "<p>Put your new skills together in a flowing combination "
                    "that links floor work, fireman spin, chair spin, and a "
                    "graceful dismount.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Chain beginner spins into a seamless sequence</li>"
                    "<li>Add floor work transitions between spins</li>"
                    "<li>Perform with confidence and expression</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "Spins & Transitions",
        "description": (
            "Level up your pole dance with intermediate spins, creative "
            "transitions, and linking techniques. Learn to flow between moves "
            "with grace and build routines that look effortless."
        ),
        "pricing_type": "paid",
        "price": 49,
        "order": 2,
        "is_published": True,
        "thumbnail_url": "demo/photos/pole_2.png",
        "module_title": "Flow & Connect",
        "lessons": [
            {
                "title": "Attitude Spin & Variations",
                "order": 1,
                "video_url": "demo/videos/pole_1.mp4",
                "duration_seconds": 420,
                "is_free_preview": True,
                "content_html": (
                    "<p>The attitude spin is an elegant intermediate move that "
                    "opens up many creative variations. Learn the proper entry, "
                    "body line, and exit techniques.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Execute a clean attitude spin with extended leg line"
                    "</li>"
                    "<li>Explore inside and outside variations</li>"
                    "<li>Transition smoothly from attitude into other moves"
                    "</li></ul>"
                ),
            },
            {
                "title": "Fan Kick & Hook Spin",
                "order": 2,
                "video_url": "demo/videos/pole_2.mp4",
                "duration_seconds": 390,
                "is_free_preview": False,
                "content_html": (
                    "<p>Dynamic fan kicks and hook spins add power and visual "
                    "drama to your repertoire. We cover momentum generation "
                    "and controlled landings.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Generate momentum for fan kicks safely</li>"
                    "<li>Perform the hook spin with proper knee placement</li>"
                    "<li>Control speed and landing on both sides</li></ul>"
                ),
            },
            {
                "title": "Spin-to-Spin Transitions",
                "order": 3,
                "video_url": "demo/videos/pole_3.mp4",
                "duration_seconds": 450,
                "is_free_preview": False,
                "content_html": (
                    "<p>The magic of pole dance is in the transitions. Learn "
                    "how to flow from one spin directly into another without "
                    "stopping, creating a mesmerising continuous sequence.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Link spins without pausing or resetting grip</li>"
                    "<li>Use momentum from one spin to enter the next</li>"
                    "<li>Create visual variety with direction changes</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Climbing & Sitting on the Pole",
                "order": 4,
                "video_url": "demo/videos/pole_4.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Going vertical! Learn the basic climb, cross-ankle "
                    "hold, and how to sit securely on the pole — the gateway "
                    "to all aerial tricks.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Climb the pole with proper technique and grip</li>"
                    "<li>Sit securely with a strong cross-ankle hold</li>"
                    "<li>Transition from climb to sit to spin smoothly</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Intermediate Combination Flow",
                "order": 5,
                "video_url": "demo/videos/pole_5.mp4",
                "duration_seconds": 540,
                "is_free_preview": False,
                "content_html": (
                    "<p>Bring everything together in a flowing intermediate "
                    "combination that showcases spins, transitions, a climb, "
                    "and expressive floor work set to music.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform a multi-spin combination with clean "
                    "transitions</li>"
                    "<li>Incorporate a climb and sit into your routine</li>"
                    "<li>Express musicality through movement and pauses</li>"
                    "</ul>"
                ),
            },
        ],
    },
    {
        "title": "Advanced Pole Tricks",
        "description": (
            "Push your limits with inversions, advanced holds, and show-stopping "
            "tricks. This course covers shoulder mounts, laybacks, and aerial "
            "combinations for confident intermediate dancers ready to level up."
        ),
        "pricing_type": "paid",
        "price": 69,
        "order": 3,
        "is_published": True,
        "thumbnail_url": "demo/photos/pole_3.png",
        "module_title": "Defy Gravity",
        "lessons": [
            {
                "title": "Inversions 101",
                "order": 1,
                "video_url": "demo/videos/pole_1.mp4",
                "duration_seconds": 450,
                "is_free_preview": True,
                "content_html": (
                    "<p>Going upside down is a milestone in every pole dancer's "
                    "journey. We cover the chopper and crucifix entries with "
                    "detailed safety progressions.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Safely enter a basic inversion using the chopper</li>"
                    "<li>Build the core strength needed for controlled "
                    "inversions</li>"
                    "<li>Spot yourself and know when you are ready to "
                    "progress</li></ul>"
                ),
            },
            {
                "title": "Shoulder Mount Technique",
                "order": 2,
                "video_url": "demo/videos/pole_2.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>The shoulder mount is one of the most impressive "
                    "strength moves in pole dance. Learn the proper shoulder "
                    "placement, engagement, and pressing technique.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Position the shoulder correctly against the pole</li>"
                    "<li>Engage lats and core for a controlled lift</li>"
                    "<li>Transition from shoulder mount into aerial poses</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Laybacks & Extended Holds",
                "order": 3,
                "video_url": "demo/videos/pole_3.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Laybacks create stunning visual lines and require trust "
                    "in your grip and body awareness. We build up from seated "
                    "laybacks to full aerial extensions.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform a secure seated layback with proper grip</li>"
                    "<li>Extend into aerial layback with controlled release"
                    "</li>"
                    "<li>Create beautiful lines with pointed toes and arm "
                    "placement</li></ul>"
                ),
            },
            {
                "title": "Aerial Combos",
                "order": 4,
                "video_url": "demo/videos/pole_4.mp4",
                "duration_seconds": 510,
                "is_free_preview": False,
                "content_html": (
                    "<p>Link your tricks in the air! Learn to transition "
                    "between inversions, holds, and spins without coming down "
                    "to the ground.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Chain inversions into holds without descending</li>"
                    "<li>Use momentum and grip changes for aerial flow</li>"
                    "<li>Build endurance for sustained aerial sequences</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Show-Stopping Routine",
                "order": 5,
                "video_url": "demo/videos/pole_5.mp4",
                "duration_seconds": 600,
                "is_free_preview": False,
                "content_html": (
                    "<p>Your capstone routine! Combine inversions, shoulder "
                    "mounts, laybacks, spins, and floor work into a "
                    "breathtaking performance piece.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Perform a complete advanced pole routine</li>"
                    "<li>Blend power tricks with graceful transitions</li>"
                    "<li>Express artistry and confidence on the pole</li>"
                    "</ul>"
                ),
            },
        ],
    },
]

DOWNLOADS = [
    {
        "title": "Pole Conditioning Guide (PDF)",
        "file_url": "demo/photos/pole_4.png",
        "file_size": 2_800_000,
        "download_count": 163,
        "access_type": "free",
    },
    {
        "title": "Spin Progression Checklist",
        "file_url": "demo/photos/pole_5.png",
        "file_size": 1_100_000,
        "download_count": 94,
        "access_type": "free",
    },
    {
        "title": "Pole Dance Warm-Up Music Playlist",
        "file_url": "demo/photos/pole_8.jpg",
        "file_size": 900_000,
        "download_count": 231,
        "access_type": "paid",
    },
]

STUDENTS = [
    {"email": "jessica@demo.test", "name": "Jessica Rivera"},
    {"email": "mia@demo.test", "name": "Mia Thompson"},
    {"email": "priya@demo.test", "name": "Priya Desai"},
    {"email": "chloe@demo.test", "name": "Chloe Martin"},
    {"email": "luna@demo.test", "name": "Luna Park"},
]
