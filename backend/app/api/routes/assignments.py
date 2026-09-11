import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, inspect as sa_inspect, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.base import NO_VALUE

from app.api.deps import get_current_student_profile, get_current_user, require_teacher
from app.db.session import get_db
from app.models.assignment import Assignment, AssignmentComment, AssignmentStatus
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.teacher import TeacherProfile
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.models.vocabulary import VocabularyAssignment, VocabularyWord
from app.schemas.assignment import (
    AssignmentCommentCreate,
    AssignmentCommentOut,
    AssignmentCommentUpdate,
    AssignmentCreate,
    AssignmentForStudent,
    AssignmentImageOut,
    AssignmentOut,
    AssignmentUpdate,
    VocabWordItem,
)
from app.services.gamification_service import is_assignment_locked_for_student
from app.utils.datetimes import as_utc, utcnow
from app.utils.files import (
    parse_vocab_csv,
    resolve_submission_file,
    resolve_submission_file_async,
    save_assignment_file,
)

router = APIRouter(prefix="/api/assignments", tags=["assignments"])


async def _get_assignment_with_relations(db: AsyncSession, assignment_id: uuid.UUID) -> Assignment | None:
    """
    Eagerly loads an Assignment and all linked relationships via selectinload.
    Completely eliminates lazy loading greenlet_spawn exceptions in async contexts.
    """
    query = (
        select(Assignment)
        .options(
            selectinload(Assignment.group),
            selectinload(Assignment.images),
            selectinload(Assignment.comments),
        )
        .where(Assignment.id == assignment_id)
    )
    return (await db.execute(query)).scalar_one_or_none()


def _assignment_to_out(assignment: Assignment, group_name: str, sub_count: int, vocab_words: list[VocabularyWord] | None = None) -> AssignmentOut:
    vocab_items = [
        VocabWordItem(
            id=w.id,
            english_word=w.english_word,
            translation=w.translation,
            example_sentence=w.example_sentence,
        )
        for w in (vocab_words or [])
    ]

    # Safe inspection of relationships without triggering lazy-load greenlet exceptions
    insp = sa_inspect(assignment)

    raw_images = []
    if insp is not None and "images" in insp.attrs and insp.attrs.images.loaded_value is not NO_VALUE:
        raw_images = assignment.images or []

    images_out = [
        AssignmentImageOut(
            id=img.id,
            file_path=img.file_path,
            original_name=img.file_original_name,
            file_size=img.file_size_bytes,
            order_index=img.order_index,
            created_at=img.created_at,
        )
        for img in raw_images
    ]

    comment_count = 0
    if insp is not None and "comments" in insp.attrs and insp.attrs.comments.loaded_value is not NO_VALUE:
        comment_count = len(assignment.comments or [])

    return AssignmentOut(
        id=assignment.id,
        group_id=assignment.group_id,
        group_name=group_name,
        title=assignment.title,
        description=assignment.description,
        deadline=assignment.deadline,
        is_hard_deadline=bool(getattr(assignment, "is_hard_deadline", False)),
        status=assignment.status.value if hasattr(assignment.status, "value") else str(assignment.status),
        file_url=f"/api/assignments/{assignment.id}/file" if assignment.file_path else None,
        file_original_name=assignment.file_original_name,
        vocab_words=vocab_items,
        images=images_out,
        created_at=assignment.created_at,
        submission_count=sub_count,
        comment_count=comment_count,
        order_index=getattr(assignment, "order_index", 0) or 0,
        cycle_number=getattr(assignment, "cycle_number", 1) or 1,
        prerequisite_id=getattr(assignment, "prerequisite_id", None),
    )


@router.get("", response_model=list[AssignmentOut], dependencies=[Depends(require_teacher)])
async def list_assignments(
    db: AsyncSession = Depends(get_db),
    group_id: uuid.UUID | None = Query(default=None),
):
    query = (
        select(Assignment, Group.name)
        .options(selectinload(Assignment.images), selectinload(Assignment.comments))
        .join(Group, Assignment.group_id == Group.id)
    )
    if group_id:
        query = query.where(Assignment.group_id == group_id)
    query = query.order_by(Assignment.deadline.desc())
    rows = (await db.execute(query)).all()

    result = []
    for assignment, group_name in rows:
        sub_count = (
            await db.execute(
                select(func.count()).select_from(Submission).where(Submission.assignment_id == assignment.id)
            )
        ).scalar_one()

        # Fetch vocabulary words if linked
        vocab_words = []
        vocab_assoc = (
            await db.execute(
                select(VocabularyAssignment)
                .options(selectinload(VocabularyAssignment.words))
                .where(VocabularyAssignment.assignment_id == assignment.id)
            )
        ).scalar_one_or_none()
        if vocab_assoc:
            vocab_words = vocab_assoc.words

        result.append(_assignment_to_out(assignment, group_name, sub_count, vocab_words))
    return result


