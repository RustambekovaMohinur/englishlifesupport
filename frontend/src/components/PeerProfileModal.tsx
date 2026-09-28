import { useEffect, useState } from "react";
import { Modal, Spinner } from "@/components/ui";
import { UserAvatar } from "@/components/common/UserAvatar";
import { getPeerProfile } from "@/services/lmsService";
import { PeerProfileOut } from "@/types";
import { Sparkles, Trophy, Flame, BookOpen, CheckCircle2 } from "lucide-react";

interface PeerProfileModalProps {
  studentId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function PeerProfileModal({ studentId, isOpen, onClose }: PeerProfileModalProps) {
  const [profile, setProfile] = useState<PeerProfileOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !studentId) {
      setProfile(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getPeerProfile(studentId)
      .then((data) => {
        if (isMounted) {
          setProfile(data);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err?.response?.data?.detail || "Could not load peer profile");
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [studentId, isOpen]);

  return (
    <Modal open={isOpen} onClose={onClose} title="Student Profile" maxWidth="sm:max-w-lg">
      <div className="p-4 sm:p-6 space-y-6 overflow-x-hidden">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <Spinner className="h-8 w-8" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading student profile...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center space-y-2">
            <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Please try again or close this window.</p>
          </div>
        ) : profile ? (
          <div className="space-y-6">
            {/* Header: Avatar, Name, Handle, Cohort */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-4">
              <div className="relative">
                <UserAvatar
                  src={profile.avatar_url}
                  name={profile.full_name}
                  size="xl"
                  className="ring-4 ring-indigo-500/20 shadow-md"
                />
                <span className="absolute -bottom-1 -right-1 text-base bg-white dark:bg-zinc-900 rounded-full p-0.5 shadow-xs">
                  🎓
                </span>
              </div>

              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h3 className="text-lg font-bold text-zinc-900 dark:text-white truncate">
                    {profile.full_name}
                  </h3>
                  {profile.level && (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {profile.level}
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                  @{profile.username}
                </p>

                {profile.group_name && (
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300 flex items-center justify-center sm:justify-start gap-1">
                    <span className="text-indigo-500">👥</span>
                    <span>{profile.group_name}</span>
                  </p>
                )}

                {profile.bio && (
                  <p className="text-xs italic text-zinc-500 dark:text-zinc-400 pt-1 border-t border-zinc-100 dark:border-zinc-800 line-clamp-2">
                    &ldquo;{profile.bio}&rdquo;
                  </p>
                )}
              </div>
            </div>

            {/* Competitive 4-Card Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Total Stars */}
              <div className="p-3.5 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-800/40 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg shrink-0">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                    Total Stars
                  </p>
                  <p className="text-lg font-extrabold text-zinc-900 dark:text-white tabular-nums font-mono">
                    {profile.total_stars} ⭐
                  </p>
                </div>
              </div>

              {/* Lightning / Streak */}
              <div className="p-3.5 rounded-xl bg-orange-500/5 dark:bg-orange-500/10 border border-orange-200/60 dark:border-orange-800/40 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center text-lg shrink-0">
                  <Flame className="w-5 h-5 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-orange-800 dark:text-orange-300 uppercase tracking-wider">
                    Streak Power
                  </p>
                  <p className="text-lg font-extrabold text-zinc-900 dark:text-white tabular-nums font-mono">
                    {profile.total_lightning} ⚡
                  </p>
                </div>
              </div>

              {/* Assignments Completed */}
              <div className="p-3.5 rounded-xl bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-200/60 dark:border-indigo-800/40 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-lg shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-indigo-800 dark:text-indigo-300 uppercase tracking-wider">
                    Homework
                  </p>
                  <p className="text-lg font-extrabold text-zinc-900 dark:text-white tabular-nums font-mono">
                    {profile.total_assignments_completed} done
                  </p>
                </div>
              </div>

              {/* Vocabulary Sets Mastered */}
              <div className="p-3.5 rounded-xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg shrink-0">
                  <BookOpen className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                    Wordlists
                  </p>
                  <p className="text-lg font-extrabold text-zinc-900 dark:text-white tabular-nums font-mono">
                    {profile.total_vocabulary_completed} sets
                  </p>
                </div>
              </div>
            </div>

            {/* Motivational Footer / Peer Badge */}
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/60 dark:border-zinc-700/60 flex items-center gap-2.5 text-xs text-zinc-600 dark:text-zinc-300">
              <Trophy className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                Keep practicing every day to climb the cohort leaderboard and earn bonus stars!
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
