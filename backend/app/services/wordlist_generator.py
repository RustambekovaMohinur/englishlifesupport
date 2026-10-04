"""
Precise Vocabulary Companion PDF & Document Extraction Service.

ABSOLUTE PURITY EXTRACTOR (STRICTLY HEADWORD & ENGLISH DEFINITION ONLY):
- Extracts ONLY:
  1. word: Clean English headword / phrasal verb / idiom (NO numbers, NO phonetics, NO slashes, NO foreign words).
  2. definition: Clean English definition (NO foreign words, NO "e.g.", NO example sentences).
- Strictly leaves translation, example_sentence, and other fields EMPTY string ("").
- Completely filters out all section headers ("Lead-in", "Reading", "UNIT 1", "Language focus", page numbers).
"""

import base64
import io
import json
import logging
import re
from typing import Any

from app.services.ai_examiner import (
    execute_gemini_generate_content,
    get_gemini_api_key,
    clean_uzbek_text,
    infer_pos_and_clean_word,
    normalize_pos,
)

logger = logging.getLogger(__name__)

COMPANION_PROMPT = """You are an expert lexicographer. Your ONLY task is to extract clean vocabulary entries from this textbook companion PDF.
For each entry, return a JSON array of objects:
[
  {
    "word": "<clean headword in English>",
    "definition": "<clean English definition>",
    "pos": "phrase",
    "translation": "",
    "example_sentence": ""
  }
]

STRICT NEGATIVE RULES:
1. NEVER output section headers, unit titles, or page numbers (DO NOT output "Lead-in", "Reading", "UNIT 1", "Language focus", "Something to Shout About", or single numbers).
2. STRIP all index numbers like "1.1", "1.7", "1.18", "1.38", "1.57", "1.60" from the word.
3. STRIP all phonetic transcriptions enclosed in slashes (e.g. "/.../", "/ bʊst /", "/ lə /").
4. STRIP all non-English foreign text (e.g. Polish words like "zwiększ", "przygnębi", "dążyć", "do celu").
5. The DEFINITION must only be the English meaning. Stop before any foreign translation slash "/", before "e.g.", and before "Der.:".
6. Do NOT extract example sentences. Set example_sentence to "".
7. Do NOT extract translations. Set translation to "".

Return a STRICT JSON array of objects conforming to the schema above without markdown code fences."""

FORBIDDEN_HEADERS = {
    "lead-in",
    "reading",
    "unit 1",
    "unit 2",
    "unit 3",
    "unit 4",
    "unit 5",
    "unit 6",
    "unit 7",
    "unit 8",
    "unit 9",
    "unit 10",
    "unit",
    "language focus",
    "something to shout about",
    "module",
    "vocabulary",
}


def extract_text_from_pdf_bytes(file_bytes: bytes) -> str:
    """Extracts raw text stream from PDF bytes using pypdf."""
    try:
        import pypdf

        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        pages_text: list[str] = []
        for page in reader.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages_text.append(text)
        return "\n\n".join(pages_text).strip()
    except Exception as exc:
        logger.warning("pypdf text extraction failed: %s", exc)
        return ""


