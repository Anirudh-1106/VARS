"""Extract plain text and layout signals from an uploaded resume.

Everything happens on in-memory bytes; nothing is written to disk.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field

BULLET_CHARS = "•●▪◦‣∙·➢➤►▶✓✔■□◆◇○-–*"
_BULLET_RE = re.compile(rf"^\s*[{re.escape(BULLET_CHARS)}]\s+")


@dataclass
class ParsedResume:
    text: str
    pages: int = 1
    links: list[str] = field(default_factory=list)
    images: int = 0
    tables: int = 0
    columns: int = 1
    fonts: int = 0
    file_type: str = "txt"
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "pages": self.pages,
            "links": self.links,
            "layout": {"images": self.images, "tables": self.tables, "columns": self.columns, "fonts": self.fonts},
            "file_type": self.file_type,
            "warnings": self.warnings,
        }


class ParseError(ValueError):
    pass


def normalise_text(raw: str) -> str:
    text = raw.replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ")
    text = text.replace("", "•").replace("", "•").replace("•", "•")
    lines = []
    for line in text.split("\n"):
        line = re.sub(r"[ \t]+", " ", line).strip()
        if not line:
            if lines and lines[-1] != "":
                lines.append("")
            continue
        if _BULLET_RE.match(line):
            line = "• " + _BULLET_RE.sub("", line)
        # PDF extraction often splits a bullet glyph onto its own line.
        if lines and lines[-1] == "•":
            lines[-1] = "• " + line
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _pdf(data: bytes) -> ParsedResume:
    try:
        import pymupdf
    except ImportError:  # pragma: no cover
        import fitz as pymupdf  # type: ignore

    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise ParseError("This PDF could not be opened. It may be damaged or password-protected.") from exc

    parts: list[str] = []
    links: list[str] = []
    images = 0
    fonts: set[str] = set()
    column_votes = 0
    for page in doc:
        width = page.rect.width or 1
        blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip()]
        # Two-column detection: substantial text blocks that start in the right
        # half while other blocks share the same vertical band on the left.
        right = [b for b in blocks if b[0] > width * 0.42 and (b[2] - b[0]) > width * 0.2]
        left = [b for b in blocks if b[2] < width * 0.6 and b[0] < width * 0.2]
        overlap = sum(1 for r in right for lft in left if not (r[3] < lft[1] or r[1] > lft[3]))
        if len(right) >= 3 and overlap >= 3:
            column_votes += 1
        blocks.sort(key=lambda b: (round(b[1] / 6), b[0]))
        parts.append(page.get_text("text", sort=True))
        for link in page.get_links():
            uri = link.get("uri")
            if uri and uri not in links:
                links.append(uri)
        images += len(page.get_images(full=True))
        for font in page.get_fonts(full=False):
            name = (font[3] or "").split("+")[-1].split("-")[0]
            if name:
                fonts.add(name)
    pages = doc.page_count
    doc.close()

    text = normalise_text("\n".join(parts))
    parsed = ParsedResume(
        text=text,
        pages=pages,
        links=links,
        images=images,
        columns=2 if column_votes else 1,
        fonts=len(fonts),
        file_type="pdf",
    )
    if len(text) < 80:
        parsed.warnings.append(
            "Almost no selectable text was found. This looks like a scanned or image-only PDF, which applicant tracking systems cannot read either."
        )
    return parsed


def _docx(data: bytes) -> ParsedResume:
    try:
        import docx
    except ImportError as exc:  # pragma: no cover
        raise ParseError("DOCX support is not installed (python-docx).") from exc
    try:
        document = docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise ParseError("This Word file could not be opened. Save it again as .docx or upload a PDF.") from exc

    lines: list[str] = []
    for para in document.paragraphs:
        text = para.text.strip()
        if not text:
            lines.append("")
            continue
        style = (para.style.name or "").lower() if para.style is not None else ""
        if "list" in style and not _BULLET_RE.match(text):
            text = "• " + text
        lines.append(text)
    for table in document.tables:
        for row in table.rows:
            cells = []
            for cell in row.cells:
                value = cell.text.strip()
                if value and value not in cells:
                    cells.append(value)
            if cells:
                lines.append(" | ".join(cells))
    links = []
    for rel in document.part.rels.values():
        if "hyperlink" in rel.reltype and rel.is_external:
            target = rel.target_ref
            if target not in links:
                links.append(target)
    images = sum(1 for rel in document.part.rels.values() if "image" in rel.reltype)
    return ParsedResume(
        text=normalise_text("\n".join(lines)),
        pages=max(1, round(len(" ".join(lines).split()) / 450)),
        links=links,
        images=images,
        tables=len(document.tables),
        file_type="docx",
    )


def parse(filename: str, data: bytes) -> ParsedResume:
    if not data:
        raise ParseError("The file is empty.")
    name = (filename or "").lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        return _pdf(data)
    if name.endswith(".docx") or data[:2] == b"PK":
        return _docx(data)
    if name.endswith(".doc"):
        raise ParseError("Old .doc files are not supported. Save it as .docx or PDF and upload again.")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("latin-1", errors="ignore")
    return ParsedResume(text=normalise_text(text), file_type="txt")


def from_text(text: str) -> ParsedResume:
    return ParsedResume(text=normalise_text(text or ""), file_type="text")
