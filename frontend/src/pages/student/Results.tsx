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
        <h1 className="text-2xl font-bold text-neutral-900">My Results</h1>
        <p className="text-sm text-neutral-500">Scores and feedback from your teacher</p>
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : submissions.length === 0 ? (
        <EmptyState title="No graded work yet" description="Once your teacher grades your homework, results appear here." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-neutral-500">
                <th className="pb-2 pr-4 font-medium">Assignment</th>
                <th className="pb-2 pr-4 font-medium">Score</th>
                <th className="pb-2 pr-4 font-medium">Stars</th>
                <th className="pb-2 pr-4 font-medium">Feedback</th>
                <th className="pb-2 font-medium">Graded</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id} className="border-b border-neutral-50 last:border-0 align-top">
                  <td className="py-3 pr-4 font-medium text-neutral-800">{s.assignment_title}</td>
                  <td className="py-3 pr-4 text-neutral-700">{s.grade!.score}/10</td>
                  <td className="py-3 pr-4 text-neutral-700">{"⭐".repeat(s.grade!.stars)}</td>
                  <td className="py-3 pr-4 max-w-xs text-neutral-600">{s.grade!.feedback ?? "—"}</td>
                  <td className="py-3 text-neutral-500">{format(new Date(s.grade!.graded_at), "MMM d, yyyy")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
