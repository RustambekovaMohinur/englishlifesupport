import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows } from "@/components/ui";
import { listMySubmissions } from "@/services/lmsService";
import { SubmissionOut } from "@/types";

export default function StudentResultsPage() {
  const [submissions, setSubmissions] = useState<SubmissionOut[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    listMySubmissions()
      .then((data) => setSubmissions(data.filter((s) => s.grade)))
      .catch(() => toast.error("Failed to load results"))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">My Results</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Scores and feedback from your teacher</p>
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : submissions.length === 0 ? (
        <EmptyState title="No graded work yet" description="Once your teacher grades your homework, results appear here." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200/80 dark:border-zinc-800 text-left bg-zinc-50/50 dark:bg-zinc-900/50">
                <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Assignment</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Score</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Stars</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Feedback</th>
                <th className="py-3 px-4 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Graded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {submissions.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition align-top">
                  <td className="py-3.5 px-4 font-medium text-zinc-900 dark:text-white">{s.assignment_title}</td>
                  <td className="py-3.5 px-4 font-bold font-mono text-brand-600 dark:text-brand-400">{s.grade!.score}/10</td>
                  <td className="py-3.5 px-4 text-amber-500 font-mono">{"⭐".repeat(Math.min(10, s.grade!.stars))}</td>
                  <td className="py-3.5 px-4 max-w-xs text-zinc-600 dark:text-zinc-400">{s.grade!.feedback ?? "—"}</td>
                  <td className="py-3.5 px-4 text-zinc-500 dark:text-zinc-400 font-mono text-xs">{format(new Date(s.grade!.graded_at), "MMM d, yyyy")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
