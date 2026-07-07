import uuid

from django.db.models import Q
from django.http import Http404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import CursorPagination, PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.core.storage import build_s3_path, generate_presigned_upload_url

from . import services
from .access import get_member_or_deny
from .models import Comment, CommunitySettings, Post, PostStatus, Reaction
from .permissions import is_moderator
from .serializers import (
    CommentSerializer,
    CommunityPresignSerializer,
    CommunitySettingsPublicSerializer,
    CommunitySettingsSerializer,
    MemberSerializer,
    PostSerializer,
)
from .throttling import CommunityCommentThrottle, CommunityPostThrottle


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


class FeedPagination(CursorPagination):
    page_size = 20
    ordering = ("-created_at", "-id")


def _post_context(member, posts):
    ids = [p.id for p in posts]
    return {
        "my_reactions": {
            r.post_id: r.emoji
            for r in Reaction.objects.filter(member=member, post_id__in=ids)
        }
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def posts(request):
    if request.method == "POST":
        member = get_member_or_deny(request, write=True)
        throttle = CommunityPostThrottle()
        if not throttle.allow_request(request, None):
            return Response(status=status.HTTP_429_TOO_MANY_REQUESTS)
        serializer = PostSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = serializer.save(
            author=member,
            status=PostStatus.PENDING if member.requires_approval else PostStatus.VISIBLE,
        )
        return Response(
            PostSerializer(post, context=_post_context(member, [post])).data,
            status=status.HTTP_201_CREATED,
        )

    member = get_member_or_deny(request)
    qs = (
        Post.objects.filter(
            Q(status=PostStatus.VISIBLE) | Q(status=PostStatus.PENDING, author=member),
            is_pinned=False,
        )
        .select_related("author", "author__user")
    )
    paginator = FeedPagination()
    page = paginator.paginate_queryset(qs, request)
    data = PostSerializer(page, many=True, context=_post_context(member, page)).data
    response = paginator.get_paginated_response(data)
    if not request.query_params.get("cursor"):
        pinned = list(
            Post.objects.filter(status=PostStatus.VISIBLE, is_pinned=True)
            .select_related("author", "author__user")
            .order_by("-created_at")
        )
        response.data["pinned"] = PostSerializer(
            pinned, many=True, context=_post_context(member, pinned)
        ).data
        response.data["welcome_message"] = CommunitySettings.load().welcome_message
    return response


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def post_detail(request, pk):
    member = get_member_or_deny(request, write=True)
    try:
        post = Post.objects.get(pk=pk, author=member)
    except Post.DoesNotExist:
        raise Http404
    if request.method == "DELETE":
        post.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    serializer = PostSerializer(post, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save(edited_at=timezone.now())
    return Response(PostSerializer(post, context=_post_context(member, [post])).data)


def _viewable_post_or_404(member, pk):
    try:
        return Post.objects.get(
            Q(status=PostStatus.VISIBLE) | Q(status=PostStatus.PENDING, author=member), pk=pk
        )
    except Post.DoesNotExist:
        raise Http404


def _comment_context(member, comments):
    ids = [c.id for c in comments]
    return {
        "my_comment_reactions": {
            r.comment_id: r.emoji
            for r in Reaction.objects.filter(member=member, comment_id__in=ids)
        }
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def post_comments(request, pk):
    if request.method == "POST":
        member = get_member_or_deny(request, write=True)
        post = _viewable_post_or_404(member, pk)
        throttle = CommunityCommentThrottle()
        if not throttle.allow_request(request, None):
            return Response(status=status.HTTP_429_TOO_MANY_REQUESTS)
        serializer = CommentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(post=post, author=member)
        services.adjust_comment_count(post, +1)
        return Response(
            CommentSerializer(comment, context=_comment_context(member, [comment])).data,
            status=status.HTTP_201_CREATED,
        )

    member = get_member_or_deny(request)
    post = _viewable_post_or_404(member, pk)
    qs = post.comments.filter(status=PostStatus.VISIBLE).select_related("author", "author__user")
    paginator = PageNumberPagination()
    page = paginator.paginate_queryset(qs, request)
    data = CommentSerializer(page, many=True, context=_comment_context(member, page)).data
    return paginator.get_paginated_response(data)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def comment_detail(request, pk):
    member = get_member_or_deny(request, write=True)
    try:
        comment = Comment.objects.get(pk=pk, author=member)
    except Comment.DoesNotExist:
        raise Http404
    was_visible = comment.status == PostStatus.VISIBLE
    post = comment.post
    comment.delete()
    if was_visible:
        services.adjust_comment_count(post, -1)
    return Response(status=status.HTTP_204_NO_CONTENT)
