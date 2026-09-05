import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_student_profile, require_teacher
from app.core.config import settings
from app.db.session import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission
from app.models.user import ApprovalStatus, User, UserRole
from app.schemas.student import (
    ApprovedStudentData,
    ApproveStudentResponse,
    PaginatedPendingStudents,
    PaginatedStudents,
    PendingStudentItem,
    RejectedStudentData,
    RejectStudentResponse,
    StudentApprovalAction,
    StudentHistoryItem,
    StudentHistoryOut,
    StudentListItem,
    StudentOut,
    StudentStatusUpdate,
    StudentUpdate,
)

from pydantic import BaseModel, Field
from app.core.security import hash_password
from app.models.refresh_token import RefreshToken

router = APIRouter(prefix="/api/students", tags=["students"])


class StudentResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=6, max_length=128)


class StudentResetPasswordResponse(BaseModel):
    success: bool = True
    message: str = "Password reset successfully."



@router.get("", response_model=PaginatedStudents)
async def list_students(
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
    search: str | None = Query(default=None, description="Search by name or email"),
    group_id: uuid.UUID | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    approval_status: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """Teacher-only. Server-side paginated/searchable/filterable list.
    Correctly scopes students to groups created by this teacher if created_by is populated.
    """
    teacher_groups_subq = select(Group.id).where(
        or_(
            Group.created_by == current_user.id,
            and_(Group.created_by.is_(None), current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL),
        )
    )
    teacher_group_ids = (await db.execute(teacher_groups_subq)).scalars().all()

    if not teacher_group_ids:
        # Teacher has no groups, return empty roster
        return PaginatedStudents(items=[], total=0, page=page, page_size=page_size)

    query = select(
        StudentProfile,
        User.email,
        User.username,
        User.is_active,
        User.approval_status,
        User.created_at.label("user_created_at"),
        Group.id.label("grp_id"),
        Group.name.label("grp_name"),
        Group.english_level.label("grp_level"),
    ).join(
        User, StudentProfile.user_id == User.id
    ).outerjoin(Group, StudentProfile.group_id == Group.id)

    # Scoped strictly to groups owned by this teacher
    query = query.where(StudentProfile.group_id.in_(teacher_group_ids))

    if search:
        like = f"%{search.strip()}%"
        query = query.where(or_(
            StudentProfile.full_name.ilike(like),
            User.email.ilike(like),
            User.username.ilike(like),
        ))

    if group_id:
        if group_id not in teacher_group_ids:
            return PaginatedStudents(items=[], total=0, page=page, page_size=page_size)
        query = query.where(StudentProfile.group_id == group_id)

    if approval_status is not None and approval_status.strip():
        appr_val = approval_status.strip().lower()
        if appr_val == "all":
            pass
        elif appr_val == "approved":
            query = query.where(or_(User.approval_status == ApprovalStatus.APPROVED, User.approval_status.is_(None)))
        elif appr_val == "pending":
            query = query.where(User.approval_status == ApprovalStatus.PENDING)
        elif appr_val == "rejected":
            query = query.where(User.approval_status == ApprovalStatus.REJECTED)
        else:
            query = query.where(User.approval_status == approval_status)
    else:
        # Default for normal student roster: only approved (or legacy NULL) students
        query = query.where(or_(User.approval_status == ApprovalStatus.APPROVED, User.approval_status.is_(None)))

    if is_active is not None:
        query = query.where(User.is_active == is_active)
    elif approval_status is None or (isinstance(approval_status, str) and approval_status.strip().lower() == "approved"):
        query = query.where(User.is_active == True)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = query.order_by(StudentProfile.full_name).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(query)).all()

    items = [
        StudentListItem(
            id=profile.id,
            user_id=profile.user_id,
            full_name=profile.full_name,
            email=email,
            username=username or "",
            phone=profile.phone,
            telegram_username=profile.phone,
            is_active=is_active if is_active is not None else True,
            approval_status=appr_status.value if hasattr(appr_status, "value") else str(appr_status) if appr_status else "approved",
            total_stars=profile.total_stars,
            total_lightning=getattr(profile, "total_lightning", 0) or 0,
            group_id=grp_id,
            group_name=grp_name,
            level=grp_level.value if hasattr(grp_level, "value") else str(grp_level) if grp_level else None,
            created_at=user_created_at,
        )
        for profile, email, username, is_active, appr_status, user_created_at, grp_id, grp_name, grp_level in rows
    ]
    return PaginatedStudents(items=items, total=total, page=page, page_size=page_size)


