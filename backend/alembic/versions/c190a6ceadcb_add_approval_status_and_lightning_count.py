from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'c190a6ceadcb'
down_revision: Union[str, None] = 'd21a26c03c18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    approval_status_enum = sa.Enum('pending', 'approved', 'rejected', name='approval_status')
    approval_status_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('users', sa.Column('approval_status', sa.Enum('pending', 'approved', 'rejected', name='approval_status'), nullable=False, server_default='approved'))
    op.add_column('student_profiles', sa.Column('total_lightning', sa.Integer(), nullable=False, server_default='0'))

def downgrade() -> None:
    op.drop_column('student_profiles', 'total_lightning')
    op.drop_column('users', 'approval_status')
    approval_status_enum = sa.Enum('pending', 'approved', 'rejected', name='approval_status')
    approval_status_enum.drop(op.get_bind(), checkfirst=True)
