import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, StatCard } from "@/components/ui";
import { getStudentDashboard, getGamificationSummary, getWeeklyLeaderboard } from "@/services/lmsService";
import { StudentDashboard, StudentGamificationSummary, WeeklyLeaderboardOut } from "@/types";

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  let timeStr = "Good morning";
  if (hour >= 12 && hour < 17) timeStr = "Good afternoon";
  else if (hour >= 17) timeStr = "Good evening";
  return `${timeStr}, ${name}`;
}

export function formatEnglishLevel(level?: string | null): string {
  if (!level || !level.trim()) return "Level not set";
  const formatted = level.trim().replace(/_/g, " ");
  const lower = formatted.toLowerCase();
  if (lower === "pre intermediate" || lower === "pre-intermediate") return "Pre-Intermediate";
  if (lower === "upper intermediate" || lower === "upper-intermediate") return "Upper-Intermediate";
  return formatted
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default function StudentDashboardPage() {
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [gamify, setGamify] = useState<StudentGamificationSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<WeeklyLeaderboardOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStudentDashboard()
      .then(setData)
      .catch(() => setError("Could not load your dashboard."))
      .finally(() => setIsLoading(false));

    getGamificationSummary().then(setGamify).catch(() => null);
    getWeeklyLeaderboard().then(setLeaderboard).catch(() => null);
  }, []);

  if (isLoading) return <LoadingRows rows={4} />;
  if (error || !data) return <EmptyState title="Something went wrong" description={error ?? undefined} />;

  const streakVal = gamify?.streak ?? data.streak ?? 0;
  const xpVal = gamify?.total_xp ?? data.total_xp ?? 0;
  const levelVal = gamify?.level ?? data.level ?? 1;
  const levelTitle = gamify?.level_title ?? data.level_title ?? "Learner";
  const nextXp = gamify?.next_level_xp ?? 100;
  const hasFreePass = gamify?.free_pass ? !gamify.free_pass.is_used : (data.free_pass_available ?? true);
  const displayLevel = formatEnglishLevel(data.english_level);

  // Safe zero-division math for task completion
  const totalActiveTasks = data.total_assignments || 0;
  const completedTasks = data.completed_assignments || 0;
  const rate = totalActiveTasks > 0 ? ((completedTasks / totalActiveTasks) * 100).toFixed(1) : "0.0";

  // Sorted leaderboard: primary sort by completion_rate, fallback to weekly_xp, then weekly_stars
  const sortedEntries = [...(leaderboard?.entries || [])].sort((a, b) => {
    const rateA = a.completion_rate ?? 0;
    const rateB = b.completion_rate ?? 0;
    if (rateB !== rateA) return rateB - rateA;
    const xpA = a.weekly_xp ?? 0;
    const xpB = b.weekly_xp ?? 0;
    if (xpB !== xpA) return xpB - xpA;
    return (b.weekly_stars ?? 0) - (a.weekly_stars ?? 0);
  });

  return (
    <div className="space-y-6">
      {/* Asadbek Khasanov Header Banner (Ambient Mesh Gradient) */}
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 border border-indigo-500/20 shadow-xl p-6 text-white">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-purple-500/15 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-full text-indigo-200 border border-white/10">
                Asadbek Khasanov Learning Center
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/25 tabular-nums font-mono">
                🔥 {streakVal} {streakVal === 1 ? "day" : "days"} in a row
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mt-2 tracking-tight">{getGreeting(data.full_name)}</h1>
            <p className="mt-1 text-sm text-slate-300">
              {data.group_name ? `Group: ${data.group_name}` : "No group assigned yet"}
              {data.teacher_name && ` · Teacher: ${data.teacher_name}`}
            </p>
          </div>
          <div className="flex items-center gap-3 self-start md:self-auto bg-white/[0.07] backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10 shadow-inner">
            <div className="text-center px-2">
              <p className="text-xs text-slate-400 font-medium">English Level</p>
              <p className="text-base font-bold text-white tracking-tight" data-testid="student-english-level">{displayLevel}</p>
            </div>
            <div className="h-8 w-px bg-white/15" />
            <div className="text-center px-2">
              <p className="text-xs text-slate-400 font-medium">Monthly Pass</p>
              <p className="text-base font-bold text-white tracking-tight">{hasFreePass ? "🛡 Available" : "Used"}</p>
            </div>
          </div>
        </div>

        {/* XP Level Progress Bar with Back-glow */}
        <div className="relative z-10 mt-5 pt-4 border-t border-white/10">
          <div className="flex justify-between text-xs font-medium text-slate-300 mb-1.5 tabular-nums font-mono">
            <span>🎯 {xpVal} XP earned</span>
            <span>Next Level: {nextXp} XP</span>
          </div>
          <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden backdrop-blur-xs">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-300 rounded-full shadow-[0_0_12px_rgba(251,191,36,0.5)] transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.round((xpVal / (nextXp || 100)) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Gamified Core Metrics (Floating Cards with Ambient Halos) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-4 space-y-1.5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] hover:-translate-y-0.5 transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Total Stars</p>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 text-sm">⭐</span>
          </div>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums font-mono tracking-tight">{data.total_stars}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Rewards & Achievements</p>
        </div>

        <div className="card p-4 space-y-1.5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] hover:-translate-y-0.5 transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Learning Streak</p>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-500 text-sm">⚡</span>
          </div>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums font-mono tracking-tight">{streakVal} {streakVal === 1 ? "day" : "days"}</p>
          <div className="pt-0.5">
            <span className="inline-flex items-center text-[11px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums font-mono">
              🔥 {streakVal} {streakVal === 1 ? "day" : "days"} in a row
            </span>
          </div>
        </div>

        <div className="card p-4 space-y-1.5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] hover:-translate-y-0.5 transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Average Score</p>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 text-sm">🎯</span>
          </div>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums font-mono tracking-tight">{data.average_score !== null ? `${data.average_score}/10` : "—"}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Evaluated homework</p>
        </div>

        <div className="card p-4 space-y-1.5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] hover:-translate-y-0.5 transition-all duration-200 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Task Progress</p>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 tabular-nums font-mono">{rate}%</span>
          </div>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white tabular-nums font-mono tracking-tight">
            {completedTasks}/{totalActiveTasks}
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {completedTasks}/{totalActiveTasks} tasks completed
          </p>
          {/* Micro-Progress Bar with glow */}
          <div className="h-1.5 w-full bg-neutral-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-1.5">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-500 ease-out shadow-[0_0_8px_rgba(79,70,229,0.3)]"
              style={{ width: `${Math.min(100, Math.max(0, parseFloat(rate)))}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Deadlines & Grades */}
        <div className="space-y-6 lg:col-span-2">
          {/* Upcoming Deadlines */}
          <div className="card border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
            <h2 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white flex items-center justify-between tracking-tight">
              <span>Upcoming Deadlines</span>
              <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400 tabular-nums font-mono">{data.upcoming_deadlines.length} active</span>
            </h2>
            {data.upcoming_deadlines.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No upcoming deadlines. 🎉</p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-zinc-800/60">
                {data.upcoming_deadlines.map((a) => (
                  <li
                    key={a.id}
                    className="py-3 px-2 rounded-lg border-l-2 border-transparent hover:border-indigo-600 hover:bg-neutral-50/70 dark:hover:bg-zinc-800/40 transition-all active:scale-[0.99] flex items-center justify-between text-sm"
                  >
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">{a.title}</span>
                    <span className={a.submitted ? "text-emerald-600 dark:text-emerald-400 font-medium font-mono text-xs" : "text-neutral-500 dark:text-neutral-400 font-mono text-xs"}>
                      {a.submitted ? "✓ Submitted" : format(new Date(a.deadline), "MMM d, HH:mm")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Grades */}
          <div className="card border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
            <h2 className="mb-4 text-base font-semibold text-neutral-900 dark:text-white tracking-tight">Recent Grades & Feedback</h2>
            {data.recent_grades.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No grades yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-zinc-800/60">
                {data.recent_grades.map((g, i) => (
                  <li
                    key={i}
                    className="py-3 px-2 rounded-lg border-l-2 border-transparent hover:border-emerald-600 hover:bg-neutral-50/70 dark:hover:bg-zinc-800/40 transition-all active:scale-[0.99] flex items-center justify-between text-sm"
                  >
                    <span className="font-medium text-neutral-800 dark:text-neutral-200">{g.assignment_title}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-900 dark:text-white tabular-nums font-mono">{g.score}/10</span>
                      <span className="text-amber-500 text-xs">{"⭐".repeat(Math.min(5, Math.max(1, g.stars)))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Badges / Achievements Showcase */}
          {gamify && gamify.achievements.length > 0 && (
            <div className="card border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
              <h2 className="mb-3 text-base font-semibold text-neutral-900 dark:text-white flex items-center gap-2 tracking-tight">
                <span>🏆 My Achievements</span>
                <span className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-bold tabular-nums font-mono">
                  {gamify.achievements.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {gamify.achievements.map((ach) => (
                  <div key={ach.id} className="p-3 bg-neutral-50/70 dark:bg-zinc-800/40 border border-black/[0.04] dark:border-white/[0.06] rounded-xl flex items-center gap-3">
                    <div className="text-2xl p-2 bg-white dark:bg-zinc-700/80 rounded-lg shadow-xs">{ach.icon}</div>
                    <div>
                      <p className="font-semibold text-sm text-neutral-900 dark:text-white tracking-tight">{ach.title}</p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400">{ach.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Real Weekly Leaderboard */}
        <div className="space-y-6">
          <div className="card border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-neutral-900 dark:text-white flex items-center gap-1.5 tracking-tight">
                  <span>🏆 Group Leaderboard</span>
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {leaderboard?.group_name ? `${leaderboard.group_name} · ${leaderboard.week_key}` : "Weekly Performance"}
                </p>
              </div>
              {leaderboard?.current_student_rank && (
                <span className="text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded tabular-nums font-mono">
                  Rank #{leaderboard.current_student_rank}
                </span>
              )}
            </div>

            {!leaderboard || sortedEntries.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No leaderboard activity yet this week.</p>
            ) : (
              <div className="space-y-2.5">
                {sortedEntries.slice(0, 10).map((entry, index) => {
                  const rank = index + 1;
                  const medalBorder =
                    rank === 1
                      ? "border-amber-400/50 bg-amber-500/[0.04] text-amber-600 dark:text-amber-400"
                      : rank === 2
                      ? "border-slate-400/50 bg-slate-400/[0.04] text-slate-500 dark:text-slate-400"
                      : rank === 3
                      ? "border-amber-700/40 bg-amber-700/[0.04] text-amber-700 dark:text-amber-500"
                      : "border-black/[0.05] dark:border-white/[0.08] bg-white dark:bg-[#111827] text-neutral-600 dark:text-neutral-400";

                  const entryRate =
                    typeof entry.completion_rate === "number" ? entry.completion_rate.toFixed(1) : "0.0";

                  return (
                    <div
                      key={entry.student_id}
                      className={`p-3 rounded-xl text-xs flex flex-col gap-2 border transition-all ${medalBorder} ${
                        entry.is_current_user ? "ring-2 ring-indigo-500 shadow-xs" : "hover:border-neutral-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                              rank === 1
                                ? "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200"
                                : rank === 2
                                ? "bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                                : rank === 3
                                ? "bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300"
                                : "bg-neutral-100 dark:bg-zinc-800 text-neutral-600 dark:text-neutral-300"
                            }`}
                          >
                            {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
                          </span>
                          <span className="truncate max-w-[120px] font-semibold text-neutral-900 dark:text-white">
                            {entry.student_name} {entry.is_current_user && "(You)"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300 font-medium tabular-nums font-mono">
                          <span>⭐ {entry.weekly_stars}</span>
                          <span className="font-bold text-neutral-900 dark:text-white">{entry.weekly_xp} XP</span>
                        </div>
                      </div>

                      {/* Performance row: Completion Rate % & Streak chip */}
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-black/[0.04] dark:border-white/[0.06]">
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium tabular-nums font-mono">
                          🔥 {entry.streak} {entry.streak === 1 ? "day" : "days"} in a row
                        </span>

                        <span className="font-semibold text-neutral-800 dark:text-neutral-200 tabular-nums font-mono">
                          {entryRate}% completed
                        </span>
                      </div>

                      {/* Micro-Progress Bar with emerald glow */}
                      <div className="h-1 w-full bg-neutral-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                          style={{ width: `${Math.min(100, Math.max(0, parseFloat(entryRate)))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Star History / Transactions */}
          {gamify && gamify.recent_transactions.length > 0 && (
            <div className="card border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3 tracking-tight">⭐ Star Activity</h3>
              <ul className="divide-y divide-neutral-100 dark:divide-zinc-800/60 text-xs">
                {gamify.recent_transactions.slice(0, 5).map((t) => (
                  <li key={t.id} className="py-2 flex items-center justify-between">
                    <span className="truncate max-w-[160px] text-neutral-700 dark:text-neutral-300">{t.description || t.reason}</span>
                    <span className={`font-bold tabular-nums font-mono ${t.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {t.amount > 0 ? `+${t.amount}` : t.amount} ⭐
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

