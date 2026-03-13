"""
인증 라우터.
관리자(사원번호), 정규직(사원번호), 일용직(전화번호 뒷자리) 로그인 엔드포인트.

엔드포인트:
- POST /auth/admin/login    — 관리자 로그인
- POST /auth/employee/login — 정규직 로그인 (사번)
- POST /auth/user/login     — 일용직 로그인 (전화번호 뒷자리)
- GET  /auth/groups          — 로그인 화면용 그룹 목록
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.group import Group
from app.schemas.auth import AdminLoginRequest, EmployeeLoginRequest, TokenResponse, UserLoginRequest
from app.services.auth_service import (
    authenticate_admin,
    authenticate_employee,
    authenticate_user,
    create_admin_token,
    create_employee_token,
    create_user_token,
)

router = APIRouter(prefix="/auth", tags=["인증"])


@router.post("/admin/login", response_model=TokenResponse)
def admin_login(body: AdminLoginRequest, db: Session = Depends(get_db)):
    """POST /auth/admin/login — 관리자 로그인. 사원번호만으로 인증 후 JWT 발급."""
    admin = authenticate_admin(db, body.emp_no)
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="등록되지 않은 사원번호입니다",
        )

    token = create_admin_token(admin)
    return TokenResponse(access_token=token, role="admin")


@router.post("/employee/login", response_model=TokenResponse)
def employee_login(body: EmployeeLoginRequest, db: Session = Depends(get_db)):
    """POST /auth/employee/login — 정규직 로그인. employees 테이블에 등록된 사번만 허용."""
    employee = authenticate_employee(db, body.emp_no, body.language)
    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="등록되지 않은 사원번호입니다",
        )

    token = create_employee_token(employee)
    return TokenResponse(access_token=token, role="employee")


@router.post("/user/login", response_model=TokenResponse)
def user_login(body: UserLoginRequest, db: Session = Depends(get_db)):
    """POST /auth/user/login — 일용직 로그인. 전화번호 뒷자리로 system_id 자동 발급."""
    user = authenticate_user(db, body.last_call_number, body.language)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인 처리 중 문제가 발생했습니다.",
        )
    token = create_user_token(user)
    return TokenResponse(access_token=token, role="user")


@router.get("/groups")
def list_groups_for_login(db: Session = Depends(get_db)):
    """GET /auth/groups — 로그인 화면에서 참고용 그룹 목록. 인증 불필요."""
    groups = db.query(Group).order_by(Group.name).all()
    return [{"id": g.id, "name": g.name} for g in groups]
