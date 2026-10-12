import os
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update

from app.core.config import settings
from app.models.vocabulary import VocabularyAssignment
from app.models.assignment import Assignment
from app.api.deps import get_current_user
from app.db.session import get_db

router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/recover_vocab", status_code=status.HTTP_200_OK)
async def recover_vocabulary_links(current_user=Depends(get_current_user)):
    # Simple admin check (assuming user role admin)
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    # Use async engine from settings
    engine = create_async_engine(settings.ASYNC_DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        stmt = select(VocabularyAssignment).where(VocabularyAssignment.group_id == None, VocabularyAssignment.assignment_id != None)
        result = await session.execute(stmt)
        vocab_assignments = result.scalars().all()
        updated = 0
        for va in vocab_assignments:
            assignment = await session.get(Assignment, va.assignment_id)
            if assignment and assignment.group_id:
                await session.execute(
                    update(VocabularyAssignment)
                    .where(VocabularyAssignment.id == va.id)
                    .values(group_id=assignment.group_id)
                )
                updated += 1
        if updated:
            await session.commit()
    return {"message": f"Recovered {updated} vocabulary assignments"}
