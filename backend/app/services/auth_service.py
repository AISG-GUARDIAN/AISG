"""
인증 서비스.
관리자(사원번호)/작업자(시스템ID) 로그인 검증 및 JWT 토큰 발급.
비밀번호 없이 식별자만으로 인증한다.
"""

from sqlalchemy.orm import Session
from app.core.security import create_access_token
from app.services import auto_id_service
from app.models.admin import Admin
from app.models.user import User
import logging

logger = logging.getLogger(__name__)


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


def authenticate_user(db: Session, last_call_number: str | None, emp_no: str | None) -> User | None:
    """
    작업자 체크인 등록 및 로그인.
    사원(emp_no)인 경우 기존 정보 조회.
    비사원(last_call_number)인 경우 시스템 ID 발급 후 신규 생성하여 반환.
    """
    if emp_no:
        # 1-1. 사번이 제공된 경우 DB에서 검색 (정직원)
        user = db.query(User).filter(User.emp_no == emp_no).first()
        if not user:
            logger.warning(f"존재하지 않는 사번 로그인 시도: {emp_no}")
            return None # 라우터에서 401 에러로 처리
        return user
        
    elif last_call_number:
        # 1-2. 전화번호 뒷자리만 제공된 경우 (신규/일용직)
        try:
            # system_id 자동 발급 (auto_id_service 이용)
            new_system_id = auto_id_service.generate_system_id(db, last_call_number)
            
            user = User(
                system_id=new_system_id,
                # 기본 언어는 ko, group_id는 나중에 지정되거나 Null 로둠
            )
            db.add(user)
            db.commit()
            db.refresh(user) # DB에 삽입된 후 생성된 PK(id) 값을 가져오기 위함
            return user
            
        except Exception as e:
            logger.error(f"User 자동 생성 실패: {e}")
            db.rollback()
            return None


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
