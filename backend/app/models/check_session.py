from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, func
from sqlalchemy.orm import relationship
from app.database import Base

class CheckSession(Base):
    __tablename__ = "check_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    attempt_count = Column(Integer, default=0)
    passed = Column(Boolean, default=False)
    image_url = Column(String, nullable=True)
    cv_result = Column(String, nullable=True)  # JSON string
    created_at = Column(DateTime, default=func.now())
    user = relationship("User", back_populates="sessions")
