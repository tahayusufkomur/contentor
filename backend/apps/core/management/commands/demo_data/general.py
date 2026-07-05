"""
Coaching Studio — neutral demo data for coaches who pick "Something else".

Same module shape as the niche templates (yoga.py et al). Copy is deliberately
niche-free so it fits any kind of coaching. Media reuses existing neutral
demo/* bucket keys — no new assets required.
"""

TENANT = {
    "name": "Coaching Studio",
    "slug": "demo-general",
    "subdomain": "demo-general",
    "schema_name": "demo_general",
    "domain": "demo-general.localhost",
}

CONFIG = {
    "brand_name": "Coaching Studio",
    "dark_mode_enabled": True,
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
        "cta": {"text": "Get Started", "href": "/courses"},
        "show_login": True,
    },
    "landing_sections": {
        "hero": {
            "enabled": True,
            "headline": "Learn with me, at your own pace",
            "subheadline": (
                "Step-by-step programs, personal guidance, and a space to "
                "grow — everything you need to make real progress."
            ),
            "cta_text": "Browse Programs",
            "cta_href": "/courses",
            "bg_image_url": "demo/photos/yoga_10.jpg",
        },
        "about": {
            "enabled": True,
            "heading": "About Me",
            "body": (
                "Hi, I'm so glad you're here. I've spent years helping people "
                "build skills and habits that stick — and this studio brings "
                "everything I teach into one place. Whether you're just "
                "starting out or leveling up, we'll take it one step at a "
                "time, together."
            ),
            "image_url": "demo/photos/yoga_3.jpg",
        },
        "courses": {"enabled": True, "heading": "Programs"},
        "testimonials": {"enabled": False, "heading": "What students say", "items": []},
        "faq": {"enabled": False, "heading": "FAQ", "items": []},
        "cta": {
            "enabled": True,
            "heading": "Ready to start?",
            "button_text": "Join Now",
            "button_href": "/courses",
        },
    },
}

