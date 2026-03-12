from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ReportRequest(BaseModel):
    period: str  # daily / weekly / monthly

class ReportOut(BaseModel):
    id: int
    period: str
    content: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True
