"""add_vocabulary_and_group_creator

Revision ID: af6a81ffcb42
Revises: 0001_initial
Create Date: 2026-08-26 08:26:52.564600

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'af6a81ffcb42'
down_revision: Union[str, None] = '0001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---------------------------------------------------------------
    # 1. Add created_by to groups (nullable to preserve existing data)
    # ---------------------------------------------------------------
    op.add_column('groups', sa.Column('created_by', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_groups_created_by_users',
        'groups', 'users',
        ['created_by'], ['id'],
        ondelete='SET NULL'
    )

    # Assign existing groups to the first teacher (safe migration for existing data)
    connection = op.get_bind()
    first_teacher = connection.execute(
        sa.text("SELECT id FROM users WHERE role = 'teacher' ORDER BY created_at LIMIT 1")
    ).fetchone()
    if first_teacher:
        connection.execute(
            sa.text("UPDATE groups SET created_by = :tid WHERE created_by IS NULL"),
            {"tid": first_teacher[0]}
        )

    # ---------------------------------------------------------------
    # 2. Vocabulary Assignments table
    # ---------------------------------------------------------------
    op.create_table(
        'vocabulary_assignments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('teacher_id', sa.UUID(), nullable=False),
        sa.Column('group_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('deadline', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['teacher_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_vocabulary_assignments_deadline', 'vocabulary_assignments', ['deadline'], unique=False)
    op.create_index('ix_vocabulary_assignments_group_id', 'vocabulary_assignments', ['group_id'], unique=False)
    op.create_index('ix_vocabulary_assignments_teacher_id', 'vocabulary_assignments', ['teacher_id'], unique=False)

    # ---------------------------------------------------------------
    # 3. Vocabulary Words table
    # ---------------------------------------------------------------
    op.create_table(
        'vocabulary_words',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('vocabulary_assignment_id', sa.UUID(), nullable=False),
        sa.Column('english_word', sa.String(length=255), nullable=False),
        sa.Column('translation', sa.String(length=255), nullable=False),
        sa.Column('example_sentence', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['vocabulary_assignment_id'], ['vocabulary_assignments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_vocabulary_words_vocabulary_assignment_id',
        'vocabulary_words',
        ['vocabulary_assignment_id'],
        unique=False
    )

    # ---------------------------------------------------------------
    # 4. Vocabulary Attempts table (with is_completed, nullable completed_at)
    # ---------------------------------------------------------------
    op.create_table(
        'vocabulary_attempts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('vocabulary_assignment_id', sa.UUID(), nullable=False),
        sa.Column('student_id', sa.UUID(), nullable=False),
        sa.Column('total_questions', sa.Integer(), nullable=False),
        sa.Column('correct_answers', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('incorrect_answers', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('percentage', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('is_completed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['student_id'], ['student_profiles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vocabulary_assignment_id'], ['vocabulary_assignments.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'vocabulary_assignment_id', 'student_id',
            name='uq_vocab_attempt_assignment_student'
        ),
    )
    op.create_index('ix_vocabulary_attempts_student_id', 'vocabulary_attempts', ['student_id'], unique=False)
    op.create_index(
        'ix_vocabulary_attempts_vocabulary_assignment_id',
        'vocabulary_attempts',
        ['vocabulary_assignment_id'],
        unique=False
    )

    # ---------------------------------------------------------------
    # 5. Vocabulary Answers table (with unique constraint per word per attempt)
    # ---------------------------------------------------------------
    op.create_table(
        'vocabulary_answers',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('attempt_id', sa.UUID(), nullable=False),
        sa.Column('vocabulary_word_id', sa.UUID(), nullable=False),
        sa.Column('student_answer', sa.String(length=255), nullable=False),
        sa.Column('is_correct', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['attempt_id'], ['vocabulary_attempts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vocabulary_word_id'], ['vocabulary_words.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'attempt_id', 'vocabulary_word_id',
            name='uq_vocab_answer_attempt_word'
        ),
    )
    op.create_index('ix_vocabulary_answers_attempt_id', 'vocabulary_answers', ['attempt_id'], unique=False)
    op.create_index(
        'ix_vocabulary_answers_vocabulary_word_id',
        'vocabulary_answers',
        ['vocabulary_word_id'],
        unique=False
    )


def downgrade() -> None:
    op.drop_index('ix_vocabulary_answers_vocabulary_word_id', table_name='vocabulary_answers')
    op.drop_index('ix_vocabulary_answers_attempt_id', table_name='vocabulary_answers')
    op.drop_table('vocabulary_answers')

    op.drop_index('ix_vocabulary_attempts_vocabulary_assignment_id', table_name='vocabulary_attempts')
    op.drop_index('ix_vocabulary_attempts_student_id', table_name='vocabulary_attempts')
    op.drop_table('vocabulary_attempts')

    op.drop_index('ix_vocabulary_words_vocabulary_assignment_id', table_name='vocabulary_words')
    op.drop_table('vocabulary_words')

    op.drop_index('ix_vocabulary_assignments_teacher_id', table_name='vocabulary_assignments')
    op.drop_index('ix_vocabulary_assignments_group_id', table_name='vocabulary_assignments')
    op.drop_index('ix_vocabulary_assignments_deadline', table_name='vocabulary_assignments')
    op.drop_table('vocabulary_assignments')

    op.drop_constraint('fk_groups_created_by_users', 'groups', type_='foreignkey')
    op.drop_column('groups', 'created_by')
