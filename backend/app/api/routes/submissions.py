import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status, BackgroundTasks
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_student_profile, get_current_user, require_teacher
from app.db.session import get_db
from app.models.file_blob import FileBlob
from app.models.assignment import Assignment, AssignmentStatus
from app.models.grade import Grade
from app.services.storage import get_storage_service
from app.models.student import StudentProfile
from app.models.submission import (
    Submission,
    SubmissionComment,
    SubmissionCorrection,
    SubmissionStatus,
)
from app.models.user import User, UserRole
from app.models.gamification import StarTransaction, StarTransactionReason
from app.models.vocabulary import VocabularyAssignment, VocabularyAttempt
from app.schemas.submission import (
    DuplicateCompareOut,
    GradeCreate,
    GradeOut,
    MarkCheatedRequest,
    PaginatedSubmissions,
    SubmissionAIFeedbackOut,
    SubmissionCommentCreate,
    SubmissionCommentOut,
    SubmissionCompareItem,
    SubmissionCorrectionCreate,
    SubmissionCorrectionOut,
    SubmissionOut,
    VocabAttemptOut,
)
from app.services.ai_evaluation import evaluate_submission_background
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
from app.utils.datetimes import as_utc, ensure_utc, utcnow
from app.utils.files import (
    process_submission_file_concurrent,
    process_submission_image_concurrent,
    record_file_blob,
    resolve_submission_file,
    resolve_submission_file_async,
    save_submission_file,
)

router = APIRouter(prefix="/api/submissions", tags=["submissions"])


async def _authorize_submission_access(submission: Submission, current_user: User, db: AsyncSession) -> None:
    """
    A teacher or admin may access any submission.
    A student may only access their own - verified by joining through student_profiles.user_id.
    """
    user_role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if user_role_str in ["teacher", "admin", "superadmin"] or current_user.role == UserRole.TEACHER:
        return

    result = await db.execute(select(StudentProfile).where(StudentProfile.id == submission.student_id))
    student = result.scalar_one_or_none()
    if student is None or student.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sizda ushbu topshiriq yoki rasmni ko'rish huquqi yo'q.",
        )


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


def _submission_to_out(sub: Submission, vocab_attempt: VocabAttemptOut | None = None) -> SubmissionOut:
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
    ai_fb = getattr(sub, "ai_feedback", None)
    ai_feedback_out = None
    if ai_fb is not None:
        ai_feedback_out = SubmissionAIFeedbackOut(
            id=ai_fb.id,
            submission_id=ai_fb.submission_id,
            assignment_type=ai_fb.assignment_type,
            band_score=ai_fb.band_score,
            scaled_score_10=ai_fb.scaled_score_10,
            overall_feedback=ai_fb.overall_feedback,
            criteria_scores=ai_fb.criteria_scores,
            strengths=ai_fb.strengths,
            areas_for_improvement=ai_fb.areas_for_improvement,
            detailed_corrections=ai_fb.detailed_corrections,
            transcription=ai_fb.transcription,
            status=ai_fb.status,
            error_message=ai_fb.error_message,
            created_at=ai_fb.created_at,
            updated_at=ai_fb.updated_at,
        )

    orig_student_name = None
    if getattr(sub, "duplicate_of", None) and sub.duplicate_of.student:
        orig_student_name = sub.duplicate_of.student.full_name

    return SubmissionOut(
        id=sub.id,
        assignment_id=sub.assignment_id,
        assignment_title=sub.assignment.title if sub.assignment else "",
        student_id=sub.student_id,
        student_name=sub.student.full_name if sub.student else "",
        text_answer=sub.text_answer,
        file_url=(
            sub.file_path
            if (sub.file_path and (sub.file_path.startswith("http://") or sub.file_path.startswith("https://")))
            else (f"/api/submissions/{sub.id}/file" if sub.file_path else None)
        ),
        file_original_name=sub.file_original_name,
        images=images_out,
        status=sub.status.value,
        is_late=bool(
            sub.status == SubmissionStatus.LATE
            or (sub.assignment and ensure_utc(sub.submitted_at) > ensure_utc(sub.assignment.deadline))
        ),
        is_relevant=getattr(sub, "is_relevant", True),
        submitted_at=sub.submitted_at,
        grade=grade_out,
        ai_feedback=ai_feedback_out,
        vocab_attempt=vocab_attempt,
        corrections=corrections_out,
        comments=comments_out,
        image_hash=getattr(sub, "image_hash", None),
        file_sha256=getattr(sub, "file_sha256", None),
        is_suspicious=bool(getattr(sub, "is_suspicious", False)),
        similarity_score=getattr(sub, "similarity_score", None),
        duplicate_of_submission_id=getattr(sub, "duplicate_of_submission_id", None),
        flag_reason=getattr(sub, "flag_reason", None),
        original_student_name=orig_student_name,
        tab_switch_count=getattr(sub, "tab_switch_count", 0) or 0,
        ai_evaluation_json=getattr(sub, "ai_evaluation_json", None),
        ai_grade_suggested=getattr(sub, "ai_grade_suggested", None),
        ai_evaluated_at=getattr(sub, "ai_evaluated_at", None),
    )


