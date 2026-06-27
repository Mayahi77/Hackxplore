import hashlib
import os
import unicodedata
from pathlib import Path
from typing import Optional

# Keep Chroma quiet even when VectorStore is imported outside app.main.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
os.environ.setdefault("CHROMA_TELEMETRY", "False")

import chromadb
from chromadb import Documents, EmbeddingFunction, Embeddings
from fastembed import TextEmbedding


def normalize_source_name(source: str) -> str:
    """Canonical source key used for lookup, replacement and deduplication."""
    if not source:
        return "unknown"
    source = unicodedata.normalize("NFC", source.strip())
    if source.startswith("note:"):
        return "note: " + source.removeprefix("note:").strip()
    return Path(source).name


def _safe_meta_value(value):
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _content_hash(text: str) -> str:
    normalized = " ".join((text or "").split())
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:16]


def stable_chunk_id(chunk: dict) -> str:
    meta = chunk.get("metadata") or {}
    parts = [
        normalize_source_name(str(meta.get("source") or meta.get("filename") or "unknown")),
        str(meta.get("doc_type") or ""),
        str(meta.get("page") or ""),
        str(meta.get("sheet") or ""),
        str(meta.get("chunk_index") or 0),
        _content_hash(chunk.get("text") or ""),
    ]
    return hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()


class FastEmbedFunction(EmbeddingFunction):
    """Lightweight ONNX-based local embeddings — no API calls, no PyTorch."""

    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5"):
        self._model = TextEmbedding(model_name=model_name)

    def __call__(self, input: Documents) -> Embeddings:
        return [emb.tolist() for emb in self._model.embed(list(input))]


