"""
FastAPI 애플리케이션 엔트리포인트.
라우터 등록, 정적 파일 마운트, DB 초기화, 기본 관리자 계정 생성을 수행한다.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.database import Base, engine, SessionLocal
from app.models import Admin, Employee, Group  # noqa: F401 — Base.metadata에 모델 등록
from app.routers import auth
from app.routers.user import checkin, emp_checkin
from app.routers.admin import groups, users, sessions, stats, reports

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    앱 시작/종료 시 실행되는 라이프사이클 핸들러.

    시작 시:
    1. SQLite 테이블을 자동 생성한다
    2. 기본 관리자 계정이 없으면 생성한다
    """
    Base.metadata.create_all(bind=engine)
    logger.info("데이터베이스 테이블 초기화 완료")
    _create_default_admin()
    yield
    logger.info("애플리케이션 종료")


def _create_default_admin():
    """
    설정에 지정된 기본 관리자 계정이 없으면 생성한다.
    사원번호만으로 로그인하므로 비밀번호는 저장하지 않는다.
    """
    settings = get_settings()
    db = SessionLocal()
    try:
        # employees 테이블에 사번 등록
        emp = db.query(Employee).filter(Employee.emp_no == settings.DEFAULT_EMP_NO).first()
        if emp is None:
            db.add(Employee(emp_no=settings.DEFAULT_EMP_NO))
            db.commit()
            logger.info(f"기본 사번 등록: {settings.DEFAULT_EMP_NO}")

        # admins 테이블에 관리자 등록
        existing = db.query(Admin).filter(Admin.emp_no == settings.DEFAULT_EMP_NO).first()
        if existing is None:
            admin = Admin(emp_no=settings.DEFAULT_EMP_NO)
            db.add(admin)
            db.commit()
            logger.info(f"기본 관리자 계정 생성: {settings.DEFAULT_EMP_NO}")
        else:
            logger.info("기본 관리자 계정이 이미 존재합니다")
    finally:
        db.close()


# FastAPI 앱 인스턴스 생성
app = FastAPI(
    title="AISG — AI 안전 체크 시스템",
    description="현장 안전물품 착용 점검 시스템 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === 라우터 등록 ===
app.include_router(auth.router)
app.include_router(checkin.router)
app.include_router(emp_checkin.router)
app.include_router(groups.router)
app.include_router(users.router)
app.include_router(sessions.router)
app.include_router(stats.router)
app.include_router(reports.router)


@app.get("/api/health")
def health_check():
    """GET /api/health — 서버 상태 확인."""
    return {"status": "ok"}


# === 정적 파일 마운트 ===
# 로컬: backend 상위의 frontend/ | Docker: /frontend (볼륨 마운트)
frontend_path = Path(__file__).resolve().parent.parent.parent / "frontend"
if not frontend_path.exists():
    frontend_path = Path("/frontend")
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")
    logger.info(f"프론트엔드 마운트: {frontend_path}")
