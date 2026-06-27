import uuid
import re
import io
from pathlib import Path


def _chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        if chunk.strip():
            chunks.append(chunk.strip())
        start += chunk_size - overlap
    return chunks


def _clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def process_pdf(file_content: bytes, filename: str) -> list[dict]:
    import fitz  # pymupdf

    chunks = []
    doc = fitz.open(stream=file_content, filetype="pdf")
    for page_num, page in enumerate(doc, start=1):
        text = _clean(page.get_text())
        if len(text) < 50:
            continue
        for i, chunk in enumerate(_chunk_text(text)):
            chunks.append({
                "id": str(uuid.uuid4()),
                "text": chunk,
                "metadata": {
                    "source": filename,
                    "filename": filename,
                    "page": page_num,
                    "chunk_index": i,
                    "doc_type": "pdf",
                },
            })
    return chunks


def process_docx(file_content: bytes, filename: str) -> list[dict]:
    from docx import Document

    doc = Document(io.BytesIO(file_content))
    full_text = _clean(" ".join(p.text for p in doc.paragraphs if p.text.strip()))
    chunks = []
    for i, chunk in enumerate(_chunk_text(full_text)):
        chunks.append({
            "id": str(uuid.uuid4()),
            "text": chunk,
            "metadata": {
                "source": filename,
                "filename": filename,
                "page": 1,
                "chunk_index": i,
                "doc_type": "docx",
            },
        })
    return chunks


def process_xlsx(file_content: bytes, filename: str) -> list[dict]:
    import pandas as pd

    chunks = []
    xls = pd.ExcelFile(io.BytesIO(file_content))
    for sheet_name in xls.sheet_names:
        df = xls.parse(sheet_name).fillna("")
        text = _clean(f"Sheet: {sheet_name}\n" + df.to_string(index=False))
        for i, chunk in enumerate(_chunk_text(text)):
            chunks.append({
                "id": str(uuid.uuid4()),
                "text": chunk,
                "metadata": {
                    "source": filename,
                    "filename": filename,
                    "page": 1,
                    "chunk_index": i,
                    "doc_type": "xlsx",
                    "sheet": sheet_name,
                },
            })
    return chunks


def process_txt(file_content: bytes, filename: str) -> list[dict]:
    text = _clean(file_content.decode("utf-8", errors="ignore"))
    chunks = []
    for i, chunk in enumerate(_chunk_text(text)):
        chunks.append({
            "id": str(uuid.uuid4()),
            "text": chunk,
            "metadata": {
                "source": filename,
                "filename": filename,
                "page": 1,
                "chunk_index": i,
                "doc_type": "txt",
            },
        })
    return chunks


def process_file(file_content: bytes, filename: str) -> list[dict]:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return process_pdf(file_content, filename)
    elif ext in (".doc", ".docx"):
        return process_docx(file_content, filename)
    elif ext in (".xls", ".xlsx"):
        return process_xlsx(file_content, filename)
    elif ext in (".txt", ".md"):
        return process_txt(file_content, filename)
    else:
        raise ValueError(f"Unsupported file type: {ext}")
