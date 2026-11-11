import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
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
    AdminLoginRequest,
    CurrentUser,
    GroupPublicOut,
    LoginRequest,
    RegisterRequest,
    RegisterResponse,
    TeacherPublicOut,
    TokenResponse,
)
from app.models.teacher import TeacherProfile

router = APIRouter(prefix="/auth", tags=["auth"])


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


@router.post("/admin/login")
async def admin_login(body: AdminLoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Super Admin authentication endpoint.
    Accepts master credentials:
    username: admin2010 / admin / admin2010@englishlife.uz
    password: admin17 / admin2010, or verified against seeded admin password hash
    """
    clean_u = (body.username or "").strip().lower()
    clean_p = (body.password or "").strip()

    valid_usernames = {"admin2010", "admin", "admin2010@englishlife.uz"}
    if clean_u not in valid_usernames:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid master admin credentials",
        )

    # Check database admin user if available
    admin_user = (await db.execute(
        select(User).where(or_(func.lower(User.username) == "admin2010", func.lower(User.email) == "admin2010@englishlife.uz"))
    )).scalars().first()

    is_authenticated = False
    if clean_p in ("admin17", "admin2010"):
        is_authenticated = True
    elif admin_user and admin_user.password_hash:
        is_authenticated = verify_password(clean_p, admin_user.password_hash)

    if not is_authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid master admin credentials",
        )

    target_sub = str(admin_user.id) if admin_user else "admin2010"
    access_token = create_access_token(target_sub, "admin")
    refresh_token, jti = create_refresh_token(target_sub, "admin")

    if admin_user:
        db.add(
            RefreshToken(
                user_id=admin_user.id,
                jti=jti,
                expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
                user_agent="Admin Portal",
            )
        )
        await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "role": "admin",
        "username": "admin2010",
        "full_name": "Super Admin",
    }


@router.get("/teachers/public", response_model=list[TeacherPublicOut])
@router.get("/public/teachers", response_model=list[TeacherPublicOut])
async def list_public_teachers(db: AsyncSession = Depends(get_db)):
    """Public endpoint to fetch active teachers for student registration."""
    query = (
        select(TeacherProfile)
        .join(User, TeacherProfile.user_id == User.id)
        .where(
            User.is_active.is_(True),
            func.lower(User.username) != "admin2010",
        )
        .order_by(TeacherProfile.full_name.asc())
    )
    teachers = (await db.execute(query)).scalars().all()
    return teachers


@router.get("/groups/public", response_model=list[GroupPublicOut])
async def list_public_groups(
    teacher_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint to fetch active groups for student registration, strictly isolating by teacher."""
    try:
        parsed_teacher_uuid: uuid.UUID | None = None
        if teacher_id and str(teacher_id).strip():
            try:
                parsed_teacher_uuid = uuid.UUID(str(teacher_id).strip())
            except Exception:
                parsed_teacher_uuid = None

        target_user_id: uuid.UUID | None = None
        teacher_prof: TeacherProfile | None = None
        if parsed_teacher_uuid:
            teacher_prof = (
                await db.execute(
                    select(TeacherProfile).where(
                        or_(TeacherProfile.id == parsed_teacher_uuid, TeacherProfile.user_id == parsed_teacher_uuid)
                    )
                )
            ).scalar_one_or_none()
            if teacher_prof:
                target_user_id = teacher_prof.user_id
            else:
                target_user_id = parsed_teacher_uuid

        # Fetch active groups, strictly isolated by teacher if teacher_id is provided
        query = select(Group).where(Group.is_active.is_(True))
        if target_user_id:
            query = query.where(Group.created_by == target_user_id)
        query = query.order_by(Group.name)
        groups = (await db.execute(query)).scalars().all()

        teachers = (await db.execute(select(TeacherProfile))).scalars().all()
        t_map = {t.user_id: t for t in teachers}
        t_id_map = {t.id: t for t in teachers}

        result = []
        for g in groups:
            t = t_map.get(g.created_by) or teacher_prof
            result.append(
                GroupPublicOut(
                    id=g.id,
                    name=g.name,
                    english_level=g.english_level,
                    schedule=g.schedule,
                    teacher_id=t.id if t else (parsed_teacher_uuid if parsed_teacher_uuid in t_id_map else None),
                    teacher_name=t.full_name if t else None,
                )
            )
        return result
    except Exception as exc:
        logger.exception("Error loading public groups: %s", exc)
        return []


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

    pwd_hash = await asyncio.to_thread(hash_password, body.password)
    user = User(
        username=username,
        email=email,
        password_hash=pwd_hash,
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


@router.options("/login", include_in_schema=False)
@router.options("/login/", include_in_schema=False)
async def login_options():
    return Response(status_code=200)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("60/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    try:
        raw_input = (body.username or body.email or "").strip()
        login_input = raw_input.lower()

        # Strip @ if someone pasted @username
        clean_identifier = login_input.lstrip("@")
        clean_username_only = clean_identifier.split("@")[0] if "@" in clean_identifier else clean_identifier

        # Super Admin accounts support (admin2010 / admin / admin17 / admin2010)
        if clean_username_only in ("admin2010", "admin") or login_input == "admin2010@englishlife.uz":
            admin_user = (await db.execute(
                select(User).where(or_(func.lower(User.username) == "admin2010", func.lower(User.email) == "admin2010@englishlife.uz"))
            )).scalars().first()

            clean_pwd = (body.password or "").strip()
            is_valid_admin = False
            if clean_pwd in ("admin17", "admin2010"):
                is_valid_admin = True
            elif admin_user and admin_user.password_hash:
                is_valid_admin = verify_password(clean_pwd, admin_user.password_hash)

            if is_valid_admin:
                if admin_user:
                    return await _issue_tokens(db, admin_user, request.headers.get("user-agent"))
                else:
                    access_token = create_access_token("admin2010", "admin")
                    refresh_token, _ = create_refresh_token("admin2010", "admin")
                    return TokenResponse(access_token=access_token, refresh_token=refresh_token)

        # Candidate identifiers to match against username or email
        identifiers = {login_input, clean_identifier, clean_username_only}
        # Common student typo fallback: e.g. fayowka <-> fayowkaa
        if clean_username_only == "fayowka":
            identifiers.add("fayowkaa")
            identifiers.add("fayowkaa@englishlife.local")
        elif clean_username_only == "fayowkaa":
            identifiers.add("fayowka")
            identifiers.add("fayowka@englishlife.local")

        conditions = []
        for ident in identifiers:
            conditions.append(func.lower(User.username) == ident)
            conditions.append(func.lower(User.email) == ident)

        result = await db.execute(
            select(User).where(or_(*conditions)).order_by(User.is_active.desc(), User.created_at.asc())
        )
        users = result.scalars().all()

        # Find the approved/active user first if multiple matches exist
        user = None
        if users:
            # Prioritize approved active user
            for u in users:
                if u.approval_status == ApprovalStatus.APPROVED and u.is_active:
                    user = u
                    break
            if not user:
                user = users[0]

        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")

        is_valid = await asyncio.to_thread(verify_password, body.password, user.password_hash)
        if not is_valid:
            if user.username == "admin2010" and body.password.strip() in ("admin17", "admin2010"):
                is_valid = True
            else:
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
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Login failed: {str(exc)}",
        )


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
    role_val = "admin" if (current_user.username == "admin2010" or getattr(current_user, "role", None) == "admin") else (current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role))
    return CurrentUser(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username or "",
        role=role_val,
        is_active=current_user.is_active,
    )
