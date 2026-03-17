"""
알림 라우터.
3회 연속 실패로 관리자 호출이 발생한 알림 목록을 조회한다.
User(일용직)와 Employee(정규직) 모두 지원한다.

엔드포인트:
- GET /admin/notifications — 관리자 호출 알림 목록 (미처리/전체)
"""

import json
from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin import Admin
from app.models.audit_log import AuditLog
from app.models.check_session import CheckSession
from app.models.employee import Employee
from app.models.group import Group
from app.models.user import User

router = APIRouter(prefix="/admin/notifications", tags=["알림"])


class NotificationItem(BaseModel):
    """
    알림 항목 응답 스키마.

    Attributes:
        id: AuditLog ID
        session_id: 관련 체크인 세션 ID
        user_id: 작업자 ID (User 또는 Employee)
        system_id: 작업자 식별자 (system_id 또는 emp_no)
        language: 작업자 언어 코드
        group_name: 소속 그룹명
        attempt_count: 시도 횟수
        session_status: 현재 세션 상태 (fail / pass_override)
        helmet_pass: 안전모 착용 여부
        vest_pass: 안전조끼 착용 여부
        override_reason: 오버라이드 사유 (처리된 경우)
        worker_type: 작업자 유형 (user / employee)
        created_at: 알림 생성 시각
    """

    id: int
    session_id: int
    user_id: int
    system_id: str
    language: str
    group_name: str | None = None
    attempt_count: int
    session_status: str
    helmet_pass: bool | None = None
    vest_pass: bool | None = None
    override_reason: str | None = None
    worker_type: str = "user"
    created_at: str


@router.get("", response_model=list[NotificationItem])
def list_notifications(
    status: str | None = Query(None, description="pending=미처리만, resolved=처리완료만, 생략=전체"),
    target_date: str | None = Query(None, description="조회 날짜 (YYYY-MM-DD), 생략=오늘"),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    GET /admin/notifications — 3회 실패 관리자 호출 알림 목록.

    AuditLog에서 action='admin_call'인 항목을 조회하고,
    관련 세션·작업자 정보를 함께 반환한다.
    User와 Employee 모두 포함한다.
    """
    if target_date:
        query_date = date.fromisoformat(target_date)
    else:
        query_date = date.today()

    # 관리자 소속 그룹 ID 목록
    admin_group_ids = [g.id for g in db.query(Group).filter(Group.admin_id == admin.id).all()]
    group_map = {g.id: g.name for g in db.query(Group).filter(Group.id.in_(admin_group_ids)).all()}

    # AuditLog에서 admin_call 이벤트 조회
    logs = (
        db.query(AuditLog)
        .filter(
            AuditLog.action == "admin_call",
            AuditLog.target_type == "check_session",
        )
        .order_by(AuditLog.created_at.desc())
        .all()
    )

    result = []
    for log in logs:
        session = db.query(CheckSession).filter(CheckSession.id == log.target_id).first()
        if not session or session.date != query_date:
            continue

        detail = json.loads(log.detail) if log.detail else {}
        worker_type = detail.get("worker_type", "user")

        # 작업자 정보 조회 (User 또는 Employee)
        worker_id = None
        system_id = ""
        language = "ko"
        group_id = None

        if session.user_id:
            user = db.query(User).filter(User.id == session.user_id).first()
            if user:
                worker_id = user.id
                system_id = user.system_id
                language = user.language
                group_id = user.group_id
                worker_type = "user"
        elif session.employee_id:
            emp = db.query(Employee).filter(Employee.id == session.employee_id).first()
            if emp:
                worker_id = emp.id
                system_id = emp.emp_no
                language = emp.language
                group_id = emp.group_id
                worker_type = "employee"

        # 관리자 소속 그룹 필터
        if not worker_id or group_id not in admin_group_ids:
            continue

        # 상태 필터
        if status == "pending" and session.status != "fail":
            continue
        if status == "resolved" and session.status != "pass_override":
            continue

        override = session.override

        result.append(NotificationItem(
            id=log.id,
            session_id=session.id,
            user_id=worker_id,
            system_id=system_id,
            language=language,
            group_name=group_map.get(group_id),
            attempt_count=detail.get("attempt_count", session.attempt_count),
            session_status=session.status,
            helmet_pass=session.helmet_pass,
            vest_pass=session.vest_pass,
            override_reason=override.reason if override else None,
            worker_type=worker_type,
            created_at=log.created_at.isoformat(),
        ))

    return result
