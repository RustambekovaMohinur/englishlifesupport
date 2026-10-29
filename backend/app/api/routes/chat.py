import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.chat import AIChatMessage, PrivateMessage
from app.models.student import StudentProfile
from app.models.user import User, UserRole
from app.schemas.chat import (
    AIChatMessageOut,
    AIChatSend,
    PeerChatContactOut,
    PrivateMessageOut,
    PrivateMessageSend,
)
from app.services.ai_examiner import execute_gemini_generate_content

logger = logging.getLogger("app.api.routes.chat")

router = APIRouter(prefix="/chat", tags=["chat"])

AI_COMPANION_SYSTEM_PROMPT = """You are Aura, the English Life LMS AI Learning Coach & Companion.
Your mission is to help English learners practice conversational English, refine grammar, expand vocabulary, and prepare for exams (such as IELTS or CEFR).

STRICT PEDAGOGICAL POLICY & GUARDRAILS (ABSOLUTE REQUIREMENT):
1. NEVER WRITE COMPLETE HOMEWORK ANSWERS OR ESSAYS:
   - If a student asks you to "write an essay about...", "solve this test question", "do my homework", or "give me the answers to...", you must politely and clearly REFUSE to do the work for them.
   - Say something encouraging like: "As your English Life learning coach, I can't write your essay or solve your exercises directly, but I'd love to help you master it yourself! Let's break it down together."
2. COACHING INSTEAD OF SOLVING:
   - Provide essay structure outlines, brainstorming bullet points, topic vocabulary, or sentence-starter ideas.
   - Ask guiding questions so the student formulates their own arguments.
3. CONSTRUCTIVE ERROR CORRECTION:
   - If the student writes sentences or paragraphs in English, analyze them constructively:
     a) Point out any grammatical, spelling, or collocation errors.
     b) Explain the grammar rule briefly and clearly.
     c) Offer 1-2 natural, more native phrasing alternatives.
4. TONE & STYLE:
   - Friendly, encouraging, educational, and concise. Use clear formatting with bullet points when helpful.
"""


async def _get_student_profile(db: AsyncSession, user: User) -> StudentProfile | None:
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.user))
        .where(StudentProfile.user_id == user.id)
    )
    return result.scalar_one_or_none()


# ─── 1-on-1 Private Messaging ────────────────────────────────────────────────

