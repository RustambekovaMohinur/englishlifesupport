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

  return (
    <div className="space-y-6">
      {/* Asadbek Khasanov Header Banner */}
      <div className="card bg-gradient-to-r from-blue-700 via-indigo-700 to-brand-600 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider bg-white/15 px-2.5 py-1 rounded-full text-blue-100">
              Asadbek Khasanov Learning Center
            </span>
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
          <div className="flex justify-between text-xs font-medium text-blue-100 mb-1.5">
            <span>🎯 {xpVal} XP earned</span>
            <span>Next Level: {nextXp} XP</span>
          </div>
          <div className="h-2.5 w-full bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.round((xpVal / (nextXp || 100)) * 100))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Gamified Core Metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Stars" value={`⭐ ${data.total_stars}`} hint="Rewards & Achievements" />
        <StatCard
          label="Learning Streak"
          value={`⚡ ${streakVal} ${streakVal === 1 ? "day" : "days"}`}
          hint={streakVal >= 7 ? "On Fire! 🔥" : "Complete daily to build"}
        />
        <StatCard label="Average Score" value={data.average_score ?? "—"} hint="out of 10" />
        <StatCard label="Completed Tasks" value={`${data.completed_assignments}/${data.total_assignments}`} hint="published homework" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Deadlines & Grades */}
        <div className="space-y-6 lg:col-span-2">
          {/* Upcoming Deadlines */}
          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-neutral-900 flex items-center justify-between">
              <span>Upcoming Deadlines</span>
              <span className="text-xs font-normal text-neutral-500">{data.upcoming_deadlines.length} active</span>
            </h2>
            {data.upcoming_deadlines.length === 0 ? (
              <p className="text-sm text-neutral-500">No upcoming deadlines. 🎉</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {data.upcoming_deadlines.map((a) => (
                  <li key={a.id} className="py-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-800">{a.title}</span>
                    <span className={a.submitted ? "text-green-600 font-medium" : "text-neutral-500"}>
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
                      <span className="font-bold text-neutral-900">{g.score}/10</span>
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
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
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
                <span className="text-xs font-bold bg-brand-50 text-brand-700 px-2 py-1 rounded">
                  Rank #{leaderboard.current_student_rank}
                </span>
              )}
            </div>

            {!leaderboard || leaderboard.entries.length === 0 ? (
              <p className="text-sm text-neutral-500">No leaderboard activity yet this week.</p>
            ) : (
              <div className="space-y-2.5">
                {leaderboard.entries.slice(0, 7).map((entry) => (
                  <div
                    key={entry.student_id}
                    className={`p-2.5 rounded-xl text-xs flex items-center justify-between border transition-all ${
                      entry.is_current_user
                        ? "bg-brand-50 border-brand-300 font-semibold"
                        : "bg-white border-neutral-100 hover:border-neutral-200"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                          entry.rank === 1
                            ? "bg-amber-100 text-amber-800"
                            : entry.rank === 2
                            ? "bg-slate-100 text-slate-700"
                            : entry.rank === 3
                            ? "bg-amber-50 text-amber-700"
                            : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
                      </span>
                      <span className="truncate max-w-[110px] text-neutral-800">
                        {entry.student_name} {entry.is_current_user && "(You)"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-neutral-600 font-medium">
                      <span>⚡ {entry.streak}</span>
                      <span>⭐ {entry.weekly_stars}</span>
                      <span className="font-bold text-neutral-900">{entry.weekly_xp} XP</span>
                    </div>
                  </div>
                ))}
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

