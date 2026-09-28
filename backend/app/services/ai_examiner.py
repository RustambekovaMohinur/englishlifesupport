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

    endpoint_url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
    headers = {"x-goog-api-key": api_key, "Content-Type": "application/json"}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
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
    """
    extracted_text = (raw_text or "").strip()
    is_pdf = False

    if file_bytes:
        f_name_lower = (file_name or "").lower()
        if f_name_lower.endswith(".pdf") or (mime_type and "pdf" in mime_type.lower()):
            is_pdf = True
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(file_bytes))
                pdf_lines: list[str] = []
                for page in reader.pages[:30]:
                    page_txt = page.extract_text()
                    if page_txt and page_txt.strip():
                        pdf_lines.append(page_txt.strip())
                if pdf_lines:
                    extracted_text = (extracted_text + "\n\n" + "\n\n".join(pdf_lines)).strip()
            except Exception as e:
                logger.warning("pypdf parsing failed: %s", e)
        elif f_name_lower.endswith((".txt", ".csv")) or (mime_type and "text" in mime_type.lower()):
            try:
                decoded = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                decoded = file_bytes.decode("latin-1", errors="replace")
            extracted_text = (extracted_text + "\n\n" + decoded).strip()

    if not extracted_text and not (is_pdf and file_bytes):
        return []

    api_key = get_gemini_api_key()

    prompt = (
        "You are an expert Cambridge/IELTS English lexicographer, linguistic examiner, and bilingual translator. "
        "Extract every English vocabulary item, multi-word collocation, phrasal verb, idiom, or word from the provided text or document.\n\n"
        "EXTRACTION RULES:\n"
        "1. Identify all target terms/expressions. Multi-word collocations (e.g. 'eager for', 'in terms of', 'take into account'), "
        "phrasal verbs (e.g. 'look forward to', 'break down'), idioms, and single words (e.g. 'bloom') MUST be preserved as complete headwords.\n"
        "2. For each term, return:\n"
        "   - 'word': The exact English term/collocation/idiom (e.g. 'eager for', 'bloom').\n"
        "   - 'pos': Part of speech, strictly one of: 'noun', 'verb', 'adjective', 'adverb', 'phrase', 'idiom', 'phrasal_verb'.\n"
        "   - 'definition': A concise, high-quality Cambridge English definition explaining the meaning.\n"
        "   - 'uzbek_translation': Accurate, natural Uzbek translation (e.g. 'intiq bo\\'lmoq, juda xohlamoq'). If the input already contains an Uzbek translation, clean, refine, and preserve it.\n"
        "   - 'example_sentence': A natural B2/C1 Cambridge context sentence showing authentic usage.\n"
        "   - 'phonetic': Accurate IPA phonetic transcription (e.g. '/ˈiːɡər fɔːr/').\n\n"
        "Return a STRICT JSON array of objects with this schema:\n"
        "[\n"
        "  {\n"
        '    "word": "eager for",\n'
        '    "pos": "phrase",\n'
        '    "definition": "Wanting something very much.",\n'
        '    "uzbek_translation": "intiq bo\'lmoq, juda xohlamoq",\n'
        '    "example_sentence": "She was eager for the holidays to begin.",\n'
        '    "phonetic": "/ˈiːɡər fɔːr/"\n'
        "  },\n"
        "  {\n"
        '    "word": "bloom",\n'
        '    "pos": "verb",\n'
        '    "definition": "To produce flowers; to flourish or develop well.",\n'
        '    "uzbek_translation": "gullamoq; gul",\n'
        '    "example_sentence": "The roses bloom in spring.",\n'
        '    "phonetic": "/bluːm/"\n'
        "  }\n"
        "]"
    )

    if api_key:
        try:
            parts: list[dict] = []
            if extracted_text:
                parts.append({"text": f"{prompt}\n\nINPUT CONTENT TO PARSE:\n\"\"\"\n{extracted_text[:30000]}\n\"\"\""})
            else:
                parts.append({"text": prompt})

            # If PDF document is available and extracted text was empty or short (< 200 chars), pass multimodal inlineData
            if is_pdf and file_bytes and len(extracted_text) < 200 and len(file_bytes) <= 15 * 1024 * 1024:
                b64_pdf = base64.b64encode(file_bytes).decode("utf-8")
                parts.append({
                    "inlineData": {
                        "mimeType": "application/pdf",
                        "data": b64_pdf,
                    }
                })

            endpoint_url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
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

            async with httpx.AsyncClient(timeout=45.0) as client:
                resp = await client.post(endpoint_url, headers=headers, json=payload)

            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    content_parts = candidates[0].get("content", {}).get("parts", [])
                    if content_parts:
                        raw_llm_text = content_parts[0].get("text", "")
                        clean_json_str = raw_llm_text.strip()
                        if "```" in clean_json_str:
                            clean_json_str = re.sub(r"^```(?:json)?\s*", "", clean_json_str, flags=re.IGNORECASE)
                            clean_json_str = re.sub(r"\s*```$", "", clean_json_str)
                        clean_json_str = clean_json_str.strip()

                        parsed = json.loads(clean_json_str)
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
                                "definition": definition,
                                "uzbek_translation": uz_trans,
                                "example_sentence": ex_sent,
                                "phonetic": phon,
                                "audio_us_url": audio_us,
                                "part_of_speech": raw_pos if raw_pos != "phrase" else "idiom",
                                "custom_translation": uz_trans,
                                "example": ex_sent,
                            })

                        if results:
                            logger.info("Successfully extracted %d vocabulary items via Gemini AI.", len(results))
                            return results

        except Exception as exc:
            logger.warning("Gemini AI wordlist extraction encountered error: %s; using resilient fallback", exc)

    # Resilient local fallback if Gemini is offline or fails
    fallback_items = []
    lines = [l.strip() for l in extracted_text.splitlines() if l.strip()]
    for line in lines[:50]:
        cleaned = re.sub(r"^(\d+[\.\)]|\*|-|\+)\s+", "", line).strip()
        if not cleaned:
            continue
        word = cleaned
        translation = ""
        for sep in [" - ", " = ", " : ", "-", "=", ":", "\t"]:
            if sep in cleaned:
                parts = cleaned.split(sep, 1)
                word = parts[0].strip()
                translation = parts[1].strip()
                break
        if not word:
            continue

        w_lower = word.lower()
        is_phrase = " " in w_lower or w_lower.startswith(("look ", "eager ", "in ", "take ", "break "))
        pos = "phrase" if is_phrase else "noun"
        if not is_phrase:
            if w_lower.endswith(("able", "ible", "ous", "ful", "ive", "ic", "al")):
                pos = "adjective"
            elif w_lower.endswith("ly"):
                pos = "adverb"
            elif w_lower.endswith(("ize", "ise", "ate", "ify")):
                pos = "verb"

        w_slug = word.lower().replace(" ", "_")
        fallback_items.append({
            "word": word,
            "pos": pos,
            "definition": translation or f"Concept of {word}",
            "uzbek_translation": translation or "",
            "example_sentence": f"Understanding '{word}' is important in authentic English.",
            "phonetic": "",
            "audio_us_url": f"https://ssl.gstatic.com/dictionary/static/sounds/20200429/{w_slug}--_us_1.mp3",
            "part_of_speech": pos if pos != "phrase" else "idiom",
            "custom_translation": translation,
            "example": f"Understanding '{word}' is important in authentic English.",
        })

    return fallback_items

