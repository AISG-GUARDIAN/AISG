from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import require_admin
from app.schemas.report import ReportRequest, ReportOut

router = APIRouter()

@router.post("/")
def create_report(body: ReportRequest, background_tasks: BackgroundTasks,
                  db: Session = Depends(get_db), _=Depends(require_admin)):
    """POST /admin/reports — LLM 보고서 생성 (비동기)."""
    from app.services.report_service import generate_report
    background_tasks.add_task(generate_report, db, body.period)
    return {"message": "보고서 생성 중"}

@router.get("/")
def list_reports(db: Session = Depends(get_db), _=Depends(require_admin)):
    """GET /admin/reports — 보고서 목록."""
    from app.models.report import Report
    return db.query(Report).order_by(Report.created_at.desc()).all()
