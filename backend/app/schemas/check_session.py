"""
체크인 세션 관련 요청/응답 스키마.
안전물품(안전모/조끼) 촬영·판정 및 관리자 오버라이드에 사용된다.
"""

from datetime import date, datetime
from pydantic import BaseModel, Field


class CheckinRequest(BaseModel):
    """
    체크인(촬영) 요청.
    프론트엔드에서 BASE64 인코딩된 이미지를 전송한다.

    Attributes:
        image_base64: BASE64 인코딩된 이미지 문자열
    """

    image_base64: str = Field(..., description="BASE64 인코딩된 촬영 이미지")


class CheckinResponse(BaseModel):
    """
    체크인(촬영 판정) 응답.

    Attributes:
        session_id: 생성된 세션 ID (retry 시 None)
        status: 판정 상태 (pass / fail / retry)
        attempt_count: 시도 횟수 (1~3, retry 시 현재 횟수 유지)
        helmet_pass: 안전모 착용 여부
        vest_pass: 안전조끼 착용 여부
        cv_confidence: AI 신뢰도 점수
        face_detected: 정면 얼굴 감지 여부
        message: 사용자에게 표시할 메시지
        needs_admin: 3회 실패로 관리자 호출 필요 여부
    """

    session_id: int | None = None
    status: str
    attempt_count: int
    helmet_pass: bool | None = None
    vest_pass: bool | None = None
    cv_confidence: float | None = None
    face_detected: bool = True
    message: str
    needs_admin: bool = False


class SessionResponse(BaseModel):
    """
    체크인 세션 상세 응답 (관리자 조회용).

    Attributes:
        id: 세션 ID
        user_id: 작업자 ID
        group_name: 소속 그룹명
        date: 체크인 날짜
        attempt_count: 시도 횟수
        helmet_pass: 안전모 착용 여부
        vest_pass: 안전조끼 착용 여부
        cv_confidence: AI 신뢰도
        image_url: 촬영 이미지 URL
        status: 판정 상태
        override_reason: 오버라이드 사유
        checked_at: 체크 시각
    """

    id: int
    user_id: int
    group_name: str | None = None
    date: date
    attempt_count: int
    helmet_pass: bool | None
    vest_pass: bool | None
    cv_confidence: float | None
    image_url: str | None
    status: str
    override_reason: str | None = None
    checked_at: datetime

    model_config = {"from_attributes": True}


class OverrideRequest(BaseModel):
    """
    관리자 오버라이드 요청.
    3회 실패한 세션을 수동 통과(pass_override) 처리한다.

    Attributes:
        reason: 통과 사유 (선택)
    """

    reason: str | None = Field(None, max_length=500, description="통과 사유")
