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


# ── 대시보드 전용 통합 응답 ──


class KpiData(BaseModel):
    """대시보드 KPI 카드 데이터."""

    safety_rate: float
    total_pass: int
    total_fail: int
    pending_count: int
    total_all: int
    yesterday_rate: float
    last_hour_pass: int
    last_hour_fail: int
    pending_urgent: int


class HourlyData(BaseModel):
    """시간대별 pass/fail 건수."""

    hour: int
    pass_count: int
    fail_count: int


class LanguageData(BaseModel):
    """언어별 체크인 분포."""

    language: str
    label: str
    count: int
    fail_count: int


class SessionRecord(BaseModel):
    """체크인 기록 테이블 행."""

    id: int
    language: str
    label: str
    checked_at: str
    status: str


class DailyRow(BaseModel):
    """일별 집계 행."""

    day: int
    total: int
    pass_count: int
    fail_count: int
    by_lang: dict[str, int] = {}


class MonthSummary(BaseModel):
    """월별 요약."""

    month: int
    total: int
    pass_count: int
    fail_count: int
    by_lang: dict[str, int] = {}


class FullDashboardResponse(BaseModel):
    """대시보드 전체 데이터를 한 번에 반환하는 통합 응답."""

    kpi: KpiData
    hourly: list[HourlyData] = []
    by_language: list[LanguageData] = []
    sessions: list[SessionRecord] = []
    daily: list[DailyRow] = []
    monthly: list[MonthSummary] = []
