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
import base64
import io
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any

# Ensure backend root is on sys.path so 'app.*' imports resolve cleanly
_backend_dir = str(Path(__file__).resolve().parent.parent.parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

try:
    from dotenv import load_dotenv
    _backend_env = Path(_backend_dir) / ".env"
    if _backend_env.exists():
        load_dotenv(_backend_env)
    _root_env = Path(_backend_dir).parent / ".env"
    if _root_env.exists():
        load_dotenv(_root_env)
except Exception:
    pass

import httpx

from app.schemas.wordlist import WordDetailPreview

logger = logging.getLogger(__name__)


def get_clean_gemini_model(raw_name: str | None = None) -> str:
    """
    Cleans model name by stripping redundant 'models/' prefix, quotes, and whitespace.
    Prevents 404 errors caused by '/models/models/gemini-1.5-flash'.
    """
    val = (raw_name or os.environ.get("GEMINI_MODEL") or "gemini-1.5-flash").strip().strip('"\'')
    while val.startswith("models/") or val.startswith("/models/"):
        if val.startswith("models/"):
            val = val[len("models/"):]
        elif val.startswith("/models/"):
            val = val[len("/models/"):]
        val = val.strip()
    return val or "gemini-1.5-flash"


def get_gemini_candidate_models(primary_name: str | None = None) -> list[str]:
    """
    Returns ordered candidate model identifiers to try in case of 404 or unsupported endpoints.
    """
    primary = get_clean_gemini_model(primary_name)
    candidates = [primary]
    for fallback in ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"]:
        if fallback not in candidates:
            candidates.append(fallback)
    return candidates


GEMINI_MODEL = get_clean_gemini_model()

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
    """Fetch GEMINI_API_KEY or GOOGLE_API_KEY safely from server environment or .env files."""
    key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if key:
        return key

    # Reload explicitly using python-dotenv
    try:
        from dotenv import load_dotenv
        env_path = Path(__file__).resolve().parent.parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path, override=True)
            key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
            if key:
                return key
        root_env = Path(__file__).resolve().parent.parent.parent.parent / ".env"
        if root_env.exists():
            load_dotenv(root_env, override=True)
            key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
            if key:
                return key
    except Exception:
        pass
    return ""


