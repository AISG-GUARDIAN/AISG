from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    system_id = Column(String, unique=True, nullable=False)  # 전화번호 뒷자리
    name = Column(String, nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    created_at = Column(DateTime, default=func.now())
    group = relationship("Group", back_populates="users")
    sessions = relationship("CheckSession", back_populates="user")
