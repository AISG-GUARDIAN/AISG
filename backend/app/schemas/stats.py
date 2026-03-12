"""
통계 관련 응답 스키마.
"""

from pydantic import BaseModel


class DashboardStats(BaseModel):
    """대시보드 요약 통계."""

    total_users: int
    today_checked: int
    today_pass: int
    today_fail: int
    pass_rate: float


class GroupStats(BaseModel):
    """그룹별 통계."""

    group_id: int
    group_name: str
    total_users: int
    checked: int
    passed: int
    failed: int


class PeriodStats(BaseModel):
    """기간별 통계 (차트 데이터용)."""

    label: str
    total: int
    passed: int
    failed: int


class StatsResponse(BaseModel):
    """통계 API 통합 응답."""

    dashboard: DashboardStats
    by_group: list[GroupStats] = []
    by_period: list[PeriodStats] = []
