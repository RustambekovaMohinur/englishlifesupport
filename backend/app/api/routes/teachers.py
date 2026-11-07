import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_teacher_profile, require_teacher, require_admin, get_current_user
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.refresh_token import RefreshToken
from app.models.teacher import TeacherProfile
from app.models.user import User
from app.schemas.auth import TokenResponse
from app.schemas.teacher import CreateTeacherRequest, PasswordChangeRequest, TeacherProfileOut, TeacherProfileUpdate
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
    """Lists all teachers registered in the LMS."""
    query = (
        select(TeacherProfile)
        .join(User, TeacherProfile.user_id == User.id)
        .order_by(TeacherProfile.full_name.asc())
    )
    profiles = (await db.execute(query)).scalars().all()
    results = []
    for p in profiles:
        u = (await db.execute(select(User).where(User.id == p.user_id))).scalar_one_or_none()
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
    Super Admin / Principal endpoint to register a new teacher.
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
    )