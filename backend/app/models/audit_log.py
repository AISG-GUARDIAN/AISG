"""
감사 로그(AuditLog) ORM 모델.
관리자의 주요 행위를 기록하여 추적 가능하게 한다.
"""

from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditLog(Base):
    """
    감사 로그 테이블.

    Attributes:
        id: 기본키
        admin_id: 수행 관리자 FK
        admin_name: 수행 관리자 이름 FK
        action: 수행 행위 (override_pass, user_create, group_create 등)
        target_type: 대상 유형 (check_session, user, group 등)
        target_id: 대상 레코드 ID
        detail: 상세 내용 JSON (변경 전/후 값)
        created_at: 생성 시각
    """

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    admin_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("admins.id", ondelete="RESTRICT"), nullable=False
    )
    admin_name: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    target_type: Mapped[str] = mapped_column(String(50), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )
