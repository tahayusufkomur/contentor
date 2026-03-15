import uuid

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.core.storage import build_s3_path, generate_presigned_upload_url

from .serializers_upload import PresignRequestSerializer, UploadCompleteSerializer


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
        from apps.courses.models import Lesson

        try:
            lesson = Lesson.objects.get(pk=lesson_id)
        except Lesson.DoesNotExist:
            return Response({"detail": "Lesson not found."}, status=status.HTTP_404_NOT_FOUND)
        lesson.video_url = s3_key
        if data.get("duration_seconds"):
            lesson.duration_seconds = data["duration_seconds"]
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

    elif category == "branding":
        from apps.tenant_config.models import TenantConfig

        config = TenantConfig.objects.first()
        if not config:
            return Response({"detail": "Tenant config not found."}, status=status.HTTP_404_NOT_FOUND)
        config.logo_url = s3_key
        config.save()
        return Response({"detail": "Branding updated.", "s3_key": s3_key})

    return Response({"detail": "Invalid category."}, status=status.HTTP_400_BAD_REQUEST)
