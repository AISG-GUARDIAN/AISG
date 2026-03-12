"""
관리자 오버라이드(AdminOverride) ORM 모델.
관리자가 3회 실패한 작업자를 수동으로 통과 처리한 기록을 저장한다.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AdminOverride(Base):
    """
    관리자 수동 통과 처리 테이블.

    Attributes:
        id: 기본키
        session_id: 대상 체크인 세션 FK
        admin_id: 처리한 관리자 FK (admins.id)
        admin_emp_no: 처리한 관리자 사번 (비정규화)
        admin_name: 처리한 관리자 이름 (비정규화)
        reason: 통과 사유 (선택)
        overridden_at: 처리 시각
    """

    __tablename__ = "admin_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("check_sessions.id", ondelete="RESTRICT"), nullable=False
    )
    admin_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("admins.id", ondelete="RESTRICT"), nullable=False
    )
    admin_emp_no: Mapped[str] = mapped_column(String(50), nullable=False)
    admin_name: Mapped[str] = mapped_column(String(100), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    overridden_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # 관계
    session = relationship("CheckSession", back_populates="override")
