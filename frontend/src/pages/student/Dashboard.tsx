import { useEffect, useState } from "react";
import { format } from "date-fns";
import { EmptyState, LoadingRows, StatCard } from "@/components/ui";
import { getStudentDashboard } from "@/services/lmsService";
import { StudentDashboard } from "@/types";

export default function StudentDashboardPage() {
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStudentDashboard()
      .then(setData)
      .catch(() => setError("Could not load your dashboard."))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <LoadingRows rows={4} />;
  if (error || !data) return <EmptyState title="Something went wrong" description={error ?? undefined} />;

  return (
    <div className="space-y-6">
      <div className="card bg-gradient-to-br from-brand-500 to-brand-600 text-white">
        <p className="text-sm opacity-90">Welcome back,</p>
        <h1 className="text-2xl font-bold">{data.full_name}</h1>
        <p className="mt-1 text-sm opacity-90">
          {data.group_name ?? "No group assigned yet"} {data.teacher_name && `· Teacher: ${data.teacher_name}`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Stars" value={`⭐ ${data.total_stars}`} />
        <StatCard label="Average Score" value={data.average_score ?? "—"} />
        <StatCard label="Completed" value={`${data.completed_assignments}/${data.total_assignments}`} hint="assignments" />
        <StatCard label="Upcoming Deadlines" value={data.upcoming_deadlines.length} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">Upcoming Deadlines</h2>
          {data.upcoming_deadlines.length === 0 ? (
            <p className="text-sm text-neutral-500">No upcoming deadlines. 🎉</p>
          ) : (
            <ul className="space-y-3">
              {data.upcoming_deadlines.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-neutral-800">{a.title}</span>
                  <span className={a.submitted ? "text-green-600" : "text-neutral-500"}>
                    {a.submitted ? "Submitted" : format(new Date(a.deadline), "MMM d, HH:mm")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2 className="mb-4 text-base font-semibold text-neutral-900">Recent Grades</h2>
          {data.recent_grades.length === 0 ? (
            <p className="text-sm text-neutral-500">No grades yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.recent_grades.map((g, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-neutral-800">{g.assignment_title}</span>
                  <span className="text-neutral-500">
                    {g.score}/10 · {"⭐".repeat(g.stars)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
