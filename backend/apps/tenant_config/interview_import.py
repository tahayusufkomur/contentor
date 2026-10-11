"""A document the coach shares in /setup ("a bio, CV or old About page") →
plain text for one interview turn. The content is untrusted: it is only ever
read as text, size-capped, and handed to the model as data."""

import io
import re

IMPORT_MAX_CHARS = 8000
MAX_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 15
TEXT_EXTENSIONS = (".txt", ".md")
UNREADABLE = "I couldn't read that file. Try a text file or paste it instead."
TOO_BIG = "That file is too big. Keep it under 5 MB, or paste the text instead."
EMPTY = "I couldn't find any text in that. Try another file or paste it instead."


class ImportRejectedError(ValueError):
    """The upload can't be used; the message is the coach-facing reason."""


def _pdf_text(raw: bytes) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(raw))
        if reader.is_encrypted:
            raise ImportRejectedError(UNREADABLE)
        return "\n".join(page.extract_text() or "" for page in reader.pages[:MAX_PDF_PAGES])
    except ImportRejectedError:
        raise
    except Exception as exc:  # pypdf raises a wide family on malformed files
        raise ImportRejectedError(UNREADABLE) from exc


def extract_text(upload=None, text: str = "") -> str:
    """Text of an uploaded .pdf/.txt/.md, or of pasted ``text``: whitespace
    normalised, capped at IMPORT_MAX_CHARS. Raises ImportRejectedError."""
    if upload is not None:
        name = str(getattr(upload, "name", "") or "").lower()
        if (getattr(upload, "size", 0) or 0) > MAX_BYTES:
            raise ImportRejectedError(TOO_BIG)
        raw = upload.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ImportRejectedError(TOO_BIG)
        if name.endswith(".pdf"):
            if not raw.startswith(b"%PDF"):
                raise ImportRejectedError(UNREADABLE)
            body = _pdf_text(raw)
        elif name.endswith(TEXT_EXTENSIONS):
            if b"\x00" in raw[:4096]:  # a binary file with a text name
                raise ImportRejectedError(UNREADABLE)
            body = raw.decode("utf-8", errors="replace")
        else:
            raise ImportRejectedError(UNREADABLE)
    else:
        body = str(text or "")
    body = body.replace("\x00", " ").replace("\r", "\n")
    body = re.sub(r"\n\s*\n\s*", "\n\n", re.sub(r"[^\S\n]+", " ", body)).strip()[:IMPORT_MAX_CHARS]
    if not body:
        raise ImportRejectedError(EMPTY)
    return body