@router.get("/pending", response_model=PaginatedPendingStudents)
async def list_pending_students(
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """Returns paginated pending student registration requests for groups belonging to this teacher."""
    teacher_groups_subq = select(Group.id).where(
        or_(
            Group.created_by == current_user.id,
            and_(Group.created_by.is_(None), current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL),
        )
    )
    teacher_group_ids = (await db.execute(teacher_groups_subq)).scalars().all()

    if not teacher_group_ids:
        return PaginatedPendingStudents(
            items=[],
            page=page,
            page_size=page_size,
            total=0,
            total_pages=0,
        )

    base_query = (
        select(
            StudentProfile,
            User.id.label("user_id"),
            User.email,
            User.username,
            User.created_at.label("user_created_at"),
            Group.id.label("grp_id"),
            Group.name.label("grp_name"),
            Group.english_level.label("grp_level"),
        )
        .join(User, StudentProfile.user_id == User.id)
        .join(Group, StudentProfile.group_id == Group.id)
        .where(
            User.approval_status == ApprovalStatus.PENDING,
            User.role == UserRole.STUDENT,
            StudentProfile.group_id.in_(teacher_group_ids),
        )
    )

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    if total == 0 or page > total_pages:
        return PaginatedPendingStudents(
            items=[],
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages,
        )

    query = (
        base_query
        .order_by(User.created_at.desc(), User.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(query)).all()

    items = []
    for profile, user_id, email, username, user_created_at, grp_id, grp_name, grp_level in rows:
        parts = (profile.full_name or "").strip().split(maxsplit=1)
        first_name = parts[0] if parts else ""
        last_name = parts[1] if len(parts) > 1 else ""
        level_str = grp_level.value if hasattr(grp_level, "value") else str(grp_level) if grp_level else None

        items.append(
            PendingStudentItem(
                id=profile.id,
                first_name=first_name,
                last_name=last_name,
                username=username or "",
                telegram_username=profile.phone,
                group_id=grp_id,
                group_name=grp_name,
                english_level=level_str,
                approval_status="PENDING",
                created_at=user_created_at,
            )
        )

    return PaginatedPendingStudents(
        items=items,
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
    )


@router.post("/{student_id}/approve", response_model=ApproveStudentResponse)
async def approve_student(
    student_id: uuid.UUID,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Teacher approves a pending student."""
    res = await db.execute(
        select(StudentProfile, User, Group)
        .join(User, StudentProfile.user_id == User.id)
        .outerjoin(Group, StudentProfile.group_id == Group.id)
        .where(or_(StudentProfile.id == student_id, StudentProfile.user_id == student_id, User.id == student_id))
    )
    row = res.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STUDENT_NOT_FOUND", "message": "Student not found."},
        )

    profile, user, group = row

    if user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_APPROVAL_STATE", "message": "Student cannot be approved from the current state."},
        )

    # Scoping check: student must belong to teacher's group
    is_authorized = group is not None and (
        group.created_by == current_user.id
        or (group.created_by is None and current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL)
    )
    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STUDENT_NOT_FOUND", "message": "Student not found."},
        )

    if user.approval_status == ApprovalStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ALREADY_APPROVED", "message": "Student is already approved."},
        )
    if user.approval_status == ApprovalStatus.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ALREADY_REJECTED", "message": "Student is already rejected."},
        )
    if user.approval_status != ApprovalStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_APPROVAL_STATE", "message": "Student cannot be approved from the current state."},
        )

    user.approval_status = ApprovalStatus.APPROVED
    user.is_active = True
    await db.commit()
    await db.refresh(user)

    parts = (profile.full_name or "").strip().split(maxsplit=1)
    first_name = parts[0] if parts else ""
    last_name = parts[1] if len(parts) > 1 else ""
    level_str = group.english_level.value if group and hasattr(group.english_level, "value") else str(group.english_level) if group and group.english_level else None

    return ApproveStudentResponse(
        success=True,
        message="Student approved successfully.",
        student=ApprovedStudentData(
            id=profile.id,
            first_name=first_name,
            last_name=last_name,
            username=user.username,
            group_id=group.id if group else None,
            group_name=group.name if group else None,
            english_level=level_str,
            approval_status="APPROVED",
            is_active=True,
        ),
    )


@router.post("/{student_id}/reject", response_model=RejectStudentResponse)
async def reject_student(
    student_id: uuid.UUID,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Teacher rejects a pending student."""
    res = await db.execute(
        select(StudentProfile, User, Group)
        .join(User, StudentProfile.user_id == User.id)
        .outerjoin(Group, StudentProfile.group_id == Group.id)
        .where(or_(StudentProfile.id == student_id, StudentProfile.user_id == student_id, User.id == student_id))
    )
    row = res.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STUDENT_NOT_FOUND", "message": "Student not found."},
        )

    profile, user, group = row

    if user.role != UserRole.STUDENT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_APPROVAL_STATE", "message": "Student cannot be rejected from the current state."},
        )

    is_authorized = group is not None and (
        group.created_by == current_user.id
        or (group.created_by is None and current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL)
    )
    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STUDENT_NOT_FOUND", "message": "Student not found."},
        )

    if user.approval_status == ApprovalStatus.REJECTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ALREADY_REJECTED", "message": "Student is already rejected."},
        )
    if user.approval_status == ApprovalStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ALREADY_APPROVED", "message": "Student is already approved."},
        )
    if user.approval_status != ApprovalStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_APPROVAL_STATE", "message": "Student cannot be rejected from the current state."},
        )

    user.approval_status = ApprovalStatus.REJECTED
    user.is_active = False
    await db.commit()
    await db.refresh(user)

    return RejectStudentResponse(
        success=True,
        message="Student rejected successfully.",
        student=RejectedStudentData(
            id=profile.id,
            approval_status="REJECTED",
            is_active=False,
        ),
    )


