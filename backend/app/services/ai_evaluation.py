"""
AI-Powered Evaluation Service for Writing and Speaking Submissions.

Utilizes Google Gemini multimodal API for:
1. Writing Evaluation: In-depth criteria scoring (Task Achievement, Coherence & Cohesion,
   Lexical Resource, Grammatical Range), strengths, areas for improvement, and line-by-line corrections.
2. Speaking Evaluation: Multimodal audio analysis (Transcription, Fluency & Coherence,
   Pronunciation, Vocabulary, Grammar), strengths, areas for improvement, and phrasing suggestions.

Security & Reliability:
- Uses secure header authentication via 'x-goog-api-key' (never in URL query string).
- API keys are never exposed in responses or logs.
- Asynchronous execution in background tasks to prevent request latency.
- Audio files are fetched securely from Backblaze B2/local storage with error fallbacks.
"""
import base64
import json
import logging
import mimetypes
import os
import re
import uuid
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.assignment import Assignment
from app.models.submission import Submission
from app.models.submission_ai_feedback import AIEvaluationStatus, SubmissionAIFeedback
from app.services.ai_examiner import get_gemini_api_key
from app.utils.files import resolve_submission_file_async

logger = logging.getLogger(__name__)

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-1.5-flash").strip()
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


def clean_llm_json(raw_text: str) -> dict | list | None:
    """Safely extracts and parses JSON from Gemini LLM output, stripping markdown fences."""
    if not raw_text:
        return None
    cleaned = raw_text.strip()
    if "```" in cleaned:
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Attempt to extract outermost JSON object or array
        match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        logger.warning("Failed to decode JSON from Gemini output: %s", cleaned[:200])
        return None


def normalize_audio_mime(content_type: str | None, filename: str | None) -> str:
    """Returns a clean audio MIME type recognized by Gemini API."""
    if content_type:
        raw = content_type.split(";")[0].strip().lower()
        if raw.startswith("audio/"):
            if "webm" in raw:
                return "audio/webm"
            if "wav" in raw:
                return "audio/wav"
            if "mp3" in raw or "mpeg" in raw:
                return "audio/mp3"
            if "ogg" in raw:
                return "audio/ogg"
            if "m4a" in raw or "mp4" in raw:
                return "audio/m4a"
            if "aac" in raw:
                return "audio/aac"
            return raw

    if filename:
        ext = Path(filename).suffix.lower()
        ext_map = {
            ".webm": "audio/webm",
            ".wav": "audio/wav",
            ".mp3": "audio/mp3",
            ".ogg": "audio/ogg",
            ".m4a": "audio/m4a",
            ".aac": "audio/aac",
        }
        if ext in ext_map:
            return ext_map[ext]

    return "audio/webm"