@router.post("", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
async def submit_homework(
    assignment_id: str = Form(...),
    text_answer: str | None = Form(default=None),
    content: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    voice_file: UploadFile | None = File(default=None),
    audio_file: UploadFile | None = File(default=None),
    audio: UploadFile | None = File(default=None),
    doc_file: UploadFile | None = File(default=None),
    document_file: UploadFile | None = File(default=None),
    images: list[UploadFile] | None = File(default=None),
    image: UploadFile | None = File(default=None),
    image_files: list[UploadFile] | None = File(default=None),
    photos: list[UploadFile] | None = File(default=None),
    photo: UploadFile | None = File(default=None),
    storage_url: str | None = Form(default=None),
    file_url: str | None = Form(default=None),
    voice_url: str | None = Form(default=None),
    file_name: str | None = Form(default=None),
    file_type: str | None = Form(default=None),
    file_size_bytes: int | None = Form(default=None),
    tab_switch_count: int = Form(default=0),
    profile: StudentProfile = Depends(get_current_student_profile),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
):
    """
    Student submits (or resubmits, before the deadline) homework for an
    assignment belonging to their own group. Text, file, audio, and/or up to 10 images accepted.
    Image #11 rejected with 400.
    """
    # Accept UUID string and parse cleanly
    clean_id = str(assignment_id).strip().strip("'\"")
    try:
        assignment_uuid = uuid.UUID(clean_id)
    except (ValueError, TypeError, AttributeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid assignment_id format: '{assignment_id}'. Expected a valid UUID.",
        ) from exc

    assignment = (await db.execute(select(Assignment).where(Assignment.id == assignment_uuid))).scalar_one_or_none()
    if assignment is None or assignment.status != AssignmentStatus.PUBLISHED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    if assignment.group_id != profile.group_id:
        # A student may only submit to assignments for their own group.
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This assignment is not for your group")

    now = ensure_utc(utcnow())
    is_late = ensure_utc(assignment.deadline) < now

    # Enforce sequential task lock strictly on backend for active assignments
    # Overdue/past deadline coursework is permitted to allow students to catch up
    is_locked, lock_reason = await is_assignment_locked_for_student(db, assignment_uuid, profile.id)
    if is_locked and not is_late:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Task is locked: {lock_reason}",
        )

    # Harmonize text answer from content or text_answer
    raw_text = (content or text_answer or "").strip() or None

    # Collect and validate all image uploads across all potential form field keys
    all_images: list[UploadFile] = []
    for img_group in [images, image_files, photos]:
        if img_group:
            for img in img_group:
                if img and getattr(img, "filename", None) and len(img.filename.strip()) > 0:
                    all_images.append(img)
    for single_img in [image, photo]:
        if single_img and getattr(single_img, "filename", None) and len(single_img.filename.strip()) > 0:
            if single_img not in all_images:
                all_images.append(single_img)

    # Multi-modal file resolution: check audio_file, voice_file, audio, document_file, doc_file
    primary_file: UploadFile | None = None
    for candidate in [audio_file, voice_file, audio, document_file, doc_file]:
        if candidate is not None and getattr(candidate, "filename", None) and len(candidate.filename.strip()) > 0:
            primary_file = candidate
            break

    # If no audio or doc, check general file
    if primary_file is None and file is not None and getattr(file, "filename", None) and len(file.filename.strip()) > 0:
        if not all_images:
            primary_file = file
        else:
            # If all_images is present, only treat 'file' as primary if it's NOT the first photo passed for legacy compatibility
            first_img = all_images[0]
            is_same = (
                file.filename == first_img.filename and
                getattr(file, "size", None) == getattr(first_img, "size", None)
            )
            if not is_same:
                primary_file = file

    valid_images = all_images[:10]
    if len(all_images) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 images allowed per submission",
        )

    direct_storage_url = (storage_url or file_url or voice_url or "").strip() or None

    if not raw_text and not primary_file and not valid_images and not direct_storage_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a text answer, file, voice audio, or images")

    now = utcnow()

    curr_cycle = getattr(assignment, "cycle_number", 1) or 1

    # Query for existing submission for this student, assignment, and cycle
    stmt = (
        select(Submission)
        .options(selectinload(Submission.grade))
        .where(
            Submission.assignment_id == assignment_uuid,
            Submission.student_id == profile.id,
            Submission.cycle_number == curr_cycle,
        )
        .order_by(Submission.is_archived.asc(), Submission.submitted_at.desc(), Submission.id.desc())
        .limit(1)
    )
    existing = (await db.execute(stmt)).scalars().first()

    sub_id = existing.id if existing else uuid.uuid4()
    is_new_submission = existing is None

    # Step 1: Concurrently process and upload ALL files (audio, doc, and up to 10 images) in parallel
    upload_tasks = []
    has_primary = primary_file is not None
    if has_primary:
        upload_tasks.append(process_submission_file_concurrent(primary_file, profile.id))

    for idx, img in enumerate(valid_images):
        upload_tasks.append(process_submission_image_concurrent(img, sub_id, idx))

    upload_results = []
    if upload_tasks:
        try:
            upload_results = await asyncio.gather(*upload_tasks)
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Failed during concurrent storage upload: %s", e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Fayl yoki rasmlarni serverga yuklashda xatolik yuz berdi. Iltimos qayta urinib ko'ring.",
            ) from e

    primary_res = upload_results[0] if has_primary else None
    image_results = upload_results[1:] if has_primary else upload_results

    # Retain existing files if no new file is uploaded
    file_path = existing.file_path if existing else None
    file_original_name = existing.file_original_name if existing else None
    file_content_type = existing.file_content_type if existing else None
    file_size = existing.file_size_bytes if existing else None

    if direct_storage_url:
        file_path = direct_storage_url
        file_original_name = file_name or "voice_recording.webm"
        file_content_type = file_type or "audio/webm"
        file_size = file_size_bytes or 0
        await record_file_blob(db, file_path, file_size, file_content_type, file_original_name, storage_backend="b2")
    elif primary_res is not None:
        file_path, file_original_name, file_content_type, file_size, backend_used = primary_res
        await record_file_blob(db, file_path, file_size, file_content_type, file_original_name, storage_backend=backend_used)

    is_late = ensure_utc(assignment.deadline) < now
    submission_status = SubmissionStatus.LATE if is_late else SubmissionStatus.SUBMITTED

    # If text_answer/content is sent, update it; otherwise retain existing
    resolved_text = raw_text if (raw_text is not None and raw_text.strip()) else (existing.text_answer if existing else raw_text)

    if existing is not None:
        existing.is_archived = False
        existing.text_answer = resolved_text
        existing.file_path = file_path
        existing.file_original_name = file_original_name
        existing.file_content_type = file_content_type
        existing.file_size_bytes = file_size
        existing.status = submission_status
        existing.submitted_at = now
        existing.tab_switch_count = max(getattr(existing, "tab_switch_count", 0) or 0, tab_switch_count)
        submission = existing
    else:
        submission = Submission(
            id=sub_id,
            assignment_id=assignment_uuid,
            student_id=profile.id,
            cycle_number=curr_cycle,
            is_archived=False,
            text_answer=resolved_text,
            file_path=file_path,
            file_original_name=file_original_name,
            file_content_type=file_content_type,
            file_size_bytes=file_size,
            status=submission_status,
            submitted_at=now,
            tab_switch_count=tab_switch_count,
        )
        db.add(submission)
    await db.flush()

    # Anti-cheat fingerprinting & duplicate cross-checking
    from app.services.anti_cheat import (
        compute_file_fingerprints_from_bytes,
        check_duplicate_submission,
    )
    from app.utils.files import get_upload_root

    uploaded_fingerprints = []
    primary_img_hash = None
    primary_sha256 = None

    if primary_res:
        pri_disk_path = get_upload_root() / primary_res[0]
        if pri_disk_path.is_file():
            try:
                pri_bytes = pri_disk_path.read_bytes()
                p_hash, p_sha, p_rots = compute_file_fingerprints_from_bytes(
                    pri_bytes, filename=primary_res[1], content_type=primary_res[2]
                )
                primary_img_hash = p_hash
                primary_sha256 = p_sha
                uploaded_fingerprints.append((p_hash, p_sha, p_rots))
            except Exception as e:
                logger.warning("Error computing fingerprints for primary file: %s", e)

    if image_results:
        from app.models.submission import SubmissionImage

        # Replace previous images on update with the new batch
        if not is_new_submission:
            await db.execute(delete(SubmissionImage).where(SubmissionImage.submission_id == submission.id))

        for img_res in image_results:
            img_path, img_orig_name, img_content_type, img_size, img_order_idx, img_backend = img_res
            await record_file_blob(db, img_path, img_size, img_content_type, img_orig_name, storage_backend=img_backend)

            i_hash, i_sha, i_rots = None, None, None
            img_disk_path = get_upload_root() / img_path
            if img_disk_path.is_file():
                try:
                    img_bytes = img_disk_path.read_bytes()
                    i_hash, i_sha, i_rots = compute_file_fingerprints_from_bytes(
                        img_bytes, filename=img_orig_name, content_type=img_content_type
                    )
                    uploaded_fingerprints.append((i_hash, i_sha, i_rots))
                    if primary_img_hash is None and i_hash is not None:
                        primary_img_hash = i_hash
                    if primary_sha256 is None and i_sha is not None:
                        primary_sha256 = i_sha
                except Exception as e:
                    logger.warning("Error computing image fingerprints: %s", e)

            sub_img = SubmissionImage(
                submission_id=submission.id,
                file_path=img_path,
                file_original_name=img_orig_name,
                file_content_type=img_content_type,
                file_size_bytes=img_size,
                order_index=img_order_idx,
                image_hash=i_hash,
                file_sha256=i_sha,
            )
            db.add(sub_img)

    if primary_img_hash:
        submission.image_hash = primary_img_hash
    if primary_sha256:
        submission.file_sha256 = primary_sha256

    # Fast Duplicate cross-check against cohort/assignment (< 50ms)
    if uploaded_fingerprints:
        try:
            is_susp, sim_score, dup_id, flag_rsn = await check_duplicate_submission(
                db, submission, uploaded_fingerprints
            )
            if is_susp:
                submission.is_suspicious = True
                submission.similarity_score = sim_score
                submission.duplicate_of_submission_id = dup_id
                submission.flag_reason = flag_rsn
            elif not submission.is_suspicious:
                submission.similarity_score = None
                submission.duplicate_of_submission_id = None
                submission.flag_reason = None
        except Exception as e:
            logger.warning("Error during duplicate submission cross-check: %s", e)

    # Gamification calculations
    if is_new_submission:
        if is_late:
            # -20 ⭐ late/missed deadline (idempotent, only applied once per assignment)
            await award_stars(
                db,
                student_id=profile.id,
                amount=-20,
                reason=StarTransactionReason.LATE_PENALTY,
                reference_id=str(assignment_uuid),
                description=f"Late submission penalty for '{assignment.title}'",
            )
            # Check comeback achievement if student completed a previously late task
            await check_comeback_achievement(db, profile.id, assignment_uuid)
        else:
            # +10 ⭐ on-time assignment completion
            await award_stars(
                db,
                student_id=profile.id,
                amount=10,
                reason=StarTransactionReason.ON_TIME_SUBMISSION,
                reference_id=str(assignment_uuid),
                description=f"On-time completion for '{assignment.title}'",
            )
            # +25 XP for assignment completion
            await award_xp(
                db,
                student_id=profile.id,
                amount=25,
                activity_type="assignment_completed",
                reference_id=str(assignment_uuid),
                description=f"XP for completing '{assignment.title}'",
            )
            # 100% completion awards 1 ⚡ lightning (idempotent, never duplicates)
            await award_lightning(
                db,
                student_id=profile.id,
                assignment_id=assignment_uuid,
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
                    reference_id=str(assignment_uuid),
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
    else:
        # On resubmission/update, maintain streak without duplicating stars/XP
        await update_student_streak(db, profile.id, now.strftime("%Y-%m-%d"))

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
            selectinload(Submission.ai_feedback),
            selectinload(Submission.duplicate_of).selectinload(Submission.student),
        )
        .where(Submission.id == submission.id)
    )
    sub = result.scalars().first()
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found after creation",
        )

    # Dispatch automated AI evaluation asynchronously for Writing & Speaking submissions
    has_text = bool(resolved_text and len(resolved_text.strip()) > 0)
    has_audio = False
    if file_path:
        mime = (file_content_type or "").lower()
        name = (file_original_name or "").lower()
        if "audio" in mime or re.search(r"\.(mp3|wav|m4a|aac|ogg|webm)$", name):
            has_audio = True

    if has_text or has_audio:
        background_tasks.add_task(evaluate_submission_background, submission.id)

    return _submission_to_out(sub)


