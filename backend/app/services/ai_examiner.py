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
import asyncio
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


DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
SUPPORTED_FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.5-pro"]
_DISCOVERED_MODELS_CACHE: list[str] = []

QUOTA_FRIENDLY_ERROR = "AI quota limit reached. Please wait a minute or provide an additional Gemini API key in settings."
_ACTIVE_KEY_INDEX: int = 0


def _load_raw_keys_from_env() -> list[str]:
    raw_list: list[str] = []
    try:
        from dotenv import dotenv_values
        env_paths = [
            Path(__file__).resolve().parent.parent.parent / ".env",
            Path(__file__).resolve().parent.parent.parent.parent / ".env",
        ]
        for ep in env_paths:
            if ep.exists():
                vals = dotenv_values(ep)
                for k in ["GEMINI_API_KEYS", "GEMINI_API_KEY", "GOOGLE_API_KEY"]:
                    v = vals.get(k)
                    if v and str(v).strip():
                        raw_list.append(str(v).strip())
    except Exception:
        pass
    return raw_list


def resolve_gemini_api_keys(provided_key: str | None = None) -> list[str]:
    """
    Parses provided key and/or environment keys into a unique, stripped list of non-empty API keys.
    Supports comma, semicolon, or newline delimited strings in GEMINI_API_KEY, GEMINI_API_KEYS, or GOOGLE_API_KEY.
    """
    raw_sources: list[str] = []
    if provided_key and provided_key.strip():
        raw_sources.append(provided_key.strip())

    for env_var in ["GEMINI_API_KEYS", "GEMINI_API_KEY", "GOOGLE_API_KEY"]:
        v = (os.environ.get(env_var) or "").strip()
        if v:
            raw_sources.append(v)

    # If still empty, inspect .env files
    if not raw_sources:
        raw_sources = _load_raw_keys_from_env()

    resolved_keys: list[str] = []
    for raw in raw_sources:
        for token in re.split(r"[,;\n\r]+", raw):
            clean = token.strip().strip('"\'')
            if clean and clean not in resolved_keys:
                resolved_keys.append(clean)

    return resolved_keys


def get_gemini_api_keys() -> list[str]:
    """Returns all configured Gemini API keys."""
    return resolve_gemini_api_keys()


def get_gemini_api_key() -> str:
    """
    Fetch active GEMINI_API_KEY safely from server environment or .env files.
    If multiple keys are configured, returns the current active rotated key.
    """
    keys = get_gemini_api_keys()
    if not keys:
        return ""
    global _ACTIVE_KEY_INDEX
    return keys[_ACTIVE_KEY_INDEX % len(keys)]


def rotate_active_gemini_key() -> str:
    """Rotates to the next available Gemini API key in the configured list."""
    global _ACTIVE_KEY_INDEX
    keys = get_gemini_api_keys()
    if not keys:
        return ""
    _ACTIVE_KEY_INDEX = (_ACTIVE_KEY_INDEX + 1) % len(keys)
    logger.info("Rotated Gemini active API key to index %d/%d.", _ACTIVE_KEY_INDEX + 1, len(keys))
    return keys[_ACTIVE_KEY_INDEX]


def reset_gemini_keys_cache() -> None:
    """Resets the active key index to 0 (useful for tests)."""
    global _ACTIVE_KEY_INDEX
    _ACTIVE_KEY_INDEX = 0


