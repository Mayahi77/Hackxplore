import os
import json
import logging
from fastapi import APIRouter, Depends
from google import genai
from app.services.vector_store import VectorStore
from app.dependencies import get_vector_store

router = APIRouter(prefix="/graph", tags=["graph"])
logger = logging.getLogger(__name__)

_graph_cache: dict | None = None

SEED_QUERIES = [
    "two stroke engine not starting ignition spark plug",
    "piston damage scoring overheating lubrication failure",
    "carburetor fuel mixture jetting air screw needle",
    "power loss performance mid range RPM tuning",
    "crankshaft bearing seal failure vibration noise",
    "reed valve intake transfer port exhaust port timing",
    "cooling system water temperature detonation knock pre-ignition",
    "compression ratio cylinder head gasket leak",
    "exhaust pipe expansion chamber resonance tuning",
    "oil mixing ratio two stroke lubrication smoke",
]

EXTRACT_PROMPT = """You are an expert in two-stroke engine engineering.

Analyze these technical text excerpts from two-stroke engine documents and extract a structured knowledge graph of engine concepts.

Return ONLY valid JSON with no markdown fences, no explanation — just the raw JSON object:
{{
  "nodes": [
    {{"id": "unique_slug", "label": "Human Readable Name", "type": "component|problem|cause|symptom|solution|parameter"}}
  ],
  "edges": [
    {{"source": "node_id", "target": "node_id", "label": "relationship", "weight": 0.8}}
  ]
}}

Node types:
- component: physical engine parts (piston, carburetor, reed valve, crankshaft, etc.)
- problem: failure modes (seizure, power loss, hard starting, detonation, etc.)
- cause: root causes of problems (lean mixture, overheating, worn seals, etc.)
- symptom: observable signs (blue smoke, vibration, poor idle, unusual noise, etc.)
- solution: remedies and fixes (adjust jetting, replace seals, check ignition timing, etc.)
- parameter: measurable values (compression ratio, ignition advance, fuel ratio, etc.)

Requirements:
- Extract 20-35 nodes spread across all types
- Node ids must be lowercase_underscore slugs (e.g. "piston_scoring", "lean_mixture")
- Edge labels: short verb phrases like "causes", "indicates", "fixes", "found in", "measured by", "leads to"
- Edge weights: 0.5 (loose association) to 1.0 (direct causation)
- Do NOT use document filenames as nodes — only engine concepts

Text excerpts:
{context}"""


async def _build_concept_graph(store: VectorStore) -> dict:
    global _graph_cache
    if _graph_cache is not None:
        return _graph_cache

    if store.count() == 0:
        return {"nodes": [], "edges": []}

    seen: set[str] = set()
    chunks: list[str] = []
    for query in SEED_QUERIES:
        for hit in store.search(query, n_results=3):
            text = hit["text"][:500]
            if text not in seen:
                seen.add(text)
                chunks.append(text)
        if len(chunks) >= 25:
            break

    context = "\n\n---\n\n".join(chunks[:25])
    client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=EXTRACT_PROMPT.format(context=context),
        )
        raw = response.text.strip()
        if "```" in raw:
            start = raw.index("{")
            end = raw.rindex("}") + 1
            raw = raw[start:end]

        data = json.loads(raw)
        node_ids = {n["id"] for n in data.get("nodes", [])}
        edges = [
            e for e in data.get("edges", [])
            if e.get("source") in node_ids and e.get("target") in node_ids
        ]
        result = {"nodes": data.get("nodes", []), "edges": edges}
        _graph_cache = result
        return result
    except Exception:
        logger.exception("Concept graph extraction failed")
        return {"nodes": [], "edges": []}


@router.get("/")
async def get_graph(store: VectorStore = Depends(get_vector_store)):
    return await _build_concept_graph(store)


@router.post("/refresh")
async def refresh_graph(store: VectorStore = Depends(get_vector_store)):
    global _graph_cache
    _graph_cache = None
    return await _build_concept_graph(store)
