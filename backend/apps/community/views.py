from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import CommunitySettings
from .permissions import is_moderator
from .serializers import CommunitySettingsPublicSerializer, CommunitySettingsSerializer


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
