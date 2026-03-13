from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import require_admin

router = APIRouter()

@router.get("/")
def list_groups(db: Session = Depends(get_db), _=Depends(require_admin)):
    """GET /admin/groups — 그룹 목록 조회."""
    from app.models.group import Group
    return db.query(Group).all()

@router.post("/")
def create_group(name: str, description: str = "", db: Session = Depends(get_db), _=Depends(require_admin)):
    """POST /admin/groups — 그룹 생성."""
    from app.models.group import Group
    group = Group(name=name, description=description)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group

@router.delete("/{group_id}")
def delete_group(group_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """DELETE /admin/groups/{group_id} — 그룹 삭제."""
    from app.models.group import Group
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Group not found")
    db.delete(group)
    db.commit()
    return {"ok": True}