class VectorStore:
    def __init__(self):
        persist_dir = os.getenv("CHROMA_PERSIST_DIR", "./data/chroma")
        collection_name = os.getenv("COLLECTION_NAME", "two_stroke_knowledge")

        os.makedirs(persist_dir, exist_ok=True)

        self._client = chromadb.PersistentClient(path=persist_dir)
        self._ef = FastEmbedFunction()
        self._collection = self._client.get_or_create_collection(
            name=collection_name,
            embedding_function=self._ef,
            metadata={"hnsw:space": "cosine"},
        )

    def _normalise_chunk(self, chunk: dict) -> dict:
        meta = dict(chunk.get("metadata") or {})
        source = normalize_source_name(str(meta.get("source") or meta.get("filename") or "unknown"))
        meta["source"] = source
        meta["filename"] = normalize_source_name(str(meta.get("filename") or source))

        clean_meta = {
            key: clean
            for key, value in meta.items()
            if (clean := _safe_meta_value(value)) is not None
        }
        normalised = {
            "id": stable_chunk_id({"text": chunk.get("text") or "", "metadata": clean_meta}),
            "text": chunk.get("text") or "",
            "metadata": clean_meta,
        }
        return normalised

    def _all_ids_for_source(self, source: str) -> list[str]:
        if self._collection.count() == 0:
            return []
        target = normalize_source_name(source)
        results = self._collection.get(include=["metadatas"])
        ids = results.get("ids") or []
        metas = results.get("metadatas") or []
        return [
            item_id for item_id, meta in zip(ids, metas)
            if normalize_source_name(str((meta or {}).get("source", "unknown"))) == target
        ]

    def delete_source(self, source: str) -> int:
        ids = self._all_ids_for_source(source)
        if ids:
            self._collection.delete(ids=ids)
        return len(ids)

    def add_chunks(self, chunks: list[dict], replace_source: bool = False) -> None:
        if not chunks:
            return
        chunks = [self._normalise_chunk(c) for c in chunks if (c.get("text") or "").strip()]
        if not chunks:
            return

        if replace_source:
            for source in {c["metadata"]["source"] for c in chunks}:
                self.delete_source(source)

        batch_size = 50
        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]
            self._collection.upsert(
                ids=[c["id"] for c in batch],
                documents=[c["text"] for c in batch],
                metadatas=[c["metadata"] for c in batch],
            )

    def search(self, query: str, n_results: int = 5, where: Optional[dict] = None) -> list[dict]:
        count = self._collection.count()
        if count == 0:
            return []
        kwargs: dict = {
            "query_texts": [query],
            "n_results": min(n_results, count),
            "include": ["documents", "metadatas", "distances"],
        }
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

    def cleanup(self, dry_run: bool = True) -> dict:
        """Deduplicate exact chunk repeats and backfill missing metadata.

        This is intentionally conservative: only exact text/source/page/chunk
        repeats are removed. A dry run returns the same counts without mutating.
        """
        if self._collection.count() == 0:
            return {
                "dry_run": dry_run,
                "duplicates_found": 0,
                "duplicates_deleted": 0,
                "metadata_updates": 0,
                "total_chunks": 0,
            }

        from app.services.document_processor import classify_discipline

        results = self._collection.get(include=["documents", "metadatas"])
        ids = results.get("ids") or []
        docs = results.get("documents") or []
        metas = results.get("metadatas") or []

        seen: set[tuple] = set()
        duplicate_ids: list[str] = []
        update_ids: list[str] = []
        update_metas: list[dict] = []

        for item_id, doc, meta in zip(ids, docs, metas):
            meta = dict(meta or {})
            source = normalize_source_name(str(meta.get("source") or meta.get("filename") or "unknown"))
            filename = normalize_source_name(str(meta.get("filename") or source))
            key = (
                source,
                meta.get("doc_type"),
                meta.get("page"),
                meta.get("sheet"),
                meta.get("chunk_index"),
                _content_hash(doc or ""),
            )
            if key in seen:
                duplicate_ids.append(item_id)
                continue
            seen.add(key)

            next_meta = dict(meta)
            next_meta["source"] = source
            next_meta["filename"] = filename
            if not next_meta.get("discipline"):
                next_meta["discipline"] = classify_discipline(doc or "")

            clean_meta = {
                k: clean
                for k, v in next_meta.items()
                if (clean := _safe_meta_value(v)) is not None
            }
            if clean_meta != meta:
                update_ids.append(item_id)
                update_metas.append(clean_meta)

        if not dry_run:
            batch_size = 100
            for i in range(0, len(update_ids), batch_size):
                self._collection.update(
                    ids=update_ids[i : i + batch_size],
                    metadatas=update_metas[i : i + batch_size],
                )
            for i in range(0, len(duplicate_ids), batch_size):
                self._collection.delete(ids=duplicate_ids[i : i + batch_size])

        return {
            "dry_run": dry_run,
            "duplicates_found": len(duplicate_ids),
            "duplicates_deleted": 0 if dry_run else len(duplicate_ids),
            "metadata_updates": len(update_ids),
            "total_chunks": self._collection.count(),
        }

    def list_sources(self) -> list[str]:
        if self._collection.count() == 0:
            return []
        results = self._collection.get(include=["metadatas"])
        sources = {m.get("source", "unknown") for m in results["metadatas"]}
        return sorted(sources)

    def list_documents(self) -> list[dict]:
        """One record per source file with its discipline, type and segment count.

        Notes (doc_type == 'note') are excluded — they live in the Capture view.
        """
        if self._collection.count() == 0:
            return []
        results = self._collection.get(include=["metadatas"])
        agg: dict[str, dict] = {}
        for m in results["metadatas"]:
            if m.get("doc_type") == "note":
                continue
            src = m.get("source", "unknown")
            if src not in agg:
                agg[src] = {
                    "source": src,
                    "filename": m.get("filename", src),
                    "doc_type": m.get("doc_type"),
                    "discipline": m.get("discipline", "General"),
                    "segments": 0,
                    "visual_segments": 0,
                }
            agg[src]["segments"] += 1
            if m.get("modality") == "visual":
                agg[src]["visual_segments"] += 1
        return sorted(agg.values(), key=lambda x: x["filename"].lower())

    def discipline_counts(self) -> dict[str, int]:
        """Number of indexed segments per discipline (excluding notes)."""
        if self._collection.count() == 0:
            return {}
        results = self._collection.get(include=["metadatas"])
        counts: dict[str, int] = {}
        for m in results["metadatas"]:
            if m.get("doc_type") == "note":
                continue
            disc = m.get("discipline", "General")
            counts[disc] = counts.get(disc, 0) + 1
        return counts

    def list_notes(self) -> list[dict]:
        if self._collection.count() == 0:
            return []
        try:
            results = self._collection.get(
                where={"doc_type": "note"},
                include=["documents", "metadatas"],
            )
        except Exception:
            return []
        notes: dict[str, dict] = {}
        for doc, meta in zip(results.get("documents") or [], results.get("metadatas") or []):
            source = normalize_source_name(meta.get("source", "note: unknown"))
            title = meta.get("filename", "Quick Note")
            chunk_idx = int(meta.get("chunk_index", 0))
            if source not in notes or chunk_idx < notes[source]["_idx"]:
                notes[source] = {
                    "source": source,
                    "title": title,
                    "preview": doc[:300],
                    "created_at": meta.get("created_at", ""),
                    "capture_origin": meta.get("capture_origin", "manual"),
                    "_idx": chunk_idx,
                }
        return [
            {
                "source": v["source"],
                "title": v["title"],
                "preview": v["preview"],
                "created_at": v["created_at"],
                "capture_origin": v["capture_origin"],
            }
            for v in sorted(notes.values(), key=lambda x: x["created_at"], reverse=True)
        ]