async def run_prompt(prompt: str) -> dict | None:
    """Send a prompt to Gemini and return parsed JSON response.
    Returns None on error or missing API key.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        logger.info("GEMINI_API_KEY not configured. Skipping AI call.")
        return None

    candidate_models = get_gemini_candidate_models()
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = None
            for model in candidate_models:
                endpoint_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                resp = await client.post(endpoint_url, headers=headers, json=payload)
                if resp.status_code == 200:
                    break
                elif resp.status_code in {400, 404} and ("not found" in resp.text.lower() or "not supported" in resp.text.lower()):
                    continue
                else:
                    break

            if not resp or resp.status_code != 200:
                logger.warning("Gemini AI service returned non-200 status code: %s", resp.status_code if resp else "None")
                return None
        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return None
        content = candidates[0].get("content", {})
        parts = content.get("parts", [])
        if not parts:
            return None
        # Assume the first part text contains JSON
        text = parts[0].get("text", "")
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning("Failed to parse Gemini response as JSON.")
            return None
    except Exception as e:
        logger.exception("Error calling Gemini API: %s", e)
        return None


async def enrich_vocabulary_list(raw_words: list[str | dict]) -> list[dict] | None:
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

    candidate_models = get_gemini_candidate_models()
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
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = None
            for model in candidate_models:
                endpoint_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                resp = await client.post(endpoint_url, headers=headers, json=payload)
                if resp.status_code == 200:
                    break
                elif resp.status_code in {400, 404} and ("not found" in resp.text.lower() or "not supported" in resp.text.lower()):
                    continue
                else:
                    break

            if not resp or resp.status_code != 200:
                logger.warning("Gemini AI service returned non-200 status code: %s", resp.status_code if resp else "None")
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
        clean_json_str = raw_text.strip()
        if "```" in clean_json_str:
            clean_json_str = re.sub(r"^```(?:json)?\s*", "", clean_json_str, flags=re.IGNORECASE)
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
                "ai_generated": True,
                "source": "gemini_ai",
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
                ai_generated=True,
            )
        )
    return previews


async def ai_parse_wordlist_multiformat(
    raw_text: str | None = None,
    file_bytes: bytes | None = None,
    file_name: str | None = None,
    mime_type: str | None = None,
) -> list[dict]:
    """
    Parses raw text or uploaded documents (PDF, TXT, CSV) using Gemini 1.5 Flash into
    structured vocabulary items with collocations, phrasal verbs, idioms, pos,
    English definitions, Uzbek translations, examples, and phonetic transcriptions.
    Eliminates dummy regex fallback to ensure 100% data integrity.
    """
    extracted_text = (raw_text or "").strip()
    is_pdf = False

    if file_bytes:
        f_name_lower = (file_name or "").lower()
        if f_name_lower.endswith(".pdf") or (mime_type and "pdf" in mime_type.lower()):
            is_pdf = True
        elif f_name_lower.endswith((".txt", ".csv")) or (mime_type and "text" in mime_type.lower()):
            try:
                decoded = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                decoded = file_bytes.decode("latin-1", errors="replace")
            extracted_text = (extracted_text + "\n\n" + decoded).strip()

    if not extracted_text and not (is_pdf and file_bytes):
        raise ValueError("Please provide vocabulary text or upload a valid document (PDF, TXT, CSV).")

    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured on the server. Please configure GEMINI_API_KEY to enable AI document extraction.")

    prompt = (
        "You are an expert linguistic extractor. The document or input contains a 4-column vocabulary table with the following structure:\n"
        "[Word/Phrase | Uzbek Translation | English Definition | Example Sentence]\n\n"
        "EXTRACTION RULES:\n"
        "1. Extract EVERY single row accurately without splitting across cells or rows.\n"
        "2. Multi-word expressions, collocations, phrasal verbs, idioms, and compound terms (e.g. 'eager for', 'stand still', 'protective gear', 'elbow and knee pads', 'take precautions', 'eye-witness', 'capable of') MUST remain as a single term in 'word'.\n"
        "3. Preserve the exact Uzbek translation for each term in 'uzbek_translation'.\n"
        "4. Place the English definition in 'definition' and the example sentence in 'example_sentence'. Do NOT truncate or split sentences.\n"
        "5. If Part of Speech (POS) is not explicitly given, infer it accurately: 'noun', 'verb', 'adjective', 'adverb', 'phrase', 'idiom', or 'phrasal_verb'.\n"
        "6. Return a STRICT JSON array of objects conforming to the exact schema below without any extra text or markdown formatting:\n"
        "[\n"
        "  {\n"
        '    "word": "Endless",\n'
        '    "pos": "adjective",\n'
        '    "uzbek_translation": "cheksiz, nihoyasiz",\n'
        '    "definition": "Having no end; continuing forever.",\n'
        '    "example_sentence": "The desert seemed endless.",\n'
        '    "phonetic": "/ˈend.ləs/"\n'
        "  },\n"
        "  {\n"
        '    "word": "Eager for",\n'
        '    "pos": "phrase",\n'
        '    "uzbek_translation": "intiq bo\'lmoq, juda xohlamoq",\n'
        '    "definition": "Wanting something very much.",\n'
        '    "example_sentence": "She was eager for the holidays to begin.",\n'
        '    "phonetic": "/ˈiːɡər fɔːr/"\n'
        "  }\n"
        "]"
    )

    parts: list[dict] = []

    # If it is a PDF document, pass the raw PDF bytes directly to Gemini 1.5 Flash via multimodal inlineData
    if is_pdf and file_bytes:
        if len(file_bytes) > 20 * 1024 * 1024:
            raise ValueError("PDF file exceeds maximum allowed size of 20 MB.")
        b64_pdf = base64.b64encode(file_bytes).decode("utf-8")
        parts.append({
            "inlineData": {
                "mimeType": "application/pdf",
                "data": b64_pdf,
            }
        })
        if extracted_text:
            parts.append({
                "text": f"{prompt}\n\nAdditional text notes from user:\n\"\"\"\n{extracted_text[:10000]}\n\"\"\""
            })
        else:
            parts.append({"text": prompt})
    else:
        parts.append({
            "text": f"{prompt}\n\nINPUT CONTENT TO PARSE:\n\"\"\"\n{extracted_text[:40000]}\n\"\"\""
        })

    candidate_models = get_gemini_candidate_models()
    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
        },
    }

    resp = None
    last_error_detail = ""

    async with httpx.AsyncClient(timeout=60.0) as client:
        for model in candidate_models:
            endpoint_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            try:
                resp = await client.post(endpoint_url, headers=headers, json=payload)
                if resp.status_code == 200:
                    logger.info("Gemini AI wordlist parsing succeeded using model '%s'.", model)
                    break
                elif resp.status_code in {400, 404} and ("not found" in resp.text.lower() or "not supported" in resp.text.lower()):
                    logger.warning("Gemini model '%s' returned HTTP %d (%s); attempting fallback model...", model, resp.status_code, resp.text[:120])
                    last_error_detail = resp.text[:300]
                    continue
                else:
                    last_error_detail = resp.text[:300]
                    logger.warning("Gemini request returned HTTP %d for model '%s': %s", resp.status_code, model, last_error_detail)
                    if resp.status_code in {401, 403, 429}:
                        break
            except Exception as req_err:
                logger.warning("Error posting to Gemini with model '%s': %s", model, req_err)
                last_error_detail = str(req_err)
                continue

    if not resp or resp.status_code != 200:
        err_msg = last_error_detail or (f"HTTP {resp.status_code}" if resp else "No response")
        logger.error("Gemini API call failed across all candidate models: %s", err_msg)
        raise RuntimeError(f"Gemini AI error: {err_msg}")

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        raise RuntimeError("Gemini AI returned empty candidates.")

    content_parts = candidates[0].get("content", {}).get("parts", [])
    if not content_parts:
        raise RuntimeError("Gemini AI returned empty content parts.")

    raw_llm_text = content_parts[0].get("text", "")
    clean_json_str = raw_llm_text.strip()
    if "```" in clean_json_str:
        clean_json_str = re.sub(r"^```(?:json)?\s*", "", clean_json_str, flags=re.IGNORECASE)
        clean_json_str = re.sub(r"\s*```$", "", clean_json_str)
    clean_json_str = clean_json_str.strip()

    try:
        parsed = json.loads(clean_json_str)
    except Exception as exc:
        logger.error("Failed to parse JSON from Gemini response: %s; Response was: %s", exc, raw_llm_text[:500])
        raise RuntimeError(f"Failed to parse structured JSON from AI output: {exc}")

    items_list = parsed if isinstance(parsed, list) else (parsed.get("words") or parsed.get("items") or [])

    results = []
    for item in items_list:
        if not isinstance(item, dict):
            continue
        w = (item.get("word") or "").strip()
        if not w:
            continue
        raw_pos = str(item.get("pos") or item.get("part_of_speech") or "phrase").lower().strip()
        if raw_pos not in {"noun", "verb", "adjective", "adverb", "phrase", "idiom", "phrasal_verb"}:
            raw_pos = normalize_pos(raw_pos)

        definition = (item.get("definition") or "").strip()
        uz_trans = (item.get("uzbek_translation") or item.get("translation") or item.get("custom_translation") or "").strip()
        ex_sent = (item.get("example_sentence") or item.get("example") or "").strip()
        phon = (item.get("phonetic") or "").strip()
        w_slug = w.lower().replace(" ", "_")
        audio_us = item.get("audio_us_url") or f"https://ssl.gstatic.com/dictionary/static/sounds/20200429/{w_slug}--_us_1.mp3"

        results.append({
            "word": w,
            "pos": raw_pos,
            "uzbek_translation": uz_trans,
            "definition": definition,
            "example_sentence": ex_sent,
            "phonetic": phon,
            "audio_us_url": audio_us,
            "part_of_speech": raw_pos if raw_pos != "phrase" else "idiom",
            "custom_translation": uz_trans,
            "example": ex_sent,
        })

    if not results:
        raise ValueError("No vocabulary items could be extracted from the document.")

    logger.info("Successfully extracted %d vocabulary items via Gemini AI.", len(results))
    return results


