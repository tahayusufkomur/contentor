"""
Makeup Academy — demo data for the Contentor platform.

This module provides tenant configuration, branding, landing page sections,
and three complete courses with lessons for a makeup-themed demo tenant.
"""

TENANT = {
    "name": "Makeup Academy",
    "slug": "demo-makeup",
    "subdomain": "demo-makeup",
    "schema_name": "demo_makeup",
    "domain": "demo-makeup.localhost",
}

CONFIG = {
    "brand_name": "Makeup Academy",
    "theme": "sunset",
    "dark_mode_enabled": True,
    "font_family": "Playfair Display",
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
        "cta": {"text": "Start Learning", "href": "/courses"},
        "show_login": True,
    },
    "landing_sections": {
        "hero": {
            "enabled": True,
            "headline": "Master the Art of Makeup",
            "subheadline": (
                "From everyday glam to editorial masterpieces, learn professional "
                "makeup techniques from the comfort of your home. Join thousands "
                "of aspiring artists on their beauty journey."
            ),
            "cta_text": "Browse Programs",
            "cta_href": "/courses",
            "bg_image_url": "demo/photos/make_up_4.png",
        },
        "about": {
            "enabled": True,
            "heading": "About Me",
            "body": (
                "Professional makeup artist with over 12 years of experience in "
                "bridal, editorial, and fashion makeup. I have worked backstage "
                "at fashion weeks and with celebrity clients, and now I am "
                "passionate about sharing my techniques with aspiring artists "
                "around the world."
            ),
            "image_url": "demo/photos/make_up_5.png",
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
                    "name": "Olivia H.",
                    "text": (
                        "The Everyday Glam course transformed my morning "
                        "routine. I finally understand how to blend foundation "
                        "properly and my skin looks flawless every day!"
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "Zara B.",
                    "text": (
                        "Bridal Makeup Mastery gave me the confidence to start "
                        "freelancing as a bridal artist. The business tips alone "
                        "were worth the investment."
                    ),
                    "avatar_url": "",
                },
                {
                    "name": "Hannah L.",
                    "text": (
                        "The editorial course blew my mind. I never thought I "
                        "could create avant-garde looks, but the step-by-step "
                        "breakdowns made it so accessible."
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
                    "q": "Do I need professional makeup products to start?",
                    "a": (
                        "Not at all! We recommend affordable drugstore "
                        "alternatives for every product used in the courses. "
                        "You can upgrade your kit as you progress."
                    ),
                },
                {
                    "q": "Are the techniques suitable for all skin types?",
                    "a": (
                        "Absolutely. Each lesson covers adaptations for dry, "
                        "oily, combination, and sensitive skin. We also address "
                        "techniques for a wide range of skin tones."
                    ),
                },
                {
                    "q": "Can I access the courses on mobile?",
                    "a": (
                        "Yes! The platform is fully responsive. You can stream "
                        "lessons on your phone, tablet, or computer — perfect "
                        "for following along at your vanity."
                    ),
                },
                {
                    "q": "How long do I have access to the courses?",
                    "a": (
                        "Once you enroll, you get lifetime access to the course "
                        "material. Rewatch lessons as many times as you like "
                        "and learn at your own pace."
                    ),
                },
            ],
        },
        "cta": {
            "enabled": True,
            "heading": "Ready to Glow Up?",
            "button_text": "Join Now",
            "button_href": "/courses",
        },
    },
}

