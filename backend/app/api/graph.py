import os
import re
import json
import logging
import asyncio
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

# Models tried in order when the primary is overloaded
MODELS_TO_TRY = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"]

# Keyword taxonomy used when all Gemini calls fail
CONCEPT_TAXONOMY: dict[str, list[str]] = {
    "component": [
        "piston", "carburetor", "reed valve", "crankshaft", "cylinder",
        "spark plug", "exhaust pipe", "expansion chamber", "intake port",
        "transfer port", "exhaust port", "bearing", "crankcase", "head gasket",
        "water pump", "radiator", "ignition coil", "flywheel", "stator",
        "needle valve", "float bowl", "air filter",
    ],
    "problem": [
        "seizure", "detonation", "power loss", "hard starting", "overheating",
        "scoring", "fouling", "flooding", "air leak", "compression loss",
        "misfiring", "pre-ignition",
    ],
    "cause": [
        "lean mixture", "rich mixture", "worn seal", "incorrect jetting",
        "carbon build-up", "timing error", "wrong oil ratio", "clogged jet",
        "damaged reed", "blocked port",
    ],
    "symptom": [
        "blue smoke", "poor idle", "backfire", "knocking", "vibration",
        "loss of power", "hard to start", "rough running",
    ],
    "solution": [
        "adjust jetting", "replace seals", "check timing", "clean carburetor",
        "new spark plug", "correct oil ratio", "pressure test", "rebuild engine",
        "replace piston", "decarbonise",
    ],
    "parameter": [
        "compression ratio", "ignition timing", "fuel ratio", "needle position",
        "main jet", "pilot jet", "air screw", "port timing", "squish clearance",
    ],
}


def _is_transient(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(k in msg for k in ("503", "unavailable", "overloaded", "capacity", "try again", "high demand"))


def _parse_gemini_json(raw: str) -> dict:
    raw = raw.strip()
    if "```" in raw:
        raw = raw[raw.index("{"):raw.rindex("}") + 1]
    return json.loads(raw)


def _build_keyword_graph(chunks: list[str]) -> dict:
    all_text = " ".join(chunks).lower()
    found: dict[str, dict] = {}
    for node_type, terms in CONCEPT_TAXONOMY.items():
        for term in terms:
            if term in all_text:
                slug = re.sub(r"[^a-z0-9]+", "_", term)
                found[slug] = {"id": slug, "label": term.title(), "type": node_type}

    edges: list[dict] = []
    seen_pairs: set[tuple] = set()
    for chunk in chunks:
        cl = chunk.lower()
        in_chunk = [slug for slug, meta in found.items() if meta["label"].lower() in cl]
        for i, a in enumerate(in_chunk):
            for b in in_chunk[i + 1:]:
                pair = (min(a, b), max(a, b))
                if pair not in seen_pairs:
                    seen_pairs.add(pair)
                    edges.append({"source": a, "target": b, "label": "related to", "weight": 0.6})

    logger.info("Keyword fallback graph: %d nodes, %d edges", len(found), len(edges))
    return {"nodes": list(found.values()), "edges": edges[:80]}


async def _try_gemini(client: genai.Client, context: str) -> dict | None:
    for model in MODELS_TO_TRY:
        for attempt in range(3):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=EXTRACT_PROMPT.format(context=context),
                )
                data = _parse_gemini_json(response.text)
                node_ids = {n["id"] for n in data.get("nodes", [])}
                edges = [
                    e for e in data.get("edges", [])
                    if e.get("source") in node_ids and e.get("target") in node_ids
                ]
                logger.info("Graph extracted via %s: %d nodes, %d edges", model, len(node_ids), len(edges))
                return {"nodes": data.get("nodes", []), "edges": edges}
            except Exception as exc:
                if _is_transient(exc) and attempt < 2:
                    delay = (attempt + 1) * 6
                    logger.warning(
                        "Model %s attempt %d — transient error, retry in %ds: %s",
                        model, attempt + 1, delay, exc,
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.warning("Model %s attempt %d gave up: %s", model, attempt + 1, exc)
                    break
    return None


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

    result = await _try_gemini(client, context)
    if result is None:
        logger.warning("All Gemini models failed — using keyword fallback graph")
        result = _build_keyword_graph(chunks)

    if result.get("nodes"):
        _graph_cache = result
    return result


@router.get("/")
async def get_graph(store: VectorStore = Depends(get_vector_store)):
    return await _build_concept_graph(store)


@router.post("/refresh")
async def refresh_graph(store: VectorStore = Depends(get_vector_store)):
    global _graph_cache
    _graph_cache = None
    return await _build_concept_graph(store)
