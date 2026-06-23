"""Built-in announcement templates (code constants, not DB rows).

Bodies may contain ``{brand}`` which is filled from the tenant's brand name at
list time. Merged with coach-saved ``AnnouncementTemplate`` rows in the API.
"""

_BUILTINS = [
    {
        "key": "welcome",
        "name": "Welcome",
        "title": "Welcome to {brand}! 🎉",
        "body": "<p>We're so glad you're here. Take a look around and start exploring.</p>",
        "link": "",
        "link_label": "",
    },
    {
        "key": "new_course",
        "name": "New course live",
        "title": "A new course just dropped",
        "body": "<p>Fresh content is ready for you at {brand}. Jump in!</p>",
        "link": "",
        "link_label": "",
    },
    {
        "key": "live_reminder",
        "name": "Live session reminder",
        "title": "Live session coming up",
        "body": "<p>Don't forget — we go live soon. See you there!</p>",
        "link": "",
        "link_label": "",
    },
    {
        "key": "promo",
        "name": "Promo / sale",
        "title": "A little something for you",
        "body": "<p>For a limited time, enjoy a special offer at {brand}.</p>",
        "link": "",
        "link_label": "",
    },
    {
        "key": "we_miss_you",
        "name": "We miss you",
        "title": "We miss you 💛",
        "body": "<p>It's been a while — come back and pick up where you left off.</p>",
        "link": "",
        "link_label": "",
    },
    {
        "key": "schedule_change",
        "name": "Schedule change",
        "title": "A quick schedule update",
        "body": "<p>Here's an update to our upcoming schedule. Thanks for your flexibility!</p>",
        "link": "",
        "link_label": "",
    },
]


def builtin_templates(brand: str) -> list[dict]:
    b = brand or "us"
    out = []
    for t in _BUILTINS:
        out.append(
            {
                "id": f"builtin:{t['key']}",
                "builtin": True,
                "name": t["name"],
                "title": t["title"].format(brand=b),
                "body": t["body"].format(brand=b),
                "link": t["link"],
                "link_label": t["link_label"],
            }
        )
    return out
