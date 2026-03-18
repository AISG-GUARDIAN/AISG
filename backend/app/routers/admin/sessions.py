"""
체크인 세션 관리 라우터.
당일 체크인 현황 조회 및 관리자 오버라이드(수동 통과).
User(일용직)와 Employee(정규직) 세션 모두 포함한다.

엔드포인트:
- GET  /admin/sessions              — 체크인 세션 목록
- POST /admin/sessions/{id}/override — 관리자 수동 통과 처리
"""

import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin import Admin
from app.models.admin_override import AdminOverride
from app.models.audit_log import AuditLog
from app.models.check_session import CheckSession
from app.models.employee import Employee
from app.models.group import Group
from app.models.user import User
from app.schemas.check_session import OverrideRequest, SessionResponse

router = APIRouter(prefix="/admin/sessions", tags=["세션 관리"])


@router.get("", response_model=list[SessionResponse])
def list_sessions(
    target_date: str | None = Query(None, description="조회 날짜 (YYYY-MM-DD)"),
    group_id: int | None = Query(None, description="그룹 ID 필터"),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """GET /admin/sessions — User + Employee 체크인 세션 목록."""
    if target_date is None:
        query_date = date.today()
    else:
        query_date = date.fromisoformat(target_date)

    # User 세션 — 관리자는 모든 세션 조회 가능 (그룹 필터는 선택)
    user_q = db.query(CheckSession).join(User, CheckSession.user_id == User.id).filter(CheckSession.date == query_date)
    if group_id:
        user_sessions = user_q.filter(User.group_id == group_id).all()
    else:
        user_sessions = user_q.all()

    # Employee 세션
    emp_q = db.query(CheckSession).join(Employee, CheckSession.employee_id == Employee.id).filter(CheckSession.date == query_date)
    if group_id:
        emp_sessions = emp_q.filter(Employee.group_id == group_id).all()
    else:
        emp_sessions = emp_q.all()

    all_sessions = user_sessions + emp_sessions
    all_sessions.sort(key=lambda s: s.checked_at or s.id, reverse=True)

    # User/Employee 매핑 캐시
    user_ids = [s.user_id for s in all_sessions if s.user_id]
    emp_ids = [s.employee_id for s in all_sessions if s.employee_id]
    users_map = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    emps_map = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}
    group_map = {g.id: g.name for g in db.query(Group).all()}

    result = []
    for s in all_sessions:
        gid = None
        if s.user_id:
            user = users_map.get(s.user_id)
            gid = user.group_id if user else None
        elif s.employee_id:
            emp = emps_map.get(s.employee_id)
            gid = emp.group_id if emp else None

        override = s.override
        result.append(SessionResponse(
            id=s.id,
            user_id=s.user_id or s.employee_id or 0,
            group_name=group_map.get(gid, "") if gid else "",
            date=s.date,
            attempt_count=s.attempt_count,
            helmet_pass=s.helmet_pass,
            vest_pass=s.vest_pass,
            cv_confidence=s.cv_confidence,
            image_url=s.image_url,
            status=s.status,
            override_reason=override.reason if override else None,
            checked_at=s.checked_at,
        ))
    return result


@router.post("/{session_id}/override", response_model=SessionResponse)
def override_session(
    session_id: int,
    body: OverrideRequest,
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    POST /admin/sessions/{id}/override
    3회 실패한 세션을 관리자가 수동 통과(pass_override) 처리한다.
    User와 Employee 세션 모두 지원한다.

    요청: { reason?: "통과 사유" }
    """
    session = db.query(CheckSession).filter(CheckSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")

    # 작업자의 그룹명 조회 (있으면)
    group = None
    if session.user_id:
        user = db.query(User).filter(User.id == session.user_id).first()
        if user and user.group_id:
            group = db.query(Group).filter(Group.id == user.group_id).first()
    elif session.employee_id:
        emp = db.query(Employee).filter(Employee.id == session.employee_id).first()
        if emp and emp.group_id:
            group = db.query(Group).filter(Group.id == emp.group_id).first()

    # 기존 오버라이드가 있으면 업데이트, 없으면 생성
    override = session.override
    if override:
        override.reason = body.reason
    else:
        override = AdminOverride(
            session_id=session.id,
            admin_id=admin.id,
            admin_emp_no=admin.emp_no,
            reason=body.reason,
        )
        db.add(override)

    # 세션 상태를 pass_override로 변경
    session.status = "pass_override"

    # 감사 로그
    audit = AuditLog(
        admin_id=admin.id,
        admin_emp_no=admin.emp_no,
        action="override_pass",
        target_type="check_session",
        target_id=session.id,
        detail=json.dumps({
            "user_id": session.user_id,
            "employee_id": session.employee_id,
            "reason": body.reason,
        }, ensure_ascii=False),
    )
    db.add(audit)
    db.commit()
    db.refresh(session)

    return SessionResponse(
        id=session.id,
        user_id=session.user_id or session.employee_id or 0,
        group_name=group.name if group else "",
        date=session.date,
        attempt_count=session.attempt_count,
        helmet_pass=session.helmet_pass,
        vest_pass=session.vest_pass,
        cv_confidence=session.cv_confidence,
        image_url=session.image_url,
        status=session.status,
        override_reason=override.reason,
        checked_at=session.checked_at,
    )
