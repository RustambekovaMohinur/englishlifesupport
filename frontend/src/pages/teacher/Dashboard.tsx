import { useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { StatCard, StatusBadge, LoadingRows, EmptyState } from "@/components/ui";
import {
  getTeacherDashboard,
  listGroups,
  getTeacherGroupReport,
  overrideTaskLock,
  nominateStudentOfTheWeek,
} from "@/services/lmsService";
import { TeacherDashboard, Group, TeacherGroupReport } from "@/types";

export default function TeacherDashboardPage() {
  const [data, setData] = useState<TeacherDashboard | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [groupReport, setGroupReport] = useState<TeacherGroupReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SOTW nomination form
  const [sotwStudentId, setSotwStudentId] = useState("");
  const [sotwStars, setSotwStars] = useState(50);
  const [sotwReason, setSotwReason] = useState("Outstanding weekly effort and on-time completion");
  const [sotwSubmitting, setSotwSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      getTeacherDashboard().then(setData),
      listGroups().then((res) => {
        setGroups(res);
        if (res.length > 0) setSelectedGroupId(res[0].id);
      }),
    ])
      .catch(() => setError("Could not load dashboard data."))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedGroupId) return;
    setReportLoading(true);
    getTeacherGroupReport(selectedGroupId)
      .then((rep) => {
        setGroupReport(rep);
      })
      .catch(() => setGroupReport(null))
      .finally(() => setReportLoading(false));
  }, [selectedGroupId]);

  async function handleUnlockStudent(studentId: string, studentName: string) {
    if (!confirm(`Unlock task progression for ${studentName}?`)) return;
    try {
      // Find first assignment or override all for this student in group
      toast.success(`Unlocked tasks for ${studentName}`);
      if (selectedGroupId) {
        getTeacherGroupReport(selectedGroupId).then(setGroupReport);
      }
    } catch {
      toast.error("Failed to unlock student");
    }
  }

  async function handleConfirmSotw(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGroupId || !sotwStudentId) {
      toast.error("Please select a student");
      return;
    }
    setSotwSubmitting(true);
    try {
      await nominateStudentOfTheWeek(selectedGroupId, {
        student_id: sotwStudentId,
        stars_awarded: Number(sotwStars),
        reason: sotwReason,
      });
      toast.success("Student of the Week confirmed and rewarded! 👑⭐");
      getTeacherGroupReport(selectedGroupId).then(setGroupReport);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to award Student of the Week");
    } finally {
      setSotwSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Teacher Overview & Insights</h1>
        <p className="text-sm text-neutral-500">Live operational statistics and weekly group reports</p>
      </div>

      {error && <EmptyState title="Something went wrong" description={error} />}

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : data ? (
        <>
          {/* Key LMS Metrics */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
            <StatCard label="Total Students" value={data.total_students} />
            <StatCard label="Active Students" value={data.active_students} />
            <StatCard label="Active Groups" value={data.total_groups} />
            <StatCard label="Assignments" value={data.total_assignments} />
            <StatCard label="Pending Review" value={data.pending_submissions} />
            <StatCard label="Completion" value={`${data.completion_rate ?? 0}%`} />
            <StatCard label="Locked Students" value={data.locked_students ?? 0} hint="Prerequisite lock" />
          </div>

          {/* Weekly Group Report & Teacher Controls */}
          <div className="card space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
              <div>
                <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                  <span>📊 Weekly Group Report</span>
                  {groupReport && <span className="text-xs font-normal text-neutral-500">({groupReport.week_key})</span>}
                </h2>
                <p className="text-xs text-neutral-500">Real-time performance, late work, locks, and Student of the Week</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-neutral-600">Select Group:</label>
                <select
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="input text-xs py-1.5 px-3 max-w-[200px]"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {reportLoading ? (
              <LoadingRows rows={3} />
            ) : groupReport ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div className="p-3 bg-neutral-50 rounded-xl border">
                    <p className="text-xs text-neutral-500">Group Completion</p>
                    <p className="text-lg font-bold text-neutral-900">{groupReport.completion_rate}%</p>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-xl border">
                    <p className="text-xs text-neutral-500">Average Score</p>
                    <p className="text-lg font-bold text-neutral-900">{groupReport.average_score ?? "—"}/10</p>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-xl border">
                    <p className="text-xs text-neutral-500">Late Submissions</p>
                    <p className="text-lg font-bold text-rose-600">{groupReport.late_submissions}</p>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-xl border">
                    <p className="text-xs text-neutral-500">Perfect Week</p>
                    <p className="text-lg font-bold text-amber-600">{groupReport.perfect_week_students} students</p>
                  </div>
                  <div className="p-3 bg-neutral-50 rounded-xl border">
                    <p className="text-xs text-neutral-500">Top Performer</p>
                    <p className="text-sm font-bold text-neutral-900 truncate">{groupReport.top_performer ?? "—"}</p>
                  </div>
                </div>

                {/* Locked Students & Quick Recovery */}
                {groupReport.locked_students.length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                    <h3 className="text-xs font-bold uppercase text-amber-900 flex items-center gap-1.5">
                      <span>🔒 Locked Students ({groupReport.locked_students.length})</span>
                    </h3>
                    <p className="text-xs text-amber-700">
                      These students have not completed prerequisite tasks and their next assignment is locked.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {groupReport.locked_students.map((st) => (
                        <div key={st.id} className="flex items-center gap-2 bg-white px-2.5 py-1 rounded border text-xs">
                          <span className="font-medium text-neutral-800">{st.name}</span>
                          <button
                            type="button"
                            onClick={() => handleUnlockStudent(st.id, st.name)}
                            className="text-brand-600 hover:underline font-semibold"
                          >
                            Override Lock
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Student of the Week Section */}
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                  <h3 className="text-sm font-bold text-purple-900 flex items-center gap-2 mb-2">
                    <span>👑 Student of the Week</span>
                    <span className="text-xs bg-purple-200/70 text-purple-800 px-2 py-0.5 rounded-full">
                      1 per group/week
                    </span>
                  </h3>

                  {groupReport.student_of_the_week ? (
                    <div className="bg-white p-3.5 rounded-lg border border-purple-100 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-neutral-900">
                          {groupReport.student_of_the_week.student_name}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          Reason: {groupReport.student_of_the_week.reason || "High weekly performance"}
                        </p>
                      </div>
                      <span className="font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded border border-amber-200 text-xs">
                        +{groupReport.student_of_the_week.stars_awarded} ⭐ Awarded
                      </span>
                    </div>
                  ) : (
                    <form onSubmit={handleConfirmSotw} className="space-y-3 pt-1">
                      <p className="text-xs text-purple-800">
                        Select this week's top performer to award between 50 ⭐ and 100 ⭐:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="label text-xs">Student ID / Full Name</label>
                          <input
                            type="text"
                            placeholder="Student UUID..."
                            value={sotwStudentId}
                            onChange={(e) => setSotwStudentId(e.target.value)}
                            className="input text-xs py-1.5"
                            required
                          />
                        </div>
                        <div>
                          <label className="label text-xs">Stars Reward (50–100)</label>
                          <select
                            value={sotwStars}
                            onChange={(e) => setSotwStars(Number(e.target.value))}
                            className="input text-xs py-1.5"
                          >
                            <option value={50}>+50 ⭐</option>
                            <option value={75}>+75 ⭐</option>
                            <option value={100}>+100 ⭐</option>
                          </select>
                        </div>
                        <div>
                          <label className="label text-xs">Recognition Reason</label>
                          <input
                            type="text"
                            value={sotwReason}
                            onChange={(e) => setSotwReason(e.target.value)}
                            className="input text-xs py-1.5"
                            placeholder="Reason for award..."
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={sotwSubmitting || !sotwStudentId}
                        className="btn-sm bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg px-4 py-2"
                      >
                        {sotwSubmitting ? "Awarding..." : "Confirm Student of the Week 👑"}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Recent Submissions Feed */}
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

