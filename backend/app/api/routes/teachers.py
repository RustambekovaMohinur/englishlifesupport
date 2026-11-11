import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_teacher_profile, require_teacher, require_admin, get_current_user
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.assignment import Assignment
from app.models.group import Group
from app.models.refresh_token import RefreshToken
from app.models.student import StudentProfile
from app.models.submission import Submission
from app.models.teacher import TeacherProfile
from app.models.user import User
from app.schemas.auth import TokenResponse
from app.schemas.teacher import (
    CreateTeacherRequest,
    PasswordChangeRequest,
    PendingApprovalUserOut,
    PlatformStatsResponse,
    ResetTeacherPasswordRequest,
    TeacherBreakdownItem,
    TeacherProfileOut,
    TeacherProfileUpdate,
    TeacherStatusUpdate,
)
from app.models.user import UserRole, ApprovalStatus
from app.utils.password_policy import validate_password_policy
from app.api.routes.auth import _issue_tokens

router = APIRouter(prefix="/teachers", tags=["teachers"])


@router.get("/me", response_model=TeacherProfileOut)
async def get_my_teacher_profile(
    profile: TeacherProfile = Depends(get_current_teacher_profile),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.id == profile.user_id))).scalar_one()
    return TeacherProfileOut(
        id=profile.id,
        user_id=profile.user_id,
        email=user.email,
        username=user.username,
        full_name=profile.full_name,
        phone=profile.phone,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        created_at=profile.created_at,
    )


@router.patch("/me")
async def update_my_teacher_profile(
    request: Request,
    body: TeacherProfileUpdate,
    current_user: User = Depends(require_teacher),
    profile: TeacherProfile = Depends(get_current_teacher_profile),
    db: AsyncSession = Depends(get_db),
):
    """
    Updates teacher profile. If email is being changed:
    - Requires current_password for re-authentication.
    - Checks email uniqueness (returns 409 if already taken).
    - Revokes existing refresh tokens and returns fresh tokens.
    """
    tokens_response: TokenResponse | None = None

    if body.full_name is not None:
        profile.full_name = body.full_name
    if body.phone is not None:
        profile.phone = body.phone
    if body.bio is not None:
        profile.bio = body.bio

    if body.email is not None and body.email.strip().lower() != current_user.email.lower():
        new_email = body.email.strip().lower()
        if not body.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required to change your email address",
            )
        if not verify_password(body.current_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid current password",
            )

        existing_user = (
            await db.execute(select(User).where(User.email == new_email, User.id != current_user.id))
        ).scalar_one_or_none()
        if existing_user is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email is already registered",
            )

        current_user.email = new_email

        # Revoke all existing refresh tokens for this user
        existing_tokens = (
            (await db.execute(select(RefreshToken).where(RefreshToken.user_id == current_user.id)))
            .scalars()
            .all()
        )
        for t in existing_tokens:
            t.revoked = True

        tokens_response = await _issue_tokens(db, current_user, request.headers.get("user-agent"))

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email is already registered",
        )

    await db.refresh(profile)
    await db.refresh(current_user)

    profile_out = TeacherProfileOut(
        id=profile.id,
        user_id=profile.user_id,
        email=current_user.email,
        full_name=profile.full_name,
        phone=profile.phone,
        created_at=profile.created_at,
    )

    if tokens_response:
        return {
            "profile": profile_out,
            "access_token": tokens_response.access_token,
            "refresh_token": tokens_response.refresh_token,
            "token_type": tokens_response.token_type,
        }

    return {"profile": profile_out}


@router.post("/me/password", status_code=status.HTTP_200_OK)
async def change_teacher_password(
    body: PasswordChangeRequest,
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
):
    """
    Changes teacher password after validating current password, confirmation matching,
    and enforcing password complexity policy. Revokes all active refresh tokens.
    """
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if body.new_password != body.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirm password do not match",
        )

    validate_password_policy(body.new_password)

    current_user.password_hash = hash_password(body.new_password)

    # Revoke all existing refresh tokens
    existing_tokens = (
        (await db.execute(select(RefreshToken).where(RefreshToken.user_id == current_user.id)))
        .scalars()
        .all()
    )
    for t in existing_tokens:
        t.revoked = True

    await db.commit()
    return {"message": "Password changed successfully"}


# ─── Super Admin: Teacher Management & Multi-Tenant Isolation ──────────────────

