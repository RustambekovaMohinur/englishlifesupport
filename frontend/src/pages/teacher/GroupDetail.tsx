import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import StudentDetailModal from "@/components/StudentDetailModal";
import { EmptyState, LoadingRows, Modal, useConfirm } from "@/components/ui";
import { deleteGroup, getGroupDetail, updateGroup } from "@/services/lmsService";
import { GroupDetailOut } from "@/types";

const LEVELS = [
  "beginner",
  "elementary",
  "pre_intermediate",
  "intermediate",
  "upper_intermediate",
  "advanced",
];

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();

  const [groupDetail, setGroupDetail] = useState<GroupDetailOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [viewTab, setViewTab] = useState<"cards" | "matrix">("cards");

  const { confirm, ConfirmDialog } = useConfirm();

  function loadDetails() {
    if (!groupId) return;
    setIsLoading(true);
    getGroupDetail(groupId)
      .then(setGroupDetail)
      .catch((err) => {
        toast.error(err?.response?.data?.detail ?? "Failed to load group details");
      })
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadDetails();
  }, [groupId]);

  function handleDelete() {
    if (!groupDetail) return;
    confirm(`Permanently delete group "${groupDetail.name}"? This action cannot be undone.`, async () => {
      try {
        await deleteGroup(groupDetail.id);
        toast.success("Group deleted");
        navigate("/teacher/groups");
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? "Failed to delete group");
      }
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/teacher/groups" className="text-sm font-medium text-brand-600 hover:underline">
            ← Back to Groups
          </Link>
        </div>
        <LoadingRows rows={6} />
      </div>
    );
  }

  if (!groupDetail) {
    return (
      <div className="space-y-6">
        <Link to="/teacher/groups" className="text-sm font-medium text-brand-600 hover:underline">
          ← Back to Groups
        </Link>
        <EmptyState
          title="Group not found"
          description="The requested group does not exist or you do not have permission to view it."
        />
      </div>
    );
  }

  // Calculate Group Average Progress
  const totalStudents = groupDetail.students.length;
  const totalAssignments = groupDetail.assignments.length;
  const avgProgress =
    totalStudents > 0
      ? Math.round(
          groupDetail.students.reduce((sum, s) => sum + s.overall_completion_percentage, 0) / totalStudents
        )
      : 0;

  const totalGroupStars = groupDetail.students.reduce((sum, s) => sum + s.total_stars, 0);
  const totalGroupLightning = groupDetail.students.reduce((sum, s) => sum + s.total_lightning, 0);

  return (
    <div className="space-y-6">
      {/* Top breadcrumb & navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/teacher/groups"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          <span>←</span>
          <span>Back to Groups</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditModalOpen(true)}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Edit Group
          </button>
          <button
            onClick={handleDelete}
            className="text-xs px-3 py-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 transition"
          >
            Delete Group
          </button>
        </div>
      </div>

      {/* Group Header Banner */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-black text-neutral-900">{groupDetail.name}</h1>
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-brand-100 text-brand-800 border border-brand-200">
                {groupDetail.english_level.replace("_", " ")}
              </span>
              {!groupDetail.is_active && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-neutral-200 text-neutral-700">
                  Archived
                </span>
              )}
            </div>
            {groupDetail.schedule && (
              <p className="mt-1.5 text-sm font-medium text-neutral-600 flex items-center gap-1.5">
                <span>🗓️</span>
                <span>{groupDetail.schedule}</span>
              </p>
            )}
          </div>

          {/* Group Progress Summary Pill */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/80 p-4 min-w-[240px]">
            <div className="flex items-center justify-between text-xs font-semibold text-neutral-600 mb-1.5">
              <span>Group Average Progress</span>
              <span
                className={`text-sm font-bold ${
                  avgProgress >= 80
                    ? "text-emerald-600"
                    : avgProgress >= 50
                    ? "text-amber-600"
                    : "text-neutral-700"
                }`}
              >
                {avgProgress}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-neutral-200 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  avgProgress >= 80 ? "bg-emerald-500" : avgProgress >= 50 ? "bg-amber-500" : "bg-neutral-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, avgProgress))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Group Stats Row */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5 border-t border-neutral-100">
          <div className="text-center p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/60">
            <span className="text-xs text-neutral-500 font-medium block">Total Students</span>
            <span className="text-xl font-black text-neutral-900 mt-0.5 block">👥 {totalStudents}</span>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-neutral-50 border border-neutral-200/60">
            <span className="text-xs text-neutral-500 font-medium block">Published Tasks</span>
            <span className="text-xl font-black text-neutral-900 mt-0.5 block">📝 {totalAssignments}</span>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/60">
            <span className="text-xs text-amber-700 font-medium block">Group Stars</span>
            <span className="text-xl font-black text-amber-600 mt-0.5 block">⭐ {totalGroupStars}</span>
          </div>
          <div className="text-center p-2.5 rounded-lg bg-yellow-50/60 border border-yellow-200/60">
            <span className="text-xs text-yellow-700 font-medium block">Group Lightning</span>
            <span className="text-xl font-black text-yellow-600 mt-0.5 block">⚡ {totalGroupLightning}</span>
          </div>
        </div>
      </div>

      {/* Tabs / Switch between Student Cards & Assignment Matrix */}
      <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Enrolled Students ({totalStudents})</h2>
          <p className="text-xs text-neutral-500">
            Click any student to view their complete profile, grades, and submissions
          </p>
        </div>

        <div className="flex gap-1.5 p-1 bg-neutral-100 rounded-lg border border-neutral-200 text-xs font-semibold">
          <button
            onClick={() => setViewTab("cards")}
            className={`px-3 py-1.5 rounded-md transition ${
              viewTab === "cards"
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            📇 Student Cards
          </button>
          <button
            onClick={() => setViewTab("matrix")}
            className={`px-3 py-1.5 rounded-md transition ${
              viewTab === "matrix"
                ? "bg-white text-neutral-900 shadow-xs"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            📊 Assignment Matrix
          </button>
        </div>
      </div>

      {totalStudents === 0 ? (
        <EmptyState
          title="No students in this group yet"
          description="Students can select this group during registration, or you can assign students from the Students page."
        />
      ) : viewTab === "cards" ? (
        /* ================= 1. STUDENTS LIST / CARDS VIEW ================= */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupDetail.students.map((student) => {
            const completedCount =
              student.completed_assignments_count ??
              student.assignments.filter((a) => a.completion_percentage >= 100).length;
            const totalCount =
              student.total_assignments_count ??
              (groupDetail.assignments.length > 0 ? groupDetail.assignments.length : student.assignments.length);

            const isAllCompleted = totalCount > 0 && completedCount >= totalCount;
            const pct = student.overall_completion_percentage;

            return (
              <div
                key={student.student_id}
                onClick={() => setSelectedStudentId(student.student_id)}
                className="card cursor-pointer transition-all hover:shadow-md hover:border-brand-300 relative overflow-hidden group"
              >
                {/* Status indicator badge in top-right */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 text-base overflow-hidden border border-brand-200">
                      {student.avatar_url ? (
                        <img
                          src={student.avatar_url}
                          alt={student.full_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        student.full_name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-neutral-900 text-sm group-hover:text-brand-600 transition truncate">
                        {student.full_name}
                      </h3>
                      <p className="text-xs text-neutral-400 font-mono truncate">@{student.username}</p>
                      {student.telegram_username && (
                        <p className="text-[11px] text-neutral-500 truncate">
                          {student.telegram_username.startsWith("@")
                            ? student.telegram_username
                            : `@${student.telegram_username}`}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Clearly visible GREEN check icon (✓) or RED indicator (✕) */}
                  <span
                    className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-black shadow-xs shrink-0 ${
                      isAllCompleted
                        ? "bg-emerald-500 text-white"
                        : "bg-rose-500 text-white"
                    }`}
                    title={isAllCompleted ? "Completed required work" : "Incomplete homework"}
                  >
                    {isAllCompleted ? "✓" : "✕"}
                  </span>
                </div>

                {/* Progress bar and metrics */}
                <div className="mt-4 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-neutral-600">
                      Completed: <strong className="text-neutral-900">{completedCount}/{totalCount}</strong>
                    </span>
                    <span
                      className={
                        pct >= 80
                          ? "text-emerald-600 font-bold"
                          : pct >= 50
                          ? "text-amber-600 font-bold"
                          : "text-rose-600 font-bold"
                      }
                    >
                      Progress: {pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden border border-neutral-200/60">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                </div>

                {/* Stars and Lightning (NOT fire!) */}
                <div className="mt-3.5 flex items-center justify-between border-t border-neutral-100 pt-3 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-amber-500 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                      ⭐ {student.total_stars}
                    </span>
                    <span className="font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-200/60">
                      ⚡ {student.total_lightning}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-brand-600 group-hover:underline">
                    View Details →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ================= 2. GROUP ASSIGNMENT MATRIX VIEW ================= */
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-600 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3 sticky left-0 bg-neutral-50 z-10 font-bold">Student</th>
                <th className="px-3 py-3 font-semibold">Telegram</th>
                <th className="px-3 py-3 text-center font-semibold">⭐ Stars</th>
                <th className="px-3 py-3 text-center font-semibold">⚡ Lightning</th>
                <th className="px-3 py-3 text-center font-semibold">Overall %</th>
                {groupDetail.assignments.map((a) => (
                  <th key={a.id} className="px-3 py-3 min-w-[130px] text-center">
                    <div className="font-bold truncate max-w-[150px]" title={a.title}>
                      {a.title}
                    </div>
                    <div className="text-[10px] text-neutral-400 font-normal">
                      {new Date(a.deadline).toLocaleDateString()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {groupDetail.students.map((st) => (
                <tr
                  key={st.student_id}
                  className="hover:bg-neutral-50/80 transition-colors cursor-pointer"
                  onClick={() => setSelectedStudentId(st.student_id)}
                >
                  <td className="px-4 py-3 sticky left-0 bg-white z-10 font-medium text-neutral-900 group">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 text-xs overflow-hidden">
                        {st.avatar_url ? (
                          <img src={st.avatar_url} alt={st.full_name} className="h-full w-full object-cover" />
                        ) : (
                          st.full_name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div>
                        <span className="font-semibold text-neutral-900 hover:text-brand-600 underline decoration-dotted">
                          {st.full_name}
                        </span>
                        <span className="text-xs text-neutral-400 font-mono ml-1.5">(@{st.username})</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-neutral-500 text-xs">
                    {st.telegram_username || "—"}
                  </td>
                  <td className="px-3 py-3 text-center font-bold text-amber-500">
                    ⭐ {st.total_stars}
                  </td>
                  <td className="px-3 py-3 text-center font-bold text-yellow-600">
                    ⚡ {st.total_lightning}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded text-xs font-bold ${
                        st.overall_completion_percentage >= 80
                          ? "bg-emerald-100 text-emerald-800"
                          : st.overall_completion_percentage >= 50
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {st.overall_completion_percentage}%
                    </span>
                  </td>
                  {groupDetail.assignments.map((a) => {
                    const item = st.assignments.find((asg) => asg.assignment_id === a.id);
                    const pct = item ? item.completion_percentage : 0;
                    const isComplete = pct >= 100;
                    const isZero = pct === 0;

                    return (
                      <td key={a.id} className="px-3 py-3 text-center">
                        <span
                          title={
                            item?.has_submission
                              ? `Submitted: ${pct}%${item.score !== null ? ` (Score: ${item.score}/10)` : ""}`
                              : "Not submitted (0%)"
                          }
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold ${
                            isComplete
                              ? "bg-emerald-500 text-white"
                              : isZero
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-400 text-neutral-900"
                          }`}
                        >
                          {isComplete ? "✓ 100%" : isZero ? "✕ 0%" : `${pct}%`}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Polish Responsive StudentDetailModal */}
      <StudentDetailModal
        studentId={selectedStudentId}
        onClose={() => setSelectedStudentId(null)}
      />

      {/* Edit Group Modal */}
      {groupDetail && (
        <EditGroupModal
          open={editModalOpen}
          group={groupDetail}
          onClose={() => setEditModalOpen(false)}
          onSaved={() => {
            setEditModalOpen(false);
            loadDetails();
          }}
        />
      )}

      <ConfirmDialog />
    </div>
  );
}

function EditGroupModal({
  open,
  group,
  onClose,
  onSaved,
}: {
  open: boolean;
  group: GroupDetailOut;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group.name);
  const [level, setLevel] = useState(group.english_level);
  const [schedule, setSchedule] = useState(group.schedule ?? "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setName(group.name);
    setLevel(group.english_level);
    setSchedule(group.schedule ?? "");
  }, [group, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateGroup(group.id, { name, english_level: level, schedule });
      toast.success("Group updated");
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save group");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Group">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Group name</label>
          <input
            required
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">English level</label>
          <select className="input" value={level} onChange={(e) => setLevel(e.target.value as any)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Schedule</label>
          <input
            className="input"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            placeholder="Mon/Wed/Fri 16:00-17:30"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="btn-primary">
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
