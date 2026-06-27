from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from app.services.document_processor import process_file
from app.services.vector_store import VectorStore
from app.dependencies import get_vector_store

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    store: VectorStore = Depends(get_vector_store),
):
    allowed = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".md"}
    suffix = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if suffix not in allowed:
        raise HTTPException(status_code=400, detail=f"File type {suffix} not supported. Allowed: {allowed}")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Max 50MB.")

    try:
        chunks = process_file(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to process file: {str(e)}")

    store.add_chunks(chunks)

    return {"filename": file.filename, "chunks_indexed": len(chunks), "status": "success"}


@router.get("/sources")
async def list_sources(store: VectorStore = Depends(get_vector_store)):
    return {"sources": store.list_sources(), "total_chunks": store.count()}