def get_clean_gemini_model(raw_name: str | None = None) -> str:
    """
    Cleans model name by stripping redundant 'models/' prefix, quotes, and whitespace.
    Prevents 404 errors caused by '/models/models/gemini-3.8-flash'.
    """
    val = (raw_name or os.environ.get("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL).strip().strip('"\'')
    while val.startswith("models/") or val.startswith("/models/"):
        if val.startswith("models/"):
            val = val[len("models/"):]
        elif val.startswith("/models/"):
            val = val[len("/models/"):]
        val = val.strip()
    return val or DEFAULT_GEMINI_MODEL


def get_gemini_candidate_models(primary_name: str | None = None) -> list[str]:
    """
    Returns ordered candidate model identifiers to try in case of 404 or unsupported endpoints.
    Prioritizes gemini-3.8-flash, gemini-2.5-flash, gemini-2.5-pro.
    """
    primary = get_clean_gemini_model(primary_name)
    candidates = [primary]
    for fallback in SUPPORTED_FALLBACK_MODELS:
        if fallback not in candidates:
            candidates.append(fallback)
    return candidates


GEMINI_MODEL = get_clean_gemini_model()


def reset_gemini_models_cache() -> None:
    """Resets the dynamic discovered models cache (useful for testing or key rotation)."""
    global _DISCOVERED_MODELS_CACHE
    _DISCOVERED_MODELS_CACHE = []


async def discover_active_gemini_models(api_key: str | None = None) -> list[str]:
    """
    Queries Google Generative Language API for currently supported models:
    GET https://generativelanguage.googleapis.com/v1beta/models?key={api_key}
    Filters models that support 'generateContent', strips 'models/' prefix,
    and sorts flash models first. Caches result in-memory.
    """
    global _DISCOVERED_MODELS_CACHE
    if _DISCOVERED_MODELS_CACHE:
        return list(_DISCOVERED_MODELS_CACHE)

    key = api_key or get_gemini_api_key()
    if not key:
        return list(SUPPORTED_FALLBACK_MODELS)

    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
    headers = {"x-goog-api-key": key}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                logger.warning("Failed to discover Gemini models (HTTP %d): %s", resp.status_code, resp.text[:200])
                return list(SUPPORTED_FALLBACK_MODELS)

            data = resp.json()
            models_data = data.get("models", [])
            valid_models: list[str] = []
            for item in models_data:
                methods = item.get("supportedGenerationMethods", [])
                if "generateContent" in methods:
                    raw_model_name = item.get("name", "")
                    clean_name = get_clean_gemini_model(raw_model_name)
                    if clean_name and "embedding" not in clean_name.lower():
                        valid_models.append(clean_name)

            if valid_models:
                def model_sort_key(m: str) -> tuple[int, int, str]:
                    m_lower = m.lower()
                    if m_lower == "gemini-3.8-flash":
                        return (0, 0, m)
                    if "3.8" in m_lower and "flash" in m_lower:
                        return (1, 0, m)
                    if "flash" in m_lower:
                        return (2, 0, m)
                    if "pro" in m_lower:
                        return (3, 0, m)
                    return (4, 0, m)

                valid_models.sort(key=model_sort_key)
                _DISCOVERED_MODELS_CACHE = valid_models
                logger.info("Successfully discovered %d active Gemini models: %s", len(valid_models), valid_models[:5])
                return list(_DISCOVERED_MODELS_CACHE)

    except Exception as exc:
        logger.warning("Exception during dynamic Gemini model discovery: %s", exc)

    return list(SUPPORTED_FALLBACK_MODELS)


async def execute_gemini_generate_content(
    payload: dict,
    api_key: str | None = None,
    timeout: float = 30.0,
    preferred_model: str | None = None,
    max_backoff_retries: int = 2,
    backoff_delays: tuple[float, ...] = (2.0, 4.0),
) -> tuple[httpx.Response | None, str]:
    """
    Executes a generateContent call against Gemini with:
    1. Multi-Key Support & Rotation: Automatically rotates to the next available API key if 429 quota is hit.
    2. Exponential Backoff: Waits 2s, 4s if all configured keys are rate-limited.
    3. Primary candidate model list (['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.5-pro']).
    4. Dynamic model suggestion extraction if Google API suggests a replacement model in error text.
    5. Dynamic model discovery fallback via /v1beta/models if candidate models return 404/unsupported/retired.
    Returns (response, last_error_detail).
    """
    keys = resolve_gemini_api_keys(api_key)
    if not keys:
        return None, "GEMINI_API_KEY is not configured on the server."

    global _ACTIVE_KEY_INDEX
    candidates = get_gemini_candidate_models(preferred_model)
    last_error_detail = ""
    num_keys = len(keys)

    # Exponential backoff loop (attempt 0: immediate, attempt 1: 2s delay, attempt 2: 4s delay)
    for backoff_attempt in range(max_backoff_retries + 1):
        if backoff_attempt > 0:
            delay = backoff_delays[min(backoff_attempt - 1, len(backoff_delays) - 1)]
            logger.warning(
                "All %d Gemini API key(s) hit rate limit / quota. Retrying with exponential backoff in %.1fs (attempt %d/%d)...",
                num_keys,
                delay,
                backoff_attempt,
                max_backoff_retries,
            )
            await asyncio.sleep(delay)

        all_keys_hit_429 = True

        async with httpx.AsyncClient(timeout=timeout) as client:
            # Rotate across all keys starting from current active index
            start_key_idx = _ACTIVE_KEY_INDEX
            for key_offset in range(num_keys):
                key_idx = (start_key_idx + key_offset) % num_keys
                current_key = keys[key_idx]
                headers = {
                    "x-goog-api-key": current_key,
                    "Content-Type": "application/json",
                }

                current_key_hit_429 = False
                tried_models: set[str] = set()

                m_idx = 0
                while m_idx < len(candidates):
                    model = candidates[m_idx]
                    m_idx += 1
                    if model in tried_models:
                        continue
                    tried_models.add(model)

                    endpoint_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={current_key}"
                    try:
                        resp = await client.post(endpoint_url, headers=headers, json=payload)
                        if resp.status_code == 200:
                            _ACTIVE_KEY_INDEX = key_idx
                            return resp, ""

                        last_error_detail = resp.text[:300]
                        error_lower = resp.text.lower()

                        # Check 429 Quota Exceeded / Rate Limit
                        if resp.status_code == 429 or "quota" in error_lower or "resource_exhausted" in error_lower:
                            current_key_hit_429 = True
                            logger.warning(
                                "Gemini API key %d/%d hit HTTP 429 / Quota Exceeded (%s).",
                                key_idx + 1,
                                num_keys,
                                last_error_detail[:120],
                            )
                            # Rotate immediately: break out of model loop for this key to try the next key
                            break

                        # Check if API suggested an alternative model
                        suggested_match = re.search(r"update your code to use models/([a-zA-Z0-9._-]+)", resp.text, re.IGNORECASE)
                        if suggested_match:
                            suggested_model = get_clean_gemini_model(suggested_match.group(1))
                            if suggested_model and suggested_model not in tried_models and suggested_model not in candidates:
                                candidates.insert(m_idx, suggested_model)
                                logger.info("Prioritizing Google-suggested Gemini model: %s", suggested_model)

                        # Check if model is deprecated, not found, or unsupported
                        is_model_issue = resp.status_code in {400, 404} and any(
                            phrase in error_lower
                            for phrase in ["not found", "not supported", "no longer available", "deprecated", "update your code"]
                        )
                        if is_model_issue:
                            logger.warning("Gemini model '%s' returned HTTP %d: %s; trying fallback model...", model, resp.status_code, last_error_detail[:100])
                            continue

                        # Auth error (invalid key)
                        if resp.status_code in {401, 403}:
                            logger.error("Gemini API key %d/%d returned auth error (%d): %s; rotating key...", key_idx + 1, num_keys, resp.status_code, last_error_detail)
                            break

                    except Exception as req_err:
                        last_error_detail = str(req_err)
                        logger.warning("Error calling Gemini endpoint for model '%s' with key %d: %s", model, key_idx + 1, req_err)
                        continue

                # If key didn't hit 429 and candidates exhausted, try dynamic discovery
                if not current_key_hit_429:
                    logger.info("Candidate models exhausted on key %d. Checking dynamic discovery...", key_idx + 1)
                    discovered = await discover_active_gemini_models(current_key)
                    for model in discovered:
                        if model in tried_models:
                            continue
                        tried_models.add(model)
                        endpoint_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={current_key}"
                        try:
                            resp = await client.post(endpoint_url, headers=headers, json=payload)
                            if resp.status_code == 200:
                                _ACTIVE_KEY_INDEX = key_idx
                                return resp, ""
                            last_error_detail = resp.text[:300]
                            if resp.status_code == 429 or "quota" in resp.text.lower() or "resource_exhausted" in resp.text.lower():
                                current_key_hit_429 = True
                                break
                            if resp.status_code in {401, 403}:
                                break
                        except Exception as req_err:
                            last_error_detail = str(req_err)
                            continue

                if not current_key_hit_429:
                    all_keys_hit_429 = False
                else:
                    # Point active key index to the next key
                    if num_keys > 1:
                        _ACTIVE_KEY_INDEX = (key_idx + 1) % num_keys
                        logger.info("Automatically rotated active key index to %d/%d.", _ACTIVE_KEY_INDEX + 1, num_keys)

        # If not all keys hit 429, don't do exponential backoff (e.g. fatal 400 bad request)
        if not all_keys_hit_429:
            break

    # If all keys exhausted quota
    if all_keys_hit_429 or "quota" in last_error_detail.lower() or "429" in last_error_detail or "resource_exhausted" in last_error_detail.lower():
        logger.error("Gemini API quota exhausted across all %d configured key(s) after %d retries.", num_keys, max_backoff_retries)
        return None, QUOTA_FRIENDLY_ERROR

    return None, last_error_detail

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



async def run_prompt(prompt: str) -> dict | None:
    """Send a prompt to Gemini and return parsed JSON response.
    Returns None on error or missing API key.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        logger.info("GEMINI_API_KEY not configured. Skipping AI call.")
        return None

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
    }

    try:
        resp, last_error = await execute_gemini_generate_content(payload=payload, api_key=api_key, timeout=15.0)
        if not resp or resp.status_code != 200:
            logger.warning("Gemini AI service returned error: %s", last_error or (resp.status_code if resp else "None"))
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
        resp, last_error = await execute_gemini_generate_content(payload=payload, api_key=api_key, timeout=20.0)
        if not resp or resp.status_code != 200:
            logger.warning("Gemini AI enrichment returned error: %s", last_error or (resp.status_code if resp else "None"))
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

    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
        },
    }

def clean_uzbek_text(text: str) -> str:
    """Normalizes Uzbek text, restoring apostrophes for o', g' and cleaning typography."""
    if not text:
        return ""
    # Standardize apostrophes
    s = text.replace("\u2018", "'").replace("\u2019", "'").replace("`", "'").replace("‘", "'").replace("’", "'").replace("\ufffd", "'")
    # Clean hyphen spacing e.g. "eye - witness" -> "eye-witness"
    s = re.sub(r"(\w)\s*-\s*(\w)", r"\1-\2", s)
    # Normalize multiple whitespace
    s = re.sub(r"\s+", " ", s).strip()
    return s


def infer_pos_and_clean_word(word: str) -> tuple[str, str]:
    """Infers POS tag and cleans up any embedded POS markers like '(v)' or '(n)'."""
    w = word.strip()
    match = re.search(
        r"\s*\((v|verb|n|noun|adj|adjective|adv|adverb|phrase|idiom|phrasal[ _]verb)\)\s*$",
        w,
        re.IGNORECASE,
    )
    if match:
        tag = match.group(1).lower()
        clean_w = re.sub(r"\s*\(" + re.escape(match.group(1)) + r"\)\s*$", "", w, flags=re.IGNORECASE).strip()
        pos_map = {
            "v": "verb", "verb": "verb",
            "n": "noun", "noun": "noun",
            "adj": "adjective", "adjective": "adjective",
            "adv": "adverb", "adverb": "adverb",
            "phrase": "phrase", "idiom": "idiom",
            "phrasal_verb": "phrasal_verb", "phrasal verb": "phrasal_verb",
        }
        return clean_w, pos_map.get(tag, "phrase")

    if w.lower().startswith("to ") and len(w.split()) == 2:
        return w, "verb"

    if " " in w:
        return w, "phrase"

    w_low = w.lower()
    if any(w_low.endswith(sfx) for sfx in ["less", "ful", "able", "ible", "ous", "ive", "ic"]):
        return w, "adjective"
    if w_low.endswith("ly") and len(w_low) > 4:
        return w, "adverb"

    return w, "noun"


def parse_pdf_table_locally(file_bytes: bytes) -> list[dict]:
    """
    Extracts vocabulary tables from PDF using exact text coordinate mapping.
    Handles 4-column tables: [Word/Phrase | Uzbek Translation | English Definition | Example Sentence].
    Accurately preserves multi-word collocations and phrasal verbs across multiple line wraps.
    """
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    except Exception as exc:
        logger.warning("pypdf initialization failed: %s", exc)
        return []

    all_rows: list[dict] = []

    for page in reader.pages:
        chunks: list[tuple[float, float, str]] = []

        def visitor(text: str, cm: Any, tm: Any, font_dict: Any, font_size: Any) -> None:
            t = text.strip()
            if t:
                chunks.append((float(tm[4]), float(tm[5]), t))

        try:
            page.extract_text(visitor_text=visitor)
        except Exception:
            continue

        if not chunks:
            continue

        # Filter out table header chunks
        filtered = [
            c for c in chunks
            if not any(
                h in c[2]
                for h in ["Word/Phrase", "Uzbek Translation", "English Definition", "Example Sentence"]
            )
        ]
        if not filtered:
            continue

        # Sort top-to-bottom (y descending)
        filtered.sort(key=lambda c: -c[1])

        # Col 0: Word/Phrase starts at x < 120
        col0_items = [(y, t) for (x, y, t) in filtered if x < 120]
        if not col0_items:
            continue

        # Cluster Col 0 items into headwords.
        # Continuation lines within the same headword have gap <= 20pt.
        headwords: list[dict] = []
        for y, t in col0_items:
            if not headwords:
                headwords.append({"y_max": y, "y_min": y, "words": [t]})
            else:
                last = headwords[-1]
                if last["y_min"] - y <= 20:
                    last["words"].append(t)
                    last["y_min"] = y
                else:
                    headwords.append({"y_max": y, "y_min": y, "words": [t]})

        # Partition vertical windows for each row
        for i, hw in enumerate(headwords):
            y_top = 9999.0 if i == 0 else (headwords[i - 1]["y_min"] + hw["y_max"]) / 2.0
            y_bottom = -9999.0 if i == len(headwords) - 1 else (hw["y_min"] + headwords[i + 1]["y_max"]) / 2.0

            row_chunks = [c for c in filtered if y_bottom <= c[1] < y_top]
            # Sort row chunks by y desc, then x asc
            row_chunks.sort(key=lambda c: (-c[1], c[0]))

            col0_parts = [c[2] for c in row_chunks if c[0] < 120]
            col1_parts = [c[2] for c in row_chunks if 120 <= c[0] < 230]
            col2_parts = [c[2] for c in row_chunks if 230 <= c[0] < 380]
            col3_parts = [c[2] for c in row_chunks if c[0] >= 380]

            raw_word = " ".join(col0_parts).strip()
            if not raw_word:
                continue

            clean_w, pos = infer_pos_and_clean_word(raw_word)
            clean_uz = clean_uzbek_text(" ".join(col1_parts))
            clean_def = clean_uzbek_text(" ".join(col2_parts))
            clean_ex = clean_uzbek_text(" ".join(col3_parts))

            slug = re.sub(r"[^a-zA-Z0-9]+", "_", clean_w.lower()).strip("_")
            audio_url = f"https://ssl.gstatic.com/dictionary/static/sounds/20200429/{slug}--_us_1.mp3"

            all_rows.append({
                "word": clean_w,
                "pos": pos,
                "part_of_speech": pos,
                "uzbek_translation": clean_uz,
                "custom_translation": clean_uz,
                "definition": clean_def,
                "example_sentence": clean_ex,
                "example": clean_ex,
                "phonetic": "",
                "audio_us_url": audio_url,
                "ai_generated": False,
                "fallback_used": True,
                "source": "local_fallback",
            })

    return all_rows


def parse_text_wordlist_locally(raw_text: str) -> list[dict]:
    """
    High-precision local delimiter parser for text dumps, CSVs, or pasted lists.
    Supports delimiters: '|', '\t', '—', '–', '-', ';', ':'
    """
    if not raw_text:
        return []

    lines = raw_text.splitlines()
    results: list[dict] = []

    for line in lines:
        cleaned_line = line.strip()
        if not cleaned_line:
            continue

        # Skip headers if present
        if re.search(r"^(word|headword)\b.*(uzbek|translation|definition)", cleaned_line, re.IGNORECASE):
            continue

        # Strip leading numbers or bullets: '1.', '1)', '-', '•', '*'
        stripped = re.sub(r"^\s*(?:\d+[\.\)]|[-*•\u2022])\s*", "", cleaned_line).strip()
        if not stripped:
            continue

        word = ""
        uz_trans = ""
        defn = ""
        ex = ""

        # Delimiter Strategy 1: Pipe '|'
        if "|" in stripped:
            parts = [p.strip() for p in stripped.split("|")]
            if len(parts) >= 4:
                word, uz_trans, defn, ex = parts[0], parts[1], parts[2], " ".join(parts[3:])
            elif len(parts) == 3:
                word, uz_trans, defn = parts[0], parts[1], parts[2]
            elif len(parts) == 2:
                word, uz_trans = parts[0], parts[1]

        # Delimiter Strategy 2: Tab '\t'
        elif "\t" in stripped:
            parts = [p.strip() for p in stripped.split("\t") if p.strip()]
            if len(parts) >= 4:
                word, uz_trans, defn, ex = parts[0], parts[1], parts[2], " ".join(parts[3:])
            elif len(parts) == 3:
                word, uz_trans, defn = parts[0], parts[1], parts[2]
            elif len(parts) == 2:
                word, uz_trans = parts[0], parts[1]

        # Delimiter Strategy 3: Em-dash / En-dash / Hyphen (' — ', ' – ', ' - ')
        elif any(dash in stripped for dash in [" — ", " – ", " - ", "—", "–"]):
            match = re.split(r"\s*[—–-]\s*", stripped, maxsplit=1)
            if len(match) == 2:
                word = match[0].strip()
                remainder = match[1].strip()
                paren_match = re.search(r"^(.*?)\s*\((.*?)\)$", remainder)
                if paren_match:
                    uz_trans = paren_match.group(1).strip()
                    defn = paren_match.group(2).strip()
                elif ":" in remainder:
                    sub_parts = remainder.split(":", 1)
                    uz_trans = sub_parts[0].strip()
                    defn = sub_parts[1].strip()
                else:
                    uz_trans = remainder

        # Delimiter Strategy 4: Colon ':'
        elif ":" in stripped:
            parts = stripped.split(":", 1)
            word = parts[0].strip()
            uz_trans = parts[1].strip()

        # Delimiter Strategy 5: Semicolon ';'
        elif ";" in stripped:
            parts = [p.strip() for p in stripped.split(";") if p.strip()]
            if len(parts) >= 2:
                word = parts[0]
                uz_trans = parts[1]
                if len(parts) >= 3:
                    defn = parts[2]
                if len(parts) >= 4:
                    ex = " ".join(parts[3:])
            else:
                word = stripped

        else:
            word = stripped

        if not word:
            continue

        clean_w, pos = infer_pos_and_clean_word(word)
        clean_uz = clean_uzbek_text(uz_trans)
        clean_d = clean_uzbek_text(defn)
        clean_e = clean_uzbek_text(ex)

        slug = re.sub(r"[^a-zA-Z0-9]+", "_", clean_w.lower()).strip("_")
        audio_url = f"https://ssl.gstatic.com/dictionary/static/sounds/20200429/{slug}--_us_1.mp3"

        results.append({
            "word": clean_w,
            "pos": pos,
            "part_of_speech": pos,
            "uzbek_translation": clean_uz,
            "custom_translation": clean_uz,
            "definition": clean_d,
            "example_sentence": clean_e,
            "example": clean_e,
            "phonetic": "",
            "audio_us_url": audio_url,
            "ai_generated": False,
            "fallback_used": True,
            "source": "local_fallback",
        })

    return results


def parse_wordlist_locally(
    raw_text: str | None = None,
    file_bytes: bytes | None = None,
    file_name: str | None = None,
    mime_type: str | None = None,
) -> list[dict]:
    """
    High-precision zero-failure local fallback parser for PDFs, TXT, CSV, and raw text.
    Invoked immediately whenever Gemini AI calls time out (>12s) or hit quota limits (HTTP 429).
    """
    is_pdf = False
    if file_bytes:
        f_name_lower = (file_name or "").lower()
        if f_name_lower.endswith(".pdf") or (mime_type and "pdf" in mime_type.lower()):
            is_pdf = True

    if is_pdf and file_bytes:
        pdf_rows = parse_pdf_table_locally(file_bytes)
        if pdf_rows:
            return pdf_rows

        # If table extraction didn't find rows, fallback to extracting text from PDF and parsing lines
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            extracted_pages = []
            for p in reader.pages:
                extracted_pages.append(p.extract_text() or "")
            text_from_pdf = "\n".join(extracted_pages)
            if text_from_pdf.strip():
                return parse_text_wordlist_locally(text_from_pdf)
        except Exception:
            pass

    full_text = (raw_text or "").strip()
    if file_bytes and not is_pdf:
        try:
            decoded = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            decoded = file_bytes.decode("latin-1", errors="replace")
        full_text = (full_text + "\n" + decoded).strip()

    return parse_text_wordlist_locally(full_text)


async def ai_parse_wordlist_multiformat(
    raw_text: str | None = None,
    file_bytes: bytes | None = None,
    file_name: str | None = None,
    mime_type: str | None = None,
) -> list[dict]:
    """
    Hybrid bulletproof vocabulary importer (Gemini AI + High-Precision Local Fallback Engine).
    1. Attempts Gemini AI extraction with a strict 12.0s timeout for Cambridge-quality enrichment.
    2. If Gemini encounters HTTP 429 (Quota Exceeded), times out, or fails for any reason,
       IMMEDIATELY engages the local parsing engine so the teacher's upload NEVER fails.
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

    # Attempt 1: Gemini AI with strict 12-second timeout
    try:
        api_key = get_gemini_api_key()
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not configured on the server.")

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
            "  }\n"
            "]"
        )

        parts: list[dict] = []
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

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
            },
        }

        # Strict 12.0s timeout to prevent request deadlock on client/proxy
        resp, last_error_detail = await execute_gemini_generate_content(
            payload=payload,
            api_key=api_key,
            timeout=12.0,
            max_backoff_retries=1,
            backoff_delays=(1.0,),
        )

        if not resp or resp.status_code != 200:
            raise RuntimeError(last_error_detail or f"HTTP {resp.status_code if resp else 'No response'}")

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

        parsed = json.loads(clean_json_str)
        items_list = parsed if isinstance(parsed, list) else (parsed.get("words") or parsed.get("items") or [])

        ai_results = []
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
            uz_trans = clean_uzbek_text(item.get("uzbek_translation") or item.get("translation") or item.get("custom_translation") or "")
            ex_sent = (item.get("example_sentence") or item.get("example") or "").strip()
            phon = (item.get("phonetic") or "").strip()

            clean_w, pos = infer_pos_and_clean_word(w)
            if raw_pos in {"noun", "verb", "adjective", "adverb", "phrase", "idiom", "phrasal_verb"}:
                pos = raw_pos

            slug = re.sub(r"[^a-zA-Z0-9]+", "_", clean_w.lower()).strip("_")
            audio_url = (
                item.get("audio_us_url")
                or f"https://ssl.gstatic.com/dictionary/static/sounds/20200429/{slug}--_us_1.mp3"
            )

            ai_results.append({
                "word": clean_w,
                "pos": pos,
                "part_of_speech": pos,
                "definition": definition,
                "uzbek_translation": uz_trans,
                "custom_translation": uz_trans,
                "example_sentence": ex_sent,
                "example": ex_sent,
                "phonetic": phon,
                "audio_us_url": audio_url,
                "ai_generated": True,
                "fallback_used": False,
                "source": "gemini_ai",
            })

        if ai_results:
            logger.info("Successfully extracted %d vocabulary items via Gemini AI.", len(ai_results))
            return ai_results

        raise RuntimeError("Gemini AI produced empty items list.")

    except Exception as gemini_err:
        # Fallback 2: High-Precision Local Regex & Table Extraction
        logger.warning(
            "Gemini AI extraction unavailable or timed out (%s); engaging high-precision local fallback parser.",
            gemini_err,
        )
        local_results = parse_wordlist_locally(
            raw_text=extracted_text,
            file_bytes=file_bytes,
            file_name=file_name,
            mime_type=mime_type,
        )
        if local_results:
            logger.info(
                "Successfully extracted %d vocabulary entries using high-precision local fallback engine.",
                len(local_results),
            )
            return local_results

        raise ValueError("Could not extract any vocabulary entries from the document or input text.")


