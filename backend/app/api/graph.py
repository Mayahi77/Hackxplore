from fastapi import APIRouter, Depends
from collections import defaultdict
from app.services.vector_store import VectorStore
from app.dependencies import get_vector_store

router = APIRouter(prefix="/graph", tags=["graph"])


@router.get("/")
async def get_graph(store: VectorStore = Depends(get_vector_store)):
    """Return nodes (documents) and edges (semantic similarity) for the knowledge graph."""
    if store.count() == 0:
        return {"nodes": [], "edges": []}

    sources = store.list_sources()
    if not sources:
        return {"nodes": [], "edges": []}

    nodes = []
    for src in sources:
        results = store._collection.get(
            where={"source": src},
            limit=1,
            include=["metadatas"],
        )
        meta = results["metadatas"][0] if results["metadatas"] else {}
        nodes.append({
            "id": src,
            "label": src,
            "type": "document",
            "doc_type": meta.get("doc_type", "unknown"),
        })

    edges = []
    seen_pairs: set[frozenset] = set()

    for src in sources:
        results = store._collection.get(
            where={"source": src},
            limit=1,
            include=["documents"],
        )
        if not results["documents"]:
            continue

        rep_chunk = results["documents"][0]
        hits = store.search(rep_chunk, n_results=min(10, store.count()))

        for hit in hits:
            other_src = hit["metadata"].get("source", "")
            if other_src == src or other_src not in sources:
                continue
            pair = frozenset([src, other_src])
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            edges.append({
                "source": src,
                "target": other_src,
                "weight": round(hit["score"], 3),
            })

    edge_count: dict[str, int] = defaultdict(int)
    filtered = []
    for e in sorted(edges, key=lambda x: x["weight"], reverse=True):
        if edge_count[e["source"]] < 3 and edge_count[e["target"]] < 3:
            filtered.append(e)
            edge_count[e["source"]] += 1
            edge_count[e["target"]] += 1

    return {"nodes": nodes, "edges": filtered}
