import uuid
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.services.vector_store import VectorStore
from app.dependencies import get_vector_store

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteRequest(BaseModel):
    text: str
    title: str = "Quick Note"


@router.post("/")
async def save_note(
    request: NoteRequest,
    store: VectorStore = Depends(get_vector_store),
):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Note text cannot be empty.")

    words = request.text.split()
    chunk_size = 800
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunk_text = " ".join(words[i : i + chunk_size])
        if not chunk_text.strip():
            continue
        chunks.append({
            "id": str(uuid.uuid4()),
            "text": chunk_text,
            "metadata": {
                "source": f"note: {request.title}",
                "filename": request.title,
                "page": 1,
                "chunk_index": i // chunk_size,
                "doc_type": "note",
            },
        })

    if not chunks:
        raise HTTPException(status_code=400, detail="Note too short to index.")

    store.add_chunks(chunks)
    return {"title": request.title, "chunks_indexed": len(chunks), "status": "saved"}
