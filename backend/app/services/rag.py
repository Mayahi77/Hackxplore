import json
import os
import re
import traceback
from google import genai
from app.services import file_store
from .vector_store import VectorStore

SYSTEM_PROMPT = """You are an expert AI assistant specialized in two-stroke engines.
You help engineers, technicians, and mechanics diagnose problems, generate hypotheses,
and find solutions using a curated knowledge base of technical documents, manuals, and expert knowledge.

Your responses should:
1. Generate ranked hypotheses for the described problem
2. Suggest concrete troubleshooting steps
3. Reference the provided knowledge base sources
4. Be practical and specific to two-stroke engine systems
5. If the problem is not clearly described, ask clarifying questions about: engine size, symptoms, what has already been checked

Always cite which source document your information comes from."""

MODEL = "gemini-2.5-flash"
LOW_EVIDENCE_THRESHOLD = 0.55
MIN_SOURCE_RELEVANCE = 0.6

SMALL_TALK = {
    "hi",
    "hello",
    "hey",
    "hey there",
    "good morning",
    "good afternoon",
    "good evening",
    "thanks",
    "thank you",
    "ok",
    "okay",
}

STRUCTURED_SCHEMA = """Return ONLY valid JSON with this shape:
{
  "answer": "Brief practical answer in 2-4 sentences.",
  "evidence_warning": "A short warning when the retrieved evidence is weak, otherwise null.",
  "clarifying_questions": ["Question to ask before diagnosis"],
  "hypotheses": [
    {
      "title": "Likely cause",
      "probability": "high|medium|low",
      "reasoning": "Why this fits the symptom, grounded in the sources.",
      "next_check": "Concrete test or inspection to confirm/refute it.",
      "citations": ["S1"]
    }
  ],
  "troubleshooting_steps": [
    {
      "step": 1,
      "action": "What to do next.",
      "expected_result": "What the engineer should observe.",
      "if_not": "What to do if the expected result is not seen.",
      "citations": ["S1"]
    }
  ]
}

Rules:
- Use only citation IDs that appear in the context, such as S1 or S2.
- Cite a source only when that source excerpt directly supports the specific claim or action.
- If a step is reasonable engineering judgment but is not directly stated in the retrieved excerpts, leave citations as [].
- If the retrieved context supports only the root cause but not the detailed procedure, state that in evidence_warning.
- If the retrieved context does not support a claim, say that evidence is weak instead of inventing support.
- Do not use a source citation as support for broader details that are not present in that excerpt.
- Skip causes the engineer has already ruled out."""


def _parse_json(raw: str) -> dict:
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("Empty model response.")
    if "```" in raw:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            raw = raw[start:end + 1]
    return json.loads(raw)


def _snippet(text: str, limit: int = 280) -> str:
    clean = re.sub(r"\s+", " ", text or "").strip()
    return clean[:limit] + ("..." if len(clean) > limit else "")


def _safe_list(value) -> list:
    return value if isinstance(value, list) else []


def _model_error_summary(exc: Exception) -> str:
    msg = str(exc).lower()
    if "429" in msg or "quota" in msg or "resource_exhausted" in msg:
        return "Gemini quota or rate limit reached."
    if "api key" in msg or "permission" in msg or "unauthenticated" in msg:
        return "AI provider authentication failed."
    if "timeout" in msg or "deadline" in msg:
        return "AI provider request timed out."
    return "AI provider request failed."


def _normalise_question(text: str) -> str:
    return re.sub(r"[^a-z0-9\s]", "", text.lower()).strip()


def _is_small_talk(question: str) -> bool:
    normalized = _normalise_question(question)
    if normalized in SMALL_TALK:
        return True
    words = normalized.split()
    return len(words) <= 3 and any(" ".join(words).startswith(greeting) for greeting in ("hi", "hello", "hey"))


