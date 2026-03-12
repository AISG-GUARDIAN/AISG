"""
체크인 세션(CheckSession) ORM 모델.
작업자의 안전물품(안전모·조끼) 촬영·판정 기록을 저장한다.
하루 최대 3회 시도, 안전모/조끼 각각 pass/fail 판정.
"""

from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CheckSession(Base):
    """
    체크인 세션 테이블.

    Attributes:
        id: 기본키
        user_id: 작업자 FK
        date: 체크인 날짜
        attempt_count: 시도 횟수 (1~3)
        helmet_pass: 안전모 착용 여부 (Azure CV 결과)
        vest_pass: 안전조끼 착용 여부 (Azure CV 결과)
        cv_confidence: Azure CV 신뢰도 점수 (0.0~1.0)
        image_url: 촬영 이미지 Blob URL
        status: 판정 상태 (pending/pass/fail/pass_override)
        checked_at: 체크 시각
    """

    __tablename__ = "check_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    helmet_pass: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    vest_pass: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    cv_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )  # pending / pass / fail / pass_override
    checked_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # 관계
    user = relationship("User", back_populates="check_sessions")
    override = relationship("AdminOverride", back_populates="session", uselist=False)
