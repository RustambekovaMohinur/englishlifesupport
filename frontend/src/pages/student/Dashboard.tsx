import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { format } from "date-fns";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, StatCard } from "@/components/ui";
import { UserAvatar } from "@/components/common/UserAvatar";
import { PlatformFeedbackModal, PublicCommunityReviewsWall } from "@/components/PlatformFeedbackModal";
import {
  getStudentDashboard,
  getGamificationSummary,
  getWeeklyLeaderboard,
  getPlatformFeedbackSummary,
  getPublicFeedbacks,
} from "@/services/lmsService";
import {
  StudentDashboard,
  StudentGamificationSummary,
  WeeklyLeaderboardOut,
  PlatformFeedbackSummary,
  PublicFeedbackItem,
} from "@/types";

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  let timeStr = "Good morning";
  if (hour >= 12 && hour < 17) timeStr = "Good afternoon";
  else if (hour >= 17) timeStr = "Good evening";
  return `${timeStr}, ${name}`;
}

function getSkillPill(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("speak") || lower.includes("audio") || lower.includes("record") || lower.includes("voice")) {
    return { label: "Speaking", icon: "🎙️", bg: "bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30" };
  }
  if (lower.includes("listen") || lower.includes("listening")) {
    return { label: "Listening", icon: "🎧", bg: "bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30" };
  }
  if (lower.includes("vocab") || lower.includes("word") || lower.includes("glossary")) {
    return { label: "Vocabulary", icon: "📖", bg: "bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30" };
  }
  if (lower.includes("read") || lower.includes("book") || lower.includes("text") || lower.includes("unit")) {
    return { label: "Reading", icon: "📚", bg: "bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-500/30" };
  }
  if (lower.includes("write") || lower.includes("essay") || lower.includes("grammar")) {
    return { label: "Writing", icon: "✍️", bg: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30" };
  }
  return { label: "Core Task", icon: "⚡", bg: "bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30" };
}

