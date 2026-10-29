import logging
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.social import NoteLike, PublicNote, StudyGroup, StudyGroupMember
from app.models.student import StudentProfile
from app.models.user import User, UserRole
from app.schemas.social import (
    PublicNoteAuthor,
    PublicNoteCreate,
    PublicNoteOut,
    StudyGroupCreate,
    StudyGroupJoinRequest,
    StudyGroupMemberOut,
    StudyGroupOut,
)

logger = logging.getLogger("app.api.routes.social")

router = APIRouter(prefix="/social", tags=["social"])


async def _get_student_profile(db: AsyncSession, user: User) -> StudentProfile | None:
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.user))
        .where(StudentProfile.user_id == user.id)
    )
    return result.scalar_one_or_none()


def _author_from_profile(profile: StudentProfile) -> PublicNoteAuthor:
    user = getattr(profile, "user", None)
    avatar = (
        getattr(profile, "avatar_url", None)
        or (getattr(user, "avatar_url", None) if user else None)
        or "default_avatar_url"
    )
    return PublicNoteAuthor(
        id=profile.id,
        full_name=profile.full_name,
        username=user.username if user else None,
        avatar_url=avatar,
        custom_badge=getattr(profile, "custom_badge", None),
        premium_plan=getattr(profile, "premium_plan", "free"),
    )


# ─── Public Notes (Zametka) ───────────────────────────────────────────────────

