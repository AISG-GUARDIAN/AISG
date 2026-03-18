"""
통계 서비스.
일/주/월 통계 집계 쿼리를 처리하며, 대시보드 및 차트 데이터를 제공한다.
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import case, extract, func, or_
from sqlalchemy.orm import Session

from app.models.check_session import CheckSession
from app.models.employee import Employee
from app.models.group import Group
from app.models.user import User


def _in_groups_or_unassigned(group_id_col, admin_group_ids):
    """관리자 소속 그룹이거나 그룹 미배정인 레코드를 포함하는 필터 조건."""
    return or_(group_id_col.in_(admin_group_ids), group_id_col.is_(None))


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
    admin_group_ids = [
        g.id for g in db.query(Group).filter(Group.admin_id == admin_id).all()
    ]

    # 관리자 소속 그룹 + 미배정 작업자 수
    total_users = (
        db.query(func.count(User.id))
        .filter(_in_groups_or_unassigned(User.group_id, admin_group_ids))
        .scalar()
    ) or 0

    # 오늘의 체크인 세션 (관리자 소속 그룹 + 미배정 포함)
    today_base = (
        db.query(CheckSession)
        .join(User, CheckSession.user_id == User.id)
        .filter(
            _in_groups_or_unassigned(User.group_id, admin_group_ids),
            CheckSession.date == today,
        )
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
    """start~end 기간의 세션 수를 집계한다. 그룹 미배정 유저도 포함."""
    admin_group_ids = [
        g.id for g in db.query(Group).filter(Group.admin_id == admin_id).all()
    ]
    base = (
        db.query(CheckSession)
        .join(User, CheckSession.user_id == User.id)
        .filter(
            _in_groups_or_unassigned(User.group_id, admin_group_ids),
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


# ════════════════════════════════════════════════════════════
# 대시보드 전용 통합 조회
# ════════════════════════════════════════════════════════════

# 언어 코드 → 표시 라벨 매핑
LANG_LABELS = {
    "vi": "베트남어", "zh": "중국어", "km": "크메르어",
    "th": "태국어", "ko": "한국어",
}


def _lang_label(code: str) -> str:
    """언어 코드를 한글 라벨로 변환한다. 미등록 코드는 '기타'."""
    return LANG_LABELS.get(code, "기타")


def _admin_base_query(db: Session, admin_id: int, target_date: date):
    """
    관리자 소속 그룹의 체크인 세션 base 쿼리를 반환한다.
    User + Employee 모두 포함한다.

    Args:
        db: DB 세션
        admin_id: 관리자 ID
        target_date: 조회 날짜
    """
    admin_group_ids = [
        g.id for g in db.query(Group).filter(Group.admin_id == admin_id).all()
    ]

    # User 세션 ID (그룹 미배정 포함)
    user_session_ids = (
        db.query(CheckSession.id)
        .join(User, CheckSession.user_id == User.id)
        .filter(_in_groups_or_unassigned(User.group_id, admin_group_ids), CheckSession.date == target_date)
    )
    # Employee 세션 ID (그룹 미배정 포함)
    emp_session_ids = (
        db.query(CheckSession.id)
        .join(Employee, CheckSession.employee_id == Employee.id)
        .filter(_in_groups_or_unassigned(Employee.group_id, admin_group_ids), CheckSession.date == target_date)
    )
    # UNION
    all_ids = user_session_ids.union(emp_session_ids).subquery()

    return db.query(CheckSession).filter(CheckSession.id.in_(all_ids))


# KST 오프셋 (UTC+9)
KST = timezone(timedelta(hours=9))


def get_full_dashboard(db: Session, admin_id: int) -> dict:
    """
    대시보드에 필요한 모든 데이터를 한 번에 조회한다.
    관리자 소속 그룹 기준으로 필터하며, 시간은 KST로 변환한다.

    Returns:
        dict: { kpi, hourly, by_language, sessions, daily, monthly }
    """
    today = date.today()
    now = datetime.now(timezone.utc)

    admin_group_ids = [
        g.id for g in db.query(Group).filter(Group.admin_id == admin_id).all()
    ]

    # ── 1. KPI ──
    base = _admin_base_query(db, admin_id, today)
    total_all = base.count()
    total_pass = base.filter(
        CheckSession.status.in_(["pass", "pass_override"])
    ).count()
    total_fail = base.filter(CheckSession.status == "fail").count()
    pending_count = base.filter(CheckSession.status == "pending").count()
    safety_rate = round(total_pass / total_all * 100, 1) if total_all > 0 else 0.0

    # 어제 대비
    yesterday = today - timedelta(days=1)
    y_base = _admin_base_query(db, admin_id, yesterday)
    y_total = y_base.count()
    y_pass = y_base.filter(CheckSession.status.in_(["pass", "pass_override"])).count()
    yesterday_rate = round(y_pass / y_total * 100, 1) if y_total > 0 else 0.0

    # 최근 1시간
    one_hour_ago = now - timedelta(hours=1)
    hour_base = base.filter(CheckSession.checked_at >= one_hour_ago)
    last_hour_pass = hour_base.filter(
        CheckSession.status.in_(["pass", "pass_override"])
    ).count()
    last_hour_fail = hour_base.filter(CheckSession.status == "fail").count()

    # 긴급 대기 (3회 실패)
    pending_urgent = base.filter(
        CheckSession.status == "fail", CheckSession.attempt_count >= 3
    ).count()

    kpi = {
        "safety_rate": safety_rate,
        "total_pass": total_pass,
        "total_fail": total_fail,
        "pending_count": pending_count,
        "total_all": total_all,
        "yesterday_rate": yesterday_rate,
        "last_hour_pass": last_hour_pass,
        "last_hour_fail": last_hour_fail,
        "pending_urgent": pending_urgent,
    }

    # ── 2. 시간대별 pass/fail (KST 변환 + 빈 시간대 0으로 채움) ──
    # SQLite에서 +9시간 보정하여 KST hour를 추출한다
    kst_hour_expr = (extract("hour", CheckSession.checked_at) + 9) % 24
    hourly_raw = (
        base.with_entities(
            kst_hour_expr.label("h"),
            func.sum(case(
                (CheckSession.status.in_(["pass", "pass_override"]), 1),
                else_=0,
            )).label("p"),
            func.sum(case(
                (CheckSession.status == "fail", 1),
                else_=0,
            )).label("f"),
        )
        .group_by("h")
        .order_by("h")
        .all()
    )
    hourly_map = {int(r.h): {"pass_count": int(r.p), "fail_count": int(r.f)} for r in hourly_raw}
    # 근무 시간대 6시~20시를 모두 포함 (빈 시간도 0으로)
    hourly = [
        {"hour": h, "pass_count": hourly_map.get(h, {}).get("pass_count", 0), "fail_count": hourly_map.get(h, {}).get("fail_count", 0)}
        for h in range(6, 21)
    ]

    # ── 3. 언어별 분포 ──
    # User 기반 세션
    user_lang_raw = (
        db.query(
            User.language,
            func.count(CheckSession.id).label("cnt"),
            func.sum(case(
                (CheckSession.status == "fail", 1), else_=0,
            )).label("fail_cnt"),
        )
        .join(CheckSession, CheckSession.user_id == User.id)
        .filter(CheckSession.date == today, _in_groups_or_unassigned(User.group_id, admin_group_ids))
        .group_by(User.language)
        .all()
    )
    # Employee 기반 세션
    emp_lang_raw = (
        db.query(
            Employee.language,
            func.count(CheckSession.id).label("cnt"),
            func.sum(case(
                (CheckSession.status == "fail", 1), else_=0,
            )).label("fail_cnt"),
        )
        .join(CheckSession, CheckSession.employee_id == Employee.id)
        .filter(CheckSession.date == today, _in_groups_or_unassigned(Employee.group_id, admin_group_ids))
        .group_by(Employee.language)
        .all()
    )

    # 병합
    lang_agg: dict[str, dict] = {}
    for rows in [user_lang_raw, emp_lang_raw]:
        for r in rows:
            code = r.language or "ko"
            if code not in lang_agg:
                lang_agg[code] = {"count": 0, "fail_count": 0}
            lang_agg[code]["count"] += int(r.cnt)
            lang_agg[code]["fail_count"] += int(r.fail_cnt)

    by_language = [
        {
            "language": code,
            "label": _lang_label(code),
            "count": v["count"],
            "fail_count": v["fail_count"],
        }
        for code, v in sorted(lang_agg.items(), key=lambda x: -x[1]["count"])
    ]

    # ── 4. 최근 체크인 세션 (최대 100건) ──
    recent = (
        base.order_by(CheckSession.checked_at.desc())
        .limit(100)
        .all()
    )
    sessions = []
    user_ids = [s.user_id for s in recent if s.user_id]
    emp_ids = [s.employee_id for s in recent if s.employee_id]
    user_lang_cache = {
        u.id: u.language
        for u in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    emp_lang_cache = {
        e.id: e.language
        for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()
    } if emp_ids else {}

    for s in recent:
        lang_code = "ko"
        if s.user_id and s.user_id in user_lang_cache:
            lang_code = user_lang_cache[s.user_id]
        elif s.employee_id and s.employee_id in emp_lang_cache:
            lang_code = emp_lang_cache[s.employee_id]

        # checked_at을 KST로 변환하여 반환
        checked_kst = s.checked_at.replace(tzinfo=timezone.utc).astimezone(KST) if s.checked_at else None
        sessions.append({
            "id": s.id,
            "language": lang_code,
            "label": _lang_label(lang_code),
            "checked_at": checked_kst.isoformat() if checked_kst else "",
            "status": s.status,
        })

    # ── 5. 이번 달 일별 집계 ──
    first_of_month = today.replace(day=1)

    # 관리자 그룹 세션 ID (이번 달 전체)
    month_user_ids = (
        db.query(CheckSession.id)
        .join(User, CheckSession.user_id == User.id)
        .filter(_in_groups_or_unassigned(User.group_id, admin_group_ids), CheckSession.date >= first_of_month, CheckSession.date <= today)
    )
    month_emp_ids = (
        db.query(CheckSession.id)
        .join(Employee, CheckSession.employee_id == Employee.id)
        .filter(_in_groups_or_unassigned(Employee.group_id, admin_group_ids), CheckSession.date >= first_of_month, CheckSession.date <= today)
    )
    month_all_ids = month_user_ids.union(month_emp_ids).subquery()

    daily_raw = (
        db.query(
            extract("day", CheckSession.date).label("d"),
            func.count(CheckSession.id).label("total"),
            func.sum(case(
                (CheckSession.status.in_(["pass", "pass_override"]), 1), else_=0,
            )).label("p"),
            func.sum(case(
                (CheckSession.status == "fail", 1), else_=0,
            )).label("f"),
        )
        .filter(CheckSession.id.in_(month_all_ids))
        .group_by("d")
        .order_by("d")
        .all()
    )

    # 일별 언어 분포 (User 기준)
    daily_lang_raw = (
        db.query(
            extract("day", CheckSession.date).label("d"),
            User.language,
            func.count(CheckSession.id).label("cnt"),
        )
        .join(User, CheckSession.user_id == User.id)
        .filter(_in_groups_or_unassigned(User.group_id, admin_group_ids), CheckSession.date >= first_of_month, CheckSession.date <= today)
        .group_by("d", User.language)
        .all()
    )
    # Employee 기준 추가
    daily_emp_lang_raw = (
        db.query(
            extract("day", CheckSession.date).label("d"),
            Employee.language,
            func.count(CheckSession.id).label("cnt"),
        )
        .join(Employee, CheckSession.employee_id == Employee.id)
        .filter(_in_groups_or_unassigned(Employee.group_id, admin_group_ids), CheckSession.date >= first_of_month, CheckSession.date <= today)
        .group_by("d", Employee.language)
        .all()
    )

    daily_lang_agg: dict[int, dict[str, int]] = {}
    for rows in [daily_lang_raw, daily_emp_lang_raw]:
        for r in rows:
            day = int(r.d)
            code = r.language or "ko"
            label = _lang_label(code)
            if day not in daily_lang_agg:
                daily_lang_agg[day] = {}
            daily_lang_agg[day][label] = daily_lang_agg[day].get(label, 0) + int(r.cnt)

    daily = [
        {
            "day": int(r.d),
            "total": int(r.total),
            "pass_count": int(r.p),
            "fail_count": int(r.f),
            "by_lang": daily_lang_agg.get(int(r.d), {}),
        }
        for r in daily_raw
    ]

    # ── 6. 올해 월별 요약 ──
    year_start = date(today.year, 1, 1)

    year_user_ids = (
        db.query(CheckSession.id)
        .join(User, CheckSession.user_id == User.id)
        .filter(_in_groups_or_unassigned(User.group_id, admin_group_ids), CheckSession.date >= year_start, CheckSession.date <= today)
    )
    year_emp_ids = (
        db.query(CheckSession.id)
        .join(Employee, CheckSession.employee_id == Employee.id)
        .filter(_in_groups_or_unassigned(Employee.group_id, admin_group_ids), CheckSession.date >= year_start, CheckSession.date <= today)
    )
    year_all_ids = year_user_ids.union(year_emp_ids).subquery()

    monthly_raw = (
        db.query(
            extract("month", CheckSession.date).label("m"),
            func.count(CheckSession.id).label("total"),
            func.sum(case(
                (CheckSession.status.in_(["pass", "pass_override"]), 1), else_=0,
            )).label("p"),
            func.sum(case(
                (CheckSession.status == "fail", 1), else_=0,
            )).label("f"),
        )
        .filter(CheckSession.id.in_(year_all_ids))
        .group_by("m")
        .order_by("m")
        .all()
    )

    # 월별 언어 분포
    monthly_lang_raw = (
        db.query(
            extract("month", CheckSession.date).label("m"),
            User.language,
            func.count(CheckSession.id).label("cnt"),
        )
        .join(User, CheckSession.user_id == User.id)
        .filter(_in_groups_or_unassigned(User.group_id, admin_group_ids), CheckSession.date >= year_start, CheckSession.date <= today)
        .group_by("m", User.language)
        .all()
    )
    monthly_emp_lang_raw = (
        db.query(
            extract("month", CheckSession.date).label("m"),
            Employee.language,
            func.count(CheckSession.id).label("cnt"),
        )
        .join(Employee, CheckSession.employee_id == Employee.id)
        .filter(_in_groups_or_unassigned(Employee.group_id, admin_group_ids), CheckSession.date >= year_start, CheckSession.date <= today)
        .group_by("m", Employee.language)
        .all()
    )

    monthly_lang_agg: dict[int, dict[str, int]] = {}
    for rows in [monthly_lang_raw, monthly_emp_lang_raw]:
        for r in rows:
            month = int(r.m)
            code = r.language or "ko"
            label = _lang_label(code)
            if month not in monthly_lang_agg:
                monthly_lang_agg[month] = {}
            monthly_lang_agg[month][label] = monthly_lang_agg[month].get(label, 0) + int(r.cnt)

    monthly = [
        {
            "month": int(r.m),
            "total": int(r.total),
            "pass_count": int(r.p),
            "fail_count": int(r.f),
            "by_lang": monthly_lang_agg.get(int(r.m), {}),
        }
        for r in monthly_raw
    ]

    return {
        "kpi": kpi,
        "hourly": hourly,
        "by_language": by_language,
        "sessions": sessions,
        "daily": daily,
        "monthly": monthly,
    }
