from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.billing.models import Bundle
from apps.billing.serializers import BundleCreateSerializer, BundleDetailSerializer, BundleListSerializer


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def bundle_list_create(request):
    if request.method == "GET":
        return _bundle_list(request)
    # POST requires owner
    if not request.user.is_authenticated or request.user.role != "owner":
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
    return _bundle_create(request)


def _bundle_list(request):
    qs = Bundle.objects.filter(is_active=True)
    serializer = BundleListSerializer(qs, many=True, context={"request": request})
    return Response(serializer.data)


def _bundle_create(request):
    serializer = BundleCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    bundle = serializer.save()
    return Response(
        BundleDetailSerializer(bundle, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([AllowAny])
def bundle_detail(request, pk):
    bundle = get_object_or_404(Bundle, pk=pk)

    if request.method == "GET":
        serializer = BundleDetailSerializer(bundle, context={"request": request})
        return Response(serializer.data)

    if request.method == "PATCH":
        if not request.user.is_authenticated or request.user.role != "owner":
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = BundleCreateSerializer(bundle, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        bundle = serializer.save()
        return Response(BundleDetailSerializer(bundle, context={"request": request}).data)

    if request.method == "DELETE":
        if not request.user.is_authenticated or request.user.role != "owner":
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        bundle.is_active = False
        bundle.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
