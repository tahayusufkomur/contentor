from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner

from . import services
from .models import Conversation
from .serializers import (
    ComposeSerializer,
    ConversationDetailSerializer,
    ConversationSerializer,
    ReplySerializer,
)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def conversation_list(request):
    qs = Conversation.objects.all()
    return Response(ConversationSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsCoachOrOwner])
def conversation_detail(request, pk):
    try:
        conv = Conversation.objects.get(pk=pk)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    conv.messages.filter(direction="inbound", is_read=False).update(is_read=True)
    if conv.unread_count:
        conv.unread_count = 0
        conv.save(update_fields=["unread_count"])
    return Response(ConversationDetailSerializer(conv).data)


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def compose(request):
    serializer = ComposeSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    conv = services.get_or_create_conversation(counterparty_email=data["to"], subject=data["subject"])
    msg = services.send_message(conversation=conv, text=data["text"], subject=data["subject"])
    return Response(
        {"conversation_id": conv.id, "message_id": msg.id},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsCoachOrOwner])
def reply(request, pk):
    try:
        conv = Conversation.objects.get(pk=pk)
    except Conversation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    serializer = ReplySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    msg = services.send_message(conversation=conv, text=serializer.validated_data["text"])
    return Response({"message_id": msg.id}, status=status.HTTP_201_CREATED)
