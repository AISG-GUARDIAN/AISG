"""
일용직 작업자 관리 라우터.
system_id 자동 발급

엔드포인트:
- GET    /admin/users            — 일용직 작업자 목록
- POST   /admin/users            — 일용직 작업자 생성 (system_id 자동 발급)
- PUT    /admin/users/{id}       — 일용직 작업자 수정
- DELETE /admin/users/{id}       — 일용직 작업자 삭제
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin import Admin
from app.models.check_session import CheckSession
from app.models.group import Group
from app.models.user import User
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.services.auto_id_service import generate_system_id

router = APIRouter(prefix="/admin/users", tags=["일용직 관리"])


@router.get("", response_model=list[UserResponse])
def list_users(
    group_id: int | None = Query(None, description="그룹 ID 필터"),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """GET /admin/users?group_id=1 — 관리자 소속 그룹의 일용직 작업자 목록."""
    admin_group_ids = [g.id for g in db.query(Group).filter(Group.admin_id == admin.id).all()]

    query = db.query(User).filter(or_(User.group_id.in_(admin_group_ids), User.group_id.is_(None)))
    if group_id is not None:
        if group_id not in admin_group_ids:
            raise HTTPException(status_code=403, detail="해당 그룹에 접근 권한이 없습니다")
        query = query.filter(User.group_id == group_id)

    users = query.order_by(User.created_at.desc()).all()
    group_map = {g.id: g.name for g in db.query(Group).filter(Group.id.in_(admin_group_ids)).all()}

    # 오늘 체크인 상태 조회
    user_ids = [u.id for u in users]
    checkin_map = {}
    if user_ids:
        today = date.today()
        sessions = (
            db.query(CheckSession)
            .filter(CheckSession.user_id.in_(user_ids), CheckSession.date == today)
            .order_by(CheckSession.checked_at.desc())
            .all()
        )
        for s in sessions:
            if s.user_id not in checkin_map:
                checkin_map[s.user_id] = s.status

    return [
        UserResponse(
            id=u.id, system_id=u.system_id,
            language=u.language,
            group_id=u.group_id, group_name=group_map.get(u.group_id, ""),
            checkin_status=checkin_map.get(u.id),
            created_at=u.created_at,
        )
        for u in users
    ]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """POST /admin/users — 일용직 작업자 생성. 전화번호 뒷자리로 system_id 자동 발급."""
    # 그룹 권한 확인
    group = None
    if body.group_id:
        group = db.query(Group).filter(Group.id == body.group_id, Group.admin_id == admin.id).first()
        if not group:
            raise HTTPException(status_code=403, detail="해당 그룹에 접근 권한이 없습니다")

    system_id = generate_system_id(db, body.last_call_number)
    user = User(
        system_id=system_id,
        language=body.language,
        group_id=body.group_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id, system_id=user.system_id,
        language=user.language,
        group_id=user.group_id, group_name=group.name if group else "",
        created_at=user.created_at,
    )


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, body: UserUpdate, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """PUT /admin/users/{id} — 일용직 작업자 수정."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="작업자를 찾을 수 없습니다")

    group = db.query(Group).filter(Group.id == user.group_id, Group.admin_id == admin.id).first()
    if not group:
        raise HTTPException(status_code=403, detail="해당 작업자에 접근 권한이 없습니다")

    if body.language is not None:
        user.language = body.language
    if body.group_id is not None:
        new_group = db.query(Group).filter(Group.id == body.group_id, Group.admin_id == admin.id).first()
        if not new_group:
            raise HTTPException(status_code=403, detail="대상 그룹에 접근 권한이 없습니다")
        user.group_id = body.group_id
        group = new_group

    db.commit()
    db.refresh(user)
    return UserResponse(
        id=user.id, system_id=user.system_id,
        language=user.language,
        group_id=user.group_id, group_name=group.name,
        created_at=user.created_at,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """DELETE /admin/users/{id} — 일용직 작업자 삭제. 체크인 기록이 있으면 삭제 차단."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="작업자를 찾을 수 없습니다")
    group = db.query(Group).filter(Group.id == user.group_id, Group.admin_id == admin.id).first()
    if not group:
        raise HTTPException(status_code=403, detail="해당 작업자에 접근 권한이 없습니다")

    # 체크인 기록이 있으면 삭제 차단 (안전 점검 이력 보존)
    has_checkin = db.query(CheckSession).filter(CheckSession.user_id == user_id).first()
    if has_checkin:
        raise HTTPException(
            status_code=409,
            detail="체크인 기록이 있는 작업자는 삭제할 수 없습니다. 그룹에서 제외하거나 비활성화해 주세요.",
        )

    db.delete(user)
    db.commit()
