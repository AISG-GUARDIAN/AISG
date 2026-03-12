"""
인증 서비스.
관리자(사원번호)/작업자(시스템ID) 로그인 검증 및 JWT 토큰 발급.
비밀번호 없이 식별자만으로 인증한다.
"""

from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.admin import Admin
from app.models.user import User


def authenticate_admin(db: Session, emp_no: str) -> Admin | None:
    """
    관리자 로그인을 검증한다.
    사원번호로 관리자를 조회하여 존재하면 인증 성공.

    Args:
        db: DB 세션
        emp_no: 사원번호

    Returns:
        인증 성공 시 Admin 객체, 실패 시 None
    """
    return db.query(Admin).filter(Admin.emp_no == emp_no).first()


def authenticate_user(db: Session, system_id: str) -> User | None:
    """
    작업자 로그인을 검증한다.
    시스템 ID로 작업자를 조회하여 존재하면 인증 성공.

    Args:
        db: DB 세션
        system_id: 시스템 발급 로그인 키

    Returns:
        인증 성공 시 User 객체, 실패 시 None
    """
    return db.query(User).filter(User.system_id == system_id).first()


def create_admin_token(admin: Admin) -> str:
    """
    관리자용 JWT 토큰을 생성한다.
    페이로드: sub=admin.id, role=admin

    Args:
        admin: 인증된 Admin 객체

    Returns:
        JWT 토큰 문자열
    """
    return create_access_token({"sub": str(admin.id), "role": "admin"})


def create_user_token(user: User) -> str:
    """
    작업자용 JWT 토큰을 생성한다.
    페이로드: sub=user.id, role=user

    Args:
        user: 인증된 User 객체

    Returns:
        JWT 토큰 문자열
    """
    return create_access_token({"sub": str(user.id), "role": "user"})
