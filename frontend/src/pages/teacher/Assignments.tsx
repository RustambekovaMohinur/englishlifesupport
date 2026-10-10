import { FormEvent, useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, Modal, useConfirm } from "@/components/ui";
import { createAssignment, deleteAssignment, listAssignments, listGroups } from "@/services/lmsService";
import { AssignmentOut, Group } from "@/types";

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentOut[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    listGroups().then(setGroups).catch(() => {});
  }, []);

  function refresh() {
    setIsLoading(true);
    listAssignments(groupFilter || undefined)
      .then(setAssignments)
      .catch(() => toast.error("Failed to load assignments"))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, [groupFilter]);

  function handleDelete(a: AssignmentOut) {
    confirm(`Delete "${a.title}"? All related submissions and grades will be removed.`, async () => {
      try {
        await deleteAssignment(a.id);
        toast.success("Assignment deleted");
        refresh();
      } catch {
        toast.error("Failed to delete assignment");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Assignments</h1>
          <p className="text-sm text-neutral-500">Create and manage homework assignments</p>
        </div>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          + New Assignment
        </button>
      </div>

      <select className="input max-w-[220px]" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
        <option value="">All groups</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : assignments.length === 0 ? (
        <EmptyState title="No assignments yet" description="Create your first assignment for a group." />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <div key={a.id} className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-neutral-900">{a.title}</p>
                <p className="text-sm text-neutral-500">
                  {a.group_name} · Due {format(new Date(a.deadline), "MMM d, yyyy HH:mm")} · {a.submission_count} submissions
                </p>
              </div>
              <button className="text-sm font-medium text-red-600 hover:underline" onClick={() => handleDelete(a)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <NewAssignmentModal
        open={modalOpen}
        groups={groups}
        onClose={() => setModalOpen(false)}
        onCreated={() => {
          setModalOpen(false);
          refresh();
        }}
      />
      <ConfirmDialog />
    </div>
  );
}

function NewAssignmentModal({
  open,
  groups,
  onClose,
  onCreated,
}: {
  open: boolean;
  groups: Group[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [groupId, setGroupId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setGroupId(groups[0]?.id ?? "");
      setTitle("");
      setDescription("");
      setDeadline("");
    }
  }, [open, groups]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      await createAssignment({ group_id: groupId, title, description, deadline: new Date(deadline).toISOString() });
      toast.success("Assignment created");
      onCreated();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to create assignment");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Assignment">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Group</label>
          <select required className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="" disabled>
              Select a group
            </option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Title</label>
          <input required className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Description / instructions</label>
          <textarea required rows={4} className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label">Deadline</label>
          <input required type="datetime-local" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={isSaving || !groupId} className="btn-primary">
            {isSaving ? "Creating..." : "Create assignment"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
