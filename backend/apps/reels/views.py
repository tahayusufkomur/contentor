"""The reels studio's API (/api/v1/reels/): the coach's videos, the ideas found in them, editing a reel and
its cover, and making it into a file to download. Coach and owner only, but for the cover and the end card
the browser sidecar reads with a signed token."""

import re
import uuid

from django.conf import settings
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext as _
from django.utils.translation import ngettext
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.core.slugs import slugify
from apps.core.storage import generate_presigned_download_url, get_s3_client, is_signable_key, sign_if_s3_key
from apps.courses.models import Video

from . import ass, covers, fonts, framing, jobs, moments, render
from . import words as w
from .models import Reel

COUNTS = (1, 2, 3, 4, 5)
_MADE = (Reel.DRAFT, Reel.RENDERING, Reel.READY, Reel.FAILED)  # a reel she works on, not an idea
MIN_LENGTH, MAX_LENGTH = 5.0, 180.0
KEEP_LEAST = 2.0  # seconds of the clip the studio's cuts must leave
MOST_CUTS, MOST_RETYPED, MOST_CUTAWAYS = 100, 1000, 6
WORDS_AROUND = 30.0  # seconds of words around the stretch sent to the editor, for trimming
_BOOLEAN_OPTIONS = ("cuts", "cover", "progress", "end_card", "clean_audio", "cutaways")


def _thumbnail(video) -> str | None:
    if video.thumbnail_id and video.thumbnail and video.thumbnail.s3_key:
        return generate_presigned_download_url(video.thumbnail.s3_key) or None
    return sign_if_s3_key(video.thumbnail_url) or None


def _video_row(video, counts, ideas) -> dict:
    return {
        "id": video.pk,
        "title": video.title,
        "duration": video.duration_seconds,
        "thumbnail": _thumbnail(video),
        "words": jobs.words_state(video),
        "search": jobs.search_state(video.pk),
        "reels": counts.get(video.pk, 0),
        "ideas": ideas.get(video.pk, 0),
        "created_at": video.created_at.isoformat(),
    }


def _brand(found_kit) -> dict:
    """What a cover is drawn in, besides the reel's own: the site's name, look and colours."""
    return {k: found_kit[k] for k in ("name", "look", "colors", "highlight")}


def _summary(reel) -> dict:
    current = jobs.status_of(reel)
    return {
        "id": str(reel.pk),
        "video": reel.video_id,
        "video_title": reel.video.title,
        "start": reel.start,
        "end": reel.end,
        "title": reel.title,
        "caption": reel.caption,
        "score": reel.score,
        "kind": reel.kind,
        "why": reel.why,
        "cover": covers.card(reel),
        "status": current,
        "error": reel.error or (_("The video could not be made. Try again.") if current != reel.status else ""),
        "stale": current == Reel.READY and reel.rendered != render.fingerprint(reel),
        "file": {"size": reel.file_size, "duration": reel.duration} if reel.file_key else None,
        "made_by": reel.made_by,
        "created_at": reel.created_at.isoformat(),
    }


