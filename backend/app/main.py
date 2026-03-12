from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routers import auth
from app.routers.admin import groups, users, sessions, stats, reports
from app.routers.user import checkin

Base.metadata.create_all(bind=engine)

app = FastAPI(title="AISG Safety Check System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(groups.router, prefix="/admin/groups", tags=["admin-groups"])
app.include_router(users.router, prefix="/admin/users", tags=["admin-users"])
app.include_router(sessions.router, prefix="/admin/sessions", tags=["admin-sessions"])
app.include_router(stats.router, prefix="/admin/stats", tags=["admin-stats"])
app.include_router(reports.router, prefix="/admin/reports", tags=["admin-reports"])
app.include_router(checkin.router, prefix="/user", tags=["user"])

app.mount("/", StaticFiles(directory="/frontend", html=True), name="frontend")
