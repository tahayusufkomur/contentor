from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from .models import SCOPE_VALUES, Tag
from .serializers import TagSerializer


@api_view(["GET", "POST"])
@permission_classes([IsCoachOrOwner])
def tag_list_create(request):
    if request.method == "GET":
        qs = Tag.objects.all()
        scope = request.query_params.get("scope")
        if scope in SCOPE_VALUES:
            qs = qs.filter(scope=scope)
        return Response(TagSerializer(qs, many=True).data)

    scope = (request.data.get("scope") or "").strip()
    name = (request.data.get("name") or "").strip()
    if scope not in SCOPE_VALUES:
        return Response({"scope": ["Invalid scope."]}, status=status.HTTP_400_BAD_REQUEST)
    if not name:
        return Response({"name": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)

    # Free-text create: reuse an existing tag with the same name in this scope
    # rather than spawning a near-duplicate (e.g. "Webinar" twice).
    slug = slugify(name)[:120] or "tag"
    existing = Tag.objects.filter(scope=scope, slug=slug).first()
    if existing is not None:
        return Response(TagSerializer(existing).data, status=status.HTTP_200_OK)

    tag = Tag.objects.create(scope=scope, name=name)
    return Response(TagSerializer(tag).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsCoachOrOwner])
def tag_detail(request, pk):
    tag = get_object_or_404(Tag, pk=pk)
    if request.method == "GET":
        return Response(TagSerializer(tag).data)
    if request.method in ("PUT", "PATCH"):
        # Only the display name is editable; renaming re-derives the slug.
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"name": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)
        tag.name = name
        tag.slug = ""  # force save() to re-slugify + de-dupe within the scope
        tag.save()
        return Response(TagSerializer(tag).data)
    tag.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
