import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, Modal, useConfirm } from "@/components/ui";
import {
  createGroup,
  deleteGroup,
  getGroupDetail,
  getStudentHistory,
  listGroups,
  updateGroup,
} from "@/services/lmsService";
import { Group, GroupDetailOut, StudentHistoryOut } from "@/types";

const LEVELS = [
  "beginner",
  "elementary",
  "pre_intermediate",
  "intermediate",
  "upper_intermediate",
  "advanced",
];

export default function GroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);

  // Group detail view states
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupDetail, setGroupDetail] = useState<GroupDetailOut | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Student history modal
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null);
  const [studentHistory, setStudentHistory] = useState<StudentHistoryOut | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const { confirm, ConfirmDialog } = useConfirm();

  function refresh() {
    setIsLoading(true);
    listGroups(false)
      .then(setGroups)
      .catch(() => toast.error("Failed to load groups"))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  function loadGroupDetail(groupId: string) {
    setSelectedGroupId(groupId);
    setIsLoadingDetail(true);
    getGroupDetail(groupId)
      .then(setGroupDetail)
      .catch((err) => toast.error(err?.response?.data?.detail ?? "Failed to load group details"))
      .finally(() => setIsLoadingDetail(false));
  }

  function viewStudentHistory(studentId: string) {
    setHistoryStudentId(studentId);
    setIsLoadingHistory(true);
    getStudentHistory(studentId)
      .then(setStudentHistory)
      .catch((err) => toast.error(err?.response?.data?.detail ?? "Failed to load student history"))
      .finally(() => setIsLoadingHistory(false));
  }

  function handleDelete(group: Group, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    confirm(`Permanently delete group "${group.name}"? This action cannot be undone.`, async () => {
      try {
        await deleteGroup(group.id);
        toast.success("Group deleted");
        if (selectedGroupId === group.id) {
          setSelectedGroupId(null);
          setGroupDetail(null);
        }
        refresh();
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? "Failed to delete group");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Groups</h1>
          <p className="text-sm text-neutral-500">
            Click on any group to view all students, assignment completion matrix, and history
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + New Group
        </button>
      </div>

      {isLoading ? (
        <LoadingRows rows={4} />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          description="Create your first group to start organizing students."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => {
            const isSelected = selectedGroupId === g.id;
            return (
              <div
                key={g.id}
                onClick={() => navigate(`/teacher/groups/${g.id}`)}
                className="card cursor-pointer transition-all hover:shadow-md hover:border-brand-400 group"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-neutral-900 group-hover:text-brand-600 transition flex items-center gap-2">
                      {g.name}
                    </h3>
                    <p className="text-xs font-medium text-brand-600 uppercase tracking-wider">
                      {g.english_level.replace("_", " ")}
                    </p>
                  </div>
                </div>
                {g.schedule && <p className="mt-2 text-sm text-neutral-600">{g.schedule}</p>}
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-neutral-500 font-medium">
                    👥 {g.student_count} {g.student_count === 1 ? "student" : "students"}
                  </p>
                  <span className="text-xs text-brand-600 font-semibold group-hover:underline">View Group Details →</span>
                </div>
                <div className="mt-4 flex gap-4 border-t border-neutral-100 pt-3">
                  <button
                    className="text-sm font-medium text-brand-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(g);
                      setModalOpen(true);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-sm font-medium text-red-600 hover:underline"
                    onClick={(e) => handleDelete(g, e)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Group Detail / Student Overview Section */}
      {selectedGroupId && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
            <div>
              <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                <span>📚 {groupDetail?.name ?? "Group"} Overview</span>
                {groupDetail && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-800">
                    Level: {groupDetail.english_level.replace("_", " ")}
                  </span>
                )}
              </h2>
              <p className="text-sm text-neutral-500">
                Performance tracking: Completed (Green 100%), Incomplete (Red 0%), or Partial (Percentage). Click a student to view complete history.
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedGroupId(null);
                setGroupDetail(null);
              }}
              className="text-sm text-neutral-500 hover:text-neutral-800"
            >
              ✕ Close Overview
            </button>
          </div>

          {isLoadingDetail ? (
            <LoadingRows rows={5} />
          ) : !groupDetail || groupDetail.students.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-neutral-500">No students currently enrolled in this group.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 text-xs uppercase text-neutral-600 border-b border-neutral-200">
                  <tr>
                    <th className="px-4 py-3 sticky left-0 bg-neutral-50 z-10">Student</th>
                    <th className="px-3 py-3">Telegram</th>
                    <th className="px-3 py-3 text-center">⭐ Stars</th>
                    <th className="px-3 py-3 text-center">⚡ Lightning</th>
                    <th className="px-3 py-3 text-center">Overall</th>
                    {groupDetail.assignments.map((a) => (
                      <th key={a.id} className="px-3 py-3 min-w-[120px] text-center">
                        <div className="font-semibold truncate max-w-[140px]" title={a.title}>
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
                    <tr key={st.student_id} className="hover:bg-neutral-50/80 transition-colors">
                      <td className="px-4 py-3 sticky left-0 bg-white z-10 font-medium text-neutral-900 hover:text-brand-600 cursor-pointer"
                          onClick={() => viewStudentHistory(st.student_id)}>
                        <div className="flex items-center gap-1.5">
                          <span className="underline decoration-dotted">{st.full_name}</span>
                          <span className="text-xs text-neutral-400 font-normal">(@{st.username})</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-neutral-500 text-xs">
                        {st.telegram_username || "—"}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-amber-500">
                        ⭐ {st.total_stars}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-yellow-500">
                        ⚡ {st.total_lightning}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs ${
                            st.overall_completion_percentage >= 80
                              ? "bg-emerald-100 text-emerald-800"
                              : st.overall_completion_percentage >= 50
                              ? "bg-amber-100 text-amber-800"
                              : "bg-neutral-100 text-neutral-700"
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
                              className={`inline-flex items-center justify-center px-2 py-1 rounded text-xs font-semibold ${
                                isComplete
                                  ? "bg-emerald-500 text-white"
                                  : isZero
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-400 text-neutral-900"
                              }`}
                            >
                              {isComplete ? "✓ 100%" : isZero ? "0%" : `${pct}%`}
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
        </div>
      )}

      {/* Student History Modal */}
      <Modal
        open={!!historyStudentId}
        onClose={() => {
          setHistoryStudentId(null);
          setStudentHistory(null);
        }}
        title={`Student History: ${studentHistory?.full_name ?? "Loading..."}`}
      >
        {isLoadingHistory ? (
          <LoadingRows rows={4} />
        ) : !studentHistory ? (
          <p className="text-neutral-500">No student history available.</p>
        ) : (
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex items-center gap-3.5 bg-neutral-50 p-3.5 rounded-lg border border-neutral-200">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700 text-base">
                {studentHistory.full_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-neutral-900 text-base">{studentHistory.full_name}</h3>
                  <span className="text-xs text-neutral-500 font-mono">@{studentHistory.username}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-neutral-500 mt-1 flex-wrap">
                  <span>Telegram: <strong className="text-neutral-700">{studentHistory.telegram_username || "—"}</strong></span>
                  <span>Group: <strong className="text-brand-600">{studentHistory.group_name || "—"}</strong></span>
                  <span>Level: <strong className="capitalize text-neutral-700">{studentHistory.level?.replace("_", " ") || "—"}</strong></span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs font-semibold text-amber-500 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  ⭐ {studentHistory.total_stars} stars
                </span>
                <span className="text-xs font-semibold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded border border-yellow-200">
                  ⚡ {studentHistory.total_lightning} lightning
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-bold text-neutral-900">Task & Assignment History</h4>
              {studentHistory.history.length === 0 ? (
                <p className="text-xs text-neutral-500">No assignments assigned to this group yet.</p>
              ) : (
                studentHistory.history.map((h) => (
                  <div key={h.assignment_id} className="rounded-lg border border-neutral-200 p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-neutral-900 text-sm">{h.title}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          h.completion_percentage >= 100
                            ? "bg-emerald-100 text-emerald-800"
                            : h.completion_percentage > 0
                            ? "bg-amber-100 text-amber-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {h.completion_percentage}% Completed
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-neutral-500">
                      <span>Deadline: {new Date(h.deadline).toLocaleString()}</span>
                      <span>
                        Status: <strong className="text-neutral-700 capitalize">{h.submission_status || "Not submitted"}</strong>
                      </span>
                    </div>
                    {h.submitted_at && (
                      <div className="text-neutral-500">
                        Submitted at: {new Date(h.submitted_at).toLocaleString()}
                      </div>
                    )}
                    {h.score !== null && (
                      <div className="font-medium text-brand-600 flex items-center gap-3 pt-1 border-t border-neutral-100">
                        <span>Score: {h.score}/10</span>
                        <span>Stars: ⭐ +{h.stars_earned}</span>
                      </div>
                    )}
                    {h.feedback && (
                      <div className="text-neutral-600 italic bg-neutral-50 p-2 rounded">
                        Teacher Feedback: "{h.feedback}"
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>

      <GroupModal
        open={modalOpen}
        group={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          refresh();
        }}
      />
      <ConfirmDialog />
    </div>
  );
}

function GroupModal({
  open,
  group,
  onClose,
  onSaved,
}: {
  open: boolean;
  group: Group | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [level, setLevel] = useState(LEVELS[0]);
  const [schedule, setSchedule] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setName(group?.name ?? "");
    setLevel(group?.english_level ?? LEVELS[0]);
    setSchedule(group?.schedule ?? "");
  }, [group, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (group) {
        await updateGroup(group.id, { name, english_level: level, schedule });
      } else {
        await createGroup({ name, english_level: level, schedule });
      }
      toast.success(group ? "Group updated" : "Group created");
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save group");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={group ? "Edit Group" : "New Group"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Group name</label>
          <input required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Elementary A1" />
        </div>
        <div>
          <label className="label">English level</label>
          <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Schedule</label>
          <input className="input" value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Mon/Wed/Fri 16:00-17:30" />
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
