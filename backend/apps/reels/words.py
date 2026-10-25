"""A video's words as reels use them: Scribe's [[start, end, text], ...] (courses.Video.captions_words, each
text with its leading space) made into sentences for the moment picker, and into the stretches a reel keeps
once its pauses are cut. Pure functions; times in seconds.
"""

FPS = 30
PAUSE = 0.6  # a silence longer than this between two words is cut out of a reel
PAD = 0.15  # what a cut leaves of the silence on each side, so no word starts or ends abruptly
SENTENCE_GAP = 1.0  # a silence this long ends a sentence, full stop or not
SENTENCE_WORDS = 40  # a run-on sentence is cut here
_ENDS = (".", "?", "!", "…", "。", "？", "！")
_CLOSERS = "\"')]»”’"


def words_of(video) -> list[tuple[float, float, str]]:
    """The video's words, any malformed one left out."""
    out = []
    for item in video.captions_words or []:
        try:
            start, end, text = float(item[0]), float(item[1]), str(item[2])
        except (TypeError, ValueError, IndexError):
            continue
        if end >= start and text.strip():
            out.append((start, end, text))
    return out


def ends_sentence(text: str) -> bool:
    return text.strip().rstrip(_CLOSERS).endswith(_ENDS)


def text_of(words) -> str:
    return "".join(w[2] for w in words).strip()


def sentences(words) -> list[dict]:
    """The words as sentences: [{"start", "end", "text", "first", "last"}], first/last being word indexes."""
    out, first = [], 0
    for i, word in enumerate(words):
        last = i == len(words) - 1
        gap = 0.0 if last else words[i + 1][0] - word[1]
        if last or ends_sentence(word[2]) or gap >= SENTENCE_GAP or i - first + 1 >= SENTENCE_WORDS:
            run = words[first : i + 1]
            out.append({"start": run[0][0], "end": run[-1][1], "text": text_of(run), "first": first, "last": i})
            first = i + 1
    return out


def frame(t: float) -> float:
    """t on a whole frame."""
    return round(round(t * FPS) / FPS, 3)


def inside(words, start: float, end: float) -> list:
    return [w for w in words if w[1] > start and w[0] < end]


def keep(words, start: float, end: float, cut: bool = True) -> list[list[float]]:
    """The stretches of [start, end] a reel keeps, counted from `start`, on whole frames: all of it, or with
    every pause longer than PAUSE cut down to PAD on each side of the words around it."""
    length = frame(end - start)
    spoken = inside(words, start, end)
    if not cut or len(spoken) < 2:
        return [[0.0, length]]
    spans, a = [], start
    for before, after in zip(spoken, spoken[1:], strict=False):
        if after[0] - before[1] > PAUSE:
            spans.append((a, before[1] + PAD))
            a = after[0] - PAD
    spans.append((a, end))
    out = []
    for s, e in spans:
        s, e = max(0.0, frame(s - start)), min(length, frame(e - start))
        if e - s >= 0.2:
            out.append([s, e])
    return out or [[0.0, length]]


def length_of(spans) -> float:
    return round(sum(b - a for a, b in spans), 3)


def on_reel(t: float, start: float, spans) -> float | None:
    """A time of the video on the reel's own clock (its cuts taken out), or None when it falls in a cut. A
    time a hair before a kept stretch (a word rounded onto its frame) counts as its start."""
    rel, out = t - start, 0.0
    for a, b in spans:
        if rel < a:
            return round(out, 3) if a - rel <= 0.2 else None
        if rel <= b:
            return round(out + rel - a, 3)
        out += b - a
    return None


def reel_words(words, start: float, end: float, spans) -> list[tuple[float, float, str]]:
    """The words of [start, end] on the reel's clock."""
    out = []
    for s, e, text in inside(words, start, end):
        rs = on_reel(max(s, start), start, spans)
        if rs is None:
            continue
        re_ = on_reel(min(e, end), start, spans)
        out.append((rs, re_ if re_ is not None and re_ >= rs else round(rs + e - s, 3), text))
    return out
