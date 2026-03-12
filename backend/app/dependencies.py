"""
FastAPI 의존성 주입 모듈.
JWT 토큰에서 현재 사용자/관리자 정보를 추출하는 의존성을 제공한다.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database import get_db
from app.models.admin import Admin
from app.models.user import User

# Bearer 토큰 스킴 — Authorization 헤더에서 JWT를 추출한다
security_scheme = HTTPBearer()


def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Admin:
    """
    JWT에서 관리자 정보를 추출하여 Admin 객체를 반환한다.
    토큰이 유효하지 않거나 role이 admin이 아니면 401 에러를 발생시킨다.

    Args:
        credentials: Bearer 토큰
        db: DB 세션

    Returns:
        Admin: 인증된 관리자 ORM 객체

    Raises:
        HTTPException 401: 토큰 무효 또는 관리자 권한 없음
    """
    payload = decode_access_token(credentials.credentials)
    if payload is None or payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="관리자 인증이 필요합니다",
        )

    # sub 필드에 admin.id가 들어있다
    admin = db.query(Admin).filter(Admin.id == int(payload["sub"])).first()
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="관리자 계정을 찾을 수 없습니다",
        )
    return admin


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    JWT에서 작업자 정보를 추출하여 User 객체를 반환한다.
    토큰이 유효하지 않거나 role이 user가 아니면 401 에러를 발생시킨다.

    Args:
        credentials: Bearer 토큰
        db: DB 세션

    Returns:
        User: 인증된 작업자 ORM 객체

    Raises:
        HTTPException 401: 토큰 무효 또는 작업자 없음
    """
    payload = decode_access_token(credentials.credentials)
    if payload is None or payload.get("role") != "user":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="작업자 인증이 필요합니다",
        )

    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="작업자를 찾을 수 없습니다",
        )
    return user