@router.post("/{student_id}/approval", response_model=StudentListItem)
async def handle_student_approval(
    student_id: uuid.UUID,
    body: StudentApprovalAction,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Teacher approves or rejects a pending student (compatibility endpoint)."""
    res = await db.execute(
        select(StudentProfile, User, Group)
        .join(User, StudentProfile.user_id == User.id)
        .outerjoin(Group, StudentProfile.group_id == Group.id)
        .where(or_(StudentProfile.id == student_id, StudentProfile.user_id == student_id, User.id == student_id))
    )
    row = res.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STUDENT_NOT_FOUND", "message": "Student not found."},
        )

    profile, user, group = row

    is_authorized = group is not None and (
        group.created_by == current_user.id
        or (group.created_by is None and current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL)
    )
    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "STUDENT_NOT_FOUND", "message": "Student not found."},
        )

    action = body.action.strip().lower()
    if action == "approve":
        if user.approval_status == ApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_APPROVED", "message": "Student is already approved."},
            )
        user.approval_status = ApprovalStatus.APPROVED
        user.is_active = True
    elif action == "reject":
        if user.approval_status == ApprovalStatus.REJECTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "ALREADY_REJECTED", "message": "Student is already rejected."},
            )
        user.approval_status = ApprovalStatus.REJECTED
        user.is_active = False
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Action must be 'approve' or 'reject'")

    await db.commit()
    await db.refresh(user)

    return StudentListItem(
        id=profile.id,
        user_id=profile.user_id,
        full_name=profile.full_name,
        email=user.email,
        username=user.username,
        phone=profile.phone,
        telegram_username=profile.phone,
        is_active=user.is_active,
        approval_status=user.approval_status.value,
        total_stars=profile.total_stars,
        total_lightning=getattr(profile, "total_lightning", 0),
        group_id=group.id if group else None,
        group_name=group.name if group else None,
        level=group.english_level.value if group and hasattr(group.english_level, "value") else None,
        created_at=user.created_at,
    )


@router.get("/me", response_model=StudentOut)
async def get_my_profile(
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group), selectinload(StudentProfile.user))
        .where(StudentProfile.id == profile.id)
    )
    full_profile = result.scalar_one()
    return StudentOut(
        id=full_profile.id,
        user_id=full_profile.user_id,
        email=full_profile.user.email,
        username=full_profile.user.username,
        full_name=full_profile.full_name,
        phone=full_profile.phone,
        bio=full_profile.bio,
        avatar_url=full_profile.avatar_url,
        is_active=full_profile.user.is_active,
        total_stars=full_profile.total_stars,
        group=full_profile.group,
        created_at=full_profile.created_at,
    )


@router.patch("/me", response_model=StudentOut)
async def update_my_student_profile(
    body: StudentUpdate,
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group), selectinload(StudentProfile.user))
        .where(StudentProfile.id == profile.id)
    )
    full_profile = result.scalar_one()

    # Students cannot change their own group or active status
    if body.full_name is not None:
        full_profile.full_name = body.full_name
    if body.phone is not None:
        raw_phone = body.phone.strip()
        if raw_phone and not raw_phone.startswith("@") and not raw_phone.startswith("+"):
            raw_phone = f"@{raw_phone}"
        full_profile.phone = raw_phone or None
    if body.bio is not None:
        full_profile.bio = body.bio

    await db.commit()
    await db.refresh(full_profile, attribute_names=["group", "user"])

    return StudentOut(
        id=full_profile.id,
        user_id=full_profile.user_id,
        email=full_profile.user.email,
        username=full_profile.user.username,
        full_name=full_profile.full_name,
        phone=full_profile.phone,
        bio=full_profile.bio,
        avatar_url=full_profile.avatar_url,
        is_active=full_profile.user.is_active,
        total_stars=full_profile.total_stars,
        group=full_profile.group,
        created_at=full_profile.created_at,
    )


@router.get("/{student_id}", response_model=StudentOut)
async def get_student(
    student_id: uuid.UUID,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group), selectinload(StudentProfile.user))
        .where(StudentProfile.id == student_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    # Scope check: if group belongs to another teacher, deny
    if profile.group and profile.group.created_by and profile.group.created_by != current_user.id:
        if not (profile.group.created_by is None and current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this student")

    return StudentOut(
        id=profile.id,
        user_id=profile.user_id,
        email=profile.user.email,
        username=profile.user.username,
        full_name=profile.full_name,
        phone=profile.phone,
        telegram_username=profile.phone,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        is_active=profile.user.is_active,
        approval_status=profile.user.approval_status.value if hasattr(profile.user.approval_status, "value") else str(profile.user.approval_status),
        total_stars=profile.total_stars,
        total_lightning=getattr(profile, "total_lightning", 0) or 0,
        group=profile.group,
        created_at=profile.created_at,
    )


@router.get("/{student_id}/history", response_model=StudentHistoryOut)
async def get_student_history(
    student_id: uuid.UUID,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """Teacher views student's complete historical learning & task record.
    Preserves all historical assignments, submissions, grades, and completion percentages.
    """
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group), selectinload(StudentProfile.user))
        .where(StudentProfile.id == student_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    if profile.group and profile.group.created_by and profile.group.created_by != current_user.id:
        if not (profile.group.created_by is None and current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this student")

    history_items: list[StudentHistoryItem] = []
    if profile.group_id:
        # Load all assignments for this group, newest first
        assignments_res = await db.execute(
            select(Assignment)
            .where(Assignment.group_id == profile.group_id)
            .order_by(Assignment.created_at.desc())
        )
        assignments = assignments_res.scalars().all()

        assignment_ids = [a.id for a in assignments]
        submissions_map: dict[uuid.UUID, Submission] = {}
        if assignment_ids:
            subs_res = await db.execute(
                select(Submission)
                .options(selectinload(Submission.grade))
                .where(Submission.assignment_id.in_(assignment_ids), Submission.student_id == profile.id)
            )
            for s in subs_res.scalars().all():
                submissions_map[s.assignment_id] = s

        for a in assignments:
            sub = submissions_map.get(a.id)
            comp_pct = 0
            sub_id = None
            sub_status = None
            sub_at = None
            score = None
            feedback = None
            stars_earned = 0
            text_ans = None
            file_name = None

            if sub is not None:
                sub_id = sub.id
                sub_status = sub.status.value
                sub_at = sub.submitted_at
                text_ans = sub.text_answer
                file_name = sub.file_original_name
                if sub.grade is not None:
                    score = sub.grade.score
                    feedback = sub.grade.feedback
                    stars_earned = sub.grade.stars
                    comp_pct = min(100, max(0, int((sub.grade.score / 10.0) * 100)))
                else:
                    comp_pct = 100

            history_items.append(
                StudentHistoryItem(
                    assignment_id=a.id,
                    title=a.title,
                    assignment_type="homework",
                    assigned_date=a.created_at,
                    deadline=a.deadline,
                    completion_percentage=comp_pct,
                    submission_id=sub_id,
                    submission_status=sub_status,
                    submitted_at=sub_at,
                    score=score,
                    feedback=feedback,
                    stars_earned=stars_earned,
                    text_answer=text_ans,
                    file_original_name=file_name,
                )
            )

    grp = profile.group
    return StudentHistoryOut(
        student_id=profile.id,
        full_name=profile.full_name,
        username=profile.user.username,
        telegram_username=profile.phone,
        level=grp.english_level.value if grp and hasattr(grp.english_level, "value") else None,
        group_name=grp.name if grp else None,
        total_stars=profile.total_stars,
        total_lightning=getattr(profile, "total_lightning", 0),
        history=history_items,
    )


@router.patch("/{student_id}", response_model=StudentOut, dependencies=[Depends(require_teacher)])
async def update_student(student_id: uuid.UUID, body: StudentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.group), selectinload(StudentProfile.user))
        .where(StudentProfile.id == student_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    if body.group_id is not None:
        group = (await db.execute(select(Group).where(Group.id == body.group_id))).scalar_one_or_none()
        if group is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile, attribute_names=["group", "user"])
    return StudentOut(
        id=profile.id,
        user_id=profile.user_id,
        email=profile.user.email,
        full_name=profile.full_name,
        phone=profile.phone,
        is_active=profile.user.is_active,
        total_stars=profile.total_stars,
        group=profile.group,
        created_at=profile.created_at,
    )


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_teacher)])
async def delete_student(student_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Permanently deletes student profile and user account."""
    profile = (
        await db.execute(select(StudentProfile).where(StudentProfile.id == student_id))
    ).scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    user = (await db.execute(select(User).where(User.id == profile.user_id))).scalar_one_or_none()
    if user:
        await db.delete(user)
    else:
        await db.delete(profile)
    await db.commit()
    return None


@router.post("/{student_id}/reset-password", response_model=StudentResetPasswordResponse, dependencies=[Depends(require_teacher)])
async def reset_student_password(
    student_id: uuid.UUID,
    body: StudentResetPasswordRequest,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Teacher resets student password directly.
    Scoped to teacher's group.
    Hashes new temporary password with Argon2id/bcrypt.
    Revokes any active refresh tokens for the student.
    Never exposes or logs plain text passwords.
    """
    res = await db.execute(
        select(StudentProfile, User, Group)
        .join(User, StudentProfile.user_id == User.id)
        .outerjoin(Group, StudentProfile.group_id == Group.id)
        .where(or_(StudentProfile.id == student_id, StudentProfile.user_id == student_id, User.id == student_id))
    )
    row = res.first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    profile, user, group = row

    is_authorized = group is not None and (
        group.created_by == current_user.id
        or (group.created_by is None and current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL)
    )
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this student")

    # Hash new password
    user.password_hash = hash_password(body.new_password)

    # Invalidate existing refresh tokens for security
    tokens = (
        await db.execute(select(RefreshToken).where(RefreshToken.user_id == user.id))
    ).scalars().all()
    for t in tokens:
        t.revoked = True

    await db.commit()

    return StudentResetPasswordResponse(
        success=True,
        message="Password reset successfully. Student can now log in with the new password.",
    )

