import { useState, useEffect, useRef } from "react";

export default function Dashboard({ token, onLogout }) {
  const [habits, setHabits] = useState([]);
  const [newHabit, setNewHabit] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [togglingIds, setTogglingIds] = useState(new Set());
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [streakPop, setStreakPop] = useState(null);
  const inputRef = useRef(null);

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  // ─── Fetch Habits ────────────────────────────────────────

  const fetchHabits = async () => {
    try {
      const res = await fetch("/api/habits", { headers });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch habits");
      const data = await res.json();
      setHabits(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHabits();
  }, []);

  // ─── Create Habit ────────────────────────────────────────

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = newHabit.trim();
    if (!name) return;

    // Optimistic add
    const tempId = Date.now();
    const optimistic = {
      id: tempId,
      name,
      current_streak: 0,
      last_checked_in: null,
      done_today: false,
    };
    setHabits((prev) => [optimistic, ...prev]);
    setNewHabit("");

    try {
      const res = await fetch("/api/habits", {
        method: "POST",
        headers,
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("Failed to create habit");
      const created = await res.json();
      setHabits((prev) => prev.map((h) => (h.id === tempId ? created : h)));
    } catch (err) {
      setHabits((prev) => prev.filter((h) => h.id !== tempId));
      setError(err.message);
    }
  };

  // ─── Toggle Habit ────────────────────────────────────────

  const handleToggle = async (habit) => {
    if (togglingIds.has(habit.id)) return;

    setTogglingIds((prev) => new Set(prev).add(habit.id));

    // Optimistic toggle
    const wasDone = habit.done_today;
    setHabits((prev) =>
      prev.map((h) =>
        h.id === habit.id
          ? {
              ...h,
              done_today: !wasDone,
              current_streak: wasDone
                ? Math.max(0, h.current_streak - 1)
                : h.current_streak + 1,
            }
          : h
      )
    );

    if (!wasDone) {
      setStreakPop(habit.id);
      setTimeout(() => setStreakPop(null), 500);
    }

    try {
      const res = await fetch(`/api/habits/${habit.id}/toggle`, {
        method: "PATCH",
        headers,
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("Failed to toggle habit");
      const updated = await res.json();
      setHabits((prev) =>
        prev.map((h) => (h.id === updated.id ? { ...h, ...updated } : h))
      );
    } catch (err) {
      // Revert optimistic update
      setHabits((prev) =>
        prev.map((h) => (h.id === habit.id ? habit : h))
      );
      setError(err.message);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(habit.id);
        return next;
      });
    }
  };

  // ─── Delete Habit ────────────────────────────────────────

  const handleDelete = async (id) => {
    if (deletingIds.has(id)) return;

    setDeletingIds((prev) => new Set(prev).add(id));

    const backup = habits.find((h) => h.id === id);
    setHabits((prev) => prev.filter((h) => h.id !== id));

    try {
      const res = await fetch(`/api/habits/${id}`, {
        method: "DELETE",
        headers,
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("Failed to delete habit");
    } catch (err) {
      if (backup) setHabits((prev) => [...prev, backup]);
      setError(err.message);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // ─── Stats ───────────────────────────────────────────────

  const totalHabits = habits.length;
  const completedToday = habits.filter((h) => h.done_today).length;
  const bestStreak = habits.reduce((max, h) => Math.max(max, h.current_streak), 0);
  const completionRate =
    totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0;

  // ─── Render ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-12 h-12 rounded-full border-2 border-brand-500/30 border-t-brand-500 animate-spin" />
          <p className="text-white/40 text-sm">Loading your habits…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-mesh">
      {/* Ambient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-brand-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-purple-600/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* ─── Header ─────────────────────────────────────── */}
        <header className="flex items-center justify-between mb-10 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold text-gradient">Habit Tracker</h1>
            <p className="text-white/30 text-xs mt-1 font-light">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <button
            id="logout-btn"
            onClick={onLogout}
            className="px-4 py-2 rounded-xl text-xs font-medium text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-300"
          >
            Sign Out
          </button>
        </header>

        {/* ─── Stats Cards ────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 mb-8 animate-slide-up">
          <div className="glass rounded-2xl p-4 text-center glass-hover transition-all duration-300">
            <p className="text-2xl font-bold text-brand-400">{completedToday}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mt-1 font-medium">
              Done Today
            </p>
          </div>
          <div className="glass rounded-2xl p-4 text-center glass-hover transition-all duration-300">
            <p className="text-2xl font-bold text-emerald-400">{bestStreak}</p>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mt-1 font-medium">
              Best Streak
            </p>
          </div>
          <div className="glass rounded-2xl p-4 text-center glass-hover transition-all duration-300">
            <p className="text-2xl font-bold text-amber-400">{completionRate}%</p>
            <p className="text-[10px] uppercase tracking-widest text-white/30 mt-1 font-medium">
              Completion
            </p>
          </div>
        </div>

        {/* ─── Progress Bar ───────────────────────────────── */}
        {totalHabits > 0 && (
          <div className="mb-8 animate-slide-up">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-white/30 font-medium">Today's Progress</span>
              <span className="text-xs text-white/50 font-semibold">
                {completedToday}/{totalHabits}
              </span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-700 ease-out"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>
        )}

        {/* ─── Error Banner ───────────────────────────────── */}
        {error && (
          <div
            id="dashboard-error"
            className="mb-6 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center animate-scale-in cursor-pointer"
            onClick={() => setError("")}
          >
            {error} <span className="text-red-500/40 ml-1">× dismiss</span>
          </div>
        )}

        {/* ─── Add Habit Form ─────────────────────────────── */}
        <form
          onSubmit={handleCreate}
          className="flex gap-3 mb-8 animate-slide-up"
        >
          <input
            id="new-habit-input"
            ref={inputRef}
            type="text"
            value={newHabit}
            onChange={(e) => setNewHabit(e.target.value)}
            placeholder="Add a new habit…"
            maxLength={100}
            className="flex-1 px-5 py-3.5 rounded-xl glass border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-brand-500/50 focus:bg-white/[0.07] transition-all duration-300 text-sm"
          />
          <button
            id="add-habit-btn"
            type="submit"
            disabled={!newHabit.trim()}
            className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 text-white font-semibold text-sm shadow-lg shadow-brand-600/20 hover:shadow-brand-500/30 hover:brightness-110 active:scale-[0.97] transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:shadow-brand-600/20 disabled:hover:brightness-100"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </form>

        {/* ─── Habit List ─────────────────────────────────── */}
        {habits.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/5 mb-6">
              <svg
                className="w-10 h-10 text-white/10"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            </div>
            <h3 className="text-white/30 text-lg font-medium mb-2">No habits yet</h3>
            <p className="text-white/15 text-sm">
              Add your first habit above to start building streaks
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {habits.map((habit, index) => (
              <li
                key={habit.id}
                className="group glass rounded-2xl p-4 flex items-center gap-4 glass-hover transition-all duration-300 animate-slide-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Check Button */}
                <button
                  id={`toggle-habit-${habit.id}`}
                  onClick={() => handleToggle(habit)}
                  disabled={togglingIds.has(habit.id)}
                  className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 ${
                    habit.done_today
                      ? "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/25 scale-100"
                      : "bg-white/5 border border-white/10 hover:border-brand-500/40 hover:bg-brand-500/10"
                  }`}
                >
                  {habit.done_today ? (
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full bg-white/15" />
                  )}
                </button>

                {/* Habit Name */}
                <span
                  className={`flex-1 text-sm font-medium transition-all duration-300 ${
                    habit.done_today ? "text-white/40 line-through" : "text-white/90"
                  }`}
                >
                  {habit.name}
                </span>

                {/* Streak Badge */}
                {habit.current_streak > 0 && (
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 ${
                      streakPop === habit.id ? "animate-streak-pop" : ""
                    }`}
                  >
                    <span className="text-amber-400 text-xs">🔥</span>
                    <span className="text-amber-400 text-xs font-bold tabular-nums">
                      {habit.current_streak}
                    </span>
                  </div>
                )}

                {/* Delete Button */}
                <button
                  id={`delete-habit-${habit.id}`}
                  onClick={() => handleDelete(habit.id)}
                  disabled={deletingIds.has(habit.id)}
                  className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white/0 group-hover:text-white/30 hover:!text-red-400 hover:bg-red-500/10 transition-all duration-300"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* ─── Footer ──────────────────────────────────────── */}
        <footer className="mt-16 text-center">
          <p className="text-white/10 text-xs">
            Habit Tracker &middot; Stay consistent, stay disciplined
          </p>
        </footer>
      </div>
    </div>
  );
}