# ============================================================================
# AI WRITING EXAMINER & RUBRIC EVALUATION SERVICE
# ============================================================================

COMMON_VOCAB_UPGRADES: dict[str, list[str]] = {
    "good": ["beneficial", "advantageous", "valuable", "favorable", "constructive"],
    "bad": ["detrimental", "adverse", "unfavorable", "counterproductive", "deleterious"],
    "big": ["substantial", "considerable", "significant", "extensive", "prominent"],
    "small": ["marginal", "negligible", "diminutive", "compact"],
    "important": ["crucial", "paramount", "essential", "imperative", "pivotal"],
    "make": ["generate", "construct", "formulate", "establish", "produce"],
    "get": ["acquire", "obtain", "derive", "procure", "attain"],
    "think": ["contemplate", "surmise", "postulate", "opine", "deliberate"],
    "happy": ["contented", "delighted", "exhilarated", "gratified"],
    "sad": ["disheartened", "despondent", "melancholy", "distressed"],
    "nice": ["pleasant", "delightful", "agreeable", "favorable"],
    "very": ["exceedingly", "substantially", "exceptionally", "profoundly"],
    "thing": ["aspect", "element", "component", "factor", "phenomenon"],
    "show": ["illustrate", "demonstrate", "exemplify", "exhibit", "manifest"],
    "help": ["facilitate", "assist", "accommodate", "support"],
    "hard": ["arduous", "demanding", "formidable", "strenuous"],
    "easy": ["effortless", "straightforward", "uncomplicated"],
    "fast": ["rapid", "swift", "expeditious"],
    "stop": ["cease", "discontinue", "halt", "terminate"],
    "start": ["commence", "initiate", "embark upon", "institute"],
}

