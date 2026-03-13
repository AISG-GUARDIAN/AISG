"""
정규직 체크인 라우터.
사번으로 로그인한 정규직 사원의 안전물품 착용 체크.
check_sessions 테이블에 employee_id로 기록한다.

엔드포인트:
- POST /employee/checkin — 정규직 안전물품 체크인
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_employee
from app.models.check_session import CheckSession
from app.models.employee import Employee
from app.schemas.check_session import CheckinResponse
from app.services.blob_service import upload_image
from app.services.cv_service import analyze_safety_image

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/employee", tags=["정규직"])


@router.post("/checkin", response_model=CheckinResponse)
async def employee_checkin(
    image: UploadFile = File(..., description="안전물품 촬영 이미지"),
    current_employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """
    POST /employee/checkin
    정규직 사원의 안전물품 착용 여부를 판정한다.
    하루 1회 기록. 이미 통과한 경우 재촬영 거부.
    """
    today = date.today()

    # 오늘 이미 통과했는지 확인
    existing = (
        db.query(CheckSession)
        .filter(
            CheckSession.employee_id == current_employee.id,
            CheckSession.date == today,
            CheckSession.status == "pass",
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="오늘 이미 통과한 기록이 있습니다")

    # 이미지 업로드 + AI 분석
    image_data = await image.read()
    upload_image(image_data)
    analysis = analyze_safety_image(image_data)

    helmet_pass = analysis["helmet_pass"]
    vest_pass = analysis["vest_pass"]
    cv_confidence = analysis["cv_confidence"]
    status_val = "pass" if (helmet_pass and vest_pass) else "fail"

    # check_sessions에 기록 (employee_id 사용)
    session = CheckSession(
        employee_id=current_employee.id,
        date=today,
        attempt_count=1,
        helmet_pass=helmet_pass,
        vest_pass=vest_pass,
        cv_confidence=cv_confidence,
        status=status_val,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # 메시지
    if status_val == "pass":
        message = "안전물품 착용이 확인되었습니다. 안전한 작업 되세요!"
    else:
        missing = []
        if not helmet_pass:
            missing.append("안전모")
        if not vest_pass:
            missing.append("안전조끼")
        message = f"{', '.join(missing)} 미감지. 착용 후 재시도해 주세요."

    return CheckinResponse(
        session_id=session.id,
        status=status_val,
        attempt_count=1,
        helmet_pass=helmet_pass,
        vest_pass=vest_pass,
        cv_confidence=cv_confidence,
        message=message,
        needs_admin=False,
    )
