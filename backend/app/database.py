"""
데이터베이스 엔진 및 세션 관리 모듈.
SQLite를 사용하며, SQLAlchemy의 동기 엔진으로 구성한다.
"""

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import get_settings

settings = get_settings()

# SQLite 엔진 생성 — check_same_thread=False로 FastAPI 멀티스레드 호환
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)


# SQLite WAL 모드 활성화 — 읽기/쓰기 동시성 향상
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    """SQLite 연결 시 WAL 모드와 외래키 제약 조건을 활성화한다."""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


# 세션 팩토리 — 각 요청마다 독립된 DB 세션을 생성한다
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """모든 ORM 모델의 기반 클래스."""
    pass


def get_db():
    """
    FastAPI 의존성 주입용 DB 세션 제너레이터.
    요청 처리 후 세션을 자동으로 닫는다.

    Yields:
        Session: SQLAlchemy DB 세션
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
