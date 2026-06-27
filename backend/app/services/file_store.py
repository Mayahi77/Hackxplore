import os
import re
import hashlib
from pathlib import Path

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./data/uploads")
SOURCE_FILE_DIRS = [
    item.strip()
    for item in os.getenv("SOURCE_FILE_DIRS", "../Sample_Data,./Sample_Data").split(",")
    if item.strip()
]


def _safe_ext(source: str) -> str:
    ext = Path(source).suffix.lower()
    ext = re.sub(r"[^a-z0-9.]", "", ext)
    return ext[:10]


def stored_token(source: str) -> str:
    """Deterministic, path-safe filename derived only from the document source.

    Using a hash keeps the on-disk name free of slashes/spaces/colons (notes use
    "note: title" as a source) while staying reproducible for lookups.
    """
    digest = hashlib.sha1(source.encode("utf-8")).hexdigest()[:16]
    return digest + _safe_ext(source)


def path_for(source: str) -> str:
    return os.path.join(UPLOAD_DIR, stored_token(source))


def resolve_path(source: str) -> str | None:
    stored = path_for(source)
    if os.path.isfile(stored):
        return stored

    source_name = Path(source).name
    if not source_name:
        return None
    for directory in SOURCE_FILE_DIRS:
        candidate = Path(directory) / source_name
        if candidate.is_file():
            return str(candidate)
    return None


def save_original(source: str, content: bytes) -> str:
    """Persist the raw uploaded bytes so the original can be re-downloaded."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    dest = path_for(source)
    with open(dest, "wb") as f:
        f.write(content)
    return dest


def exists(source: str) -> bool:
    return resolve_path(source) is not None
