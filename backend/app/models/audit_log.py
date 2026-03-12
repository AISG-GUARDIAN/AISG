from sqlalchemy import Column, Integer, String, DateTime, func
from app.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    actor = Column(String, nullable=False)
    action = Column(String, nullable=False)
    target = Column(String, nullable=True)
    detail = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now())
