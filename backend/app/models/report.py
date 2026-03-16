"""
보고서(Report) ORM 모델.
LLM이 생성한 일/주/월 통계 보고서를 저장한다.
"""

from datetime import date, datetime, timezone

from sqlalchemy import Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Report(Base):
    """
    보고서 테이블.

    Attributes:
        id: 기본키
        admin_id: 요청한 관리자 FK
        period_type: 기간 유형 (daily / weekly / monthly)
        period_from: 기간 시작일
        period_to: 기간 종료일
        status: 생성 상태 (processing / done / error)
        content: LLM 생성 보고서 본문
        file_url: Azure Blob에 저장된 파일 URL
        created_at: 생성 시각
    """

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    admin_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("admins.id", ondelete="RESTRICT"), nullable=False
    )
    period_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # daily / weekly / monthly
    period_from: Mapped[date] = mapped_column(Date, nullable=False)
    period_to: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="processing"
    )  # processing / done / error
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    # 관계
    admin = relationship("Admin", back_populates="reports")
