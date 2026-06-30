import hashlib
import hmac

from django.conf import settings


def sign_payload(body: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def verify_inbound_signature(body: bytes, signature: str) -> bool:
    secret = settings.MAILBOX_INBOUND_SECRET
    if not secret or not signature:
        return False
    expected = sign_payload(body, secret)
    return hmac.compare_digest(expected, signature)
