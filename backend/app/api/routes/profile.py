import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.file_blob import FileBlob
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission, SubmissionStatus
from app.models.teacher import TeacherProfile
from app.models.user import User, UserRole
from app.schemas.profile import UserProfileOut, UserProfileUpdate
from app.utils.files import (
    get_upload_root,
    resolve_profile_avatar,
    save_avatar_file,
)

router = APIRouter(prefix="/api/profile", tags=["profile"])


def _split_full_name(full_name: str) -> tuple[str, str]:
    parts = (full_name or "").strip().split(maxsplit=1)
    if len(parts) == 2:
        return parts[0], parts[1]
    if len(parts) == 1:
        return parts[0], ""
    return "", ""


async def _get_student_stats(db: AsyncSession, student_profile: StudentProfile) -> dict[str, int | float]:
    total_submissions = (
        await db.execute(
            select(func.count()).select_from(Submission).where(Submission.student_id == student_profile.id)
        )
    ).scalar_one()

    graded_submissions = (
        (
            await db.execute(
                select(Submission)
                .options(selectinload(Submission.grade))
                .where(
                    Submission.student_id == student_profile.id,
                    Submission.status == SubmissionStatus.GRADED,
                )
            )
        )
        .scalars()
        .all()
    )

    avg_score = 0.0
    if graded_submissions:
        scores = [s.grade.score for s in graded_submissions if s.grade is not None]
        if scores:
            avg_score = round(sum(scores) / len(scores), 1)

    return {
        "total_stars": student_profile.total_stars,
        "total_submissions": total_submissions,
        "graded_submissions": len(graded_submissions),
        "average_score": avg_score,
    }


async def _get_teacher_stats(db: AsyncSession) -> dict[str, int]:
    total_students = (await db.execute(select(func.count()).select_from(StudentProfile))).scalar_one()
    total_groups = (
        await db.execute(select(func.count()).select_from(Group).where(Group.is_active.is_(True)))
    ).scalar_one()
    total_assignments = (
        await db.execute(select(func.count()).select_from(Assignment).where(Assignment.status == AssignmentStatus.PUBLISHED))
    ).scalar_one()
    pending_submissions = (
        await db.execute(
            select(func.count()).select_from(Submission).where(Submission.status != SubmissionStatus.GRADED)
        )
    ).scalar_one()

    return {
        "total_students": total_students,
        "total_groups": total_groups,
        "total_assignments": total_assignments,
        "pending_submissions": pending_submissions,
    }


@router.get("/me", response_model=UserProfileOut)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == UserRole.STUDENT:
        res = await db.execute(
            select(StudentProfile)
            .options(selectinload(StudentProfile.group))
            .where(StudentProfile.user_id == current_user.id)
        )
        profile = res.scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")

        first_name, last_name = _split_full_name(profile.full_name)
        stats = await _get_student_stats(db, profile)
        return UserProfileOut(
            id=profile.id,
            user_id=current_user.id,
            role=current_user.role.value,
            username=current_user.username,
            email=current_user.email,
            full_name=profile.full_name,
            first_name=first_name,
            last_name=last_name,
            phone=profile.phone,
            telegram_username=profile.phone,
            bio=profile.bio,
            avatar_url=profile.avatar_url,
            stats=stats,
            group_name=profile.group.name if profile.group else None,
            english_level=profile.group.english_level.value if profile.group and hasattr(profile.group.english_level, "value") else (str(profile.group.english_level) if profile.group and profile.group.english_level else None),
            approval_status=current_user.approval_status.value if hasattr(current_user.approval_status, "value") else str(current_user.approval_status),
            total_stars=getattr(profile, "total_stars", 0),
            total_lightning=getattr(profile, "total_lightning", 0),
        )

    # Teacher
    res = await db.execute(select(TeacherProfile).where(TeacherProfile.user_id == current_user.id))
    profile = res.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher profile not found")

    first_name, last_name = _split_full_name(profile.full_name)
    stats = await _get_teacher_stats(db)
    return UserProfileOut(
        id=profile.id,
        user_id=current_user.id,
        role=current_user.role.value,
        username=current_user.username,
        email=current_user.email,
        full_name=profile.full_name,
        first_name=first_name,
        last_name=last_name,
        phone=profile.phone,
        telegram_username=profile.phone,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        stats=stats,
        approval_status=current_user.approval_status.value if hasattr(current_user.approval_status, "value") else str(current_user.approval_status),
    )


