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
    사번(emp_no)이 있으면 사번을, 없으면 전화번호 뒷자리(last_call_number)를 입력.
    """
    emp_no: str | None = Field(None, description="사원번호")
    last_call_number: str | None = Field(None, description="전화번호 뒷자리")

    @model_validator(mode="after")
    def check_at_least_one(self) -> "UserLoginRequest":
        if not self.emp_no and not self.last_call_number:
            raise ValueError("사번(emp_no) 또는 전화번호 뒷자리(last_call_number) 중 하나는 필수입니다.")
        return self

class TokenResponse(BaseModel):
    """
    JWT 토큰 응답.

    Attributes:
        access_token: JWT 문자열
        token_type: 토큰 타입 (항상 bearer)
        role: 사용자 역할 (admin / user)
    """

    access_token: str
    token_type: str = "bearer"
    role: str
