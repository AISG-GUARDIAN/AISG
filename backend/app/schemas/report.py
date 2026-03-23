"""
보고서 관련 요청/응답 스키마.
"""

from datetime import date, datetime
from pydantic import BaseModel, Field


class ReportCreate(BaseModel):
    """
    보고서 생성 요청.

    Attributes:
        period_type: 기간 유형 (daily / weekly / monthly)
        period_from: 기간 시작일
        period_to: 기간 종료일
    """

    period_from: date = Field(..., description="기간 시작일")
    period_to: date = Field(..., description="기간 종료일")
    period_type: str = Field(default="custom", description="기간 유형 (custom)")


class ReportResponse(BaseModel):
    """
    보고서 응답.

    Attributes:
        id: 보고서 ID
        admin_id: 요청 관리자 ID
        period_type: 기간 유형
        period_from: 기간 시작일
        period_to: 기간 종료일
        status: 생성 상태
        content: 보고서 본문
        file_url: 파일 URL
        created_at: 생성 시각
    """

    id: int
    admin_id: int
    period_type: str
    period_from: date
    period_to: date
    status: str
    content: str | None
    file_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
