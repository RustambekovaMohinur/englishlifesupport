import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import asc, delete, desc, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_teacher
from app.db.session import get_db
from app.models.assignment import Assignment, SpinPrompt
from app.models.group import Group
from app.models.user import User
from app.schemas.assignment import (
    SpinPromptBulkCreate,
    SpinPromptCreate,
    SpinPromptOut,
    SpinPromptUpdate,
)

router = APIRouter(prefix="/spin-prompts", tags=["spin-prompts"])
logger = logging.getLogger(__name__)

# Built-in fallback prompt banks (IELTS / CEFR B1–C1)
DEFAULT_SPEAKING_PROMPTS = [
    ("Describe a memorable journey you took with your family or friends. Where did you go and what happened?", "IELTS Speaking Part 2 / Cue Card"),
    ("Talk about a teacher or mentor who had a strong positive influence on your life. Why do you respect them?", "IELTS Speaking Part 2 / Cue Card"),
    ("Describe an interesting skill or hobby you would love to learn in the future. How would it help you?", "IELTS Speaking Part 2 / Cue Card"),
    ("Do you think artificial intelligence will replace human teachers in the future? Explain your viewpoint.", "IELTS Speaking Part 3 / Discussion"),
    ("Describe a traditional holiday or celebration in your culture. How do people celebrate it?", "IELTS Speaking Part 1 / Everyday"),
    ("Talk about a difficult decision you had to make recently. What was the outcome and what did you learn?", "IELTS Speaking Part 2 / Cue Card"),
    ("Describe a book, movie, or speech that changed the way you think about the world.", "IELTS Speaking Part 2 / Cue Card"),
    ("What are the advantages and disadvantages of living in a bustling big city versus a quiet countryside?", "IELTS Speaking Part 3 / Discussion"),
    ("How important is it for people to maintain a healthy work-life balance in modern society?", "IELTS Speaking Part 3 / Discussion"),
    ("Describe your favorite childhood memory. Why has it stayed with you for so long?", "IELTS Speaking Part 1 / Everyday"),
]

DEFAULT_WRITING_PROMPTS = [
    ("Some people believe that university education should be completely free for all citizens. To what extent do you agree or disagree?", "IELTS Writing Task 2 / Opinion Essay"),
    ("Modern technology makes people more connected, yet many feel more isolated than ever. Discuss both views and give your opinion.", "IELTS Writing Task 2 / Discussion Essay"),
    ("Governments should invest more money in public transport systems rather than building new highways. Discuss the benefits.", "IELTS Writing Task 2 / Opinion Essay"),
    ("Children nowadays spend excessive hours on digital screens. What problems does this cause, and what solutions can parents implement?", "IELTS Writing Task 2 / Problem & Solution"),
    ("Is it better for high school graduates to take a gap year before entering university? Discuss the pros and cons.", "IELTS Writing Task 2 / Advantages & Disadvantages"),
    ("Some argue that success in life is determined by hard work, while others believe luck plays the main role. What is your perspective?", "IELTS Writing Task 2 / Discussion Essay"),
    ("Tourism brings great economic benefits to local communities, but also causes environmental harm. How can this balance be maintained?", "IELTS Writing Task 2 / Problem & Solution"),
    ("Write an essay discussing whether remote work will become the standard way of working across global industries.", "IELTS Writing Task 2 / Opinion Essay"),
    ("The rise of fast fashion has negative environmental consequences. Who should take responsibility: consumers or governments?", "IELTS Writing Task 2 / Opinion Essay"),
    ("Many traditional cultural customs are fading due to globalization. Is this a positive or negative development?", "IELTS Writing Task 2 / Opinion Essay"),
]


