import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import chat, documents, graph, notes

app = FastAPI(
    title="TwoStroke AI Knowledge Base",
    description="AI-powered two-stroke engine troubleshooting assistant",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
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
