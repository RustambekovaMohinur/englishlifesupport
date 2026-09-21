import asyncio
from datetime import datetime
import logging
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

import json
from pathlib import Path

from app.api.deps import get_current_user, require_teacher, require_student
from app.db.session import get_db
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.user import User, UserRole
from app.models.wordlist import WordlistItem, WordlistSet, WordlistQuizAttempt
from app.schemas.wordlist import (
    BulkPreviewRequest,
    PreviewBulkRequest,
    QuizAttemptOut,
    SubmitQuizRequest,
    WordDetailPreview,
    WordlistItemOut,
    WordlistSetBriefOut,
    WordlistSetCreate,
    WordlistSetDetailOut,
)
from app.services.storage import get_storage_service
from app.utils.datetimes import utcnow

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Wordlists"])

POS_MAP = {
    "noun": "n",
    "verb": "v",
    "adjective": "adj",
    "adverb": "adv",
    "pronoun": "pron",
    "preposition": "prep",
    "conjunction": "conj",
    "interjection": "interj",
    "exclamation": "interj",
    "phrase": "phrase",
    "idiom": "phrase",
}


def parse_bilingual_line(line: str) -> tuple[str, str]:
    """
    Parses inputs like:
    'conserve - asramoq, tejamoq'
    'drama = sahna asari'
    'reluctant: istaksiz'
    'reluctant'
    """
    clean = line.strip()
    if not clean:
        return "", ""

    for sep in [" - ", " = ", " : ", "-", "=", ":"]:
        if sep in clean:
            parts = clean.split(sep, 1)
            raw_w = parts[0].strip()
            raw_trans = parts[1].strip()
            if raw_w:
                return raw_w, raw_trans

    return clean, ""


async def fetch_word_details(raw_line: str, client: httpx.AsyncClient | None = None) -> WordDetailPreview:
    """
    Smart bilingual resolver:
    1. Parses 'word - translation' or raw 'word'.
    2. Queries Free Dictionary API with 3.5s timeout for phonetics, US/GB audio, POS, example.
    3. If translation provided by teacher, sets definition = translation (or supplements).
    4. Falls back to Datamuse if definition is absent and no custom translation was provided.
    5. NEVER raises 500.
    """
    word, custom_translation = parse_bilingual_line(raw_line)
    clean_word = word.strip().lower()

    if not clean_word:
        return WordDetailPreview(word=raw_line)

    close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=4.0)
        close_client = True

    part_of_speech = ""
    phonetic = ""
    definition = custom_translation
    example = ""
    audio_us_url = None
    audio_gb_url = None

    try:
        # 1. Free Dictionary API
        try:
            url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{clean_word}"
            resp = await client.get(url, timeout=3.5)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    entry = data[0]
                    phonetic = entry.get("phonetic") or ""

                    for ph in entry.get("phonetics", []):
                        if not phonetic and ph.get("text"):
                            phonetic = ph.get("text")
                        aud = ph.get("audio", "")
                        if aud:
                            if not aud.startswith("http"):
                                aud = f"https:{aud}" if aud.startswith("//") else f"https://{aud}"
                            aud_lower = aud.lower()
                            if ("-us." in aud_lower or "/us/" in aud_lower or "-us-" in aud_lower) and not audio_us_url:
                                audio_us_url = aud
                            elif ("-uk." in aud_lower or "-gb." in aud_lower or "/uk/" in aud_lower or "/gb/" in aud_lower) and not audio_gb_url:
                                audio_gb_url = aud
                            elif not audio_us_url and not audio_gb_url:
                                audio_us_url = aud

                    meanings = entry.get("meanings", [])
                    if meanings:
                        raw_pos = (meanings[0].get("partOfSpeech") or "").lower()
                        part_of_speech = POS_MAP.get(raw_pos, raw_pos)

                        for m in meanings:
                            defs = m.get("definitions", [])
                            for d in defs:
                                if not definition and d.get("definition"):
                                    definition = d.get("definition")
                                    if not part_of_speech:
                                        m_pos = (m.get("partOfSpeech") or "").lower()
                                        part_of_speech = POS_MAP.get(m_pos, m_pos)
                                if not example and d.get("example"):
                                    example = d.get("example")
                                if definition and example:
                                    break
                            if definition and example:
                                break
        except Exception as e:
            logger.info("Free Dictionary API lookup failed for '%s': %s", clean_word, e)

        # 2. Datamuse fallback if definition is still empty
        if not definition:
            try:
                dm_url = f"https://api.datamuse.com/words?sp={clean_word}&md=dr&max=1"
                resp = await client.get(dm_url, timeout=3.0)
                if resp.status_code == 200:
                    dm_data = resp.json()
                    if isinstance(dm_data, list) and len(dm_data) > 0:
                        dm_item = dm_data[0]
                        defs = dm_item.get("defs", [])
                        if defs:
                            first_def = defs[0]
                            if "\t" in first_def:
                                d_pos, d_text = first_def.split("\t", 1)
                                if not part_of_speech:
                                    part_of_speech = POS_MAP.get(d_pos.strip().lower(), d_pos.strip().lower())
                                definition = d_text.strip()
                            else:
                                definition = first_def.strip()
            except Exception as e:
                logger.info("Datamuse fallback lookup failed for '%s': %s", clean_word, e)

    except Exception as exc:
        logger.warning("Error resolving word '%s': %s", clean_word, exc)
    finally:
        if close_client:
            await client.aclose()

    return WordDetailPreview(
        word=clean_word or word.strip(),
        custom_translation=custom_translation,
        part_of_speech=part_of_speech or "n",
        phonetic=phonetic,
        definition=definition or custom_translation or "",
        example=example,
        audio_us_url=audio_us_url,
        audio_gb_url=audio_gb_url,
    )