@router.get("", response_model=list[SpinPromptOut])
async def list_spin_prompts(
    prompt_type: str | None = Query(default=None, regex="^(speaking|writing)$"),
    group_id: uuid.UUID | None = Query(default=None),
    assignment_id: uuid.UUID | None = Query(default=None),
    active_only: bool = Query(default=True),
    fallback: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List spin prompts with automatic hierarchical scoping and fallback:
    1. Specifically scoped to assignment_id if provided.
    2. Specifically scoped to group_id if provided.
    3. Global/shared prompts (group_id is NULL and assignment_id is NULL).
    4. Built-in defaults if database has zero prompts for the type.
    """
    conditions = []
    if prompt_type:
        conditions.append(SpinPrompt.prompt_type == prompt_type)
    if active_only:
        conditions.append(SpinPrompt.is_active == True)

    # If assignment_id is specified, prioritize assignment-level prompts
    if assignment_id:
        stmt = (
            select(SpinPrompt)
            .where(*conditions, SpinPrompt.assignment_id == assignment_id)
            .order_by(asc(SpinPrompt.order_index), desc(SpinPrompt.created_at))
        )
        res = await db.execute(stmt)
        items = list(res.scalars().all())
        if items or not fallback:
            return items

    # Next check group-level prompts
    if group_id:
        stmt = (
            select(SpinPrompt)
            .where(
                *conditions,
                SpinPrompt.group_id == group_id,
                SpinPrompt.assignment_id == None,  # noqa: E711
            )
            .order_by(asc(SpinPrompt.order_index), desc(SpinPrompt.created_at))
        )
        res = await db.execute(stmt)
        items = list(res.scalars().all())
        if items or not fallback:
            return items

    # Fetch global/shared prompts (or all prompts if teacher is managing without filters)
    global_cond = list(conditions)
    if group_id is None and assignment_id is None and not active_only:
        # Teacher portal management view without group filter: return all
        pass
    else:
        # Student spin or fallback view: fetch prompts where group_id is NULL
        global_cond.append(SpinPrompt.group_id == None)  # noqa: E711
        global_cond.append(SpinPrompt.assignment_id == None)  # noqa: E711

    stmt = select(SpinPrompt).where(*global_cond).order_by(asc(SpinPrompt.order_index), desc(SpinPrompt.created_at))
    res = await db.execute(stmt)
    items = list(res.scalars().all())

    # Fallback auto-seed in-memory if DB is completely empty and fallback=True
    if not items and fallback and prompt_type:
        now = datetime.now(timezone.utc)
        default_pairs = DEFAULT_SPEAKING_PROMPTS if prompt_type == "speaking" else DEFAULT_WRITING_PROMPTS
        mock_items = []
        user_id = getattr(current_user, "id", None) or uuid.uuid4()
        for idx, (txt, cat) in enumerate(default_pairs):
            mock_items.append(
                SpinPrompt(
                    id=uuid.uuid4(),
                    prompt_type=prompt_type,
                    text=txt,
                    category=cat,
                    created_by=user_id,
                    is_active=True,
                    order_index=idx,
                    created_at=now,
                    updated_at=now,
                )
            )
        return mock_items

    return items


@router.post("", response_model=SpinPromptOut, status_code=status.HTTP_201_CREATED)
async def create_spin_prompt(
    body: SpinPromptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Teacher creates an individual speaking question or writing topic."""
    # Verify group_id if provided
    resolved_group_id = body.group_id
    if resolved_group_id:
        grp = await db.get(Group, resolved_group_id)
        if not grp:
            resolved_group_id = None

    # Verify assignment_id if provided
    resolved_assignment_id = body.assignment_id
    if resolved_assignment_id:
        asgn = await db.get(Assignment, resolved_assignment_id)
        if not asgn:
            resolved_assignment_id = None

    now = datetime.now(timezone.utc)
    prompt = SpinPrompt(
        prompt_type=body.prompt_type,
        text=body.text.strip(),
        category=body.category.strip() if body.category else None,
        group_id=resolved_group_id,
        assignment_id=resolved_assignment_id,
        created_by=current_user.id,
        is_active=body.is_active,
        order_index=body.order_index,
        created_at=now,
        updated_at=now,
    )
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)
    return prompt


