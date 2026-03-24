from dataclasses import asdict

from django.db.models import F
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.core.access import ContentAccessService
from apps.core.pagination import StandardPagination, apply_ordering
from apps.core.permissions import IsCoachOrOwner
from apps.core.storage import generate_presigned_download_url

from .models import DownloadFile
from .serializers import DownloadFileCreateSerializer, DownloadFileSerializer


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def download_list_create(request):
    if request.method == "GET":
        qs = DownloadFile.objects.all()
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(title__icontains=search)
        qs = apply_ordering(qs, request, ["title", "created_at", "file_size"])
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request)
        access_map = {}
        if request.user.is_authenticated:
            service = ContentAccessService()
            access_map = service.bulk_check_access(request.user, page)
        return paginator.get_paginated_response(
            DownloadFileSerializer(page, many=True, context={"request": request, "access_map": access_map}).data
        )

    # POST requires coach or owner
    if not request.user.is_authenticated or request.user.role not in ("owner", "coach"):
        return Response({"detail": "Permission denied."}, status=status.HTTP_403_FORBIDDEN)

    serializer = DownloadFileCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(
        DownloadFileSerializer(serializer.instance).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def download_detail(request, pk):
    download_file = get_object_or_404(DownloadFile, pk=pk)

    if request.method == "PATCH":
        serializer = DownloadFileCreateSerializer(download_file, data=request.data, partial=True)
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

    access_service = ContentAccessService()
    if not access_service.check_access(request.user, download_file):
        info = access_service.get_access_info(request.user, download_file)
        return Response(
            {"detail": "You do not have access to this file.", "access_info": asdict(info)},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Increment download count atomically
    DownloadFile.objects.filter(pk=pk).update(download_count=F("download_count") + 1)

    signed_url = generate_presigned_download_url(download_file.file_url)
    return Response({"url": signed_url})