def _detail(reel) -> dict:
    from apps.media.models import Photo

    video = reel.video
    words = render.words_of(reel)
    kept = render.spans(reel, words)
    found_kit = render.kit()
    placed = render.cutaways_on_reel(reel, kept)
    photos = {str(p.pk): p for p in Photo.objects.filter(pk__in=[c["photo"] for c in placed if c["photo"]])}
    faces = reel.faces or {}
    roles = fonts.roles(reel.style, found_kit["fonts"])
    return {
        **_summary(reel),
        "cover": {**covers.card(reel, found_kit), "frame": (covers.frame_of(reel) or {}).get("key", "")},
        "frames": [{**f, "url": generate_presigned_download_url(f["key"])} for f in reel.frames or [] if f.get("key")],
        "cover_file": bool(reel.cover_key),
        "style": reel.style,
        "layout": reel.layout,
        "options": render.options_of(reel),
        "source": {
            "id": video.pk,
            "url": generate_presigned_download_url(video.s3_key) if video.s3_key else "",
            "duration": video.duration_seconds or (words[-1][1] if words else 0),
            "language": video.captions_language,
            "width": faces.get("width"),
            "height": faces.get("height"),
        },
        "words": [list(word) for word in w.inside(words, reel.start - WORDS_AROUND, reel.end + WORDS_AROUND)],
        "keep": kept,
        "frame": framing.frame_of(reel),
        "translation": render.phrases(reel),
        "cutaways": [
            {
                "start": c["start"],
                "end": c["end"],
                "url": generate_presigned_download_url(photos[c["photo"]].s3_key),
                "at": c["at"],
                "photo": c["photo"],
            }
            for c in placed
            if c["photo"] in photos
        ],
        "edits": reel.edits or {},
        "ideas": reel.ideas,
        "brand": {
            "colors": found_kit["colors"],
            "highlight": found_kit["highlight"],
            "edge": ass.edge(found_kit["colors"]),
            "look": found_kit["look"],
            "fonts": {
                role: {"family": family, "weight": weight, "ratio": fonts.line_ratio(fonts.ttf(family, weight))}
                for role, (family, weight) in roles.items()
            },
            "look_fonts": {
                "display": found_kit["fonts"].get("display") or fonts.BOLD[0],
                "body": found_kit["fonts"].get("body") or found_kit["fonts"].get("display") or fonts.BOLD[0],
            },
        },
        "end_card": render.end_card_of(reel, found_kit),
        "file_url": _file_url(reel) if reel.file_key else None,
        "render": render.available(),
    }


def _file_url(reel, download: bool = False, key: str = "", ext: str = "mp4") -> str:
    """A link to the reel's video (or, with `key`, another of its files); `download` saves it under its hook."""
    key = key or reel.file_key
    if not is_signable_key(key):
        return ""
    params = {"Bucket": settings.AWS_BUCKET_NAME, "Key": key}
    if download:
        name = slugify(reel.title)[:60] or "reel"
        params["ResponseContentDisposition"] = f'attachment; filename="{name}.{ext}"'
    return get_s3_client(external=True).generate_presigned_url("get_object", Params=params, ExpiresIn=3600)