@router.post("/preview-bulk", response_model=list[WordDetailPreview])
@router.post("/preview-bulk/", response_model=list[WordDetailPreview])
async def preview_bulk(
    payload: dict | BulkPreviewRequest | None = None,
):
    """
    Takes up to 50 words (or 'word - translation' lines), concurrently resolves
    dictionary details, and returns structured preview list for teacher editing.
    """
    if payload is None:
        raw_words = []
    elif isinstance(payload, dict):
        raw_words = payload.get("words", [])
    elif hasattr(payload, "words"):
        raw_words = payload.words
    elif isinstance(payload, list):
        raw_words = payload
    else:
        raw_words = []

    raw_lines = [str(w).strip() for w in raw_words if str(w).strip()]
    seen = set()
    lines = []
    for l in raw_lines:
        w_key = parse_bilingual_line(l)[0].lower()
        if w_key and w_key not in seen:
            seen.add(w_key)
            lines.append(l)

    lines = lines[:50]
    if not lines:
        return []

    async with httpx.AsyncClient(timeout=4.0) as client:
        tasks = [fetch_word_details(l, client=client) for l in lines]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    previews: list[WordDetailPreview] = []
    for l, res in zip(lines, results):
        if isinstance(res, WordDetailPreview):
            previews.append(res)
        else:
            w, t = parse_bilingual_line(l)
            previews.append(WordDetailPreview(word=w, definition=t, custom_translation=t))

    return previews


@router.post("/preview-bulk-slash", response_model=list[WordDetailPreview], include_in_schema=False)
async def preview_bulk_slash(payload: dict | BulkPreviewRequest | None = None):
    return await preview_bulk(payload)


