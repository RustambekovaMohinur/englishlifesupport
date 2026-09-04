import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import StudentDetailModal from "@/components/StudentDetailModal";
import { EmptyState, LoadingRows, Modal, useConfirm } from "@/components/ui";
import {
  approveStudent,
  deleteStudent,
  getStudent,
  listGroups,
  listPendingStudents,
  listStudents,
  rejectStudent,
  updateStudent,
} from "@/services/lmsService";
import { Group, PendingStudentItem, StudentListItem, StudentOut } from "@/types";

const PAGE_SIZE = 15;

export default function StudentsPage() {
  const [activeTab, setActiveTab] = useState<"all" | "pending">("all");
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [pendingStudents, setPendingStudents] = useState<PendingStudentItem[]>([]);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingPageSize, setPendingPageSize] = useState(20);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingTotalPages, setPendingTotalPages] = useState(0);
  const [submittingIds, setSubmittingIds] = useState<Record<string, boolean>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<StudentListItem | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    listGroups().then(setGroups).catch(() => {});
    loadPending();
  }, []);

  useEffect(() => {
    if (activeTab === "pending") {
      loadPending();
    }
  }, [pendingPage, pendingPageSize]);

  function loadPending() {
    setIsLoadingPending(true);
    listPendingStudents({ page: pendingPage, page_size: pendingPageSize })
      .then((res) => {
        setPendingStudents(res.items);
        setPendingTotal(res.total);
        setPendingTotalPages(res.total_pages);
      })
      .catch((err) => {
        const code = err?.response?.data?.error?.code;
        if (code === "TEACHER_REQUIRED") {
          toast.error("Teacher access required");
        } else if (code === "AUTHENTICATION_REQUIRED") {
          toast.error("Authentication required");
        }
      })
      .finally(() => setIsLoadingPending(false));
  }

  function handleApprovalError(err: any, fallback: string) {
    const errObj = err?.response?.data?.error;
    const code = errObj?.code;
    const message = errObj?.message || err?.response?.data?.detail || fallback;
    if (code === "ALREADY_APPROVED") {
      toast.error("Student is already approved.");
      loadPending();
    } else if (code === "ALREADY_REJECTED") {
      toast.error("Student is already rejected.");
      loadPending();
    } else if (code === "STUDENT_NOT_FOUND") {
      toast.error("Student not found or not in your group.");
      loadPending();
    } else if (code === "TEACHER_REQUIRED") {
      toast.error("Teacher access required.");
    } else if (code === "AUTHENTICATION_REQUIRED") {
      toast.error("Authentication required.");
    } else {
      toast.error(message);
    }
  }

  function refresh() {
    setIsLoading(true);
    listStudents({
      search: search || undefined,
      group_id: groupFilter || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((res) => {
        setStudents(res.items);
        setTotal(res.total);
      })
      .catch(() => toast.error("Failed to load students"))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    const timeout = setTimeout(refresh, 300);
    return () => clearTimeout(timeout);
  }, [search, groupFilter, page]);

  async function onApprove(student: PendingStudentItem) {
    if (submittingIds[student.id]) return;
    setSubmittingIds((prev) => ({ ...prev, [student.id]: true }));
    try {
      const res = await approveStudent(student.id);
      toast.success(res.message || `Approved ${student.first_name} ${student.last_name}`.trim());
      setPendingStudents((prev) => prev.filter((s) => s.id !== student.id));
      setPendingTotal((prev) => Math.max(0, prev - 1));
      if (pendingStudents.length <= 1 && pendingPage > 1) {
        setPendingPage((p) => p - 1);
      } else {
        loadPending();
      }
      refresh();
    } catch (err: any) {
      handleApprovalError(err, "Failed to approve student");
    } finally {
      setSubmittingIds((prev) => ({ ...prev, [student.id]: false }));
    }
  }

  async function onReject(student: PendingStudentItem) {
    if (submittingIds[student.id]) return;
    const fullName = `${student.first_name} ${student.last_name}`.trim() || student.username;
    confirm(`Reject registration request for "${fullName}"?`, async () => {
      setSubmittingIds((prev) => ({ ...prev, [student.id]: true }));
      try {
        const res = await rejectStudent(student.id);
        toast.success(res.message || `Rejected ${fullName}`);
        setPendingStudents((prev) => prev.filter((s) => s.id !== student.id));
        setPendingTotal((prev) => Math.max(0, prev - 1));
        if (pendingStudents.length <= 1 && pendingPage > 1) {
          setPendingPage((p) => p - 1);
        } else {
          loadPending();
        }
        refresh();
      } catch (err: any) {
        handleApprovalError(err, "Failed to reject student");
      } finally {
        setSubmittingIds((prev) => ({ ...prev, [student.id]: false }));
      }
    });
  }

  function handleDelete(student: StudentListItem) {
    confirm(`Permanently delete student "${student.full_name}"? Their account, submissions, and progress will be purged.`, async () => {
      try {
        await deleteStudent(student.id);
        toast.success("Student deleted");
        refresh();
        loadPending();
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? "Failed to delete student");
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Students</h1>
          <p className="text-sm text-neutral-500">Manage enrolled students and approval requests</p>
        </div>
        <div className="flex gap-2 border border-neutral-200 bg-neutral-100 p-1 rounded-lg text-sm">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-md font-medium transition-all ${
              activeTab === "all" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            All Students ({total})
          </button>
          <button
            onClick={() => {
              setActiveTab("pending");
              loadPending();
            }}
            className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "pending" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            <span>Pending Approvals</span>
            {pendingStudents.length > 0 && (
              <span className="bg-amber-500 text-white text-[11px] font-bold px-1.5 py-0.2 rounded-full">
                {pendingStudents.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="input max-w-xs"
          placeholder="Search by name or username..."
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
        <select
          className="input max-w-[180px]"
          value={groupFilter}
          onChange={(e) => {
            setPage(1);
            setGroupFilter(e.target.value);
          }}
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {activeTab === "pending" ? (
        <div className="card overflow-x-auto">
          {isLoadingPending ? (
            <LoadingRows rows={4} />
          ) : pendingStudents.length === 0 ? (
            <EmptyState
              title="No pending requests"
              description="New student registrations requiring teacher approval will show up here."
            />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-left text-neutral-500">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Username</th>
                    <th className="pb-2 pr-4 font-medium">Telegram</th>
                    <th className="pb-2 pr-4 font-medium">Group</th>
                    <th className="pb-2 pr-4 font-medium">Level</th>
                    <th className="pb-2 pr-4 font-medium">Registered</th>
                    <th className="pb-2 font-medium text-right">Approval Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingStudents.map((s) => (
                    <tr key={s.id} className="border-b border-neutral-50 last:border-0">
                      <td className="py-3 pr-4 font-medium text-neutral-800">
                        {`${s.first_name || ""} ${s.last_name || ""}`.trim() || s.username}
                      </td>
                      <td className="py-3 pr-4 text-neutral-600 font-mono text-xs">{s.username}</td>
                      <td className="py-3 pr-4 text-neutral-600">{s.telegram_username || "—"}</td>
                      <td className="py-3 pr-4 font-medium text-brand-600">{s.group_name ?? "—"}</td>
                      <td className="py-3 pr-4 text-neutral-600 capitalize">{s.english_level?.replace("_", " ") ?? "—"}</td>
                      <td className="py-3 pr-4 text-neutral-400 text-xs">
                        {s.created_at ? new Date(s.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 text-right space-x-2">
                        <button
                          disabled={submittingIds[s.id]}
                          className="px-3 py-1 bg-emerald-600 text-white text-xs font-semibold rounded hover:bg-emerald-700 disabled:opacity-50 transition"
                          onClick={() => onApprove(s)}
                        >
                          {submittingIds[s.id] ? "..." : "✓ Approve"}
                        </button>
                        <button
                          disabled={submittingIds[s.id]}
                          className="px-3 py-1 bg-rose-50 text-rose-700 text-xs font-semibold rounded hover:bg-rose-100 disabled:opacity-50 transition border border-rose-200"
                          onClick={() => onReject(s)}
                        >
                          {submittingIds[s.id] ? "..." : "✕ Reject"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination Controls for Pending Approvals */}
              <div className="flex flex-wrap items-center justify-between border-t border-neutral-100 pt-4 mt-4 gap-3">
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>Students per page:</span>
                  <select
                    value={pendingPageSize}
                    onChange={(e) => {
                      const newSize = Math.min(100, Math.max(1, Number(e.target.value)));
                      setPendingPageSize(newSize);
                      setPendingPage(1);
                    }}
                    className="border border-neutral-200 rounded px-2 py-1 text-xs bg-white"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-neutral-500">
                    Page {pendingPage} of {Math.max(1, pendingTotalPages)} ({pendingTotal} pending)
                  </span>
                  <div className="flex gap-1">
                    <button
                      disabled={pendingPage <= 1}
                      onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 text-xs font-medium border border-neutral-200 rounded hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      disabled={pendingPage >= pendingTotalPages || pendingTotalPages === 0}
                      onClick={() => setPendingPage((p) => p + 1)}
                      className="px-2.5 py-1 text-xs font-medium border border-neutral-200 rounded hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          {isLoading ? (
            <LoadingRows rows={8} />
          ) : students.length === 0 ? (
            <EmptyState title="No students found" description="Try adjusting your search or filters." />
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 text-left text-neutral-500">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Username</th>
                    <th className="pb-2 pr-4 font-medium">Telegram</th>
                    <th className="pb-2 pr-4 font-medium">Group</th>
                    <th className="pb-2 pr-4 font-medium">Level</th>
                    <th className="pb-2 pr-4 font-medium text-center">⭐ Stars</th>
                    <th className="pb-2 pr-4 font-medium text-center">⚡ Lightning</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} className="border-b border-neutral-50 last:border-0">
                      <td
                        className="py-3 pr-4 font-medium text-neutral-800 hover:text-brand-600 cursor-pointer underline decoration-dotted"
                        onClick={() => setSelectedStudentId(s.id)}
                      >
                        {s.full_name}
                      </td>
                      <td className="py-3 pr-4 text-neutral-500 font-mono text-xs">{s.username || s.email}</td>
                      <td className="py-3 pr-4 text-neutral-600">{s.phone || s.telegram_username || "—"}</td>
                      <td className="py-3 pr-4 text-neutral-600 font-medium">{s.group_name ?? "—"}</td>
                      <td className="py-3 pr-4 text-neutral-500 capitalize">{s.level?.replace("_", " ") ?? "—"}</td>
                      <td className="py-3 pr-4 text-center font-medium text-amber-500">⭐ {s.total_stars}</td>
                      <td className="py-3 pr-4 text-center font-medium text-yellow-500">⚡ {s.total_lightning ?? 0}</td>
                      <td className="py-3 space-x-3">
                        <button className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setEditing(s)}>
                          Edit
                        </button>
                        <button
                          className="text-sm font-medium text-red-600 hover:underline"
                          onClick={() => handleDelete(s)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="space-x-2">
                  <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </button>
                  <button className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Student Detail Modal with real backend API data */}
      <StudentDetailModal
        studentId={selectedStudentId}
        onClose={() => setSelectedStudentId(null)}
      />

      <EditStudentModal
        student={editing}
        groups={groups}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
      <ConfirmDialog />
    </div>
  );
}

function EditStudentModal({
  student,
  groups,
  onClose,
  onSaved,
}: {
  student: StudentListItem | null;
  groups: Group[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [groupId, setGroupId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (student) {
      setFullName(student.full_name);
      setPhone(student.phone ?? "");
      setGroupId(groups.find((g) => g.name === student.group_name)?.id ?? "");
    }
  }, [student, groups]);

  if (!student) return null;

  async function save() {
    setIsSaving(true);
    try {
      await updateStudent(student!.id, {
        full_name: fullName,
        phone: phone || undefined,
        group_id: groupId || null,
      });
      toast.success("Student updated");
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to update student");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={!!student} onClose={onClose} title="Edit Student">
      <div className="space-y-4">
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="label">Telegram Contact</label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="@username or +998..."
          />
        </div>
        <div>
          <label className="label">Group</label>
          <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={isSaving} onClick={save}>
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
