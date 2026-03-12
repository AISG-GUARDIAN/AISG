"""
작업자 관리 라우터.
system_id 자동 발급, 엑셀 일괄 등록 포함.

엔드포인트:
- GET    /admin/users            — 작업자 목록
- POST   /admin/users            — 작업자 생성 (system_id 자동 발급)
- PUT    /admin/users/{id}       — 작업자 수정
- DELETE /admin/users/{id}       — 작업자 삭제
- POST   /admin/users/excel      — 엑셀 일괄 등록
"""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin import Admin
from app.models.group import Group
from app.models.user import User
from app.schemas.user import ExcelUploadResponse, UserCreate, UserResponse, UserUpdate
from app.services.excel_service import generate_system_id, parse_and_import_users

router = APIRouter(prefix="/admin/users", tags=["작업자 관리"])


@router.get("", response_model=list[UserResponse])
def list_users(
    group_id: int | None = Query(None, description="그룹 ID 필터"),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """GET /admin/users?group_id=1 — 관리자 소속 그룹의 작업자 목록."""
    admin_group_ids = [g.id for g in db.query(Group).filter(Group.admin_id == admin.id).all()]

    query = db.query(User).filter(User.group_id.in_(admin_group_ids))
    if group_id is not None:
        if group_id not in admin_group_ids:
            raise HTTPException(status_code=403, detail="해당 그룹에 접근 권한이 없습니다")
        query = query.filter(User.group_id == group_id)

    users = query.order_by(User.name).all()
    group_map = {g.id: g.name for g in db.query(Group).filter(Group.id.in_(admin_group_ids)).all()}

    return [
        UserResponse(
            id=u.id, system_id=u.system_id, emp_no=u.emp_no,
            name=u.name, language=u.language,
            group_id=u.group_id, group_name=group_map.get(u.group_id, ""),
            created_at=u.created_at,
        )
        for u in users
    ]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    # 사원번호 중복 확인
    if body.emp_no:
        existing = db.query(User).filter(User.emp_no == body.emp_no).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"이미 등록된 사원번호입니다: {body.emp_no}")

    system_id = generate_system_id(db)
    user = User(
        system_id=system_id, emp_no=body.emp_no if body.emp_no else None,
        name=body.name, language=body.language, group_id=body.group_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserResponse(
        id=user.id, system_id=user.system_id, emp_no=user.emp_no,
        name=user.name, language=user.language,
        group_id=user.group_id, group_name=group.name,
        created_at=user.created_at,
    )


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, body: UserUpdate, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """PUT /admin/users/{id} — 작업자 수정."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="작업자를 찾을 수 없습니다")

    group = db.query(Group).filter(Group.id == user.group_id, Group.admin_id == admin.id).first()
    if not group:
        raise HTTPException(status_code=403, detail="해당 작업자에 접근 권한이 없습니다")

    if body.name is not None:
        user.name = body.name
    if body.emp_no is not None:
        user.emp_no = body.emp_no if body.emp_no else None
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
        id=user.id, system_id=user.system_id, emp_no=user.emp_no,
        name=user.name, language=user.language,
        group_id=user.group_id, group_name=group.name,
        created_at=user.created_at,
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """DELETE /admin/users/{id} — 작업자 삭제."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="작업자를 찾을 수 없습니다")
    group = db.query(Group).filter(Group.id == user.group_id, Group.admin_id == admin.id).first()
    if not group:
        raise HTTPException(status_code=403, detail="해당 작업자에 접근 권한이 없습니다")
    db.delete(user)
    db.commit()


@router.post("/excel", response_model=ExcelUploadResponse)
async def upload_excel(
    group_id: int = Query(..., description="등록할 그룹 ID"),
    file: UploadFile = File(..., description="엑셀 파일 (.xlsx)"),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """POST /admin/users/excel?group_id=1 — 엑셀 일괄 등록. 엑셀 형식: | 이름 | 사원번호(선택) | 언어(선택) |"""
    group = db.query(Group).filter(Group.id == group_id, Group.admin_id == admin.id).first()
    if not group:
        raise HTTPException(status_code=403, detail="해당 그룹에 접근 권한이 없습니다")
    file_data = await file.read()
    result = parse_and_import_users(db, file_data, group_id)
    return ExcelUploadResponse(**result)
