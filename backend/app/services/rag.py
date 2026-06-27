import os
import google.generativeai as genai
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

QUERY_REWRITE_PROMPT = """Given this user question about a two-stroke engine problem,
rewrite it as a concise search query optimized for semantic similarity search.
Return ONLY the rewritten query, nothing else.

Question: {question}"""


class RAGService:
    def __init__(self, vector_store: VectorStore):
        self._store = vector_store
        genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
        self._flash = genai.GenerativeModel("gemini-1.5-flash")
        self._pro = genai.GenerativeModel(
            "gemini-1.5-pro",
            system_instruction=SYSTEM_PROMPT,
        )

    def _rewrite_query(self, question: str) -> str:
        response = self._flash.generate_content(
            QUERY_REWRITE_PROMPT.format(question=question)
        )
        return response.text.strip()

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

    def answer(self, question: str, history: list[dict] | None = None) -> dict:
        search_query = self._rewrite_query(question) if len(question) > 20 else question
        hits = self._store.search(search_query, n_results=5)
        context = self._build_context(hits)

        # Build Gemini chat history format
        gemini_history = []
        if history:
            for msg in history[-6:]:
                role = "user" if msg["role"] == "user" else "model"
                gemini_history.append({"role": role, "parts": [msg["content"]]})

        chat = self._pro.start_chat(history=gemini_history)

        prompt = f"""Knowledge Base Context:
{context}

---

Engineer's Question: {question}

Please analyze this two-stroke engine problem and provide:
1. Most likely causes (ranked by probability)
2. Step-by-step troubleshooting guidance
3. References to the source documents above"""

        response = chat.send_message(prompt)
        answer_text = response.text

        sources = []
        seen = set()
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
            "search_query": search_query,
        }
