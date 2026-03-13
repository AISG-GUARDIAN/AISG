"""
인증 관련 요청/응답 스키마.
관리자(사원번호), 정규직(사원번호), 일용직(전화번호 뒷자리) 로그인에 사용된다.
"""

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    """관리자 로그인 요청. 사원번호만으로 인증."""
    emp_no: str = Field(..., min_length=1, description="사원번호")


class EmployeeLoginRequest(BaseModel):
    """정규직 로그인 요청. 사원번호 + 선택 언어."""
    emp_no: str = Field(..., min_length=1, description="사원번호")
    language: str = Field("ko", max_length=10, description="선택 언어 코드")


class UserLoginRequest(BaseModel):
    """일용직 로그인 요청. 전화번호 뒷자리 + 선택 언어."""
    last_call_number: str = Field(..., min_length=1, max_length=4, description="전화번호 뒷자리")
    language: str = Field("ko", max_length=10, description="선택 언어 코드")


class TokenResponse(BaseModel):
    """JWT 토큰 응답."""
    access_token: str
    token_type: str = "bearer"
    role: str
