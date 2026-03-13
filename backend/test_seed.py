"""
테스트용 시드 데이터 삽입 스크립트.
실행: cd backend && python test_seed.py

기존 테이블을 초기화(DROP)하고, 관리자·그룹·작업자·사원·체크인 세션·알림 로그를
현실적인 분포로 생성한다.
"""

import json
import random
from datetime import date, datetime, timedelta, timezone

from app.database import Base, SessionLocal, engine
from app.models import Admin, AdminOverride, AuditLog, CheckSession, Employee, Group, User

# KST = UTC+9
KST = timezone(timedelta(hours=9))

# ── 설정 ──
DEFAULT_EMP_NO = "20260312"
TODAY = date.today()
YESTERDAY = TODAY - timedelta(days=1)


def utc_from_kst(kst_hour: int, kst_minute: int = 0, target_date: date = TODAY) -> datetime:
    """KST 시:분을 받아 UTC datetime으로 변환한다."""
    kst_dt = datetime(target_date.year, target_date.month, target_date.day,
                      kst_hour, kst_minute, random.randint(0, 59), tzinfo=KST)
    return kst_dt.astimezone(timezone.utc).replace(tzinfo=None)


def main():
    print("=== 테이블 초기화 ===")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # ════════════════════════════════════════════
        # 1. 관리자
        # ════════════════════════════════════════════
        admin1 = Admin(emp_no=DEFAULT_EMP_NO)
        admin2 = Admin(emp_no="20260401")
        db.add_all([admin1, admin2])
        db.flush()
        print(f"관리자 생성: {admin1.emp_no} (id={admin1.id}), {admin2.emp_no} (id={admin2.id})")

        # ════════════════════════════════════════════
        # 2. 그룹
        # ════════════════════════════════════════════
        groups = [
            Group(admin_id=admin1.id, name="A반 (건설)"),
            Group(admin_id=admin1.id, name="B반 (전기)"),
            Group(admin_id=admin1.id, name="C반 (용접)"),
            Group(admin_id=admin2.id, name="D반 (도장)"),
        ]
        db.add_all(groups)
        db.flush()
        a1_groups = groups[:3]  # admin1의 그룹
        print(f"그룹 생성: {[g.name for g in groups]}")

        # ════════════════════════════════════════════
        # 3. 정규직 사원 (Employee)
        # ════════════════════════════════════════════
        emp_data = [
            (DEFAULT_EMP_NO, "ko", groups[0].id),
            ("EMP0001", "ko", groups[0].id),
            ("EMP0002", "vi", groups[1].id),
            ("EMP0003", "zh", groups[1].id),
            ("EMP0004", "ko", groups[2].id),
            ("EMP0005", "th", groups[2].id),
            ("EMP0006", "ko", groups[3].id),
        ]
        employees = []
        for emp_no, lang, gid in emp_data:
            existing = db.query(Employee).filter(Employee.emp_no == emp_no).first()
            if existing:
                existing.language = lang
                existing.group_id = gid
                employees.append(existing)
            else:
                emp = Employee(emp_no=emp_no, language=lang, group_id=gid)
                db.add(emp)
                employees.append(emp)
        db.flush()
        print(f"사원 생성: {len(employees)}명")

        # ════════════════════════════════════════════
        # 4. 일용직 작업자 (User)
        # ════════════════════════════════════════════
        languages = ["vi", "vi", "vi", "zh", "zh", "km", "km", "th", "th", "ko"]
        users = []
        for i, lang in enumerate(languages):
            phone = f"{1000 + i}"
            sys_id = f"USR-{TODAY.strftime('%Y%m%d')}-{phone}-0001"
            for g in a1_groups:
                # 각 그룹에 작업자 배치
                pass
            u = User(
                system_id=sys_id,
                language=lang,
                group_id=random.choice(a1_groups).id,
            )
            db.add(u)
            users.append(u)

        # 추가로 더 생성 (다양한 그룹 분포)
        extra_langs = ["vi", "zh", "km", "th", "vi", "vi", "zh", "km", "ko", "ko",
                       "vi", "th", "vi", "zh", "km"]
        for i, lang in enumerate(extra_langs):
            phone = f"{2000 + i}"
            u = User(
                system_id=f"USR-{TODAY.strftime('%Y%m%d')}-{phone}-0001",
                language=lang,
                group_id=random.choice(a1_groups).id,
            )
            db.add(u)
            users.append(u)

        db.flush()
        print(f"일용직 작업자 생성: {len(users)}명")

        # ════════════════════════════════════════════
        # 5. 체크인 세션 생성 (오늘 + 어제 + 이번달)
        # ════════════════════════════════════════════
        all_sessions = []

        # --- 오늘 세션: 시간대별 분포 ---
        # 근무 시간 7~18시 (KST) 분포
        hour_weights = {7: 8, 8: 15, 9: 12, 10: 6, 11: 4, 12: 2,
                        13: 5, 14: 6, 15: 4, 16: 3, 17: 2, 18: 1}

        for user in users:
            # 80% 확률로 오늘 체크인
            if random.random() > 0.8:
                continue

            hour = random.choices(list(hour_weights.keys()), weights=list(hour_weights.values()))[0]
            minute = random.randint(0, 59)

            # 70% pass, 30% fail
            is_pass = random.random() < 0.70
            helmet = True if is_pass else random.random() < 0.3
            vest = True if is_pass else random.random() < 0.3
            status = "pass" if (helmet and vest) else "fail"

            s = CheckSession(
                user_id=user.id,
                date=TODAY,
                attempt_count=1,
                helmet_pass=helmet,
                vest_pass=vest,
                cv_confidence=round(random.uniform(0.6, 0.99), 2),
                image_url=f"https://blob.example.com/images/{user.system_id}_1.jpg",
                status=status,
                checked_at=utc_from_kst(hour, minute),
            )
            db.add(s)
            all_sessions.append(s)

            # fail인 경우 2차, 3차 시도
            if status == "fail":
                for attempt in [2, 3]:
                    retry_hour = min(hour + attempt, 18)
                    retry_pass = random.random() < 0.5
                    h2 = True if retry_pass else random.random() < 0.4
                    v2 = True if retry_pass else random.random() < 0.4
                    s2_status = "pass" if (h2 and v2) else "fail"

                    s2 = CheckSession(
                        user_id=user.id,
                        date=TODAY,
                        attempt_count=attempt,
                        helmet_pass=h2,
                        vest_pass=v2,
                        cv_confidence=round(random.uniform(0.5, 0.95), 2),
                        image_url=f"https://blob.example.com/images/{user.system_id}_{attempt}.jpg",
                        status=s2_status,
                        checked_at=utc_from_kst(retry_hour, random.randint(0, 59)),
                    )
                    db.add(s2)
                    all_sessions.append(s2)

                    if s2_status == "pass":
                        break  # 통과하면 더 이상 시도하지 않음

        # 사원 체크인
        for emp in employees[:6]:  # admin1 그룹의 사원들
            if emp.group_id not in [g.id for g in a1_groups]:
                continue
            hour = random.choice([7, 8, 9])
            is_pass = random.random() < 0.75
            helmet = is_pass
            vest = is_pass
            status = "pass" if is_pass else "fail"

            s = CheckSession(
                employee_id=emp.id,
                date=TODAY,
                attempt_count=1,
                helmet_pass=helmet,
                vest_pass=vest,
                cv_confidence=round(random.uniform(0.7, 0.99), 2),
                image_url=f"https://blob.example.com/images/emp_{emp.emp_no}_1.jpg",
                status=status,
                checked_at=utc_from_kst(hour, random.randint(0, 30)),
            )
            db.add(s)
            all_sessions.append(s)

        db.flush()
        print(f"오늘 체크인 세션: {len(all_sessions)}건")

        # --- 어제 세션 (어제 대비 통계용) ---
        yesterday_sessions = 0
        for user in random.sample(users, min(15, len(users))):
            hour = random.choice([7, 8, 9, 10])
            is_pass = random.random() < 0.65
            helmet = is_pass
            vest = is_pass
            status = "pass" if is_pass else "fail"

            s = CheckSession(
                user_id=user.id,
                date=YESTERDAY,
                attempt_count=1,
                helmet_pass=helmet,
                vest_pass=vest,
                cv_confidence=round(random.uniform(0.6, 0.95), 2),
                status=status,
                checked_at=utc_from_kst(hour, random.randint(0, 59), YESTERDAY),
            )
            db.add(s)
            yesterday_sessions += 1

        db.flush()
        print(f"어제 세션: {yesterday_sessions}건")

        # --- 이번 달 과거 데이터 (일별 차트용) ---
        month_sessions = 0
        for day_offset in range(2, min(TODAY.day, 13)):  # 최대 12일치 추가
            past_date = TODAY - timedelta(days=day_offset)
            sample_users = random.sample(users, min(random.randint(8, 18), len(users)))
            for user in sample_users:
                hour = random.choice([7, 8, 9, 10, 11])
                is_pass = random.random() < 0.68
                helmet = is_pass
                vest = is_pass
                status = "pass" if is_pass else "fail"

                s = CheckSession(
                    user_id=user.id,
                    date=past_date,
                    attempt_count=1,
                    helmet_pass=helmet,
                    vest_pass=vest,
                    cv_confidence=round(random.uniform(0.5, 0.95), 2),
                    status=status,
                    checked_at=utc_from_kst(hour, random.randint(0, 59), past_date),
                )
                db.add(s)
                month_sessions += 1

        db.flush()
        print(f"이번 달 과거 세션: {month_sessions}건")

        # --- 지난달 데이터 (월별 차트용) ---
        last_month_sessions = 0
        first_of_month = TODAY.replace(day=1)
        last_month_start = (first_of_month - timedelta(days=1)).replace(day=1)
        for day_offset in range(0, 20):
            past_date = last_month_start + timedelta(days=day_offset)
            if past_date >= first_of_month:
                break
            sample_users = random.sample(users, min(random.randint(5, 12), len(users)))
            for user in sample_users:
                hour = random.choice([7, 8, 9, 10])
                is_pass = random.random() < 0.6
                status = "pass" if is_pass else "fail"

                s = CheckSession(
                    user_id=user.id,
                    date=past_date,
                    attempt_count=1,
                    helmet_pass=is_pass,
                    vest_pass=is_pass,
                    cv_confidence=round(random.uniform(0.5, 0.9), 2),
                    status=status,
                    checked_at=utc_from_kst(hour, random.randint(0, 59), past_date),
                )
                db.add(s)
                last_month_sessions += 1

        db.flush()
        print(f"지난달 세션: {last_month_sessions}건")

        # ════════════════════════════════════════════
        # 6. 3회 실패 알림 (AuditLog — admin_call)
        # ════════════════════════════════════════════
        # 오늘 3회 모두 실패한 세션 찾기
        three_fail_sessions = (
            db.query(CheckSession)
            .filter(
                CheckSession.date == TODAY,
                CheckSession.status == "fail",
                CheckSession.attempt_count == 3,
            )
            .all()
        )

        notify_count = 0
        for s in three_fail_sessions:
            worker_id = s.user_id or s.employee_id
            worker_type = "user" if s.user_id else "employee"

            if s.user_id:
                user = db.query(User).filter(User.id == s.user_id).first()
                sys_id = user.system_id if user else "unknown"
                gid = user.group_id if user else None
            else:
                emp = db.query(Employee).filter(Employee.id == s.employee_id).first()
                sys_id = emp.emp_no if emp else "unknown"
                gid = emp.group_id if emp else None

            audit = AuditLog(
                admin_id=admin1.id,
                admin_emp_no=admin1.emp_no,
                action="admin_call",
                target_type="check_session",
                target_id=s.id,
                detail=json.dumps({
                    f"{worker_type}_id": worker_id,
                    "system_id": sys_id,
                    "group_id": gid,
                    "attempt_count": 3,
                    "worker_type": worker_type,
                }, ensure_ascii=False),
                created_at=s.checked_at,
            )
            db.add(audit)
            notify_count += 1

        db.flush()
        print(f"3회 실패 알림: {notify_count}건")

        # ════════════════════════════════════════════
        # 7. 일부 알림을 PASS 처리 (override)
        # ════════════════════════════════════════════
        override_count = 0
        if len(three_fail_sessions) > 1:
            # 첫 번째 3회 실패 세션은 관리자가 PASS 처리
            target_session = three_fail_sessions[0]
            target_session.status = "pass_override"

            override = AdminOverride(
                session_id=target_session.id,
                admin_id=admin1.id,
                admin_emp_no=admin1.emp_no,
                reason="현장 확인 완료 — 장비 정상 착용 확인",
            )
            db.add(override)

            audit = AuditLog(
                admin_id=admin1.id,
                admin_emp_no=admin1.emp_no,
                action="override_pass",
                target_type="check_session",
                target_id=target_session.id,
                detail=json.dumps({
                    "user_id": target_session.user_id,
                    "employee_id": target_session.employee_id,
                    "reason": "현장 확인 완료 — 장비 정상 착용 확인",
                }, ensure_ascii=False),
            )
            db.add(audit)
            override_count += 1

        db.flush()
        print(f"PASS 오버라이드: {override_count}건")

        # ════════════════════════════════════════════
        # COMMIT
        # ════════════════════════════════════════════
        db.commit()

        # ── 통계 요약 ──
        total_today = db.query(CheckSession).filter(CheckSession.date == TODAY).count()
        today_pass = db.query(CheckSession).filter(
            CheckSession.date == TODAY,
            CheckSession.status.in_(["pass", "pass_override"]),
        ).count()
        today_fail = db.query(CheckSession).filter(
            CheckSession.date == TODAY, CheckSession.status == "fail"
        ).count()

        print("\n" + "=" * 50)
        print("✅ 시드 데이터 삽입 완료!")
        print("=" * 50)
        print(f"  관리자: 2명 (로그인: {DEFAULT_EMP_NO})")
        print(f"  그룹: {len(groups)}개 (admin1: {len(a1_groups)}개)")
        print(f"  사원: {len(employees)}명")
        print(f"  일용직: {len(users)}명")
        print(f"  오늘 세션: {total_today}건 (PASS {today_pass} / FAIL {today_fail})")
        print(f"  어제 세션: {yesterday_sessions}건")
        print(f"  이번 달: {month_sessions}건")
        print(f"  지난달: {last_month_sessions}건")
        print(f"  3회 실패 알림: {notify_count}건 (처리완료: {override_count}건)")
        print(f"\n  관리자 로그인 사번: {DEFAULT_EMP_NO}")
        print("=" * 50)

    except Exception as e:
        db.rollback()
        print(f"❌ 오류 발생: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
