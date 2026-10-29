"""The moments of a coach's video that work as reels, and their captions in another language.

The model picks moments from the timed transcript: runs of whole sentences, 20 to 60 s, that open with a
hook and end on a complete thought, each of a kind (one people send on, a funny one, a strong hook, an
insight) with why it works, a curiosity hook for its cover, a topic label, the post's text, a score and up
to two photo ideas. Without the model (no key, over budget, or it failed) a plain rule picks the liveliest
runs, so a coach always gets reels.

Runs inside the tenant context (reels is a TENANT_APP).
"""

import json
import logging
from decimal import Decimal

from django.conf import settings
from django.db import connection
from pydantic import BaseModel, Field

from apps.core import ai as core_ai
from apps.core import languages
from apps.core.onboarding import ai_compose

from . import words as w

logger = logging.getLogger(__name__)

MIN, TARGET, MAX = 12.0, 20.0, 75.0  # seconds: the shortest kept, the shortest aimed for, the longest
MAX_COUNT = 8
MAX_SENTENCES = 3000  # ~3 hours of talk
LEAD, TAIL = 0.12, 0.3  # kept before a moment's first word and after its last
LABEL = "contentor:reels"
KINDS = ("send", "funny", "hook", "insight")
LANGUAGES = {  # not-site-locales: the caption languages
    "en": "English",
    "de": "German",
    "es": "Spanish",
    "fr": "French",
    "it": "Italian",
    "nl": "Dutch",
    "pl": "Polish",
    "pt": "Portuguese",
    "tr": "Turkish",
}

# Static (prompt caching): the video's transcript travels in the user turn.
PICK_SYSTEM = (
    "You pick the moments of a coach's video that can go viral as short vertical clips (Instagram Reels, "
    "TikTok, YouTube Shorts). You get the transcript as numbered sentences with their start and end times in "
    "seconds, how many moments are wanted, and the time ranges already used (never pick sentences inside "
    "them).\n"
    "Each moment is a run of whole sentences, first to last, of 20 to 60 seconds that makes sense on its own "
    "to someone who never saw the video: it opens strongly, delivers one clear idea, tip, laugh or story, and "
    "ends on a complete thought. Look for four kinds of moment:\n"
    "- send: one a viewer would send to a friend: a relatable truth, a fix for a common pain, 'this is so "
    "you';\n"
    "- funny: a laugh, a light or self-mocking moment, a surprising turn;\n"
    "- hook: a bold claim, a myth busted, a common mistake, a surprising fact, a promise the clip keeps;\n"
    "- insight: an interesting idea, story or tip worth saving.\n"
    "Prefer moments where the coach speaks to the viewer directly. Moments never overlap. Fewer good moments "
    "beat padding.\n"
    "For each moment write, in the language of the transcript:\n"
    "- kind: send, funny, hook or insight;\n"
    "- why: one short sentence, to the coach, on why people would watch it to the end or send it on;\n"
    "- title: the hook on the clip's cover, at most 8 words, that opens a question the clip answers "
    "(curiosity the clip pays off, never a false promise); wrap the one word that carries it in *stars*; no "
    "hashtags, no emoji, no quotation marks;\n"
    "- label: the topic in one to three words, for a series label on the cover;\n"
    "- caption: the post's text, one or two short sentences true to what is said, then 3 to 5 relevant "
    "hashtags;\n"
    "- score: 1 to 10, how likely it stops someone scrolling, is watched to the end and is sent on;\n"
    "- photos: 0 to 2 ideas for a photo shown over the clip for a moment, each the number of the sentence it "
    "illustrates and a short search query in English for a photo of a concrete scene or object (no text).\n"
    "Never invent a claim, number, name or result the transcript does not state."
)
TRANSLATE_SYSTEM = (
    "You translate the captions of a short video. You get numbered lines, as they appear on screen one after "
    "another, and the language to translate them into. Translate each line into that language, keeping its "
    "meaning and a natural spoken tone, about as short as the original. Return exactly one line for each line "
    "given, in the same order: never merge, split, add or drop a line. No quotation marks."
)


