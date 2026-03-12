from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.auth_service import authenticate_admin, authenticate_user
from app.schemas.admin import AdminLogin

router = APIRouter()

@router.post("/login")
def login(body: AdminLogin, db: Session = Depends(get_db)):
    """POST /auth/login — admin/user 공통 로그인."""
    result = authenticate_admin(db, body.username, body.password)
    if result:
        return result
    result = authenticate_user(db, body.username)
    if result:
        return result
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
