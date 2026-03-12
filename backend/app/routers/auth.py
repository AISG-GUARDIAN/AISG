"""
인증 라우터.
관리자(사원번호) 및 작업자(시스템ID) 로그인 엔드포인트를 제공한다.

엔드포인트:
- POST /auth/admin/login — 관리자 로그인 (사원번호)
- POST /auth/user/login — 작업자 로그인 (시스템ID)
- GET  /auth/groups — 로그인 화면용 그룹 목록 (인증 불필요)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.group import Group
from app.schemas.auth import AdminLoginRequest, TokenResponse, UserLoginRequest
from app.services.auth_service import (
    authenticate_admin,
    authenticate_user,
    create_admin_token,
    create_user_token,
)

router = APIRouter(prefix="/auth", tags=["인증"])


@router.post("/admin/login", response_model=TokenResponse)
def admin_login(body: AdminLoginRequest, db: Session = Depends(get_db)):
    """
    POST /auth/admin/login
    관리자 로그인. 사원번호만으로 인증 후 JWT를 발급한다.

    요청: { emp_no }
    응답: { access_token, token_type, role, name }
    실패: 401 (사원번호 미등록)
    """
    admin = authenticate_admin(db, body.emp_no)
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="등록되지 않은 사원번호입니다",
        )

    token = create_admin_token(admin)
    return TokenResponse(access_token=token, role="admin", name=admin.name)


@router.post("/user/login", response_model=TokenResponse)
def user_login(body: UserLoginRequest, db: Session = Depends(get_db)):
    """
    POST /auth/user/login
    작업자 로그인. 
    """
    user = authenticate_user(db, body.last_call_number, body.emp_no)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="로그인 처리 중 문제가 발생했습니다." # (사번이 틀린 경우 등)
        )
    token = create_user_token(user)
    return TokenResponse(access_token=token, role="user")

    
@router.get("/groups")
def list_groups_for_login(db: Session = Depends(get_db)):
    """
    GET /auth/groups
    로그인 화면에서 참고용으로 사용할 그룹 목록을 반환한다.
    인증 없이 접근 가능.
    """
    groups = db.query(Group).order_by(Group.name).all()
    return [{"id": g.id, "name": g.name} for g in groups]