@router.post("", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_teacher)])
@router.post("/", response_model=AssignmentOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_teacher)], include_in_schema=False)
async def create_assignment(
    group_id: str = Form(...),
    title: str = Form(...),
    description: str = Form(default="[]"),
    deadline: str = Form(...),
    is_hard_deadline: bool = Form(default=False),
    status_val: str = Form(default="published", alias="status"),
    order_index: int = Form(default=0),
    prerequisite_id: str | None = Form(default=None),

    file: UploadFile | None = File(default=None),
    vocab_file: UploadFile | None = File(default=None),
    images: list[UploadFile] | None = File(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """
    Creates an assignment for a group.
    - Default status is 'published'.
    - Rejects creating assignments for archived groups.
    - Accepts optional homework attachment file (up to 10MB).
    - Accepts optional vocabulary CSV file (word,translation format).
    - Accepts up to 10 assignment images (up to 10MB each). Image #11 is rejected with 400.
    """
    try:
        group_uuid = uuid.UUID(group_id.strip())
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid group_id format: '{group_id}'",
        )

    clean_title = (title or "").strip()
    if not clean_title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment title cannot be empty",
        )

    clean_description = (description or "").strip() or "[]"

    # Resilient deadline parsing
    parsed_deadline: datetime | None = None
    if isinstance(deadline, datetime):
        parsed_deadline = deadline
    elif isinstance(deadline, str):
        try:
            parsed_deadline = datetime.fromisoformat(deadline.strip().replace("Z", "+00:00"))
        except Exception:
            try:
                from dateutil import parser as dt_parser
                parsed_deadline = dt_parser.parse(deadline.strip())
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid deadline format: '{deadline}'",
                )
    if not parsed_deadline:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deadline is required",
        )

    # Prerequisite ID parsing (treating empty string, 'null', 'none' as None)
    prereq_uuid: uuid.UUID | None = None
    if prerequisite_id and prerequisite_id.strip().lower() not in ("null", "none", "undefined", ""):
        try:
            prereq_uuid = uuid.UUID(prerequisite_id.strip())
        except Exception:
            prereq_uuid = None

    group = (await db.execute(select(Group).where(Group.id == group_uuid))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group not found")
    if not group.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create assignments for an archived group",
        )

    valid_images = [img for img in (images or []) if img.filename]
    if len(valid_images) > 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 images allowed per assignment",
        )

    assign_status = AssignmentStatus.DRAFT if status_val.lower() == "draft" else AssignmentStatus.PUBLISHED

    file_path = None
    file_orig_name = None
    file_content_type = None
    file_size = None

    if file is not None and file.filename:
        file_path, file_orig_name, file_content_type, file_size = await save_assignment_file(file, group_uuid, db=db)

    assignment = Assignment(
        group_id=group_uuid,
        title=clean_title,
        description=clean_description,
        deadline=parsed_deadline,
        is_hard_deadline=is_hard_deadline,
        status=assign_status,
        order_index=order_index,
        cycle_number=getattr(group, "current_cycle", 1) or 1,
        prerequisite_id=prereq_uuid,
        file_path=file_path,
        file_original_name=file_orig_name,
        file_content_type=file_content_type,
        file_size_bytes=file_size,
        created_by=current_user.id,
    )
    db.add(assignment)
    await db.flush()

    # Save images if provided
    from app.models.assignment import AssignmentImage
    from app.utils.files import save_assignment_image

    for idx, img_file in enumerate(valid_images):
        img_path, img_orig_name, img_content_type, img_size = await save_assignment_image(img_file, assignment.id, db=db)
        assign_img = AssignmentImage(
            assignment_id=assignment.id,
            file_path=img_path,
            file_original_name=img_orig_name,
            file_content_type=img_content_type,
            file_size_bytes=img_size,
            order_index=idx,
        )
        db.add(assign_img)

    vocab_words = []
    if vocab_file is not None and vocab_file.filename:
        content_bytes = await vocab_file.read()
        csv_text = content_bytes.decode("utf-8-sig", errors="replace")
        pairs = parse_vocab_csv(csv_text)

        vocab_assign = VocabularyAssignment(
            teacher_id=current_user.id,
            group_id=group_uuid,
            assignment_id=assignment.id,
            title=f"Vocabulary: {assignment.title}",
            description=f"Vocabulary for assignment: {assignment.title}",
            deadline=parsed_deadline,
            is_active=True,
        )
        db.add(vocab_assign)
        await db.flush()

        for word, translation in pairs:
            vw = VocabularyWord(
                vocabulary_assignment_id=vocab_assign.id,
                english_word=word,
                translation=translation,
            )
            db.add(vw)
            vocab_words.append(vw)

    await db.commit()

    reloaded = await _get_assignment_with_relations(db, assignment.id)
    if reloaded is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load newly created assignment",
        )

    group_name = reloaded.group.name if reloaded.group else group.name
    return _assignment_to_out(reloaded, group_name, 0, vocab_words)



