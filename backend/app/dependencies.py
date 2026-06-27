from functools import lru_cache
from app.services.vector_store import VectorStore


@lru_cache(maxsize=1)
def get_vector_store() -> VectorStore:
    return VectorStore()
