import asyncio
import logging
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_teacher
from app.db.session import get_db
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.user import User, UserRole
from app.models.wordlist import WordlistItem, WordlistSet
from app.schemas.wordlist import (
    PreviewBulkRequest,
    WordDetailPreview,
    WordlistSetBriefOut,
    WordlistSetCreate,
    WordlistSetDetailOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/wordlists", tags=["wordlists"])


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
}


async def fetch_word_details(word: str, client: httpx.AsyncClient | None = None) -> WordDetailPreview:
    """
    Defensive dictionary resolution:
    1. Tries Free Dictionary API (https://api.dictionaryapi.dev/api/v2/entries/en/{word}) with 4.0s timeout.
    2. Fallback to Datamuse API (https://api.datamuse.com/words?sp={word}&md=dr) if DictionaryAPI fails/times out.
    3. Always returns safe WordDetailPreview and NEVER raises 500.
    """
    clean_word = word.strip().lower()
    if not clean_word:
        return WordDetailPreview(word=word)

    close_client = False
    if client is None:
        client = httpx.AsyncClient(timeout=4.0)
        close_client = True

    part_of_speech = ""
    phonetic = ""
    definition = ""
    example = ""
    audio_us_url = None
    audio_gb_url = None

    try:
        # 1. Primary: Free Dictionary API
        try:
            url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{clean_word}"
            resp = await client.get(url, timeout=3.5)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    entry = data[0]
                    phonetic = entry.get("phonetic") or ""

                    # Phonetics / Audio
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

                    # Meanings / Definitions
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

        # 2. Fallback: Datamuse API if definition is still missing
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
                            # Format: 'n\tdefinition text'
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
        logger.warning("Error fetching word details for '%s': %s", clean_word, exc)
    finally:
        if close_client:
            await client.aclose()

    return WordDetailPreview(
        word=clean_word or word.strip(),
        part_of_speech=part_of_speech,
        phonetic=phonetic,
        definition=definition,
        example=example,
        audio_us_url=audio_us_url,
        audio_gb_url=audio_gb_url,
    )


@router.post("/preview-bulk", response_model=list[WordDetailPreview])
async def preview_bulk_words(
    req: PreviewBulkRequest,
    current_user: User = Depends(require_teacher),
):
    """
    Takes up to 50 words, concurrently fetches dictionary details,
    and returns a structured list for teacher editing.
    """
    raw_words = [w.strip() for w in req.words if w.strip()]
    # Deduplicate while preserving order
    seen = set()
    words = []
    for w in raw_words:
        w_lower = w.lower()
        if w_lower not in seen:
            seen.add(w_lower)
            words.append(w)

    words = words[:50]
    if not words:
        return []

    async with httpx.AsyncClient(timeout=4.0) as client:
        tasks = [fetch_word_details(w, client=client) for w in words]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    previews: list[WordDetailPreview] = []
    for w, res in zip(words, results):
        if isinstance(res, WordDetailPreview):
            previews.append(res)
        else:
            previews.append(WordDetailPreview(word=w))

    return previews


@router.post("", response_model=WordlistSetDetailOut, status_code=status.HTTP_201_CREATED)
async def create_wordlist_set(
    data: WordlistSetCreate,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a new WordlistSet and its associated WordlistItem records.
    """
    new_set = WordlistSet(
        title=data.title.strip(),
        group_id=data.group_id,
        created_by=current_user.id,
    )
    db.add(new_set)
    await db.flush()

    for idx, item_data in enumerate(data.items):
        item = WordlistItem(
            set_id=new_set.id,
            word=item_data.word.strip(),
            part_of_speech=item_data.part_of_speech.strip() if item_data.part_of_speech else None,
            phonetic=item_data.phonetic.strip() if item_data.phonetic else None,
            definition=item_data.definition.strip() if item_data.definition else None,
            example=item_data.example.strip() if item_data.example else None,
            audio_us_url=item_data.audio_us_url.strip() if item_data.audio_us_url else None,
            audio_gb_url=item_data.audio_gb_url.strip() if item_data.audio_gb_url else None,
            order_index=item_data.order_index if item_data.order_index is not None else idx,
        )
        db.add(item)

    await db.commit()

    # Reload with relations
    res = await db.execute(
        select(WordlistSet)
        .options(selectinload(WordlistSet.items), selectinload(WordlistSet.group))
        .where(WordlistSet.id == new_set.id)
    )
    loaded_set = res.scalar_one()

    return WordlistSetDetailOut(
        id=loaded_set.id,
        title=loaded_set.title,
        group_id=loaded_set.group_id,
        group_name=loaded_set.group.name if loaded_set.group else "All Cohorts (Global)",
        created_by=loaded_set.created_by,
        created_at=loaded_set.created_at,
        items=loaded_set.items,
    )


@router.get("", response_model=list[WordlistSetBriefOut])
async def list_wordlist_sets(
    group_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List wordlist sets.
    - If user is student: returns sets belonging to their cohort OR global sets (group_id is None).
    - If user is teacher: returns all sets or filtered by group_id if provided.
    """
    query = (
        select(
            WordlistSet,
            Group.name.label("group_name"),
            func.count(WordlistItem.id).label("word_count"),
        )
        .outerjoin(Group, WordlistSet.group_id == Group.id)
        .outerjoin(WordlistItem, WordlistSet.id == WordlistItem.set_id)
        .group_by(WordlistSet.id, Group.name)
        .order_by(WordlistSet.created_at.desc())
    )

    if current_user.role == UserRole.STUDENT:
        # Find student's cohort
        st_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
        st_profile = st_res.scalar_one_or_none()
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

    output: list[WordlistSetBriefOut] = []
    for w_set, g_name, w_count in rows:
        output.append(
            WordlistSetBriefOut(
                id=w_set.id,
                title=w_set.title,
                group_id=w_set.group_id,
                group_name=g_name or ("All Cohorts (Global)" if not w_set.group_id else "Unassigned"),
                created_by=w_set.created_by,
                created_at=w_set.created_at,
                word_count=w_count or 0,
            )
        )

    return output


@router.get("/{set_id}", response_model=WordlistSetDetailOut)
async def get_wordlist_set(
    set_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get full wordlist set with items.
    """
    res = await db.execute(
        select(WordlistSet)
        .options(selectinload(WordlistSet.items), selectinload(WordlistSet.group))
        .where(WordlistSet.id == set_id)
    )
    w_set = res.scalar_one_or_none()
    if not w_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wordlist set not found")

    return WordlistSetDetailOut(
        id=w_set.id,
        title=w_set.title,
        group_id=w_set.group_id,
        group_name=w_set.group.name if w_set.group else "All Cohorts (Global)",
        created_by=w_set.created_by,
        created_at=w_set.created_at,
        items=w_set.items,
    )


@router.delete("/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wordlist_set(
    set_id: uuid.UUID,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Hard delete a wordlist set and all associated items.
    """
    res = await db.execute(select(WordlistSet).where(WordlistSet.id == set_id))
    w_set = res.scalar_one_or_none()
    if not w_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wordlist set not found")

    await db.delete(w_set)
    await db.commit()
    return None
