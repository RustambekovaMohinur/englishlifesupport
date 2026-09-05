import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_student_profile, get_current_user, require_teacher
from app.db.session import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.grade import Grade
from app.models.student import StudentProfile
from app.models.submission import (
    Submission,
    SubmissionComment,
    SubmissionCorrection,
    SubmissionStatus,
)
from app.models.user import User, UserRole
from app.models.gamification import StarTransaction, StarTransactionReason
from app.schemas.submission import (
    GradeCreate,
    GradeOut,
    PaginatedSubmissions,
    SubmissionCommentCreate,
    SubmissionCommentOut,
    SubmissionCorrectionCreate,
    SubmissionCorrectionOut,
    SubmissionOut,
)
from app.services.gamification_service import (
    award_lightning,
    award_stars,
    award_xp,
    check_and_award_perfect_week,
    check_comeback_achievement,
    is_assignment_locked_for_student,
    unlock_achievement,
    update_student_streak,
)
from app.utils.datetimes import as_utc, utcnow
from app.utils.files import resolve_submission_file, resolve_submission_file_async, save_submission_file

router = APIRouter(prefix="/api/submissions", tags=["submissions"])


async def _authorize_submission_access(submission: Submission, current_user: User, db: AsyncSession) -> None:
    """A teacher may access any submission. A student may only access their
    own - we verify by joining through student_profiles.user_id, never by
    trusting anything the client sends."""
    if current_user.role == UserRole.TEACHER:
        return
    result = await db.execute(select(StudentProfile).where(StudentProfile.id == submission.student_id))
    student = result.scalar_one_or_none()
    if student is None or student.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You may only access your own submissions")


from app.models.submission import (
    Submission,
    SubmissionComment,
    SubmissionCorrection,
    SubmissionImage,
    SubmissionStatus,
)
from app.schemas.submission import (
    GradeCreate,
    GradeOut,
    PaginatedSubmissions,
    SubmissionCommentCreate,
    SubmissionCommentOut,
    SubmissionCorrectionCreate,
    SubmissionCorrectionOut,
    SubmissionImageOut,
    SubmissionOut,
)


def _submission_to_out(sub: Submission) -> SubmissionOut:
    grade_out = None
    if sub.grade:
        grade_out = GradeOut(
            id=sub.grade.id,
            score=sub.grade.score,
            feedback=sub.grade.feedback,
            stars=sub.grade.stars,
            graded_at=sub.grade.graded_at,
        )
    corrections_out = [
        SubmissionCorrectionOut(
            id=c.id,
            submission_id=c.submission_id,
            teacher_id=c.teacher_id,
            selected_text=c.selected_text,
            correction=c.correction,
            comment=c.comment,
            error_type=c.error_type,
            created_at=c.created_at,
        )
        for c in (getattr(sub, "corrections", None) or [])
    ]
    comments_out = [
        SubmissionCommentOut(
            id=c.id,
            submission_id=c.submission_id,
            teacher_id=c.teacher_id,
            comment=c.comment,
            created_at=c.created_at,
        )
        for c in (getattr(sub, "comments", None) or [])
    ]
    images_out = [
        SubmissionImageOut(
            id=img.id,
            file_path=img.file_path,
            original_name=img.file_original_name,
            file_size=img.file_size_bytes,
            order_index=img.order_index,
            created_at=img.created_at,
        )
        for img in (getattr(sub, "images", None) or [])
    ]
    return SubmissionOut(
        id=sub.id,
        assignment_id=sub.assignment_id,
        assignment_title=sub.assignment.title,
        student_id=sub.student_id,
        student_name=sub.student.full_name,
        text_answer=sub.text_answer,
        file_url=f"/api/submissions/{sub.id}/file" if sub.file_path else None,
        file_original_name=sub.file_original_name,
        images=images_out,
        status=sub.status.value,
        submitted_at=sub.submitted_at,
        grade=grade_out,
        corrections=corrections_out,
        comments=comments_out,
    )


