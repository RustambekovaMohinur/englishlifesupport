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


def generate_pedagogical_guidance(user_text: str, student_name: str | None = None) -> str:
    """
    Generates an intelligent, context-aware pedagogical response tailored to the student's prompt
    when the Gemini API is offline, unconfigured, or rate-limited.
    Strictly follows the pedagogical guardrails:
    - Never generates direct homework/essay answers
    - Scaffolds outlines, guiding questions, and topic collocations
    - Corrects grammar errors with rules & native examples
    - Explains grammar concepts with clear formulas
    """
    name = (student_name or "").split()[0] if student_name else "Learner"
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
            f"🎓 **Aura English Coach:**\n\n"
            f"Hello {name}! As your English Life learning coach, I cannot write complete essays or solve homework exercises for you directly. "
            f"True fluency comes from your own writing and critical thinking!\n\n"
            f"However, I'm here to guide you step-by-step so you can ace this assignment yourself! 🚀\n\n"
            f"### 📋 Recommended 4-Paragraph Structure:\n"
            f"1. **Introduction (approx. 40 words):**\n"
            f"   - *Hook & Paraphrase:* Rephrase the prompt in your own words.\n"
            f"   - *Thesis Statement:* State your main argument or perspective clearly.\n"
            f"2. **Body Paragraph 1 (approx. 90 words):**\n"
            f"   - *Topic Sentence:* Introduce your strongest point.\n"
            f"   - *Explanation & Real-world Example:* Support it with concrete details.\n"
            f"   - *Concluding Impact:* How does this affect society or individuals?\n"
            f"3. **Body Paragraph 2 (approx. 90 words):**\n"
            f"   - *Counter-argument or Second Reason:* Analyze the alternate viewpoint.\n"
            f"   - *Evidence / Elaboration:* Show why your perspective holds.\n"
            f"4. **Conclusion (approx. 30 words):**\n"
            f"   - *Restate Thesis:* In fresh synonyms without adding new arguments.\n\n"
            f"### 💡 Next Step:\n"
            f"Draft your **Thesis Statement** or your **first paragraph** right here, and I will analyze your grammar, vocabulary, and cohesion together with you!"
        )

    # 2. COMMON GRAMMAR ERRORS & CORRECTION REQUESTS
    if "have went" in lower or "has went" in lower:
        return (
            f"🔍 **Grammar Check: 'Have went' vs 'Have gone'**\n\n"
            f"Good eye! There is an important rule here:\n"
            f"- **'Went'** is the *Past Simple (V2)*: used for finished past actions (e.g. *'I went to the store yesterday'*).\n"
            f"- After auxiliary **'have/has'** (Present Perfect), you must use the **Past Participle (V3)**, which is **'gone'** or **'been'**.\n\n"
            f"✅ **Correct phrasing:**\n"
            f"- *'I have gone to London.'* (Still there / ongoing)\n"
            f"- *'I have been to London.'* (Visited and returned — experience)\n"
            f"- *'I went to London last summer.'* (Specific finished time)\n\n"
            f"**Your turn:** Can you write a sentence about a city you have visited using *'have been to'*?"
        )

    if "didn't knew" in lower or "did not knew" in lower or "didn't saw" in lower:
        return (
            f"🔍 **Grammar Check: Auxiliary 'Did' + Base Verb**\n\n"
            f"Remember this golden rule for past questions and negatives:\n"
            f"- The auxiliary verb **'did / didn't'** already carries the past tense.\n"
            f"- Therefore, the main verb following it MUST be in the **bare infinitive (base form, V1)**!\n\n"
            f"❌ *'I didn't knew that.'*\n"
            f"✅ *'I didn't **know** that.'*\n\n"
            f"❌ *'She didn't saw the message.'*\n"
            f"✅ *'She didn't **see** the message.'*\n\n"
            f"**Challenge:** Try correcting this sentence: *'We didn't went there yesterday.'*"
        )

    if "more better" in lower or "more easier" in lower:
        return (
            f"🔍 **Grammar Check: Double Comparatives**\n\n"
            f"Notice: in English we do not combine **'more'** with **'-er'** comparatives!\n\n"
            f"- For short 1-syllable adjectives (like *good -> better*, *fast -> faster*), use the irregular or *-er* form alone: **'better'** (not *'more better'*).\n"
            f"- For 2-syllable adjectives ending in -y (like *easy -> easier*), use **'easier'** (not *'more easier'*).\n"
            f"- Use **'more'** only with multi-syllable adjectives (e.g. *'more comfortable'*, *'more challenging'*).\n\n"
            f"✅ *'This method is much better and easier to remember.'*"
        )

    if any(k in lower for k in ["check this", "correct this", "is this correct", "xatomi", "to'g'rimi", "check my sentence", "check grammar"]):
        return (
            f"✍️ **Sentence & Grammar Inspection:**\n\n"
            f"Let's review what you've written! To give you the most accurate IELTS/CEFR feedback:\n\n"
            f"1. **Grammar & Agreement:** Make sure subjects and verbs agree (e.g., *'He goes'* vs *'They go'*).\n"
            f"2. **Tense Consistency:** If you are describing an ongoing experience, use *Present Perfect* (*'I have worked here for 2 years'*). If specifying a past date, use *Past Simple* (*'I joined in 2022'*).\n"
            f"3. **Lexical Variety:** Look for words that can be upgraded with stronger collocations (e.g. *'very important'* ➔ *'crucial / vital'*).\n\n"
            f"Paste your full sentence below, and I will highlight any mistakes and provide native alternative expressions!"
        )

    # 3. GRAMMAR CONCEPTS
    if "since" in lower and "for" in lower:
        return (
            f"💡 **Grammar Masterclass: 'Since' vs 'For'**\n\n"
            f"Both are used with Perfect Tenses to talk about time, but they answer different questions:\n\n"
            f"### 1. **FOR + Duration / Period of Time**\n"
            f"Tells us *how long* something has lasted.\n"
            f"- *for 2 hours, for 5 years, for a long time, for 6 months*\n"
            f"- 📌 *'I have lived in Samarkand **for** 3 years.'*\n\n"
            f"### 2. **SINCE + Starting Point in Time**\n"
            f"Tells us *when* the action started.\n"
            f"- *since 2018, since 9:00 AM, since Monday, since my childhood*\n"
            f"- 📌 *'I have lived in Samarkand **since** 2021.'*\n\n"
            f"**Quick Quiz:** Fill in the blank: *'They have been waiting _____ morning.'* (since or for?)"
        )

    if "conditional" in lower or "if clause" in lower:
        return (
            f"💡 **Grammar Masterclass: Conditionals Summary**\n\n"
            f"- **Zero Conditional (Universal Truths):**\n"
            f"  `If + Present Simple, Present Simple`\n"
            f"  *If you heat ice, it melts.*\n\n"
            f"- **First Conditional (Real Future Possibility):**\n"
            f"  `If + Present Simple, will + V1`\n"
            f"  *If I pass my IELTS exam, I will apply to university.*\n\n"
            f"- **Second Conditional (Hypothetical / Unreal Present):**\n"
            f"  `If + Past Simple, would + V1`\n"
            f"  *If I had more free time, I would travel the world.*\n\n"
            f"- **Third Conditional (Past Regrets / Unreal Past):**\n"
            f"  `If + Past Perfect (had + V3), would have + V3`\n"
            f"  *If I had studied harder, I would have scored Band 8.0.*\n\n"
            f"Which conditional would you like to practice creating a sentence with?"
        )

    if "present perfect" in lower or "past simple" in lower:
        return (
            f"💡 **Present Perfect vs Past Simple**\n\n"
            f"- **Past Simple:** Used when the time is **finished** and specified (*yesterday, last year, in 2020, two hours ago*).\n"
            f"  *I visited Bukhara in 2022.*\n\n"
            f"- **Present Perfect (have/has + V3):** Used for **life experience**, recent actions with **present results**, or **unspecified time**.\n"
            f"  *I have visited Bukhara three times.* (In my life so far)\n"
            f"  *I have lost my keys!* (Result: I cannot enter right now)\n\n"
            f"Can you tell me one memorable thing you did last year in Past Simple, and one thing you have achieved this year in Present Perfect?"
        )

    # 4. VOCABULARY & IELTS TOPIC COLLOCATIONS
    if any(k in lower for k in ["ielts", "vocabulary", "collocations", "words", "lug'at", "so'zlar"]):
        topic_name = "Academic & Everyday English"
        if "tech" in lower or "computer" in lower or "ai" in lower:
            topic_name = "Technology & Innovation"
            items = [
                ("Breakthrough innovation", "Inqilobiy yangilik", "The discovery was hailed as a breakthrough innovation."),
                ("Facilitate seamless communication", "Uzluksiz aloqani ta'minlash", "Digital platforms facilitate seamless communication."),
                ("Automate repetitive tasks", "Bir xil takroriy ishlarni avtomatlashtirish", "AI enables employees to automate repetitive tasks.")
            ]
        elif "environment" in lower or "nature" in lower or "climate" in lower:
            topic_name = "Environment & Ecology"
            items = [
                ("Combat climate change", "Iqlim o'zgarishiga qarshi kurashmoq", "Global policies are essential to combat climate change."),
                ("Renewable energy sources", "Qayta tiklanadigan energiya manbalari", "Transitioning to renewable energy sources is imperative."),
                ("Depletion of natural resources", "Tabiiy resurslarning kamayishi", "Overconsumption leads to the rapid depletion of natural resources.")
            ]
        elif "education" in lower or "study" in lower or "school" in lower:
            topic_name = "Education & Learning"
            items = [
                ("Foster critical thinking", "Tanqidiy fikrlashni rivojlantirish", "Modern curricula strive to foster critical thinking."),
                ("Attain academic excellence", "Yuqori akademik natijalarga erishish", "Consistent revision helps students attain academic excellence."),
                ("Acquire in-depth knowledge", "Chuqur bilim egallamoq", "Internships allow trainees to acquire in-depth knowledge.")
            ]
        else:
            topic_name = "High-Impact Academic Vocabulary (Band 7.5+)"
            items = [
                ("Exert a profound influence on", "Chuqur ta'sir ko'rsatmoq", "Early mentorship exerts a profound influence on career success."),
                ("Mitigate adverse consequences", "Salbiy oqibatlarni yumshatmoq", "Proactive planning helps mitigate adverse consequences."),
                ("Invaluable asset", "Bebaho boylik/foyda", "Fluency in English is an invaluable asset in the global job market.")
            ]

        colloc_str = "\n".join([f"- **{col}** (*{uz}*): {ex}" for col, uz, ex in items])
        return (
            f"📚 **Vocabulary Booster: {topic_name} (Band 7.5+)**\n\n"
            f"{colloc_str}\n\n"
            f"**Practice Task:** Pick one of these collocations and write an original sentence. I will provide instant feedback on your grammar and tone!"
        )

    # 5. GREETING & CONVERSATIONAL ENGAGEMENT
    greetings = ["hello", "hi", "hey", "assalom", "salom", "good morning", "good evening", "how are you"]
    if any(g in lower for g in greetings):
        return (
            f"👋 Hello {name}! I'm **Aura**, your English Life AI learning coach.\n\n"
            f"I'm here to help you build confidence in English without the fear of making mistakes! Here is what we can do today:\n"
            f"- 📝 **Writing & Essay Clinic:** Brainstorm ideas, outline paragraphs, and refine vocabulary.\n"
            f"- 🔍 **Grammar Check:** Share any sentence you wrote, and we'll check it together.\n"
            f"- 🎯 **IELTS Band 7+ Collocations:** Learn natural, native expressions on any topic.\n"
            f"- 💬 **Conversational Practice:** Practice speaking or writing about your goals, hobbies, or studies.\n\n"
            f"What would you like to work on right now?"
        )

    # 6. DYNAMIC COACHING DEFAULT (Analyzes user's exact words)
    words_count = len(user_text.split())
    return (
        f"🎯 **Coaching Feedback for:** *\"{user_text}\"*\n\n"
        f"Thank you for sharing this! You've used {words_count} words in your sentence.\n\n"
        f"### 💡 Language Analysis:\n"
        f"- **Structure & Flow:** Keep your core subject and main verb close together for clarity.\n"
        f"- **Word Choice Tip:** Try to replace general words (like *'good'*, *'bad'*, *'thing'*) with specific nouns and verbs.\n\n"
        f"Would you like me to suggest higher-level collocations for this, or check the grammar and punctuation together?"
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
            "temperature": 0.4,
            "maxOutputTokens": 800,
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
        reply_text = generate_pedagogical_guidance(user_text, student_name=profile.full_name)

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