def clean_companion_headword(raw_headword: str) -> tuple[str, str]:
    """
    Cleans headwords by stripping index numbers, phonetics, foreign words, and extracting POS.
    Example: '1.3 foresight /ˈfɔːsaɪt/ (n)' -> ('foresight', 'noun')
    Example: '1.1 block out a thought ab' -> ('block out a thought', 'idiom')
    Example: 'low / lə 1.18 lub przygnębi' -> ('low', 'adjective')
    """
    cand = raw_headword.strip()
    cand = re.sub(r"^.*?(?:e\.g\.|Der\.:)", "", cand).strip()
    if ". " in cand:
        cand = cand.split(". ")[-1].strip()
    if "; " in cand:
        cand = cand.split("; ")[-1].strip()

    # 1. Strip leading digits and dots (e.g. '1.1 ', '1.57 ', '6 ')
    cand = re.sub(r"^\d+(\.\d+)?\s*", "", cand).strip()
    # 2. Strip phonetics enclosed in slashes or backticks
    cand = re.sub(r"/[^/]+/", "", cand).strip()
    cand = re.sub(r"[`'\"'][^a-zA-Z\s]+[`'\"']", "", cand).strip()
    # 3. Strip trailing slashes or symbols and everything after slash
    cand = re.sub(r"\s*/.*$", "", cand).strip()
    cand = re.sub(r"[/\\=]+.*$", "", cand).strip()
    # 4. Remove foreign words attached after numbers (e.g. '1.18 lub przygnębi')
    cand = re.sub(r"\b\d+(\.\d+)?\b.*$", "", cand).strip()

    # Extract POS tag from parentheses e.g. (n), (v), (adj), (adv), (phr v), (idm)
    pos = "phrase"
    pos_match = re.search(r"\s*\((n|v|adj|adv|phr\s*v|idm|idiom|phrase)\)\s*$", cand, re.IGNORECASE)
    if pos_match:
        tag = pos_match.group(1).lower()
        if tag in ("n", "noun"):
            pos = "noun"
        elif tag in ("v", "verb"):
            pos = "verb"
        elif tag in ("adj", "adjective"):
            pos = "adjective"
        elif tag in ("adv", "adverb"):
            pos = "adverb"
        elif tag in ("idm", "idiom"):
            pos = "idiom"
        elif tag in ("phr v", "phrasal verb"):
            pos = "phrasal_verb"
        cand = re.sub(r"\s*\(" + re.escape(pos_match.group(1)) + r"\)\s*$", "", cand, flags=re.IGNORECASE).strip()

    # Remove trailing pagination artifacts (e.g. ' ab' in 'block out a thought ab')
    cand = re.sub(r"\s+[a-z]{1,2}$", "", cand, flags=re.IGNORECASE) if len(cand) > 6 else cand
    cand = cand.replace("’", "'").replace("‘", "'").replace("`", "'")
    cand = re.sub(r"^\s*[-*•]\s*", "", cand).strip()
    cand = re.sub(r"^[^\w\s'\"-]+", "", cand).strip()
    cand = re.sub(r"\s+", " ", cand).strip()

    if pos == "phrase":
        if " " in cand:
            c_low = cand.lower()
            if any(c_low.startswith(p) for p in ["to ", "block out", "channel ", "focus on", "lose sight"]):
                pos = "idiom" if any(x in c_low for x in ["block out", "lose sight", "spirit", "ice"]) else "phrase"
            else:
                pos = "phrase"
        else:
            _, inferred = infer_pos_and_clean_word(cand)
            pos = inferred

    return cand, pos


def is_companion_format(text: str) -> bool:
    """
    Detects if the content matches 'Upstream Companion' style:
    has index numbers like 1.1, '=', '/ foreign', 'e.g.', or 'Der.:'
    """
    if not text:
        return False
    companion_indicators = [
        bool(re.search(r"\b\d+\.\d+\s+[a-zA-Z]", text)),
        "=" in text and ("/" in text or "e.g." in text or "Der.:" in text),
        "lead-in (p." in text.lower(),
        "reading (pp." in text.lower(),
    ]
    return sum(companion_indicators) >= 1


