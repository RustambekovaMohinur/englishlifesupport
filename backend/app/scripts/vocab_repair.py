import sys, os
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import sessionmaker

# Ensure project root is in sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from app.core.config import settings
from app.models.vocabulary import VocabularyAssignment
from app.models.assignment import Assignment

def main() -> None:
    # Use synchronous DB URL, fallback to SQLite file
    db_url = settings.DATABASE_URL or "sqlite:///./test.db"
    engine = create_engine(db_url, echo=False)
    SessionLocal = sessionmaker(bind=engine)
    updated = 0
    with SessionLocal() as session:
        stmt = select(VocabularyAssignment).where(VocabularyAssignment.group_id == None, VocabularyAssignment.assignment_id != None)
        vocab_assignments = session.execute(stmt).scalars().all()
        for va in vocab_assignments:
            assignment = session.get(Assignment, va.assignment_id)
            if assignment and assignment.group_id:
                session.execute(
                    update(VocabularyAssignment)
                    .where(VocabularyAssignment.id == va.id)
                    .values(group_id=assignment.group_id)
                )
                updated += 1
        if updated:
            session.commit()
    print(f"VocabularyAssignment rows updated: {updated}")

if __name__ == "__main__":
    main()
