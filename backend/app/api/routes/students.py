import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_student_profile, require_teacher
from app.core.config import settings
from app.db.session import get_db
from app.utils.datetimes import as_utc, utcnow
from app.models.assignment import Assignment, AssignmentStatus
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission
from app.models.user import ApprovalStatus, User, UserRole
from app.models.vocabulary import VocabularyAssignment, VocabularyAttempt
from app.schemas.student import (
    ApprovedStudentData,
    ApproveStudentResponse,
    PaginatedPendingStudents,
    PaginatedStudents,
    PendingStudentItem,
    RejectedStudentData,
    RejectStudentResponse,
    StudentApprovalAction,
    StudentGroupBrief,
    StudentHistoryItem,
    StudentHistoryOut,
    StudentListItem,
    StudentOut,
    StudentPlacementUpdate,
    StudentStatusUpdate,
    StudentUpdate,
)

from pydantic import BaseModel, Field
from app.core.security import hash_password
from app.models.refresh_token import RefreshToken

router = APIRouter(prefix="/api/students", tags=["students"])
teacher_students_router = APIRouter(prefix="/api/teacher/students", tags=["students"])
logger = logging.getLogger(__name__)


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
    page_size: int = Query(default=500, ge=1, le=1000),
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

    if group_id:
        if group_id not in teacher_group_ids:
            return PaginatedStudents(items=[], total=0, page=page, page_size=page_size)
        query = query.where(StudentProfile.group_id == group_id)
    elif teacher_group_ids:
        query = query.where(or_(StudentProfile.group_id.in_(teacher_group_ids), StudentProfile.group_id.is_(None)))

    if search:
        like = f"%{search.strip()}%"
        query = query.where(or_(
            StudentProfile.full_name.ilike(like),
            User.email.ilike(like),
            User.username.ilike(like),
        ))

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

    # Calculate active assignment counts and completed submissions for the fetched students
    st_ids = [profile.id for profile, *_ in rows]
    grp_ids = list({grp_id for *_, grp_id, _, _ in rows if grp_id})

    total_assignments_map: dict[uuid.UUID, int] = {}
    active_assign_ids_by_group: dict[uuid.UUID, set[uuid.UUID]] = {}
    if grp_ids:
        group_asgn_query = (
            select(Assignment.id, Assignment.group_id, Assignment.cycle_number, Group.current_cycle)
            .join(Group, Assignment.group_id == Group.id)
            .where(Assignment.group_id.in_(grp_ids), Assignment.status == AssignmentStatus.PUBLISHED)
        )
        group_asgn_res = await db.execute(group_asgn_query)
        all_published_by_group: dict[uuid.UUID, set[uuid.UUID]] = {}
        for a_id, gid, a_cycle, g_cycle in group_asgn_res.all():
            all_published_by_group.setdefault(gid, set()).add(a_id)
            if (a_cycle or 1) == (g_cycle or 1):
                active_assign_ids_by_group.setdefault(gid, set()).add(a_id)

        for gid in grp_ids:
            active_ids = active_assign_ids_by_group.get(gid, set())
            if not active_ids:
                active_ids = all_published_by_group.get(gid, set())
                active_assign_ids_by_group[gid] = active_ids
            total_assignments_map[gid] = len(active_ids)

    completed_submissions_map: dict[uuid.UUID, int] = {}
    if st_ids:
        all_active_a_ids = [aid for s in active_assign_ids_by_group.values() for aid in s]
        if all_active_a_ids:
            st_sub_query = (
                select(Submission.student_id, func.count(func.distinct(Submission.assignment_id)))
                .join(Assignment, Assignment.id == Submission.assignment_id)
                .where(
                    Submission.student_id.in_(st_ids),
                    Submission.assignment_id.in_(all_active_a_ids),
                    Submission.is_archived == False,
                    Submission.cycle_number == Assignment.cycle_number,
                )
                .group_by(Submission.student_id)
            )
            st_sub_res = await db.execute(st_sub_query)
            completed_submissions_map = {sid: count for sid, count in st_sub_res.all()}

    items = []
    for profile, email, username, is_active, appr_status, user_created_at, grp_id, grp_name, grp_level in rows:
        if grp_id is None:
            total_asgns = 0
            completed_asgns = 0
            pct = 0
            display_group_name = "Unassigned"
            group_brief = None
        else:
            total_asgns = total_assignments_map.get(grp_id, 0)
            completed_asgns = completed_submissions_map.get(profile.id, 0)
            if completed_asgns > total_asgns and total_asgns > 0:
                completed_asgns = total_asgns
            pct = int(round((completed_asgns / total_asgns) * 100)) if total_asgns > 0 else 0
            display_group_name = grp_name or "Unassigned"
            group_brief = StudentGroupBrief(
                id=grp_id,
                name=grp_name or "Unassigned",
                english_level=grp_level.value if hasattr(grp_level, "value") else str(grp_level) if grp_level else "beginner",
            )

        items.append(
            StudentListItem(
                id=profile.id,
                user_id=profile.user_id,
                full_name=profile.full_name or "Unknown",
                email=email or "",
                username=username or "",
                phone=profile.phone,
                telegram_username=profile.phone,
                avatar_url=profile.avatar_url,
                is_active=is_active if is_active is not None else True,
                approval_status=appr_status.value if hasattr(appr_status, "value") else str(appr_status) if appr_status else "approved",
                total_stars=profile.total_stars or 0,
                total_lightning=getattr(profile, "total_lightning", 0) or 0,
                group_id=grp_id,
                group_name=display_group_name,
                level=grp_level.value if hasattr(grp_level, "value") else str(grp_level) if grp_level else None,
                created_at=user_created_at,
                completed_assignments_count=completed_asgns,
                total_assignments_count=total_asgns,
                overall_completion_percentage=pct,
                total_active_tasks=total_asgns,
                completed_tasks=completed_asgns,
                cycle_progress_percentage=pct,
                cycle_completed_tasks=completed_asgns,
                cycle_total_tasks=total_asgns,
                group=group_brief,
            )
        )
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
        .where(or_(StudentProfile.id == student_id, StudentProfile.user_id == student_id))
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
        email=profile.user.email if profile.user else "",
        username=profile.user.username if profile.user else "",
        full_name=profile.full_name or "Student Profile",
        phone=profile.phone,
        telegram_username=profile.phone,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        is_active=profile.user.is_active if profile.user else True,
        approval_status=profile.user.approval_status.value if profile.user and hasattr(profile.user.approval_status, "value") else str(profile.user.approval_status) if profile.user and profile.user.approval_status else "approved",
        total_stars=profile.total_stars or 0,
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
        .where(or_(StudentProfile.id == student_id, StudentProfile.user_id == student_id))
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    if profile.group and profile.group.created_by and profile.group.created_by != current_user.id:
        if not (profile.group.created_by is None and current_user.email == settings.BOOTSTRAP_TEACHER_EMAIL):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have access to this student")

    history_items: list[StudentHistoryItem] = []
    active_assignments: list[StudentHistoryItem] = []
    past_cycles: list[Any] = []
    cycle_completed_tasks = 0
    cycle_total_tasks = 0
    cycle_progress_percentage = 0

    if profile.group_id:
        grp = profile.group
        current_cycle = getattr(grp, "current_cycle", 1) or 1
        now_dt = utcnow()

        # Load all assignments for this group (published and archived), newest first
        assignments_res = await db.execute(
            select(Assignment)
            .where(
                Assignment.group_id == profile.group_id,
                Assignment.status.in_([AssignmentStatus.PUBLISHED, AssignmentStatus.ARCHIVED]),
            )
            .order_by(Assignment.created_at.desc())
        )
        assignments = assignments_res.scalars().all()

        current_cycle = getattr(grp, "current_cycle", 1) or 1
        cycle_matching = [
            a for a in assignments
            if a.status == AssignmentStatus.PUBLISHED and (getattr(a, "cycle_number", 1) or 1) == current_cycle
        ]
        active_assignments_list = cycle_matching if len(cycle_matching) > 0 else [
            a for a in assignments if a.status == AssignmentStatus.PUBLISHED
        ]
        active_assignment_ids = {a.id for a in active_assignments_list}
        cycle_total_tasks = len(active_assignments_list)

        assignment_map = {a.id: a for a in assignments}
        assignment_ids = [a.id for a in assignments]
        submissions_map: dict[uuid.UUID, Submission] = {}
        va_map: dict[uuid.UUID, VocabularyAttempt] = {}
        if assignment_ids:
            subs_res = await db.execute(
                select(Submission)
                .options(selectinload(Submission.grade))
                .where(
                    Submission.assignment_id.in_(assignment_ids),
                    Submission.student_id == profile.id,
                )
                .order_by(Submission.is_archived.asc(), Submission.submitted_at.desc(), Submission.id.desc())
            )
            for s in subs_res.scalars().all():
                target_assign = assignment_map.get(s.assignment_id)
                target_cycle = (getattr(target_assign, "cycle_number", 1) or 1) if target_assign else 1
                if (getattr(s, "cycle_number", 1) or 1) == target_cycle:
                    if s.assignment_id not in submissions_map:
                        submissions_map[s.assignment_id] = s

            va_res = await db.execute(
                select(VocabularyAssignment.assignment_id, VocabularyAttempt)
                .join(VocabularyAssignment, VocabularyAttempt.vocabulary_assignment_id == VocabularyAssignment.id)
                .where(
                    VocabularyAssignment.assignment_id.in_(assignment_ids),
                    VocabularyAttempt.student_id == profile.id,
                )
            )
            for a_id, va in va_res.all():
                va_map[a_id] = va

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
            is_active_task = a.id in active_assignment_ids

            if sub is not None:
                sub_id = sub.id
                sub_status = sub.status.value if hasattr(sub.status, "value") else str(sub.status)
                sub_at = sub.submitted_at
                text_ans = sub.text_answer
                file_name = sub.file_original_name
                is_unarchived = not getattr(sub, "is_archived", False)

                if is_unarchived:
                    if sub.grade is not None:
                        score = sub.grade.score
                        feedback = sub.grade.feedback
                        stars_earned = sub.grade.stars
                        comp_pct = min(100, max(0, int((sub.grade.score / 10.0) * 100)))
                    else:
                        comp_pct = 100

                    if is_active_task:
                        cycle_completed_tasks += 1
                else:
                    comp_pct = 0
                    sub_status = "archived"

            va_attempt = va_map.get(a.id)
            vocab_score = va_attempt.percentage if va_attempt else None
            vocab_attempts = getattr(va_attempt, "attempt_count", 1) if va_attempt else None

            item = StudentHistoryItem(
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
                vocab_score=vocab_score,
                vocab_attempt_count=vocab_attempts,
            )
            history_items.append(item)
            if is_active_task:
                active_assignments.append(item)
            else:
                past_cycles.append(item)

        cycle_progress_percentage = (
            int(round((cycle_completed_tasks / cycle_total_tasks) * 100))
            if cycle_total_tasks > 0
            else 0
        )

    grp = profile.group
    return StudentHistoryOut(
        student_id=profile.id,
        full_name=profile.full_name or "",
        username=profile.user.username if profile.user else "",
        telegram_username=profile.phone or "",
        level=grp.english_level.value if grp and hasattr(grp.english_level, "value") else (str(grp.english_level) if grp and grp.english_level else None),
        group_name=grp.name if grp else None,
        total_stars=profile.total_stars or 0,
        total_lightning=getattr(profile, "total_lightning", 0) or 0,
        cycle_completed_tasks=cycle_completed_tasks,
        cycle_total_tasks=cycle_total_tasks,
        cycle_progress_percentage=cycle_progress_percentage,
        active_assignments=active_assignments,
        past_cycles=past_cycles,
        history=history_items,
    )