@router.get("", response_model=PaginatedSubmissions, dependencies=[Depends(require_teacher)])
@router.get("/", response_model=PaginatedSubmissions, dependencies=[Depends(require_teacher)])
async def list_submissions(
    db: AsyncSession = Depends(get_db),
    group_id: uuid.UUID | None = Query(default=None),
    student_id: uuid.UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    is_suspicious: bool | None = Query(default=None),
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
            selectinload(Submission.ai_feedback),
            selectinload(Submission.duplicate_of).selectinload(Submission.student),
        )
        .join(Assignment, Submission.assignment_id == Assignment.id)
    )
    if group_id:
        query = query.where(Assignment.group_id == group_id)
    if student_id:
        query = query.where(Submission.student_id == student_id)
    if status_filter:
        if status_filter in ["suspicious", "flagged"]:
            query = query.where(Submission.is_suspicious.is_(True))
        else:
            query = query.where(Submission.status == status_filter)
    elif is_suspicious is True:
        query = query.where(Submission.is_suspicious.is_(True))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = query.order_by(Submission.submitted_at.desc()).offset((page - 1) * page_size).limit(page_size)
    submissions = (await db.execute(query)).scalars().all()

    va_map = {}
    if submissions:
        assign_ids = list({s.assignment_id for s in submissions})
        st_ids = list({s.student_id for s in submissions})
        va_res = await db.execute(
            select(VocabularyAssignment.assignment_id, VocabularyAttempt)
            .join(VocabularyAssignment, VocabularyAttempt.vocabulary_assignment_id == VocabularyAssignment.id)
            .where(
                VocabularyAssignment.assignment_id.in_(assign_ids),
                VocabularyAttempt.student_id.in_(st_ids),
            )
        )
        for a_id, va in va_res.all():
            va_map[(a_id, va.student_id)] = VocabAttemptOut(
                percentage=va.percentage,
                best_percentage=getattr(va, "best_percentage", va.percentage) or va.percentage,
                attempt_count=getattr(va, "attempt_count", 1) or 1,
                correct_answers=va.correct_answers,
                total_questions=va.total_questions,
                is_completed=va.is_completed,
                completed_at=va.completed_at,
            )

    return PaginatedSubmissions(
        items=[_submission_to_out(s, vocab_attempt=va_map.get((s.assignment_id, s.student_id))) for s in submissions],
        total=total,
        page=page,
        page_size=page_size,
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
            selectinload(Submission.ai_feedback),
            selectinload(Submission.duplicate_of).selectinload(Submission.student),
        )
        .where(Submission.student_id == profile.id)
        .order_by(Submission.submitted_at.desc())
    )
    submissions = (await db.execute(query)).scalars().all()

    va_map = {}
    if submissions:
        assign_ids = list({s.assignment_id for s in submissions})
        va_res = await db.execute(
            select(VocabularyAssignment.assignment_id, VocabularyAttempt)
            .join(VocabularyAssignment, VocabularyAttempt.vocabulary_assignment_id == VocabularyAssignment.id)
            .where(
                VocabularyAssignment.assignment_id.in_(assign_ids),
                VocabularyAttempt.student_id == profile.id,
            )
        )
        for a_id, va in va_res.all():
            va_map[a_id] = VocabAttemptOut(
                percentage=va.percentage,
                best_percentage=getattr(va, "best_percentage", va.percentage) or va.percentage,
                attempt_count=getattr(va, "attempt_count", 1) or 1,
                correct_answers=va.correct_answers,
                total_questions=va.total_questions,
                is_completed=va.is_completed,
                completed_at=va.completed_at,
            )

    return [_submission_to_out(s, vocab_attempt=va_map.get(s.assignment_id)) for s in submissions]


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
            selectinload(Submission.ai_feedback),
            selectinload(Submission.duplicate_of).selectinload(Submission.student),
        )
        .where(Submission.id == submission_id)
    )
    submission = result.scalars().first()
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

    vocab_attempt_out = None
    va_res = await db.execute(
        select(VocabularyAttempt)
        .join(VocabularyAssignment, VocabularyAttempt.vocabulary_assignment_id == VocabularyAssignment.id)
        .where(
            VocabularyAssignment.assignment_id == submission.assignment_id,
            VocabularyAttempt.student_id == submission.student_id,
        )
    )
    va = va_res.scalars().first()
    if va:
        vocab_attempt_out = VocabAttemptOut(
            percentage=va.percentage,
            best_percentage=getattr(va, "best_percentage", va.percentage) or va.percentage,
            attempt_count=getattr(va, "attempt_count", 1) or 1,
            correct_answers=va.correct_answers,
            total_questions=va.total_questions,
            is_completed=va.is_completed,
            completed_at=va.completed_at,
        )

    return _submission_to_out(submission, vocab_attempt=vocab_attempt_out)


