"""The reels studio's API (/api/v1/reels/): the coach's videos, finding their moments, editing a reel, and
making it into a file to download. Coach and owner only, but for the end card the browser sidecar reads with
a signed token."""

from django.conf import settings
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.core.storage import generate_presigned_download_url, get_s3_client, is_signable_key, sign_if_s3_key
from apps.courses.models import Video

from . import ass, fonts, framing, jobs, moments, render
from . import words as w
from .models import Reel

COUNTS = (1, 2, 3, 4, 5)
MIN_LENGTH, MAX_LENGTH = 5.0, 180.0
WORDS_AROUND = 30.0  # seconds of words around the stretch sent to the editor, for trimming
_BOOLEAN_OPTIONS = ("cuts", "title", "progress", "end_card", "clean_audio", "cutaways")


def _thumbnail(video) -> str | None:
    if video.thumbnail_id and video.thumbnail and video.thumbnail.s3_key:
        return generate_presigned_download_url(video.thumbnail.s3_key) or None
    return sign_if_s3_key(video.thumbnail_url) or None


def _video_row(video, counts) -> dict:
    return {
        "id": video.pk,
        "title": video.title,
        "duration": video.duration_seconds,
        "thumbnail": _thumbnail(video),
        "words": jobs.words_state(video),
        "search": jobs.search_state(video.pk),
        "reels": counts.get(video.pk, 0),
        "created_at": video.created_at.isoformat(),
    }


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
        "status": current,
        "error": reel.error or ("The video could not be made. Try again." if current != reel.status else ""),
        "stale": current == Reel.READY and reel.rendered != render.fingerprint(reel),
        "file": {"size": reel.file_size, "duration": reel.duration} if reel.file_key else None,
        "made_by": reel.made_by,
        "created_at": reel.created_at.isoformat(),
    }


def _detail(reel) -> dict:
    from apps.media.models import Photo

    video = reel.video
    words = w.words_of(video)
    kept = render.spans(reel, words)
    found_kit = render.kit()
    placed = render.cutaways_on_reel(reel, kept)
    photos = {str(p.pk): p for p in Photo.objects.filter(pk__in=[c["photo"] for c in placed if c["photo"]])}
    faces = reel.faces or {}
    roles = fonts.roles(reel.style, found_kit["fonts"])
    return {
        **_summary(reel),
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
            {"start": c["start"], "end": c["end"], "url": generate_presigned_download_url(photos[c["photo"]].s3_key)}
            for c in placed
            if c["photo"] in photos
        ],
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


def _file_url(reel, download: bool = False) -> str:
    if not is_signable_key(reel.file_key):
        return ""
    params = {"Bucket": settings.AWS_BUCKET_NAME, "Key": reel.file_key}
    if download:
        name = slugify(reel.title)[:60] or "reel"
        params["ResponseContentDisposition"] = f'attachment; filename="{name}.mp4"'
    return get_s3_client(external=True).generate_presigned_url("get_object", Params=params, ExpiresIn=3600)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def video_list(request):
    """The coach's videos, each with where its words and its search stand."""
    videos = list(Video.objects.exclude(s3_key="").select_related("thumbnail").order_by("-created_at")[:200])
    counts = dict(Reel.objects.values_list("video").annotate(n=Count("id")).values_list("video", "n"))
    return Response({"render": render.available(), "videos": [_video_row(v, counts) for v in videos]})


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def reel_list(request):
    reels = Reel.objects.select_related("video")
    video = request.query_params.get("video")
    if video:
        if not video.isdigit():
            return Response({"detail": "video is a video's id."}, status=400)
        reels = reels.filter(video_id=int(video))
    return Response([_summary(r) for r in reels[:300]])


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def search_start(request):
    """Find `count` reels in a video: `{"video": id, "count": 1-5}`."""
    data = request.data if isinstance(request.data, dict) else {}
    try:
        count = int(data.get("count", 3))
        video = Video.objects.filter(pk=int(data.get("video"))).first()
    except (TypeError, ValueError):
        return Response({"detail": "Send a video and how many reels to make."}, status=400)
    if video is None or count not in COUNTS or not video.s3_key:
        return Response({"detail": "Send one of your videos and 1 to 5 reels."}, status=400)
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