@router.patch("/{student_id}", response_model=StudentOut, dependencies=[Depends(require_teacher)])
@teacher_students_router.patch("/{student_id}", response_model=StudentOut, dependencies=[Depends(require_teacher)])
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


@router.put("/{student_id}/placement", response_model=StudentOut, dependencies=[Depends(require_teacher)])
@teacher_students_router.put("/{student_id}/placement", response_model=StudentOut, dependencies=[Depends(require_teacher)])
async def update_student_placement(
    student_id: uuid.UUID,
    body: StudentPlacementUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Updates student group placement without resetting their stars, submissions or achievements."""
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
        profile.group_id = group.id
    else:
        profile.group_id = None

    await db.commit()
    await db.refresh(profile, attribute_names=["group", "user"])
    return StudentOut(
        id=profile.id,
        user_id=profile.user_id,
        email=profile.user.email,
        username=profile.user.username,
        full_name=profile.full_name,
        phone=profile.phone,
        telegram_username=profile.phone,
        is_active=profile.user.is_active,
        total_stars=profile.total_stars,
        total_lightning=getattr(profile, "total_lightning", 0) or 0,
        group=profile.group,
        created_at=profile.created_at,
    )


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_teacher)])
@teacher_students_router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_teacher)])
async def delete_student(student_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Permanently and safely deletes student profile and user account with comprehensive cascade cleanup.
    404 Resilient: If student is already absent (already deleted), returns 204 No Content safely.
    """
    # 1. Lookup student profile by either StudentProfile.id or StudentProfile.user_id
    profile = (
        await db.execute(
            select(StudentProfile).where(
                or_(StudentProfile.id == student_id, StudentProfile.user_id == student_id)
            )
        )
    ).scalar_one_or_none()

    user = None
    if profile:
        user = (await db.execute(select(User).where(User.id == profile.user_id))).scalar_one_or_none()
    else:
        # Check if student_id is directly a User.id
        user = (await db.execute(select(User).where(User.id == student_id))).scalar_one_or_none()
        if user:
            profile = (await db.execute(select(StudentProfile).where(StudentProfile.user_id == user.id))).scalar_one_or_none()

    # 404 Resilience: If student is already absent (already deleted), return safe 204 No Content
    if not profile and not user:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    sid = profile.id if profile else None
    uid = user.id if user else (profile.user_id if profile else None)

    # 2. Comprehensive child-to-parent cascade deletion in strict foreign key order
    try:
        if sid:
            # Submissions cascade:
            # - AI feedbacks
            await db.execute(text("DELETE FROM submission_ai_feedbacks WHERE submission_id IN (SELECT id FROM submissions WHERE student_id = :sid)"), {"sid": sid})
            # - Images
            await db.execute(text("DELETE FROM submission_images WHERE submission_id IN (SELECT id FROM submissions WHERE student_id = :sid)"), {"sid": sid})
            # - Corrections
            await db.execute(text("DELETE FROM submission_corrections WHERE submission_id IN (SELECT id FROM submissions WHERE student_id = :sid)"), {"sid": sid})
            # - Comments
            await db.execute(text("DELETE FROM submission_comments WHERE submission_id IN (SELECT id FROM submissions WHERE student_id = :sid)"), {"sid": sid})
            # - Grades
            await db.execute(text("DELETE FROM grades WHERE submission_id IN (SELECT id FROM submissions WHERE student_id = :sid)"), {"sid": sid})
            # - Submissions themselves
            await db.execute(text("DELETE FROM submissions WHERE student_id = :sid"), {"sid": sid})

            # Vocabulary & Gamification:
            # - Vocabulary answers & attempts
            await db.execute(text("DELETE FROM vocabulary_answers WHERE attempt_id IN (SELECT id FROM vocabulary_attempts WHERE student_id = :sid)"), {"sid": sid})
            await db.execute(text("DELETE FROM vocabulary_attempts WHERE student_id = :sid"), {"sid": sid})
            # - Wordlist quiz attempts
            await db.execute(text("DELETE FROM wordlist_quiz_attempts WHERE student_id = :sid"), {"sid": sid})
            # - Star & XP transactions
            await db.execute(text("DELETE FROM star_transactions WHERE student_id = :sid"), {"sid": sid})
            await db.execute(text("DELETE FROM xp_transactions WHERE student_id = :sid"), {"sid": sid})
            await db.execute(text("DELETE FROM student_xp WHERE student_id = :sid"), {"sid": sid})
            await db.execute(text("DELETE FROM student_streaks WHERE student_id = :sid"), {"sid": sid})
            await db.execute(text("DELETE FROM free_passes WHERE student_id = :sid"), {"sid": sid})
            await db.execute(text("DELETE FROM achievements WHERE student_id = :sid"), {"sid": sid})
            # - Teacher desk overrides & honours
            await db.execute(text("DELETE FROM task_lock_overrides WHERE student_id = :sid"), {"sid": sid})
            await db.execute(text("DELETE FROM student_of_the_week WHERE student_id = :sid"), {"sid": sid})

        if uid:
            # User-level records:
            await db.execute(text("DELETE FROM assignment_comments WHERE user_id = :uid"), {"uid": uid})
            await db.execute(text("DELETE FROM feedback_likes WHERE user_id = :uid"), {"uid": uid})
            await db.execute(text("DELETE FROM feedback_replies WHERE user_id = :uid"), {"uid": uid})
            await db.execute(text("DELETE FROM platform_feedbacks WHERE user_id = :uid"), {"uid": uid})
            await db.execute(text("DELETE FROM refresh_tokens WHERE user_id = :uid"), {"uid": uid})

        # Finally, delete student profile and user row
        if sid:
            await db.execute(text("DELETE FROM student_profiles WHERE id = :sid"), {"sid": sid})
        if uid:
            await db.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": uid})

        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to delete student %s: %s", student_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete student due to database constraint: {str(e)}",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)



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

