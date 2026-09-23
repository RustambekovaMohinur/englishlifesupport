"""
Standalone Gemini AI Examiner Service.

Enriches raw English vocabulary entries using Google Gemini AI as an expert
Cambridge/IELTS English examiner and lexicographer.

Gracefully falls back to None if GEMINI_API_KEY is missing, empty, or if any API call fails.
"""
import json
import logging
import os
import re
from pathlib import Path

import httpx

from app.schemas.wordlist import WordDetailPreview

logger = logging.getLogger(__name__)

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash").strip()

VALID_POS_SET = {"noun", "verb", "adjective", "adverb", "idiom", "phrasal_verb"}

POS_MAP = {
    "n": "noun",
    "noun": "noun",
    "v": "verb",
    "verb": "verb",
    "adj": "adjective",
    "adjective": "adjective",
    "adv": "adverb",
    "adverb": "adverb",
    "idiom": "idiom",
    "phrase": "idiom",
    "phrasal_verb": "phrasal_verb",
    "phrasal verb": "phrasal_verb",
}


def normalize_pos(raw_pos: str | None) -> str:
    """Normalize POS to one of ['noun', 'verb', 'adjective', 'adverb', 'idiom', 'phrasal_verb']."""
    if not raw_pos:
        return "noun"
    cleaned = raw_pos.lower().strip().replace("-", "_")
    if cleaned in POS_MAP:
        return POS_MAP[cleaned]
    if cleaned in VALID_POS_SET:
        return cleaned
    if "verb" in cleaned and "phras" in cleaned:
        return "phrasal_verb"
    if "verb" in cleaned:
        return "verb"
    if "adj" in cleaned:
        return "adjective"
    if "adv" in cleaned:
        return "adverb"
    if "idiom" in cleaned or "phrase" in cleaned:
        return "idiom"
    return "noun"


def get_gemini_api_key() -> str:
    """Fetch GEMINI_API_KEY from environment variables or .env file."""
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if key:
        return key

    # Try reading from backend/.env if not present in os.environ
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if env_path.exists():
        try:
            for line in env_path.read_text(encoding="utf-8").splitlines():
                stripped = line.strip()
                if stripped.startswith("GEMINI_API_KEY="):
                    val = stripped.split("=", 1)[1].strip().strip('"').strip("'")
                    if val:
                        return val
        except Exception:
            pass
    return ""


async def enrich_words_with_gemini(raw_entries: list[str]) -> list[WordDetailPreview] | None:
    """
    Enriches up to 50 raw vocabulary entries using Google Gemini AI.

    Returns:
        list[WordDetailPreview] if enrichment succeeded, or None if skipped/failed.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        logger.info("GEMINI_API_KEY not configured or empty. Skipping AI enrichment.")
        return None

    if not raw_entries:
        return []

    entries = [e.strip() for e in raw_entries if e and e.strip()][:50]
    if not entries:
        return []

    system_instruction = (
        "You are an expert Cambridge/IELTS English examiner and lexicographer. "
        "When given raw vocabulary entries (which may include English words and optional Uzbek meanings), "
        "you enrich them cleanly."
    )

    prompt = (
        f"{system_instruction}\n\n"
        "Input vocabulary entries to enrich:\n"
        + "\n".join(f"{i+1}. {entry}" for i, entry in enumerate(entries))
        + "\n\n"
        "Instructions for each entry:\n"
        "1. Extract the cleaned English word/term.\n"
        "2. Identify the part of speech. It MUST be one of: 'noun', 'verb', 'adjective', 'adverb', 'idiom', 'phrasal_verb'.\n"
        "3. Provide the accurate IPA phonetic transcription (e.g. /ˈdrɑː.mə/, /kənˈsɜːrv/).\n"
        "4. Provide a clear Uzbek translation in 'definition'. If the input entry already includes an Uzbek translation (e.g. 'drama - sahna asari'), preserve and refine that translation. Otherwise, provide the most natural, accurate Uzbek equivalent.\n"
        "5. Provide a high-quality, authentic Cambridge/IELTS B2/C1 context sentence in 'example'.\n"
        "6. Provide 'audio_us_url' with the Google dictionary pronunciation link: 'https://ssl.gstatic.com/dictionary/static/sounds/20200429/{word}--_us_1.mp3' (using lowercase with spaces replaced by underscores).\n\n"
        "Return a STRICT JSON array of objects with the exact schema:\n"
        "[\n"
        "  {\n"
        '    "word": "cleaned english term",\n'
        '    "part_of_speech": "noun | verb | adjective | adverb | idiom | phrasal_verb",\n'
        '    "phonetic": "/IPA/",\n'
        '    "definition": "Uzbek translation",\n'
        '    "example": "B2/C1 context example sentence.",\n'
        '    "audio_us_url": "https://ssl.gstatic.com/dictionary/static/sounds/20200429/word--_us_1.mp3"\n'
        "  }\n"
        "]"
    )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                logger.warning(
                    "Gemini API returned status %s: %s",
                    resp.status_code,
                    resp.text[:200],
                )
                return None

            data = resp.json()

        candidates = data.get("candidates", [])
        if not candidates:
            logger.warning("Gemini API response had no candidates.")
            return None

        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            logger.warning("Gemini API candidate had no parts.")
            return None

        raw_text = parts[0].get("text", "").strip()
        if not raw_text:
            return None

        clean_json_str = raw_text
        if clean_json_str.startswith("```"):
            clean_json_str = re.sub(r"^```(?:json)?\s*", "", clean_json_str)
            clean_json_str = re.sub(r"\s*```$", "", clean_json_str)
        clean_json_str = clean_json_str.strip()

        parsed = json.loads(clean_json_str)
        items_list = []
        if isinstance(parsed, list):
            items_list = parsed
        elif isinstance(parsed, dict):
            items_list = parsed.get("words") or parsed.get("items") or parsed.get("vocabulary") or []

        if not items_list:
            logger.warning("Gemini API returned empty items list.")
            return None

        results: list[WordDetailPreview] = []
        for item in items_list:
            if not isinstance(item, dict):
                continue
            w = (item.get("word") or "").strip()
            if not w:
                continue

            pos = normalize_pos(item.get("part_of_speech"))
            phon = (item.get("phonetic") or "").strip()
            definition = (item.get("definition") or item.get("translation") or "").strip()
            example = (item.get("example") or "").strip()
            audio_us = (
                item.get("audio_us_url")
                or f"https://ssl.gstatic.com/dictionary/static/sounds/20200429/{w.lower().replace(' ', '_')}--_us_1.mp3"
            )

            results.append(
                WordDetailPreview(
                    word=w,
                    custom_translation=definition,
                    part_of_speech=pos,
                    phonetic=phon,
                    definition=definition,
                    example=example,
                    audio_us_url=audio_us,
                    audio_gb_url=None,
                    source="gemini_ai",
                )
            )

        if results:
            logger.info("Successfully enriched %d words with Gemini AI Examiner.", len(results))
            return results

        return None

    except Exception as exc:
        logger.warning("Error during Gemini AI vocabulary enrichment: %s", exc)
        return None