@router.post("", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
async def submit_homework(
    assignment_id: uuid.UUID = Form(...),
    text_answer: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    images: list[UploadFile] | None = File(default=None),
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    """
    Student submits (or resubmits, before the deadline) homework for an
    assignment belonging to their own group. Text, file, audio, and/or up to 10 images accepted.
    Image #11 rejected with 400.
    """
    assignment = (await db.execute(select(Assignment).where(Assignment.id == assignment_id))).scalar_one_or_none()
    if assignment is None or assignment.status != AssignmentStatus.PUBLISHED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    if assignment.group_id != profile.group_id:
        # A student may only submit to assignments for their own group.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This assignment is not for your group")

    # Enforce sequential task lock strictly on backend
    is_locked, lock_reason = await is_assignment_locked_for_student(db, assignment_id, profile.id)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Task is locked: {lock_reason}",
        )

    valid_images = [img for img in (images or []) if img.filename]
    if len(valid_images) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 images allowed per submission",
        )

    if not text_answer and not file and not valid_images:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a text answer, file, voice audio, or images")


    now = utcnow()
    existing = (
        await db.execute(
            select(Submission)
            .options(selectinload(Submission.grade))
            .where(Submission.assignment_id == assignment_id, Submission.student_id == profile.id)
        )
    ).scalar_one_or_none()

    if existing is not None and existing.grade is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This submission has already been graded and can no longer be edited"
        )
    if existing is not None and as_utc(assignment.deadline) < now:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The deadline has passed; resubmission is not allowed")

    file_path = existing.file_path if existing else None
    file_original_name = existing.file_original_name if existing else None
    file_content_type = existing.file_content_type if existing else None
    file_size = existing.file_size_bytes if existing else None

    if file is not None:
        file_path, file_original_name, file_content_type, file_size = await save_submission_file(file, profile.id, db=db)

    is_late = as_utc(assignment.deadline) < now
    submission_status = SubmissionStatus.LATE if is_late else SubmissionStatus.SUBMITTED

    if existing is not None:
        existing.text_answer = text_answer
        existing.file_path = file_path
        existing.file_original_name = file_original_name
        existing.file_content_type = file_content_type
        existing.file_size_bytes = file_size
        existing.status = submission_status
        existing.submitted_at = now
        submission = existing
    else:
        submission = Submission(
            assignment_id=assignment_id,
            student_id=profile.id,
            text_answer=text_answer,
            file_path=file_path,
            file_original_name=file_original_name,
            file_content_type=file_content_type,
            file_size_bytes=file_size,
            status=submission_status,
            submitted_at=now,
        )
        db.add(submission)
    await db.flush()

    if valid_images:
        from app.models.submission import SubmissionImage
        from app.utils.files import save_submission_image

        for idx, img_file in enumerate(valid_images):
            img_path, img_orig_name, img_content_type, img_size = await save_submission_image(img_file, submission.id, db=db)
            sub_img = SubmissionImage(
                submission_id=submission.id,
                file_path=img_path,
                file_original_name=img_orig_name,
                file_content_type=img_content_type,
                file_size_bytes=img_size,
                order_index=idx,
            )
            db.add(sub_img)


    # Gamification calculations
    if is_late:
        # -20 ⭐ late/missed deadline (idempotent, only applied once per assignment)
        await award_stars(
            db,
            student_id=profile.id,
            amount=-20,
            reason=StarTransactionReason.LATE_PENALTY,
            reference_id=str(assignment_id),
            description=f"Late submission penalty for '{assignment.title}'",
        )
        # Check comeback achievement if student completed a previously late task
        await check_comeback_achievement(db, profile.id, assignment_id)
    else:
        # +10 ⭐ on-time assignment completion
        await award_stars(
            db,
            student_id=profile.id,
            amount=10,
            reason=StarTransactionReason.ON_TIME_SUBMISSION,
            reference_id=str(assignment_id),
            description=f"On-time completion for '{assignment.title}'",
        )
        # +25 XP for assignment completion
        await award_xp(
            db,
            student_id=profile.id,
            amount=25,
            activity_type="assignment_completed",
            reference_id=str(assignment_id),
            description=f"XP for completing '{assignment.title}'",
        )
        # 100% completion awards 1 ⚡ lightning (idempotent, never duplicates)
        await award_lightning(
            db,
            student_id=profile.id,
            assignment_id=assignment_id,
        )
        # Unlock assignment completion achievement
        await unlock_achievement(
            db,
            student_id=profile.id,
            badge_key="first_assignment",
            title="Homework Hero",
            description="Completed and submitted an assignment on time!",
            icon="📝",
        )

        # Early submission check: submitted at least 24 hours before deadline gives +5 ⭐ and Early Bird
        if as_utc(assignment.deadline) - now >= timedelta(hours=24):
            awarded_early = await award_stars(
                db,
                student_id=profile.id,
                amount=5,
                reason=StarTransactionReason.EARLY_SUBMISSION,
                reference_id=str(assignment_id),
                description=f"Early bird bonus for '{assignment.title}'",
            )
            if awarded_early:
                await unlock_achievement(
                    db,
                    student_id=profile.id,
                    badge_key="early_bird",
                    title="Early Bird",
                    description="Submitted homework at least 24 hours before deadline!",
                    icon="🚀",
                )

        # Update ⚡ streak
        await update_student_streak(db, profile.id, now.strftime("%Y-%m-%d"))

        # Check Perfect Week
        if profile.group_id:
            await check_and_award_perfect_week(db, profile.id, profile.group_id)

    await db.commit()
    result = await db.execute(
        select(Submission)
        .options(
            selectinload(Submission.grade),
            selectinload(Submission.assignment),
            selectinload(Submission.student),
            selectinload(Submission.corrections),
            selectinload(Submission.comments),
            selectinload(Submission.images),
        )
        .where(Submission.id == submission.id)
    )
    return _submission_to_out(result.scalar_one())


