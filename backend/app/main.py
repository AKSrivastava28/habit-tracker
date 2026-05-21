from datetime import date, timedelta
from typing import List

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

load_dotenv()

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.database import Base, engine, get_db
from app.models import Habit, User
from app.schemas import HabitCreate, HabitOut, HabitToggleOut, TokenResponse, UserCreate, UserLogin

# ─── Create Tables ────────────────────────────────────────────

Base.metadata.create_all(bind=engine)

# ─── FastAPI App ──────────────────────────────────────────────

app = FastAPI(title="Habit Tracker API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Helper: Reconcile Streak ────────────────────────────────

def reconcile_streak(habit: Habit, db: Session) -> None:
    """
    If the habit's last_checked_in is more than 1 day ago,
    reset the streak to 0 in the database.
    """
    if habit.last_checked_in is not None:
        days_since = (date.today() - habit.last_checked_in).days
        if days_since > 1:
            habit.current_streak = 0
            habit.last_checked_in = None
            db.commit()
            db.refresh(habit)


def habit_to_out(habit: Habit) -> HabitOut:
    """Convert a Habit ORM object to a HabitOut schema, computing done_today."""
    done_today = habit.last_checked_in == date.today() if habit.last_checked_in else False
    return HabitOut(
        id=habit.id,
        name=habit.name,
        current_streak=habit.current_streak,
        last_checked_in=habit.last_checked_in,
        done_today=done_today,
        created_at=habit.created_at,
    )


# ═══════════════════════════════════════════════════════════════
# AUTH ROUTES
# ═══════════════════════════════════════════════════════════════


@app.post("/api/auth/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: UserCreate, db: Session = Depends(get_db)):
    """Register a new user with email and password."""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token)


@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """Authenticate a user and return a JWT."""
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token({"sub": user.id})
    return TokenResponse(access_token=token)


# ═══════════════════════════════════════════════════════════════
# HABIT ROUTES (Protected)
# ═══════════════════════════════════════════════════════════════


@app.get("/api/habits", response_model=List[HabitOut])
def list_habits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all habits for the current user, reconciling broken streaks first."""
    habits = db.query(Habit).filter(Habit.user_id == current_user.id).all()
    for habit in habits:
        reconcile_streak(habit, db)
    return [habit_to_out(h) for h in habits]


@app.post("/api/habits", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
def create_habit(
    payload: HabitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new habit for the current user."""
    habit = Habit(
        name=payload.name,
        current_streak=0,
        last_checked_in=None,
        user_id=current_user.id,
    )
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit_to_out(habit)


@app.patch("/api/habits/{habit_id}/toggle", response_model=HabitToggleOut)
def toggle_habit(
    habit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Toggle a habit's check-in for today.

    Logic:
    - If already done today → undo (clear last_checked_in, decrement streak).
    - If done yesterday → continue streak (+1), set last_checked_in to today.
    - If broken or brand new → set streak to 1, set last_checked_in to today.
    """
    habit = (
        db.query(Habit)
        .filter(Habit.id == habit_id, Habit.user_id == current_user.id)
        .first()
    )
    if not habit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")

    today = date.today()
    yesterday = today - timedelta(days=1)

    if habit.last_checked_in == today:
        # Undo today's check-in
        habit.current_streak = max(0, habit.current_streak - 1)
        habit.last_checked_in = None
    elif habit.last_checked_in == yesterday:
        # Continue the streak
        habit.current_streak += 1
        habit.last_checked_in = today
    else:
        # Broken streak or brand new habit
        habit.current_streak = 1
        habit.last_checked_in = today

    db.commit()
    db.refresh(habit)

    done_today = habit.last_checked_in == today if habit.last_checked_in else False
    return HabitToggleOut(
        id=habit.id,
        name=habit.name,
        current_streak=habit.current_streak,
        last_checked_in=habit.last_checked_in,
        done_today=done_today,
    )


@app.delete("/api/habits/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_habit(
    habit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a habit by ID for the current user."""
    habit = (
        db.query(Habit)
        .filter(Habit.id == habit_id, Habit.user_id == current_user.id)
        .first()
    )
    if not habit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    db.delete(habit)
    db.commit()
    return None