def _counts(**where) -> dict:
    rows = Reel.objects.filter(**where).values_list("video").annotate(n=Count("id")).values_list("video", "n")
    return dict(rows)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def video_list(request):
    """The coach's videos, each with where its words and its search stand, and how many reels and ideas it
    has; and what covers are drawn in."""
    videos = list(Video.objects.exclude(s3_key="").select_related("thumbnail").order_by("-created_at")[:200])
    reels, ideas = _counts(status__in=_MADE), _counts(status=Reel.IDEA)
    return Response(
        {
            "render": render.available(),
            "brand": _brand(render.kit()),
            "videos": [_video_row(v, reels, ideas) for v in videos],
        }
    )


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def reel_list(request):
    """The coach's reels, or with `?ideas=1` the ideas found in a video (`?video=`), best first."""
    reels = Reel.objects.select_related("video")
    video = request.query_params.get("video")
    if video:
        if not video.isdigit():
            return Response({"detail": _("video is a video's id.")}, status=400)
        reels = reels.filter(video_id=int(video))
    if request.query_params.get("ideas") == "1":
        reels = reels.filter(status=Reel.IDEA).order_by("-score", "start")
    else:
        reels = reels.exclude(status=Reel.IDEA)
    return Response([_summary(r) for r in reels[:300]])


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def search_start(request):
    """Find `count` more reel ideas in a video: `{"video": id, "count": 1-5}`."""
    data = request.data if isinstance(request.data, dict) else {}
    try:
        count = int(data.get("count", 3))
        video = Video.objects.filter(pk=int(data.get("video"))).first()
    except (TypeError, ValueError):
        return Response({"detail": _("Send a video and how many reels to make.")}, status=400)
    if video is None or count not in COUNTS or not video.s3_key:
        return Response({"detail": _("Send one of your videos and 1 to 5 reels.")}, status=400)
    try:
        state = jobs.start_search(video, count)
    except jobs.JobError as exc:
        return Response({"detail": str(exc)}, status=409)
    return Response(state, status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def search_status(request, video_id):
    get_object_or_404(Video, pk=video_id)
    return Response(jobs.search_state(video_id))


def _number(value, low: float, high: float) -> float | None:
    """`value` as a number in [low, high], else None."""
    if isinstance(value, bool) or not isinstance(value, int | float) or not low <= value <= high:
        return None
    return round(float(value), 4)


def _apply_edits(reel, given, words) -> str | None:
    """The studio's hand edits onto the reel: each one sent replaces what was there, None (or blank) undoes
    it. The reason they are refused, else None."""
    if not isinstance(given, dict):
        return _("Send the edits as an object.")
    edits = dict(reel.edits or {})
    if "cuts" in given:
        cuts = given["cuts"] or []
        if not isinstance(cuts, list) or len(cuts) > MOST_CUTS:
            return _("Send the stretches cut out as a list.")
        spans = []
        for cut in cuts:
            a = _number(cut[0], 0, 1e6) if isinstance(cut, list) and len(cut) == 2 else None
            b = _number(cut[1], 0, 1e6) if a is not None else None
            if b is None or b <= a:
                return _("Each stretch cut out is [start, end] in the video's seconds.")
            spans.append([round(a, 3), round(b, 3)])
        merged = []
        for a, b in sorted(spans):
            if merged and a <= merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], b)
            else:
                merged.append([a, b])
        edits["cuts"] = merged
    if "text" in given:
        typed = given["text"] or {}
        if not isinstance(typed, dict) or len(typed) > MOST_RETYPED:
            return _("Send the retyped words by their start.")
        starts = {s: text for s, _e, text in words}
        retyped = {}
        for key, value in typed.items():
            try:
                at = float(key)
            except (TypeError, ValueError):
                return _("A retyped word is one of the video's words, by its start.")
            found = next((s for s in starts if abs(s - at) < 0.001), None)
            if found is None:
                return _("A retyped word is one of the video's words, by its start.")
            text = " ".join(str(value or "").split())[:60]
            if text:  # (it keeps the space Scribe wrote before the word)
                retyped[str(found)] = re.match(r"\s*", starts[found]).group(0) + text
        edits["text"] = retyped
    for key, low, high in (("caption_at", 0.05, 0.8), ("caption_size", 0.6, 1.6), ("centre", 0.0, 1.0)):
        if key in given:
            if given[key] is None:
                edits.pop(key, None)
                continue
            value = _number(given[key], low, high)
            if value is None:
                return _("%(key)s is a number from %(low)s to %(high)s.") % {"key": key, "low": low, "high": high}
            edits[key] = value
    reel.edits = {k: v for k, v in edits.items() if v not in ({}, [], None)}
    return None


def _apply_cutaways(reel, given) -> str | None:
    """The photos over the clip as the studio placed them: [{"at": the video's second, "photo": id}]."""
    from apps.media.models import Photo

    if not isinstance(given, list) or len(given) > MOST_CUTAWAYS:
        return _("Send the photos over the clip as a list.")
    placed = []
    for cut in given:
        at = _number(cut.get("at"), 0, 1e6) if isinstance(cut, dict) else None
        try:
            photo = str(uuid.UUID(str(cut.get("photo")))) if at is not None else None
        except ValueError:
            photo = None
        if photo is None:
            return _("Each photo over the clip is {at, photo}.")
        placed.append({"at": round(at, 3), "photo": photo})
    known = {str(pk) for pk in Photo.objects.filter(pk__in=[c["photo"] for c in placed]).values_list("pk", flat=True)}
    if any(c["photo"] not in known for c in placed):
        return _("Choose one of the photos found for this reel.")
    reel.cutaways = placed
    return None


