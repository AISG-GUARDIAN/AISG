"""
작업자 체크인 라우터.
안전물품 촬영 이미지를 받아 AI 분석(안전모/조끼) 후 결과를 반환한다.
하루 최대 3회 시도, 3회 모두 실패 시 관리자 호출.

엔드포인트:
- POST /user/checkin — 안전물품 촬영 체크인
"""

import logging
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.check_session import CheckSession
from app.models.user import User
from app.schemas.check_session import CheckinResponse
from app.services.blob_service import upload_image
from app.services.cv_service import analyze_safety_image
from app.services.notify_service import check_and_notify

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/user", tags=["작업자"])


@router.post("/checkin", response_model=CheckinResponse)
async def checkin(
    image: UploadFile = File(..., description="안전물품 촬영 이미지"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    POST /user/checkin
    작업자가 촬영한 이미지를 분석하여 안전모/조끼 착용 여부를 판정한다.

    흐름:
    1. 오늘 이미 통과했는지 확인 → 이미 통과 시 거부
    2. 오늘 시도 횟수 확인 → 3회 초과 시 거부
    3. 이미지를 Azure Blob에 저장
    4. Azure AI Vision으로 안전모/조끼 분석
    5. 결과를 DB에 저장
    6. 3회째 실패 시 관리자 호출

    요청: multipart/form-data (image 필드)
    응답: { session_id, status, attempt_count, helmet_pass, vest_pass, cv_confidence, message, needs_admin }
    """
    today = date.today()

    # 1. 오늘 이미 통과한 세션이 있는지 확인
    passed_session = (
        db.query(CheckSession)
        .filter(
            CheckSession.user_id == current_user.id,
            CheckSession.date == today,
            CheckSession.status.in_(["pass", "pass_override"]),
        )
        .first()
    )
    if passed_session:
        raise HTTPException(status_code=400, detail="오늘 이미 통과한 기록이 있습니다")

    # 2. 오늘 시도 횟수 확인 — 최대 3회
    today_count = (
        db.query(CheckSession)
        .filter(
            CheckSession.user_id == current_user.id,
            CheckSession.date == today,
        )
        .count()
    )
    if today_count >= 3:
        raise HTTPException(status_code=400, detail="오늘 최대 시도 횟수(3회)를 초과했습니다. 관리자에게 문의하세요.")

    attempt_count = today_count + 1

    # 3. 이미지 업로드
    image_data = await image.read()
    image_url = upload_image(image_data)

    # 4. Azure AI Vision 분석 — 안전모/조끼 각각 판정
    analysis = analyze_safety_image(image_data)
    helmet_pass = analysis["helmet_pass"]
    vest_pass = analysis["vest_pass"]
    cv_confidence = analysis["cv_confidence"]

    # 둘 다 통과해야 pass
    if helmet_pass and vest_pass:
        status_val = "pass"
    else:
        status_val = "fail"

    # 5. 체크인 세션 DB 저장
    session = CheckSession(
        user_id=current_user.id,
        date=today,
        attempt_count=attempt_count,
        helmet_pass=helmet_pass,
        vest_pass=vest_pass,
        cv_confidence=cv_confidence,
        image_url=image_url,
        status=status_val,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # 6. 3회째 실패 시 관리자 호출
    needs_admin = False
    if status_val == "fail":
        needs_admin = check_and_notify(db, current_user, attempt_count, session.id)

    # 사용자 메시지 생성
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
        message=message,
        needs_admin=needs_admin,
    )