class RAGService:
    def __init__(self, vector_store: VectorStore):
        self._store = vector_store
        self._client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    def _build_context(self, hits: list[dict]) -> str:
        if not hits:
            return "No relevant documents found in the knowledge base."
        parts = []
        for i, hit in enumerate(hits, start=1):
            meta = hit["metadata"]
            source = meta.get("source", "unknown")
            page = meta.get("page", "")
            score = hit["score"]
            doc_type = meta.get("doc_type", "unknown")
            parts.append(
                f"[S{i}: {source}, page {page}, type {doc_type}, relevance {score:.2f}]\n"
                f"{hit['text']}"
            )
        return "\n\n---\n\n".join(parts)

    def _build_history(self, history: list[dict]) -> str:
        lines = []
        for msg in history:
            role = "Engineer" if msg["role"] == "user" else "Assistant"
            lines.append(f"{role}: {msg['content']}")
        return "\n\n".join(lines)

    def _build_sources(self, hits: list[dict]) -> list[dict]:
        sources = []
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
                "snippet": _snippet(hit["text"]),
                "has_file": file_store.exists(src),
            })
        return sources

    def _small_talk_response(self) -> dict:
        answer = (
            "Hi. Describe the engine symptom, what changed recently, and what you have already checked, "
            "and I will help narrow it down with the knowledge base."
        )
        return {
            "summary": answer,
            "answer": answer,
            "sources": [],
            "search_query": "",
            "evidence_warning": None,
            "clarifying_questions": [
                "What engine size/type is it?",
                "What symptom are you seeing?",
                "What have you already checked?",
            ],
            "hypotheses": [],
            "troubleshooting_steps": [],
        }

    def _valid_citations(self, citations: list, valid_ids: set[str]) -> list[str]:
        seen: set[str] = set()
        cleaned: list[str] = []
        for citation in citations:
            cid = str(citation).strip()
            if cid in valid_ids and cid not in seen:
                seen.add(cid)
                cleaned.append(cid)
        return cleaned

    def _normalise_structured(self, raw: dict, sources: list[dict], low_evidence: bool) -> dict:
        valid_ids = {s["id"] for s in sources}
        source_snippets = {s["id"]: s.get("snippet") or "" for s in sources}

        hypotheses = []
        for item in _safe_list(raw.get("hypotheses"))[:5]:
            if not isinstance(item, dict):
                continue
            probability = str(item.get("probability") or "medium").lower()
            if probability not in {"high", "medium", "low"}:
                probability = "medium"
            hypotheses.append({
                "title": str(item.get("title") or "Possible cause").strip(),
                "probability": probability,
                "reasoning": str(item.get("reasoning") or "").strip(),
                "next_check": str(item.get("next_check") or "").strip(),
                "citations": self._valid_citations(_safe_list(item.get("citations")), valid_ids),
            })

        steps = []
        for idx, item in enumerate(_safe_list(raw.get("troubleshooting_steps"))[:6], start=1):
            if not isinstance(item, dict):
                continue
            try:
                step_no = int(item.get("step") or idx)
            except (TypeError, ValueError):
                step_no = idx
            steps.append({
                "step": step_no,
                "action": str(item.get("action") or "").strip(),
                "expected_result": str(item.get("expected_result") or "").strip(),
                "if_not": str(item.get("if_not") or "").strip(),
                "citations": self._valid_citations(_safe_list(item.get("citations")), valid_ids),
            })

        warning = raw.get("evidence_warning")
        if low_evidence and not warning:
            warning = (
                "Retrieved evidence is limited or weakly matched. Treat these as hypotheses "
                "to verify, not confirmed conclusions."
            )

        cited_ids = {
            citation
            for item in [*hypotheses, *steps]
            for citation in item.get("citations", [])
        }
        cited_text_len = sum(len(source_snippets.get(cid, "")) for cid in cited_ids)
        if not warning and len(cited_ids) <= 1 and len(hypotheses) + len(steps) >= 3:
            warning = (
                "Direct knowledge-base support is narrow. Cited sources support the main cause, "
                "while uncited details should be treated as diagnostic practice to verify."
            )
        if not warning and cited_ids and cited_text_len < 180 and len(hypotheses) + len(steps) >= 3:
            warning = (
                "The answer relies on a short source excerpt. Use the cited cause as a lead and "
                "verify the detailed checks against a manual or expert procedure."
            )

        answer = str(raw.get("answer") or "").strip()
        if not answer:
            answer = "I found limited evidence in the knowledge base. Use the checks below to narrow the problem."

        return {
            "answer": answer,
            "evidence_warning": str(warning).strip() if warning else None,
            "clarifying_questions": [
                str(q).strip()
                for q in _safe_list(raw.get("clarifying_questions"))[:4]
                if str(q).strip()
            ],
            "hypotheses": hypotheses,
            "troubleshooting_steps": steps,
        }

    def _fallback_structured(self, answer_text: str, low_evidence: bool) -> dict:
        return {
            "answer": answer_text,
            "evidence_warning": (
                "The model response could not be parsed into structured evidence. "
                "Review the source list before acting on the answer."
                if not low_evidence else
                "Retrieved evidence is limited or weakly matched. Treat these as hypotheses to verify."
            ),
            "clarifying_questions": [],
            "hypotheses": [],
            "troubleshooting_steps": [],
        }

    def _retrieval_only_structured(self, sources: list[dict], exc: Exception) -> dict:
        if sources:
            lead = sources[0]
            answer = (
                "AI generation is temporarily unavailable, so I am showing retrieval-only evidence. "
                f"The strongest match is {lead['id']} from {lead['filename']}."
            )
            hypotheses = [{
                "title": "Review the strongest retrieved source",
                "probability": "low",
                "reasoning": lead.get("snippet") or "A relevant source was retrieved, but no AI analysis was generated.",
                "next_check": "Open the cited source and verify whether it applies to this engine and symptom.",
                "citations": [lead["id"]],
            }]
        else:
            answer = "AI generation is temporarily unavailable and no relevant sources were retrieved."
            hypotheses = []

        return {
            "answer": answer,
            "evidence_warning": (
                "Generation failed, so this is not a full diagnosis. "
                f"{_model_error_summary(exc)}"
            ),
            "clarifying_questions": [],
            "hypotheses": hypotheses,
            "troubleshooting_steps": [],
        }

    def _markdown_from_structured(self, structured: dict) -> str:
        lines = [structured["answer"]]
        if structured.get("evidence_warning"):
            lines.append(f"\n**Evidence note:** {structured['evidence_warning']}")
        if structured.get("hypotheses"):
            lines.append("\n## Likely causes")
            for item in structured["hypotheses"]:
                cites = " ".join(f"[{c}]" for c in item.get("citations", []))
                lines.append(
                    f"- **{item['title']}** ({item['probability']}) {cites}\n"
                    f"  - Why: {item['reasoning']}\n"
                    f"  - Check: {item['next_check']}"
                )
        if structured.get("troubleshooting_steps"):
            lines.append("\n## Troubleshooting steps")
            for item in structured["troubleshooting_steps"]:
                cites = " ".join(f"[{c}]" for c in item.get("citations", []))
                lines.append(
                    f"{item['step']}. {item['action']} {cites}\n"
                    f"   Expected: {item['expected_result']}\n"
                    f"   If not: {item['if_not']}"
                )
        if structured.get("clarifying_questions"):
            lines.append("\n## Clarifying questions")
            for q in structured["clarifying_questions"]:
                lines.append(f"- {q}")
        return "\n".join(lines)

    def answer(
        self,
        question: str,
        history: list[dict] | None = None,
        already_checked: str | None = None,
        image_context: str | None = None,
    ) -> dict:
        if _is_small_talk(question) and not image_context:
            result = self._small_talk_response()
            result["search_query"] = question
            return result

        try:
            search_query = f"{question}\n\n{image_context}" if image_context else question
            raw_hits = self._store.search(search_query, n_results=8)
            hits = [hit for hit in raw_hits if hit["score"] >= MIN_SOURCE_RELEVANCE][:5]
            context = self._build_context(hits)
            sources = self._build_sources(hits)
            low_evidence = not hits or max(hit["score"] for hit in hits) < LOW_EVIDENCE_THRESHOLD

            history_block = ""
            if history:
                history_block = f"\nConversation History:\n{self._build_history(history)}\n\n---\n"

            checked_block = ""
            if already_checked and already_checked.strip():
                checked_block = (
                    f"\nIMPORTANT — The engineer has already checked the following and confirmed "
                    f"they are NOT the cause. Do NOT suggest these again:\n{already_checked.strip()}\n\n---\n"
                )

            image_block = ""
            if image_context and image_context.strip():
                image_block = (
                    "\nUser Uploaded Image Analysis (from vision model; this is user-provided "
                    "case context, not a knowledge-base citation):\n"
                    f"{image_context.strip()}\n\n---\n"
                )

            prompt = f"""{SYSTEM_PROMPT}

Knowledge Base Context:
{context}

---
{history_block}{checked_block}{image_block}
Engineer's Current Question: {question}

{STRUCTURED_SCHEMA}"""

            try:
                print(f"[RAG] Calling Gemini model={MODEL} ...")
                response = self._client.models.generate_content(
                    model=MODEL,
                    contents=prompt,
                )
                print(f"[RAG] Got response OK")
                raw_text = response.text or ""
                try:
                    raw = _parse_json(raw_text)
                    structured = self._normalise_structured(raw, sources, low_evidence)
                    answer_text = self._markdown_from_structured(structured)
                except Exception:
                    structured = self._fallback_structured(raw_text, low_evidence)
                    answer_text = raw_text
            except Exception as model_exc:
                structured = self._retrieval_only_structured(sources, model_exc)
                answer_text = self._markdown_from_structured(structured)

        except Exception as e:
            print(f"[RAG ERROR] {e}")
            traceback.print_exc()
            raise

        return {
            "summary": structured.get("answer", answer_text),
            "answer": answer_text,
            "sources": sources,
            "search_query": question,
            "evidence_warning": structured.get("evidence_warning"),
            "clarifying_questions": structured.get("clarifying_questions", []),
            "hypotheses": structured.get("hypotheses", []),
            "troubleshooting_steps": structured.get("troubleshooting_steps", []),
        }
