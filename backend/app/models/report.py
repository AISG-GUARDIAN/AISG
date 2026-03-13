from sqlalchemy import Column, Integer, String, DateTime, Text, func
from app.database import Base

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    period = Column(String, nullable=False)  # daily / weekly / monthly
    content = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
