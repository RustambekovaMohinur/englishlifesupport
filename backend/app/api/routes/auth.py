import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.group import Group
from app.models.refresh_token import RefreshToken
from app.models.student import StudentProfile
from app.models.user import ApprovalStatus, User, UserRole
from app.schemas.auth import (
    AccessTokenResponse,
    CurrentUser,
    GroupPublicOut,
    LoginRequest,
    RegisterRequest,
    RegisterResponse,
    TokenResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _issue_tokens(db: AsyncSession, user: User, user_agent: str | None) -> TokenResponse:
    access_token = create_access_token(str(user.id), user.role.value)
    refresh_token, jti = create_refresh_token(str(user.id), user.role.value)

    db.add(
        RefreshToken(
            user_id=user.id,
            jti=jti,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            user_agent=(user_agent or "")[:255],
        )
    )
    await db.commit()
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.get("/groups/public", response_model=list[GroupPublicOut])
async def list_public_groups(db: AsyncSession = Depends(get_db)):
    """Public endpoint to fetch active groups for student registration."""
    query = select(Group).where(Group.is_active.is_(True)).order_by(Group.name)
    groups = (await db.execute(query)).scalars().all()
    return groups


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Public self-registration for STUDENTS. Requires valid existing group_id.
    """
    # Validate required fields
    username = body.username.strip()
    email = (body.email or f"{username.lower()}@englishlife.local").strip().lower()
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")

    # Verify group exists
    if not body.group_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group selection is required")
    group = (await db.execute(select(Group).where(Group.id == body.group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected group does not exist")

    # Check case‑insensitive uniqueness for username
    existing_user = await db.execute(select(User).where(func.lower(User.username) == username.lower()))
    if existing_user.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already taken")

    # Ensure email is unique (existing constraint)
    existing_email = await db.execute(select(User).where(User.email == email))
    if existing_email.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(body.password),
        role=UserRole.STUDENT,
        approval_status=ApprovalStatus.PENDING,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already registered")

    profile = StudentProfile(
        user_id=user.id,
        full_name=body.effective_full_name,
        phone=body.effective_telegram or None,
        group_id=body.group_id,
    )
    db.add(profile)
    await db.commit()

    return {
        "status": "pending",
        "message": "Your request has been sent to your teacher. Access will be granted once approved.",
        "access_token": "",
        "refresh_token": "",
    }


@router.post("/login", response_model=TokenResponse)
@limiter.limit("60/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    login_input = (body.username or body.email or "").strip().lower()
    result = await db.execute(
        select(User).where(or_(func.lower(User.username) == login_input, func.lower(User.email) == login_input))
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    if user.approval_status != ApprovalStatus.APPROVED:
        if user.approval_status == ApprovalStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "ACCOUNT_PENDING_APPROVAL", "message": "Your account is waiting for teacher approval."},
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "ACCOUNT_REJECTED", "message": "Your account has been rejected."},
            )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    return await _issue_tokens(db, user, request.headers.get("user-agent"))


@router.post("/refresh", response_model=AccessTokenResponse)
@limiter.limit("60/minute")
async def refresh(request: Request, body: dict, db: AsyncSession = Depends(get_db)):
    """
    Accepts {"refresh_token": "..."}. Validates the token signature/expiry,
    then checks the jti still exists and is not revoked in the DB (so a
    logged-out or rotated token cannot be replayed even if not yet expired).
    """
    raw_token = body.get("refresh_token")
    if not raw_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="refresh_token is required")

    try:
        payload = decode_token(raw_token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    jti = payload.get("jti")
    user_id = payload.get("sub")
    result = await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
    stored = result.scalar_one_or_none()

    if stored is None or stored.revoked or stored.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token no longer valid")

    user_result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = user_result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    new_access_token = create_access_token(str(user.id), user.role.value)
    return AccessTokenResponse(access_token=new_access_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: dict, db: AsyncSession = Depends(get_db)):
    """Revokes the given refresh token so it can no longer be used."""
    raw_token = body.get("refresh_token")
    if not raw_token:
        return
    try:
        payload = decode_token(raw_token)
    except JWTError:
        return
    jti = payload.get("jti")
    result = await db.execute(select(RefreshToken).where(RefreshToken.jti == jti))
    stored = result.scalar_one_or_none()
    if stored is not None:
        stored.revoked = True
        await db.commit()
    return


@router.get("/me", response_model=CurrentUser)
async def me(current_user: User = Depends(get_current_user)):
    return current_user
