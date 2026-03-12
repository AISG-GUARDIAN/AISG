from sqlalchemy.orm import Session
from app.core.security import verify_password, create_token

def authenticate_admin(db: Session, username: str, password: str):
    """관리자 로그인 검증 후 JWT 반환."""
    from app.models.admin import Admin
    admin = db.query(Admin).filter(Admin.username == username).first()
    if not admin or not verify_password(password, admin.hashed_password):
        return None
    token = create_token({"sub": str(admin.id), "role": "admin"})
    return {"access_token": token, "token_type": "bearer", "role": "admin"}

def authenticate_user(db: Session, system_id: str):
    """작업자 system_id 로그인 후 JWT 반환."""
    from app.models.user import User
    user = db.query(User).filter(User.system_id == system_id).first()
    if not user:
        return None
    token = create_token({"sub": str(user.id), "role": "user"})
    return {"access_token": token, "token_type": "bearer", "role": "user"}

def apply_override(db: Session, session_id: int, admin_id: str, reason: str):
    """관리자 수동 통과 처리."""
    from app.models.check_session import CheckSession
    from app.models.admin_override import AdminOverride
    session = db.query(CheckSession).filter(CheckSession.id == session_id).first()
    if not session:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Session not found")
    session.passed = True
    override = AdminOverride(session_id=session_id, admin_id=int(admin_id), reason=reason)
    db.add(override)
    db.commit()
    return {"ok": True}
