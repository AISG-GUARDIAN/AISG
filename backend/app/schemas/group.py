"""
그룹 관련 요청/응답 스키마.
"""

from datetime import datetime
from pydantic import BaseModel, Field


class GroupCreate(BaseModel):
    """그룹 생성 요청."""
    name: str = Field(..., min_length=1, max_length=100, description="그룹명")


class GroupUpdate(BaseModel):
    """그룹 수정 요청."""
    name: str = Field(..., min_length=1, max_length=100, description="그룹명")


class GroupResponse(BaseModel):
    """
    그룹 응답.

    Attributes:
        id: 그룹 ID
        admin_id: 소속 관리자 ID
        name: 그룹명
        user_count: 소속 작업자 수
        created_at: 생성 시각
    """

    id: int
    admin_id: int
    name: str
    user_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}
