import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, Modal, useConfirm } from "@/components/ui";
import { createGroup, deleteGroup, listGroups, updateGroup } from "@/services/lmsService";
import { Group } from "@/types";

const LEVELS = [
  "beginner",
  "elementary",
  "pre_intermediate",
  "intermediate",
  "upper_intermediate",
  "advanced",
];

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
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

  function handleDelete(group: Group) {
    confirm(`Permanently delete group "${group.name}"? This action cannot be undone.`, async () => {
      try {
        await deleteGroup(group.id);
        toast.success("Group deleted");
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
          <p className="text-sm text-neutral-500">Manage class groups and schedules</p>
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
          {groups.map((g) => (
            <div key={g.id} className="card">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-neutral-900">{g.name}</h3>
                  <p className="text-xs text-neutral-500">{g.english_level.replace("_", " ")}</p>
                </div>
              </div>
              {g.schedule && <p className="mt-2 text-sm text-neutral-600">{g.schedule}</p>}
              <p className="mt-2 text-sm text-neutral-500">{g.student_count} students</p>
              <div className="mt-4 flex gap-4 border-t border-neutral-100 pt-3">
                <button
                  className="text-sm font-medium text-brand-600 hover:underline"
                  onClick={() => {
                    setEditing(g);
                    setModalOpen(true);
                  }}
                >
                  Edit
                </button>
                <button
                  className="text-sm font-medium text-red-600 hover:underline"
                  onClick={() => handleDelete(g)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
