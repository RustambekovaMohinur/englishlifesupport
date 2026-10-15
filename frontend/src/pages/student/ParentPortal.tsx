import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { LoadingRows, StatCard } from "@/components/ui";
import { getMyParentReport } from "@/services/lmsService";
import { StudentHistoryOut } from "@/types";

const FRONTEND_URL = "https://englishlifesupport.vercel.app";

function LinkBadge({ linked }: { linked: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        linked
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
      }`}
    >
      {linked ? "✅ Ulangan" : "⚠️ Ulanmagan"}
    </span>
  );
}

export default function ParentPortalPage() {
  const [data, setData] = useState<StudentHistoryOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getMyParentReport()
      .then(setData)
      .catch(() => toast.error("Ma'lumotlar yuklanmadi"))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <LoadingRows rows={5} />;
  if (!data) return null;

  const completionRate =
    (data.total_assignments ?? 0) > 0
      ? Math.round(((data.completed_assignments ?? 0) / (data.total_assignments ?? 1)) * 100)
      : 0;

  const isParentLinked = !!(data.parent_telegram_id || data.parent_telegram_chat_id);
  const parentName = data.parent_name ?? null;
  const parentUsername = data.parent_telegram_username ?? null;

  const portalDeepLink = `${FRONTEND_URL}/student/parent-portal`;

  // Count mastered vocab entries across all vocabulary sets
  const masteredWords = (data.vocabulary_sets ?? []).filter((vs) => vs.is_mastered).length;
  const totalWords = (data.vocabulary_sets ?? []).length;

  const recentGrades = (data.submissions ?? [])
    .filter((s) => s.score !== null && s.score !== undefined)
    .sort(
      (a, b) =>
        new Date(b.submitted_at ?? 0).getTime() -
        new Date(a.submitted_at ?? 0).getTime()
    )
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
          👨‍👩‍👦 Ota-ona Portali
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          O'quvchining baholar, vazifalar va so'z boyligi haqida to'liq hisobot
        </p>
      </div>

      {/* Parent Telegram Link Status */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            📲 Telegram Ulanish
          </h2>
          <LinkBadge linked={isParentLinked} />
        </div>

        {isParentLinked ? (
          <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {parentName && (
              <p>
                👤 <strong>Ota-ona:</strong> {parentName}
              </p>
            )}
            {parentUsername && (
              <p>
                🔗 Telegram:{" "}
                <a
                  href={`https://t.me/${parentUsername.replace("@", "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 dark:text-brand-400 underline"
                >
                  @{parentUsername.replace("@", "")}
                </a>
              </p>
            )}
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              ✅ Ota-ona Telegram orqali baho va yangiliklar haqida xabardor bo'ladi.
            </p>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              Ota-ona hali botga ulanmagan. Quyidagi havola orqali ulashing:
            </p>
            <a
              href={portalDeepLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
            >
              Farzandim ko'rsatkichlari 🚀
            </a>
            <p className="text-xs text-zinc-400">
              Bu havolani ota-onangizga yuboring — u saytni ochib, barcha
              ko'rsatkichlarni ko'ra oladi.
            </p>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Jami Yulduzlar"
          value={`⭐ ${data.total_stars ?? 0}`}
          hint="Yig'ilgan"
        />
        <StatCard
          label="Vazifa bajarish"
          value={`${completionRate}%`}
          hint={`${data.completed_assignments ?? 0}/${data.total_assignments ?? 0} ta`}
        />
        <StatCard
          label="So'z boyligi"
          value={`📚 ${masteredWords}/${totalWords}`}
          hint="O'zlashtirgan/Jami"
        />
        <StatCard
          label="Daraja"
          value={`Lvl ${data.level ?? 1}`}
          hint={data.level_title ?? "Beginner"}
        />
      </div>

      {/* Recent Grades */}
      <div className="card space-y-3">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
          📝 So'nggi baholar
        </h2>
        {recentGrades.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Hali baholangan vazifalar yo'q.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {recentGrades.map((sub) => (
              <div
                key={sub.submission_id ?? sub.assignment_id}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <div>
                  <p className="font-medium text-zinc-900 dark:text-white">
                    {sub.title}
                  </p>
                  {sub.feedback && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">
                      💬 {sub.feedback}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 pl-3">
                  <span className="font-bold text-brand-700 dark:text-brand-300">
                    {sub.score ?? "—"}/100
                  </span>
                  {sub.stars_earned > 0 && (
                    <p className="text-xs text-amber-500">{"⭐".repeat(sub.stars_earned)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vocabulary Progress */}
      {(data.vocabulary_sets ?? []).length > 0 && (
        <div className="card space-y-3">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            📖 So'z to'plamlari
          </h2>
          <div className="space-y-3">
            {(data.vocabulary_sets ?? []).map((vs) => {
              const pct = vs.is_mastered ? 100 : vs.best_score ?? 0;
              return (
                <div key={vs.set_id}>
                  <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {vs.title}
                    </span>
                    <span>
                      {vs.total_words} so'z · {vs.is_mastered ? "✅ O'zlashtirildi" : `${pct}%`}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assignments List */}
      {(data.history ?? []).length > 0 && (
        <div className="card space-y-3">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
            📋 Vazifalar holati
          </h2>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {(data.history ?? []).slice(0, 10).map((asgn) => {
              const statusLabel =
                asgn.submission_status === "graded"
                  ? "✅ Baholandi"
                  : asgn.submission_status === "submitted"
                  ? "⏳ Kutilmoqda"
                  : asgn.submission_status === "missed"
                  ? "❌ O'tkazib yuborildi"
                  : "📌 Topshirilmadi";
              return (
                <div
                  key={asgn.assignment_id}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <p className="text-zinc-800 dark:text-zinc-200 font-medium line-clamp-1">
                    {asgn.title}
                  </p>
                  <span className="shrink-0 pl-3 text-xs">{statusLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