@router.get("", response_model=list[TeacherProfileOut], summary="[Admin/Teacher] List all teachers")
async def list_all_teachers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists all teachers registered in the LMS with cohort & student counts."""
    query = (
        select(TeacherProfile)
        .join(User, TeacherProfile.user_id == User.id)
        .order_by(TeacherProfile.full_name.asc())
    )
    profiles = (await db.execute(query)).scalars().all()
    results = []
    for p in profiles:
        u = (await db.execute(select(User).where(User.id == p.user_id))).scalar_one_or_none()
        
        # Calculate cohorts count for this teacher
        g_count = (await db.execute(
            select(func.count(Group.id)).where(Group.created_by == p.user_id, Group.is_active.is_(True))
        )).scalar() or 0

        # Calculate student count enrolled in this teacher's cohorts
        s_count = (await db.execute(
            select(func.count(StudentProfile.id))
            .join(Group, StudentProfile.group_id == Group.id)
            .where(Group.created_by == p.user_id)
        )).scalar() or 0

        results.append(
            TeacherProfileOut(
                id=p.id,
                user_id=p.user_id,
                email=u.email if u else "",
                username=u.username if u else "",
                full_name=p.full_name,
                phone=p.phone,
                bio=p.bio,
                avatar_url=p.avatar_url,
                created_at=p.created_at,
                is_active=u.is_active if u else True,
                group_count=g_count,
                student_count=s_count,
            )
        )
    return results


@router.post("", response_model=TeacherProfileOut, status_code=status.HTTP_201_CREATED, summary="[Admin] Add new teacher with real name & credentials")
async def create_new_teacher(
    body: CreateTeacherRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Super Admin endpoint to register a new teacher.
    Enforces password complexity, creates isolated teacher profile with real First & Last names.
    """
    clean_email = body.email.strip().lower()
    clean_username = body.username.strip().lower()
    full_name = f"{body.first_name.strip()} {body.last_name.strip()}".strip()

    # Uniqueness check
    existing_user = (
        await db.execute(
            select(User).where(
                (User.email == clean_email) | (User.username == clean_username)
            )
        )
    ).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email or username already exists.",
        )

    validate_password_policy(body.password)

    new_user = User(
        id=uuid.uuid4(),
        email=clean_email,
        username=clean_username,
        password_hash=hash_password(body.password),
        role=UserRole.TEACHER,
        approval_status=ApprovalStatus.APPROVED,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()

    new_profile = TeacherProfile(
        id=uuid.uuid4(),
        user_id=new_user.id,
        full_name=full_name,
        phone=body.phone,
        bio=body.bio,
    )
    db.add(new_profile)
    await db.commit()

    return TeacherProfileOut(
        id=new_profile.id,
        user_id=new_user.id,
        email=new_user.email,
        username=new_user.username,
        full_name=new_profile.full_name,
        phone=new_profile.phone,
        bio=new_profile.bio,
        avatar_url=new_profile.avatar_url,
        created_at=new_profile.created_at,
        is_active=True,
        group_count=0,
        student_count=0,
    )


@router.get("/platform-stats", response_model=PlatformStatsResponse, summary="[Admin] Global platform overview stats")
async def get_platform_stats(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Global system overview for Super Admin Command Center."""
    # Count teachers excluding master admin
    total_teachers = (await db.execute(
        select(func.count(User.id)).where(
            User.role == UserRole.TEACHER,
            func.lower(User.username) != "admin2010",
        )
    )).scalar() or 0

    total_students = (await db.execute(
        select(func.count(StudentProfile.id))
    )).scalar() or 0

    active_students = (await db.execute(
        select(func.count(StudentProfile.id))
        .join(User, StudentProfile.user_id == User.id)
        .where(User.is_active.is_(True), User.approval_status == ApprovalStatus.APPROVED)
    )).scalar() or 0

    pending_approvals = (await db.execute(
        select(func.count(User.id)).where(User.approval_status == ApprovalStatus.PENDING)
    )).scalar() or 0

    total_groups = (await db.execute(select(func.count(Group.id)))).scalar() or 0
    total_assignments = (await db.execute(select(func.count(Assignment.id)))).scalar() or 0
    total_submissions = (await db.execute(select(func.count(Submission.id)))).scalar() or 0

    # Teachers breakdown
    teacher_profiles = (await db.execute(
        select(TeacherProfile)
        .join(User, TeacherProfile.user_id == User.id)
        .where(func.lower(User.username) != "admin2010")
        .order_by(TeacherProfile.full_name.asc())
    )).scalars().all()

    breakdown = []
    for tp in teacher_profiles:
        u = (await db.execute(select(User).where(User.id == tp.user_id))).scalar_one_or_none()
        g_cnt = (await db.execute(
            select(func.count(Group.id)).where(Group.created_by == tp.user_id)
        )).scalar() or 0
        s_cnt = (await db.execute(
            select(func.count(StudentProfile.id))
            .join(Group, StudentProfile.group_id == Group.id)
            .where(Group.created_by == tp.user_id)
        )).scalar() or 0

        breakdown.append(
            TeacherBreakdownItem(
                id=tp.id,
                user_id=tp.user_id,
                full_name=tp.full_name,
                username=u.username if u else "",
                email=u.email if u else "",
                is_active=u.is_active if u else True,
                group_count=g_cnt,
                student_count=s_count if 's_count' in locals() else s_cnt,
            )
        )

    return PlatformStatsResponse(
        total_teachers=total_teachers,
        total_students=total_students,
        active_students=active_students,
        pending_approvals=pending_approvals,
        total_groups=total_groups,
        total_assignments=total_assignments,
        total_submissions=total_submissions,
        teachers_breakdown=breakdown,
    )


@router.post("/{teacher_id}/reset-password", summary="[Admin] Reset a teacher's password directly")
async def admin_reset_teacher_password(
    teacher_id: uuid.UUID,
    body: ResetTeacherPasswordRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Allows Super Admin to directly update credentials for any teacher."""
    # Find teacher by profile id or user id
    teacher_user = (await db.execute(
        select(User).where(
            or_(
                User.id == teacher_id,
                User.id == select(TeacherProfile.user_id).where(TeacherProfile.id == teacher_id).scalar_subquery(),
            )
        )
    )).scalars().first()

    if not teacher_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")

    validate_password_policy(body.new_password)
    teacher_user.password_hash = hash_password(body.new_password)

    # Revoke existing refresh tokens
    existing_tokens = (await db.execute(select(RefreshToken).where(RefreshToken.user_id == teacher_user.id))).scalars().all()
    for t in existing_tokens:
        t.revoked = True

    await db.commit()
    return {"message": f"Password reset successfully for teacher {teacher_user.username}"}


@router.patch("/{teacher_id}/status", summary="[Admin] Activate or deactivate a teacher")
async def admin_update_teacher_status(
    teacher_id: uuid.UUID,
    body: TeacherStatusUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Allows Super Admin to activate or deactivate a teacher account."""
    teacher_user = (await db.execute(
        select(User).where(
            or_(
                User.id == teacher_id,
                User.id == select(TeacherProfile.user_id).where(TeacherProfile.id == teacher_id).scalar_subquery(),
            )
        )
    )).scalars().first()

    if not teacher_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher not found")

    teacher_user.is_active = body.is_active
    await db.commit()
    return {"message": f"Teacher status updated to {'active' if body.is_active else 'deactivated'}"}


@router.get("/pending-approvals", response_model=list[PendingApprovalUserOut], summary="[Admin] View all pending user requests")
async def list_pending_approvals(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Lists all accounts (students and teachers) currently awaiting approval."""
    users = (await db.execute(
        select(User).where(User.approval_status == ApprovalStatus.PENDING).order_by(User.created_at.desc())
    )).scalars().all()

    results = []
    for u in users:
        full_name = u.username
        group_name = None
        teacher_name = None
        phone = None

        if u.role == UserRole.STUDENT:
            sp = (await db.execute(select(StudentProfile).where(StudentProfile.user_id == u.id))).scalar_one_or_none()
            if sp:
                full_name = sp.full_name
                phone = sp.phone
                if sp.group_id:
                    grp = (await db.execute(select(Group).where(Group.id == sp.group_id))).scalar_one_or_none()
                    if grp:
                        group_name = grp.name
                        # Find group's teacher
                        if grp.created_by:
                            tp = (await db.execute(select(TeacherProfile).where(TeacherProfile.user_id == grp.created_by))).scalar_one_or_none()
                            if tp:
                                teacher_name = tp.full_name
        elif u.role == UserRole.TEACHER:
            tp = (await db.execute(select(TeacherProfile).where(TeacherProfile.user_id == u.id))).scalar_one_or_none()
            if tp:
                full_name = tp.full_name
                phone = tp.phone

        results.append(
            PendingApprovalUserOut(
                id=u.id,
                user_id=u.id,
                role=u.role.value if hasattr(u.role, "value") else str(u.role),
                full_name=full_name,
                username=u.username,
                email=u.email,
                phone=phone,
                group_name=group_name,
                teacher_name=teacher_name,
                created_at=u.created_at,
            )
        )
    return results


@router.post("/approvals/{user_id}/approve", summary="[Admin] Approve a pending user account")
async def approve_user_account(
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Super Admin approves a pending user account."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.approval_status = ApprovalStatus.APPROVED
    user.is_active = True
    await db.commit()
    return {"success": True, "message": f"User {user.username} approved successfully."}


@router.post("/approvals/{user_id}/reject", summary="[Admin] Reject a pending user account")
async def reject_user_account(
    user_id: uuid.UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Super Admin rejects a pending user account."""
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.approval_status = ApprovalStatus.REJECTED
    user.is_active = False
    await db.commit()
    return {"success": True, "message": f"User {user.username} rejected."}
