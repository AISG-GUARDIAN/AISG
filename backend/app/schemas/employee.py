"""
정규직 사원 관련 요청/응답 스키마.
"""

from datetime import datetime
from pydantic import BaseModel, Field


class EmployeeCreate(BaseModel):
    """
    정규직 사원 생성 요청.

    Attributes:
        emp_no: 사원번호 (필수, 고유)
        language: 언어 코드 (기본 ko)
        group_id: 소속 그룹 ID
    """

    emp_no: str = Field(..., min_length=1, max_length=10, description="사원번호")
    language: str = Field("ko", max_length=10, description="언어 코드")
    group_id: int | None = Field(None, description="소속 그룹 ID")


class EmployeeResponse(BaseModel):
    """
    정규직 사원 응답.

    Attributes:
        id: 사원 ID
        emp_no: 사원번호
        language: 언어 코드
        group_id: 소속 그룹 ID
        group_name: 소속 그룹명
        checkin_status: 오늘 체크인 상태 (pass/fail/null)
        created_at: 등록 시각
    """

    id: int
    emp_no: str
    language: str
    group_id: int | None
    group_name: str = ""
    checkin_status: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class EmployeeUpdate(BaseModel):
    """정규직 사원 수정 요청."""
    language: str | None = Field(None, description="언어 코드")
    group_id: int | None = Field(None, description="소속 그룹 ID")
