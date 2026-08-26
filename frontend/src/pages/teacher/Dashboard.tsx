import { useEffect, useState } from "react";
import { format } from "date-fns";
import { StatCard, StatusBadge, LoadingRows, EmptyState } from "@/components/ui";
import { getTeacherDashboard } from "@/services/lmsService";
import { TeacherDashboard } from "@/types";

export default function TeacherDashboardPage() {
  const [data, setData] = useState<TeacherDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTeacherDashboard()
      .then(setData)
      .catch(() => setError("Could not load dashboard data."))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
        <p className="text-sm text-neutral-500">Overview of English Life learning center</p>
      </div>

      {error && <EmptyState title="Something went wrong" description={error} />}

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Total Students" value={data.total_students} />
            <StatCard label="Active Students" value={data.active_students} />
            <StatCard label="Total Assignments" value={data.total_assignments} />
            <StatCard label="Pending Submissions" value={data.pending_submissions} />
            <StatCard label="Active Groups" value={data.total_groups} />
          </div>

          <div className="card">
            <h2 className="mb-4 text-base font-semibold text-neutral-900">Recent Submissions</h2>
            {data.recent_submissions.length === 0 ? (
              <EmptyState title="No submissions yet" description="Student submissions will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 text-left text-neutral-500">
                      <th className="pb-2 pr-4 font-medium">Student</th>
                      <th className="pb-2 pr-4 font-medium">Assignment</th>
                      <th className="pb-2 pr-4 font-medium">Submitted</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_submissions.map((s) => (
                      <tr key={s.id} className="border-b border-neutral-50 last:border-0">
                        <td className="py-3 pr-4 font-medium text-neutral-800">{s.student_name}</td>
                        <td className="py-3 pr-4 text-neutral-600">{s.assignment_title}</td>
                        <td className="py-3 pr-4 text-neutral-500">{format(new Date(s.submitted_at), "MMM d, HH:mm")}</td>
                        <td className="py-3">
                          <StatusBadge status={s.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
