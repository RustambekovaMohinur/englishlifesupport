import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
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
from app.models.user import User, UserRole
from app.schemas.auth import (
    AccessTokenResponse,
    CurrentUser,
    GroupPublicOut,
    LoginRequest,
    RegisterRequest,
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


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Public self-registration for STUDENTS. Requires valid existing group_id.
    """
    username = body.effective_username.strip().lower()
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required")
    
    # Verify group exists
    if not body.group_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group selection is required")
        
    group = (await db.execute(select(Group).where(Group.id == body.group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected group does not exist")

    existing = await db.execute(select(User).where(User.email == username))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already registered")

    user = User(email=username, password_hash=hash_password(body.password), role=UserRole.STUDENT)
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already registered")

    profile = StudentProfile(user_id=user.id, full_name=body.full_name, phone=body.phone, group_id=body.group_id)
    db.add(profile)
    await db.commit()

    return await _issue_tokens(db, user, request.headers.get("user-agent"))


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    username = (body.username or body.email or "").strip().lower()
    result = await db.execute(select(User).where(User.email == username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    return await _issue_tokens(db, user, request.headers.get("user-agent"))


@router.post("/refresh", response_model=AccessTokenResponse)
@limiter.limit("30/minute")
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
