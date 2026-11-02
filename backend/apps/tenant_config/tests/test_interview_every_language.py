"""Every question of the setup interview, walked in every language. A tile goes back as the words it shows
(question-screen sends the ticked labels), so each one must map back to the option it stands for, a tile code
applies must be taken (a refused one asks the same question again), and no English may be left on the screen."""

import copy
import re

import pytest
from django.utils.translation import override

from apps.core import languages
from apps.tenant_config import interview
from apps.tenant_config import interview_brief as brief

pytestmark = pytest.mark.django_db

BRAND = "Mira Studio"
# What she offers decides which questions follow; how she picks decides the branches after it.
PROFILES = ("Yoga", "Face yoga, Yoga", "Yoga, Nutrition", "Dance, Pilates, Meditation", "Pottery")
STRATEGIES = ("first", "last", "all")
OTHERS = [code for code in languages.CODES if code != languages.DEFAULT]


def _pick(field, options, strategy):
    if not options:
        return ""
    if strategy == "all" and field.multi:
        return ", ".join(o for o in options if o != field.alone)
    return options[0] if strategy == "first" else options[-1]


def _walk(teaches, strategy):
    """(field, the answers she had when it was asked), in the order she meets them."""
    answers, seen = {}, []
    while (pending := brief.missing(answers)) and len(seen) < 80:
        field = pending[0]
        seen.append((field, copy.deepcopy(answers)))
        pick = teaches if field.id == "teaches" else _pick(field, brief.options_for(field, answers, BRAND)[0], strategy)
        if not (pick and brief.apply_fact(answers, field.id, pick)):
            answers.setdefault("delegated", []).append(field.id)
    return seen


def _screens():
    """Every question once per distinct set of tiles it showed, across the profiles and strategies."""
    screens = {}
    for teaches in PROFILES:
        for strategy in STRATEGIES:
            for field, answers in _walk(teaches, strategy):
                key = (field.id, tuple(brief.options_for(field, answers, BRAND)[0]))
                screens.setdefault(key, (field, answers))
    return list(screens.values())


def _shown(guide: dict) -> list[tuple[str, str]]:
    """The words on a question's screen, each with where it sits."""
    rows = [("question", guide["question"]), ("why", guide["why"]), ("skip", guide["skip"] or "")]
    rows += [(f"tile {i}", o) for i, o in enumerate(guide["options"])]
    rows += [(f"hint {i}", h) for i, h in enumerate(guide["hints"].values())]
    rows += [(f"detail {i}", d) for i, d in enumerate(guide["details"].values())]
    rows += [(f"help {k}", v) for k, v in sorted((guide["help"] or {}).items()) if k not in ("sign", "picture")]
    return [(where, str(text)) for where, text in rows if str(text).strip()]


def test_the_walk_meets_the_questions_the_branches_open(tenant_ctx):
    met = {field.id for field, _ in _screens()}
    assert {"teaches", "specialty", "discipline_focus", "offers", "payments", "course_topic", "live_when"} <= met
    assert len(met) > 30


@pytest.mark.parametrize("lang", languages.CODES)
def test_every_tile_goes_back_to_the_option_it_stands_for(tenant_ctx, lang):
    wrong = []
    with override(lang):
        for field, answers in _screens():
            options = brief.options_for(field, answers, BRAND)[0]
            shown = [brief.tx(o) for o in options]
            for option, label in zip(options, shown, strict=True):
                back = brief.english_picks(label, field, answers, BRAND)
                if back != option:
                    wrong.append(f"{field.id}: {label!r} reads as {back!r}, not {option!r}")
            if field.multi and len(options) > 1:
                back = brief.english_picks(", ".join(shown), field, answers, BRAND)
                if back != ", ".join(options):
                    wrong.append(f"{field.id}: all its tiles read as {back!r}")
            if len(set(shown)) != len(shown):
                wrong.append(f"{field.id}: two tiles read the same: {shown}")
    assert wrong == []


@pytest.mark.parametrize("lang", languages.CODES)
def test_a_tile_code_applies_is_taken(tenant_ctx, lang):
    refused = []
    with override(lang):
        for field, answers in _screens():
            if field.id not in ("teaches", "specialty") and not interview._code_owned(field):
                continue  # her words go to the model, which reads them
            if field.kind in ANSWERED_AS_DATA or field.starter:
                continue  # sent as a choice with its own value, not as the tiles' words
            options = brief.options_for(field, answers, BRAND)[0]
            picks = list(options) + ([", ".join(o for o in options if o != field.alone)] if field.multi else [])
            for pick in picks:
                after = copy.deepcopy(answers)
                taken = interview._is_tapped(pick, field.id, after, BRAND) and brief.apply_fact(after, field.id, pick)
                if not taken or field.id in [f.id for f in brief.missing(after)]:
                    refused.append(f"{field.id}: {pick!r}")
    assert refused == []


@pytest.mark.parametrize("lang", languages.CODES)
def test_every_question_opens_like_a_sentence(tenant_ctx, lang):
    # A translation may open on a name lower-cased for the middle of the English ("yüz yogası dışında…").
    with override(lang):
        lower = [
            f"{field.id}: {question!r}"
            for field, answers in _screens()
            if (question := interview.guide_for(field, answers=answers, brand=BRAND)["question"])[:1].islower()
        ]
        assert brief.sentence("iyi") == ("İyi" if lang == "tr" else "Iyi")
    assert lower == []


@pytest.mark.parametrize("lang", OTHERS)
def test_no_english_is_left_on_a_question_screen(tenant_ctx, lang):
    ours = {name for name in brief._known_names().values() if len(name) > 3}
    left = []
    for field, answers in _screens():
        with override(languages.DEFAULT):
            english = _shown(interview.guide_for(field, answers=answers, brand=BRAND))
        with override(lang):
            local = _shown(interview.guide_for(field, answers=answers, brand=BRAND))
            translated = {name: brief.tx(name) for name in ours}
        for (where, theirs), (_where, mine) in zip(english, local, strict=True):
            same = SAME_IN_ANY_LANGUAGE | SAME_IN.get(lang, set())
            if mine == theirs and re.search(r"[A-Za-z]{3}", mine) and mine not in same:
                left.append(f"{field.id} {where}: {mine!r}")
                continue
            for name, shown in translated.items():
                if shown.lower() != name.lower() and re.search(rf"(?<![\w-]){re.escape(name)}(?![\w-])", mine, re.I):
                    left.append(f"{field.id} {where}: {name!r} in {mine!r}")
    assert sorted(set(left)) == []


# The question-screen sends these as a choice whose value is data (handles, prices, dates, details), not words.
ANSWERED_AS_DATA = ("schedule", "socials", "contact", "address", "timezone", "memberships")
# Words a screen shows as they are in English: names (networks, a currency, our studio in the examples), and
# per language the words it shares with English, each checked by reading (Polish has its own for all of them).
SAME_IN_ANY_LANGUAGE = {
    BRAND,
    "Instagram",
    "WhatsApp",
    "YouTube",
    "TikTok",
    "Facebook",
    "LinkedIn",
    "Euro (€)",
    "Pilates",
}
SAME_IN = {
    "tr": {
        *("Yoga", "Vinyasa yoga", "Hatha yoga", "Yin yoga", "Ashtanga yoga", "Kundalini yoga", "Power yoga"),
        *("Mat pilates", "Reformer pilates", "Hip hop", "Salsa & bachata"),
    },
    "de": {"Yoga", "Meditation", "Community", "Warm", "Sexy"},
}
