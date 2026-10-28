"""Built-in announcement templates (code constants, not DB rows).

Bodies may contain ``%(brand)s`` which is filled from the tenant's brand name at
list time. Merged with coach-saved ``AnnouncementTemplate`` rows in the API.
The texts are lazy: ``builtin_templates`` turns them into the site's language.
"""

from django.utils.translation import gettext_lazy, override, pgettext

from apps.core.languages import site_language

_BUILTINS = [
    {
        "key": "welcome",
        "name": gettext_lazy("Welcome"),
        "title": gettext_lazy("Welcome to %(brand)s! 🎉"),
        "body": gettext_lazy("<p>We're so glad you're here. Take a look around and start exploring.</p>"),
        "link": "",
        "link_label": "",
    },
    {
        "key": "new_course",
        "name": gettext_lazy("New course live"),
        "title": gettext_lazy("A new course just dropped"),
        "body": gettext_lazy("<p>Fresh content is ready for you at %(brand)s. Jump in!</p>"),
        "link": "",
        "link_label": "",
    },
    {
        "key": "live_reminder",
        "name": gettext_lazy("Live session reminder"),
        "title": gettext_lazy("Live session coming up"),
        "body": gettext_lazy("<p>Don't forget — we go live soon. See you there!</p>"),
        "link": "",
        "link_label": "",
    },
    {
        "key": "promo",
        "name": gettext_lazy("Promo / sale"),
        "title": gettext_lazy("A little something for you"),
        "body": gettext_lazy("<p>For a limited time, enjoy a special offer at %(brand)s.</p>"),
        "link": "",
        "link_label": "",
    },
    {
        "key": "we_miss_you",
        "name": gettext_lazy("We miss you"),
        "title": gettext_lazy("We miss you 💛"),
        "body": gettext_lazy("<p>It's been a while — come back and pick up where you left off.</p>"),
        "link": "",
        "link_label": "",
    },
    {
        "key": "schedule_change",
        "name": gettext_lazy("Schedule change"),
        "title": gettext_lazy("A quick schedule update"),
        "body": gettext_lazy("<p>Here's an update to our upcoming schedule. Thanks for your flexibility!</p>"),
        "link": "",
        "link_label": "",
    },
]


def builtin_templates(brand: str) -> list[dict]:
    with override(site_language()):
        b = brand or pgettext("the brand, when the site has none", "us")
        return [
            {
                "id": f"builtin:{t['key']}",
                "builtin": True,
                "name": str(t["name"]),
                "title": str(t["title"]) % {"brand": b},
                "body": str(t["body"]) % {"brand": b},
                "link": t["link"],
                "link_label": t["link_label"],
            }
            for t in _BUILTINS
        ]
