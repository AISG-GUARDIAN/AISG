"""
인증 관련 요청/응답 스키마.
관리자(사원번호)와 작업자(시스템ID) 로그인에 사용된다.
"""

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    """
    관리자 로그인 요청.
    사원번호만으로 인증한다 (비밀번호 없음).

    Attributes:
        emp_no: 사원번호
    """

    emp_no: str = Field(..., min_length=1, description="사원번호")


class UserLoginRequest(BaseModel):
    """
    작업자 로그인 요청.
    자동 발급된 시스템 ID로 인증한다.

    Attributes:
        system_id: 시스템 발급 로그인 키 (예: USR-20260312-0001)
    """

    system_id: str = Field(..., min_length=1, description="시스템 ID")


class TokenResponse(BaseModel):
    """
    JWT 토큰 응답.

    Attributes:
        access_token: JWT 문자열
        token_type: 토큰 타입 (항상 bearer)
        role: 사용자 역할 (admin / user)
        name: 사용자 이름
    """

    access_token: str
    token_type: str = "bearer"
    role: str
    name: str
