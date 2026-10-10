"""Deterministic gates for generated logo candidates, plus the vision
prompts (read-back, judge) and their tolerant parsers. No model opinion
decides a gate: the read-back only transcribes."""

import json
import re
import unicodedata

from apps.core.ai import _strip_fences
from apps.tenant_config import logo_vector

MIN_MARGIN = 0.06
_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
_WS = re.compile(r"\s+")


def normalise(text):
    text = unicodedata.normalize("NFC", str(text or "")).casefold()
    text = _PUNCT.sub(" ", text.replace("-", " ").replace("_", " "))
    return _WS.sub(" ", text).strip()


def text_ok(seen, brand):
    if not isinstance(seen, dict) or seen.get("extra_glyphs"):
        return False
    return normalise(seen.get("text_seen")) == normalise(brand) != ""


def margin_ok(png, background_hex):
    return logo_vector.ink_margin(png, background_hex) >= MIN_MARGIN


def read_back_prompt(files, brand):
    listed = "\n".join(f"- {f}" for f in files)
    return (
        "Open each of these image files with your file viewer (paths are relative to the current directory):\n"
        f"{listed}\n\nEach is a logo. For each file, transcribe EVERY word, letter or character visible, verbatim, "
        f'and say whether there are any glyphs beyond the brand name "{brand}" (extra words, symbols that read as '
        "letters, non-Latin characters, seals with characters).\n"
        'Reply with ONLY a JSON object keyed by file path: {"<path>": {"text_seen": "<verbatim>", '
        '"extra_glyphs": true|false}, ...}'
    )


def parse_read_back(text):
    try:
        data = json.loads(_strip_fences(text))
    except (TypeError, ValueError):
        return {}
    return {k: v for k, v in data.items() if isinstance(v, dict)} if isinstance(data, dict) else {}


def judge_prompt(files, brand, business, mood):
    listed = "\n".join(f"{i}. {f}" for i, f in enumerate(files, 1))
    return (
        f'Open each of these logo candidates for "{brand}" ({business}; brand mood: {mood}) '
        f"with your file viewer:\n{listed}\n\n"
        "Rank ALL of them from best to worst as a senior brand designer would, judging distinctiveness, mark "
        "quality, typography, composition, brand fit and survival at favicon size. "
        "Numbers refer to the list above.\n"
        'Reply with ONLY: {"ranking": [n, ...], "reasons": {"<n>": "<one sentence>"}, '
        '"defects": {"<n>": ["<short, concrete>", ...]}}'
    )


def parse_judge(text, count):
    fallback = {"ranking": list(range(1, count + 1)), "reasons": {}, "defects": {}}
    try:
        data = json.loads(_strip_fences(text))
    except (TypeError, ValueError):
        return fallback
    if not isinstance(data, dict):
        return fallback
    ranking = []
    for n in data.get("ranking") or []:
        if isinstance(n, int) and 1 <= n <= count and n not in ranking:
            ranking.append(n)
    ranking += [n for n in range(1, count + 1) if n not in ranking]
    reasons = {
        int(k): str(v)[:300]
        for k, v in (data.get("reasons") or {}).items()
        if str(k).isdigit() and 1 <= int(k) <= count
    }
    defects = {
        int(k): [str(d)[:120] for d in v][:5]
        for k, v in (data.get("defects") or {}).items()
        if str(k).isdigit() and 1 <= int(k) <= count and isinstance(v, list)
    }
    return {"ranking": ranking, "reasons": reasons, "defects": defects}
