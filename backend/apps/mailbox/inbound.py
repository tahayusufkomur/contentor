import base64
import logging

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from .attachments import store_attachment, validate_attachment
from .models import Conversation, Message, MessageAttachment
from .services import get_or_create_conversation

logger = logging.getLogger(__name__)


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
    attachments: list[dict] | None = None,
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
            for att in attachments or []:
                filename = (att.get("filename") or "attachment")[:255]
                content_type = (att.get("content_type") or "")[:100]
                size = int(att.get("size") or 0)
                content_b64 = att.get("content_b64") or ""
                omitted = bool(att.get("omitted"))
                storage_key = ""
                if not omitted and content_b64 and validate_attachment(filename, content_type, size) is None:
                    try:
                        storage_key = store_attachment(
                            base64.b64decode(content_b64), filename, content_type
                        )
                    except Exception:
                        logger.exception("mailbox inbound attachment store failed: %s", filename)
                        omitted = True
                else:
                    omitted = True
                MessageAttachment.objects.create(
                    message=msg,
                    filename=filename,
                    content_type=content_type,
                    size=size,
                    storage_key=storage_key,
                    omitted=omitted,
                )
    except IntegrityError:
        # Concurrent redelivery slipped past the .exists() check — treat as duplicate.
        return None
    conversation.refresh_from_db()
    return msg
