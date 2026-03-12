from sqlalchemy import Column, Integer, ForeignKey, DateTime, String, func
from app.database import Base

class AdminOverride(Base):
    __tablename__ = "admin_overrides"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("check_sessions.id"), nullable=False)
    admin_id = Column(Integer, ForeignKey("admins.id"), nullable=False)
    reason = Column(String, default="")
    created_at = Column(DateTime, default=func.now())