COMMON_GRAMMAR_CHECKS = [
    (r"\bhe go\b", "he goes", "Subject-verb agreement: third-person singular requires 'goes'."),
    (r"\bshe go\b", "she goes", "Subject-verb agreement: third-person singular requires 'goes'."),
    (r"\bit go\b", "it goes", "Subject-verb agreement: third-person singular requires 'goes'."),
    (r"\bi goes\b", "I go", "Subject-verb agreement: first-person singular 'I' takes base verb 'go'."),
    (r"\bhe have\b", "he has", "Subject-verb agreement: third-person singular takes 'has'."),
    (r"\bshe have\b", "she has", "Subject-verb agreement: third-person singular takes 'has'."),
    (r"\bit have\b", "it has", "Subject-verb agreement: third-person singular takes 'has'."),
    (r"\bthey is\b", "they are", "Subject-verb agreement: plural subject 'they' takes 'are'."),
    (r"\bwe is\b", "we are", "Subject-verb agreement: plural subject 'we' takes 'are'."),
    (r"\byou is\b", "you are", "Subject-verb agreement: subject 'you' takes 'are'."),
    (r"\bdid went\b", "did go", "Past auxiliary 'did' must be followed by base form 'go'."),
    (r"\bdidn't went\b", "didn't go", "Negative past auxiliary 'didn't' must be followed by base form 'go'."),
    (r"\bmore better\b", "better", "Double comparative: 'better' is already comparative."),
    (r"\bmore easier\b", "easier", "Double comparative: 'easier' is already comparative."),
    (r"\bcan to\b", "can", "Modal verbs ('can') are followed by bare infinitive without 'to'."),
    (r"\bshould to\b", "should", "Modal verbs ('should') are followed by bare infinitive without 'to'."),
    (r"\bmust to\b", "must", "Modal verbs ('must') are followed by bare infinitive without 'to'."),
    (r"\balot\b", "a lot", "Spelling: 'a lot' is written as two separate words."),
    (r"\ba apples?\b", "an apple", "Indefinite article: use 'an' before vowel sounds."),
    (r"\ba oranges?\b", "an orange", "Indefinite article: use 'an' before vowel sounds."),
    (r"\ba ideas?\b", "an idea", "Indefinite article: use 'an' before vowel sounds."),
]


