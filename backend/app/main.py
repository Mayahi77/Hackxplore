import os
from dotenv import load_dotenv

load_dotenv()

# Disable ChromaDB telemetry before it initialises
os.environ["ANONYMIZED_TELEMETRY"] = "False"
os.environ["CHROMA_TELEMETRY"] = "False"

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import chat, documents, graph, notes

app = FastAPI(
    title="TwoStroke AI Knowledge Base",
    description="AI-powered two-stroke engine troubleshooting assistant",
    version="0.1.0",
)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "").split(",")
CORS_ORIGINS = [o.strip() for o in CORS_ORIGINS if o.strip()] or [
    "http://localhost:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.netlify\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(notes.router, prefix="/api")


@app.get("/")
async def root():
    return {"status": "running", "service": "TwoStroke AI Knowledge Base"}
