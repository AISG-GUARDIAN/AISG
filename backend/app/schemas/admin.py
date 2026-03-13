from pydantic import BaseModel
from datetime import datetime

class AdminLogin(BaseModel):
    username: str
    password: str

class AdminOut(BaseModel):
    id: int
    username: str
    name: str
    created_at: datetime
    class Config:
        from_attributes = True
