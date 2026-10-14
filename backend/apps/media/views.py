from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.pagination import StandardPagination, apply_ordering, apply_tag_filter
from apps.core.permissions import IsCoachOrOwner

from . import own_photos
from .models import Photo
from .serializers import PhotoCreateSerializer, PhotoSerializer


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def photo_list_create(request):
    if request.method == "GET":
        qs = Photo.objects.all()
        search = request.query_params.get("search", "").strip()
        if search:
            # The description too: an indexed photo is found by what it shows.
            qs = qs.filter(Q(title__icontains=search) | Q(alt_text__icontains=search))
        if request.query_params.get("own") == "1":
            qs = qs.exclude(index_status="")
        qs = apply_tag_filter(qs, request)
        qs = apply_ordering(qs, request, ["title", "created_at", "file_size"])
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        serializer = PhotoSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    serializer = PhotoCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    photo = serializer.save()
    own_photos.enqueue_upload(photo)
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

    own_photos.forget(photo)
    photo.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