@router.post("/bulk", response_model=list[SpinPromptOut], status_code=status.HTTP_201_CREATED)
async def bulk_create_spin_prompts(
    body: SpinPromptBulkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """
    Teacher bulk pastes multiple lines of questions or topics.
    Parses each line, strips leading numbering (e.g. '1. ', '• ', 'Q: '), and saves.
    """
    # Verify group_id if provided
    resolved_group_id = body.group_id
    if resolved_group_id:
        grp = await db.get(Group, resolved_group_id)
        if not grp:
            resolved_group_id = None

    resolved_assignment_id = body.assignment_id
    if resolved_assignment_id:
        asgn = await db.get(Assignment, resolved_assignment_id)
        if not asgn:
            resolved_assignment_id = None

    raw_lines = body.lines.split("\n")
    created_items: list[SpinPrompt] = []
    now = datetime.now(timezone.utc)

    for idx, line in enumerate(raw_lines):
        clean_line = line.strip()
        # Strip leading numbers or bullets (e.g., '1.', '2)', '•', '-')
        import re
        clean_text = re.sub(r"^(\d+[\.\)]|[•\-\*]|q\d+:?)\s*", "", clean_line, flags=re.IGNORECASE).strip()
        if len(clean_text) >= 3:
            p = SpinPrompt(
                prompt_type=body.prompt_type,
                text=clean_text,
                category=body.category.strip() if body.category else None,
                group_id=resolved_group_id,
                assignment_id=resolved_assignment_id,
                created_by=current_user.id,
                is_active=True,
                order_index=idx,
                created_at=now,
                updated_at=now,
            )
            db.add(p)
            created_items.append(p)

    if not created_items:
        raise HTTPException(status_code=400, detail="No valid non-empty prompt lines were provided.")

    await db.commit()
    for item in created_items:
        await db.refresh(item)

    return created_items


@router.patch("/{prompt_id}", response_model=SpinPromptOut)
async def update_spin_prompt(
    prompt_id: uuid.UUID,
    body: SpinPromptUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Teacher updates a prompt's text, category, active state, or order."""
    prompt = await db.get(SpinPrompt, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Spin prompt not found")

    if body.text is not None:
        prompt.text = body.text.strip()
    if body.category is not None:
        prompt.category = body.category.strip() or None
    if body.group_id is not None:
        prompt.group_id = body.group_id
    if body.assignment_id is not None:
        prompt.assignment_id = body.assignment_id
    if body.order_index is not None:
        prompt.order_index = body.order_index
    if body.is_active is not None:
        prompt.is_active = body.is_active

    await db.commit()
    await db.refresh(prompt)
    return prompt


@router.delete("/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_spin_prompt(
    prompt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """Teacher deletes a spin prompt."""
    prompt = await db.get(SpinPrompt, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Spin prompt not found")

    await db.delete(prompt)
    await db.commit()
    return None


@router.post("/seed-defaults", response_model=dict[str, Any])
async def seed_default_spin_prompts(
    group_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """
    Convenience endpoint for teachers to pre-populate high-yield
    IELTS Speaking and Writing prompts into the database.
    """
    speaking_count = 0
    writing_count = 0

    for idx, (txt, cat) in enumerate(DEFAULT_SPEAKING_PROMPTS):
        p = SpinPrompt(
            prompt_type="speaking",
            text=txt,
            category=cat,
            group_id=group_id,
            created_by=current_user.id,
            is_active=True,
            order_index=idx,
        )
        db.add(p)
        speaking_count += 1

    for idx, (txt, cat) in enumerate(DEFAULT_WRITING_PROMPTS):
        p = SpinPrompt(
            prompt_type="writing",
            text=txt,
            category=cat,
            group_id=group_id,
            created_by=current_user.id,
            is_active=True,
            order_index=idx,
        )
        db.add(p)
        writing_count += 1

    await db.commit()
    return {
        "success": True,
        "message": f"Successfully seeded {speaking_count} Speaking Questions and {writing_count} Writing Topics.",
        "speaking_prompts_seeded": speaking_count,
        "writing_prompts_seeded": writing_count,
    }
