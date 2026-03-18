"""
정규직(Employee) ORM 모델.
사번 화이트리스트 역할. 사번 로그인 시 이 테이블로 유효성을 검증한다.
"""

from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Employee(Base):
    """
    정규직 사원 테이블.

    Attributes:
        id: 기본키
        emp_no: 사원번호 (고유)
        language: 언어 코드
        group_id: 소속 그룹 FK (nullable)
        created_at: 등록 시각
    """

    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    emp_no: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="ko")
    group_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("groups.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    # 관계
    group = relationship("Group", back_populates="employees")
    checkins = relationship("CheckSession", back_populates="employee")