def _apply(reel, data, length_cap, words) -> str | None:
    """The PATCH's fields onto the reel in memory; the reason it is refused, else None."""
    if "title" in data:
        reel.title = " ".join(str(data["title"] or "").split())[:120]  # as typed: "#1 tip" keeps its "#1"
    if "cover" in data:
        given = data["cover"] if isinstance(data["cover"], dict) else {}
        cover = dict(reel.cover or {})
        if "design" in given:
            if given["design"] not in covers.DESIGNS:
                return _("Choose one of the cover designs.")
            cover["design"] = given["design"]
        if "frame" in given:
            if given["frame"] not in [f.get("key") for f in reel.frames or []]:
                return _("Choose one of the video's frames for the cover.")
            cover["frame"] = given["frame"]
        if "label" in given:
            cover["label"] = " ".join(str(given["label"] or "").split())[:40]
        reel.cover = cover
    if "caption" in data:
        reel.caption = str(data["caption"] or "")[:2200]
    if "style" in data:
        if data["style"] not in ass.STYLES:
            return _("Choose a caption style.")
        reel.style = data["style"]
    if "layout" in data:
        if data["layout"] not in framing.LAYOUTS:
            return _("Choose how the video is framed.")
        reel.layout = data["layout"]
    if "start" in data or "end" in data:
        try:
            start, end = float(data.get("start", reel.start)), float(data.get("end", reel.end))
        except (TypeError, ValueError):
            return _("Start and end are seconds.")
        if start < 0 or end > length_cap + 0.5 or not MIN_LENGTH <= end - start <= MAX_LENGTH:
            return _("A reel is %(low)d s to %(high)d min of the video.") % {
                "low": int(MIN_LENGTH),
                "high": int(MAX_LENGTH // 60),
            }
        reel.start, reel.end = round(start, 3), round(end, 3)
    if "options" in data:
        given = data["options"] if isinstance(data["options"], dict) else {}
        chosen = "language" in (reel.options or {})
        options = render.options_of(reel)
        for key, value in given.items():
            if key in _BOOLEAN_OPTIONS:
                options[key] = bool(value)
            elif key == "language":
                if value not in ("", *moments.LANGUAGES):
                    return _("Choose one of the caption languages.")
                options[key] = value
            elif key == "end_text":
                options[key] = str(value or "")[:80]
        if not chosen and "language" not in given:
            options.pop("language", None)  # the site's default is derived each time, never saved as her choice
        reel.options = options
    if "edits" in data:
        refused = _apply_edits(reel, data["edits"], words)
        if refused:
            return refused
    if "cutaways" in data:
        refused = _apply_cutaways(reel, data["cutaways"])
        if refused:
            return refused
    if ("edits" in data or "start" in data or "end" in data) and w.length_of(render.spans(reel, words)) < KEEP_LEAST:
        return ngettext(
            "Keep at least %(n)d second of the clip.",
            "Keep at least %(n)d seconds of the clip.",
            int(KEEP_LEAST),
        ) % {"n": int(KEEP_LEAST)}
    return None


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def reel_detail(request, pk):
    reel = get_object_or_404(Reel.objects.select_related("video"), pk=pk)
    if request.method == "GET":
        return Response(_detail(reel))
    if request.method == "DELETE":
        reel.delete()  # (its file with it: models._forget_file)
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = request.data if isinstance(request.data, dict) else {}
    words = w.words_of(reel.video)
    cap = max(reel.video.duration_seconds or 0, words[-1][1] if words else 0, reel.end)
    was = (reel.start, reel.end, reel.layout)
    refused = _apply(reel, data, cap, words)
    if refused:
        return Response({"detail": refused}, status=400)
    options = render.options_of(reel)
    # Only a language she chose is translated here; the site's default is translated where the reel is made.
    chosen = (reel.options or {}).get("language")
    if chosen and chosen != reel.video.captions_language and render.phrases(reel) is None:
        try:
            reel.translation = render.translate(reel)
        except moments.TranslationError as exc:
            if "language" in (data.get("options") if isinstance(data.get("options"), dict) else {}):
                return Response({"detail": str(exc)}, status=502)
            # An edit to a reel already set to a language is saved; the render tries the translation again.
    if options["cutaways"] and not reel.cutaways and reel.ideas:
        reel.cutaways = render.find_photos(reel)
    reel.save()
    if (reel.start, reel.end, reel.layout) != was and reel.layout == "auto" and not framing.scanned(reel):
        jobs.start_scan(reel)
    return Response(_detail(reel))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def reel_use(request, pk):
    """An idea she picked: from now on a reel she works on."""
    reel = get_object_or_404(Reel.objects.select_related("video"), pk=pk)
    if reel.status == Reel.IDEA:
        Reel.objects.filter(pk=reel.pk).update(status=Reel.DRAFT)
        reel.status = Reel.DRAFT
    return Response(_detail(reel))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def reel_render(request, pk):
    reel = get_object_or_404(Reel.objects.select_related("video"), pk=pk)
    try:
        jobs.start_render(reel)
    except jobs.JobError as exc:
        return Response({"detail": str(exc)}, status=409)
    return Response(_summary(reel), status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def reel_download(request, pk):
    reel = get_object_or_404(Reel.objects.select_related("video"), pk=pk)
    if not reel.file_key or jobs.status_of(reel) != Reel.READY:
        return Response({"detail": _("Make the video first.")}, status=409)
    return Response({"url": _file_url(reel, download=True)})


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def cover_download(request, pk):
    """A link that downloads the cover as made with the video, to post as the reel's cover."""
    reel = get_object_or_404(Reel.objects.select_related("video"), pk=pk)
    if not reel.cover_key or jobs.status_of(reel) != Reel.READY:
        return Response({"detail": _("Make the video first.")}, status=409)
    return Response({"url": _file_url(reel, download=True, key=reel.cover_key, ext="png")})


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def cover_card(request, token):
    """What the cover page draws, for a token this site signed in the last two minutes (render.cover)."""
    reel_id = render.read_token(token)
    reel = Reel.objects.select_related("video").filter(pk=reel_id).first() if reel_id else None
    if reel is None:
        return Response({"detail": _("Not found.")}, status=status.HTTP_404_NOT_FOUND)
    return Response(covers.card(reel, render.kit()))


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def end_card(request, token):
    """What the end card page draws, for a token this site signed in the last two minutes (render.end_card),
    which is how the browser sidecar reads it."""
    reel_id = render.read_token(token)
    reel = Reel.objects.select_related("video").filter(pk=reel_id).first() if reel_id else None
    if reel is None:
        return Response({"detail": _("Not found.")}, status=status.HTTP_404_NOT_FOUND)
    return Response(render.end_card_of(reel))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def dev_words(request, video_id):
    """Dev only (DEBUG, for e2e): give a video the words Scribe would, without Scribe; with `"reel": true`, also an
    idea picked from them by rule (the model is slow and never the same twice), its faces scanned and its
    cover frames found (in the video service's order: no model looks at them).
    `{"words": [[start, end, text], ...], "language": "en", "reel": true}`."""
    video = get_object_or_404(Video, pk=video_id)
    data = request.data if isinstance(request.data, dict) else {}
    given = data.get("words")
    if not isinstance(given, list):
        return Response({"detail": _("Send words.")}, status=400)
    Video.objects.filter(pk=video.pk).update(
        captions_key=video.s3_key,
        captions_job="",
        captions_words=given,
        captions_language=str(data.get("language") or "en")[:8],
    )
    out = {"words": len(given)}
    if data.get("reel"):
        video.refresh_from_db()
        picked = moments.by_rule(w.sentences(w.words_of(video)), 1)
        if not picked:
            return Response({"detail": _("Too few words for a reel.")}, status=400)
        found = picked[0]
        reel = Reel.objects.create(
            video=video,
            status=Reel.IDEA,
            kind="hook",
            why="It opens with a question everyone has.",
            start=found["start"],
            end=found["end"],
            title=found["title"],
            caption=found["caption"],
            score=7,
        )
        jobs.scan(reel)
        covers.find(reel)
        out["reel"] = str(reel.pk)
    return Response(out)