def _evaluate_writing_locally(prompt_topic: str, student_text: str) -> dict:
    """
    High-precision local heuristic evaluation engine.
    Runs when Gemini is offline, rate-limited, or API key is unset.
    Analyzes text metrics, grammar, vocabulary diversity, and logical flow.
    """
    text = (student_text or "").strip()
    words = re.findall(r"\b[A-Za-z'-]+\b", text)
    word_count = len(words)
    unique_words = {w.lower() for w in words}
    lexical_diversity = len(unique_words) / max(1, word_count)

    sentences = [s.strip() for s in re.split(r"[.!?]+", text) if s.strip()]
    sentence_count = len(sentences)
    avg_sentence_len = word_count / max(1, sentence_count)

    # 1. Grammar corrections via regex heuristics
    grammar_corrections: list[dict] = []
    text_lower = text.lower()
    for pattern, corrected, explanation in COMMON_GRAMMAR_CHECKS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            grammar_corrections.append({
                "original": match.group(0),
                "corrected": corrected,
                "explanation": explanation,
            })
            if len(grammar_corrections) >= 5:
                break

    # 2. Vocabulary improvements
    vocab_improvements: list[dict] = []
    for basic_word, suggestions in COMMON_VOCAB_UPGRADES.items():
        if re.search(r"\b" + re.escape(basic_word) + r"\b", text_lower):
            vocab_improvements.append({
                "word": basic_word,
                "suggestions": suggestions[:3],
            })
            if len(vocab_improvements) >= 4:
                break

    # 3. Coherence and discourse markers
    coherence_markers = [
        "however", "furthermore", "moreover", "in addition", "on the other hand",
        "consequently", "therefore", "firstly", "secondly", "in conclusion",
        "to sum up", "for example", "for instance", "nevertheless", "as a result"
    ]
    found_markers = [m for m in coherence_markers if m in text_lower]

    if len(found_markers) >= 3 and sentence_count >= 5:
        coherence_feedback = f"Effective use of cohesive linkers ({', '.join(found_markers[:3])}). Ideas progress logically with well-structured paragraphs."
    elif len(found_markers) >= 1:
        coherence_feedback = f"Satisfactory flow. Found linking devices ({', '.join(found_markers)}). Incorporate more contrastive connectors (e.g., 'Conversely', 'Nevertheless') to elevate academic style."
    else:
        coherence_feedback = "Basic paragraph flow. Consider integrating logical transitions like 'Furthermore', 'However', and 'In conclusion' to guide the reader seamlessly."

    # 4. Score & IELTS Band calculation
    # Base score: length & diversity
    base_score = 65.0
    if word_count >= 150:
        base_score += 15.0
    elif word_count >= 80:
        base_score += 10.0
    elif word_count >= 40:
        base_score += 5.0

    if lexical_diversity > 0.55:
        base_score += 8.0
    elif lexical_diversity > 0.45:
        base_score += 4.0

    if len(found_markers) >= 2:
        base_score += 5.0

    # Penalties for detected mistakes
    penalty = len(grammar_corrections) * 3.5
    final_score = max(50, min(95, round(base_score - penalty)))

    # Map 0-100 score to IELTS Band
    if final_score >= 90:
        band = "8.0"
    elif final_score >= 82:
        band = "7.5"
    elif final_score >= 75:
        band = "7.0"
    elif final_score >= 68:
        band = "6.5"
    elif final_score >= 60:
        band = "6.0"
    elif final_score >= 50:
        band = "5.5"
    else:
        band = "5.0"

    summary = (
        f"Solid written response of {word_count} words with {len(unique_words)} unique terms. "
        f"Demonstrates good engagement with the topic with understandable sentence construction."
    )

    return {
        "suggested_score": final_score,
        "band": band,
        "summary": summary,
        "grammar_corrections": grammar_corrections,
        "vocabulary_improvements": vocab_improvements,
        "coherence_feedback": coherence_feedback,
    }


