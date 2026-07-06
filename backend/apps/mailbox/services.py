import base64
import uuid

from django.conf import settings
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from django.utils.html import escape
from django_tenants.utils import get_public_schema_name

from apps.accounts.models import User
from apps.core.email import send_email
from apps.tenant_config.defaults import sanitize_rich_text

from .attachments import MAX_FILES_PER_MESSAGE, read_attachment
from .identity import sending_identity
from .models import Conversation, Message, MessageAttachment


def new_message_id(domain_hint: str = "contentor.app") -> str:
    return f"<{uuid.uuid4().hex}@{domain_hint}>"


def get_or_create_conversation(*, counterparty_email: str, subject: str = "") -> Conversation:
    email = counterparty_email.strip().lower()
    conv = Conversation.objects.filter(counterparty_email=email, is_archived=False).first()
    if conv:
        return conv
    student = User.objects.filter(email__iexact=email).first()
    try:
        with transaction.atomic():
            return Conversation.objects.create(
                counterparty_email=email,
                counterparty_name=(student.name if student else ""),
                subject=subject,
                student=student,
            )
    except IntegrityError:
        # A concurrent caller created the open conversation first.
        return Conversation.objects.get(counterparty_email=email, is_archived=False)


def send_message(
    *,
    conversation: Conversation,
    text: str,
    html: str = "",
    subject: str = "",
    attachment_ids: list[int] | None = None,
) -> Message:
    if connection.schema_name == get_public_schema_name():
        # Superadmin platform inbox — fixed support address, always sendable.
        from_email = settings.PLATFORM_SUPPORT_FROM
    else:
        from_email, _can_receive = sending_identity(connection.tenant)
    sender_domain = from_email.rsplit("@", 1)[-1]

    last = conversation.messages.order_by("-created_at").first()
    message_id = new_message_id(sender_domain)
    in_reply_to = last.message_id if last and last.message_id else ""
    references = ""
    if in_reply_to:
        prior = last.references.strip() if last and last.references else ""
        references = (prior + " " + in_reply_to).strip()

    headers = {"Message-ID": message_id}
    if in_reply_to:
        headers["In-Reply-To"] = in_reply_to
        headers["References"] = references

    subject = subject or conversation.subject or "(no subject)"
    clean_html = sanitize_rich_text(html) if html else ""
    body_html = clean_html or f"<p>{escape(text)}</p>"

    ids = list(attachment_ids or [])
    if len(ids) > MAX_FILES_PER_MESSAGE:
        raise ValueError(f"At most {MAX_FILES_PER_MESSAGE} attachments per message.")
    atts = list(MessageAttachment.objects.filter(id__in=ids, message__isnull=True))
    if len(atts) != len(ids):
        raise ValueError("Unknown or already-sent attachment.")
    resend_attachments = [
        {"filename": a.filename, "content": base64.b64encode(read_attachment(a.storage_key)).decode()} for a in atts
    ]

    ok = send_email(
        conversation.counterparty_email,
        subject,
        body_html,
        from_email=from_email,
        headers=headers,
        attachments=resend_attachments or None,
    )
    if not ok:
        raise RuntimeError("mailbox send failed")

    msg = Message.objects.create(
        conversation=conversation,
        direction="outbound",
        from_email=from_email,
        to_email=conversation.counterparty_email,
        text=text,
        html=body_html,
        message_id=message_id,
        in_reply_to=in_reply_to,
        references=references,
        is_read=True,
    )
    if atts:
        MessageAttachment.objects.filter(id__in=[a.id for a in atts]).update(message=msg)
    conversation.last_message_at = timezone.now()
    if not conversation.subject:
        conversation.subject = subject
    conversation.save(update_fields=["last_message_at", "subject"])
    return msg
