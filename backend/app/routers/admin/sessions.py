"""
체크인 세션 관리 라우터.
당일 체크인 현황 조회 및 관리자 오버라이드(수동 통과).

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
    """GET /admin/sessions?target_date=2026-03-12&group_id=1 — 체크인 세션 목록."""
    if target_date is None:
        query_date = date.today()
    else:
        query_date = date.fromisoformat(target_date)

    admin_group_ids = [g.id for g in db.query(Group).filter(Group.admin_id == admin.id).all()]

    query = (
        db.query(CheckSession)
        .join(User, CheckSession.user_id == User.id)
        .filter(User.group_id.in_(admin_group_ids), CheckSession.date == query_date)
    )

    if group_id is not None:
        if group_id not in admin_group_ids:
            raise HTTPException(status_code=403, detail="해당 그룹에 접근 권한이 없습니다")
        query = query.filter(User.group_id == group_id)

    sessions = query.order_by(CheckSession.checked_at.desc()).all()

    user_ids = [s.user_id for s in sessions]
    users_map = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}
    group_map = {g.id: g.name for g in db.query(Group).filter(Group.id.in_(admin_group_ids)).all()}

    result = []
    for s in sessions:
        user = users_map.get(s.user_id)
        override = s.override
        result.append(SessionResponse(
            id=s.id, user_id=s.user_id,
            group_name=group_map.get(user.group_id, "") if user else "",
            date=s.date, attempt_count=s.attempt_count,
            helmet_pass=s.helmet_pass, vest_pass=s.vest_pass,
            cv_confidence=s.cv_confidence, image_url=s.image_url,
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

    요청: { reason?: "통과 사유" }
    """
    session = db.query(CheckSession).filter(CheckSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")

    user = db.query(User).filter(User.id == session.user_id).first()
    group = db.query(Group).filter(Group.id == user.group_id, Group.admin_id == admin.id).first()
    if not group:
        raise HTTPException(status_code=403, detail="해당 세션에 접근 권한이 없습니다")

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
            "user_id": user.id, "reason": body.reason,
        }, ensure_ascii=False),
    )
    db.add(audit)
    db.commit()
    db.refresh(session)

    return SessionResponse(
        id=session.id, user_id=session.user_id,
        group_name=group.name,
        date=session.date, attempt_count=session.attempt_count,
        helmet_pass=session.helmet_pass, vest_pass=session.vest_pass,
        cv_confidence=session.cv_confidence, image_url=session.image_url,
        status=session.status,
        override_reason=override.reason,
        checked_at=session.checked_at,
    )
