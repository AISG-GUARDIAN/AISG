def notify_admin(user_name: str, session_id: int):
    """3회 실패 시 관리자 알람 전송 (확장 가능: SMS, 이메일 등)."""
    # TODO: 실제 알람 연동 (Azure Communication Services 등)
    print(f"[ALERT] 작업자 {user_name} 3회 불통 — session_id={session_id}")
