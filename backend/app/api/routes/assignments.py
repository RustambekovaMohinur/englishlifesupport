import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_student_profile, get_current_user, require_teacher
from app.db.session import get_db
from app.models.assignment import Assignment, AssignmentStatus
from app.models.group import Group
from app.models.student import StudentProfile
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.models.vocabulary import VocabularyAssignment, VocabularyWord
from app.schemas.assignment import (
    AssignmentCreate,
    AssignmentForStudent,
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
    return AssignmentOut(
        id=assignment.id,
        group_id=assignment.group_id,
        group_name=group_name,
        title=assignment.title,
        description=assignment.description,
        deadline=assignment.deadline,
        status=assignment.status.value if hasattr(assignment.status, "value") else str(assignment.status),
        file_url=f"/api/assignments/{assignment.id}/file" if assignment.file_path else None,
        file_original_name=assignment.file_original_name,
        vocab_words=vocab_items,
        created_at=assignment.created_at,
        submission_count=sub_count,
        order_index=getattr(assignment, "order_index", 0) or 0,
        prerequisite_id=getattr(assignment, "prerequisite_id", None),
    )


@router.get("", response_model=list[AssignmentOut], dependencies=[Depends(require_teacher)])
async def list_assignments(
    db: AsyncSession = Depends(get_db),
    group_id: uuid.UUID | None = Query(default=None),
):
    query = select(Assignment, Group.name).join(Group, Assignment.group_id == Group.id)
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
async def create_assignment(
    group_id: uuid.UUID = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    deadline: datetime = Form(...),
    status_val: str = Form(default="published", alias="status"),
    order_index: int = Form(default=0),
    prerequisite_id: uuid.UUID | None = Form(default=None),
    file: UploadFile | None = File(default=None),
    vocab_file: UploadFile | None = File(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_teacher),
):
    """
    Creates an assignment for a group.
    - Default status is 'published'.
    - Rejects creating assignments for archived groups.
    - Accepts optional homework attachment file (up to 10MB).
    - Accepts optional vocabulary CSV file (word,translation format).
    """
    group = (await db.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group not found")
    if not group.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create assignments for an archived group",
        )

    assign_status = AssignmentStatus.DRAFT if status_val.lower() == "draft" else AssignmentStatus.PUBLISHED

    file_path = None
    file_orig_name = None
    file_content_type = None
    file_size = None

    if file is not None and file.filename:
        file_path, file_orig_name, file_content_type, file_size = await save_assignment_file(file, group_id, db=db)

    assignment = Assignment(
        group_id=group_id,
        title=title.strip(),
        description=description.strip(),
        deadline=deadline,
        status=assign_status,
        order_index=order_index,
        prerequisite_id=prerequisite_id,
        file_path=file_path,
        file_original_name=file_orig_name,
        file_content_type=file_content_type,
        file_size_bytes=file_size,
        created_by=current_user.id,
    )
    db.add(assignment)
    await db.flush()

    vocab_words = []
    if vocab_file is not None and vocab_file.filename:
        content_bytes = await vocab_file.read()
        csv_text = content_bytes.decode("utf-8-sig", errors="replace")
        pairs = parse_vocab_csv(csv_text)

        vocab_assign = VocabularyAssignment(
            teacher_id=current_user.id,
            group_id=group_id,
            assignment_id=assignment.id,
            title=f"Vocabulary: {assignment.title}",
            description=f"Vocabulary for assignment: {assignment.title}",
            deadline=deadline,
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
    await db.refresh(assignment)

    return _assignment_to_out(assignment, group.name, 0, vocab_words)


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

    assignments = (
        await db.execute(
            select(Assignment)
            .where(
                Assignment.group_id == profile.group_id,
                Assignment.status == AssignmentStatus.PUBLISHED,
            )
            .order_by(Assignment.deadline.desc())
        )
    ).scalars().all()

    result = []
    now = utcnow()
    for assignment in assignments:
        submission = (
            await db.execute(
                select(Submission)
                .options(selectinload(Submission.grade))
                .where(Submission.assignment_id == assignment.id, Submission.student_id == profile.id)
            )
        ).scalar_one_or_none()

        score = None
        submission_id = None
        if submission:
            submission_id = submission.id
            if submission.grade:
                score = submission.grade.score

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

        vocab_items = [
            VocabWordItem(
                id=w.id,
                english_word=w.english_word,
                translation=w.translation,
                example_sentence=w.example_sentence,
            )
            for w in vocab_words
        ]

        is_locked, lock_reason = await is_assignment_locked_for_student(db, assignment.id, profile.id)

        result.append(
            AssignmentForStudent(
                id=assignment.id,
                title=assignment.title,
                description=assignment.description,
                deadline=assignment.deadline,
                status=assignment.status.value if hasattr(assignment.status, "value") else str(assignment.status),
                file_url=f"/api/assignments/{assignment.id}/file" if assignment.file_path else None,
                file_original_name=assignment.file_original_name,
                vocab_words=vocab_items,
                is_past_deadline=as_utc(assignment.deadline) < now,
                submission_status=submission.status.value if submission else None,
                score=score,
                submission_id=submission_id,
                order_index=getattr(assignment, "order_index", 0) or 0,
                prerequisite_id=getattr(assignment, "prerequisite_id", None),
                is_locked=is_locked,
                lock_reason=lock_reason,
            )
        )
    return result


@router.get("/{assignment_id}", response_model=AssignmentOut)
async def get_assignment(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    assignment = (await db.execute(select(Assignment).where(Assignment.id == assignment_id))).scalar_one_or_none()
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

    group = (await db.execute(select(Group).where(Group.id == assignment.group_id))).scalar_one()
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

    return _assignment_to_out(assignment, group.name, sub_count, vocab_words)


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


@router.patch("/{assignment_id}", response_model=AssignmentOut, dependencies=[Depends(require_teacher)])
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
        assignment.status = AssignmentStatus.PUBLISHED if str(val).lower() == "published" else AssignmentStatus.DRAFT
        del update_data["status"]

    for field, value in update_data.items():
        setattr(assignment, field, value)

    await db.commit()
    await db.refresh(assignment)

    group = (await db.execute(select(Group).where(Group.id == assignment.group_id))).scalar_one()
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

    return _assignment_to_out(assignment, group.name, sub_count, vocab_words)


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_teacher)])
async def delete_assignment(assignment_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    assignment = (await db.execute(select(Assignment).where(Assignment.id == assignment_id))).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    await db.delete(assignment)
    await db.commit()
    return None