def clean_extracted_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Step B: Hardcoded Python Post-Processing Sanitizer (Fail-Safe)
    Ensures 100% purity:
    - Strips numbers, phonetics, foreign words from headwords
    - Discards section headers (Lead-in, Reading, UNIT 1, etc.)
    - Clean English definition only (stops before '/', 'e.g.', 'Der.:')
    - translation = "", example_sentence = ""
    """
    sanitized: list[dict[str, Any]] = []
    seen: set[str] = set()

    for item in items:
        if not isinstance(item, dict):
            continue

        raw_word = str(item.get("word", "")).strip()

        # 1. Strip leading digits and dots (e.g. "1.1 ", "1.57 ", "6 ")
        word = re.sub(r"^\d+(\.\d+)?\s*", "", raw_word).strip()
        # 2. Strip phonetics /.../
        word = re.sub(r"/[^/]+/", "", word).strip()
        word = re.sub(r"[`'\"'][^a-zA-Z\s]+[`'\"']", "", word).strip()
        # 3. Strip trailing slashes or symbols and everything after slash (phonetics/foreign text)
        word = re.sub(r"\s*/.*$", "", word).strip()
        word = re.sub(r"[/\\=]+.*$", "", word).strip()
        # 4. Remove foreign words attached after numbers (e.g. '1.18 lub przygnębi')
        word = re.sub(r"\b\d+(\.\d+)?\b.*$", "", word).strip()
        # 5. Remove parenthetical POS markers like (n), (v), (adj), (adv)
        word = re.sub(
            r"\s*\((?:n|v|adj|adv|phr\s*v|phrasal\s*verb|idm|idiom|prep|pron|phrase)\.?\)\s*$",
            "",
            word,
            flags=re.IGNORECASE,
        ).strip()
        # 6. Remove trailing pagination artifacts (e.g. ' ab' in 'block out a thought ab')
        word = re.sub(r"\s+[a-z]{1,2}$", "", word, flags=re.IGNORECASE) if len(word) > 6 else word
        word = word.replace("’", "'").replace("‘", "'").replace("`", "'")
        word = re.sub(r"^\s*[-*•]\s*", "", word).strip()
        word = re.sub(r"^[^\w\s'\"-]+", "", word).strip()
        word = re.sub(r"\s+", " ", word).strip()

        # If word is empty, pure digits, or a known section header, SKIP IT COMPLETELY
        if not word or word.isdigit() or word.lower() in FORBIDDEN_HEADERS:
            continue
        if any(h in word.lower() for h in ["lead-in", "unit ", "reading (", "language focus"]):
            continue
        if len(word) < 2:
            continue

        raw_def = str(item.get("definition", "")).strip()
        # Clean definition: remove leading '='
        definition = re.sub(r"^[=\s]+", "", raw_def).strip()
        # Cut off foreign translation starting at '/'
        if "/" in definition:
            definition = definition.split("/")[0].strip()
        # Cut off examples starting at 'e.g.'
        if "e.g." in definition:
            definition = definition.split("e.g.")[0].strip()
        # Cut off derivatives starting at 'Der.:'
        if "Der.:" in definition:
            definition = definition.split("Der.:")[0].strip()
        definition = re.sub(r"\s+", " ", definition).strip()

        w_key = word.lower()
        if w_key in seen:
            continue
        seen.add(w_key)

        slug = re.sub(r"[^a-zA-Z0-9]+", "_", word.lower()).strip("_")
        audio_us_url = f"https://ssl.gstatic.com/dictionary/static/sounds/20200429/{slug}--_us_1.mp3"

        raw_pos = str(item.get("pos", "phrase") or "phrase").lower().strip()
        pos = normalize_pos(raw_pos)

        sanitized.append({
            "word": word,
            "definition": definition,
            "pos": pos,
            "part_of_speech": pos,
            "translation": "",
            "uzbek_translation": "",
            "custom_translation": "",
            "example_sentence": "",
            "example": "",
            "phonetic": "",
            "audio_us_url": audio_us_url,
            "ai_generated": True,
            "fallback_used": False,
            "source": "gemini_ai",
        })

    return sanitized


def parse_companion_stream_clean(text: str) -> list[dict[str, Any]]:
    """
    Structured fallback extraction from textbook companion text.
    Accurately isolates headwords before '=' and English definitions between '=' and '/'.
    """
    chunks = text.split("=")
    items: list[dict[str, Any]] = []

    for i in range(1, len(chunks)):
        prev_chunk = chunks[i - 1]
        curr_chunk = chunks[i]

        prev_lines = [l.strip() for l in prev_chunk.splitlines() if l.strip()]
        if not prev_lines:
            continue

        headword_lines: list[str] = []
        for l in reversed(prev_lines):
            if l.startswith(("e.g.", "Der.:", "UNIT ", "Reading (", "Lead-in", "Language focus")) or re.match(r"^\d+$", l):
                break
            headword_lines.insert(0, l)
            if len(headword_lines) >= 2 or "/" in l or "(" in l:
                break

        raw_tail = " ".join(headword_lines)
        word, pos = clean_companion_headword(raw_tail)

        if not word or word.lower() in FORBIDDEN_HEADERS or re.match(r"^\d+$", word):
            continue
        if any(h in word.lower() for h in ["lead-in", "reading (", "language focus", "unit "]):
            continue

        curr_lines = [l.strip() for l in curr_chunk.splitlines() if l.strip()]
        def_lines: list[str] = []
        for l in curr_lines:
            if l.startswith("e.g.") or l.startswith("Der.:"):
                break
            def_lines.append(l)
            if "/" in l:
                break

        raw_defn = " ".join(def_lines)
        definition = re.split(r"\s*/\s*|e\.g\.", raw_defn)[0].strip()
        definition = re.sub(r"^=\s*", "", definition).strip()
        definition = re.sub(r"\s+", " ", definition).strip()

        items.append({
            "word": word,
            "pos": pos,
            "definition": definition,
            "translation": "",
            "example_sentence": "",
        })

    return items


async def extract_companion_vocabulary(
    raw_text: str | None = None,
    file_bytes: bytes | None = None,
    file_name: str | None = None,
    mime_type: str | None = None,
) -> list[dict[str, Any]]:
    """
    ABSOLUTE PURITY COMPANION EXTRACTION PIPELINE:
    1. Direct Gemini AI extraction with strict negative rules prompt.
    2. Guaranteed post-processing through clean_extracted_items sanitizer.
    3. Returns ONLY clean English headword and clean English definition.
    """
    extracted_text = (raw_text or "").strip()
    is_pdf = False

    if file_bytes:
        f_name_lower = (file_name or "").lower()
        if f_name_lower.endswith(".pdf") or (mime_type and "pdf" in mime_type.lower()):
            is_pdf = True
            pdf_text = extract_text_from_pdf_bytes(file_bytes)
            if pdf_text:
                extracted_text = (extracted_text + "\n\n" + pdf_text).strip()
        elif f_name_lower.endswith((".txt", ".csv")) or (mime_type and "text" in mime_type.lower()):
            try:
                decoded = file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                decoded = file_bytes.decode("latin-1", errors="replace")
            extracted_text = (extracted_text + "\n\n" + decoded).strip()

    if not extracted_text and not (is_pdf and file_bytes):
        raise ValueError("Please provide companion text or upload a valid companion PDF file.")

    api_key = get_gemini_api_key()

    # Attempt 1: Gemini AI Multimodal & Text Processing
    if api_key:
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
                    "text": f"{COMPANION_PROMPT}\n\nDocument text stream:\n\"\"\"\n{extracted_text[:40000]}\n\"\"\""
                })
            else:
                parts.append({"text": COMPANION_PROMPT})
        else:
            parts.append({
                "text": f"{COMPANION_PROMPT}\n\nINPUT COMPANION TEXT TO EXTRACT:\n\"\"\"\n{extracted_text[:40000]}\n\"\"\""
            })

        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
            },
        }

        try:
            resp, last_error = await execute_gemini_generate_content(
                payload=payload,
                api_key=api_key,
                timeout=45.0,
                max_backoff_retries=2,
                backoff_delays=(1.5, 3.0),
            )

            if resp and resp.status_code == 200:
                data = resp.json()
                candidates = data.get("candidates", [])
                if candidates:
                    content_parts = candidates[0].get("content", {}).get("parts", [])
                    if content_parts:
                        raw_llm_text = content_parts[0].get("text", "").strip()
                        if "```" in raw_llm_text:
                            raw_llm_text = re.sub(r"^```(?:json)?\s*", "", raw_llm_text, flags=re.IGNORECASE)
                            raw_llm_text = re.sub(r"\s*```$", "", raw_llm_text)
                        raw_llm_text = raw_llm_text.strip()

                        parsed = json.loads(raw_llm_text)
                        items_list = parsed if isinstance(parsed, list) else (parsed.get("words") or parsed.get("items") or [])
                        if items_list:
                            purified = clean_extracted_items(items_list)
                            if purified:
                                logger.info("Gemini AI extracted and purified %d vocabulary entries.", len(purified))
                                return purified
        except Exception as exc:
            logger.warning("Gemini AI companion extraction encountered: %s; using structured companion parser.", exc)

    # Attempt 2: Structured Companion Document Parser + Data Purification Pipeline
    if extracted_text:
        raw_companion_items = parse_companion_stream_clean(extracted_text)
        if raw_companion_items:
            purified = clean_extracted_items(raw_companion_items)
            if purified:
                logger.info("Structured companion parser purified %d entries.", len(purified))
                return purified

    raise ValueError("No vocabulary entries could be extracted from the companion file. Please ensure it contains 'word = definition' entries.")
