"""Text from a shared document: .txt/.md/.pdf and pasted text, validated and capped."""

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from apps.tenant_config import interview_import as imp


def pdf_bytes(*texts: str) -> bytes:
    """A tiny PDF with one line of text per page, written by pypdf itself."""
    writer = PdfWriter()
    font = writer._add_object(
        DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
    )
    for text in texts or ("",):
        page = writer.add_blank_page(300, 200)
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
        )
        stream = DecodedStreamObject()
        stream.set_data(f"BT /F1 12 Tf 20 100 Td ({text}) Tj ET".encode())
        page[NameObject("/Contents")] = writer._add_object(stream)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def upload(name: str, data: bytes) -> SimpleUploadedFile:
    return SimpleUploadedFile(name, data)


def test_text_and_markdown_are_decoded_and_whitespace_normalised():
    body = imp.extract_text(upload("bio.md", b"# Mira\r\n\r\n\r\nI teach   yoga.\t\xff"))
    assert body.startswith("# Mira\n\nI teach yoga.")


def test_pasted_text_is_capped():
    assert len(imp.extract_text(text="word " * 5000)) == imp.IMPORT_MAX_CHARS


def test_pdf_text_is_extracted_from_the_first_pages_only():
    pages = [f"Page {n}" for n in range(1, imp.MAX_PDF_PAGES + 6)]
    body = imp.extract_text(upload("cv.pdf", pdf_bytes(*pages)))
    assert body.startswith("Page 1\nPage 2") and f"Page {imp.MAX_PDF_PAGES}" in body
    assert f"Page {imp.MAX_PDF_PAGES + 1}" not in body


def test_a_pdf_with_no_text_is_refused():
    with pytest.raises(imp.ImportRejectedError, match="couldn't find any text"):
        imp.extract_text(upload("scan.pdf", pdf_bytes()))


@pytest.mark.parametrize(
    ("name", "data"),
    [
        ("cv.pdf", b"not a pdf at all"),  # a .pdf name on other bytes
        ("cv.pdf", b"%PDF-1.4 garbage that pypdf cannot parse"),
        ("bio.txt", b"abc\x00\x01\x02"),  # binary with a text name
        ("bio.docx", b"hello"),  # not an accepted type
    ],
)
def test_unreadable_files_are_refused(name, data):
    with pytest.raises(imp.ImportRejectedError, match="couldn't read that file"):
        imp.extract_text(upload(name, data))


def test_oversized_and_empty_are_refused():
    with pytest.raises(imp.ImportRejectedError, match="too big"):
        imp.extract_text(upload("bio.txt", b"a" * (imp.MAX_BYTES + 1)))
    with pytest.raises(imp.ImportRejectedError, match="couldn't find any text"):
        imp.extract_text(upload("bio.txt", b"  \n\t "))
    with pytest.raises(imp.ImportRejectedError, match="couldn't find any text"):
        imp.extract_text(text="   ")
