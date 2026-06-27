import os
import traceback
from google import genai
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
            parts.append(f"[Source {i}: {source}, page {page}, relevance {score:.2f}]\n{hit['text']}")
        return "\n\n---\n\n".join(parts)

    def _build_history(self, history: list[dict]) -> str:
        lines = []
        for msg in history:
            role = "Engineer" if msg["role"] == "user" else "Assistant"
            lines.append(f"{role}: {msg['content']}")
        return "\n\n".join(lines)

    def answer(
        self,
        question: str,
        history: list[dict] | None = None,
        already_checked: str | None = None,
    ) -> dict:
        try:
            hits = self._store.search(question, n_results=5)
            context = self._build_context(hits)

            history_block = ""
            if history:
                history_block = f"\nConversation History:\n{self._build_history(history)}\n\n---\n"

            checked_block = ""
            if already_checked and already_checked.strip():
                checked_block = (
                    f"\nIMPORTANT — The engineer has already checked the following and confirmed "
                    f"they are NOT the cause. Do NOT suggest these again:\n{already_checked.strip()}\n\n---\n"
                )

            prompt = f"""{SYSTEM_PROMPT}

Knowledge Base Context:
{context}

---
{history_block}{checked_block}
Engineer's Current Question: {question}

Please analyze this two-stroke engine problem and provide:
1. Most likely causes (ranked by probability) — skip anything already checked above
2. Step-by-step troubleshooting guidance
3. References to the source documents above"""

            print(f"[RAG] Calling Gemini model={MODEL} ...")
            response = self._client.models.generate_content(
                model=MODEL,
                contents=prompt,
            )
            print(f"[RAG] Got response OK")
            answer_text = response.text

        except Exception as e:
            print(f"[RAG ERROR] {e}")
            traceback.print_exc()
            raise

        sources = []
        seen: set[str] = set()
        for hit in hits:
            src = hit["metadata"].get("source", "unknown")
            if src not in seen:
                seen.add(src)
                sources.append({
                    "filename": src,
                    "page": hit["metadata"].get("page"),
                    "doc_type": hit["metadata"].get("doc_type"),
                    "relevance": round(hit["score"], 3),
                })

        return {
            "answer": answer_text,
            "sources": sources,
            "search_query": question,
        }
