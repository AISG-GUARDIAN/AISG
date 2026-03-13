from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import require_admin
from app.schemas.check_session import OverrideRequest

router = APIRouter()

@router.get("/")
def list_sessions(db: Session = Depends(get_db), _=Depends(require_admin)):
    """GET /admin/sessions — 당일 체크인 현황."""
    from app.models.check_session import CheckSession
    from datetime import date
    today = date.today()
    return db.query(CheckSession).filter(CheckSession.created_at >= today).all()

@router.post("/override")
def override_session(body: OverrideRequest, db: Session = Depends(get_db), admin=Depends(require_admin)):
    """POST /admin/sessions/override — 관리자 수동 통과 처리."""
    from app.services.auth_service import apply_override
    return apply_override(db, body.session_id, admin["sub"], body.reason)
