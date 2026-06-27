import os
from google import genai
from google.genai import types

VISION_MODEL = "gemini-2.5-flash"

VISION_PROMPT = """You are analysing an image uploaded to an engineering knowledge base
(screenshots of engineering diagrams, datasheets, part libraries, schematics or photos).

Produce text optimised for later search retrieval. Do the following, in order:

1. TRANSCRIBE every piece of visible text exactly — labels, part numbers, dimensions,
   units, measurements, table cells, axis labels and annotations.
2. DESCRIBE the technical content: what the diagram/screenshot shows, the components
   present, how they relate, and any values or specifications.

Write plain prose and lists only. Do NOT add commentary, opinions, or markdown fences.
If the image contains no legible technical content, reply with exactly: NO_CONTENT"""

# Pillow-supported types we accept for the multimodal pipeline.
SUPPORTED_IMAGE_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
}


def mime_for(filename: str) -> str | None:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return SUPPORTED_IMAGE_MIME.get(ext)


def extract_image_knowledge(
    image_bytes: bytes,
    mime_type: str,
    hint: str | None = None,
) -> str:
    """Run Gemini vision OCR + multimodal description on an image.

    Returns extracted text, or an empty string when nothing legible is found.
    Raises on transport/auth errors so the caller can surface a 502.
    """
    client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))

    prompt = VISION_PROMPT
    if hint and hint.strip():
        prompt += f"\n\nUser-provided context about this image: {hint.strip()}"

    response = client.models.generate_content(
        model=VISION_MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            prompt,
        ],
    )

    text = (response.text or "").strip()
    if not text or text.upper().startswith("NO_CONTENT"):
        return ""
    return text
