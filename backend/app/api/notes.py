from datetime import datetime, timezone
import json
import os
import re
import uuid
from fastapi import APIRouter, HTTPException, Depends
from google import genai
from pydantic import BaseModel, Field
from app.services.document_processor import classify_discipline, normalize_discipline
from app.services import file_store
from app.services.rag import MODEL, _model_error_summary, _parse_json, _snippet
from app.services.vector_store import VectorStore
from app.dependencies import get_vector_store
from app.api.graph import invalidate_graph_cache

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteRequest(BaseModel):
    text: str
    title: str = "Quick Note"
    discipline: str | None = None
    capture_origin: str = "manual"
    reviewed: bool = False


class NoteValidationRequest(BaseModel):
    text: str
    discipline: str | None = None


class ValidationSource(BaseModel):
    id: str
    filename: str
    page: int | None = None
    doc_type: str | None = None
    relevance: float
    snippet: str
    has_file: bool = False


class ValidationIssue(BaseModel):
    claim: str
    status: str
    explanation: str
    citations: list[str] = Field(default_factory=list)


class NoteValidationResponse(BaseModel):
    verdict: str
    confidence: float
    summary: str
    issues: list[ValidationIssue] = Field(default_factory=list)
    sources: list[ValidationSource] = Field(default_factory=list)


VALIDATION_PROMPT = """You are validating a proposed knowledge-base note against retrieved engineering knowledge-base excerpts.

Return ONLY valid JSON with this exact shape:
{
  "verdict": "supported|conflicting|uncertain",
  "confidence": 0.0,
  "summary": "Short validation summary.",
  "issues": [
    {
      "claim": "Specific claim from the submitted note.",
      "status": "supported|conflicting|uncertain",
      "explanation": "Why this claim has that status.",
      "citations": ["S1"]
    }
  ]
}

Rules:
- Base validation only on the retrieved excerpts.
- Use citations only when the cited excerpt directly supports or contradicts the claim.
- Mark a note "conflicting" only when a retrieved source directly contradicts it.
- Mark a note "uncertain" when the database does not contain enough evidence.
- New expert knowledge can be true even if absent from the database; absence alone is not a conflict.
- If any important claim is directly contradicted, overall verdict must be "conflicting".
- If all important claims are directly supported, overall verdict should be "supported".
- Otherwise use "uncertain"."""

STOPWORDS = {
    "this", "that", "with", "from", "into", "onto", "about", "because",
    "caused", "causes", "cause", "engine", "engines", "stroke", "two",
    "knowledge", "base", "note", "information",
}


def _validation_tokens(text: str) -> set[str]:
    return {
        token for token in re.findall(r"[a-z0-9]+", text.lower())
        if len(token) >= 4 and token not in STOPWORDS
    }


def _keyword_hits(store: VectorStore, text: str, limit: int = 6) -> list[dict]:
    tokens = _validation_tokens(text)
    if not tokens or store.count() == 0:
        return []
    try:
        results = store._collection.get(include=["documents", "metadatas"])
    except Exception:
        return []

    hits: list[dict] = []
    for doc, meta in zip(results.get("documents") or [], results.get("metadatas") or []):
        haystack = (doc or "").lower()
        matched = {token for token in tokens if token in haystack}
        if len(matched) < 2:
            continue
        score = min(0.99, 0.58 + 0.06 * len(matched))
        hits.append({"text": doc, "metadata": meta or {}, "score": score})

    return sorted(hits, key=lambda h: h["score"], reverse=True)[:limit]


def _merge_hits(*groups: list[dict], limit: int = 5) -> list[dict]:
    merged: dict[tuple, dict] = {}
    for group in groups:
        for hit in group:
            meta = hit["metadata"]
            key = (meta.get("source"), meta.get("page"), meta.get("chunk_index"))
            if key not in merged or hit["score"] > merged[key]["score"]:
                merged[key] = hit
    return sorted(merged.values(), key=lambda h: h["score"], reverse=True)[:limit]


def _build_validation_sources(hits: list[dict]) -> list[dict]:
    sources: list[dict] = []
    seen: set[tuple] = set()
    for i, hit in enumerate(hits, start=1):
        meta = hit["metadata"]
        source_id = f"S{i}"
        src = meta.get("source", "unknown")
        page = meta.get("page")
        key = (src, page, meta.get("chunk_index"))
        if key in seen:
            continue
        seen.add(key)
        sources.append({
            "id": source_id,
            "filename": src,
            "page": page,
            "doc_type": meta.get("doc_type"),
            "relevance": round(hit["score"], 3),
            "snippet": _snippet(hit["text"], limit=420),
            "has_file": file_store.exists(src),
        })
    return sources