@router.get("/mine", response_model=list[AssignmentForStudent])
async def list_my_assignments(
    profile: StudentProfile = Depends(get_current_student_profile),
    db: AsyncSession = Depends(get_db),
):
    """
    Student-only: returns assignments for the student's own group.
    CRITICAL SECURITY RULE: Only PUBLISHED assignments are visible.
    Draft assignments are strictly hidden.
    """
    if profile.group_id is None:
        return []

    from app.services.gamification_service import check_and_apply_overdue_penalties
    await check_and_apply_overdue_penalties(db, profile.id)

    assignments = (
        await db.execute(
            select(Assignment)
            .options(selectinload(Assignment.images), selectinload(Assignment.comments))
            .where(
                Assignment.group_id == profile.group_id,
                Assignment.status == AssignmentStatus.PUBLISHED,
            )
            .order_by(Assignment.deadline.desc())
        )
    ).scalars().all()

    if not assignments:
        return []

    assign_ids = [a.id for a in assignments]
    assign_map = {a.id: a for a in assignments}

    # Batch 1: Submissions with grade for this student
    subs = (
        await db.execute(
            select(Submission)
            .options(selectinload(Submission.grade))
            .where(
                Submission.assignment_id.in_(assign_ids),
                Submission.student_id == profile.id,
            )
        )
    ).scalars().all()
    # Active submissions strictly scoped to current assignment cycle (non-archived)
    sub_map = {
        s.assignment_id: s for s in subs
        if (getattr(s, "cycle_number", 1) or 1) == (getattr(assign_map[s.assignment_id], "cycle_number", 1) or 1)
        and not getattr(s, "is_archived", False)
    }

    # Batch 2: Vocabulary assignments with words
    vocabs = (
        await db.execute(
            select(VocabularyAssignment)
            .options(selectinload(VocabularyAssignment.words))
            .where(VocabularyAssignment.assignment_id.in_(assign_ids))
        )
    ).scalars().all()
    vocab_map = {v.assignment_id: v for v in vocabs}

    # Batch 3: TaskLockOverrides for this student
    from app.models.gamification import TaskLockOverride
    overrides = (
        await db.execute(
            select(TaskLockOverride)
            .where(
                TaskLockOverride.assignment_id.in_(assign_ids),
                TaskLockOverride.student_id == profile.id,
            )
        )
    ).scalars().all()
    override_map = {o.assignment_id: o for o in overrides}

    result = []
    now = utcnow()
    for assignment in assignments:
        submission = sub_map.get(assignment.id)
        score = None
        stars = None
        feedback = None
        submission_id = None
        if submission:
            submission_id = submission.id
            if submission.grade:
                score = submission.grade.score
                stars = submission.grade.stars
                feedback = submission.grade.feedback

        vocab_assoc = vocab_map.get(assignment.id)
        vocab_words = vocab_assoc.words if vocab_assoc else []
        vocab_items = [
            VocabWordItem(
                id=w.id,
                english_word=w.english_word,
                translation=w.translation,
                example_sentence=w.example_sentence,
            )
            for w in vocab_words
        ]

        insp = sa_inspect(assignment)
        raw_images = []
        if insp is not None and "images" in insp.attrs and insp.attrs.images.loaded_value is not NO_VALUE:
            raw_images = assignment.images or []

        images_out = [
            AssignmentImageOut(
                id=img.id,
                file_path=img.file_path,
                original_name=img.file_original_name,
                file_size=img.file_size_bytes,
                order_index=img.order_index,
                created_at=img.created_at,
            )
            for img in raw_images
        ]

        # Fast in-memory sequential lock evaluation
        is_locked = False
        lock_reason = None
        ovr = override_map.get(assignment.id)
        if ovr and ovr.is_unlocked:
            is_locked = False
            lock_reason = None
        else:
            prereq_id = assignment.prerequisite_id
            if not prereq_id and getattr(assignment, "order_index", 0) > 0:
                preceding = [
                    a for a in assignments
                    if getattr(a, "cycle_number", 1) == getattr(assignment, "cycle_number", 1)
                    and getattr(a, "order_index", 0) < getattr(assignment, "order_index", 0)
                ]
                if preceding:
                    preceding.sort(key=lambda x: getattr(x, "order_index", 0), reverse=True)
                    prereq_id = preceding[0].id

            if prereq_id and prereq_id != assignment.id:
                if prereq_id in sub_map:
                    is_locked = False
                    lock_reason = None
                else:
                    prereq = assign_map.get(prereq_id)
                    is_locked = True
                    prereq_title = prereq.title if prereq else "oldingi vazifa"
                    lock_reason = f"Oldingi vazifani topshiring: '{prereq_title}'"

        is_past_dl = as_utc(assignment.deadline) < now
        is_overdue = is_past_dl and (submission is None)

        comment_cnt = 0
        if insp is not None and "comments" in insp.attrs and insp.attrs.comments.loaded_value is not NO_VALUE:
            comment_cnt = len(assignment.comments or [])

        result.append(
            AssignmentForStudent(
                id=assignment.id,
                title=assignment.title,
                description=assignment.description,
                deadline=assignment.deadline,
                is_hard_deadline=bool(getattr(assignment, "is_hard_deadline", False)),
                status=assignment.status.value if hasattr(assignment.status, "value") else str(assignment.status),
                file_url=f"/api/assignments/{assignment.id}/file" if assignment.file_path else None,
                file_original_name=assignment.file_original_name,
                vocab_words=vocab_items,
                images=images_out,
                is_past_deadline=is_past_dl,
                is_overdue=is_overdue,
                submission_status=submission.status.value if submission else None,
                score=score,
                stars=stars,
                feedback=feedback,
                submission_id=submission_id,
                order_index=getattr(assignment, "order_index", 0) or 0,
                cycle_number=getattr(assignment, "cycle_number", 1) or 1,
                prerequisite_id=getattr(assignment, "prerequisite_id", None),
                is_locked=is_locked,
                lock_reason=lock_reason,
                comment_count=comment_cnt,
            )
        )
    return result


