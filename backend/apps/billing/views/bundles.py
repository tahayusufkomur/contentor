from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.billing.models import Bundle
from apps.billing.serializers import BundleCreateSerializer, BundleDetailSerializer, BundleListSerializer
from apps.core.permissions import is_coach_or_owner


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
    # A draft is hers alone: students and visitors see only what is on sale.
    if not is_coach_or_owner(request.user):
        qs = qs.filter(is_published=True)
    serializer = BundleListSerializer(qs, many=True, context={"request": request})
    return Response(serializer.data)


def _bundle_create(request):
    serializer = BundleCreateSerializer(data=request.data, context={"request": request})
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
        # A draft is the coach's alone: to a student or visitor it does not exist.
        if not bundle.is_published and not is_coach_or_owner(request.user):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = BundleDetailSerializer(bundle, context={"request": request})
        return Response(serializer.data)

    if request.method == "PATCH":
        if not request.user.is_authenticated or request.user.role != "owner":
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        serializer = BundleCreateSerializer(bundle, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        bundle = serializer.save()
        return Response(BundleDetailSerializer(bundle, context={"request": request}).data)

    if request.method == "DELETE":
        if not request.user.is_authenticated or request.user.role != "owner":
            return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)
        bundle.is_active = False
        bundle.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
