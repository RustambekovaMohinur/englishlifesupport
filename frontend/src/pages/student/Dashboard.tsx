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
      {/* Asadbek Khasanov Header Banner */}
      <div className="card bg-gradient-to-r from-blue-700 via-indigo-700 to-brand-600 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider bg-white/15 px-2.5 py-1 rounded-full text-blue-100">
                Asadbek Khasanov Learning Center
              </span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 tabular-nums font-mono">
                🔥 {streakVal} {streakVal === 1 ? "day" : "days"} in a row
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mt-2">{getGreeting(data.full_name)}</h1>
            <p className="mt-1 text-sm text-blue-100">
              {data.group_name ? `Group: ${data.group_name}` : "No group assigned yet"}
              {data.teacher_name && ` · Teacher: ${data.teacher_name}`}
            </p>
          </div>
          <div className="flex items-center gap-3 self-start md:self-auto bg-black/20 backdrop-blur-sm px-4 py-2.5 rounded-xl border border-white/10">
            <div className="text-center px-2">
              <p className="text-xs text-blue-200">English Level</p>
              <p className="text-base font-bold text-white" data-testid="student-english-level">{displayLevel}</p>
            </div>
            <div className="h-8 w-px bg-white/20" />
            <div className="text-center px-2">
              <p className="text-xs text-blue-200">Monthly Pass</p>
              <p className="text-base font-bold text-white">{hasFreePass ? "🛡 Available" : "Used"}</p>
            </div>
          </div>
        </div>

        {/* XP Level Progress Bar */}
        <div className="mt-5 pt-4 border-t border-white/15">
          <div className="flex justify-between text-xs font-medium text-blue-100 mb-1.5 tabular-nums font-mono">
            <span>🎯 {xpVal} XP earned</span>
            <span>Next Level: {nextXp} XP</span>
          </div>
          <div className="h-2.5 w-full bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.round((xpVal / (nextXp || 100)) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Gamified Core Metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="card p-4 space-y-1 border border-neutral-200/80 bg-white">
          <p className="text-xs font-medium text-neutral-500">Total Stars</p>
          <p className="text-2xl font-bold text-neutral-900 tabular-nums font-mono">⭐ {data.total_stars}</p>
          <p className="text-[11px] text-neutral-400">Rewards & Achievements</p>
        </div>

        <div className="card p-4 space-y-1 border border-neutral-200/80 bg-white">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-500">Learning Streak</p>
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              {streakVal >= 7 ? "🔥 High" : "⚡ Active"}
            </span>
          </div>
          <p className="text-2xl font-bold text-neutral-900 tabular-nums font-mono">⚡ {streakVal} {streakVal === 1 ? "day" : "days"}</p>
          <div className="pt-0.5">
            <span className="inline-flex items-center text-[11px] font-semibold text-amber-600 tabular-nums font-mono">
              🔥 {streakVal} {streakVal === 1 ? "day" : "days"} in a row
            </span>
          </div>
        </div>

        <div className="card p-4 space-y-1 border border-neutral-200/80 bg-white">
          <p className="text-xs font-medium text-neutral-500">Average Score</p>
          <p className="text-2xl font-bold text-neutral-900 tabular-nums font-mono">{data.average_score !== null ? `${data.average_score}/10` : "—"}</p>
          <p className="text-[11px] text-neutral-400">Evaluated homework</p>
        </div>

        <div className="card p-4 space-y-1 border border-neutral-200/80 bg-white">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-neutral-500">Task Progress</p>
            <span className="text-xs font-bold text-blue-600 tabular-nums font-mono">{rate}%</span>
          </div>
          <p className="text-2xl font-bold text-neutral-900 tabular-nums font-mono">
            {completedTasks}/{totalActiveTasks}
          </p>
          <p className="text-[11px] text-neutral-400">
            {completedTasks}/{totalActiveTasks} tasks completed
          </p>
          {/* Micro-Progress Bar: 4px bar with smooth transition */}
          <div className="h-1 w-full bg-neutral-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-1.5">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, parseFloat(rate)))}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Deadlines & Grades */}
        <div className="space-y-6 lg:col-span-2">
          {/* Upcoming Deadlines */}
          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-neutral-900 flex items-center justify-between">
              <span>Upcoming Deadlines</span>
              <span className="text-xs font-normal text-neutral-500 tabular-nums font-mono">{data.upcoming_deadlines.length} active</span>
            </h2>
            {data.upcoming_deadlines.length === 0 ? (
              <p className="text-sm text-neutral-500">No upcoming deadlines. 🎉</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {data.upcoming_deadlines.map((a) => (
                  <li key={a.id} className="py-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-800">{a.title}</span>
                    <span className={a.submitted ? "text-green-600 font-medium font-mono text-xs" : "text-neutral-500 font-mono text-xs"}>
                      {a.submitted ? "✓ Submitted" : format(new Date(a.deadline), "MMM d, HH:mm")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Grades */}
          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Recent Grades & Feedback</h2>
            {data.recent_grades.length === 0 ? (
              <p className="text-sm text-neutral-500">No grades yet.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {data.recent_grades.map((g, i) => (
                  <li key={i} className="py-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-800">{g.assignment_title}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-900 tabular-nums font-mono">{g.score}/10</span>
                      <span className="text-amber-500 text-xs">{"⭐".repeat(Math.min(5, Math.max(1, g.stars)))}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Badges / Achievements Showcase */}
          {gamify && gamify.achievements.length > 0 && (
            <div className="card">
              <h2 className="mb-3 text-base font-semibold text-neutral-900 flex items-center gap-2">
                <span>🏆 My Achievements</span>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold tabular-nums font-mono">
                  {gamify.achievements.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {gamify.achievements.map((ach) => (
                  <div key={ach.id} className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center gap-3">
                    <div className="text-2xl p-2 bg-white rounded-lg shadow-sm">{ach.icon}</div>
                    <div>
                      <p className="font-semibold text-sm text-neutral-900">{ach.title}</p>
                      <p className="text-xs text-neutral-500">{ach.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Real Weekly Leaderboard */}
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-1.5">
                  <span>🏆 Group Leaderboard</span>
                </h2>
                <p className="text-xs text-neutral-500">
                  {leaderboard?.group_name ? `${leaderboard.group_name} · ${leaderboard.week_key}` : "Weekly Performance"}
                </p>
              </div>
              {leaderboard?.current_student_rank && (
                <span className="text-xs font-bold bg-brand-50 text-brand-700 px-2 py-1 rounded tabular-nums font-mono">
                  Rank #{leaderboard.current_student_rank}
                </span>
              )}
            </div>

            {!leaderboard || sortedEntries.length === 0 ? (
              <p className="text-sm text-neutral-500">No leaderboard activity yet this week.</p>
            ) : (
              <div className="space-y-2.5">
                {sortedEntries.slice(0, 10).map((entry, index) => {
                  const rank = index + 1;
                  const medalBorder =
                    rank === 1
                      ? "border-amber-400 bg-amber-500/10 text-amber-500"
                      : rank === 2
                      ? "border-slate-400 bg-slate-400/10 text-slate-400"
                      : rank === 3
                      ? "border-amber-700 bg-amber-700/10 text-amber-700"
                      : "border-neutral-200 bg-white text-neutral-600";

                  const entryRate =
                    typeof entry.completion_rate === "number" ? entry.completion_rate.toFixed(1) : "0.0";

                  return (
                    <div
                      key={entry.student_id}
                      className={`p-3 rounded-xl text-xs flex flex-col gap-2 border transition-all ${medalBorder} ${
                        entry.is_current_user ? "ring-2 ring-brand-500 shadow-xs" : "hover:border-neutral-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                              rank === 1
                                ? "bg-amber-100 text-amber-800"
                                : rank === 2
                                ? "bg-slate-200 text-slate-700"
                                : rank === 3
                                ? "bg-amber-100 text-amber-900"
                                : "bg-neutral-100 text-neutral-600"
                            }`}
                          >
                            {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
                          </span>
                          <span className="truncate max-w-[120px] font-semibold text-neutral-900">
                            {entry.student_name} {entry.is_current_user && "(You)"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-neutral-700 font-medium tabular-nums font-mono">
                          <span>⭐ {entry.weekly_stars}</span>
                          <span className="font-bold text-neutral-900">{entry.weekly_xp} XP</span>
                        </div>
                      </div>

                      {/* Performance row: Completion Rate % & Streak chip */}
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-neutral-100/60">
                        <span className="inline-flex items-center gap-1 text-amber-600 font-medium tabular-nums font-mono">
                          🔥 {entry.streak} {entry.streak === 1 ? "day" : "days"} in a row
                        </span>

                        <span className="font-semibold text-neutral-800 tabular-nums font-mono">
                          {entryRate}% completed
                        </span>
                      </div>

                      {/* Micro-Progress Bar: 4px bar */}
                      <div className="h-1 w-full bg-neutral-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500 ease-out"
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
            <div className="card">
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">⭐ Star Activity</h3>
              <ul className="divide-y divide-neutral-100 text-xs">
                {gamify.recent_transactions.slice(0, 5).map((t) => (
                  <li key={t.id} className="py-2 flex items-center justify-between">
                    <span className="truncate max-w-[160px] text-neutral-700">{t.description || t.reason}</span>
                    <span className={`font-bold ${t.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
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