@router.get("/{assignment_id}", response_model=AssignmentOut)
async def get_assignment(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    assignment = await _get_assignment_with_relations(db, assignment_id)

    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    # Security check for student role
    if current_user.role == UserRole.STUDENT:
        student_profile = (
            await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
        ).scalar_one_or_none()
        if student_profile is None or student_profile.group_id != assignment.group_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this assignment")
        if assignment.status != AssignmentStatus.PUBLISHED:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    sub_count = (
        await db.execute(select(func.count()).select_from(Submission).where(Submission.assignment_id == assignment.id))
    ).scalar_one()

    vocab_words = []
    vocab_assoc = (
        await db.execute(
            select(VocabularyAssignment)
            .options(selectinload(VocabularyAssignment.words))
            .where(VocabularyAssignment.assignment_id == assignment.id)
        )
    ).scalar_one_or_none()
    if vocab_assoc:
        vocab_words = vocab_assoc.words

    group_name = assignment.group.name if assignment.group else (
        (await db.execute(select(Group.name).where(Group.id == assignment.group_id))).scalar_one_or_none() or ""
    )
    return _assignment_to_out(assignment, group_name, sub_count, vocab_words)


@router.get("/{assignment_id}/file")
async def download_assignment_file(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Streams teacher attached homework file back to authenticated teacher or
    authorized student in that assignment's group.
    """
    assignment = (await db.execute(select(Assignment).where(Assignment.id == assignment_id))).scalar_one_or_none()
    if assignment is None or not assignment.file_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    if current_user.role == UserRole.STUDENT:
        student_profile = (
            await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
        ).scalar_one_or_none()
        if student_profile is None or student_profile.group_id != assignment.group_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if assignment.status != AssignmentStatus.PUBLISHED:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    path = await resolve_submission_file_async(assignment.file_path, db=db, fallback_name=assignment.file_original_name)
    return FileResponse(
        path=path,
        media_type=assignment.file_content_type or "application/octet-stream",
        filename=assignment.file_original_name or "assignment_file",
    )


@router.put("/{assignment_id}", response_model=AssignmentOut, dependencies=[Depends(require_teacher)])
@router.put("/{assignment_id}/", response_model=AssignmentOut, dependencies=[Depends(require_teacher)], include_in_schema=False)
async def edit_assignment_in_place(
    assignment_id: uuid.UUID,
    title: str = Form(...),
    description: str = Form(default="[]"),
    deadline: str = Form(...),
    is_hard_deadline: bool | None = Form(default=None),
    status_val: str = Form(default="published", alias="status"),
    order_index: int = Form(default=0),
    prerequisite_id: str | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    vocab_file: UploadFile | None = File(default=None),
    images: list[UploadFile] | None = File(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """
    Full in-place assignment editing. Preserves exact assignment ID and all linked
    submissions, grades, corrections, stars, comments.
    """
    clean_title = (title or "").strip()
    if not clean_title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment title cannot be empty",
        )

    clean_description = (description or "").strip() or "[]"

    # Resilient deadline parsing
    parsed_deadline: datetime | None = None
    if isinstance(deadline, datetime):
        parsed_deadline = deadline
    elif isinstance(deadline, str):
        try:
            parsed_deadline = datetime.fromisoformat(deadline.strip().replace("Z", "+00:00"))
        except Exception:
            try:
                from dateutil import parser as dt_parser
                parsed_deadline = dt_parser.parse(deadline.strip())
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid deadline format: '{deadline}'",
                )
    if not parsed_deadline:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Deadline is required",
        )

    # Prerequisite ID parsing (treating empty string, 'null', 'none' as None)
    prereq_uuid: uuid.UUID | None = None
    if prerequisite_id and prerequisite_id.strip().lower() not in ("null", "none", "undefined", ""):
        try:
            prereq_uuid = uuid.UUID(prerequisite_id.strip())
        except Exception:
            prereq_uuid = None

    assignment = (
        await db.execute(
            select(Assignment)
            .options(selectinload(Assignment.images), selectinload(Assignment.comments))
            .where(Assignment.id == assignment_id)
        )
    ).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    assign_status = AssignmentStatus.DRAFT if status_val.lower() == "draft" else (
        AssignmentStatus.ARCHIVED if status_val.lower() == "archived" else AssignmentStatus.PUBLISHED
    )

    now = utcnow()
    new_dl_utc = as_utc(parsed_deadline)
    old_dl_utc = as_utc(assignment.deadline)

    # Detect cycle rollover:
    # If the new deadline is in the future compared to now AND
    # (either the previous deadline was in the past OR the deadline changed forward to a new date)
    if new_dl_utc > now and (old_dl_utc <= now or new_dl_utc > old_dl_utc):
        old_cycle = getattr(assignment, "cycle_number", 1) or 1
        new_cycle = old_cycle + 1
        assignment.cycle_number = new_cycle

        # Also update group's current_cycle if group is behind
        grp = (await db.execute(select(Group).where(Group.id == assignment.group_id))).scalar_one_or_none()
        if grp and (getattr(grp, "current_cycle", 1) or 1) < new_cycle:
            grp.current_cycle = new_cycle

        # Mark previous cycle submissions as archived, preserving 100% of their historical data
        await db.execute(
            update(Submission)
            .where(
                Submission.assignment_id == assignment.id,
                Submission.cycle_number < new_cycle,
            )
            .values(is_archived=True)
        )

    assignment.title = clean_title
    assignment.description = clean_description
    assignment.deadline = parsed_deadline
    if is_hard_deadline is not None:
        assignment.is_hard_deadline = is_hard_deadline
    assignment.status = assign_status
    assignment.order_index = order_index
    assignment.prerequisite_id = prereq_uuid

    # Handle file replacement if a new one is uploaded
    if file is not None and file.filename:
        file_path, file_orig_name, file_content_type, file_size = await save_assignment_file(file, assignment.group_id, db=db)
        assignment.file_path = file_path
        assignment.file_original_name = file_orig_name
        assignment.file_content_type = file_content_type
        assignment.file_size_bytes = file_size

    # Handle additional images if provided
    valid_images = [img for img in (images or []) if img.filename]
    if valid_images:
        from app.models.assignment import AssignmentImage
        from app.utils.files import save_assignment_image

        current_count = len(assignment.images or [])
        if current_count + len(valid_images) > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum 10 images allowed per assignment. Currently has {current_count}.",
            )

        for idx, img_file in enumerate(valid_images):
            img_path, img_orig_name, img_content_type, img_size = await save_assignment_image(img_file, assignment.id, db=db)
            assign_img = AssignmentImage(
                assignment_id=assignment.id,
                file_path=img_path,
                file_original_name=img_orig_name,
                file_content_type=img_content_type,
                file_size_bytes=img_size,
                order_index=current_count + idx,
            )
            db.add(assign_img)

    # Handle vocab replacement/append
    vocab_words = []
    if vocab_file is not None and vocab_file.filename:
        content_bytes = await vocab_file.read()
        csv_text = content_bytes.decode("utf-8-sig", errors="replace")
        pairs = parse_vocab_csv(csv_text)

        vocab_assign = (
            await db.execute(
                select(VocabularyAssignment)
                .options(selectinload(VocabularyAssignment.words))
                .where(VocabularyAssignment.assignment_id == assignment.id)
            )
        ).scalar_one_or_none()

        if not vocab_assign:
            vocab_assign = VocabularyAssignment(
                teacher_id=current_user.id,
                group_id=assignment.group_id,
                assignment_id=assignment.id,
                title=f"Vocabulary: {assignment.title}",
                description=f"Vocabulary for assignment: {assignment.title}",
                deadline=parsed_deadline,
                is_active=True,
            )
            db.add(vocab_assign)
            await db.flush()

        for word, translation in pairs:
            vw = VocabularyWord(
                vocabulary_assignment_id=vocab_assign.id,
                english_word=word,
                translation=translation,
            )
            db.add(vw)
            vocab_words.append(vw)
    else:
        vocab_assoc = (
            await db.execute(
                select(VocabularyAssignment)
                .options(selectinload(VocabularyAssignment.words))
                .where(VocabularyAssignment.assignment_id == assignment.id)
            )
        ).scalar_one_or_none()
        if vocab_assoc:
            vocab_words = vocab_assoc.words

    await db.commit()

    reloaded = await _get_assignment_with_relations(db, assignment.id)
    if reloaded is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load updated assignment",
        )

    sub_count = (
        await db.execute(select(func.count()).select_from(Submission).where(Submission.assignment_id == assignment.id))
    ).scalar_one()

    group_name = reloaded.group.name if reloaded.group else (
        (await db.execute(select(Group.name).where(Group.id == assignment.group_id))).scalar_one_or_none() or ""
    )
    return _assignment_to_out(reloaded, group_name, sub_count, vocab_words)


@router.patch("/{assignment_id}", response_model=AssignmentOut, dependencies=[Depends(require_teacher)])
@router.patch("/{assignment_id}/", response_model=AssignmentOut, dependencies=[Depends(require_teacher)], include_in_schema=False)
async def update_assignment(
    assignment_id: uuid.UUID,
    body: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
):
    assignment = (await db.execute(select(Assignment).where(Assignment.id == assignment_id))).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    update_data = body.model_dump(exclude_unset=True)
    if "status" in update_data and update_data["status"] is not None:
        val = update_data["status"]
        if str(val).lower() == "published":
            assignment.status = AssignmentStatus.PUBLISHED
        elif str(val).lower() == "archived":
            assignment.status = AssignmentStatus.ARCHIVED
        else:
            assignment.status = AssignmentStatus.DRAFT
        del update_data["status"]

    for field, value in update_data.items():
        setattr(assignment, field, value)

    await db.commit()

    reloaded = await _get_assignment_with_relations(db, assignment.id)
    if reloaded is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load updated assignment",
        )

    sub_count = (
        await db.execute(select(func.count()).select_from(Submission).where(Submission.assignment_id == assignment.id))
    ).scalar_one()

    vocab_words = []
    vocab_assoc = (
        await db.execute(
            select(VocabularyAssignment)
            .options(selectinload(VocabularyAssignment.words))
            .where(VocabularyAssignment.assignment_id == assignment.id)
        )
    ).scalar_one_or_none()
    if vocab_assoc:
        vocab_words = vocab_assoc.words

    group_name = reloaded.group.name if reloaded.group else (
        (await db.execute(select(Group.name).where(Group.id == assignment.group_id))).scalar_one_or_none() or ""
    )
    return _assignment_to_out(reloaded, group_name, sub_count, vocab_words)


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_teacher)])
async def delete_assignment(assignment_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    assignment = (await db.execute(select(Assignment).where(Assignment.id == assignment_id))).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    sub_count = (
        await db.execute(select(func.count()).select_from(Submission).where(Submission.assignment_id == assignment.id))
    ).scalar_one()

    if sub_count > 0:
        # Protect historical submissions, grades, corrections, stars: soft delete as ARCHIVED
        assignment.status = AssignmentStatus.ARCHIVED
        await db.commit()
        return None

    await db.delete(assignment)
    await db.commit()
    return None


@router.post("/{assignment_id}/images", response_model=AssignmentImageOut, dependencies=[Depends(require_teacher)])
async def upload_assignment_image(
    assignment_id: uuid.UUID,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    from app.models.assignment import AssignmentImage
    from app.utils.files import save_assignment_image

    assignment = (await db.execute(select(Assignment).where(Assignment.id == assignment_id))).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    current_count = (
        await db.execute(
            select(func.count()).select_from(AssignmentImage).where(AssignmentImage.assignment_id == assignment_id)
        )
    ).scalar_one()
    if current_count >= 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 10 images allowed per assignment",
        )

    img_path, img_orig_name, img_content_type, img_size = await save_assignment_image(file, assignment_id, db=db)
    assign_img = AssignmentImage(
        assignment_id=assignment_id,
        file_path=img_path,
        file_original_name=img_orig_name,
        file_content_type=img_content_type,
        file_size_bytes=img_size,
        order_index=current_count,
    )
    db.add(assign_img)
    await db.commit()
    await db.refresh(assign_img)

    return AssignmentImageOut(
        id=assign_img.id,
        file_path=assign_img.file_path,
        original_name=assign_img.file_original_name,
        file_size=assign_img.file_size_bytes,
        order_index=assign_img.order_index,
        created_at=assign_img.created_at,
    )


@router.delete("/{assignment_id}/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_teacher)])
async def delete_assignment_image(
    assignment_id: uuid.UUID,
    image_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    from app.models.assignment import AssignmentImage

    img = (
        await db.execute(
            select(AssignmentImage).where(
                AssignmentImage.id == image_id,
                AssignmentImage.assignment_id == assignment_id,
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


@router.get("/{assignment_id}/images/{image_id}")
async def get_assignment_image(
    assignment_id: uuid.UUID,
    image_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.assignment import AssignmentImage

    assignment = (await db.execute(select(Assignment).where(Assignment.id == assignment_id))).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    if current_user.role == UserRole.STUDENT:
        student_profile = (
            await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
        ).scalar_one_or_none()
        if student_profile is None or student_profile.group_id != assignment.group_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if assignment.status != AssignmentStatus.PUBLISHED:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    img = (
        await db.execute(
            select(AssignmentImage).where(
                AssignmentImage.id == image_id,
                AssignmentImage.assignment_id == assignment_id,
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


async def _verify_assignment_access(
    assignment_id_str: str, current_user: User, db: AsyncSession
) -> tuple[uuid.UUID, Assignment]:
    try:
        a_id = uuid.UUID(str(assignment_id_str)) if isinstance(assignment_id_str, str) else assignment_id_str
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid assignment ID format")

    assignment_res = await db.execute(select(Assignment).where(Assignment.id == a_id))
    assignment = assignment_res.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Role-based authorization gate
    user_role_str = current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role)
    if user_role_str in ["teacher", "admin", "superadmin"] or current_user.role == UserRole.TEACHER:
        return a_id, assignment

    # Strict Group Privacy Isolation Gate for students
    if user_role_str == "student" or current_user.role == UserRole.STUDENT:
        sp_res = await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
        sp = sp_res.scalar_one_or_none()
        if not sp:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Student profile not found",
            )
        if assignment.group_id is not None and sp.group_id != assignment.group_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You are not enrolled in this cohort.",
            )
        if assignment.status != AssignmentStatus.PUBLISHED:
            raise HTTPException(status_code=404, detail="Assignment not found")

    return a_id, assignment


def _format_comment_out(c: AssignmentComment, current_user_id: uuid.UUID) -> AssignmentCommentOut:
    insp = sa_inspect(c)
    u = c.user if (insp is not None and "user" in insp.attrs and insp.attrs.user.loaded_value is not NO_VALUE) else None
    display_name = "User"
    role_str = "student"
    if u:
        u_insp = sa_inspect(u)
        sp = u.student_profile if (u_insp is not None and "student_profile" in u_insp.attrs and u_insp.attrs.student_profile.loaded_value is not NO_VALUE) else None
        tp = u.teacher_profile if (u_insp is not None and "teacher_profile" in u_insp.attrs and u_insp.attrs.teacher_profile.loaded_value is not NO_VALUE) else None
        display_name = (
            (sp.full_name if sp and sp.full_name else None)
            or (tp.full_name if tp and tp.full_name else None)
            or f"{getattr(u, 'first_name', '')} {getattr(u, 'last_name', '')}".strip()
            or getattr(u, "full_name", None)
            or u.username
        )
        role_str = u.role.value if hasattr(u.role, "value") else str(u.role)
        avatar_val = (
            (sp.avatar_url if sp and sp.avatar_url else None)
            or (tp.avatar_url if tp and tp.avatar_url else None)
            or f"/api/profile/{u.id}/avatar"
        )
    else:
        avatar_val = None

    liked_by = [str(uid) for uid in (c.liked_by_users or [])]
    is_liked = str(current_user_id) in liked_by

    return AssignmentCommentOut(
        id=c.id,
        assignment_id=c.assignment_id,
        user_id=c.user_id,
        user_name=display_name,
        user_full_name=display_name,
        user_role=role_str,
        content=c.content,
        created_at=c.created_at,
        updated_at=c.updated_at,
        likes=c.likes or len(liked_by),
        liked_by_users=liked_by,
        is_liked_by_me=is_liked,
        user_avatar_url=avatar_val,
        avatar_url=avatar_val,
    )


@router.get("/{assignment_id}/comments", response_model=list[AssignmentCommentOut])
async def list_assignment_comments(
    assignment_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    a_id, assignment = await _verify_assignment_access(assignment_id, current_user, db)

    comments = (
        await db.execute(
            select(AssignmentComment)
            .options(
                selectinload(AssignmentComment.user).selectinload(User.student_profile),
                selectinload(AssignmentComment.user).selectinload(User.teacher_profile),
            )
            .where(AssignmentComment.assignment_id == a_id)
            .order_by(AssignmentComment.created_at.asc())
        )
    ).scalars().all()

    return [_format_comment_out(c, current_user.id) for c in comments]


@router.post("/{assignment_id}/comments", response_model=AssignmentCommentOut)
async def create_assignment_comment(
    assignment_id: str,
    payload: AssignmentCommentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content_clean = payload.content.strip() if payload.content else ""
    if not content_clean:
        raise HTTPException(status_code=400, detail="Comment content cannot be empty")

    a_id, assignment = await _verify_assignment_access(assignment_id, current_user, db)

    # Idempotency & Debounce: check for duplicate comment posted within last 3 seconds
    recent = (
        await db.execute(
            select(AssignmentComment)
            .options(
                selectinload(AssignmentComment.user).selectinload(User.student_profile),
                selectinload(AssignmentComment.user).selectinload(User.teacher_profile),
            )
            .where(
                AssignmentComment.assignment_id == a_id,
                AssignmentComment.user_id == current_user.id,
                AssignmentComment.content == content_clean,
                AssignmentComment.created_at >= utcnow() - timedelta(seconds=3),
            )
        )
    ).scalars().first()
    if recent:
        return _format_comment_out(recent, current_user.id)

    new_comment = AssignmentComment(
        id=uuid.uuid4(),
        assignment_id=a_id,
        user_id=current_user.id,
        content=content_clean,
        likes=0,
        liked_by_users=[],
    )
    db.add(new_comment)
    await db.commit()

    refetched = (
        await db.execute(
            select(AssignmentComment)
            .options(
                selectinload(AssignmentComment.user).selectinload(User.student_profile),
                selectinload(AssignmentComment.user).selectinload(User.teacher_profile),
            )
            .where(AssignmentComment.id == new_comment.id)
        )
    ).scalars().first()

    if not refetched:
        raise HTTPException(status_code=500, detail="Failed to retrieve created comment")

    return _format_comment_out(refetched, current_user.id)


@router.put("/{assignment_id}/comments/{comment_id}", response_model=AssignmentCommentOut)
async def update_assignment_comment(
    assignment_id: str,
    comment_id: str,
    payload: AssignmentCommentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content_clean = payload.content.strip() if payload.content else ""
    if not content_clean:
        raise HTTPException(status_code=400, detail="Comment content cannot be empty")

    a_id, assignment = await _verify_assignment_access(assignment_id, current_user, db)

    try:
        c_id = uuid.UUID(str(comment_id)) if isinstance(comment_id, str) else comment_id
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid comment ID format")

    comment = (
        await db.execute(
            select(AssignmentComment)
            .options(
                selectinload(AssignmentComment.user).selectinload(User.student_profile),
                selectinload(AssignmentComment.user).selectinload(User.teacher_profile),
            )
            .where(AssignmentComment.id == c_id, AssignmentComment.assignment_id == a_id)
        )
    ).scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the comment author can edit this comment")

    comment.content = content_clean
    comment.updated_at = utcnow()
    await db.commit()

    refetched = (
        await db.execute(
            select(AssignmentComment)
            .options(
                selectinload(AssignmentComment.user).selectinload(User.student_profile),
                selectinload(AssignmentComment.user).selectinload(User.teacher_profile),
            )
            .where(AssignmentComment.id == comment.id)
        )
    ).scalar_one()

    return _format_comment_out(refetched, current_user.id)


@router.delete("/{assignment_id}/comments/{comment_id}")
async def delete_assignment_comment(
    assignment_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    a_id, assignment = await _verify_assignment_access(assignment_id, current_user, db)

    try:
        c_id = uuid.UUID(str(comment_id)) if isinstance(comment_id, str) else comment_id
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid comment ID format")

    comment = (
        await db.execute(
            select(AssignmentComment)
            .where(AssignmentComment.id == c_id, AssignmentComment.assignment_id == a_id)
        )
    ).scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.user_id != current_user.id and current_user.role != UserRole.TEACHER:
        raise HTTPException(status_code=403, detail="Permission denied to delete this comment")

    await db.delete(comment)
    await db.commit()
    return {"success": True, "message": "Comment deleted successfully"}


@router.post("/{assignment_id}/comments/{comment_id}/like", response_model=AssignmentCommentOut)
async def toggle_like_assignment_comment(
    assignment_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    a_id, assignment = await _verify_assignment_access(assignment_id, current_user, db)

    try:
        c_id = uuid.UUID(str(comment_id)) if isinstance(comment_id, str) else comment_id
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid comment ID format")

    comment = (
        await db.execute(
            select(AssignmentComment)
            .options(
                selectinload(AssignmentComment.user).selectinload(User.student_profile),
                selectinload(AssignmentComment.user).selectinload(User.teacher_profile),
            )
            .where(AssignmentComment.id == c_id, AssignmentComment.assignment_id == a_id)
        )
    ).scalar_one_or_none()

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    liked_by = [str(uid) for uid in (comment.liked_by_users or [])]
    user_id_str = str(current_user.id)

    if user_id_str in liked_by:
        liked_by.remove(user_id_str)
    else:
        liked_by.append(user_id_str)

    comment.liked_by_users = liked_by
    comment.likes = len(liked_by)
    await db.commit()

    refetched = (
        await db.execute(
            select(AssignmentComment)
            .options(
                selectinload(AssignmentComment.user).selectinload(User.student_profile),
                selectinload(AssignmentComment.user).selectinload(User.teacher_profile),
            )
            .where(AssignmentComment.id == comment.id)
        )
    ).scalar_one()

    return _format_comment_out(refetched, current_user.id)



