from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class CheckSessionOut(BaseModel):
    id: int
    user_id: int
    attempt_count: int
    passed: bool
    image_url: Optional[str]
    cv_result: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True

class OverrideRequest(BaseModel):
    session_id: int
    reason: str = ""
