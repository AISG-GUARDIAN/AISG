from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import require_admin
from app.schemas.user import UserCreate, UserOut

router = APIRouter()

@router.get("/")
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    """GET /admin/users — 작업자 목록."""
    from app.models.user import User
    return db.query(User).all()

@router.post("/")
def create_user(body: UserCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    """POST /admin/users — 작업자 등록."""
    from app.models.user import User
    user = User(**body.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/import")
async def import_users(file: UploadFile = File(...), db: Session = Depends(get_db), _=Depends(require_admin)):
    """POST /admin/users/import — 엑셀 일괄 등록."""
    from app.services.excel_service import import_users_from_excel
    content = await file.read()
    return import_users_from_excel(db, content)
