import pytest
import asyncio
from app.services.ai_speaking_examiner import (
    resolve_audio_mime_type,
    extract_audio_duration_seconds,
    calculate_fluency_status,
    evaluate_speaking_submission,
)
from app.schemas.submission import SubmissionOut


def test_resolve_audio_mime_type():
    assert resolve_audio_mime_type("speech.webm") == "audio/webm"
    assert resolve_audio_mime_type("recording.mp3") == "audio/mp3"
    assert resolve_audio_mime_type("audio.wav") == "audio/wav"
    assert resolve_audio_mime_type("voice.ogg") == "audio/ogg"
    assert resolve_audio_mime_type("task.m4a") == "audio/mp4"
    assert resolve_audio_mime_type("sample.mp4") == "audio/mp4"
    assert resolve_audio_mime_type("unknown.bin", "audio/webm;codecs=opus") == "audio/webm"


def test_calculate_fluency_status():
    assert calculate_fluency_status(0) == "Not Applicable"
    assert calculate_fluency_status(75) == "Slow & Hesitant"
    assert calculate_fluency_status(95) == "Deliberate Pace"
    assert calculate_fluency_status(125) == "Natural & Fluent"
    assert calculate_fluency_status(150) == "Natural & Fluent"
    assert calculate_fluency_status(170) == "Rapid / Fast-Paced"


def test_extract_audio_duration_estimation():
    dummy_webm = b"\x00" * 45000  # ~10s of 4.5KB/s webm
    dur = extract_audio_duration_seconds(dummy_webm, "test.webm", "audio/webm")
    assert dur >= 8.0 and dur <= 12.0


@pytest.mark.anyio
async def test_evaluate_speaking_submission_fallback():
    dummy_audio = b"\x1a\x45\xdf\xa3" + (b"\x00" * 20000)
    res = await evaluate_speaking_submission(
        audio_bytes=dummy_audio,
        filename="student_speech.webm",
        mime_type="audio/webm",
        prompt_topic="Talk about your hometown",
    )
    assert "transcript" in res
    assert "duration_seconds" in res
    assert "suggested_score" in res
    assert "band" in res
    assert "fluency_status" in res
    assert "pronunciation_and_vocab_tips" in res
    assert "grammar_corrections" in res
    assert "summary" in res
    assert res["suggested_score"] >= 0 and res["suggested_score"] <= 100
