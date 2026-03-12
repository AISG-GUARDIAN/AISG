"""
작업자 관련 요청/응답 스키마.
"""

from datetime import datetime
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    """
    작업자 생성 요청

    Attributes:
        last_call_number: 전화번호 뒷자리 (필수)
        language: 언어 코드 (기본 ko)
    """

    last_call_number: str = Field(..., min_length=1, max_length=4, description="전화번호 뒷자리")
    language: str = Field("ko", max_length=10, description="언어 코드")


class UserResponse(BaseModel):
    """
    작업자 응답.

    Attributes:
        id: 작업자 ID
        system_id: 일용직 로그인 키 (정규직은 null)
        emp_no: 사원번호 (일용직은 null)
        language: 언어 코드
        group_id: 소속 그룹 ID
        group_name: 소속 그룹명
        created_at: 생성 시각
    """

    id: int
    system_id: str
    emp_no: str | None = None
    language: str
    group_id: int | None
    group_name: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}

