"""
인증·보안 유틸리티 모듈.
JWT 토큰 생성/검증을 담당한다.
관리자는 사원번호(emp_no), 작업자는 시스템ID(system_id)로 인증하므로
비밀번호 해싱은 사용하지 않는다.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt

from app.core.config import get_settings


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    JWT 액세스 토큰을 생성한다.

    Args:
        data: 토큰 페이로드 (sub, role 등)
        expires_delta: 만료 시간 (미지정 시 설정값 사용)

    Returns:
        인코딩된 JWT 문자열
    """
    settings = get_settings()
    to_encode = data.copy()

    # 만료 시간 설정 — expires_delta가 없으면 config 기본값 사용
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """
    JWT 토큰을 디코딩하여 페이로드를 반환한다.
    유효하지 않거나 만료된 토큰이면 None을 반환한다.

    Args:
        token: JWT 문자열

    Returns:
        디코딩된 페이로드 dict, 또는 실패 시 None
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        return payload
    except JWTError:
        return None
