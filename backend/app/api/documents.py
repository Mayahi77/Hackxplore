from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import FileResponse
from pydantic import BaseModel
from app.services.document_processor import (
    process_file,
    build_text_chunks,
    classify_discipline,
    normalize_discipline,
    DISCIPLINES,
)
from app.services.vision import extract_image_knowledge, mime_for
from app.services import file_store
from app.services.vector_store import VectorStore, normalize_source_name
from app.dependencies import get_vector_store
from app.api.graph import invalidate_graph_cache

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_DOCS = {".pdf", ".docx", ".pptx", ".xlsx", ".txt", ".md"}
MAX_DOC_BYTES = 50 * 1024 * 1024
MAX_IMAGE_BYTES = 15 * 1024 * 1024


class CleanupRequest(BaseModel):
    dry_run: bool = True


def _suffix(filename: str) -> str:
    return "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def _captioned_body(extracted: str, caption: str | None) -> str:
    return f"{caption.strip()}\n\n{extracted}" if caption and caption.strip() else extracted


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    discipline: str | None = Form(None),
    store: VectorStore = Depends(get_vector_store),
):
    filename = normalize_source_name(file.filename or "upload")
    suffix = _suffix(filename)
    if suffix not in ALLOWED_DOCS:
        raise HTTPException(
            status_code=400,
            detail=f"File type {suffix} not supported. Allowed: {sorted(ALLOWED_DOCS)}",
        )

    content = await file.read()
    if len(content) > MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Max 50MB.")

    try:
        chunks = process_file(content, filename, discipline=discipline)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to process file: {str(e)}")

    store.add_chunks(chunks, replace_source=True)
    invalidate_graph_cache()
    file_store.save_original(filename, content)

    resolved = chunks[0]["metadata"]["discipline"] if chunks else (normalize_discipline(discipline) or "General")
    return {
        "filename": filename,
        "segments_indexed": len(chunks),
        "discipline": resolved,
        "status": "success",
    }


@router.post("/image/extract")
async def extract_image(
    file: UploadFile = File(...),
    discipline: str | None = Form(None),
    caption: str | None = Form(None),
):
    """Extract image text/knowledge without indexing it yet."""
    filename = normalize_source_name(file.filename or "image")
    mime = mime_for(filename)
    if mime is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use PNG, JPG, WEBP, GIF or BMP.",
        )

    content = await file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large. Max 15MB.")

    try:
        extracted = extract_image_knowledge(content, mime, hint=caption)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vision service error: {str(e)}")

    if not extracted:
        raise HTTPException(
            status_code=422,
            detail="No legible technical content found in the image.",
        )

    resolved = normalize_discipline(discipline) or classify_discipline(extracted)
    return {
        "filename": filename,
        "discipline": resolved,
        "extracted_text": extracted,
        "extracted_preview": extracted[:400],
        "status": "needs_review",
    }


@router.post("/image/index")
async def index_extracted_image(
    file: UploadFile = File(...),
    extracted_text: str = Form(...),
    discipline: str | None = Form(None),
    caption: str | None = Form(None),
    store: VectorStore = Depends(get_vector_store),
):
    """Index user-reviewed image extraction and persist the original image."""
    filename = normalize_source_name(file.filename or "image")
    mime = mime_for(filename)
    if mime is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use PNG, JPG, WEBP, GIF or BMP.",
        )

    content = await file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large. Max 15MB.")
    if not extracted_text.strip():
        raise HTTPException(status_code=400, detail="Reviewed extracted text cannot be empty.")

    resolved = normalize_discipline(discipline) or classify_discipline(extracted_text)
    chunks = build_text_chunks(
        _captioned_body(extracted_text, caption),
        filename=filename,
        doc_type="image",
        discipline=resolved,
    )
    store.add_chunks(chunks, replace_source=True)
    invalidate_graph_cache()
    file_store.save_original(filename, content)

    return {
        "filename": filename,
        "segments_indexed": len(chunks),
        "discipline": resolved,
        "extracted_preview": extracted_text[:400],
        "status": "success",
    }


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    discipline: str | None = Form(None),
    caption: str | None = Form(None),
    store: VectorStore = Depends(get_vector_store),
):
    """OCR + multimodal pipeline: read an engineering screenshot/diagram,
    transcribe and describe it with Gemini vision, then index the result."""
    filename = normalize_source_name(file.filename or "image")
    mime = mime_for(filename)
    if mime is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use PNG, JPG, WEBP, GIF or BMP.",
        )

    content = await file.read()
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large. Max 15MB.")

    try:
        extracted = extract_image_knowledge(content, mime, hint=caption)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Vision service error: {str(e)}")

    if not extracted:
        raise HTTPException(
            status_code=422,
            detail="No legible technical content found in the image.",
        )

    resolved = normalize_discipline(discipline) or classify_discipline(extracted)
    chunks = build_text_chunks(
        _captioned_body(extracted, caption),
        filename=filename,
        doc_type="image",
        discipline=resolved,
    )
    store.add_chunks(chunks, replace_source=True)
    invalidate_graph_cache()
    file_store.save_original(filename, content)

    preview = extracted[:400]
    return {
        "filename": filename,
        "segments_indexed": len(chunks),
        "discipline": resolved,
        "extracted_preview": preview,
        "status": "success",
    }


@router.get("/sources")
async def list_sources(store: VectorStore = Depends(get_vector_store)):
    documents = store.list_documents()
    for doc in documents:
        doc["has_file"] = file_store.exists(doc["source"])
    return {
        "sources": store.list_sources(),
        "documents": documents,
        "disciplines": store.discipline_counts(),
        "total_chunks": store.count(),
        "available_disciplines": DISCIPLINES,
    }


@router.get("/file")
async def download_file(source: str):
    """Return the original uploaded file for a given document source."""
    if not file_store.exists(source):
        raise HTTPException(
            status_code=404,
            detail="Original file is not available for this document.",
        )
    resolved = file_store.resolve_path(source)
    if resolved is None:
        raise HTTPException(
            status_code=404,
            detail="Original file is not available for this document.",
        )
    return FileResponse(resolved, filename=Path(source).name)


@router.delete("/source")
async def delete_source(source: str, store: VectorStore = Depends(get_vector_store)):
    deleted = store.delete_source(source)
    if deleted == 0:
        raise HTTPException(status_code=404, detail="No indexed chunks found for this source.")
    invalidate_graph_cache()
    return {"source": normalize_source_name(source), "chunks_deleted": deleted}


@router.post("/maintenance/cleanup")
async def cleanup_knowledge_base(
    request: CleanupRequest,
    store: VectorStore = Depends(get_vector_store),
):
    result = store.cleanup(dry_run=request.dry_run)
    if not request.dry_run:
        invalidate_graph_cache()
    return result