COURSES = [
    {
        "title": "Welcome — Start Here",
        "description": (
            "New here? This short free program shows you how the studio "
            "works, helps you set your first goal, and gets you moving on "
            "day one."
        ),
        "pricing_type": "free",
        "price": 0,
        "order": 1,
        "is_published": True,
        "thumbnail_url": "demo/photos/yoga_1.jpg",
        "module_title": "Getting Started",
        "lessons": [
            {
                "title": "Meet Your Coach",
                "order": 1,
                "video_url": "demo/videos/yoga_1.mp4",
                "duration_seconds": 300,
                "is_free_preview": True,
                "content_html": (
                    "<p>Welcome! In this first lesson I share who I am, how I "
                    "coach, and what you can expect from the programs in this "
                    "studio.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>What this studio offers and how it's organized</li>"
                    "<li>How I'll support you along the way</li>"
                    "<li>What to do right after this lesson</li></ul>"
                ),
            },
            {
                "title": "How This Studio Works",
                "order": 2,
                "video_url": "demo/videos/yoga_2.mp4",
                "duration_seconds": 360,
                "is_free_preview": False,
                "content_html": (
                    "<p>A quick tour: where to find your programs, how to "
                    "track progress, join live sessions, and download "
                    "resources.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Navigate programs, calendar, and downloads</li>"
                    "<li>Pick the right starting program for you</li>"
                    "<li>Where to ask questions when you're stuck</li></ul>"
                ),
            },
            {
                "title": "Set Your First Goal",
                "order": 3,
                "video_url": "demo/videos/yoga_3.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Progress starts with a clear, honest goal. We'll set "
                    "one together — small enough to start this week, big "
                    "enough to matter.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Write a goal you can act on this week</li>"
                    "<li>Break it into three tiny first steps</li>"
                    "<li>Decide when and how you'll practice</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "The Foundations Program",
        "description": (
            "The core program: build solid technique and a routine you can "
            "keep. Four focused sessions take you from scattered effort to "
            "steady progress."
        ),
        "pricing_type": "paid",
        "price": 29,
        "order": 2,
        "is_published": True,
        "thumbnail_url": "demo/photos/yoga_4.jpg",
        "module_title": "Foundations",
        "lessons": [
            {
                "title": "Building Your Routine",
                "order": 1,
                "video_url": "demo/videos/yoga_4.mp4",
                "duration_seconds": 480,
                "is_free_preview": True,
                "content_html": (
                    "<p>A routine beats motivation every time. We'll design a "
                    "weekly rhythm that fits your real life — not an ideal "
                    "one.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Choose your practice days and protect them</li>"
                    "<li>Start small: the 20-minute session rule</li>"
                    "<li>Plan for the week you'll want to quit</li></ul>"
                ),
            },
            {
                "title": "Core Techniques, Step by Step",
                "order": 2,
                "video_url": "demo/videos/yoga_5.mp4",
                "duration_seconds": 540,
                "is_free_preview": False,
                "content_html": (
                    "<p>The essential techniques, broken down slowly with "
                    "checkpoints so you can self-correct as you practice.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Master the fundamentals before adding speed</li>"
                    "<li>Use the checkpoint method to catch mistakes early</li>"
                    "<li>Practice drills for the week ahead</li></ul>"
                ),
            },
            {
                "title": "Staying Consistent",
                "order": 3,
                "video_url": "demo/videos/yoga_6.mp4",
                "duration_seconds": 420,
                "is_free_preview": False,
                "content_html": (
                    "<p>Everyone slips. The skill is coming back. This session "
                    "gives you the tools to restart without guilt and keep "
                    "the streak alive.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>The two-day rule: never miss twice</li>"
                    "<li>Track effort, not perfection</li>"
                    "<li>Design your environment to make practice easy</li></ul>"
                ),
            },
            {
                "title": "Review & Next Steps",
                "order": 4,
                "video_url": "demo/videos/yoga_7.mp4",
                "duration_seconds": 360,
                "is_free_preview": False,
                "content_html": (
                    "<p>Look back at how far you've come, lock in what "
                    "worked, and choose your next challenge.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Review your progress against week one</li>"
                    "<li>Keep the habits that carried you</li>"
                    "<li>Pick your next program with confidence</li></ul>"
                ),
            },
        ],
    },
    {
        "title": "30-Day Momentum Challenge",
        "description": (
            "One month, one focus: momentum. Daily prompts, weekly " "milestones, and a finish line worth celebrating."
        ),
        "pricing_type": "paid",
        "price": 49,
        "order": 3,
        "is_published": True,
        "thumbnail_url": "demo/photos/yoga_7.jpg",
        "module_title": "The Challenge",
        "lessons": [
            {
                "title": "Week 1 — Kickoff",
                "order": 1,
                "video_url": "demo/videos/yoga_8.mp4",
                "duration_seconds": 420,
                "is_free_preview": True,
                "content_html": (
                    "<p>Set your challenge goal, meet your weekly structure, "
                    "and bank your first three wins before the week is "
                    "out.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    '<li>Define what "done" looks like on day 30</li>'
                    "<li>Schedule week one, session by session</li>"
                    "<li>Start your momentum tracker</li></ul>"
                ),
            },
            {
                "title": "Weeks 2–3 — The Deep Work",
                "order": 2,
                "video_url": "demo/videos/yoga_1.mp4",
                "duration_seconds": 540,
                "is_free_preview": False,
                "content_html": (
                    "<p>The middle is where challenges are won. We raise the "
                    "bar a notch and handle the mid-point dip head-on.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Progressively increase difficulty without burnout</li>"
                    "<li>Beat the week-two dip with micro-goals</li>"
                    "<li>Mid-point check-in: adjust, don't abandon</li></ul>"
                ),
            },
            {
                "title": "Final Week — The Push",
                "order": 3,
                "video_url": "demo/videos/yoga_2.mp4",
                "duration_seconds": 480,
                "is_free_preview": False,
                "content_html": (
                    "<p>Bring it home. A focused final week that turns your "
                    "30 days of effort into a lasting habit.</p>"
                    "<h4>Key takeaways</h4><ul>"
                    "<li>Finish strong with a personal-best session</li>"
                    "<li>Capture what changed since day one</li>"
                    "<li>Plan how the habit survives after the challenge</li></ul>"
                ),
            },
        ],
    },
]

DOWNLOADS = [
    {
        "title": "Goal-Setting Worksheet (PDF)",
        "file_url": "demo/photos/yoga_8.jpg",
        "file_size": 1_400_000,
        "download_count": 63,
        "pricing_type": "free",
    },
    {
        "title": "Weekly Planner Template",
        "file_url": "demo/photos/yoga_9.jpg",
        "file_size": 900_000,
        "download_count": 41,
        "pricing_type": "free",
    },
]
