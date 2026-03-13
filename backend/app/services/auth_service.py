"""
인증 서비스.
관리자(사원번호)/정규직(사원번호)/일용직(전화번호 뒷자리) 로그인 검증 및 JWT 토큰 발급.
비밀번호 없이 식별자만으로 인증한다.
"""

import logging

from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models.admin import Admin
from app.models.employee import Employee
from app.models.user import User
from app.services import auto_id_service

logger = logging.getLogger(__name__)


def authenticate_admin(db: Session, emp_no: str) -> Admin | None:
    """
    관리자 로그인. 사원번호로 admins 테이블을 조회한다.

    Returns:
        인증 성공 시 Admin, 실패 시 None
    """
    return db.query(Admin).filter(Admin.emp_no == emp_no).first()


def authenticate_employee(db: Session, emp_no: str, language: str = "ko") -> Employee | None:
    """
    정규직 로그인. employees 테이블에서 사번을 조회한다.
    존재하면 Employee 반환, 없으면 None (미등록 사번).
    첫 로그인 시 언어를 업데이트한다.

    Returns:
        인증 성공 시 Employee, 실패 시 None
    """
    employee = db.query(Employee).filter(Employee.emp_no == emp_no).first()
    if not employee:
        logger.warning(f"미등록 사번 로그인 시도: {emp_no}")
        return None

    # 언어 업데이트 (프론트에서 선택한 언어 반영)
    if employee.language != language:
        employee.language = language
        db.commit()

    return employee


def authenticate_user(db: Session, last_call_number: str, language: str = "ko") -> User | None:
    """
    일용직 로그인. 전화번호 뒷자리로 system_id를 발급하여 신규 User를 생성한다.

    Returns:
        생성된 User, 실패 시 None
    """
    try:
        new_system_id = auto_id_service.generate_system_id(db, last_call_number)

        user = User(
            system_id=new_system_id,
            language=language,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    except Exception as e:
        logger.error(f"User 자동 생성 실패: {e}")
        db.rollback()
        return None


def create_admin_token(admin: Admin) -> str:
    """관리자용 JWT. 페이로드: sub=admin.id, role=admin"""
    return create_access_token({"sub": str(admin.id), "role": "admin"})


def create_employee_token(employee: Employee) -> str:
    """정규직용 JWT. 페이로드: sub=employee.id, role=employee"""
    return create_access_token({"sub": str(employee.id), "role": "employee"})


def create_user_token(user: User) -> str:
    """일용직용 JWT. 페이로드: sub=user.id, role=user"""
    return create_access_token({"sub": str(user.id), "role": "user"})
