"""
그룹(Group) ORM 모델.
작업자를 묶는 그룹(반/조) 정보를 저장한다.
"""

from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Group(Base):
    """
    그룹 테이블.

    Attributes:
        id: 기본키
        admin_id: 소속 관리자 FK
        name: 그룹명 (예: A반, 1조)
        created_at: 생성 시각
    """

    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    admin_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("admins.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    # 관계
    admin = relationship("Admin", back_populates="groups")
    users = relationship("User", back_populates="group")
