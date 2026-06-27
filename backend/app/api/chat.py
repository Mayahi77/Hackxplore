import json
import logging
import traceback
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field
from app.services.rag import RAGService
from app.services.vision import extract_image_knowledge, mime_for
from app.services.vector_store import VectorStore
from app.dependencies import get_vector_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])
MAX_CHAT_IMAGE_BYTES = 15 * 1024 * 1024


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    history: list[Message] = []
    already_checked: str | None = None


class Source(BaseModel):
    id: str | None = None
    filename: str
    page: int | None = None
    doc_type: str | None = None
    relevance: float
    snippet: str | None = None
    has_file: bool = False


class Hypothesis(BaseModel):
    title: str
    probability: str
    reasoning: str
    next_check: str
    citations: list[str] = Field(default_factory=list)


class TroubleshootingStep(BaseModel):
    step: int
    action: str
    expected_result: str
    if_not: str
    citations: list[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    answer: str
    summary: str | None = None
    sources: list[Source]
    search_query: str
    evidence_warning: str | None = None
    clarifying_questions: list[str] = Field(default_factory=list)
    hypotheses: list[Hypothesis] = Field(default_factory=list)
    troubleshooting_steps: list[TroubleshootingStep] = Field(default_factory=list)
    image_analysis: str | None = None
    image_filename: str | None = None


def _response_from_result(
    result: dict,
    image_analysis: str | None = None,
    image_filename: str | None = None,
) -> ChatResponse:
    return ChatResponse(
        answer=result["answer"],
        summary=result.get("summary"),
        sources=result["sources"],
        search_query=result["search_query"],
        evidence_warning=result.get("evidence_warning"),
        clarifying_questions=result.get("clarifying_questions", []),
        hypotheses=result.get("hypotheses", []),
        troubleshooting_steps=result.get("troubleshooting_steps", []),
        image_analysis=image_analysis,
        image_filename=image_filename,
    )


def _parse_history(raw: str | None) -> list[dict] | None:
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="history must be valid JSON.")
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="history must be a JSON array.")
    parsed: list[dict] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content")
        if role in {"user", "assistant"} and isinstance(content, str):
            parsed.append({"role": role, "content": content})
    return parsed or None


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

    return _response_from_result(result)


@router.post("/image", response_model=ChatResponse)
async def chat_with_image(
    file: UploadFile = File(...),
    question: str = Form(""),
    history: str | None = Form(None),
    already_checked: str | None = Form(None),
    store: VectorStore = Depends(get_vector_store),
):
    filename = file.filename or "uploaded-image"
    mime = mime_for(filename)
    if mime is None:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use PNG, JPG, WEBP, GIF or BMP.",
        )

    content = await file.read()
    if len(content) > MAX_CHAT_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large. Max 15MB.")

    prompt_question = question.strip() or "Analyze the uploaded image and suggest relevant two-stroke engine troubleshooting checks."

    try:
        image_analysis = extract_image_knowledge(content, mime, hint=prompt_question)
    except Exception as e:
        logger.error("Vision error:\n%s", traceback.format_exc())
        raise HTTPException(status_code=502, detail=f"Vision service error: {str(e)}")

    if not image_analysis:
        raise HTTPException(status_code=422, detail="No legible or useful technical content found in the image.")

    rag = RAGService(store)
    try:
        result = rag.answer(
            prompt_question,
            history=_parse_history(history),
            already_checked=already_checked or None,
            image_context=image_analysis,
        )
    except Exception as e:
        logger.error("RAG error:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

    return _response_from_result(
        result,
        image_analysis=image_analysis,
        image_filename=filename,
    )


@router.get("/health")
async def health(store: VectorStore = Depends(get_vector_store)):
    return {"status": "ok", "knowledge_base_chunks": store.count()}
