"""
정규직 체크인 라우터.
사번으로 로그인한 정규직 사원의 안전물품 착용 체크.
check_sessions 테이블에 employee_id로 기록한다.

엔드포인트:
- POST /employee/checkin — 정규직 안전물품 체크인
"""

import base64
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_employee
from app.models.check_session import CheckSession
from app.models.employee import Employee
from app.schemas.check_session import CheckinRequest, CheckinResponse
from app.services.cv_service import analyze_safety_image
from app.services.notify_service import check_and_notify

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/employee", tags=["정규직"])


@router.post("/checkin", response_model=CheckinResponse)
async def employee_checkin(
    body: CheckinRequest,
    current_employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """
    POST /employee/checkin
    정규직 사원의 안전물품 착용 여부를 3단계 파이프라인으로 판정한다.
    하루 최대 3회 시도, 3회 모두 실패 시 관리자 호출.

    흐름:
    1. 오늘 이미 통과했는지 확인 → 이미 통과 시 거부
    2. 오늘 시도 횟수 확인 → 3회 초과 시 거부
    3. BASE64 디코딩 → Face API 정면 감지 → 모자이크 → Custom Vision
    4. retry(정면 아님) 시 시도 횟수 소모 없이 재촬영 요청
    5. 결과 DB 저장 (이미지 미저장)
    6. 3회째 실패 시 관리자 호출
    """
    today = date.today()

    # 1. 오늘 이미 통과했는지 확인
    existing = (
        db.query(CheckSession)
        .filter(
            CheckSession.employee_id == current_employee.id,
            CheckSession.date == today,
            CheckSession.status.in_(["pass", "pass_override"]),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="오늘 이미 통과한 기록이 있습니다")

    # 2. 오늘 시도 횟수 확인 — 최대 3회
    today_count = (
        db.query(CheckSession)
        .filter(
            CheckSession.employee_id == current_employee.id,
            CheckSession.date == today,
        )
        .count()
    )
    if today_count >= 3:
        raise HTTPException(
            status_code=400,
            detail="오늘 최대 시도 횟수(3회)를 초과했습니다. 관리자에게 문의하세요.",
        )

    attempt_count = today_count + 1

    # 3. BASE64 디코딩
    try:
        image_b64 = body.image_base64
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        image_data = base64.b64decode(image_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="잘못된 BASE64 이미지입니다")

    # 4. 3단계 파이프라인 — 정면 감지 → 모자이크 → 안전물품 판별
    analysis = analyze_safety_image(image_data)

    # retry — 정면이 아닌 경우 시도 횟수 소모 없이 재촬영 요청
    if analysis["status"] == "retry":
        return CheckinResponse(
            session_id=None,
            status="retry",
            attempt_count=attempt_count - 1,
            face_detected=False,
            message=analysis["retry_reason"],
        )

    helmet_pass = analysis["helmet_pass"]
    vest_pass = analysis["vest_pass"]
    cv_confidence = analysis["cv_confidence"]
    status_val = analysis["status"]

    # 5. check_sessions에 기록 (이미지 미저장 — 개인정보 보호)
    session = CheckSession(
        employee_id=current_employee.id,
        date=today,
        attempt_count=attempt_count,
        helmet_pass=helmet_pass,
        vest_pass=vest_pass,
        cv_confidence=cv_confidence,
        image_url=None,
        status=status_val,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # 6. 3회째 실패 시 관리자 호출
    needs_admin = False
    if status_val == "fail":
        needs_admin = check_and_notify(db, current_employee, attempt_count, session.id)

    # 메시지
    if status_val == "pass":
        message = "안전물품 착용이 확인되었습니다. 안전한 작업 되세요!"
    elif needs_admin:
        message = f"안전물품 미착용 ({attempt_count}회 시도 모두 실패). 관리자가 호출되었습니다."
    else:
        missing = []
        if not helmet_pass:
            missing.append("안전모")
        if not vest_pass:
            missing.append("안전조끼")
        message = f"{', '.join(missing)} 미감지 ({attempt_count}/3회 시도)"

    return CheckinResponse(
        session_id=session.id,
        status=status_val,
        attempt_count=attempt_count,
        helmet_pass=helmet_pass,
        vest_pass=vest_pass,
        cv_confidence=cv_confidence,
        face_detected=True,
        message=message,
        needs_admin=needs_admin,
    )
