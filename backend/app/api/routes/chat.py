import json
import logging
import re
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

AI_COMPANION_SYSTEM_PROMPT = """You are Aura, a friendly native English tutor in a casual chat app. You talk like a real person — warm, natural, and encouraging.

RESPONSE STYLE (CRITICAL — follow this every time):
1. ANSWER FIRST, ALWAYS:
   - Respond directly to what the student said or asked, like a real conversation. No formal headers. No "Coaching Feedback for:" labels. No word-count statistics.
   - React naturally: if they say something interesting, show genuine curiosity. If they make a point, engage with it first.
2. GRAMMAR CORRECTIONS — GENTLE & AT THE END ONLY:
   - Only correct major grammar mistakes (ones that seriously affect meaning or naturalness). Minor errors: let them pass.
   - If you do correct, do it briefly and casually at the end — e.g., "By the way, a more natural way to say that is: '...' 😊" — never as the opening or main focus.
   - Never say "You used X words" or count anything. Never output word statistics.
3. HOMEWORK & ESSAY REQUESTS:
   - Warmly decline to write complete essays or solve exercises directly. Offer to help them build their own answer step by step — brainstorm together, give an outline, ask guiding questions.
4. TONE:
   - Casual, warm, real. Short sentences. Natural English. Use light emoji sparingly (not every sentence). No bullet-point walls for simple conversational messages. Keep replies concise — 3-5 sentences for casual chat, more detail only when explaining grammar or vocabulary on request.
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

    # Find peers who have an active paid plan (Standard / Pro VIP)
    peers_query = (
        select(StudentProfile)
        .options(selectinload(StudentProfile.user))
        .where(
            StudentProfile.id != profile.id,
            or_(
                StudentProfile.premium_plan.in_(["standard", "pro_vip"]),
                StudentProfile.is_premium.is_(True),
            ),
            StudentProfile.premium_plan != "free",
        )
        .limit(50)
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
                username=peer.user.username if getattr(peer, "user", None) else None,
                avatar_url=getattr(peer, "avatar_url", None)
                or (getattr(peer.user, "avatar_url", None) if getattr(peer, "user", None) else None)
                or "default_avatar_url",
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
            sender_avatar=getattr(m.sender, "avatar_url", None)
            or (getattr(m.sender.user, "avatar_url", None) if getattr(m.sender, "user", None) else None)
            or "default_avatar_url",
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
        sender_avatar=getattr(profile, "avatar_url", None)
        or (getattr(profile.user, "avatar_url", None) if getattr(profile, "user", None) else None)
        or "default_avatar_url",
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


def format_gemini_multiturn_contents(
    history_rows: list[AIChatMessage], current_user_text: str
) -> list[dict]:
    """
    Constructs a Gemini API 'contents' array ensuring:
    1. Alternating turns: user -> model -> user -> model ...
    2. Turn 0 is always role: 'user'.
    3. Last turn is role: 'user' with the latest prompt.
    4. Consecutive identical turns are coalesced.
    5. Empty or whitespace-only messages are removed.
    """
    raw_turns: list[tuple[str, str]] = []
    for h in history_rows:
        text = (h.content or "").strip()
        if not text:
            continue
        role = "user" if h.role == "user" else "model"
        raw_turns.append((role, text))

    current_clean = current_user_text.strip()
    if not raw_turns or raw_turns[-1] != ("user", current_clean):
        raw_turns.append(("user", current_clean))

    # Coalesce consecutive turns of the same role
    coalesced: list[tuple[str, str]] = []
    for role, text in raw_turns:
        if coalesced and coalesced[-1][0] == role:
            prev_role, prev_text = coalesced[-1]
            coalesced[-1] = (prev_role, f"{prev_text}\n\n{text}")
        else:
            coalesced.append((role, text))

    # Gemini requirement: conversation MUST start with a 'user' turn
    while coalesced and coalesced[0][0] != "user":
        coalesced.pop(0)

    # Gemini requirement: conversation for generateContent must end with 'user' turn
    if not coalesced or coalesced[-1][0] != "user":
        coalesced.append(("user", current_clean))

    return [{"role": r, "parts": [{"text": t}]} for r, t in coalesced]


def generate_pedagogical_guidance(
    user_text: str, student_name: str | None = None, history: list[AIChatMessage] | None = None
) -> str:
    """
    Fallback response engine used when Gemini is offline or rate-limited.
    Matches common student requests (greetings, grammar questions, homework, vocab)
    and returns natural, conversational replies — no formal headers, no word counts.
    """
    name = (student_name or "").split()[0] if student_name else "there"
    lower = user_text.lower()

    # 1. ESSAY & HOMEWORK REFUSAL + SCAFFOLDING (English & Uzbek keywords)
    essay_homework_patterns = [
        "write an essay", "write essay", "insho yozib ber", "insho", "do my homework",
        "solve this test", "vazifamni qilib ber", "solve my homework", "homework for me",
        "write a paragraph about", "write 250 words", "write 150 words", "give me answers",
        "give answers", "test javoblari", "topshiriq javobi", "write a letter"
    ]
    if any(p in lower for p in essay_homework_patterns):
        return (
            f"I'd love to help, {name} — but I can't write the essay for you directly. "
            f"The real progress comes from your own words! 💪\n\n"
            f"Here's what I *can* do: help you build a solid structure together. "
            f"A strong essay usually looks like this:\n\n"
            f"1. **Introduction** — Hook + paraphrase the prompt + your thesis in 1 clear sentence.\n"
            f"2. **Body 1** — Your strongest argument, with a real-world example.\n"
            f"3. **Body 2** — A second reason or a counter-argument you can address.\n"
            f"4. **Conclusion** — Restate your thesis in fresh words, no new ideas.\n\n"
            f"Start by writing your thesis sentence here and I'll give you feedback on it right away!"
        )

    # 2. COMMON GRAMMAR ERRORS
    if "have went" in lower or "has went" in lower:
        return (
            f"Quick grammar note on that, {name}! After *have/has*, you need the past participle — so it's **'have gone'**, not *'have went'*.\n\n"
            f"- ✅ *'I have gone to London.'* / *'I have been to London.'*\n"
            f"- ✅ *'I went to London last year.'* (past simple — no 'have')\n\n"
            f"*Went* is past simple on its own; *gone* is the past participle for perfect tenses. "
            f"Want to try writing a sentence using *'have been to'*?"
        )

    if "didn't knew" in lower or "did not knew" in lower or "didn't saw" in lower:
        return (
            f"Good catch to bring up, {name}! The rule here: when you use *did / didn't*, the verb after it stays in base form — no *-ed* or irregular past.\n\n"
            f"- ❌ *'I didn't knew'* → ✅ *'I didn't **know**'*\n"
            f"- ❌ *'She didn't saw'* → ✅ *'She didn't **see**'*\n\n"
            f"*Did* already carries the past meaning, so the main verb doesn't need to change. "
            f"Can you correct this one? *'We didn't went there yesterday.'*"
        )

    if "more better" in lower or "more easier" in lower:
        return (
            f"Nice try, {name}! English comparatives can be tricky. Short adjectives use *-er* on their own — you don't add *more* on top:\n\n"
            f"- ❌ *more better* → ✅ **better**\n"
            f"- ❌ *more easier* → ✅ **easier**\n\n"
            f"Use *more* only with longer adjectives: *more comfortable*, *more interesting*. "
            f"Try writing a comparison sentence and I'll check it for you!"
        )

    if any(k in lower for k in ["check this", "correct this", "is this correct", "xatomi", "to'g'rimi", "check my sentence", "check grammar"]):
        return (
            f"Sure, paste the sentence and I'll look it over! 😊\n\n"
            f"I'll flag any grammar issues and suggest a more natural phrasing if needed. "
            f"Just drop it here whenever you're ready."
        )

    # 3. GRAMMAR CONCEPTS
    if "since" in lower and "for" in lower:
        return (
            f"Great question, {name}! Both *since* and *for* go with the present perfect, but they answer different things:\n\n"
            f"- **for** = a duration → *for 3 years, for a long time*\n"
            f"  *'I have lived here **for** 3 years.'*\n"
            f"- **since** = a starting point → *since 2021, since Monday*\n"
            f"  *'I have lived here **since** 2021.'*\n\n"
            f"Quick quiz: *'They have been waiting _____ morning.'* — since or for?"
        )

    if "conditional" in lower or "if clause" in lower:
        return (
            f"Conditionals! Love it. Here's a quick breakdown:\n\n"
            f"- **Zero** (always true): *If you heat ice, it melts.*\n"
            f"- **First** (real future): *If I study hard, I will pass.*\n"
            f"- **Second** (imaginary now): *If I had more time, I would travel.*\n"
            f"- **Third** (past regret): *If I had studied, I would have passed.*\n\n"
            f"Which one do you want to practice? Write a sentence and I'll check it, {name}!"
        )

    if "present perfect" in lower or "past simple" in lower:
        return (
            f"These two mix people up all the time! Here's the simple version:\n\n"
            f"- **Past simple** = finished time you know: *'I visited Bukhara in 2022.'*\n"
            f"- **Present perfect** = life experience or recent result (no specific time): *'I have visited Bukhara three times.'*\n\n"
            f"Tell me one thing you did last year (past simple) and one thing you've achieved recently (present perfect) — I'll check them both!"
        )

    # 4. VOCABULARY & IELTS TOPIC COLLOCATIONS
    if any(k in lower for k in ["ielts", "vocabulary", "collocations", "words", "lug'at", "so'zlar"]):
        if "tech" in lower or "computer" in lower or "ai" in lower:
            topic_name = "Technology & Innovation"
            items = [
                ("Breakthrough innovation", "The AI chip was hailed as a breakthrough innovation."),
                ("Facilitate seamless communication", "These apps facilitate seamless communication across borders."),
                ("Automate repetitive tasks", "AI helps companies automate repetitive tasks efficiently.")
            ]
        elif "environment" in lower or "nature" in lower or "climate" in lower:
            topic_name = "Environment"
            items = [
                ("Combat climate change", "World leaders met to discuss how to combat climate change."),
                ("Renewable energy sources", "Solar and wind are key renewable energy sources."),
                ("Depletion of natural resources", "Overconsumption accelerates the depletion of natural resources.")
            ]
        elif "education" in lower or "study" in lower or "school" in lower:
            topic_name = "Education"
            items = [
                ("Foster critical thinking", "Good teachers foster critical thinking in students."),
                ("Attain academic excellence", "Regular practice helps students attain academic excellence."),
                ("Acquire in-depth knowledge", "Internships allow you to acquire in-depth knowledge quickly.")
            ]
        else:
            topic_name = "High-Impact Academic Vocabulary (Band 7+)"
            items = [
                ("Exert a profound influence on", "Mentorship exerts a profound influence on career success."),
                ("Mitigate adverse consequences", "Early planning helps mitigate adverse consequences."),
                ("Invaluable asset", "English fluency is an invaluable asset in today's job market.")
            ]

        colloc_str = "\n".join([f"- **{col}**: _{ex}_" for col, ex in items])
        return (
            f"Here are some high-level collocations for **{topic_name}**, {name}:\n\n"
            f"{colloc_str}\n\n"
            f"Pick one and write your own sentence — I'll give you instant feedback!"
        )

    # 5. META & CONVERSATIONAL FOLLOW-UPS
    meta_patterns = [
        "why are you typing", "why do you type", "why are you talking",
        "why are you speaking", "why do you speak", "why are you answering like this",
        "why like this", "why do you answer like this", "what do you mean",
        "who are you", "what are you", "nega bunday", "nega unaqa",
        "tushunmadim", "javob ber", "stop saying that", "don't repeat",
        "why do you say", "why are you saying",
    ]
    if any(p in lower for p in meta_patterns):
        return (
            f"Fair point, {name}! I'm Aura — your English tutor here on English Life. "
            f"My job is to help you improve naturally, not just hand you answers.\n\n"
            f"What would you like to do?\n"
            f"1. Just have a casual conversation in English\n"
            f"2. Get feedback on something you wrote\n"
            f"3. Learn a grammar rule explained simply\n\n"
            f"Just tell me and we'll go from there!"
        )

    # 6. GREETINGS
    greeting_match = re.search(
        r"\b(hello|hi|hey|assalomu\s+alaykum|assalom|salom|good\s+morning|good\s+afternoon|good\s+evening)\b",
        lower,
    )
    if greeting_match:
        has_prior_history = bool(history and len(history) > 1)
        if has_prior_history:
            return f"Hey {name}! Good to hear from you again. What would you like to work on?"
        return (
            f"Hey {name}! I'm Aura, your English tutor on English Life. 👋\n\n"
            f"We can chat in English, check your writing, go over grammar, or build up vocabulary — whatever you need. "
            f"What's on your mind today?"
        )

    if re.search(r"\b(how are you|how's it going|how are you doing)\b", lower):
        return (
            f"I'm great, thanks for asking! 😊 How's your day going, {name}? "
            f"Ready to practice some English?"
        )

    # 7. GENERAL CONVERSATIONAL DEFAULT
    if user_text.endswith("?") or re.search(r"\b(can you|could you|would you|what is|how do|why)\b", lower):
        return (
            f"Good question, {name}! Could you give me a bit more context or share an example sentence? "
            f"That way I can give you a much more specific and useful answer."
        )

    # Default: engage naturally with what they said, invite them to share more
    return (
        f"Got it, {name}! That's interesting. "
        f"If you'd like me to check the grammar or phrasing of what you wrote, just paste your sentence and I'll take a look. "
        f"Or if you have a question about English, fire away!"
    )



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

    # Fetch last 8 messages for context
    history_rows = (
        await db.execute(
            select(AIChatMessage)
            .where(AIChatMessage.student_id == profile.id)
            .order_by(AIChatMessage.created_at.desc())
            .limit(8)
        )
    ).scalars().all()
    history_rows.reverse()

    contents = format_gemini_multiturn_contents(history_rows, user_text)

    gemini_payload = {
        "system_instruction": {
            "parts": [{"text": AI_COMPANION_SYSTEM_PROMPT}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 600,
        },
    }

    reply_text = ""
    try:
        resp, err = await execute_gemini_generate_content(payload=gemini_payload, timeout=20.0)
        if resp and resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts and parts[0].get("text"):
                    reply_text = parts[0]["text"].strip()
        elif err:
            logger.info("Gemini non-200 status or error: %s. Using pedagogical engine fallback.", err)
    except Exception as ex:
        logger.warning("Gemini invocation failed (%s). Using pedagogical engine fallback.", ex)

    if not reply_text:
        # Context-rich dynamic pedagogical response
        reply_text = generate_pedagogical_guidance(user_text, student_name=profile.full_name, history=history_rows)

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

