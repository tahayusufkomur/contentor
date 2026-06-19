import uuid

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.core.storage import build_s3_path, generate_presigned_upload_url

from .serializers import PresignRequestSerializer, UploadCompleteSerializer


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def presign(request):
    serializer = PresignRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    filename = data["filename"]
    content_type = data["content_type"]
    category = data["category"]

    # Build a unique S3 key based on category
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    unique_name = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex

    parts = [unique_name]
    if data.get("course_slug"):
        parts.insert(0, data["course_slug"])
    if data.get("lesson_id"):
        parts.insert(-1, str(data["lesson_id"]))
    if data.get("file_id"):
        parts.insert(-1, str(data["file_id"]))

    s3_key = build_s3_path(category, *parts)
    upload_url = generate_presigned_upload_url(s3_key, content_type)

    return Response(
        {
            "upload_url": upload_url,
            "s3_key": s3_key,
            "method": "PUT",
            "headers": {"Content-Type": content_type},
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def complete(request):
    serializer = UploadCompleteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    s3_key = data["s3_key"]
    category = data["category"]

    if category == "video":
        lesson_id = data.get("lesson_id")
        if not lesson_id:
            return Response(
                {"detail": "lesson_id is required for video uploads."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.courses.models import Lesson, Video

        try:
            lesson = Lesson.objects.select_related("video").get(pk=lesson_id)
        except Lesson.DoesNotExist:
            return Response({"detail": "Lesson not found."}, status=status.HTTP_404_NOT_FOUND)

        duration = data.get("duration_seconds", 0)

        if lesson.video:
            lesson.video.s3_key = s3_key
            if duration:
                lesson.video.duration_seconds = duration
            lesson.video.save()
        else:
            video = Video.objects.create(
                title=lesson.title,
                s3_key=s3_key,
                duration_seconds=duration,
            )
            lesson.video = video

        # Keep legacy fields in sync during transition
        lesson.video_url = s3_key
        if duration:
            lesson.duration_seconds = duration
        lesson.save()
        return Response({"detail": "Lesson video updated.", "s3_key": s3_key})

    elif category == "download":
        download_id = data.get("download_id")
        if not download_id:
            return Response(
                {"detail": "download_id is required for download uploads."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.downloads.models import DownloadFile

        try:
            download_file = DownloadFile.objects.get(pk=download_id)
        except DownloadFile.DoesNotExist:
            return Response({"detail": "Download file not found."}, status=status.HTTP_404_NOT_FOUND)
        download_file.file_url = s3_key
        if data.get("file_size"):
            download_file.file_size = data["file_size"]
        download_file.save()
        return Response({"detail": "Download file updated.", "s3_key": s3_key})

    elif category == "library":
        video_id = data.get("video_id")
        if not video_id:
            return Response(
                {"detail": "video_id is required for library uploads."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.courses.models import Video

        try:
            video = Video.objects.get(pk=video_id)
        except Video.DoesNotExist:
            return Response({"detail": "Video not found."}, status=status.HTTP_404_NOT_FOUND)
        video.s3_key = s3_key
        if data.get("duration_seconds"):
            video.duration_seconds = data["duration_seconds"]
        if data.get("file_size"):
            video.file_size = int(data["file_size"])
        video.save()
        return Response({"detail": "Video updated.", "s3_key": s3_key})

    elif category == "branding":
        from apps.core.storage import generate_presigned_download_url
        from apps.media.models import Photo

        photo = Photo.objects.create(
            s3_key=s3_key,
            title="Branding",
            content_type=data.get("content_type", ""),
            file_size=data.get("file_size", 0),
        )
        file_url = generate_presigned_download_url(s3_key, expiry=86400 * 7)
        return Response(
            {
                "detail": "Upload complete.",
                "s3_key": s3_key,
                "file_url": file_url,
                "photo_id": str(photo.id),
            }
        )

    elif category == "photo":
        from apps.core.storage import generate_presigned_download_url
        from apps.media.models import Photo

        photo = Photo.objects.create(
            s3_key=s3_key,
            title=data.get("title", ""),
            content_type=data.get("content_type", ""),
            file_size=data.get("file_size", 0),
        )
        signed_url = generate_presigned_download_url(s3_key, expiry=86400 * 7)
        return Response(
            {
                "detail": "Photo uploaded.",
                "photo_id": str(photo.id),
                "s3_key": s3_key,
                "signed_url": signed_url,
            }
        )

    return Response({"detail": "Invalid category."}, status=status.HTTP_400_BAD_REQUEST)