@router.post("", response_model=WordlistSetDetailOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=WordlistSetDetailOut, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_wordlist_set(
    data: WordlistSetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a new WordlistSet and offloads vocabulary payload to Backblaze B2 (JSON).
    Zero database bloat: inserts ONLY 1 row into wordlist_sets and zero rows into wordlist_items.
    """
    if current_user.role != UserRole.TEACHER and not getattr(current_user, "is_superuser", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only teachers can create wordlists")

    set_id = uuid.uuid4()
    now_dt = utcnow()
    now_iso = now_dt.isoformat()
    group_slug = str(data.group_id) if data.group_id else "global"
    b2_key = f"wordlists/{group_slug}/{set_id}.json"

    formatted_items = []
    for idx, item_data in enumerate(data.items):
        item_id = str(uuid.uuid4())
        formatted_items.append({
            "id": item_id,
            "set_id": str(set_id),
            "word": item_data.word.strip(),
            "part_of_speech": item_data.part_of_speech.strip() if item_data.part_of_speech else None,
            "phonetic": item_data.phonetic.strip() if item_data.phonetic else None,
            "definition": item_data.definition.strip() if item_data.definition else None,
            "example": item_data.example.strip() if item_data.example else None,
            "audio_us_url": item_data.audio_us_url.strip() if item_data.audio_us_url else None,
            "audio_gb_url": item_data.audio_gb_url.strip() if item_data.audio_gb_url else None,
            "order_index": item_data.order_index if item_data.order_index is not None else idx,
            "created_at": now_iso,
        })

    payload_bytes = json.dumps(formatted_items, ensure_ascii=False, indent=2).encode("utf-8")

    # Persist local fallback file
    local_dir = Path("uploads") / "wordlists" / group_slug
    try:
        local_dir.mkdir(parents=True, exist_ok=True)
        local_file = local_dir / f"{set_id}.json"
        local_file.write_bytes(payload_bytes)
    except Exception as e:
        logger.warning("Could not write local wordlist JSON: %s", e)

    # Offload to Backblaze B2 (if configured)
    storage = get_storage_service()
    if storage.is_configured:
        try:
            await storage.upload_file(b2_key, payload_bytes, content_type="application/json")
        except Exception as e:
            logger.warning("B2 upload failed for key '%s': %s. Relying on local fallback.", b2_key, e)

    # Insert single row into wordlist_sets with zero items table bloat
    new_set = WordlistSet(
        id=set_id,
        title=data.title.strip(),
        group_id=data.group_id,
        created_by=current_user.id,
        created_at=now_dt,
        b2_file_url=b2_key,
        total_words=len(formatted_items),
    )
    db.add(new_set)
    await db.commit()

    group_name = "All Cohorts (Global)"
    if new_set.group_id:
        grp_res = await db.execute(select(Group.name).where(Group.id == new_set.group_id))
        grp_val = grp_res.scalar_one_or_none()
        if grp_val:
            group_name = grp_val

    items_out = [
        WordlistItemOut(
            id=uuid.UUID(it["id"]),
            set_id=uuid.UUID(it["set_id"]),
            word=it["word"],
            part_of_speech=it.get("part_of_speech"),
            phonetic=it.get("phonetic"),
            definition=it.get("definition"),
            example=it.get("example"),
            audio_us_url=it.get("audio_us_url"),
            audio_gb_url=it.get("audio_gb_url"),
            order_index=it.get("order_index", 0),
            created_at=now_dt,
        )
        for it in formatted_items
    ]

    return WordlistSetDetailOut(
        id=new_set.id,
        title=new_set.title,
        group_id=new_set.group_id,
        group_name=group_name,
        created_by=new_set.created_by,
        created_at=new_set.created_at,
        b2_file_url=new_set.b2_file_url,
        total_words=new_set.total_words,
        items=items_out,
        recent_attempts=[],
        student_is_mastered=False,
        student_best_score=None,
    )


@router.get("", response_model=list[WordlistSetBriefOut])
@router.get("/", response_model=list[WordlistSetBriefOut], include_in_schema=False)
async def list_wordlist_sets(
    group_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists sets with word counts and mastery stats.
    Uses func.coalesce(func.nullif(WordlistSet.total_words, 0), func.count(WordlistItem.id))
    for zero DB bloat compatibility with Backblaze B2 offloading.
    """
    st_profile = None
    if current_user.role == UserRole.STUDENT:
        st_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
        st_profile = st_res.scalar_one_or_none()

    query = (
        select(
            WordlistSet,
            Group.name.label("group_name"),
            func.coalesce(
                func.nullif(WordlistSet.total_words, 0),
                func.count(WordlistItem.id),
            ).label("word_count"),
        )
        .outerjoin(Group, WordlistSet.group_id == Group.id)
        .outerjoin(WordlistItem, WordlistSet.id == WordlistItem.set_id)
        .group_by(WordlistSet.id, Group.name)
        .order_by(WordlistSet.created_at.desc())
    )

    if current_user.role == UserRole.STUDENT:
        st_group_id = st_profile.group_id if st_profile else None
        if st_group_id:
            query = query.where(
                (WordlistSet.group_id == st_group_id) | (WordlistSet.group_id.is_(None))
            )
        else:
            query = query.where(WordlistSet.group_id.is_(None))
    elif group_id:
        query = query.where(WordlistSet.group_id == group_id)

    res = await db.execute(query)
    rows = res.all()

    # If student, fetch their best score and mastery status per set
    student_stats_map = {}
    if st_profile:
        att_res = await db.execute(
            select(
                WordlistQuizAttempt.set_id,
                func.max(WordlistQuizAttempt.score_percentage).label("best_score"),
                func.min(WordlistQuizAttempt.time_spent_seconds).label("best_time"),
                func.count(WordlistQuizAttempt.id).label("attempts_cnt"),
                func.bool_or(WordlistQuizAttempt.is_mastered).label("mastered"),
            )
            .where(WordlistQuizAttempt.student_id == st_profile.id)
            .group_by(WordlistQuizAttempt.set_id)
        )
        for r in att_res.all():
            student_stats_map[r[0]] = {
                "best_score": r[1],
                "best_time": r[2],
                "attempts_cnt": r[3],
                "mastered": bool(r[4]),
            }

    output: list[WordlistSetBriefOut] = []
    for w_set, g_name, w_count in rows:
        st_data = student_stats_map.get(w_set.id, {})
        calculated_count = int(w_count or w_set.total_words or 0)
        output.append(
            WordlistSetBriefOut(
                id=w_set.id,
                title=w_set.title,
                group_id=w_set.group_id,
                group_name=g_name or ("All Cohorts (Global)" if not w_set.group_id else "Unassigned"),
                created_by=w_set.created_by,
                created_at=w_set.created_at,
                word_count=calculated_count,
                b2_file_url=w_set.b2_file_url,
                total_words=calculated_count,
                is_mastered=st_data.get("mastered", False),
                best_score=st_data.get("best_score"),
                best_time_seconds=st_data.get("best_time"),
                attempts_count=st_data.get("attempts_cnt", 0),
            )
        )

    return output


@router.get("/{set_id}", response_model=WordlistSetDetailOut)
@router.get("/{set_id}/", response_model=WordlistSetDetailOut, include_in_schema=False)
async def get_wordlist_set(
    set_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get full wordlist set with items and recent student / teacher attempt telemetry.
    Loads items payload from Backblaze B2 JSON (with local file fallback, then legacy DB items fallback).
    """
    res = await db.execute(
        select(WordlistSet)
        .options(selectinload(WordlistSet.items), selectinload(WordlistSet.group))
        .where(WordlistSet.id == set_id)
    )
    w_set = res.scalar_one_or_none()
    if not w_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wordlist set not found")

    items_out: list[WordlistItemOut] = []
    raw_bytes: bytes | None = None

    # 1. Try Backblaze B2 download
    if w_set.b2_file_url:
        storage = get_storage_service()
        if storage.is_configured:
            try:
                raw_bytes, _ = await storage.download_file(w_set.b2_file_url)
            except Exception as e:
                logger.warning("B2 download failed for %s: %s", w_set.b2_file_url, e)

    # 2. Try local file fallback
    if raw_bytes is None:
        group_slug = str(w_set.group_id) if w_set.group_id else "global"
        local_file = Path("uploads") / "wordlists" / group_slug / f"{w_set.id}.json"
        if local_file.exists():
            try:
                raw_bytes = local_file.read_bytes()
            except Exception as e:
                logger.warning("Failed reading local wordlist json: %s", e)

    # 3. Parse JSON items if loaded
    if raw_bytes:
        try:
            raw_items = json.loads(raw_bytes.decode("utf-8"))
            for it in raw_items:
                c_at = w_set.created_at
                if it.get("created_at"):
                    try:
                        c_at = datetime.fromisoformat(it["created_at"])
                    except Exception:
                        c_at = w_set.created_at

                items_out.append(
                    WordlistItemOut(
                        id=uuid.UUID(it["id"]) if it.get("id") else uuid.uuid4(),
                        set_id=w_set.id,
                        word=it.get("word", ""),
                        part_of_speech=it.get("part_of_speech"),
                        phonetic=it.get("phonetic"),
                        definition=it.get("definition"),
                        example=it.get("example"),
                        audio_us_url=it.get("audio_us_url"),
                        audio_gb_url=it.get("audio_gb_url"),
                        order_index=it.get("order_index", 0),
                        created_at=c_at,
                    )
                )
        except Exception as e:
            logger.warning("Failed parsing wordlist JSON for set %s: %s", w_set.id, e)

    # 4. Fallback to legacy database items if no items loaded from JSON
    if not items_out and w_set.items:
        items_out = [
            WordlistItemOut(
                id=item.id,
                set_id=item.set_id,
                word=item.word,
                part_of_speech=item.part_of_speech,
                phonetic=item.phonetic,
                definition=item.definition,
                example=item.example,
                audio_us_url=item.audio_us_url,
                audio_gb_url=item.audio_gb_url,
                order_index=item.order_index,
                created_at=item.created_at,
            )
            for item in w_set.items
        ]

    st_profile = None
    if current_user.role == UserRole.STUDENT:
        st_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
        st_profile = st_res.scalar_one_or_none()

    # Fetch attempts
    att_query = (
        select(WordlistQuizAttempt)
        .options(selectinload(WordlistQuizAttempt.student))
        .where(WordlistQuizAttempt.set_id == set_id)
        .order_by(WordlistQuizAttempt.created_at.desc())
    )
    if st_profile:
        att_query = att_query.where(WordlistQuizAttempt.student_id == st_profile.id)

    att_res = await db.execute(att_query.limit(20))
    attempts = att_res.scalars().all()

    student_is_mastered = any(a.is_mastered for a in attempts)
    student_best_score = max((a.score_percentage for a in attempts), default=None)

    attempts_out = [
        QuizAttemptOut(
            id=a.id,
            student_id=a.student_id,
            student_name=a.student.full_name if a.student else "Student",
            mode=a.mode,
            total_questions=a.total_questions,
            correct_answers=a.correct_answers,
            score_percentage=a.score_percentage,
            time_spent_seconds=a.time_spent_seconds,
            is_mastered=a.is_mastered,
            terminated_early=a.terminated_early,
            anti_cheat_triggered=a.anti_cheat_triggered,
            created_at=a.created_at,
        )
        for a in attempts
    ]

    return WordlistSetDetailOut(
        id=w_set.id,
        title=w_set.title,
        group_id=w_set.group_id,
        group_name=w_set.group.name if w_set.group else "All Cohorts (Global)",
        created_by=w_set.created_by,
        created_at=w_set.created_at,
        b2_file_url=w_set.b2_file_url,
        total_words=len(items_out) if items_out else (w_set.total_words or 0),
        items=items_out,
        recent_attempts=attempts_out,
        student_is_mastered=student_is_mastered,
        student_best_score=student_best_score,
    )


@router.post("/{set_id}/submit-quiz", response_model=QuizAttemptOut)
@router.post("/{set_id}/submit-quiz/", response_model=QuizAttemptOut, include_in_schema=False)
async def submit_quiz(
    set_id: uuid.UUID,
    data: SubmitQuizRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Records a completed or terminated quiz attempt with anti-cheat telemetry.
    Computes mastery score: round((correct / total) * 100).
    Award 100% mastery if score is 100%.
    """
    st_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
    st_profile = st_res.scalar_one_or_none()
    if not st_profile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only students can submit quiz telemetry")

    total_q = max(1, data.total_questions)
    correct_q = min(total_q, max(0, data.correct_answers))
    score_pct = int(round((correct_q / total_q) * 100))
    is_mastered = score_pct == 100 and not data.terminated_early and not data.anti_cheat_triggered

    attempt = WordlistQuizAttempt(
        set_id=set_id,
        student_id=st_profile.id,
        mode=data.mode,
        total_questions=total_q,
        correct_answers=correct_q,
        score_percentage=score_pct,
        time_spent_seconds=data.time_spent_seconds,
        is_mastered=is_mastered,
        terminated_early=data.terminated_early,
        anti_cheat_triggered=data.anti_cheat_triggered,
    )
    db.add(attempt)
    await db.commit()

    return QuizAttemptOut(
        id=attempt.id,
        student_id=attempt.student_id,
        student_name=st_profile.full_name,
        mode=attempt.mode,
        total_questions=attempt.total_questions,
        correct_answers=attempt.correct_answers,
        score_percentage=attempt.score_percentage,
        time_spent_seconds=attempt.time_spent_seconds,
        is_mastered=attempt.is_mastered,
        terminated_early=attempt.terminated_early,
        anti_cheat_triggered=attempt.anti_cheat_triggered,
        created_at=attempt.created_at,
    )


@router.delete("/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/{set_id}/", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
async def delete_wordlist_set(
    set_id: uuid.UUID,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Hard delete a wordlist set and cleans up Backblaze B2 object and local file.
    """
    res = await db.execute(select(WordlistSet).where(WordlistSet.id == set_id))
    w_set = res.scalar_one_or_none()
    if not w_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wordlist set not found")

    # Clean up B2 file if present
    if w_set.b2_file_url:
        try:
            storage = get_storage_service()
            if storage.is_configured:
                await storage.delete_file(w_set.b2_file_url)
        except Exception as e:
            logger.warning("Failed to delete B2 object %s: %s", w_set.b2_file_url, e)

    # Clean up local file fallback if present
    group_slug = str(w_set.group_id) if w_set.group_id else "global"
    local_file = Path("uploads") / "wordlists" / group_slug / f"{w_set.id}.json"
    if local_file.exists():
        try:
            local_file.unlink()
        except Exception as e:
            logger.warning("Failed to delete local wordlist json %s: %s", local_file, e)

    await db.delete(w_set)
    await db.commit()
    return None


# Route function aliases
list_wordlists = list_wordlist_sets
create_wordlist = create_wordlist_set