function getCountdown(deadlineStr: string) {
  const diffMs = new Date(deadlineStr).getTime() - Date.now();
  if (diffMs <= 0) return "🔴 Deadline passed · Submit to waive penalty";
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;
  if (diffDays > 0) return `⏰ Due in ${diffDays}d ${remHours}h`;
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `⏰ Due in ${diffHours}h ${diffMins}m`;
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
  const location = useLocation();
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [gamify, setGamify] = useState<StudentGamificationSummary | null>(null);
  const [leaderboard, setLeaderboard] = useState<WeeklyLeaderboardOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackSummary, setFeedbackSummary] = useState<PlatformFeedbackSummary | null>(null);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [publicFeedbacks, setPublicFeedbacks] = useState<PublicFeedbackItem[]>([]);
  const [isLoadingPublicFeedbacks, setIsLoadingPublicFeedbacks] = useState(true);

  const fetchReviews = () => {
    setIsLoadingPublicFeedbacks(true);
    getPublicFeedbacks()
      .then(setPublicFeedbacks)
      .catch(() => null)
      .finally(() => setIsLoadingPublicFeedbacks(false));
  };

  useEffect(() => {
    getStudentDashboard()
      .then(setData)
      .catch(() => setError("Could not load your dashboard."))
      .finally(() => setIsLoading(false));

    getGamificationSummary().then(setGamify).catch(() => null);
    getWeeklyLeaderboard().then(setLeaderboard).catch(() => null);
    getPlatformFeedbackSummary().then(setFeedbackSummary).catch(() => null);
    fetchReviews();
  }, []);

  useEffect(() => {
    if (location.pathname === "/student/leaderboard" || location.hash === "#leaderboard") {
      const el = document.getElementById("leaderboard");
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 200);
      }
    }
  }, [location.pathname, location.hash, data]);

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

  // Priority Today's Mission selection
  const pendingMissions = (data.upcoming_deadlines || []).filter((d) => !d.submitted);
  const urgentMission = pendingMissions.sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  )[0];
  const urgentSkill = urgentMission ? getSkillPill(urgentMission.title) : null;
  const urgentCountdown = urgentMission ? getCountdown(urgentMission.deadline) : null;

  return (
    <div className="space-y-6">
      {/* High-Priority Today's Mission Banner */}
      {urgentMission ? (
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gradient-to-r dark:from-indigo-950 dark:via-slate-900 dark:to-indigo-950 border border-indigo-100 dark:border-indigo-500/30 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)] p-5 text-zinc-900 dark:text-white">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                  🎯 Today&apos;s Mission
                </span>
                {urgentSkill && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${urgentSkill.bg}`}>
                    <span>{urgentSkill.icon}</span>
                    <span>{urgentSkill.label}</span>
                  </span>
                )}
                {urgentCountdown && (
                  <span className="text-xs font-mono font-medium text-amber-700 dark:text-amber-300 tabular-nums">
                    {urgentCountdown}
                  </span>
                )}
              </div>
              <h3 className="text-lg md:text-xl font-bold tracking-tight text-zinc-900 dark:text-white truncate">
                {urgentMission.title}
              </h3>
              <p className="text-xs text-zinc-600 dark:text-slate-300">
                Earn <strong className="text-amber-700 dark:text-amber-300 font-semibold">+10 ⭐ Stars</strong> and <strong className="text-indigo-700 dark:text-indigo-300 font-semibold">+25 XP</strong> upon verified teacher grading.
              </p>
            </div>
            <Link
              to="/student/assignments"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-md hover:shadow-indigo-500/25 transition shrink-0 active:scale-95"
            >
              <span>Start Homework</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-500/30 p-4 text-zinc-900 dark:text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">All Daily Missions Completed!</p>
              <p className="text-xs text-emerald-700 dark:text-slate-300">You are completely up to date with your assigned homework and learning streak.</p>
            </div>
          </div>
          <Link
            to="/student/assignments"
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200 underline whitespace-nowrap"
          >
            View All Tasks →
          </Link>
        </div>
      )}

      {/* Community Satisfaction & Feedback Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-950/30 dark:via-zinc-900/40 border border-amber-300/60 dark:border-amber-800/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg shrink-0">
            ⭐
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-900 dark:text-white">
                {feedbackSummary?.average_rating ? `${feedbackSummary.average_rating} / 5.0` : "4.9 / 5.0"}
              </span>
              <div className="flex items-center text-amber-400 text-xs">
                {"★".repeat(Math.round(feedbackSummary?.average_rating || 5))}
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                ({feedbackSummary?.total_reviews ?? 0} ta o'quvchi baholadi)
              </span>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
              {feedbackSummary?.user_has_reviewed
                ? "Siz platformani baholagansiz. Fikringizni istalgan vaqtda yangilashingiz mumkin!"
                : "Platformani baholang, takliflaringizni yozing va +5 XP bonusiga ega bo'ling!"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setFeedbackModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 active:scale-95 text-white shadow-xs transition shrink-0 self-end sm:self-auto"
        >
          <span>{feedbackSummary?.user_has_reviewed ? "Fikrni yangilash" : "⭐ Baholash"}</span>
        </button>
      </div>

      {/* Hero Banner & Gamification Streak Grid (Desktop: 12-col span-8/span-4, Tablet: 2-col, Mobile: 1-col) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-stretch">
        {/* Left Hero Card (Desktop span-8, Tablet span-1, Mobile full) */}
        <div className="md:col-span-1 lg:col-span-8 relative overflow-hidden rounded-2xl bg-white dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 border border-black/[0.06] dark:border-indigo-500/20 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)] p-4 sm:p-6 text-zinc-900 dark:text-white flex flex-col justify-between min-h-[170px] sm:min-h-[200px]">
          {/* Ambient Glows (Dark Mode Only) */}
          <div className="hidden dark:block absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
          <div className="hidden dark:block absolute -left-16 -bottom-16 h-64 w-64 rounded-full bg-purple-500/15 blur-3xl pointer-events-none" />

          {/* Top Content */}
          <div className="relative z-10 space-y-1 sm:space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider bg-zinc-100 dark:bg-white/10 text-zinc-700 dark:text-indigo-200 border border-zinc-200 dark:border-white/10 px-2 py-0.5 rounded-full">
                English Life
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                {displayLevel}
              </span>
            </div>
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Keep going, {data.full_name?.split(" ")[0] || "Student"}! 💪
            </h1>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-slate-300">
              Every lesson brings you closer to your goals. {data.group_name ? `Cohort: ${data.group_name}` : ""}
              {data.teacher_name ? ` · Examiner: ${data.teacher_name}` : ""}
            </p>
          </div>

          {/* Bottom Progress Row with On Track Pill */}
          <div className="relative z-10 mt-3 sm:mt-5 pt-2.5 sm:pt-3 border-t border-zinc-100 dark:border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
            <div className="flex-1 space-y-1">
              <div className="flex justify-between text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-slate-300 tabular-nums font-mono">
                <span>Progress: {rate}%</span>
                <span>{completedTasks}/{totalActiveTasks} tasks</span>
              </div>
              {/* Thin 3px XP progress line */}
              <div className="h-[3px] w-full bg-zinc-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 dark:from-amber-400 dark:to-amber-300 rounded-full shadow-[0_0_12px_rgba(251,191,36,0.5)] transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, parseFloat(rate)))}%` }}
                />
              </div>
            </div>
            <Link
              to="/student/assignments"
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition active:scale-95 shrink-0 self-start sm:self-center"
            >
              <span>On Track</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Right Streak Box (Desktop span-4, Tablet span-1, Mobile full) */}
        <div className="md:col-span-1 lg:col-span-4 relative overflow-hidden rounded-2xl bg-white dark:bg-[#111827] border border-black/[0.06] dark:border-white/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)] p-4 sm:p-6 flex flex-col justify-between items-center text-center">
          <div className="w-full flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Activity Streak</span>
            <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-mono">
              {hasFreePass ? "🛡 Pass Ready" : "Pass Used"}
            </span>
          </div>

          <div className="my-2 sm:my-3 flex flex-col items-center">
            <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 text-2xl sm:text-3xl shadow-inner border border-amber-500/20">
              🔥
            </div>
            <h2 className="mt-1.5 sm:mt-2 text-xl sm:text-3xl font-extrabold font-mono text-zinc-900 dark:text-white tabular-nums tracking-tight">
              {streakVal} {streakVal === 1 ? "day" : "days"}
            </h2>
            <p className="text-[11px] sm:text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Consecutive daily learning</p>
          </div>

          <Link
            to="/student/assignments"
            className="w-full py-2 sm:py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs shadow-md shadow-amber-500/20 transition flex items-center justify-center gap-1.5 min-h-[44px]"
          >
            <span>Keep it up! 🔥</span>
          </Link>
        </div>
      </div>

      {/* 4-Column Stat Strip (Matching Mobile Mockup) */}
      <div className="grid grid-cols-4 gap-2 sm:gap-4 mt-3">
        {/* Stars */}
        <div className="flex flex-col items-center justify-center p-2 sm:p-3.5 rounded-xl bg-white dark:bg-[#161B22] border border-zinc-200/60 dark:border-zinc-800/60 text-center shadow-xs active:scale-95 transition">
          <span className="text-sm sm:text-base mb-0.5">⭐</span>
          <span className="font-mono text-sm sm:text-lg font-bold text-zinc-900 dark:text-white tabular-nums">{data.total_stars}</span>
          <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 leading-tight">Stars</span>
        </div>

        {/* Streak */}
        <div className="flex flex-col items-center justify-center p-2 sm:p-3.5 rounded-xl bg-white dark:bg-[#161B22] border border-zinc-200/60 dark:border-zinc-800/60 text-center shadow-xs active:scale-95 transition">
          <span className="text-sm sm:text-base mb-0.5">⚡</span>
          <span className="font-mono text-sm sm:text-lg font-bold text-zinc-900 dark:text-white tabular-nums">{streakVal}</span>
          <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 leading-tight">Streak</span>
        </div>

        {/* XP */}
        <div className="flex flex-col items-center justify-center p-2 sm:p-3.5 rounded-xl bg-white dark:bg-[#161B22] border border-zinc-200/60 dark:border-zinc-800/60 text-center shadow-xs active:scale-95 transition">
          <span className="text-sm sm:text-base mb-0.5">🎯</span>
          <span className="font-mono text-sm sm:text-lg font-bold text-zinc-900 dark:text-white tabular-nums">{xpVal.toLocaleString()}</span>
          <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 leading-tight">XP</span>
        </div>

        {/* Level */}
        <div className="flex flex-col items-center justify-center p-2 sm:p-3.5 rounded-xl bg-white dark:bg-[#161B22] border border-zinc-200/60 dark:border-zinc-800/60 text-center shadow-xs active:scale-95 transition">
          <span className="text-sm sm:text-base mb-0.5">👑</span>
          <span className="font-mono text-sm sm:text-lg font-bold text-zinc-900 dark:text-white tabular-nums">Lv.{levelVal}</span>
          <span className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 leading-tight truncate max-w-full">Level</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Deadlines & Grades */}
        <div className="space-y-6 lg:col-span-2">
          {/* Upcoming Deadlines / Today's Assignments */}
          <div className="card border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2 tracking-tight">
                <span>📝 Today&apos;s Assignments</span>
                <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400 tabular-nums font-mono">{data.upcoming_deadlines.length} active</span>
              </h2>
              <Link to="/student/assignments" className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline">
                View all →
              </Link>
            </div>
            {data.upcoming_deadlines.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No upcoming deadlines. 🎉</p>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-zinc-800/60">
                {data.upcoming_deadlines.map((a) => {
                  const skill = getSkillPill(a.title);
                  return (
                    <li
                      key={a.id}
                      className="py-3 px-2 rounded-xl hover:bg-neutral-50/70 dark:hover:bg-zinc-800/40 transition-all flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 active:scale-[0.99]"
                    >
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-base border border-indigo-100 dark:border-indigo-900/50">
                          {skill.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-full border ${skill.bg}`}>
                              {skill.label}
                            </span>
                            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                              {a.submitted ? "Submitted" : format(new Date(a.deadline), "MMM d, HH:mm")}
                            </span>
                          </div>
                          <h4 className="font-semibold text-sm text-zinc-900 dark:text-white truncate mt-0.5" title={a.title}>
                            {a.title}
                          </h4>
                        </div>
                      </div>

                      <div className="flex items-center justify-end sm:justify-start gap-2 shrink-0 self-end sm:self-center">
                        {a.submitted ? (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                            ✓ Submitted
                          </span>
                        ) : (
                          <Link
                            to="/student/assignments"
                            className="btn-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-1.5 px-3 rounded-lg transition shadow-xs active:scale-95"
                          >
                            Start Task →
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
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
          <div id="leaderboard" className="card border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#111827] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.02)]">
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
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
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
                          <UserAvatar
                            src={entry.avatar_url}
                            name={entry.student_name}
                            size="xs"
                          />
                          <span className="truncate max-w-[130px] font-semibold text-neutral-900 dark:text-white">
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

      {/* Transparent Community Reviews Wall */}
      <PublicCommunityReviewsWall
        feedbacks={publicFeedbacks}
        isLoading={isLoadingPublicFeedbacks}
        onOpenFeedbackModal={() => setFeedbackModalOpen(true)}
        userHasReviewed={feedbackSummary?.user_has_reviewed}
      />

      <PlatformFeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        onSubmitted={() => {
          getPlatformFeedbackSummary().then(setFeedbackSummary).catch(() => null);
          fetchReviews();
        }}
      />
    </div>
  );
}

