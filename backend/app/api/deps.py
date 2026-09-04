"""
Reusable auth dependencies used by every protected route.

CRITICAL SECURITY RULE: the frontend never tells us the role. We decode the
signed JWT issued by this server, then RE-VERIFY the user's role and active
status against the database on every request (not just trust the token
claim), so an admin deactivating/demoting a user takes effect immediately
rather than only after the access token expires.
"""
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.student import StudentProfile
from app.models.teacher import TeacherProfile
from app.models.user import ApprovalStatus, User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail={"code": "AUTHENTICATION_REQUIRED", "message": "Authentication required."},
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if token is None:
        raise CREDENTIALS_EXCEPTION
    try:
        payload = decode_token(token)
    except JWTError:
        raise CREDENTIALS_EXCEPTION

    if payload.get("type") != "access":
        raise CREDENTIALS_EXCEPTION

    user_id = payload.get("sub")
    if user_id is None:
        raise CREDENTIALS_EXCEPTION

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise CREDENTIALS_EXCEPTION

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()

    if user is None:
        raise CREDENTIALS_EXCEPTION
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
    if hasattr(user, "approval_status") and user.approval_status != ApprovalStatus.APPROVED:
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

    return user


async def require_teacher(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "TEACHER_REQUIRED", "message": "Teacher access required."},
        )
    return current_user


async def require_student(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student access required")
    return current_user


async def get_current_student_profile(
    current_user: User = Depends(require_student),
    db: AsyncSession = Depends(get_db),
) -> StudentProfile:
    result = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")
    return profile


async def get_current_teacher_profile(
    current_user: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db),
) -> TeacherProfile:
    result = await db.execute(select(TeacherProfile).where(TeacherProfile.user_id == current_user.id))
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher profile not found")
    return profile
