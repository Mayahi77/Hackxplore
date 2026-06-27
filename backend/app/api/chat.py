import logging
import traceback
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.services.rag import RAGService
from app.services.vector_store import VectorStore
from app.dependencies import get_vector_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[Message] = []
    already_checked: str | None = None


class Source(BaseModel):
    filename: str
    page: int | None = None
    doc_type: str | None = None
    relevance: float


class ChatResponse(BaseModel):
    answer: str
    sources: list[Source]
    search_query: str


@router.post("/", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    store: VectorStore = Depends(get_vector_store),
):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    rag = RAGService(store)
    history = [{"role": m.role, "content": m.content} for m in request.history]

    try:
        result = rag.answer(
            request.question,
            history=history or None,
            already_checked=request.already_checked or None,
        )
    except Exception as e:
        logger.error("RAG error:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

    return ChatResponse(
        answer=result["answer"],
        sources=result["sources"],
        search_query=result["search_query"],
    )


@router.get("/health")
async def health(store: VectorStore = Depends(get_vector_store)):
    return {"status": "ok", "knowledge_base_chunks": store.count()}
