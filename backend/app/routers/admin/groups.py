"""
그룹 관리 라우터.

엔드포인트:
- GET    /admin/groups                — 그룹 목록 조회
- POST   /admin/groups                — 그룹 생성
- PUT    /admin/groups/{id}           — 그룹 수정
- DELETE /admin/groups/{id}           — 그룹 삭제
- GET    /admin/groups/{id}/users     — 그룹 소속 작업자 목록 조회
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin import Admin
from app.models.employee import Employee
from app.models.group import Group
from app.models.user import User
from app.schemas.group import GroupCreate, GroupResponse, GroupUpdate, GroupMembersResponse
from app.schemas.user import UserResponse
from app.schemas.employee import EmployeeResponse

router = APIRouter(prefix="/admin/groups", tags=["그룹 관리"])


def _count_group_members(db: Session, group_id: int) -> int:
    """그룹 소속 인원 수 (오늘 등록 일용직 + 정규직)."""
    today = date.today()
    u = (
        db.query(func.count(User.id))
        .filter(User.group_id == group_id, func.date(User.created_at) == today)
        .scalar() or 0
    )
    e = db.query(func.count(Employee.id)).filter(Employee.group_id == group_id).scalar() or 0
    return u + e


@router.get("", response_model=list[GroupResponse])
def list_groups(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """GET /admin/groups — 관리자 소속 그룹 목록."""
    groups = db.query(Group).filter(Group.admin_id == admin.id).order_by(Group.name).all()
    return [
        GroupResponse(
            id=g.id, admin_id=g.admin_id, name=g.name,
            user_count=_count_group_members(db, g.id), created_at=g.created_at,
        )
        for g in groups
    ]


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
    return GroupResponse(
        id=group.id, admin_id=group.admin_id, name=group.name,
        user_count=_count_group_members(db, group.id), created_at=group.created_at,
    )


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """DELETE /admin/groups/{id} — 그룹 삭제. 소속 작업자의 group_id는 NULL로 설정됨."""
    group = db.query(Group).filter(Group.id == group_id, Group.admin_id == admin.id).first()
    if not group:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다")

    # 소속 작업자/사원의 group_id를 NULL로 해제 (사원·유저 삭제 방지)
    db.query(User).filter(User.group_id == group_id).update({"group_id": None})
    db.query(Employee).filter(Employee.group_id == group_id).update({"group_id": None})
    db.flush()

    # ORM delete 대신 직접 DELETE — relationship cascade 방지
    db.query(Group).filter(Group.id == group_id).delete()
    db.commit()


@router.get("/{group_id}/users", response_model=GroupMembersResponse)
def get_group_users(group_id: int, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """GET /admin/groups/{id}/users — 그룹 소속 멤버 목록 (정규직 + 일용직)."""
    group = db.query(Group).filter(Group.id == group_id, Group.admin_id == admin.id).first()
    if not group:
        raise HTTPException(status_code=404, detail="그룹을 찾을 수 없습니다")

    # 일용직은 오늘 등록된 작업자만 표시 (매일 새 ID 발급 구조)
    today = date.today()
    users = (
        db.query(User)
        .filter(User.group_id == group_id, func.date(User.created_at) == today)
        .order_by(User.created_at.desc())
        .all()
    )
    emps = db.query(Employee).filter(Employee.group_id == group_id).order_by(Employee.emp_no).all()

    return GroupMembersResponse(
        employees=[
            EmployeeResponse(
                id=e.id, emp_no=e.emp_no, language=e.language,
                group_id=e.group_id, group_name=group.name,
                created_at=e.created_at,
            )
            for e in emps
        ],
        users=[
            UserResponse(
                id=u.id, system_id=u.system_id, language=u.language,
                group_id=u.group_id, group_name=group.name,
                created_at=u.created_at,
            )
            for u in users
        ],
    )