def _validation_context(sources: list[dict]) -> str:
    if not sources:
        return "No relevant knowledge-base excerpts found."
    return "\n\n---\n\n".join(
        (
            f"[{source['id']}: {source['filename']}, page {source.get('page')}, "
            f"type {source.get('doc_type')}, relevance {source['relevance']:.2f}]\n"
            f"{source['snippet']}"
        )
        for source in sources
    )


def _clean_verdict(value: str) -> str:
    value = str(value or "").lower().strip()
    return value if value in {"supported", "conflicting", "uncertain"} else "uncertain"


def _normalise_validation(raw: dict, sources: list[dict]) -> dict:
    valid_ids = {s["id"] for s in sources}
    verdict = _clean_verdict(raw.get("verdict"))
    issues: list[dict] = []
    raw_issues = raw.get("issues") if isinstance(raw.get("issues"), list) else []
    for item in raw_issues:
        if not isinstance(item, dict):
            continue
        citations = []
        raw_citations = item.get("citations") if isinstance(item.get("citations"), list) else []
        for citation in raw_citations:
            cid = str(citation).strip()
            if cid in valid_ids and cid not in citations:
                citations.append(cid)
        issues.append({
            "claim": str(item.get("claim") or "Submitted claim").strip(),
            "status": _clean_verdict(item.get("status")),
            "explanation": str(item.get("explanation") or "").strip(),
            "citations": citations,
        })

    if any(issue["status"] == "conflicting" for issue in issues):
        verdict = "conflicting"

    try:
        confidence = float(raw.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    summary = str(raw.get("summary") or "").strip()
    if not summary:
        summary = "The note could not be fully validated against the current knowledge base."

    return {
        "verdict": verdict,
        "confidence": confidence,
        "summary": summary,
        "issues": issues,
        "sources": sources,
    }


@router.get("/")
async def list_notes(store: VectorStore = Depends(get_vector_store)):
    notes = store.list_notes()
    return {"notes": notes}


@router.post("/validate", response_model=NoteValidationResponse)
async def validate_note(
    request: NoteValidationRequest,
    store: VectorStore = Depends(get_vector_store),
):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Note text cannot be empty.")

    vector_hits = [hit for hit in store.search(text, n_results=10) if hit["score"] >= 0.6]
    keyword_hits = _keyword_hits(store, text)
    hits = _merge_hits(keyword_hits, vector_hits, limit=5)
    sources = _build_validation_sources(hits)

    if not sources:
        return NoteValidationResponse(
            verdict="uncertain",
            confidence=0.0,
            summary="No sufficiently relevant knowledge-base sources were found to validate this note.",
            issues=[ValidationIssue(
                claim=text[:160],
                status="uncertain",
                explanation="The database does not currently contain enough matching evidence to support or reject this claim.",
                citations=[],
            )],
            sources=[],
        )

    client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))
    prompt = f"""{VALIDATION_PROMPT}

Knowledge-base excerpts:
{_validation_context(sources)}

Submitted note:
{text}

Discipline hint: {normalize_discipline(request.discipline) or "auto"}
"""
    try:
        response = client.models.generate_content(model=MODEL, contents=prompt)
        data = _parse_json(response.text or "")
        return NoteValidationResponse(**_normalise_validation(data, sources))
    except Exception as exc:
        return NoteValidationResponse(
            verdict="uncertain",
            confidence=0.0,
            summary=f"Could not complete AI validation. {_model_error_summary(exc)}",
            issues=[ValidationIssue(
                claim=text[:160],
                status="uncertain",
                explanation="Relevant sources were retrieved, but the validation model was unavailable. Review the cited excerpts manually before saving.",
                citations=[sources[0]["id"]] if sources else [],
            )],
            sources=sources,
        )


@router.post("/")
async def save_note(
    request: NoteRequest,
    store: VectorStore = Depends(get_vector_store),
):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Note text cannot be empty.")

    origin = request.capture_origin.strip().lower() or "manual"
    if origin not in {"manual", "voice"}:
        raise HTTPException(status_code=400, detail="Unsupported note capture origin.")
    if origin == "voice" and not request.reviewed:
        raise HTTPException(status_code=400, detail="Voice transcript must be reviewed before indexing.")

    discipline = normalize_discipline(request.discipline) or classify_discipline(request.text)
    title = request.title.strip() or "Quick Note"
    note_id = uuid.uuid4().hex[:8]
    created_at = datetime.now(timezone.utc).isoformat()
    source = f"note: {note_id} - {title}"

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
                "source": source,
                "filename": title,
                "page": 1,
                "chunk_index": i // chunk_size,
                "doc_type": "note",
                "discipline": discipline,
                "capture_origin": origin,
                "reviewed": request.reviewed,
                "created_at": created_at,
            },
        })

    if not chunks:
        raise HTTPException(status_code=400, detail="Note too short to index.")

    store.add_chunks(chunks)
    invalidate_graph_cache()
    return {
        "title": title,
        "source": source,
        "segments_indexed": len(chunks),
        "discipline": discipline,
        "status": "saved",
    }