@router.get("", response_model=PaginatedSubmissions, dependencies=[Depends(require_teacher)])
async def list_submissions(
    db: AsyncSession = Depends(get_db),
    group_id: uuid.UUID | None = Query(default=None),
    student_id: uuid.UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    query = (
        select(Submission)
        .options(
            selectinload(Submission.grade),
            selectinload(Submission.assignment),
            selectinload(Submission.student),
            selectinload(Submission.corrections),
            selectinload(Submission.comments),
            selectinload(Submission.images),
        )
        .join(Assignment, Submission.assignment_id == Assignment.id)
    )
    if group_id:
        query = query.where(Assignment.group_id == group_id)
    if student_id:
        query = query.where(Submission.student_id == student_id)
    if status_filter:
        query = query.where(Submission.status == status_filter)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = query.order_by(Submission.submitted_at.desc()).offset((page - 1) * page_size).limit(page_size)
    submissions = (await db.execute(query)).scalars().all()

    return PaginatedSubmissions(
        items=[_submission_to_out(s) for s in submissions], total=total, page=page, page_size=page_size
    )


@router.get("/mine", response_model=list[SubmissionOut])
async def list_my_submissions(
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Submission)
        .options(
            selectinload(Submission.grade),
            selectinload(Submission.assignment),
            selectinload(Submission.student),
            selectinload(Submission.corrections),
            selectinload(Submission.comments),
            selectinload(Submission.images),
        )
        .where(Submission.student_id == profile.id)
        .order_by(Submission.submitted_at.desc())
    )
    submissions = (await db.execute(query)).scalars().all()
    return [_submission_to_out(s) for s in submissions]


