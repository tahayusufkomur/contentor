from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from .models import FilterGroup, FilterOption
from .serializers import FilterGroupSerializer, FilterOptionSerializer


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def group_list_create(request):
    if request.method == "GET":
        qs = FilterGroup.objects.prefetch_related("options")
        applies_to = request.query_params.get("applies_to")
        if applies_to in ("course", "event"):
            qs = qs.filter(applies_to__in=[applies_to, "both"])
        return Response(FilterGroupSerializer(qs, many=True).data)

    serializer = FilterGroupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    group = serializer.save()
    return Response(FilterGroupSerializer(group).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsCoachOrOwner])
def group_detail(request, pk):
    group = get_object_or_404(FilterGroup, pk=pk)
    if request.method == "GET":
        return Response(FilterGroupSerializer(group).data)
    if request.method == "PUT":
        serializer = FilterGroupSerializer(group, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(FilterGroupSerializer(group).data)
    group.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def option_list_create(request):
    if request.method == "GET":
        qs = FilterOption.objects.select_related("group")
        group_id = request.query_params.get("group")
        if group_id:
            qs = qs.filter(group_id=group_id)
        return Response(FilterOptionSerializer(qs, many=True).data)

    serializer = FilterOptionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    option = serializer.save()
    return Response(FilterOptionSerializer(option).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsCoachOrOwner])
def option_detail(request, pk):
    option = get_object_or_404(FilterOption, pk=pk)
    if request.method == "GET":
        return Response(FilterOptionSerializer(option).data)
    if request.method == "PUT":
        serializer = FilterOptionSerializer(option, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(FilterOptionSerializer(option).data)
    option.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
