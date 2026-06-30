from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from .models import Conversation, Message
from .services import get_or_create_conversation


def receive_inbound(
    *,
    from_email: str,
    to_email: str,
    subject: str,
    text: str = "",
    html: str = "",
    message_id: str = "",
    in_reply_to: str = "",
    references: str = "",
) -> Message | None:
    if message_id and Message.objects.filter(message_id=message_id).exists():
        return None

    conversation = get_or_create_conversation(
        counterparty_email=from_email, subject=subject
    )
    try:
        with transaction.atomic():
            msg = Message.objects.create(
                conversation=conversation,
                direction="inbound",
                from_email=from_email.strip().lower(),
                to_email=to_email.strip().lower(),
                text=text,
                html=html,
                message_id=message_id,
                in_reply_to=in_reply_to,
                references=references,
                is_read=False,
            )
            Conversation.objects.filter(pk=conversation.pk).update(
                unread_count=F("unread_count") + 1,
                last_message_at=timezone.now(),
            )
    except IntegrityError:
        # Concurrent redelivery slipped past the .exists() check — treat as duplicate.
        return None
    conversation.refresh_from_db()
    return msg
