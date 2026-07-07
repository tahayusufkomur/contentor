from django.http import Http404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from . import services
from .models import Comment, Post, PostStatus, Report
from .permissions import IsCommunityModerator
from .serializers import PostSerializer, ReportSerializer


def _get_or_404(model, **kwargs):
    try:
        return model.objects.get(**kwargs)
    except model.DoesNotExist:
        raise Http404


@api_view(["GET"])
@permission_classes([IsCommunityModerator])
def queue(request):
    reports = (
        Report.objects.filter(status="open")
        .select_related("reporter", "post__author__user", "comment__author__user", "comment__post")
    )
    pending = Post.objects.filter(status=PostStatus.PENDING).select_related("author__user").order_by("created_at")
    return Response(
        {
            "reports": ReportSerializer(reports, many=True).data,
            "pending_posts": PostSerializer(pending, many=True).data,
        }
    )


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def resolve_report_view(request, pk):
    report = _get_or_404(Report, pk=pk, status="open")
    action = request.data.get("action")
    if action not in ("remove", "keep"):
        return Response({"action": ["Must be 'remove' or 'keep'."]}, status=status.HTTP_400_BAD_REQUEST)
    services.resolve_target(
        post=report.post, comment=report.comment, moderator=request.user, action=action
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def pin_post(request, pk):
    post = _get_or_404(Post, pk=pk, status=PostStatus.VISIBLE)
    post.is_pinned = True
    post.save(update_fields=["is_pinned"])
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def unpin_post(request, pk):
    post = _get_or_404(Post, pk=pk)
    post.is_pinned = False
    post.save(update_fields=["is_pinned"])
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def remove_post(request, pk):
    post = _get_or_404(Post, pk=pk)
    services.resolve_target(post=post, moderator=request.user, action="remove")
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def remove_comment(request, pk):
    comment = _get_or_404(Comment, pk=pk)
    services.resolve_target(comment=comment, moderator=request.user, action="remove")
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsCommunityModerator])
def approve_post(request, pk):
    post = _get_or_404(Post, pk=pk, status=PostStatus.PENDING)
    post.status = PostStatus.VISIBLE
    post.save(update_fields=["status"])
    return Response(status=status.HTTP_204_NO_CONTENT)
