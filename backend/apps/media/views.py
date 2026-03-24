from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.pagination import StandardPagination, apply_ordering
from apps.core.permissions import IsCoachOrOwner

from .models import Photo
from .serializers import PhotoCreateSerializer, PhotoSerializer


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def photo_list_create(request):
    if request.method == "GET":
        qs = Photo.objects.all()
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(title__icontains=search)
        qs = apply_ordering(qs, request, ["title", "created_at", "file_size"])
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = PhotoSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    serializer = PhotoCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    photo = serializer.save()
    return Response(PhotoSerializer(photo).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsCoachOrOwner])
def photo_detail(request, pk):
    try:
        photo = Photo.objects.get(pk=pk)
    except Photo.DoesNotExist:
        return Response({"detail": "Photo not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(PhotoSerializer(photo).data)

    if request.method == "PUT":
        serializer = PhotoCreateSerializer(photo, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(PhotoSerializer(photo).data)

    photo.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