@router.post("/{submission_id}/evaluate-ai", response_model=SubmissionAIFeedbackOut)
async def trigger_ai_evaluation(
    submission_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Manually triggers or retries automated AI evaluation for a student's submission.
    Accessible to the owning student or the teacher.
    """
    submission = await _get_submission_or_404(submission_id, db)
    await _authorize_submission_access(submission, current_user, db)

    from app.models.submission_ai_feedback import AIEvaluationStatus, SubmissionAIFeedback

    # Determine type: speaking if audio file, else writing
    is_audio = False
    if submission.file_path:
        mime = (submission.file_content_type or "").lower()
        name = (submission.file_original_name or "").lower()
        if "audio" in mime or re.search(r"\.(mp3|wav|m4a|aac|ogg|webm)$", name):
            is_audio = True

    assign_type = "speaking" if is_audio else "writing"

    feedback_record = submission.ai_feedback
    if not feedback_record:
        feedback_record = SubmissionAIFeedback(
            submission_id=submission.id,
            assignment_type=assign_type,
            status=AIEvaluationStatus.PENDING.value,
        )
        db.add(feedback_record)
    else:
        feedback_record.assignment_type = assign_type
        feedback_record.status = AIEvaluationStatus.PENDING.value
        feedback_record.error_message = None

    await db.commit()
    await db.refresh(feedback_record)

    background_tasks.add_task(evaluate_submission_background, submission.id)

    return SubmissionAIFeedbackOut(
        id=feedback_record.id,
        submission_id=feedback_record.submission_id,
        assignment_type=feedback_record.assignment_type,
        band_score=feedback_record.band_score,
        scaled_score_10=feedback_record.scaled_score_10,
        overall_feedback=feedback_record.overall_feedback,
        criteria_scores=feedback_record.criteria_scores,
        strengths=feedback_record.strengths,
        areas_for_improvement=feedback_record.areas_for_improvement,
        detailed_corrections=feedback_record.detailed_corrections,
        transcription=feedback_record.transcription,
        status=feedback_record.status,
        error_message=feedback_record.error_message,
        created_at=feedback_record.created_at,
        updated_at=feedback_record.updated_at,
    )


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

    if submission.file_path.startswith("http://") or submission.file_path.startswith("https://"):
        return RedirectResponse(submission.file_path, status_code=307)

    absolute_path = await resolve_submission_file_async(submission.file_path, db=db, fallback_name=submission.file_original_name)
    return FileResponse(
        path=absolute_path,
        media_type=submission.file_content_type or "application/octet-stream",
        filename=submission.file_original_name or "submission",
    )


@router.post("/{submission_id}/grade", response_model=GradeOut, dependencies=[Depends(require_teacher)])
@router.post("/{submission_id}/feedback", response_model=GradeOut, dependencies=[Depends(require_teacher)])
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

    # Clean up FileBlob and B2 object
    if img.file_path:
        blob = (await db.execute(select(FileBlob).where(FileBlob.file_path == img.file_path))).scalar_one_or_none()
        if blob:
            if blob.storage_backend == "b2" or blob.storage_key:
                try:
                    from app.services.storage import get_storage_service
                    await get_storage_service().delete_file(blob.storage_key or blob.file_path)
                except Exception:
                    pass
            await db.delete(blob)

    await db.delete(img)
    await db.commit()
    return None


@router.get("/{submission_id}/images/{image_id}")
async def get_submission_image(
    submission_id: uuid.UUID,
    image_id: uuid.UUID,
    redirect: bool = Query(True, description="Whether to redirect to cloud storage or stream directly"),
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
    ).scalars().first()
    if not img:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    # Fast Path: Redirect to Backblaze B2 presigned URL for direct high-speed CDN delivery
    if redirect and img.file_path:
        try:
            blob = (
                await db.execute(
                    select(FileBlob).where(FileBlob.file_path == img.file_path)
                )
            ).scalars().first()
            if blob and (blob.storage_backend == "b2" or blob.storage_key):
                storage_service = get_storage_service()
                if storage_service.is_configured:
                    presigned_url = await storage_service.generate_presigned_url(
                        blob.storage_key or blob.file_path, expires_in=3600
                    )
                    return RedirectResponse(
                        url=presigned_url,
                        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
                        headers={
                            "Cache-Control": "private, max-age=600",
                            "Access-Control-Allow-Origin": "*",
                        },
                    )
        except Exception as e:
            logger.warning("B2 presigned redirect failed for image %s: %s", image_id, e)

    path = await resolve_submission_file_async(img.file_path, db=db, fallback_name=img.file_original_name)
    return FileResponse(
        path=path,
        media_type=img.file_content_type or "image/jpeg",
        filename=img.file_original_name,
        headers={
            "Cache-Control": "private, max-age=86400, immutable",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get(
    "/{submission_id}/compare-duplicate",
    response_model=DuplicateCompareOut,
    dependencies=[Depends(require_teacher)],
)
async def compare_duplicate_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    sub = await _get_submission_or_404(submission_id, db)
    if not sub.duplicate_of_submission_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ushbu topshiriqda nusxalanganlik (duplicate) belgilari qayd etilmagan.",
        )
    orig = await _get_submission_or_404(sub.duplicate_of_submission_id, db)

    def _build_compare_item(s: Submission) -> SubmissionCompareItem:
        img_urls = []
        for im in (getattr(s, "images", None) or []):
            img_urls.append(f"/api/submissions/{s.id}/images/{im.id}")
        file_url = (
            s.file_path
            if (s.file_path and (s.file_path.startswith("http://") or s.file_path.startswith("https://")))
            else (f"/api/submissions/{s.id}/file" if s.file_path else None)
        )
        return SubmissionCompareItem(
            submission_id=s.id,
            student_id=s.student_id,
            student_name=s.student.full_name if s.student else "Student",
            assignment_id=s.assignment_id,
            assignment_title=s.assignment.title if s.assignment else "Assignment",
            submitted_at=s.submitted_at,
            image_urls=img_urls,
            file_url=file_url,
            file_original_name=s.file_original_name,
            text_answer=s.text_answer,
            image_hash=s.image_hash,
            file_sha256=s.file_sha256,
        )

    return DuplicateCompareOut(
        current=_build_compare_item(sub),
        original=_build_compare_item(orig),
        similarity_score=sub.similarity_score or 0.85,
        flag_reason=sub.flag_reason,
        is_suspicious=sub.is_suspicious,
    )


@router.post(
    "/{submission_id}/mark-cheated",
    response_model=SubmissionOut,
    dependencies=[Depends(require_teacher)],
)
async def mark_submission_cheated(
    submission_id: uuid.UUID,
    body: MarkCheatedRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    sub = await _get_submission_or_404(submission_id, db)
    sub.is_suspicious = True
    now = datetime.now(timezone.utc)
    feedback_msg = (
        body.note
        or "Topshiriq rad etildi: Boshqa o'quvchidan ko'chirib olinganligi (duplicate copy) aniqlandi. Iltimos, o'zingiz mustaqil ravishda daftaringizga yozib qayta topshiring."
    )

    if sub.grade is not None:
        sub.grade.score = 0
        sub.grade.feedback = feedback_msg
        sub.grade.stars = 0
        sub.grade.graded_by = current_user.id
        sub.grade.graded_at = now
    else:
        grade = Grade(
            submission_id=sub.id,
            score=0,
            feedback=feedback_msg,
            stars=0,
            graded_by=current_user.id,
            graded_at=now,
        )
        db.add(grade)

    sub.status = SubmissionStatus.GRADED

    if body.penalty_stars > 0:
        await award_stars(
            db,
            student_id=sub.student_id,
            amount=-body.penalty_stars,
            reason=StarTransactionReason.MANUAL_ADJUSTMENT,
            reference_id=f"cheat_penalty_{sub.id}",
            description=f"Academic integrity penalty on '{sub.assignment.title if sub.assignment else 'task'}'",
        )

    await db.commit()
    await db.refresh(sub)
    return _submission_to_out(sub)


@router.post(
    "/{submission_id}/dismiss-flag",
    response_model=SubmissionOut,
    dependencies=[Depends(require_teacher)],
)
async def dismiss_submission_flag(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    sub = await _get_submission_or_404(submission_id, db)
    sub.is_suspicious = False
    await db.commit()
    await db.refresh(sub)
    return _submission_to_out(sub)


@router.post(
    "/{submission_id}/ai-evaluate",
    response_model=SubmissionOut,
    dependencies=[Depends(require_teacher)],
)
async def ai_evaluate_submission(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """
    Triggers on-demand AI writing rubric examination for the student's submission.
    Evaluates Grammar & Sentence Structure, Lexical Resource, Task Achievement, and Coherence.
    Stores structured evaluation JSON and suggested score.
    """
    sub = await _get_submission_or_404(submission_id, db)
    if not sub.text_answer or not sub.text_answer.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ushbu topshiriqda baholash uchun yozma matn (insho) mavjud emas.",
        )

    prompt_topic = sub.assignment.title if sub.assignment else "Writing Homework"
    if sub.assignment and sub.assignment.description:
        prompt_topic += f"\n{sub.assignment.description}"

    from app.services.ai_examiner import evaluate_writing_submission
    eval_result = await evaluate_writing_submission(prompt_topic, sub.text_answer)

    sub.ai_evaluation_json = json.dumps(eval_result)
    sub.ai_grade_suggested = float(eval_result.get("suggested_score", 85))
    sub.ai_evaluated_at = utcnow()

    await db.commit()
    await db.refresh(sub)
    return _submission_to_out(sub)


@router.post(
    "/{submission_id}/approve-ai-grade",
    response_model=SubmissionOut,
    dependencies=[Depends(require_teacher)],
)
async def approve_ai_grade(
    submission_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """
    Teacher 1-click approve endpoint:
    Applies ai_grade_suggested to grade (scaled 0-10), marks status as GRADED,
    appends structured AI feedback into teacher_feedback, and awards stars/XP automatically.
    """
    sub = await _get_submission_or_404(submission_id, db)

    # If not evaluated yet, run evaluation first
    if not sub.ai_evaluation_json:
        if not sub.text_answer or not sub.text_answer.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ushbu topshiriqda baholash uchun yozma matn mavjud emas.",
            )
        prompt_topic = sub.assignment.title if sub.assignment else "Writing Homework"
        if sub.assignment and sub.assignment.description:
            prompt_topic += f"\n{sub.assignment.description}"

        from app.services.ai_examiner import evaluate_writing_submission
        eval_result = await evaluate_writing_submission(prompt_topic, sub.text_answer)
        sub.ai_evaluation_json = json.dumps(eval_result)
        sub.ai_grade_suggested = float(eval_result.get("suggested_score", 85))
        sub.ai_evaluated_at = utcnow()
    else:
        try:
            eval_result = json.loads(sub.ai_evaluation_json)
        except Exception:
            eval_result = {}

    suggested_score = sub.ai_grade_suggested if sub.ai_grade_suggested is not None else float(eval_result.get("suggested_score", 80))
    # Convert 0-100 to LMS 0-10 scale
    score_10 = max(0, min(10, round(suggested_score / 10.0)))
    stars = score_10

    summary = eval_result.get("summary", "")
    band = eval_result.get("band", "")
    coherence = eval_result.get("coherence_feedback", "")
    ai_feedback_text = f"✨ [AI Examiner - Band {band} ({int(suggested_score)}/100)]\n{summary}"
    if coherence:
        ai_feedback_text += f"\n\nCoherence & Flow: {coherence}"

    now = datetime.now(timezone.utc)
    if sub.grade is not None:
        sub.grade.score = score_10
        sub.grade.feedback = ai_feedback_text
        sub.grade.stars = stars
        sub.grade.graded_by = current_user.id
        sub.grade.graded_at = now
        grade = sub.grade
    else:
        grade = Grade(
            submission_id=sub.id,
            score=score_10,
            feedback=ai_feedback_text,
            stars=stars,
            graded_by=current_user.id,
            graded_at=now,
        )
        db.add(grade)

    sub.status = SubmissionStatus.GRADED

    # Student StarTransaction and total stars update
    student = (
        await db.execute(select(StudentProfile).where(StudentProfile.id == sub.student_id))
    ).scalar_one()

    ref_id = f"grade_{sub.id}"
    existing_tx = (
        await db.execute(
            select(StarTransaction).where(
                StarTransaction.student_id == sub.student_id,
                StarTransaction.reason == StarTransactionReason.TEACHER_ADJUSTMENT,
                StarTransaction.reference_id == ref_id,
            )
        )
    ).scalar_one_or_none()

    assignment_title = sub.assignment.title if sub.assignment else "homework"
    if existing_tx:
        existing_tx.amount = stars
        existing_tx.description = f"Teacher approved AI grade stars for '{assignment_title}'"
    elif stars > 0:
        tx = StarTransaction(
            student_id=sub.student_id,
            amount=stars,
            reason=StarTransactionReason.TEACHER_ADJUSTMENT,
            reference_id=ref_id,
            description=f"Teacher approved AI grade stars for '{assignment_title}'",
        )
        db.add(tx)

    await db.flush()

    total = (
        await db.execute(
            select(func.coalesce(func.sum(StarTransaction.amount), 0)).where(
                StarTransaction.student_id == sub.student_id
            )
        )
    ).scalar_one()
    student.total_stars = max(0, int(total))

    if score_10 >= 10:
        await award_lightning(
            db,
            student_id=sub.student_id,
            assignment_id=sub.assignment_id,
        )

    await db.commit()
    await db.refresh(sub)
    return _submission_to_out(sub)