@router.patch("/me", response_model=UserProfileOut)
async def update_my_profile(
    body: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role == UserRole.STUDENT:
        res = await db.execute(
            select(StudentProfile)
            .options(selectinload(StudentProfile.group))
            .where(StudentProfile.user_id == current_user.id)
        )
        profile = res.scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")

        # Update full_name / first_name / last_name
        if body.first_name is not None and body.last_name is not None:
            profile.full_name = f"{body.first_name.strip()} {body.last_name.strip()}"
        elif body.full_name is not None:
            profile.full_name = body.full_name.strip()
        elif body.first_name is not None:
            _, old_last = _split_full_name(profile.full_name)
            profile.full_name = f"{body.first_name.strip()} {old_last}".strip()
        elif body.last_name is not None:
            old_first, _ = _split_full_name(profile.full_name)
            profile.full_name = f"{old_first} {body.last_name.strip()}".strip()

        # Update telegram / phone
        if body.telegram_username is not None:
            raw = body.telegram_username.strip()
            if raw and not raw.startswith("@") and not raw.startswith("+"):
                raw = f"@{raw}"
            profile.phone = raw or None
        elif body.phone is not None:
            raw = body.phone.strip()
            if raw and not raw.startswith("@") and not raw.startswith("+"):
                raw = f"@{raw}"
            profile.phone = raw or None

        # Update bio
        if body.bio is not None:
            profile.bio = body.bio.strip() or None

        await db.commit()
        await db.refresh(profile)

        first_name, last_name = _split_full_name(profile.full_name)
        stats = await _get_student_stats(db, profile)
        return UserProfileOut(
            id=profile.id,
            user_id=current_user.id,
            role=current_user.role.value,
            username=current_user.username,
            email=current_user.email,
            full_name=profile.full_name,
            first_name=first_name,
            last_name=last_name,
            phone=profile.phone,
            telegram_username=profile.phone,
            bio=profile.bio,
            avatar_url=profile.avatar_url,
            stats=stats,
            group_name=profile.group.name if profile.group else None,
            english_level=profile.group.english_level.value if profile.group and hasattr(profile.group.english_level, "value") else (str(profile.group.english_level) if profile.group and profile.group.english_level else None),
            approval_status=current_user.approval_status.value if hasattr(current_user.approval_status, "value") else str(current_user.approval_status),
            total_stars=getattr(profile, "total_stars", 0),
            total_lightning=getattr(profile, "total_lightning", 0),
        )

    # Teacher
    res = await db.execute(select(TeacherProfile).where(TeacherProfile.user_id == current_user.id))
    profile = res.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher profile not found")

    if body.first_name is not None and body.last_name is not None:
        profile.full_name = f"{body.first_name.strip()} {body.last_name.strip()}"
    elif body.full_name is not None:
        profile.full_name = body.full_name.strip()
    elif body.first_name is not None:
        _, old_last = _split_full_name(profile.full_name)
        profile.full_name = f"{body.first_name.strip()} {old_last}".strip()
    elif body.last_name is not None:
        old_first, _ = _split_full_name(profile.full_name)
        profile.full_name = f"{old_first} {body.last_name.strip()}".strip()

    if body.telegram_username is not None:
        raw = body.telegram_username.strip()
        if raw and not raw.startswith("@") and not raw.startswith("+"):
            raw = f"@{raw}"
        profile.phone = raw or None
    elif body.phone is not None:
        raw = body.phone.strip()
        if raw and not raw.startswith("@") and not raw.startswith("+"):
            raw = f"@{raw}"
        profile.phone = raw or None

    if body.bio is not None:
        profile.bio = body.bio.strip() or None

    await db.commit()
    await db.refresh(profile)

    first_name, last_name = _split_full_name(profile.full_name)
    stats = await _get_teacher_stats(db)
    return UserProfileOut(
        id=profile.id,
        user_id=current_user.id,
        role=current_user.role.value,
        username=current_user.username,
        email=current_user.email,
        full_name=profile.full_name,
        first_name=first_name,
        last_name=last_name,
        phone=profile.phone,
        telegram_username=profile.phone,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        stats=stats,
        approval_status=current_user.approval_status.value if hasattr(current_user.approval_status, "value") else str(current_user.approval_status),
    )


@router.post("/me/avatar", response_model=UserProfileOut)
async def upload_my_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload or replace current user's profile photo."""
    relative_path, content_type, size_bytes = await save_avatar_file(file, current_user.id, db=db)
    avatar_url = f"/api/profile/{current_user.id}/avatar"

    if current_user.role == UserRole.STUDENT:
        res = await db.execute(
            select(StudentProfile)
            .options(selectinload(StudentProfile.group))
            .where(StudentProfile.user_id == current_user.id)
        )
        profile = res.scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")
        profile.avatar_url = avatar_url
        await db.commit()
        await db.refresh(profile)

        first_name, last_name = _split_full_name(profile.full_name)
        stats = await _get_student_stats(db, profile)
        return UserProfileOut(
            id=profile.id,
            user_id=current_user.id,
            role=current_user.role.value,
            username=current_user.username,
            email=current_user.email,
            full_name=profile.full_name,
            first_name=first_name,
            last_name=last_name,
            phone=profile.phone,
            telegram_username=profile.phone,
            bio=profile.bio,
            avatar_url=profile.avatar_url,
            stats=stats,
            group_name=profile.group.name if profile.group else None,
            english_level=profile.group.english_level if profile.group else None,
        )

    # Teacher
    res = await db.execute(select(TeacherProfile).where(TeacherProfile.user_id == current_user.id))
    profile = res.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher profile not found")
    profile.avatar_url = avatar_url
    await db.commit()
    await db.refresh(profile)

    first_name, last_name = _split_full_name(profile.full_name)
    stats = await _get_teacher_stats(db)
    return UserProfileOut(
        id=profile.id,
        user_id=current_user.id,
        role=current_user.role.value,
        username=current_user.username,
        email=current_user.email,
        full_name=profile.full_name,
        first_name=first_name,
        last_name=last_name,
        phone=profile.phone,
        telegram_username=profile.phone,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        stats=stats,
    )


@router.delete("/me/avatar", response_model=UserProfileOut)
async def remove_my_avatar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove current user's profile photo."""
    # Delete file from disk if present
    profile_dir = get_upload_root() / "profiles" / str(current_user.id)
    if profile_dir.exists():
        for f in profile_dir.glob("avatar.*"):
            f.unlink(missing_ok=True)

    if current_user.role == UserRole.STUDENT:
        res = await db.execute(
            select(StudentProfile)
            .options(selectinload(StudentProfile.group))
            .where(StudentProfile.user_id == current_user.id)
        )
        profile = res.scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")
        profile.avatar_url = None
        await db.commit()
        await db.refresh(profile)

        first_name, last_name = _split_full_name(profile.full_name)
        stats = await _get_student_stats(db, profile)
        return UserProfileOut(
            id=profile.id,
            user_id=current_user.id,
            role=current_user.role.value,
            username=current_user.username,
            email=current_user.email,
            full_name=profile.full_name,
            first_name=first_name,
            last_name=last_name,
            phone=profile.phone,
            telegram_username=profile.phone,
            bio=profile.bio,
            avatar_url=profile.avatar_url,
            stats=stats,
            group_name=profile.group.name if profile.group else None,
            english_level=profile.group.english_level if profile.group else None,
        )

    # Teacher
    res = await db.execute(select(TeacherProfile).where(TeacherProfile.user_id == current_user.id))
    profile = res.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Teacher profile not found")
    profile.avatar_url = None
    await db.commit()
    await db.refresh(profile)

    first_name, last_name = _split_full_name(profile.full_name)
    stats = await _get_teacher_stats(db)
    return UserProfileOut(
        id=profile.id,
        user_id=current_user.id,
        role=current_user.role.value,
        username=current_user.username,
        email=current_user.email,
        full_name=profile.full_name,
        first_name=first_name,
        last_name=last_name,
        phone=profile.phone,
        telegram_username=profile.phone,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        stats=stats,
    )


@router.get("/{user_id}/avatar")
async def get_user_avatar(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Serve uploaded avatar photo directly."""
    profile_dir = get_upload_root() / "profiles" / str(user_id)
    if profile_dir.exists():
        for match in profile_dir.glob("avatar.*"):
            if match.is_file():
                ext = match.suffix.lower()
                media_type = "image/jpeg"
                if ext == ".png":
                    media_type = "image/png"
                elif ext == ".webp":
                    media_type = "image/webp"
                return FileResponse(
                    path=str(match),
                    media_type=media_type,
                    headers={"Cache-Control": "public, max-age=86400"},
                )

    # If missing from ephemeral container disk, restore from FileBlob database
    res = await db.execute(select(FileBlob).where(FileBlob.file_path.like(f"profiles/{user_id}/avatar%")))
    blob = res.scalar_one_or_none()
    if blob and blob.file_data:
        dest = get_upload_root() / blob.file_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(blob.file_data)
        return FileResponse(
            path=str(dest),
            media_type=blob.content_type or "image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")