class PhotoIdea(BaseModel):
    sentence: int
    query: str


class Pick(BaseModel):
    first: int
    last: int
    kind: str = ""
    why: str = ""
    title: str
    label: str = ""
    caption: str = ""
    score: int = 5
    photos: list[PhotoIdea] = Field(default_factory=list)


class Picks(BaseModel):
    moments: list[Pick]


class Lines(BaseModel):
    lines: list[str]


class TranslationError(Exception):
    """The captions could not be translated now, in words safe to show the coach."""


def _overlaps(a, b, c, d) -> bool:
    return min(b, d) - max(a, c) > 0.3 * min(b - a, d - c)


def _span(sents, first: int, last: int) -> tuple[float, float]:
    """The moment's stretch: a little before its first word to a little after its last, never into the next."""
    start = max(0.0, sents[first]["start"] - LEAD)
    end = sents[last]["end"] + TAIL
    if last + 1 < len(sents):
        end = min(end, max(sents[last]["end"], sents[last + 1]["start"] - 0.05))
    return round(start, 3), round(end, 3)


def _fit(sents, first: int, last: int) -> tuple[int, int] | None:
    """first..last grown or trimmed by whole sentences to MIN..MAX s; None when it can't be."""
    while last > first and sents[last]["end"] - sents[first]["start"] > MAX:
        last -= 1
    while (
        sents[last]["end"] - sents[first]["start"] < TARGET
        and last + 1 < len(sents)
        and sents[last + 1]["end"] - sents[first]["start"] <= MAX
    ):
        last += 1
    seconds = sents[last]["end"] - sents[first]["start"]
    return (first, last) if MIN <= seconds <= MAX else None


def title_of(text: str) -> str:
    """A hook fit for the screen: no quotes or hashtags, at most 80 characters."""
    words = [
        part for part in text.replace('"', "").replace("“", "").replace("”", "").split() if not part.startswith("#")
    ]
    return " ".join(words)[:80].strip()


def _accept(picks, sents, count: int, taken) -> list[dict]:
    out, busy = [], list(taken)
    for pick in sorted(picks, key=lambda p: -p.score):
        if not 0 <= pick.first <= pick.last < len(sents):
            continue
        fitted = _fit(sents, pick.first, pick.last)
        if fitted is None:
            continue
        start, end = _span(sents, *fitted)
        if any(_overlaps(start, end, a, b) for a, b in busy):
            continue
        busy.append((start, end))
        ideas = [
            {"at": round(sents[idea.sentence]["start"], 3), "query": idea.query.strip()[:80]}
            for idea in pick.photos[:2]
            if fitted[0] <= idea.sentence <= fitted[1] and idea.query.strip()
        ]
        out.append(
            {
                "start": start,
                "end": end,
                "kind": pick.kind.strip().lower() if pick.kind.strip().lower() in KINDS else "",
                "why": " ".join(pick.why.split())[:200],
                "title": title_of(pick.title),
                "label": " ".join(pick.label.split())[:40],
                "caption": pick.caption.strip()[:800],
                "score": max(1, min(10, pick.score)),
                "ideas": ideas,
            }
        )
        if len(out) == count:
            break
    return out


