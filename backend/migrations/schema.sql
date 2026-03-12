-- =============================================================
-- AISG 안전 체크 시스템 — 데이터베이스 스키마
-- SQLite 기준. SQLAlchemy ORM이 자동 생성하지만 참조용으로 보관.
-- =============================================================

-- 1. 관리자
CREATE TABLE IF NOT EXISTS admins (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_no      TEXT    NOT NULL UNIQUE,       -- 사원번호 (로그인 키)
    name        TEXT    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 그룹 (관리자가 생성, 작업자 묶음)
CREATE TABLE IF NOT EXISTS groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
    name        TEXT    NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 작업자
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    system_id   TEXT    NOT NULL UNIQUE,       -- 자동 발급 로그인 키 (USR-20250310-0001)
    emp_no      TEXT    UNIQUE,                -- 사원번호 (일용직 등 NULL 허용)
    name        TEXT    NOT NULL,
    language    TEXT    NOT NULL DEFAULT 'ko',  -- ko / en / vi / zh 등
    group_id    INTEGER REFERENCES groups(id) ON DELETE SET NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. 체크인 세션 (핵심 테이블)
CREATE TABLE IF NOT EXISTS check_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    date            DATE    NOT NULL,
    attempt_count   INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 3),
    helmet_pass     BOOLEAN,
    vest_pass       BOOLEAN,
    cv_confidence   REAL,
    image_url       TEXT,
    status          TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','pass','fail','pass_override')),
    checked_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 동일 날짜에 통과 세션 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS idx_check_sessions_user_date_pass
    ON check_sessions(user_id, date)
    WHERE status IN ('pass', 'pass_override');

-- 5. 관리자 수동 통과 처리
CREATE TABLE IF NOT EXISTS admin_overrides (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL REFERENCES check_sessions(id) ON DELETE RESTRICT,
    admin_id        INTEGER NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
    admin_emp_no    TEXT    NOT NULL,                -- 처리 관리자 사번 (비정규화)
    admin_name      TEXT    NOT NULL,                -- 처리 관리자 이름 (비정규화)
    reason          TEXT,
    overridden_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. 감사 로그
CREATE TABLE IF NOT EXISTS audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
    admin_name  TEXT    NOT NULL,                    -- 수행 관리자 이름 (비정규화)
    action      TEXT    NOT NULL,
    target_type TEXT    NOT NULL,
    target_id   INTEGER NOT NULL,
    detail      TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. 보고서
CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id    INTEGER NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
    period_type TEXT    NOT NULL CHECK (period_type IN ('daily','weekly','monthly')),
    period_from DATE    NOT NULL,
    period_to   DATE    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing','done','error')),
    content     TEXT,
    file_url    TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_check_sessions_date ON check_sessions(date);
CREATE INDEX IF NOT EXISTS idx_check_sessions_user ON check_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_group ON users(group_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
