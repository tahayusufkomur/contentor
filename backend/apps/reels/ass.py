"""A reel's captions as an ASS file, which the video service draws with libass: the words appear a few at a
time and each lights up as it is said, in one of three styles, in the coach's colours and fonts.

The font is written as `@caption`: the video service puts in the family of the file it fetched for it
(fonts.py). Pure functions; times on the reel's clock (words.reel_words).
"""

import re

STYLES = ("bold", "clean", "brand")
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
# words, characters at most on screen at once
_GROUP = {"bold": (3, 16), "clean": (6, 30), "brand": (4, 22)}
GROUP_GAP = 0.45  # a pause this long starts a new group of words
HOLD = 0.5  # a group stays this long after its last word, unless the next comes first
YELLOW = "#FFD43B"
# Where the captions sit (px on 1080x1920, from the bottom), clear of the apps' buttons and caption. A fitted
# frame is a band in the middle: the captions under it.
_MARGINS = {"crop": 600, "fit": 440}


def luminance(colour: str) -> float:
    def linear(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (int(colour[i : i + 2], 16) / 255 for i in (1, 3, 5))
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)


def highlight(colors: dict) -> str:
    """The colour a word lights up in: the accent, else the primary colour, if it reads over video; else a
    warm yellow."""
    for name in ("accent", "primary"):
        colour = colors.get(name) or ""
        if HEX.match(colour) and luminance(colour) >= 0.15:
            return colour
    return YELLOW


def edge(colors: dict) -> str:
    """The brand style's outline: the primary colour when it is dark enough under white words."""
    colour = colors.get("primary") or ""
    return colour if HEX.match(colour) and luminance(colour) < 0.4 else "#111111"


def _bgr(colour: str, alpha: int = 0) -> str:
    """#rrggbb as an ASS style colour, &HAABBGGRR (alpha 0 = opaque)."""
    return f"&H{alpha:02X}{colour[5:7]}{colour[3:5]}{colour[1:3]}".upper()


def _tag(colour: str) -> str:
    """#rrggbb as an override tag's colour, &HBBGGRR&."""
    return f"&H{colour[5:7]}{colour[3:5]}{colour[1:3]}&".upper()


def _time(t: float) -> str:
    cs = int(round(max(0.0, t) * 100))
    hours, rest = divmod(cs, 360000)
    minutes, rest = divmod(rest, 6000)
    seconds, cs = divmod(rest, 100)
    return f"{hours}:{minutes:02}:{seconds:02}.{cs:02}"


def clean(text: str) -> str:
    """Text safe in an ASS line: no override braces or backslashes, one line."""
    return re.sub(r"\s+", " ", re.sub(r"[{}\\]", "", text)).strip()


def upper(text: str, language: str) -> str:
    if language in ("tr", "az"):  # dotted and dotless i
        text = text.replace("i", "İ").replace("ı", "I")
    return text.upper()


def _ends(text: str) -> bool:
    return text.strip().rstrip("\"')]»”’").endswith((".", "?", "!", "…", "。", "？", "！"))


def groups(words, style: str) -> list[list]:
    """The words in the groups shown at once: a few at a time, a sentence's end or a pause starting the next."""
    most_words, most_chars = _GROUP[style]
    out, current = [], []
    for word in words:
        if current:
            chars = len("".join(w[2] for w in [*current, word]).strip())
            if (
                len(current) >= most_words
                or chars > most_chars
                or word[0] - current[-1][1] >= GROUP_GAP
                or _ends(current[-1][2])
            ):
                out.append(current)
                current = []
        current.append(word)
    if current:
        out.append(current)
    return out


def _styles(style: str, colors: dict, layout: str) -> list[str]:
    below = _MARGINS.get(layout, _MARGINS["crop"])
    white, black = "&H00FFFFFF", "&H00000000"
    if style == "clean":
        caption = f"62,{white},{white},&H60000000,&H60000000,-1,0,0,0,100,100,0,0,3,14,0,2,110,110,{below}"
    elif style == "brand":
        caption = f"76,{white},{white},{_bgr(edge(colors))},{black},-1,0,0,0,100,100,0,0,1,8,0,2,90,90,{below}"
    else:
        caption = f"86,{white},{white},{black},&H80000000,-1,0,0,0,100,100,1,0,1,7,3,2,90,90,{below}"
    return [f"Style: Caption,@caption,{caption},1"]


def build(*, words, length: float, style: str, colors: dict, language: str = "", layout="crop", phrases=None) -> str:
    """The ASS file: `words` ([[start, end, text]] on the reel's clock) lighting up a word at a time; or,
    translated, `phrases` ([{"start", "end", "text"}]) one at a time. "" when there is nothing to draw."""
    style = style if style in STYLES else "bold"
    lit = _tag(highlight(colors))
    grow = r"\fscx112\fscy112" if style == "bold" else ""
    events = []

    def shown(text):
        text = clean(text)
        return upper(text, language) if style == "bold" else text

    if phrases is not None:
        for phrase in phrases:
            text = shown(str(phrase.get("text") or ""))
            start, end = float(phrase.get("start", 0)), min(length, float(phrase.get("end", 0)))
            if text and end > start:
                events.append(f"Dialogue: 1,{_time(start)},{_time(end)},Caption,,0,0,0,,{{\\fad(60,0)}}{text}")
    else:
        runs = groups([w for w in words if w[0] < length], style)
        for i, run in enumerate(runs):
            last = min(length, run[-1][1] + HOLD)
            if i + 1 < len(runs):
                last = min(last, runs[i + 1][0][0])
            pieces = [(re.match(r"\s*", w[2]).group(0) if j else "", shown(w[2])) for j, w in enumerate(run)]
            for j, word in enumerate(run):
                start = word[0] if j else run[0][0]
                end = run[j + 1][0] if j + 1 < len(run) else last
                if end - start < 0.04:
                    continue
                text = "".join(
                    f"{lead}{{\\c{lit}{grow}}}{piece}{{\\r}}" if k == j else f"{lead}{piece}"
                    for k, (lead, piece) in enumerate(pieces)
                )
                fade = r"{\fad(60,0)}" if j == 0 else ""
                events.append(f"Dialogue: 1,{_time(start)},{_time(end)},Caption,,0,0,0,,{fade}{text}")
    if not events:
        return ""
    head = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "WrapStyle: 0",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
        "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, "
        "MarginR, MarginV, Encoding",
        *_styles(style, colors, layout),
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    return "\n".join(head + events) + "\n"
