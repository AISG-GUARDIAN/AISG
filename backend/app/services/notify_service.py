"""
알림 서비스.
작업자/사원이 3회 연속 실패하면 관리자에게 알림을 보낸다.
현재는 DB에 감사 로그로 기록하며, 추후 WebSocket/이메일 등으로 확장 가능.
"""

import json
import logging

from sqlalchemy.orm import Session

from app.models.admin import Admin
from app.models.audit_log import AuditLog
from app.models.employee import Employee
from app.models.group import Group
from app.models.user import User

logger = logging.getLogger(__name__)

# 관리자 호출이 필요한 최대 시도 횟수
MAX_ATTEMPTS = 3


def check_and_notify(db: Session, worker, attempt_count: int, session_id: int) -> bool:
    """
    시도 횟수를 확인하고, 3회째 실패면 관리자 알림을 생성한다.
    User(일용직)와 Employee(정규직) 모두 지원한다.

    Args:
        db: DB 세션
        worker: 실패한 작업자 (User 또는 Employee)
        attempt_count: 현재 시도 횟수
        session_id: 해당 체크인 세션 ID

    Returns:
        True: 관리자 알림 발생 (3회 실패)
        False: 알림 없음
    """
    if attempt_count < MAX_ATTEMPTS:
        return False

    # 작업자의 그룹에 연결된 관리자를 찾는다
    group_id = worker.group_id
    admin = None
    if group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if group and group.admin_id:
            admin = db.query(Admin).filter(Admin.id == group.admin_id).first()

    # 그룹 관리자가 없으면 첫 번째 관리자를 사용한다
    if not admin:
        admin = db.query(Admin).order_by(Admin.id).first()

    if not admin:
        logger.error("관리자 호출 실패: 등록된 관리자가 없습니다")
        return False

    # User vs Employee 구분하여 detail 기록
    is_employee = isinstance(worker, Employee)
    worker_id_label = "employee_id" if is_employee else "user_id"
    worker_identifier = worker.emp_no if is_employee else worker.system_id

    audit = AuditLog(
        admin_id=admin.id,
        admin_emp_no=admin.emp_no,
        action="admin_call",
        target_type="check_session",
        target_id=session_id,
        detail=json.dumps(
            {
                worker_id_label: worker.id,
                "system_id": worker_identifier,
                "group_id": group_id,
                "attempt_count": attempt_count,
                "worker_type": "employee" if is_employee else "user",
            },
            ensure_ascii=False,
        ),
    )
    db.add(audit)
    db.commit()

    logger.info(
        f"관리자 호출: {'사원' if is_employee else '작업자'} {worker_identifier}(ID:{worker.id}) — {attempt_count}회 시도 모두 실패"
    )
    return True
