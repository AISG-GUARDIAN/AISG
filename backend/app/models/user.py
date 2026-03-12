"""
작업자(User) ORM 모델.
자동 발급된 system_id로 로그인하는 현장 작업자 정보를 저장한다.
"""

from datetime import datetime, timezone

from sqlalchemy import  ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    """
    작업자 테이블.
    system_id는 전화번호 뒷자리로 자동 발급되는 로그인 키 (예: USR-2026).
    정규직 직원일 경우 emp_no에 사번이 저장되어 자동 발급 여부를 판단한다.

    Attributes:
        id: 기본키
        system_id: 자동 발급 로그인 키 (고유)
        emp_no: 정규직 사원번호 (고유, nullable)
        language: 언어 코드 (ko/en/vi/zh 등)
        group_id: 소속 그룹 FK (nullable)
        created_at: 생성 시각
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    system_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    emp_no: Mapped[str | None] = mapped_column(String(10), unique=True, nullable=True)
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
