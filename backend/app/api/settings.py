import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/settings", tags=["settings"])

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
PLACEHOLDER_KEY = "your_google_api_key_here"


class GeminiKeyStatus(BaseModel):
    configured: bool
    masked_key: str | None = None
    source: str


class GeminiKeyRequest(BaseModel):
    api_key: str


def _is_configured(value: str | None) -> bool:
    return bool(value and value.strip() and value.strip() != PLACEHOLDER_KEY)


def _mask(value: str | None) -> str | None:
    if not _is_configured(value):
        return None
    value = value.strip()
    if len(value) <= 8:
        return "****"
    return f"{value[:4]}...{value[-4:]}"


def _read_env_lines() -> list[str]:
    if not ENV_PATH.exists():
        return []
    return ENV_PATH.read_text(encoding="utf-8").splitlines()


def _write_env_value(key: str, value: str) -> None:
    lines = _read_env_lines()
    next_line = f"{key}={value}"
    replaced = False
    next_lines: list[str] = []

    for line in lines:
        if line.startswith(f"{key}="):
            next_lines.append(next_line)
            replaced = True
        else:
            next_lines.append(line)

    if not replaced:
        next_lines.append(next_line)

    ENV_PATH.write_text("\n".join(next_lines).rstrip() + "\n", encoding="utf-8")


@router.get("/gemini-key", response_model=GeminiKeyStatus)
async def get_gemini_key_status():
    value = os.getenv("GOOGLE_API_KEY")
    return GeminiKeyStatus(
        configured=_is_configured(value),
        masked_key=_mask(value),
        source=str(ENV_PATH),
    )


@router.put("/gemini-key", response_model=GeminiKeyStatus)
async def update_gemini_key(request: GeminiKeyRequest):
    api_key = request.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API key cannot be empty.")
    if api_key == PLACEHOLDER_KEY:
        raise HTTPException(status_code=400, detail="Use a real Gemini API key, not the placeholder.")

    _write_env_value("GOOGLE_API_KEY", api_key)
    os.environ["GOOGLE_API_KEY"] = api_key

    return GeminiKeyStatus(
        configured=True,
        masked_key=_mask(api_key),
        source=str(ENV_PATH),
    )
