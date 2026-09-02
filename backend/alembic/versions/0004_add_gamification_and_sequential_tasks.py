"""add_gamification_and_sequential_tasks

Revision ID: 0004_gamification
Revises: 0003_status_files
Create Date: 2026-09-02 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0004_gamification'
down_revision: Union[str, None] = '0003_status_files'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

star_tx_reason = postgresql.ENUM(
    'on_time_submission',
    'early_submission',
    'vocabulary_achievement',
    'perfect_week',
    'student_of_the_week',
    'late_penalty',
    'teacher_adjustment',
    'free_pass_refund',
    name='star_transaction_reason',
)


def upgrade() -> None:
    bind = op.get_bind()
    star_tx_reason.create(bind, checkfirst=True)

    # 1. Add columns to assignments table
    op.add_column('assignments', sa.Column('order_index', sa.BigInteger(), nullable=False, server_default='0'))
    op.add_column('assignments', sa.Column('prerequisite_id', sa.UUID(), sa.ForeignKey('assignments.id', ondelete='SET NULL'), nullable=True))
    op.create_index(op.f('ix_assignments_prerequisite_id'), 'assignments', ['prerequisite_id'], unique=False)

    # 2. star_transactions
    op.create_table(
        'star_transactions',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('student_id', sa.UUID(), sa.ForeignKey('student_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('reason', postgresql.ENUM(
            'on_time_submission',
            'early_submission',
            'vocabulary_achievement',
            'perfect_week',
            'student_of_the_week',
            'late_penalty',
            'teacher_adjustment',
            'free_pass_refund',
            name='star_transaction_reason',
            create_type=False,
        ), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('reference_id', sa.String(length=100), nullable=True),
        sa.UniqueConstraint('student_id', 'reason', 'reference_id', name='uq_star_tx_student_reason_ref'),
    )
    op.create_index(op.f('ix_star_transactions_student_id'), 'star_transactions', ['student_id'], unique=False)
    op.create_index(op.f('ix_star_transactions_reference_id'), 'star_transactions', ['reference_id'], unique=False)

    # 3. free_passes
    op.create_table(
        'free_passes',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('student_id', sa.UUID(), sa.ForeignKey('student_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('month_key', sa.String(length=7), nullable=False),
        sa.Column('is_used', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('used_for_assignment_id', sa.UUID(), sa.ForeignKey('assignments.id', ondelete='SET NULL'), nullable=True),
        sa.UniqueConstraint('student_id', 'month_key', name='uq_free_pass_student_month'),
    )
    op.create_index(op.f('ix_free_passes_student_id'), 'free_passes', ['student_id'], unique=False)

    # 4. student_streaks
    op.create_table(
        'student_streaks',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('student_id', sa.UUID(), sa.ForeignKey('student_profiles.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('current_streak', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('longest_streak', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_activity_date', sa.String(length=10), nullable=True),
    )

    # 5. student_xp
    op.create_table(
        'student_xp',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('student_id', sa.UUID(), sa.ForeignKey('student_profiles.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('total_xp', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('level', sa.Integer(), nullable=False, server_default='1'),
    )

    # 6. xp_transactions
    op.create_table(
        'xp_transactions',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('student_id', sa.UUID(), sa.ForeignKey('student_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('activity_type', sa.String(length=50), nullable=False),
        sa.Column('reference_id', sa.String(length=100), nullable=True),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.UniqueConstraint('student_id', 'activity_type', 'reference_id', name='uq_xp_tx_student_act_ref'),
    )
    op.create_index(op.f('ix_xp_transactions_student_id'), 'xp_transactions', ['student_id'], unique=False)
    op.create_index(op.f('ix_xp_transactions_reference_id'), 'xp_transactions', ['reference_id'], unique=False)

    # 7. achievements
    op.create_table(
        'achievements',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('student_id', sa.UUID(), sa.ForeignKey('student_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('badge_key', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=100), nullable=False),
        sa.Column('description', sa.String(length=255), nullable=False),
        sa.Column('icon', sa.String(length=50), nullable=False),
        sa.Column('unlocked_at', sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint('student_id', 'badge_key', name='uq_achievement_student_badge'),
    )
    op.create_index(op.f('ix_achievements_student_id'), 'achievements', ['student_id'], unique=False)

    # 8. task_lock_overrides
    op.create_table(
        'task_lock_overrides',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('student_id', sa.UUID(), sa.ForeignKey('student_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('assignment_id', sa.UUID(), sa.ForeignKey('assignments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('is_unlocked', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('overridden_by', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.UniqueConstraint('student_id', 'assignment_id', name='uq_task_lock_override'),
    )
    op.create_index(op.f('ix_task_lock_overrides_student_id'), 'task_lock_overrides', ['student_id'], unique=False)
    op.create_index(op.f('ix_task_lock_overrides_assignment_id'), 'task_lock_overrides', ['assignment_id'], unique=False)

    # 9. student_of_the_week
    op.create_table(
        'student_of_the_week',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('group_id', sa.UUID(), sa.ForeignKey('groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('student_id', sa.UUID(), sa.ForeignKey('student_profiles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('week_key', sa.String(length=10), nullable=False),
        sa.Column('stars_awarded', sa.Integer(), nullable=False, server_default='50'),
        sa.Column('selected_by', sa.UUID(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('reason', sa.String(length=255), nullable=True),
        sa.UniqueConstraint('group_id', 'week_key', name='uq_sotw_group_week'),
    )
    op.create_index(op.f('ix_student_of_the_week_group_id'), 'student_of_the_week', ['group_id'], unique=False)
    op.create_index(op.f('ix_student_of_the_week_student_id'), 'student_of_the_week', ['student_id'], unique=False)


def downgrade() -> None:
    op.drop_table('student_of_the_week')
    op.drop_table('task_lock_overrides')
    op.drop_table('achievements')
    op.drop_table('xp_transactions')
    op.drop_table('student_xp')
    op.drop_table('student_streaks')
    op.drop_table('free_passes')
    op.drop_table('star_transactions')
    op.drop_index(op.f('ix_assignments_prerequisite_id'), table_name='assignments')
    op.drop_column('assignments', 'prerequisite_id')
    op.drop_column('assignments', 'order_index')
    bind = op.get_bind()
    star_tx_reason.drop(bind, checkfirst=True)
