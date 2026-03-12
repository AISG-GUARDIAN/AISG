"""
알림 서비스.
작업자가 3회 연속 실패하면 관리자에게 알림을 보낸다.
현재는 DB에 감사 로그로 기록하며, 추후 WebSocket/이메일 등으로 확장 가능.
"""

import json
import logging

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User

logger = logging.getLogger(__name__)

# 관리자 호출이 필요한 최대 시도 횟수
MAX_ATTEMPTS = 3


def check_and_notify(db: Session, user: User, attempt_count: int, session_id: int) -> bool:
    """
    시도 횟수를 확인하고, 3회째 실패면 관리자 알림을 생성한다.

    Args:
        db: DB 세션
        user: 실패한 작업자
        attempt_count: 현재 시도 횟수
        session_id: 해당 체크인 세션 ID

    Returns:
        True: 관리자 알림 발생 (3회 실패)
        False: 알림 없음
    """
    if attempt_count < MAX_ATTEMPTS:
        return False

    # 감사 로그에 관리자 호출 이벤트를 기록한다
    # admin_id=1은 시스템 기본 관리자를 가리킴
    audit = AuditLog(
        admin_id=1,
        admin_name="SYSTEM",
        action="admin_call",
        target_type="check_session",
        target_id=session_id,
        detail=json.dumps(
            {
                "user_id": user.id,
                "user_name": user.name,
                "group_id": user.group_id,
                "attempt_count": attempt_count,
            },
            ensure_ascii=False,
        ),
    )
    db.add(audit)
    db.commit()

    logger.info(
        f"관리자 호출: 작업자 {user.name}(ID:{user.id}) — {attempt_count}회 시도 모두 실패"
    )
    return True
