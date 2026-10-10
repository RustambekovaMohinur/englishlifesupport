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

          <div className="bot-panel">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-neutral-900">Telegram sync status</h2>
              <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700">
                {data.telegram_sync_groups.length} connected
              </span>
            </div>

            {data.telegram_sync_groups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-sky-200 bg-white/70 p-4 text-sm text-neutral-500">
                No Telegram groups are linked yet.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {data.telegram_sync_groups.map((group) => (
                  <div key={group.group_name} className="rounded-xl border border-sky-100 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-neutral-800">{group.group_name}</p>
                      <StatusBadge status={group.sync_enabled ? "active" : "inactive"} />
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-neutral-600">
                      <p>Chat: {group.chat_id ?? "Not linked"}</p>
                      <p>Last sync: {group.last_synced_at ? format(new Date(group.last_synced_at), "MMM d, HH:mm") : "Never"}</p>
                      <p>Students: {group.student_count} · Pending tasks: {group.pending_tasks}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