def _apply(reel, data, length_cap) -> str | None:
    """The PATCH's fields onto the reel in memory; the reason it is refused, else None."""
    if "title" in data:
        reel.title = moments.title_of(str(data["title"] or ""))[:120]
    if "caption" in data:
        reel.caption = str(data["caption"] or "")[:2200]
    if "style" in data:
        if data["style"] not in ass.STYLES:
            return "Choose a caption style."
        reel.style = data["style"]
    if "layout" in data:
        if data["layout"] not in framing.LAYOUTS:
            return "Choose how the video is framed."
        reel.layout = data["layout"]
    if "start" in data or "end" in data:
        try:
            start, end = float(data.get("start", reel.start)), float(data.get("end", reel.end))
        except (TypeError, ValueError):
            return "Start and end are seconds."
        if start < 0 or end > length_cap + 0.5 or not MIN_LENGTH <= end - start <= MAX_LENGTH:
            return f"A reel is {int(MIN_LENGTH)} s to {int(MAX_LENGTH // 60)} min of the video."
        reel.start, reel.end = round(start, 3), round(end, 3)
    if "options" in data:
        given = data["options"] if isinstance(data["options"], dict) else {}
        options = render.options_of(reel)
        for key, value in given.items():
            if key in _BOOLEAN_OPTIONS:
                options[key] = bool(value)
            elif key == "language":
                if value not in ("", *moments.LANGUAGES):
                    return "Choose one of the caption languages."
                options[key] = value
            elif key == "end_text":
                options[key] = str(value or "")[:80]
        reel.options = options
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
    refused = _apply(reel, data, cap)
    if refused:
        return Response({"detail": refused}, status=400)
    options = render.options_of(reel)
    if options["language"] and options["language"] != reel.video.captions_language and render.phrases(reel) is None:
        try:
            reel.translation = render.translate(reel)
        except moments.TranslationError as exc:
            return Response({"detail": str(exc)}, status=502)
    if options["cutaways"] and not reel.cutaways and reel.ideas:
        reel.cutaways = render.find_photos(reel)
    reel.save()
    if (reel.start, reel.end, reel.layout) != was and reel.layout == "auto" and not framing.scanned(reel):
        jobs.start_scan(reel)
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
        return Response({"detail": "Make the video first."}, status=409)
    return Response({"url": _file_url(reel, download=True)})


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def end_card(request, token):
    """What the end card page draws, for a token this site signed in the last two minutes (render.end_card),
    which is how the browser sidecar reads it."""
    reel_id = render.read_token(token)
    reel = Reel.objects.select_related("video").filter(pk=reel_id).first() if reel_id else None
    if reel is None:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(render.end_card_of(reel))


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def dev_words(request, video_id):
    """Dev only (DEBUG, for e2e): give a video the words Scribe would, without Scribe; with `"reel": true`, also a
    draft reel picked from them by rule (the model is slow and never the same twice), its faces scanned.
    `{"words": [[start, end, text], ...], "language": "en", "reel": true}`."""
    video = get_object_or_404(Video, pk=video_id)
    data = request.data if isinstance(request.data, dict) else {}
    given = data.get("words")
    if not isinstance(given, list):
        return Response({"detail": "Send words."}, status=400)
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
            return Response({"detail": "Too few words for a reel."}, status=400)
        found = picked[0]
        reel = Reel.objects.create(
            video=video, start=found["start"], end=found["end"], title=found["title"], caption=found["caption"], score=7
        )
        jobs.scan(reel)
        out["reel"] = str(reel.pk)
    return Response(out)
