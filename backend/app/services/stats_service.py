from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta

def get_statistics(db: Session, period: str) -> dict:
    """기간별 체크인 통계 집계."""
    from app.models.check_session import CheckSession
    today = date.today()
    if period == "daily":
        start = today
    elif period == "weekly":
        start = today - timedelta(days=7)
    else:
        start = today - timedelta(days=30)

    total = db.query(func.count(CheckSession.id)).filter(CheckSession.created_at >= start).scalar()
    passed = db.query(func.count(CheckSession.id)).filter(
        CheckSession.created_at >= start, CheckSession.passed == True
    ).scalar()
    return {"period": period, "total": total, "passed": passed, "failed": total - passed}