async def _get_submission_or_404(submission_id: uuid.UUID, db: AsyncSession) -> Submission:
    result = await db.execute(
        select(Submission)
        .options(
            selectinload(Submission.grade),
            selectinload(Submission.assignment),
            selectinload(Submission.student),
            selectinload(Submission.corrections),
            selectinload(Submission.comments),
            selectinload(Submission.images),
        )
        .where(Submission.id == submission_id)
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    return submission


@router.get("/{submission_id}", response_model=SubmissionOut)
async def get_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    submission = await _get_submission_or_404(submission_id, db)
    await _authorize_submission_access(submission, current_user, db)
    return _submission_to_out(submission)


@router.get("/{submission_id}/file")
async def download_submission_file(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Streams the stored file back. Authorization: the owning student, or the
    teacher, may access it - nobody else, regardless of URL guessing (file
    paths are random UUIDs, but we still enforce ownership server-side).
    """
    submission = await _get_submission_or_404(submission_id, db)
    await _authorize_submission_access(submission, current_user, db)

    if not submission.file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This submission has no file")

    absolute_path = await resolve_submission_file_async(submission.file_path, db=db, fallback_name=submission.file_original_name)
    return FileResponse(
        path=absolute_path,
        media_type=submission.file_content_type or "application/octet-stream",
        filename=submission.file_original_name or "submission",
    )


@router.post("/{submission_id}/grade", response_model=GradeOut, dependencies=[Depends(require_teacher)])
async def grade_submission(
    submission_id: uuid.UUID,
    body: GradeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    submission = await _get_submission_or_404(submission_id, db)
    now = datetime.now(timezone.utc)

    if submission.grade is not None:
        submission.grade.score = body.score
        submission.grade.feedback = body.feedback
        submission.grade.stars = body.stars
        submission.grade.graded_by = current_user.id
        submission.grade.graded_at = now
        grade = submission.grade
    else:
        grade = Grade(
            submission_id=submission.id,
            score=body.score,
            feedback=body.feedback,
            stars=body.stars,
            graded_by=current_user.id,
            graded_at=now,
        )
        db.add(grade)

    submission.status = SubmissionStatus.GRADED

    student = (
        await db.execute(select(StudentProfile).where(StudentProfile.id == submission.student_id))
    ).scalar_one()

    # Track / update StarTransaction for this grade idempotently
    ref_id = f"grade_{submission.id}"
    existing_tx = (
        await db.execute(
            select(StarTransaction).where(
                StarTransaction.student_id == submission.student_id,
                StarTransaction.reason == StarTransactionReason.TEACHER_ADJUSTMENT,
                StarTransaction.reference_id == ref_id,
            )
        )
    ).scalar_one_or_none()

    assignment_title = submission.assignment.title if submission.assignment else "homework"
    if existing_tx:
        existing_tx.amount = body.stars
        existing_tx.description = f"Teacher grade stars for '{assignment_title}'"
    elif body.stars > 0:
        tx = StarTransaction(
            student_id=submission.student_id,
            amount=body.stars,
            reason=StarTransactionReason.TEACHER_ADJUSTMENT,
            reference_id=ref_id,
            description=f"Teacher grade stars for '{assignment_title}'",
        )
        db.add(tx)

    await db.flush()

    # Recompute student's total_stars safely from all transactions
    total = (
        await db.execute(
            select(func.coalesce(func.sum(StarTransaction.amount), 0)).where(
                StarTransaction.student_id == submission.student_id
            )
        )
    ).scalar_one()
    student.total_stars = max(0, int(total))

    # If grade score is 10/10 (100%), ensure lightning is awarded idempotently
    if grade.score >= 10:
        await award_lightning(
            db,
            student_id=submission.student_id,
            assignment_id=submission.assignment_id,
        )

    await db.commit()
    await db.refresh(grade)
    return GradeOut(id=grade.id, score=grade.score, feedback=grade.feedback, stars=grade.stars, graded_at=grade.graded_at)


@router.post("/{submission_id}/corrections", response_model=SubmissionCorrectionOut, dependencies=[Depends(require_teacher)])
async def add_submission_correction(
    submission_id: uuid.UUID,
    body: SubmissionCorrectionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    submission = await _get_submission_or_404(submission_id, db)
    corr = SubmissionCorrection(
        submission_id=submission.id,
        teacher_id=current_user.id,
        selected_text=body.selected_text,
        correction=body.correction,
        comment=body.comment,
        error_type=body.error_type,
    )
    db.add(corr)
    await db.commit()
    await db.refresh(corr)
    return SubmissionCorrectionOut(
        id=corr.id,
        submission_id=corr.submission_id,
        teacher_id=corr.teacher_id,
        selected_text=corr.selected_text,
        correction=corr.correction,
        comment=corr.comment,
        error_type=corr.error_type,
        created_at=corr.created_at,
    )


@router.delete("/{submission_id}/corrections/{correction_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_teacher)])
async def delete_submission_correction(
    submission_id: uuid.UUID,
    correction_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    corr = (
        await db.execute(
            select(SubmissionCorrection).where(
                SubmissionCorrection.id == correction_id,
                SubmissionCorrection.submission_id == submission_id,
            )
        )
    ).scalar_one_or_none()
    if not corr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Correction not found")
    await db.delete(corr)
    await db.commit()


@router.post("/{submission_id}/comments", response_model=SubmissionCommentOut, dependencies=[Depends(require_teacher)])
async def add_submission_comment(
    submission_id: uuid.UUID,
    body: SubmissionCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    submission = await _get_submission_or_404(submission_id, db)
    comm = SubmissionComment(
        submission_id=submission.id,
        teacher_id=current_user.id,
        comment=body.comment,
    )
    db.add(comm)
    await db.commit()
    await db.refresh(comm)
    return SubmissionCommentOut(
        id=comm.id,
        submission_id=comm.submission_id,
        teacher_id=comm.teacher_id,
        comment=comm.comment,
        created_at=comm.created_at,
    )


@router.delete("/{submission_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_teacher)])
async def delete_submission_comment(
    submission_id: uuid.UUID,
    comment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    comm = (
        await db.execute(
            select(SubmissionComment).where(
                SubmissionComment.id == comment_id,
                SubmissionComment.submission_id == submission_id,
            )
        )
    ).scalar_one_or_none()
    if not comm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    await db.delete(comm)
    await db.commit()


@router.post("/{submission_id}/images", response_model=SubmissionImageOut)
async def upload_submission_image(
    submission_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.submission import SubmissionImage
    from app.utils.files import save_submission_image

    submission = await _get_submission_or_404(submission_id, db)
    await _authorize_submission_access(submission, current_user, db)

    current_count = (
        await db.execute(
            select(func.count()).select_from(SubmissionImage).where(SubmissionImage.submission_id == submission_id)
        )
    ).scalar_one()
    if current_count >= 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 images allowed per submission",
        )

    img_path, img_orig_name, img_content_type, img_size = await save_submission_image(file, submission_id, db=db)
    sub_img = SubmissionImage(
        submission_id=submission_id,
        file_path=img_path,
        file_original_name=img_orig_name,
        file_content_type=img_content_type,
        file_size_bytes=img_size,
        order_index=current_count,
    )
    db.add(sub_img)
    await db.commit()
    await db.refresh(sub_img)

    return SubmissionImageOut(
        id=sub_img.id,
        file_path=sub_img.file_path,
        original_name=sub_img.file_original_name,
        file_size=sub_img.file_size_bytes,
        order_index=sub_img.order_index,
        created_at=sub_img.created_at,
    )


@router.delete("/{submission_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_submission_image(
    submission_id: uuid.UUID,
    image_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.submission import SubmissionImage

    submission = await _get_submission_or_404(submission_id, db)
    await _authorize_submission_access(submission, current_user, db)

    img = (
        await db.execute(
            select(SubmissionImage).where(
                SubmissionImage.id == image_id,
                SubmissionImage.submission_id == submission_id,
            )
        )
    ).scalar_one_or_none()
    if not img:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    await db.delete(img)
    await db.commit()
    return None


@router.get("/{submission_id}/images/{image_id}")
async def get_submission_image(
    submission_id: uuid.UUID,
    image_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.submission import SubmissionImage

    submission = await _get_submission_or_404(submission_id, db)
    await _authorize_submission_access(submission, current_user, db)

    img = (
        await db.execute(
            select(SubmissionImage).where(
                SubmissionImage.id == image_id,
                SubmissionImage.submission_id == submission_id,
            )
        )
    ).scalar_one_or_none()
    if not img:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    path = await resolve_submission_file_async(img.file_path, db=db, fallback_name=img.file_original_name)
    return FileResponse(
        path=path,
        media_type=img.file_content_type or "image/jpeg",
        filename=img.file_original_name,
    )


