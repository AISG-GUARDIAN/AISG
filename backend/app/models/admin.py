"""
관리자(Admin) ORM 모델.
사원번호(emp_no)로 로그인하는 관리자 계정 정보를 저장한다.
"""

from datetime import datetime, timezone

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Admin(Base):
    """
    관리자 테이블.
    사원번호만으로 인증하며, 별도 비밀번호는 사용하지 않는다.

    Attributes:
        id: 기본키
        emp_no: 사원번호 (고유, 로그인 키)
        created_at: 생성 시각
    """

    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    emp_no: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    # 관계
    groups = relationship("Group", back_populates="admin")
    reports = relationship("Report", back_populates="admin")