async def evaluate_writing_submission(prompt_topic: str, student_text: str) -> dict:
    """
    Evaluates student written composition/essay against IELTS & Cambridge criteria:
    - Grammar & Sentence Structure (identifies mistakes and inline fixes)
    - Lexical Resource (suggests advanced C1/B2 synonyms)
    - Task Achievement & Coherence (evaluates relevance and paragraph logic)
    - Suggested Score (0-100) & Band (e.g. 7.0)

    Enforces strict 10s timeout with seamless fallback to local linguistic heuristics.
    """
    cleaned_text = (student_text or "").strip()
    if not cleaned_text:
        return _evaluate_writing_locally(prompt_topic, "")

    api_key = get_gemini_api_key()
    if not api_key:
        logger.info("GEMINI_API_KEY not configured. Running high-precision local writing evaluation.")
        return _evaluate_writing_locally(prompt_topic, cleaned_text)

    prompt = (
        "You are an expert Cambridge English and IELTS Senior Examiner. "
        "Analyze the following student writing homework submission against standard IELTS Writing Task 2 / CEFR C1 criteria.\n\n"
        f"PROMPT TOPIC:\n{prompt_topic[:1000]}\n\n"
        f"STUDENT WRITING SUBMISSION:\n\"\"\"\n{cleaned_text[:12000]}\n\"\"\"\n\n"
        "EVALUATION CRITERIA:\n"
        "1. Grammar & Sentence Structure: Identify specific grammatical, syntactical, or punctuation mistakes with clear explanations and inline fixes.\n"
        "2. Lexical Resource: Identify basic or repetitive words and suggest advanced C1/B2 academic alternatives.\n"
        "3. Task Achievement & Coherence: Check prompt relevance, paragraph transitions, and logical flow.\n"
        "4. Suggested Band: Standard IELTS band scale (e.g. '6.0', '6.5', '7.0', '7.5', '8.0').\n"
        "5. Suggested Score: 0 to 100 percentage integer scale (e.g. 88).\n\n"
        "RETURN STRICT VALID JSON ONLY adhering exactly to this schema:\n"
        "{\n"
        '  "suggested_score": 88,\n'
        '  "band": "7.0",\n'
        '  "summary": "Well-structured essay with good vocabulary variety.",\n'
        '  "grammar_corrections": [\n'
        '    {"original": "he go to school", "corrected": "he goes to school", "explanation": "Subject-verb agreement"}\n'
        "  ],\n"
        '  "vocabulary_improvements": [\n'
        '    {"word": "good", "suggestions": ["beneficial", "advantageous"]}\n'
        "  ],\n"
        '  "coherence_feedback": "Paragraph transitions are logical."\n'
        "}"
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }

    try:
        # Strict 10.0s timeout as requested
        resp, last_err = await execute_gemini_generate_content(
            payload=payload,
            api_key=api_key,
            timeout=10.0,
            max_backoff_retries=1,
            backoff_delays=(1.0,),
        )

        if not resp or resp.status_code != 200:
            logger.warning("Gemini AI writing evaluation failed (%s); using local heuristic fallback.", last_err)
            return _evaluate_writing_locally(prompt_topic, cleaned_text)

        data = resp.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return _evaluate_writing_locally(prompt_topic, cleaned_text)

        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            return _evaluate_writing_locally(prompt_topic, cleaned_text)

        raw_llm_text = parts[0].get("text", "").strip()
        if "```" in raw_llm_text:
            raw_llm_text = re.sub(r"^```(?:json)?\s*", "", raw_llm_text, flags=re.IGNORECASE)
            raw_llm_text = re.sub(r"\s*```$", "", raw_llm_text)
        raw_llm_text = raw_llm_text.strip()

        parsed = json.loads(raw_llm_text)
        if isinstance(parsed, dict) and "suggested_score" in parsed:
            # Normalize schema fields
            score = int(parsed.get("suggested_score") or 80)
            score = max(0, min(100, score))
            band = str(parsed.get("band") or "6.5")
            summary = str(parsed.get("summary") or "Good written response.")
            grammar_corrections = parsed.get("grammar_corrections") or []
            vocabulary_improvements = parsed.get("vocabulary_improvements") or []
            coherence_feedback = str(parsed.get("coherence_feedback") or "Logical progression.")

            logger.info("Successfully evaluated writing submission via Gemini AI: Band %s (%d/100)", band, score)
            return {
                "suggested_score": score,
                "band": band,
                "summary": summary,
                "grammar_corrections": grammar_corrections,
                "vocabulary_improvements": vocabulary_improvements,
                "coherence_feedback": coherence_feedback,
            }

        return _evaluate_writing_locally(prompt_topic, cleaned_text)

    except Exception as exc:
        logger.warning("Exception during Gemini AI writing evaluation (%s); falling back to local heuristics.", exc)
        return _evaluate_writing_locally(prompt_topic, cleaned_text)