async def evaluate_writing(
    submission_text: str,
    assignment_title: str,
    assignment_prompt: str,
) -> dict:
    """
    Evaluates an essay/writing response against IELTS/CEFR academic writing standards.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured on the server.")

    system_prompt = (
        "You are a certified Cambridge English & IELTS Senior Examiner. "
        "Your task is to thoroughly evaluate the student's written homework submission against the assignment instructions. "
        "Score on a standard IELTS 1.0 to 9.0 Band Scale (with 0.5 increments) across 4 core criteria:\n"
        "1. Task Achievement / Response (How well the response answers all parts of the prompt with developed ideas)\n"
        "2. Coherence & Cohesion (Logical flow, paragraphing, sentence connectors, and discourse structure)\n"
        "3. Lexical Resource (Vocabulary variety, precision, collocations, and spelling accuracy)\n"
        "4. Grammatical Range & Accuracy (Sentence structures, punctuation, syntax, and grammatical correctness)\n\n"
        "Calculate the overall band_score (1.0 - 9.0, rounded to nearest 0.5).\n"
        "Calculate scaled_score_10 = round((band_score / 9.0) * 10, 1) on a 0.0 to 10.0 scale for school grading.\n\n"
        "Provide:\n"
        "- 'overall_feedback': A motivating, pedagogical paragraph highlighting the student's main achievement and key advice.\n"
        "- 'strengths': 2 to 4 bullet points of what the student did well with specific examples from their text.\n"
        "- 'areas_for_improvement': 2 to 4 actionable, concrete recommendations for next time.\n"
        "- 'detailed_corrections': Array of specific mistakes found in their text: "
        "[{\"original\": \"student's text\", \"correction\": \"corrected version\", \"explanation\": \"clear pedagogical reason why\"}].\n\n"
        "Return STRICT valid JSON with this exact schema:\n"
        "{\n"
        '  "band_score": 6.5,\n'
        '  "scaled_score_10": 7.2,\n'
        '  "criteria_scores": {\n'
        '    "task_achievement": 6.5,\n'
        '    "coherence_cohesion": 6.0,\n'
        '    "lexical_resource": 7.0,\n'
        '    "grammatical_range": 6.5\n'
        "  },\n"
        '  "strengths": ["...", "..."],\n'
        '  "areas_for_improvement": ["...", "..."],\n'
        '  "detailed_corrections": [\n'
        '    {"original": "...", "correction": "...", "explanation": "..."}\n'
        "  ],\n"
        '  "overall_feedback": "..."\n'
        "}"
    )

    user_content = (
        f"ASSIGNMENT TITLE: {assignment_title}\n"
        f"ASSIGNMENT PROMPT/INSTRUCTIONS:\n{assignment_prompt}\n\n"
        f"STUDENT WRITTEN SUBMISSION:\n\"\"\"\n{submission_text}\n\"\"\""
    )

    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": f"{system_prompt}\n\n{user_content}"}
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }

    async with httpx.AsyncClient(timeout=35.0) as client:
        resp = await client.post(GEMINI_ENDPOINT, headers=headers, json=payload)
        if resp.status_code != 200:
            logger.error("Gemini writing evaluation failed with HTTP %s: %s", resp.status_code, resp.text[:200])
            raise RuntimeError(f"Gemini API returned status {resp.status_code}")

        data = resp.json()

    candidates = data.get("candidates", [])
    if not candidates:
        raise ValueError("Gemini returned empty candidate response.")

    raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    parsed = clean_llm_json(raw_text)
    if not isinstance(parsed, dict) or "band_score" not in parsed:
        raise ValueError("Failed to obtain structured evaluation JSON from Gemini.")

    return parsed


async def evaluate_speaking(
    audio_bytes: bytes,
    mime_type: str,
    assignment_title: str,
    assignment_prompt: str,
) -> dict:
    """
    Transcribes and evaluates a student's spoken audio submission using Gemini multimodal capabilities.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not configured on the server.")

    if len(audio_bytes) > 20 * 1024 * 1024:
        raise ValueError("Audio recording exceeds the 20MB inline size limit.")

    clean_mime = normalize_audio_mime(mime_type, None)
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

    prompt = (
        "You are an expert Cambridge English & IELTS Speaking Examiner and phonetic specialist. "
        "Analyze the attached student audio recording for their homework assignment.\n\n"
        f"ASSIGNMENT TITLE: {assignment_title}\n"
        f"ASSIGNMENT PROMPT/INSTRUCTIONS:\n{assignment_prompt}\n\n"
        "Your objectives:\n"
        "1. TRANSCRIPTION: Transcribe the student's spoken words verbatim as accurately as possible.\n"
        "2. IELTS SPEAKING RUBRIC: Evaluate on a 1.0 to 9.0 Band Scale across:\n"
        "   - fluency_coherence (Pacing, pauses, hesitation, linking phrases, natural rhythm)\n"
        "   - lexical_resource (Vocabulary variety, idiomatic usage, accurate word choice)\n"
        "   - grammatical_range (Tense consistency, sentence complexity, syntax accuracy)\n"
        "   - pronunciation (Phonetic clarity, word and sentence stress, intonation, comprehensibility)\n\n"
        "Calculate the overall band_score (1.0 - 9.0, rounded to nearest 0.5).\n"
        "Calculate scaled_score_10 = round((band_score / 9.0) * 10, 1) on a 0.0 to 10.0 scale.\n\n"
        "Provide:\n"
        "- 'transcription': Complete verbatim transcript of what the student said.\n"
        "- 'overall_feedback': Encouraging pedagogical examiner remarks summarizing delivery and spoken fluency.\n"
        "- 'strengths': 2 to 4 bullet points of pronunciation and speaking strengths observed.\n"
        "- 'areas_for_improvement': 2 to 4 actionable suggestions to improve pronunciation, pacing, or grammar.\n"
        "- 'detailed_corrections': Spoken mistakes or mispronounced/misused words: "
        "[{\"original\": \"what the student said\", \"correction\": \"better natural English\", \"explanation\": \"phonetic/grammar guidance\"}].\n\n"
        "Return STRICT valid JSON with this exact schema:\n"
        "{\n"
        '  "transcription": "...",\n'
        '  "band_score": 6.5,\n'
        '  "scaled_score_10": 7.2,\n'
        '  "criteria_scores": {\n'
        '    "fluency_coherence": 6.5,\n'
        '    "lexical_resource": 6.5,\n'
        '    "grammatical_range": 6.0,\n'
        '    "pronunciation": 7.0\n'
        "  },\n"
        '  "strengths": ["...", "..."],\n'
        '  "areas_for_improvement": ["...", "..."],\n'
        '  "detailed_corrections": [\n'
        '    {"original": "...", "correction": "...", "explanation": "..."}\n'
        "  ],\n"
        '  "overall_feedback": "..."\n'
        "}"
    )

    headers = {
        "x-goog-api-key": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": clean_mime,
                            "data": audio_b64,
                        }
                    },
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.2,
        },
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(GEMINI_ENDPOINT, headers=headers, json=payload)
        if resp.status_code != 200:
            logger.error("Gemini speaking evaluation failed with HTTP %s: %s", resp.status_code, resp.text[:200])
            raise RuntimeError(f"Gemini API returned status {resp.status_code}")

        data = resp.json()

    candidates = data.get("candidates", [])
    if not candidates:
        raise ValueError("Gemini returned empty candidate response for audio.")

    raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    parsed = clean_llm_json(raw_text)
    if not isinstance(parsed, dict) or "band_score" not in parsed:
        raise ValueError("Failed to obtain structured speaking evaluation JSON from Gemini.")

    return parsed


