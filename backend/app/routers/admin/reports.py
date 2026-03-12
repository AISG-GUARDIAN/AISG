"""
보고서 라우터.

엔드포인트:
- POST /admin/reports       — 보고서 생성
- GET  /admin/reports       — 보고서 목록
- GET  /admin/reports/{id}  — 보고서 상세
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin import Admin
from app.models.report import Report
from app.schemas.report import ReportCreate, ReportResponse
from app.services.report_service import generate_report

router = APIRouter(prefix="/admin/reports", tags=["보고서"])


@router.post("", response_model=ReportResponse, status_code=201)
def create_report(body: ReportCreate, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """POST /admin/reports — 지정 기간의 LLM 보고서를 생성한다."""
    report = generate_report(db, admin.id, body.period_type, body.period_from, body.period_to)
    return ReportResponse(
        id=report.id, admin_id=report.admin_id,
        period_type=report.period_type,
        period_from=report.period_from, period_to=report.period_to,
        status=report.status, content=report.content,
        file_url=report.file_url, created_at=report.created_at,
    )


@router.get("", response_model=list[ReportResponse])
def list_reports(
    period_type: str | None = Query(None),
    admin: Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """GET /admin/reports — 보고서 목록."""
    query = db.query(Report).filter(Report.admin_id == admin.id)
    if period_type:
        query = query.filter(Report.period_type == period_type)
    reports = query.order_by(Report.created_at.desc()).all()
    return [
        ReportResponse(
            id=r.id, admin_id=r.admin_id,
            period_type=r.period_type,
            period_from=r.period_from, period_to=r.period_to,
            status=r.status, content=r.content,
            file_url=r.file_url, created_at=r.created_at,
        )
        for r in reports
    ]


@router.get("/{report_id}", response_model=ReportResponse)
def get_report(report_id: int, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """GET /admin/reports/{id} — 보고서 상세."""
    report = db.query(Report).filter(Report.id == report_id, Report.admin_id == admin.id).first()
    if not report:
        raise HTTPException(status_code=404, detail="보고서를 찾을 수 없습니다")
    return ReportResponse(
        id=report.id, admin_id=report.admin_id,
        period_type=report.period_type,
        period_from=report.period_from, period_to=report.period_to,
        status=report.status, content=report.content,
        file_url=report.file_url, created_at=report.created_at,
    )
