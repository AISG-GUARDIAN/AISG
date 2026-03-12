"""
그룹 관리 라우터.

엔드포인트:
- GET    /admin/groups       — 그룹 목록 조회
- POST   /admin/groups       — 그룹 생성
- PUT    /admin/groups/{id}  — 그룹 수정
- DELETE /admin/groups/{id}  — 그룹 삭제
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin import Admin
from app.models.group import Group
from app.models.user import User
from app.schemas.group import GroupCreate, GroupResponse, GroupUpdate

router = APIRouter(prefix="/admin/groups", tags=["그룹 관리"])


@router.get("", response_model=list[GroupResponse])
def list_groups(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """GET /admin/groups — 관리자 소속 그룹 목록."""
    groups = db.query(Group).filter(Group.admin_id == admin.id).order_by(Group.name).all()
    result = []
    for g in groups:
        user_count = (
            db.query(func.count(User.id)).filter(User.group_id == g.id).scalar()
        ) or 0
        result.append(GroupResponse(
            id=g.id, admin_id=g.admin_id, name=g.name,
            user_count=user_count, created_at=g.created_at,
        ))
    return result


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
def create_group(body: GroupCreate, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """POST /admin/groups — 그룹 생성."""
    group = Group(admin_id=admin.id, name=body.name)
    db.add(group)
    db.commit()
    db.refresh(group)
    return GroupResponse(
        id=group.id, admin_id=group.admin_id, name=group.name,
        user_count=0, created_at=group.created_at,
    )


@router.put("/{group_id}", response_model=GroupResponse)
def update_group(group_id: int, body: GroupUpdate, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """PUT /admin/groups/{id} — 그룹 수정."""
    group = db.query(Group).filter(Group.id == group_id, Group.admin_id == admin.id).first()
    if not group:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다")
    group.name = body.name
    db.commit()
    db.refresh(group)
    user_count = db.query(func.count(User.id)).filter(User.group_id == group.id).scalar() or 0
    return GroupResponse(
        id=group.id, admin_id=group.admin_id, name=group.name,
        user_count=user_count, created_at=group.created_at,
    )


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """DELETE /admin/groups/{id} — 그룹 삭제. 소속 작업자의 group_id는 NULL로 설정됨."""
    group = db.query(Group).filter(Group.id == group_id, Group.admin_id == admin.id).first()
    if not group:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다")
    db.delete(group)
    db.commit()
