import uuid

from django.conf import settings

from apps.core.storage import build_s3_path, get_s3_client

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES_PER_MESSAGE = 4

_ALLOWED_PREFIXES = ("image/", "video/", "audio/")
_ALLOWED_EXACT = {
    "application/pdf",
    "application/zip",
    "text/plain",
    "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def validate_attachment(filename: str, content_type: str, size: int) -> str | None:
    if not filename:
        return "Missing file name."
    if size > MAX_FILE_BYTES:
        return "File is larger than 10 MB."
    ct = (content_type or "").lower()
    if ct in _ALLOWED_EXACT or ct.startswith(_ALLOWED_PREFIXES):
        return None
    return "This file type isn't allowed."


def store_attachment(content: bytes, filename: str, content_type: str) -> str:
    key = build_s3_path("mailbox", uuid.uuid4().hex, filename)
    get_s3_client().put_object(
        Bucket=settings.AWS_BUCKET_NAME,
        Key=key,
        Body=content,
        ContentType=content_type or "application/octet-stream",
    )
    return key


def read_attachment(storage_key: str) -> bytes:
    obj = get_s3_client().get_object(Bucket=settings.AWS_BUCKET_NAME, Key=storage_key)
    return obj["Body"].read()