@router.get("/notes", response_model=list[PublicNoteOut], summary="List public study notes")
async def list_public_notes(
    category: str | None = Query(None, description="Filter by category"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List public notes posted by premium learners. Visible to all users.
    """
    profile = await _get_student_profile(db, current_user)
    student_id = profile.id if profile else None

    query = (
        select(PublicNote)
        .options(
            selectinload(PublicNote.author).selectinload(StudentProfile.user),
            selectinload(PublicNote.likes),
        )
        .order_by(PublicNote.is_pinned.desc(), PublicNote.created_at.desc())
        .offset(offset)
        .limit(limit)
    )

    if category:
        query = query.where(PublicNote.category == category)

    res = await db.execute(query)
    notes = res.scalars().all()

    out = []
    for note in notes:
        has_liked = False
        if student_id:
            has_liked = any(like.student_id == student_id for like in note.likes)

        out.append(
            PublicNoteOut(
                id=note.id,
                title=note.title,
                content=note.content,
                category=note.category,
                is_pinned=note.is_pinned,
                likes_count=note.likes_count,
                has_liked=has_liked,
                created_at=note.created_at,
                updated_at=note.updated_at,
                author=_author_from_profile(note.author),
            )
        )
    return out


@router.post("/notes", response_model=PublicNoteOut, status_code=status.HTTP_201_CREATED, summary="Post a public study note")
async def create_public_note(
    body: PublicNoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Publish a note. Premium students with can_write_notes=True or Teachers only.
    """
    profile = await _get_student_profile(db, current_user)
    if not profile and current_user.role != UserRole.TEACHER:
        raise HTTPException(status_code=403, detail="Student profile required.")

    # Permissions check
    is_teacher = current_user.role == UserRole.TEACHER
    can_write = is_teacher or bool(getattr(profile, "can_write_notes", False)) or bool(getattr(profile, "is_premium", False))
    if not can_write:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public notes require Standard (19k) or Pro VIP (29k) plan.",
        )

    note = PublicNote(
        id=uuid.uuid4(),
        author_id=profile.id,
        title=body.title.strip(),
        content=body.content.strip(),
        category=body.category.strip().lower(),
        is_pinned=False,
        likes_count=0,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)

    # Re-fetch with relationships
    res = await db.execute(
        select(PublicNote)
        .options(selectinload(PublicNote.author).selectinload(StudentProfile.user))
        .where(PublicNote.id == note.id)
    )
    note_loaded = res.scalar_one()

    return PublicNoteOut(
        id=note_loaded.id,
        title=note_loaded.title,
        content=note_loaded.content,
        category=note_loaded.category,
        is_pinned=note_loaded.is_pinned,
        likes_count=note_loaded.likes_count,
        has_liked=False,
        created_at=note_loaded.created_at,
        updated_at=note_loaded.updated_at,
        author=_author_from_profile(note_loaded.author),
    )


@router.post("/notes/{note_id}/like", summary="Toggle like on a public note")
async def toggle_note_like(
    note_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_student_profile(db, current_user)
    if not profile:
        raise HTTPException(status_code=403, detail="Only students can like notes.")

    note = (await db.execute(select(PublicNote).where(PublicNote.id == note_id))).scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")

    existing_like = (
        await db.execute(
            select(NoteLike).where(NoteLike.note_id == note_id, NoteLike.student_id == profile.id)
        )
    ).scalar_one_or_none()

    if existing_like:
        await db.delete(existing_like)
        note.likes_count = max(0, note.likes_count - 1)
        liked = False
    else:
        new_like = NoteLike(id=uuid.uuid4(), note_id=note_id, student_id=profile.id)
        db.add(new_like)
        note.likes_count += 1
        liked = True

    await db.commit()
    return {"liked": liked, "likes_count": note.likes_count}


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete public note")
async def delete_public_note(
    note_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    note = (await db.execute(select(PublicNote).where(PublicNote.id == note_id))).scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")

    profile = await _get_student_profile(db, current_user)
    is_author = profile and note.author_id == profile.id
    is_teacher = current_user.role == UserRole.TEACHER

    if not (is_author or is_teacher):
        raise HTTPException(status_code=403, detail="Permission denied.")

    await db.delete(note)
    await db.commit()


# ─── Study Groups ─────────────────────────────────────────────────────────────

GLOBAL_PREMIUM_GROUP_CODE = "PREMIUM-GLOBAL"


async def ensure_global_premium_group(
    db: AsyncSession,
    trigger_profile: StudentProfile | None = None,
) -> StudyGroup:
    """
    Ensures the system-wide '🌟 Global Premium Study Lounge' exists,
    and automatically enrolls all students with active paid plans (Standard & Pro VIP).
    """
    stmt = (
        select(StudyGroup)
        .options(
            selectinload(StudyGroup.creator).selectinload(StudentProfile.user),
            selectinload(StudyGroup.members).selectinload(StudyGroupMember.student).selectinload(StudentProfile.user),
        )
        .where(StudyGroup.invite_code == GLOBAL_PREMIUM_GROUP_CODE)
    )
    group = (await db.execute(stmt)).scalar_one_or_none()

    if not group:
        creator_id = trigger_profile.id if trigger_profile else None
        if not creator_id:
            first_vip = (
                await db.execute(
                    select(StudentProfile)
                    .where(
                        or_(
                            StudentProfile.premium_plan.in_(["standard", "pro_vip"]),
                            StudentProfile.is_premium.is_(True),
                        )
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            if first_vip:
                creator_id = first_vip.id
            else:
                any_student = (await db.execute(select(StudentProfile).limit(1))).scalar_one_or_none()
                creator_id = any_student.id if any_student else uuid.uuid4()

        group = StudyGroup(
            id=uuid.uuid4(),
            creator_id=creator_id,
            name="🌟 Global Premium Study Lounge",
            description="Official unified study lounge for all English Life Standard & Pro VIP members. Network, share practice notes, and discuss assignments together!",
            topic="Global Premium IELTS & CEFR Community",
            max_members=1000,
            invite_code=GLOBAL_PREMIUM_GROUP_CODE,
            is_active=True,
        )
        db.add(group)
        await db.commit()
        await db.refresh(group)

    # Auto-enroll all active paid tier students
    paid_students = (
        await db.execute(
            select(StudentProfile)
            .where(
                or_(
                    StudentProfile.premium_plan.in_(["standard", "pro_vip"]),
                    StudentProfile.is_premium.is_(True),
                ),
                StudentProfile.premium_plan != "free",
            )
        )
    ).scalars().all()

    existing_members = (
        await db.execute(
            select(StudyGroupMember).where(StudyGroupMember.study_group_id == group.id)
        )
    ).scalars().all()
    existing_member_student_ids = {m.student_id for m in existing_members}

    new_memberships = False
    for st in paid_students:
        if st.id not in existing_member_student_ids:
            member_entry = StudyGroupMember(
                id=uuid.uuid4(),
                study_group_id=group.id,
                student_id=st.id,
                role="member",
                joined_at=datetime.now(timezone.utc),
            )
            db.add(member_entry)
            new_memberships = True

    if new_memberships:
        await db.commit()

    return group


@router.get("/study-groups", response_model=list[StudyGroupOut], summary="List active study groups")
async def list_study_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_student_profile(db, current_user)
    student_id = profile.id if profile else None

    # Ensure the Global Premium Study Lounge is active and populated
    await ensure_global_premium_group(db, profile)

    query = (
        select(StudyGroup)
        .options(
            selectinload(StudyGroup.creator).selectinload(StudentProfile.user),
            selectinload(StudyGroup.members).selectinload(StudyGroupMember.student).selectinload(StudentProfile.user),
        )
        .where(StudyGroup.is_active.is_(True))
        .order_by(StudyGroup.created_at.desc())
    )
    groups = (await db.execute(query)).scalars().all()


    out = []
    for g in groups:
        is_member = False
        is_creator = False
        if student_id:
            is_creator = g.creator_id == student_id
            is_member = any(m.student_id == student_id for m in g.members)

        members_out = [
            StudyGroupMemberOut(
                student_id=m.student_id,
                full_name=m.student.full_name,
                username=m.student.user.username if getattr(m.student, "user", None) else None,
                avatar_url=getattr(m.student, "avatar_url", None)
                or (getattr(m.student.user, "avatar_url", None) if getattr(m.student, "user", None) else None)
                or "default_avatar_url",
                custom_badge=getattr(m.student, "custom_badge", None),
                role=m.role,
                joined_at=m.joined_at,
            )
            for m in g.members
        ]

        out.append(
            StudyGroupOut(
                id=g.id,
                name=g.name,
                description=g.description,
                topic=g.topic,
                max_members=g.max_members,
                invite_code=g.invite_code,
                is_active=g.is_active,
                member_count=len(g.members),
                is_member=is_member,
                is_creator=is_creator,
                created_at=g.created_at,
                creator=_author_from_profile(g.creator),
                members=members_out,
            )
        )

    # Place Global Premium Lounge at the very top of the list
    out.sort(key=lambda x: (0 if x.invite_code == GLOBAL_PREMIUM_GROUP_CODE else 1, -x.created_at.timestamp()))
    return out


@router.post("/study-groups", response_model=StudyGroupOut, status_code=status.HTTP_201_CREATED, summary="Create a custom study group")
async def create_study_group(
    body: StudyGroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a custom study group. Requires Pro VIP plan (can_create_groups=True).
    """
    profile = await _get_student_profile(db, current_user)
    if not profile and current_user.role != UserRole.TEACHER:
        raise HTTPException(status_code=403, detail="Student profile required.")

    is_teacher = current_user.role == UserRole.TEACHER
    can_create = is_teacher or bool(getattr(profile, "can_create_groups", False))
    if not can_create:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Creating study groups requires Pro VIP (29k) plan.",
        )

    invite_code = secrets.token_hex(4).upper()

    group = StudyGroup(
        id=uuid.uuid4(),
        creator_id=profile.id,
        name=body.name.strip(),
        description=body.description.strip(),
        topic=body.topic.strip(),
        max_members=body.max_members,
        invite_code=invite_code,
        is_active=True,
    )
    db.add(group)
    await db.flush()

    # Automatically add creator as admin/creator member
    creator_member = StudyGroupMember(
        id=uuid.uuid4(),
        study_group_id=group.id,
        student_id=profile.id,
        role="creator",
        joined_at=datetime.now(timezone.utc),
    )
    db.add(creator_member)
    await db.commit()

    # Re-fetch
    res = await db.execute(
        select(StudyGroup)
        .options(
            selectinload(StudyGroup.creator).selectinload(StudentProfile.user),
            selectinload(StudyGroup.members).selectinload(StudyGroupMember.student).selectinload(StudentProfile.user),
        )
        .where(StudyGroup.id == group.id)
    )
    loaded = res.scalar_one()

    return StudyGroupOut(
        id=loaded.id,
        name=loaded.name,
        description=loaded.description,
        topic=loaded.topic,
        max_members=loaded.max_members,
        invite_code=loaded.invite_code,
        is_active=loaded.is_active,
        member_count=1,
        is_member=True,
        is_creator=True,
        created_at=loaded.created_at,
        creator=_author_from_profile(loaded.creator),
        members=[
            StudyGroupMemberOut(
                student_id=profile.id,
                full_name=profile.full_name,
                username=profile.user.username if getattr(profile, "user", None) else None,
                avatar_url=getattr(profile, "avatar_url", None)
                or (getattr(profile.user, "avatar_url", None) if getattr(profile, "user", None) else None)
                or "default_avatar_url",
                custom_badge=getattr(profile, "custom_badge", None),
                role="creator",
                joined_at=creator_member.joined_at,
            )
        ],
    )


@router.post("/study-groups/join", summary="Join a study group by ID or invite code")
async def join_study_group(
    body: StudyGroupJoinRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_student_profile(db, current_user)
    if not profile:
        raise HTTPException(status_code=403, detail="Student profile required.")

    query = select(StudyGroup).options(selectinload(StudyGroup.members))
    if body.group_id:
        query = query.where(StudyGroup.id == body.group_id)
    elif body.invite_code:
        query = query.where(func.upper(StudyGroup.invite_code) == body.invite_code.strip().upper())
    else:
        raise HTTPException(status_code=400, detail="Provide either group_id or invite_code.")

    group = (await db.execute(query)).scalar_one_or_none()
    if not group or not group.is_active:
        raise HTTPException(status_code=404, detail="Study group not found or inactive.")

    # Check already member
    if any(m.student_id == profile.id for m in group.members):
        return {"status": "already_member", "message": "You are already a member of this group."}

    # Check capacity
    if len(group.members) >= group.max_members:
        raise HTTPException(status_code=400, detail="This study group is full.")

    member = StudyGroupMember(
        id=uuid.uuid4(),
        study_group_id=group.id,
        student_id=profile.id,
        role="member",
        joined_at=datetime.now(timezone.utc),
    )
    db.add(member)
    await db.commit()

    return {"status": "success", "message": f"Successfully joined {group.name}!"}


@router.post("/study-groups/{group_id}/leave", summary="Leave a study group")
async def leave_study_group(
    group_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = await _get_student_profile(db, current_user)
    if not profile:
        raise HTTPException(status_code=403, detail="Student profile required.")

    membership = (
        await db.execute(
            select(StudyGroupMember).where(
                StudyGroupMember.study_group_id == group_id,
                StudyGroupMember.student_id == profile.id,
            )
        )
    ).scalar_one_or_none()

    if not membership:
        raise HTTPException(status_code=404, detail="You are not a member of this study group.")

    await db.delete(membership)
    await db.commit()
    return {"status": "success", "message": "Left study group."}
