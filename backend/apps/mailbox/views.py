import json

from django.views.decorators.csrf import csrf_exempt
from django_tenants.utils import tenant_context
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.permissions import IsCoachOrOwner
from apps.domains.models import CustomDomain

from . import services
from .inbound import receive_inbound
from .models import Conversation
from .serializers import (
    ComposeSerializer,
    ConversationDetailSerializer,
    ConversationSerializer,
    ReplySerializer,
)
from .signing import verify_inbound_signature


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


@csrf_exempt
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def inbound(request):
    if not verify_inbound_signature(request.body, request.META.get("HTTP_X_MAILBOX_SIGNATURE", "")):
        return Response(status=status.HTTP_401_UNAUTHORIZED)

    try:
        payload = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return Response(status=status.HTTP_400_BAD_REQUEST)

    to_email = (payload.get("to") or "").strip().lower()
    domain = to_email.rsplit("@", 1)[-1] if "@" in to_email else ""
    cd = CustomDomain.objects.filter(
        domain=domain, mailbox_enabled=True, provisioning_status="live"
    ).first()
    if not cd:
        # Unknown / disabled / not-live recipient — drop without leaking.
        return Response(status=status.HTTP_200_OK)

    with tenant_context(cd.tenant):
        receive_inbound(
            from_email=(payload.get("from") or "").strip(),
            to_email=to_email,
            subject=payload.get("subject") or "",
            text=payload.get("text") or "",
            html=payload.get("html") or "",
            message_id=payload.get("message_id") or "",
            in_reply_to=payload.get("in_reply_to") or "",
            references=payload.get("references") or "",
        )
    return Response(status=status.HTTP_200_OK)
