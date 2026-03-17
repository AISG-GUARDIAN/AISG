"""
일용직 작업자 관련 요청/응답 스키마.
"""

from datetime import datetime
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    """
    일용직 작업자 생성 요청

    Attributes:
        last_call_number: 전화번호 뒷자리 (system_id 발급용, 필수)
        language: 언어 코드 (기본 ko)
        group_id: 소속 그룹 ID
    """

    last_call_number: str = Field(..., min_length=1, max_length=4, description="전화번호 뒷자리")
    language: str = Field("ko", max_length=10, description="언어 코드")
    group_id: int | None = Field(None, description="소속 그룹 ID")


class UserResponse(BaseModel):
    """
    일용직 작업자 응답.

    Attributes:
        id: 작업자 ID
        system_id: 자동 발급 로그인 키
        language: 언어 코드
        group_id: 소속 그룹 ID
        group_name: 소속 그룹명
        created_at: 생성 시각
    """

    id: int
    system_id: str
    language: str
    group_id: int | None
    group_name: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    """일용직 작업자 수정 요청"""
    language: str | None = Field(None, description="언어 코드")
    group_id: int | None = Field(None, description="소속 그룹 ID")
