import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base, UUIDPKMixin


class FileBlob(UUIDPKMixin, Base):
    __tablename__ = 'file_blobs'

    file_path: Mapped[str] = mapped_column(String(500), unique=True, nullable=False, index=True)
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
