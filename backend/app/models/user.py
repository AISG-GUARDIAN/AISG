"""
일용직 작업자(User) ORM 모델.
자동 발급된 system_id로 로그인하는 일용직 작업자 정보를 저장한다.
"""

from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    """
    일용직 작업자 테이블.
    system_id는 전화번호 뒷자리로 자동 발급되는 로그인 키 (예: USR-20260313-1234-0001).

    Attributes:
        id: 기본키
        system_id: 자동 발급 로그인 키 (고유)
        language: 언어 코드 (ko/en/vi/zh 등)
        group_id: 소속 그룹 FK (nullable)
        created_at: 생성 시각
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    system_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="ko")
    group_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    # 관계
    group = relationship("Group", back_populates="users")
    check_sessions = relationship("CheckSession", back_populates="user")
