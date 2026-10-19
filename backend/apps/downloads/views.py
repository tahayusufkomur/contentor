from dataclasses import asdict

from django.db.models import F
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.access import ContentAccessService
from apps.core.pagination import StandardPagination, apply_ordering, apply_tag_filter
from apps.core.permissions import IsCoachOrOwner, is_coach_or_owner
from apps.core.storage import generate_presigned_download_url

from .models import DownloadFile
from .serializers import DownloadFileCreateSerializer, DownloadFileSerializer


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def download_list_create(request):
    if request.method == "GET":
        qs = DownloadFile.objects.select_related("thumbnail")
        # Hide orphan rows (file_url="") and unpublished drafts from non-coach/owner users
        if not is_coach_or_owner(request.user):
            qs = qs.exclude(file_url="").filter(is_published=True)
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(title__icontains=search)
        qs = apply_tag_filter(qs, request)
        qs = apply_ordering(qs, request, ["title", "created_at", "file_size"])
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        access_map = ContentAccessService().bulk_check_access(request.user, page)
        return paginator.get_paginated_response(
            DownloadFileSerializer(page, many=True, context={"request": request, "access_map": access_map}).data
        )

    # POST requires coach or owner
    if not is_coach_or_owner(request.user):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    serializer = DownloadFileCreateSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(
        DownloadFileSerializer(serializer.instance).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def download_detail(request, pk):
    download_file = get_object_or_404(DownloadFile, pk=pk)

    if request.method == "GET":  # her download's own page
        return Response(DownloadFileSerializer(download_file, context={"request": request}).data)

    if request.method == "PATCH":
        serializer = DownloadFileCreateSerializer(
            download_file, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(DownloadFileSerializer(download_file).data)

    if request.method == "DELETE":
        download_file.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_url(request, pk):
    download_file = get_object_or_404(DownloadFile, pk=pk)

    # A draft is the coach's alone: to a student it does not exist.
    if not download_file.is_published and not is_coach_or_owner(request.user):
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if not download_file.file_url:
        return Response({"detail": "File not yet available."}, status=status.HTTP_404_NOT_FOUND)

    access_service = ContentAccessService()
    if not access_service.check_access(request.user, download_file):
        info = access_service.get_access_info(request.user, download_file)
        return Response(
            {"detail": "You do not have access to this file.", "access_info": asdict(info)},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Increment download count atomically. The coach opening her own file to
    # check it is not a download.
    if not is_coach_or_owner(request.user):
        DownloadFile.objects.filter(pk=pk).update(download_count=F("download_count") + 1)

    signed_url = generate_presigned_download_url(download_file.file_url)
    return Response({"url": signed_url})
