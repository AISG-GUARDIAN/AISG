from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import require_admin

router = APIRouter()

@router.get("/")
def get_stats(period: str = Query("daily", regex="^(daily|weekly|monthly)$"),
              db: Session = Depends(get_db), _=Depends(require_admin)):
    """GET /admin/stats?period=daily|weekly|monthly — 통계 조회."""
    from app.services.stats_service import get_statistics
    return get_statistics(db, period)
