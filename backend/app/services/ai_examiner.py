"""
Secure Gemini AI Examiner Service.

Enriches raw English vocabulary entries using Google Gemini AI as an expert
Cambridge/IELTS English examiner.

Strict Security:
- GEMINI_API_KEY is read strictly from os.environ.get("GEMINI_API_KEY").
- Passed via 'x-goog-api-key' request header (never in URL query string).
- Key is NEVER printed, logged, or exposed in error messages or responses.
- Gracefully falls back to None on missing key or network errors without raising 500s.
"""
import json
import logging
import os
import re
from typing import Any

import httpx

from app.schemas.wordlist import WordDetailPreview

logger = logging.getLogger(__name__)

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash").strip()

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
    """Normalize POS strictly to one of ['noun', 'verb', 'adjective', 'adverb', 'idiom', 'phrasal_verb']."""
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
    """Fetch GEMINI_API_KEY safely from server environment."""
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if key:
        return key

    # Secondary check in case loaded into environment via backend/.env
    try:
        from pathlib import Path
        env_path = Path(__file__).resolve().parent.parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                stripped = line.strip()
                if stripped.startswith("GEMINI_API_KEY="):
                    val = stripped.split("=", 1)[1].strip().strip('"').strip("'")
                    if val:
                        return val
    except Exception:
        pass
    return ""


async def enrich_vocabulary_list(raw_words: list[dict] | list[str]) -> list[dict] | None:
    """
    Analyzes raw vocabulary entries and returns clean, structured dictionary enrichment.

    Args:
        raw_words: List of word strings (e.g. "drama - sahna asari") or dicts (e.g. {"word": "..."})

    Returns:
        List of enriched dicts or None if key is absent or call fails safely.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        logger.info("GEMINI_API_KEY not configured. Falling back to local/dictionary mode.")
        return None

    if not raw_words:
        return []

    # Normalize input entries into list of strings (capped at 50)
    entries: list[str] = []
    for item in raw_words[:50]:
        if isinstance(item, str):
            clean_s = item.strip()
            if clean_s:
                entries.append(clean_s)
        elif isinstance(item, dict):
            w = (item.get("word") or item.get("term") or "").strip()
            t = (item.get("definition") or item.get("translation") or "").strip()
            if w and t:
                entries.append(f"{w} - {t}")
            elif w:
                entries.append(w)

    if not entries:
        return []

    role_instruction = (
        "You are an expert Cambridge/IELTS English examiner. "
        "Analyze English words and return strict, clean JSON only."
    )

    prompt = (
        f"{role_instruction}\n\n"
        "Input words to analyze:\n"
        + "\n".join(f"{i+1}. {entry}" for i, entry in enumerate(entries))
        + "\n\n"
        "Instructions:\n"
        "1. word: Clean English term.\n"
        "2. part_of_speech: Must be strictly one of: 'noun', 'verb', 'adjective', 'adverb', 'idiom', 'phrasal_verb'.\n"
        "3. phonetic: Accurate IPA transcription (e.g. /kənˈsɜːv/).\n"
        "4. definition: Natural Uzbek translation. If input contains teacher's custom translation, preserve it.\n"
        "5. example: Natural B2/C1 Cambridge context sentence.\n"
        "6. audio_us_url: Pronunciation audio link (https://ssl.gstatic.com/dictionary/static/sounds/20200429/{word}--_us_1.mp3) or empty string.\n\n"
        "Return a STRICT JSON array of objects with keys: "
        '["word", "part_of_speech", "phonetic", "definition", "example", "audio_us_url"]'
    )

    # Use secure header authentication so API key is NEVER present in the URL query string
    endpoint_url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
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
            resp = await client.post(endpoint_url, headers=headers, json=payload)
            if resp.status_code != 200:
                logger.warning("Gemini AI service returned non-200 status code: %s", resp.status_code)
                return None

            data = resp.json()

        candidates = data.get("candidates", [])
        if not candidates:
            return None

        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            return None

        raw_text = parts[0].get("text", "").strip()
        if not raw_text:
            return None

        # Strip markdown fences if present
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
            items_list = parsed.get("words") or parsed.get("items") or []

        if not items_list:
            return None

        results: list[dict] = []
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

            results.append({
                "word": w,
                "part_of_speech": pos,
                "phonetic": phon,
                "definition": definition,
                "example": example,
                "audio_us_url": audio_us,
            })

        if results:
            logger.info("Enriched %d vocabulary items via Gemini AI.", len(results))
            return results

        return None

    except Exception:
        logger.warning("Gemini AI request encountered an error; falling back safely.")
        return None


async def enrich_words_with_gemini(raw_entries: list[str]) -> list[WordDetailPreview] | None:
    """
    Helper converting enrich_vocabulary_list output to list[WordDetailPreview].
    """
    enriched = await enrich_vocabulary_list(raw_entries)
    if not enriched:
        return None

    previews: list[WordDetailPreview] = []
    for item in enriched:
        previews.append(
            WordDetailPreview(
                word=item["word"],
                custom_translation=item["definition"],
                part_of_speech=item["part_of_speech"],
                phonetic=item["phonetic"],
                definition=item["definition"],
                example=item["example"],
                audio_us_url=item["audio_us_url"],
                audio_gb_url=None,
                source="gemini_ai",
            )
        )
    return previews
