from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


# ─── Auth Schemas ─────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ─── Habit Schemas ────────────────────────────────────────────

class HabitCreate(BaseModel):
    name: str


class HabitOut(BaseModel):
    id: int
    name: str
    current_streak: int
    last_checked_in: Optional[date] = None
    done_today: bool = False
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class HabitToggleOut(BaseModel):
    id: int
    name: str
    current_streak: int
    last_checked_in: Optional[date] = None
    done_today: bool = False

    model_config = {"from_attributes": True}