def by_rule(sents, count: int, taken=()) -> list[dict]:
    """The liveliest runs of whole sentences (most words a second, questions, talk to the viewer)."""
    candidates = []
    for i in range(len(sents)):
        fitted = _fit(sents, i, i)
        if fitted is None:
            continue
        run = sents[fitted[0] : fitted[1] + 1]
        seconds = run[-1]["end"] - run[0]["start"]
        text = " ".join(s["text"] for s in run)
        lowered = f" {text.lower()}"
        score = (
            len(text.split()) / seconds
            + 0.5 * text.count("?")
            + 0.3 * (lowered.count(" you ") + lowered.count(" your "))
        )
        candidates.append((score, fitted))
    out, busy = [], list(taken)
    for _score, (first, last) in sorted(candidates, key=lambda c: -c[0]):
        start, end = _span(sents, first, last)
        if any(_overlaps(start, end, a, b) for a, b in busy):
            continue
        busy.append((start, end))
        opening = sents[first]["text"].split()
        title = " ".join(opening[:8]).rstrip(".,;:!?…") + ("…" if len(opening) > 8 else "")
        caption = " ".join(s["text"] for s in sents[first : last + 1])
        out.append(
            {
                "start": start,
                "end": end,
                "kind": "",
                "why": "",
                "title": title_of(title),
                "label": "",
                "caption": caption[:220].rsplit(" ", 1)[0] + "…" if len(caption) > 220 else caption,
                "score": max(1, 8 - len(out)),
                "ideas": [],
            }
        )
        if len(out) == count:
            break
    return out


def _ask(video, sents, count: int, taken, label: str):
    turn = {
        "video": video.title[:200],
        "language": video.captions_language or "",
        "count": count,
        "taken": [[round(a, 1), round(b, 1)] for a, b in taken],
        "sentences": [[i, round(s["start"], 1), round(s["end"], 1), s["text"][:400]] for i, s in enumerate(sents)],
    }
    parsed, cost, _model = core_ai.structured(
        system=PICK_SYSTEM,
        user=json.dumps(turn, ensure_ascii=False),
        output_model=Picks,
        model=settings.COPILOT_MODEL,
        max_tokens=12000,
        label=label,
        effort="medium",
        timeout_seconds=240,
        language=languages.Mixed(languages.creator_language(), languages.site_language()),
    )
    return parsed.moments, cost


def pick(video, count: int, taken=(), label: str = LABEL) -> list[dict]:
    """Up to `count` moments of the video, none overlapping `taken` ([(start, end)]): the model's, else the
    rule's. `label` tags the model's run (a search nobody waits on runs as background on the hub)."""
    sents = w.sentences(w.words_of(video))[:MAX_SENTENCES]
    if not sents:
        return []
    count = max(1, min(MAX_COUNT, count))
    chosen = []
    if ai_compose.compose_available():
        cost = Decimal("0")
        try:
            picks, cost = _ask(video, sents, count, taken, label)
            chosen = _accept(picks, sents, count, taken)
        except core_ai.AiError as exc:
            cost = exc.cost_usd
            logger.warning("reels: the model picked no moments of video %s: %s", video.pk, exc)
        finally:
            ai_compose.record_spend(connection.schema_name, cost)
    return chosen or by_rule(sents, count, taken)


def translate(lines: list[str], language: str) -> list[str]:
    """The captions' lines in `language` (a LANGUAGES code), one for one. Raises TranslationError."""
    if not lines:
        return []
    if not ai_compose.compose_available():
        raise TranslationError("Translated captions are not on for this site right now.")
    turn = {"language": LANGUAGES.get(language, language), "lines": [[i + 1, line] for i, line in enumerate(lines)]}
    cost = Decimal("0")
    try:
        parsed, cost, _model = core_ai.structured(
            system=TRANSLATE_SYSTEM,
            user=json.dumps(turn, ensure_ascii=False),
            output_model=Lines,
            model=settings.COPILOT_MODEL,
            max_tokens=4000,
            label=LABEL,
            effort="low",
            timeout_seconds=90,
            language=language if language in languages.CODES else None,
        )
    except core_ai.AiError as exc:
        cost = exc.cost_usd
        raise TranslationError("The captions could not be translated. Try again.") from exc
    finally:
        ai_compose.record_spend(connection.schema_name, cost)
    if len(parsed.lines) != len(lines):
        raise TranslationError("The captions could not be translated. Try again.")
    return [line.strip().strip('"“”') for line in parsed.lines]
