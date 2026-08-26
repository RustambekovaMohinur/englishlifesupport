import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, Modal, useConfirm } from "@/components/ui";
import { deleteStudent, listGroups, listStudents, updateStudent } from "@/services/lmsService";
import { Group, StudentListItem } from "@/types";

const PAGE_SIZE = 15;

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<StudentListItem | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    listGroups().then(setGroups).catch(() => {});
  }, []);

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

  function handleDelete(student: StudentListItem) {
    confirm(`Permanently delete student "${student.full_name}"? Their account, submissions, and progress will be purged.`, async () => {
      try {
        await deleteStudent(student.id);
        toast.success("Student deleted");
        refresh();
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? "Failed to delete student");
      }
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Students</h1>
        <p className="text-sm text-neutral-500">{total} total students</p>
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
                  <th className="pb-2 pr-4 font-medium">Stars</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} className="border-b border-neutral-50 last:border-0">
                    <td className="py-3 pr-4 font-medium text-neutral-800">{s.full_name}</td>
                    <td className="py-3 pr-4 text-neutral-500">{s.email}</td>
                    <td className="py-3 pr-4 text-neutral-600">{s.phone || "—"}</td>
                    <td className="py-3 pr-4 text-neutral-600">{s.group_name ?? "—"}</td>
                    <td className="py-3 pr-4 text-neutral-600">⭐ {s.total_stars}</td>
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
