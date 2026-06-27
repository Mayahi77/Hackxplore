import os
import chromadb
from chromadb.utils import embedding_functions
from typing import Optional


class VectorStore:
    def __init__(self):
        persist_dir = os.getenv("CHROMA_PERSIST_DIR", "./data/chroma")
        collection_name = os.getenv("COLLECTION_NAME", "two_stroke_knowledge")
        embedding_model = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

        os.makedirs(persist_dir, exist_ok=True)

        self._client = chromadb.PersistentClient(path=persist_dir)
        self._ef = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=embedding_model
        )
        self._collection = self._client.get_or_create_collection(
            name=collection_name,
            embedding_function=self._ef,
            metadata={"hnsw:space": "cosine"},
        )

    def add_chunks(self, chunks: list[dict]) -> None:
        if not chunks:
            return
        ids = [c["id"] for c in chunks]
        documents = [c["text"] for c in chunks]
        metadatas = [c["metadata"] for c in chunks]
        self._collection.upsert(ids=ids, documents=documents, metadatas=metadatas)

    def search(self, query: str, n_results: int = 5, where: Optional[dict] = None) -> list[dict]:
        kwargs = {"query_texts": [query], "n_results": n_results, "include": ["documents", "metadatas", "distances"]}
        if where:
            kwargs["where"] = where

        results = self._collection.query(**kwargs)

        hits = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            hits.append({"text": doc, "metadata": meta, "score": 1 - dist})
        return hits

    def count(self) -> int:
        return self._collection.count()

    def list_sources(self) -> list[str]:
        if self._collection.count() == 0:
            return []
        results = self._collection.get(include=["metadatas"])
        sources = {m.get("source", "unknown") for m in results["metadatas"]}
        return sorted(sources)
