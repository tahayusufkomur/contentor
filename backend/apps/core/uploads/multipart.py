import uuid

from django.conf import settings
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.core.storage import build_s3_path, get_s3_client

# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------


class InitiateSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    content_type = serializers.CharField(max_length=100)
    category = serializers.ChoiceField(choices=["library"])
    video_id = serializers.IntegerField(required=False)
    total_parts = serializers.IntegerField(min_value=1, max_value=10000)


class CompleteSerializer(serializers.Serializer):
    s3_key = serializers.CharField(max_length=500)
    upload_id = serializers.CharField(max_length=500)
    parts = serializers.ListField(child=serializers.DictField(), min_length=1, max_length=10000)
    category = serializers.ChoiceField(choices=["library"])
    video_id = serializers.IntegerField(required=False)
    duration_seconds = serializers.IntegerField(required=False)
    file_size = serializers.IntegerField(required=False)


class AbortSerializer(serializers.Serializer):
    s3_key = serializers.CharField(max_length=500)
    upload_id = serializers.CharField(max_length=500)


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def initiate(request):
    """Create an S3 multipart upload and return upload_id, s3_key, and all presigned part URLs."""
    serializer = InitiateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    filename = data["filename"]
    content_type = data["content_type"]
    category = data["category"]
    total_parts = data["total_parts"]

    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    unique_name = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex
    s3_key = build_s3_path(category, unique_name)

    client = get_s3_client()
    response = client.create_multipart_upload(
        Bucket=settings.AWS_BUCKET_NAME,
        Key=s3_key,
        ContentType=content_type,
    )
    upload_id = response["UploadId"]

    # Presign all part URLs in one go
    part_urls = []
    for part_number in range(1, total_parts + 1):
        url = client.generate_presigned_url(
            "upload_part",
            Params={
                "Bucket": settings.AWS_BUCKET_NAME,
                "Key": s3_key,
                "UploadId": upload_id,
                "PartNumber": part_number,
            },
            ExpiresIn=settings.AWS_PRESIGNED_EXPIRY,
        )
        part_urls.append(url)

    return Response(
        {
            "upload_id": upload_id,
            "s3_key": s3_key,
            "part_urls": part_urls,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def complete(request):
    """Complete the multipart upload and update the associated record."""
    serializer = CompleteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    s3_key = data["s3_key"]
    category = data["category"]
    parts = data["parts"]

    # Validate parts structure
    multipart_parts = []
    for part in parts:
        if "ETag" not in part or "PartNumber" not in part:
            return Response(
                {"detail": "Each part must have ETag and PartNumber."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        multipart_parts.append({"ETag": part["ETag"], "PartNumber": int(part["PartNumber"])})

    client = get_s3_client()
    client.complete_multipart_upload(
        Bucket=settings.AWS_BUCKET_NAME,
        Key=s3_key,
        UploadId=data["upload_id"],
        MultipartUpload={"Parts": multipart_parts},
    )

    # Update the associated record
    if category == "library":
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

    return Response({"detail": "Upload complete.", "s3_key": s3_key})


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def abort(request):
    """Abort a multipart upload to clean up incomplete parts."""
    serializer = AbortSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    client = get_s3_client()
    client.abort_multipart_upload(
        Bucket=settings.AWS_BUCKET_NAME,
        Key=data["s3_key"],
        UploadId=data["upload_id"],
    )

    return Response({"detail": "Upload aborted."})
