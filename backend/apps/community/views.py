import uuid

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.storage import build_s3_path, generate_presigned_upload_url

from .access import get_member_or_deny
from .models import CommunitySettings
from .permissions import is_moderator
from .serializers import (
    CommunityPresignSerializer,
    CommunitySettingsPublicSerializer,
    CommunitySettingsSerializer,
    MemberSerializer,
)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def settings_view(request):
    obj = CommunitySettings.load()
    if request.method == "GET":
        cls = CommunitySettingsSerializer if is_moderator(request.user) else CommunitySettingsPublicSerializer
        return Response(cls(obj).data)
    if not is_moderator(request.user):
        return Response(status=status.HTTP_403_FORBIDDEN)
    serializer = CommunitySettingsSerializer(obj, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):
    member = get_member_or_deny(request, write=(request.method == "PATCH"))
    if request.method == "GET":
        member.last_seen_at = timezone.now()
        member.save(update_fields=["last_seen_at"])
        return Response(MemberSerializer(member).data)
    serializer = MemberSerializer(member, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(MemberSerializer(member).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def presign(request):
    get_member_or_deny(request, write=True)
    serializer = CommunityPresignSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    ext = data["filename"].rsplit(".", 1)[-1] if "." in data["filename"] else ""
    unique_name = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex
    s3_key = build_s3_path("community", unique_name)
    upload_url = generate_presigned_upload_url(s3_key, data["content_type"])
    return Response(
        {
            "upload_url": upload_url,
            "s3_key": s3_key,
            "method": "PUT",
            "headers": {"Content-Type": data["content_type"]},
        }
    )
