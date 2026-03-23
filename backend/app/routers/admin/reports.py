from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin import Admin
from app.schemas.report import ReportCreate, ReportResponse
from app.services.report_service import generate_report

router = APIRouter(prefix="/admin/reports", tags=["보고서 작성"])

@router.post("", response_model=ReportResponse)
def create_report(
    body: ReportCreate, 
    admin: Admin = Depends(get_current_admin), 
    db: Session = Depends(get_db)
):
    """
    POST /admin/reports
    주어진 기간의 통계 데이터를 조회하여 Azure OpenAI 기반으로 안전 점검 보고서를 생성합니다.
    """
    return generate_report(
        db=db, 
        admin_id=admin.id, 
        period_type=body.period_type, 
        period_from=body.period_from, 
        period_to=body.period_to
    )