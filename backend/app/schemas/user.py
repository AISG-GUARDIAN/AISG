"""
작업자 관련 요청/응답 스키마.
system_id 자동 발급, 엑셀 업로드 등에 사용된다.
"""

from datetime import datetime
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    """
    작업자 생성 요청.
    system_id는 서버에서 자동 발급한다.

    Attributes:
        name: 작업자 이름
        emp_no: 사원번호 (선택)
        language: 언어 코드 (기본 ko)
        group_id: 소속 그룹 ID
    """

    name: str = Field(..., min_length=1, max_length=100, description="작업자 이름")
    emp_no: str | None = Field(None, description="사원번호 (선택)")
    language: str = Field("ko", max_length=10, description="언어 코드")
    group_id: int = Field(..., description="소속 그룹 ID")


class UserUpdate(BaseModel):
    """작업자 수정 요청. 모든 필드 선택적."""

    name: str | None = Field(None, min_length=1, max_length=100)
    emp_no: str | None = None
    language: str | None = Field(None, max_length=10)
    group_id: int | None = None


class UserResponse(BaseModel):
    """
    작업자 응답.

    Attributes:
        id: 작업자 ID
        system_id: 시스템 발급 로그인 키
        emp_no: 사원번호 (없으면 null)
        name: 작업자 이름
        language: 언어 코드
        group_id: 소속 그룹 ID
        group_name: 소속 그룹명
        created_at: 생성 시각
    """

    id: int
    system_id: str
    emp_no: str | None = None
    name: str
    language: str
    group_id: int | None
    group_name: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}


class ExcelUploadResponse(BaseModel):
    """엑셀 업로드 결과."""

    total: int
    created: int
    skipped: int
    errors: list[str] = []
