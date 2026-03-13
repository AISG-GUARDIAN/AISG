"""
system_id를 자동 발급한다.
"""
import logging
from datetime import date
from sqlalchemy.orm import Session

from app.models.user import User

logger = logging.getLogger(__name__)


def generate_system_id(db: Session, last_call_number: str) -> str:
    """
    새로운 system_id를 자동 발급한다.
    형식: USR-YYYYMMDD-NNNN (사용자-오늘날짜-전화번호 뒷자리)
    중복될 경우에는 -1, -2, ... 순서로 발급한다.

    Args:
        db: DB 세션
        last_call_number: 전화번호 뒷자리

    Returns:
        발급된 system_id 문자열 (예: USR-20260312-0001)
    """
    today_str = date.today().strftime("%Y%m%d")
    prefix = f"USR-{today_str}-"

    # 오늘 발급된 해당 전화번호의 마지막 순번 조회
    last_user = (
        db.query(User)
        .filter(User.system_id.like(f"{prefix}{last_call_number}-%"))
        .order_by(User.system_id.desc())
        .first()
    )

    if last_user:
        # 마지막 순번에서 +1
        last_num = int(last_user.system_id.split("-")[-1])
        next_num = last_num + 1
    else:
        next_num = 1

    return f"{prefix}{last_call_number}-{next_num:04d}"

