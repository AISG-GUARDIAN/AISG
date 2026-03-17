"""
통계 라우터.

엔드포인트:
- GET /admin/stats           — 통합 통계 조회
- GET /admin/stats/dashboard — 대시보드 전체 데이터 (프론트엔드 대시보드용)
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin import Admin
from app.schemas.stats import (
    DashboardStats,
    FullDashboardResponse,
    GroupStats,
    PeriodStats,
    StatsResponse,
)
from app.services.stats_service import (
    get_dashboard_stats,
    get_full_dashboard,
    get_group_stats,
    get_period_stats,
)

router = APIRouter(prefix="/admin/stats", tags=["통계"])


@router.get("/dashboard", response_model=FullDashboardResponse)
def get_dashboard(
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    GET /admin/stats/dashboard
    대시보드에 필요한 KPI, 시간대별, 언어별, 세션 목록, 일별, 월별 데이터를 한 번에 반환한다.
    """
    return FullDashboardResponse(**get_full_dashboard(db, admin.id))


@router.get("", response_model=StatsResponse)
def get_stats(
    period_type: str = Query("daily", description="기간 유형 (daily/weekly/monthly)"),
    count: int = Query(7, description="조회 기간 수"),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    GET /admin/stats?period_type=daily&count=7
    대시보드 요약 + 그룹별 + 기간별 통계를 반환한다.
    """
    dashboard = DashboardStats(**get_dashboard_stats(db, admin.id))
    by_group = [GroupStats(**g) for g in get_group_stats(db, admin.id)]
    by_period = [PeriodStats(**p) for p in get_period_stats(db, admin.id, period_type, count)]

    return StatsResponse(dashboard=dashboard, by_group=by_group, by_period=by_period)