@router.get("/contacts", response_model=list[PeerChatContactOut], summary="List peer chat contacts")
async def list_chat_contacts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_student_profile(db, current_user)
    if not profile:
        raise HTTPException(status_code=403, detail="Student profile required.")

    # Find peers who have can_private_chat or are in the same cohort
    peers_query = (
        select(StudentProfile)
        .options(selectinload(StudentProfile.user))
        .where(
            StudentProfile.id != profile.id,
            or_(
                StudentProfile.can_private_chat.is_(True),
                StudentProfile.group_id == profile.group_id,
            ),
        )
        .limit(30)
    )
    peers = (await db.execute(peers_query)).scalars().all()

    contacts = []
    for peer in peers:
        # Check last message
        last_msg = (
            await db.execute(
                select(PrivateMessage)
                .where(
                    or_(
                        (PrivateMessage.sender_id == profile.id) & (PrivateMessage.recipient_id == peer.id),
                        (PrivateMessage.sender_id == peer.id) & (PrivateMessage.recipient_id == profile.id),
                    )
                )
                .order_by(PrivateMessage.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        contacts.append(
            PeerChatContactOut(
                student_id=peer.id,
                full_name=peer.full_name,
                username=peer.user.username if peer.user else None,
                avatar_url=peer.user.avatar_url if peer.user else None,
                custom_badge=getattr(peer, "custom_badge", None),
                premium_plan=getattr(peer, "premium_plan", "free"),
                last_message=last_msg.content if last_msg else None,
                last_message_at=last_msg.created_at if last_msg else None,
            )
        )
    return contacts


@router.get("/messages/{peer_id}", response_model=list[PrivateMessageOut], summary="Get messages with a peer")
async def get_peer_messages(
    peer_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_student_profile(db, current_user)
    if not profile:
        raise HTTPException(status_code=403, detail="Student profile required.")

    # Permissions check
    if not (profile.can_private_chat or profile.is_premium or current_user.role == UserRole.TEACHER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Private messaging requires Standard (19k) or Pro VIP (29k) plan.",
        )

    # Fetch messages between current student and peer
    query = (
        select(PrivateMessage)
        .options(selectinload(PrivateMessage.sender).selectinload(StudentProfile.user))
        .where(
            or_(
                (PrivateMessage.sender_id == profile.id) & (PrivateMessage.recipient_id == peer_id),
                (PrivateMessage.sender_id == peer_id) & (PrivateMessage.recipient_id == profile.id),
            )
        )
        .order_by(PrivateMessage.created_at.asc())
        .limit(limit)
    )
    messages = (await db.execute(query)).scalars().all()

    # Mark incoming as read
    for m in messages:
        if m.recipient_id == profile.id and not m.is_read:
            m.is_read = True
    await db.commit()

    return [
        PrivateMessageOut(
            id=m.id,
            sender_id=m.sender_id,
            recipient_id=m.recipient_id,
            content=m.content,
            is_read=m.is_read,
            created_at=m.created_at,
            sender_name=m.sender.full_name,
            sender_avatar=m.sender.user.avatar_url if m.sender.user else None,
            sender_badge=getattr(m.sender, "custom_badge", None),
            is_me=(m.sender_id == profile.id),
        )
        for m in messages
    ]


@router.post("/messages", response_model=PrivateMessageOut, status_code=status.HTTP_201_CREATED, summary="Send private message")
async def send_private_message(
    body: PrivateMessageSend,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_student_profile(db, current_user)
    if not profile:
        raise HTTPException(status_code=403, detail="Student profile required.")

    # Permissions check: sender must be premium or teacher
    if not (profile.can_private_chat or profile.is_premium or current_user.role == UserRole.TEACHER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Private messaging requires Standard or Pro VIP plan.",
        )

    # Check recipient exists
    recipient = (
        await db.execute(select(StudentProfile).where(StudentProfile.id == body.recipient_id))
    ).scalar_one_or_none()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient student not found.")

    msg = PrivateMessage(
        id=uuid.uuid4(),
        sender_id=profile.id,
        recipient_id=body.recipient_id,
        content=body.content.strip(),
        is_read=False,
    )
    db.add(msg)
    await db.commit()

    return PrivateMessageOut(
        id=msg.id,
        sender_id=profile.id,
        recipient_id=body.recipient_id,
        content=msg.content,
        is_read=False,
        created_at=msg.created_at,
        sender_name=profile.full_name,
        sender_avatar=profile.user.avatar_url if profile.user else None,
        sender_badge=getattr(profile, "custom_badge", None),
        is_me=True,
    )


# ─── AI Companion Chat ────────────────────────────────────────────────────────

@router.get("/ai/history", response_model=list[AIChatMessageOut], summary="Get AI Companion chat history")
async def get_ai_chat_history(
    limit: int = Query(30, ge=1, le=60),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_student_profile(db, current_user)
    if not profile:
        raise HTTPException(status_code=403, detail="Student profile required.")

    query = (
        select(AIChatMessage)
        .where(AIChatMessage.student_id == profile.id)
        .order_by(AIChatMessage.created_at.asc())
        .limit(limit)
    )
    rows = (await db.execute(query)).scalars().all()
    return [
        AIChatMessageOut(
            id=r.id,
            role=r.role,
            content=r.content,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/ai", response_model=AIChatMessageOut, summary="Chat with AI Learning Companion (Safe)")
async def chat_with_ai(
    body: AIChatSend,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_student_profile(db, current_user)
    if not profile:
        raise HTTPException(status_code=403, detail="Student profile required.")

    # Permissions check: Premium users (Standard / Pro VIP) or Teacher
    is_teacher = current_user.role == UserRole.TEACHER
    can_ai = is_teacher or profile.is_premium or profile.can_private_chat
    if not can_ai:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="AI Companion requires Standard (19k) or Pro VIP (29k) plan.",
        )

    user_text = body.message.strip()

    # Save user message
    user_msg = AIChatMessage(
        id=uuid.uuid4(),
        student_id=profile.id,
        role="user",
        content=user_text,
    )
    db.add(user_msg)
    await db.commit()

    # Fetch last 6 messages for context
    history_rows = (
        await db.execute(
            select(AIChatMessage)
            .where(AIChatMessage.student_id == profile.id)
            .order_by(AIChatMessage.created_at.desc())
            .limit(6)
        )
    ).scalars().all()
    history_rows.reverse()

    contents = []
    for h in history_rows:
        g_role = "user" if h.role == "user" else "model"
        contents.append({"role": g_role, "parts": [{"text": h.content}]})

    gemini_payload = {
        "system_instruction": {
            "parts": [{"text": AI_COMPANION_SYSTEM_PROMPT}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 800,
        },
    }

    resp, err = await execute_gemini_generate_content(payload=gemini_payload, timeout=25.0)

    reply_text = ""
    if resp and resp.status_code == 200:
        try:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                reply_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        except Exception as e:
            logger.error("Failed to parse Gemini response: %s", e)

    if not reply_text:
        # Graceful fallback response following the same pedagogical principle
        reply_text = (
            "I'm here to help you practice and improve your English! "
            "Tell me what topic you'd like to practice, or share a sentence you wrote so we can check the grammar together."
        )

    # Save assistant message
    ai_msg = AIChatMessage(
        id=uuid.uuid4(),
        student_id=profile.id,
        role="assistant",
        content=reply_text.strip(),
    )
    db.add(ai_msg)
    await db.commit()

    return AIChatMessageOut(
        id=ai_msg.id,
        role="assistant",
        content=ai_msg.content,
        created_at=ai_msg.created_at,
    )
