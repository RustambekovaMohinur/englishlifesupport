import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { LoadingRows, StatCard } from "@/components/ui";
import { getStudentDashboard, getGamificationSummary } from "@/services/lmsService";
import { StudentDashboard, StudentGamificationSummary } from "@/types";

export default function StudentProgressPage() {
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [gamify, setGamify] = useState<StudentGamificationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getStudentDashboard().then(setData),
      getGamificationSummary().then(setGamify).catch(() => null),
    ])
      .catch(() => toast.error("Failed to load progress"))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <LoadingRows rows={4} />;
  if (!data) return null;

  const completionRate = data.total_assignments > 0 ? Math.round((data.completed_assignments / data.total_assignments) * 100) : 0;
  const streakVal = gamify?.streak ?? data.streak ?? 0;
  const xpVal = gamify?.total_xp ?? data.total_xp ?? 0;
  const levelVal = gamify?.level ?? data.level ?? 1;
  const levelTitle = gamify?.level_title ?? data.level_title ?? "Beginner";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">My Learning Journey & Progress</h1>
        <p className="text-sm text-neutral-500">Track your ⚡ streak, ⭐ stars, 🎯 XP levels, and unlocked achievements</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Stars" value={`⭐ ${data.total_stars}`} hint="Lifetime accumulated" />
        <StatCard label="Learning Streak" value={`⚡ ${streakVal} days`} hint={`Longest: ${gamify?.longest_streak ?? streakVal} days`} />
        <StatCard label="Level & XP" value={`Lvl ${levelVal} · ${xpVal} XP`} hint={levelTitle} />
        <StatCard label="Completion Rate" value={`${completionRate}%`} hint={`${data.completed_assignments}/${data.total_assignments} completed`} />
      </div>

      {/* Levels Overview */}
      <div className="card space-y-4">
        <h2 className="text-base font-semibold text-neutral-900">XP Mastery Progression</h2>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
          {[
            { lvl: 1, name: "Beginner", range: "0–100 XP" },
            { lvl: 2, name: "Learner", range: "101–300 XP" },
            { lvl: 3, name: "Achiever", range: "301–600 XP" },
            { lvl: 4, name: "Pro", range: "601–1000 XP" },
            { lvl: 5, name: "English Master", range: "1001+ XP" },
          ].map((l) => {
            const isCur = levelVal === l.lvl;
            const isPast = levelVal > l.lvl;
            return (
              <div
                key={l.lvl}
                className={`p-3 rounded-xl border text-center transition-all ${
                  isCur
                    ? "bg-brand-50 border-brand-300 font-bold text-brand-700 shadow-sm"
                    : isPast
                    ? "bg-green-50/50 border-green-200 text-green-700"
                    : "bg-neutral-50 border-neutral-200 text-neutral-400"
                }`}
              >
                <p className="text-sm">{isPast ? "✓" : isCur ? "🎯" : "🔒"}</p>
                <p className="font-semibold mt-1">Level {l.lvl}: {l.name}</p>
                <p className="text-[11px] opacity-80">{l.range}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assignment Completion Progress */}
      <div className="card">
        <h2 className="mb-3 text-base font-semibold text-neutral-900">Assignment Completion</h2>
        <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-brand-500 transition-all duration-500" style={{ width: `${completionRate}%` }} />
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          {data.completed_assignments} of {data.total_assignments} assignments completed
        </p>
      </div>

      {/* Persistent Achievements Grid */}
      {gamify && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900 flex items-center gap-2">
              <span>🏅 Earned Achievements</span>
              <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                {gamify.achievements.length} Unlocked
              </span>
            </h2>
          </div>
          {gamify.achievements.length === 0 ? (
            <p className="text-sm text-neutral-500">Complete tasks on-time and build streaks to unlock achievements!</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {gamify.achievements.map((a) => (
                <div key={a.id} className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center gap-3">
                  <div className="text-2xl p-2 bg-white rounded-lg shadow-sm border border-neutral-100">{a.icon}</div>
                  <div>
                    <p className="font-bold text-sm text-neutral-900">{a.title}</p>
                    <p className="text-xs text-neutral-500">{a.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
