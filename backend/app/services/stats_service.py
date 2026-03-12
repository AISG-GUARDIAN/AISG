"""
통계 서비스.
일/주/월 통계 집계 쿼리를 처리하며, 대시보드 및 차트 데이터를 제공한다.
"""

from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.check_session import CheckSession
from app.models.group import Group
from app.models.user import User


def get_dashboard_stats(db: Session, admin_id: int) -> dict:
    """
    대시보드 요약 통계를 반환한다.
    관리자 소속 그룹 기준으로 집계한다.

    Args:
        db: DB 세션
        admin_id: 관리자 ID

    Returns:
        dict: { total_users, today_checked, today_pass, today_fail, pass_rate }
    """
    today = date.today()

    # 관리자 소속 그룹의 작업자 수
    total_users = (
        db.query(func.count(User.id))
        .join(Group, User.group_id == Group.id)
        .filter(Group.admin_id == admin_id)
        .scalar()
    ) or 0

    # 오늘의 체크인 세션 (관리자 소속 그룹 기준)
    today_base = (
        db.query(CheckSession)
        .join(User, CheckSession.user_id == User.id)
        .join(Group, User.group_id == Group.id)
        .filter(Group.admin_id == admin_id, CheckSession.date == today)
    )

    today_checked = today_base.count()
    today_pass = today_base.filter(
        CheckSession.status.in_(["pass", "pass_override"])
    ).count()
    today_fail = today_base.filter(CheckSession.status == "fail").count()

    pass_rate = (today_pass / today_checked * 100) if today_checked > 0 else 0.0

    return {
        "total_users": total_users,
        "today_checked": today_checked,
        "today_pass": today_pass,
        "today_fail": today_fail,
        "pass_rate": round(pass_rate, 1),
    }


def get_group_stats(db: Session, admin_id: int, target_date: date | None = None) -> list[dict]:
    """
    그룹별 통계를 반환한다.

    Args:
        db: DB 세션
        admin_id: 관리자 ID
        target_date: 조회 날짜 (None이면 오늘)

    Returns:
        list[dict]: 그룹별 통계 리스트
    """
    if target_date is None:
        target_date = date.today()

    groups = db.query(Group).filter(Group.admin_id == admin_id).all()
    result = []

    for group in groups:
        total_users = (
            db.query(func.count(User.id))
            .filter(User.group_id == group.id)
            .scalar()
        ) or 0

        sessions = (
            db.query(CheckSession)
            .join(User, CheckSession.user_id == User.id)
            .filter(User.group_id == group.id, CheckSession.date == target_date)
        )

        checked = sessions.count()
        passed = sessions.filter(
            CheckSession.status.in_(["pass", "pass_override"])
        ).count()
        failed = sessions.filter(CheckSession.status == "fail").count()

        result.append({
            "group_id": group.id,
            "group_name": group.name,
            "total_users": total_users,
            "checked": checked,
            "passed": passed,
            "failed": failed,
        })

    return result


def get_period_stats(
    db: Session, admin_id: int, period_type: str = "daily", count: int = 7
) -> list[dict]:
    """
    기간별 통계를 반환한다 (차트 데이터용).

    Args:
        db: DB 세션
        admin_id: 관리자 ID
        period_type: 기간 유형 (daily/weekly/monthly)
        count: 조회할 기간 수

    Returns:
        list[dict]: [{ label, total, passed, failed }, ...]
    """
    result = []

    if period_type == "daily":
        for i in range(count - 1, -1, -1):
            target = date.today() - timedelta(days=i)
            stats = _count_sessions(db, admin_id, target, target)
            result.append({"label": target.isoformat(), **stats})

    elif period_type == "weekly":
        for i in range(count - 1, -1, -1):
            end = date.today() - timedelta(weeks=i)
            start = end - timedelta(days=6)
            week_label = f"{end.isocalendar()[0]}-W{end.isocalendar()[1]:02d}"
            stats = _count_sessions(db, admin_id, start, end)
            result.append({"label": week_label, **stats})

    elif period_type == "monthly":
        for i in range(count - 1, -1, -1):
            target = date.today().replace(day=1)
            for _ in range(i):
                target = (target - timedelta(days=1)).replace(day=1)
            # 해당 월의 마지막 날
            if target.month == 12:
                end_of_month = target.replace(year=target.year + 1, month=1, day=1) - timedelta(days=1)
            else:
                end_of_month = target.replace(month=target.month + 1, day=1) - timedelta(days=1)
            stats = _count_sessions(db, admin_id, target, end_of_month)
            result.append({"label": target.strftime("%Y-%m"), **stats})

    return result


def _count_sessions(db: Session, admin_id: int, start: date, end: date) -> dict:
    """start~end 기간의 세션 수를 집계한다."""
    base = (
        db.query(CheckSession)
        .join(User, CheckSession.user_id == User.id)
        .join(Group, User.group_id == Group.id)
        .filter(
            Group.admin_id == admin_id,
            CheckSession.date >= start,
            CheckSession.date <= end,
        )
    )
    total = base.count()
    passed = base.filter(CheckSession.status.in_(["pass", "pass_override"])).count()
    failed = base.filter(CheckSession.status == "fail").count()
    return {"total": total, "passed": passed, "failed": failed}


def get_stats_for_period(db: Session, start: date, end: date) -> dict:
    """
    보고서 생성용 통계 데이터를 반환한다.

    Args:
        db: DB 세션
        start: 기간 시작일
        end: 기간 종료일

    Returns:
        dict: 보고서용 통계 데이터
    """
    sessions = db.query(CheckSession).filter(
        CheckSession.date >= start, CheckSession.date <= end
    )
    total = sessions.count()
    passed = sessions.filter(CheckSession.status.in_(["pass", "pass_override"])).count()
    failed = sessions.filter(CheckSession.status == "fail").count()

    # 그룹별 집계
    group_data = []
    groups = db.query(Group).all()
    for group in groups:
        g_sessions = (
            db.query(CheckSession)
            .join(User, CheckSession.user_id == User.id)
            .filter(
                User.group_id == group.id,
                CheckSession.date >= start,
                CheckSession.date <= end,
            )
        )
        g_total = g_sessions.count()
        if g_total > 0:
            g_passed = g_sessions.filter(
                CheckSession.status.in_(["pass", "pass_override"])
            ).count()
            group_data.append({
                "group_name": group.name,
                "total": g_total,
                "passed": g_passed,
                "failed": g_total - g_passed,
                "pass_rate": round(g_passed / g_total * 100, 1),
            })

    return {
        "period": f"{start} ~ {end}",
        "total_checks": total,
        "total_passed": passed,
        "total_failed": failed,
        "pass_rate": round(passed / total * 100, 1) if total > 0 else 0,
        "groups": group_data,
    }