COURSES = [
    {
        "title": "Everyday Glam",
        "description": (
            "A beginner-friendly course covering flawless base application, "
            "natural eye looks, and everyday lip combinations. Perfect for "
            "anyone who wants to look polished in under 15 minutes."
        ),
        "pricing_type": "free",
        "price": 0,
        "order": 1,
        "is_published": True,
        "thumbnail_url": "demo/photos/make_up_1.png",
        "module_title": "Getting Started",
        "lessons": [
            {
                "title": "Skin Prep & Primer",
                "order": 1,
                "video_url": "demo/videos/make_up_1.mp4",
                "duration_seconds": 420,
                "is_free_preview": True,
                "content_html": (
                    "<p>Great makeup starts with great prep. In this lesson "
                    "we cover skincare basics, primer selection, and how to "
                    "create the perfect canvas for any look.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Choose the right primer for your skin type</li>"
                    "<li>Apply moisturizer and SPF without pilling</li>"
                    "<li>Prep lips and brows for long-lasting makeup</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Flawless Foundation & Concealer",
                "order": 2,
                "video_url": "demo/videos/make_up_2.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Learn to match your foundation shade perfectly, blend "
                    "seamlessly with brush, sponge, or fingers, and conceal "
                    "dark circles and blemishes like a pro.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Find your perfect foundation shade and undertone</li>"
                    "<li>Master the bounce-and-blend technique with a sponge"
                    "</li>"
                    "<li>Apply concealer using the triangle method for a "
                    "lifted look</li></ul>"
                ),
            },
            {
                "title": "Natural Eye Makeup",
                "order": 3,
                "video_url": "demo/videos/make_up_3.mp4",
                "duration_seconds": 390,
                "is_free_preview": False,
                "content_html": (
                    "<p>Soft, flattering eye makeup that works for every "
                    "occasion. We cover eyeshadow placement, blending, and "
                    "a subtle liner technique for wide-awake eyes.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Place transition, lid, and outer-corner shades "
                    "correctly</li>"
                    "<li>Blend eyeshadow with a windshield-wiper motion</li>"
                    "<li>Apply tightline liner for natural definition</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Brows, Blush & Highlight",
                "order": 4,
                "video_url": "demo/videos/make_up_4.mp4",
                "duration_seconds": 360,
                "is_free_preview": False,
                "content_html": (
                    "<p>Frame your face with polished brows, a flattering "
                    "blush placement, and a natural highlight that catches "
                    "the light beautifully.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Shape and fill brows to complement your face</li>"
                    "<li>Apply blush on the apples for a youthful glow</li>"
                    "<li>Highlight the high points without looking glittery"
                    "</li></ul>"
                ),
            },
            {
                "title": "Lip Combos & Setting",
                "order": 5,
                "video_url": "demo/videos/make_up_5.mp4",
                "duration_seconds": 330,
                "is_free_preview": False,
                "content_html": (
                    "<p>Finish your everyday look with the perfect lip combo "
                    "and a setting routine that keeps everything in place "
                    "for hours.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Pair liner, lipstick, and gloss for a polished lip"
                    "</li>"
                    "<li>Set makeup with powder and setting spray correctly"
                    "</li>"
                    "<li>Touch up throughout the day without caking</li>"
                    "</ul>"
                ),
            },
        ],
    },
    {
        "title": "Bridal Makeup Mastery",
        "description": (
            "Everything you need to create long-lasting, photogenic bridal "
            "looks. From consultation techniques to waterproof formulas and "
            "camera-ready finishes, this course prepares you for the big day."
        ),
        "pricing_type": "paid",
        "price": 59,
        "order": 2,
        "is_published": True,
        "thumbnail_url": "demo/photos/make_up_2.png",
        "module_title": "The Bridal Look",
        "lessons": [
            {
                "title": "Bridal Consultation & Planning",
                "order": 1,
                "video_url": "demo/videos/make_up_1.mp4",
                "duration_seconds": 390,
                "is_free_preview": True,
                "content_html": (
                    "<p>A successful bridal look starts long before the "
                    "wedding day. Learn how to conduct a trial, manage "
                    "expectations, and build a bridal kit.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Conduct a thorough bridal consultation</li>"
                    "<li>Build a reliable, travel-friendly bridal kit</li>"
                    "<li>Plan the timeline for wedding-day makeup</li></ul>"
                ),
            },
            {
                "title": "Long-Wear Base Techniques",
                "order": 2,
                "video_url": "demo/videos/make_up_2.mp4",
                "duration_seconds": 450,
                "is_free_preview": False,
                "content_html": (
                    "<p>Bridal makeup must survive tears, hugs, and hours of "
                    "photos. Learn the layering and setting techniques that "
                    "keep foundation flawless from ceremony to reception.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Layer primers and foundations for maximum longevity"
                    "</li>"
                    "<li>Use waterproof formulas without looking cakey</li>"
                    "<li>Set and bake strategically for a photo-ready finish"
                    "</li></ul>"
                ),
            },
            {
                "title": "Romantic Bridal Eyes",
                "order": 3,
                "video_url": "demo/videos/make_up_3.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Create soft, romantic eye looks with shimmer, lashes, "
                    "and seamless blending. We cover classic bridal styles "
                    "from soft glam to smoky elegance.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Apply and blend shimmer shadows without fallout</li>"
                    "<li>Choose and apply false lashes for bridal looks</li>"
                    "<li>Adapt eye looks for different eye shapes</li></ul>"
                ),
            },
            {
                "title": "Contour, Sculpt & Glow",
                "order": 4,
                "video_url": "demo/videos/make_up_4.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Sculpt the face for photographs with cream and powder "
                    "contour, strategic highlighting, and a bridal glow that "
                    "photographs beautifully without flash-back.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Contour and highlight for different face shapes</li>"
                    "<li>Avoid SPF flash-back in photography</li>"
                    "<li>Create a natural, dewy glow that lasts all day</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Final Bridal Look & Touch-Up Kit",
                "order": 5,
                "video_url": "demo/videos/make_up_5.mp4",
                "duration_seconds": 540,
                "is_free_preview": False,
                "content_html": (
                    "<p>Put it all together in a complete bridal look from "
                    "start to finish, then assemble a touch-up kit for the "
                    "bride to carry throughout the day.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Execute a full bridal look within a professional "
                    "timeline</li>"
                    "<li>Assemble a compact touch-up kit for the bride</li>"
                    "<li>Handle last-minute changes with confidence</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "Editorial & Creative Looks",
        "description": (
            "Explore bold, artistic makeup for editorial shoots, runway shows, "
            "and creative projects. Push boundaries with colour theory, graphic "
            "liner, face art, and avant-garde techniques."
        ),
        "pricing_type": "paid",
        "price": 79,
        "order": 3,
        "is_published": True,
        "thumbnail_url": "demo/photos/make_up_3.png",
        "module_title": "Creative Expression",
        "lessons": [
            {
                "title": "Colour Theory for Makeup Artists",
                "order": 1,
                "video_url": "demo/videos/make_up_1.mp4",
                "duration_seconds": 420,
                "is_free_preview": True,
                "content_html": (
                    "<p>Understanding colour is the foundation of editorial "
                    "makeup. Learn how to use the colour wheel, complementary "
                    "palettes, and colour psychology to create impactful "
                    "looks.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Apply colour wheel principles to makeup palettes</li>"
                    "<li>Choose colours that complement different skin tones"
                    "</li>"
                    "<li>Use colour psychology to evoke mood in editorial "
                    "work</li></ul>"
                ),
            },
            {
                "title": "Graphic Liner & Bold Eyes",
                "order": 2,
                "video_url": "demo/videos/make_up_2.mp4",
                "duration_seconds": 450,
                "is_free_preview": False,
                "content_html": (
                    "<p>Graphic liner is the signature of editorial makeup. "
                    "Master floating creases, geometric shapes, and negative "
                    "space techniques with liquid and gel liners.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Create clean graphic lines with steady hands</li>"
                    "<li>Design floating crease and cut-crease looks</li>"
                    "<li>Use tape and stencils for geometric precision</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Face Art & Embellishments",
                "order": 3,
                "video_url": "demo/videos/make_up_3.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Take your artistry beyond the eyes with face painting, "
                    "rhinestone placement, foil application, and mixed-media "
                    "techniques used in high-fashion editorials.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Apply rhinestones and gems with skin-safe adhesive"
                    "</li>"
                    "<li>Use foil and metallic elements for editorial impact"
                    "</li>"
                    "<li>Combine textures for multi-dimensional face art</li>"
                    "</ul>"
                ),
            },
            {
                "title": "Working with Photographers",
                "order": 4,
                "video_url": "demo/videos/make_up_4.mp4",
                "duration_seconds": 390,
                "is_free_preview": False,
                "content_html": (
                    "<p>Editorial makeup exists for the camera. Learn how "
                    "lighting affects makeup, how to communicate with "
                    "photographers, and how to adapt looks for different "
                    "shooting conditions.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Adapt makeup intensity for natural vs. studio "
                    "lighting</li>"
                    "<li>Communicate a creative vision with the team</li>"
                    "<li>Touch up between shots efficiently</li></ul>"
                ),
            },
            {
                "title": "Complete Editorial Shoot Look",
                "order": 5,
                "video_url": "demo/videos/make_up_5.mp4",
                "duration_seconds": 600,
                "is_free_preview": False,
                "content_html": (
                    "<p>Create a full editorial look from mood board to final "
                    "photograph. This capstone lesson brings together colour "
                    "theory, graphic techniques, and on-set professionalism.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Develop a concept from mood board to execution</li>"
                    "<li>Execute a complete editorial look under time "
                    "pressure</li>"
                    "<li>Build a portfolio-worthy body of work</li></ul>"
                ),
            },
        ],
    },
]

DOWNLOADS = [
    {
        "title": "Makeup Brush Guide (PDF)",
        "file_url": "demo/photos/make_up_3.png",
        "file_size": 2_200_000,
        "download_count": 178,
        "pricing_type": "free",
    },
    {
        "title": "Bridal Makeup Checklist",
        "file_url": "demo/photos/make_up_4.png",
        "file_size": 1_400_000,
        "download_count": 112,
        "pricing_type": "free",
    },
    {
        "title": "Editorial Mood Board Templates",
        "file_url": "demo/photos/make_up_5.png",
        "file_size": 3_100_000,
        "download_count": 95,
        "pricing_type": "paid",
    },
]

STUDENTS = [
    {"email": "olivia@demo.test", "name": "Olivia Harper"},
    {"email": "zara@demo.test", "name": "Zara Blake"},
    {"email": "hannah@demo.test", "name": "Hannah Lee"},
    {"email": "camila@demo.test", "name": "Camila Torres"},
    {"email": "ruby@demo.test", "name": "Ruby Johnson"},
]

SUBSCRIPTION_PLANS = [
    {
        "name": "Monthly Pass",
        "description": "Access all subscription courses and live classes for one month.",
        "price": "49.00",
        "currency": "TRY",
        "sort_order": 1,
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
        "name": "Complete Makeup Collection",
        "description": "All three courses at a discounted price. From everyday glam to editorial artistry.",
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
        "description": "Bring your brushes and practice looks together with live feedback.",
        "duration_minutes": 60,
        "pricing_type": "free",
        "price": 0,
    },
    {
        "title": "Contouring Masterclass LIVE",
        "description": "Intensive 45-minute contouring workshop — bring your contour kit and mirror!",
        "duration_minutes": 45,
        "pricing_type": "paid",
        "price": 15,
    },
    {
        "title": "Portfolio Review Q&A",
        "description": "Live feedback on your makeup portfolio and creative direction.",
        "duration_minutes": 60,
        "pricing_type": "paid",
        "price": 0,
    },
]

# Recurring weekly live class template — seed command creates instances for 8 weeks
RECURRING_LIVE_CLASS = {
    "title": "Weekly Glam Session",
    "description": "Our signature weekly makeup class — open to all levels.",
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
        "title": "Friday Beauty Stream",
        "description": "Weekly community stream — free for everyone!",
        "duration_minutes": 90,
        "pricing_type": "free",
        "price": 0,
    },
]

ZOOM_CLASSES = [
    {
        "title": "Private Coaching — Small Group",
        "description": "Intimate 4-person makeup session via Zoom. Camera on required.",
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
        "title": "Weekend Makeup Masterclass",
        "description": "Full-day in-person workshop covering bridal looks, contouring, and editorial techniques.",
        "location": "Beauty Studio Istanbul",
        "address": "Cihangir Mah. Sıraselviler Cd. No:42, Beyoğlu, Istanbul",
        "max_capacity": 20,
        "duration_minutes": 240,
        "pricing_type": "paid",
        "price": 120,
    },
    {
        "title": "Community Beauty Meetup",
        "description": "Free makeup meetup at the studio — bring friends and your favourite products!",
        "location": "Kadıköy Beauty Lounge",
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
        # Olivia: bought Bridal course, subscribed monthly, good progress
        "email": "olivia@demo.test",
        "purchases": [1],
        "bundle_index": None,
        "subscription_plan_index": 0,
        "progress": [
            (0, 0, 420, True),
            (0, 1, 380, True),
            (0, 2, 300, False),
            (1, 0, 390, True),
            (1, 1, 200, False),
        ],
    },
    {
        # Zara: bought the bundle, fully completed Everyday Glam
        "email": "zara@demo.test",
        "purchases": [],
        "bundle_index": 0,
        "subscription_plan_index": None,
        "progress": [
            (0, 0, 420, True),
            (0, 1, 480, True),
            (0, 2, 390, True),
            (0, 3, 360, True),
            (0, 4, 330, True),
            (1, 0, 100, False),
        ],
    },
    {
        # Hannah: annual subscriber, light progress
        "email": "hannah@demo.test",
        "purchases": [],
        "bundle_index": None,
        "subscription_plan_index": 1,
        "progress": [
            (0, 0, 420, True),
            (2, 0, 200, False),
        ],
    },
    {
        # Camila: bought Editorial & Creative Looks course individually
        "email": "camila@demo.test",
        "purchases": [2],
        "bundle_index": None,
        "subscription_plan_index": None,
        "progress": [
            (2, 0, 420, True),
            (2, 1, 450, True),
            (2, 2, 480, True),
            (2, 3, 180, False),
        ],
    },
    {
        # Ruby: free course only, no purchases
        "email": "ruby@demo.test",
        "purchases": [],
        "bundle_index": None,
        "subscription_plan_index": None,
        "progress": [
            (0, 0, 420, True),
            (0, 1, 100, False),
        ],
    },
]
