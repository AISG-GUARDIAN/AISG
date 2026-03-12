from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class UserCreate(BaseModel):
    system_id: str
    name: str
    group_id: Optional[int] = None

class UserOut(BaseModel):
    id: int
    system_id: str
    name: str
    group_id: Optional[int]
    created_at: datetime
    class Config:
        from_attributes = True