async def evaluate_submission_background(submission_id: uuid.UUID) -> None:
    """
    Background worker task to evaluate a submission with Gemini AI.
    Handles text (writing) and/or audio (speaking) submissions safely.
    Updates or creates SubmissionAIFeedback idempotently.
    """
    logger.info("Starting AI evaluation background task for submission %s", submission_id)

    async with AsyncSessionLocal() as db:
        try:
            # 1. Fetch submission with assignment
            stmt = (
                select(Submission)
                .options(
                    selectinload(Submission.assignment),
                    selectinload(Submission.ai_feedback),
                )
                .where(Submission.id == submission_id)
            )
            submission = (await db.execute(stmt)).scalars().first()
            if not submission:
                logger.warning("Submission %s not found for AI evaluation.", submission_id)
                return

            assignment = submission.assignment
            if not assignment:
                logger.warning("Assignment not associated with submission %s.", submission_id)
                return

            # Ensure SubmissionAIFeedback row exists with pending status
            feedback_record = submission.ai_feedback
            if not feedback_record:
                feedback_record = SubmissionAIFeedback(
                    submission_id=submission.id,
                    assignment_type="writing",
                    status=AIEvaluationStatus.PENDING.value,
                )
                db.add(feedback_record)
                await db.flush()

            feedback_record.status = AIEvaluationStatus.PENDING.value
            feedback_record.error_message = None
            await db.commit()

            # 2. Determine submission type (Speaking vs Writing)
            is_audio = False
            if submission.file_path:
                mime = (submission.file_content_type or "").lower()
                name = (submission.file_original_name or "").lower()
                if "audio" in mime or re.search(r"\.(mp3|wav|m4a|aac|ogg|webm)$", name):
                    is_audio = True

            has_text = bool(submission.text_answer and len(submission.text_answer.strip()) > 0)

            # Preference: If audio is provided, evaluate as speaking; otherwise as writing
            if is_audio:
                feedback_record.assignment_type = "speaking"
                # Resolve audio file
                file_path = await resolve_submission_file_async(
                    submission.file_path,
                    db=db,
                    fallback_name=submission.file_original_name,
                )
                if not file_path.exists() or file_path.stat().st_size == 0:
                    raise FileNotFoundError(f"Audio file {submission.file_path} could not be resolved from storage.")

                audio_bytes = file_path.read_bytes()
                mime = normalize_audio_mime(submission.file_content_type, submission.file_original_name)

                result = await evaluate_speaking(
                    audio_bytes=audio_bytes,
                    mime_type=mime,
                    assignment_title=assignment.title,
                    assignment_prompt=assignment.description,
                )

                feedback_record.transcription = result.get("transcription")
                feedback_record.band_score = float(result.get("band_score", 0))
                feedback_record.scaled_score_10 = float(result.get("scaled_score_10", 0))
                feedback_record.criteria_scores = result.get("criteria_scores")
                feedback_record.strengths = result.get("strengths")
                feedback_record.areas_for_improvement = result.get("areas_for_improvement")
                feedback_record.detailed_corrections = result.get("detailed_corrections")
                feedback_record.overall_feedback = result.get("overall_feedback")
                feedback_record.ai_raw_response = result
                feedback_record.status = AIEvaluationStatus.COMPLETED.value
                feedback_record.error_message = None

            elif has_text:
                feedback_record.assignment_type = "writing"
                result = await evaluate_writing(
                    submission_text=submission.text_answer.strip(),
                    assignment_title=assignment.title,
                    assignment_prompt=assignment.description,
                )

                feedback_record.band_score = float(result.get("band_score", 0))
                feedback_record.scaled_score_10 = float(result.get("scaled_score_10", 0))
                feedback_record.criteria_scores = result.get("criteria_scores")
                feedback_record.strengths = result.get("strengths")
                feedback_record.areas_for_improvement = result.get("areas_for_improvement")
                feedback_record.detailed_corrections = result.get("detailed_corrections")
                feedback_record.overall_feedback = result.get("overall_feedback")
                feedback_record.transcription = None
                feedback_record.ai_raw_response = result
                feedback_record.status = AIEvaluationStatus.COMPLETED.value
                feedback_record.error_message = None

            else:
                feedback_record.status = AIEvaluationStatus.FAILED.value
                feedback_record.error_message = "Submission does not contain text or an audio recording to evaluate."

            await db.commit()
            logger.info(
                "Completed AI evaluation for submission %s: type=%s, band=%s, status=%s",
                submission_id,
                feedback_record.assignment_type,
                feedback_record.band_score,
                feedback_record.status,
            )

        except Exception as e:
            logger.exception("Error during AI evaluation background task for submission %s: %s", submission_id, e)
            try:
                if feedback_record:
                    feedback_record.status = AIEvaluationStatus.FAILED.value
                    feedback_record.error_message = f"Evaluation error: {str(e)[:300]}"
                    await db.commit()
            except Exception:
                pass
