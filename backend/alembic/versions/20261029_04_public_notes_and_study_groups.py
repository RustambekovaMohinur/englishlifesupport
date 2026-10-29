"""public notes and study groups

Revision ID: 20261029_04_public_notes_and_study_groups
Revises: 20261029_03_premium_and_social_profiles
Create Date: 2026-10-29 13:40:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20261029_04_public_notes_and_study_groups'
down_revision = '20261029_03_premium_and_social_profiles'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
    CREATE TABLE IF NOT EXISTS public_notes (
        id UUID PRIMARY KEY,
        author_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'general',
        is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
        likes_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_public_notes_author_id ON public_notes(author_id);
    CREATE INDEX IF NOT EXISTS ix_public_notes_category ON public_notes(category);

    CREATE TABLE IF NOT EXISTS note_likes (
        id UUID PRIMARY KEY,
        note_id UUID NOT NULL REFERENCES public_notes(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_note_student_like UNIQUE (note_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS ix_note_likes_note_id ON note_likes(note_id);
    CREATE INDEX IF NOT EXISTS ix_note_likes_student_id ON note_likes(student_id);

    CREATE TABLE IF NOT EXISTS study_groups (
        id UUID PRIMARY KEY,
        creator_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        topic VARCHAR(64) NOT NULL DEFAULT 'IELTS / General English',
        max_members INTEGER NOT NULL DEFAULT 8,
        invite_code VARCHAR(16) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ix_study_groups_creator_id ON study_groups(creator_id);
    CREATE INDEX IF NOT EXISTS ix_study_groups_invite_code ON study_groups(invite_code);

    CREATE TABLE IF NOT EXISTS study_group_members (
        id UUID PRIMARY KEY,
        study_group_id UUID NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
        student_id UUID NOT NULL REFERENCES student_profiles(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'member',
        joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_study_group_member UNIQUE (study_group_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS ix_study_group_members_study_group_id ON study_group_members(study_group_id);
    CREATE INDEX IF NOT EXISTS ix_study_group_members_student_id ON study_group_members(student_id);
    """)


def downgrade():
    op.execute("""
    DROP TABLE IF EXISTS study_group_members;
    DROP TABLE IF EXISTS study_groups;
    DROP TABLE IF EXISTS note_likes;
    DROP TABLE IF EXISTS public_notes;
    """)
