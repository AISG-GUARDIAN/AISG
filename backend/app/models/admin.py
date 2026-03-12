"""
관리자(Admin) ORM 모델.
사원번호(emp_no)로 로그인하는 관리자 계정 정보를 저장한다.
"""

from datetime import datetime, timezone

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Admin(Base):
    """
    관리자 테이블.
    사원번호만으로 인증하며, 별도 비밀번호는 사용하지 않는다.

    Attributes:
        id: 기본키
        emp_no: 사원번호 (고유, 로그인 키)
        name: 관리자 이름
        created_at: 생성 시각
    """

    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    emp_no: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(timezone.utc)
    )

    # 관계: 관리자가 관리하는 그룹 목록
    groups = relationship("Group", back_populates="admin")
