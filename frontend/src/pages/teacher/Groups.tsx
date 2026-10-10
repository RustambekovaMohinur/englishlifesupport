import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, Modal, StatusBadge, useConfirm } from "@/components/ui";
import { createGroup, deleteGroup, listGroups, sendGroupReminders, updateGroup } from "@/services/lmsService";
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
    listGroups()
      .then(setGroups)
      .catch(() => toast.error("Failed to load groups"))
      .finally(() => setIsLoading(false));
  }

  useEffect(refresh, []);

  function handleDeactivate(group: Group) {
    confirm(`Deactivate group "${group.name}"? Its assignments will be preserved.`, async () => {
      try {
        await deleteGroup(group.id);
        toast.success("Group deactivated");
        refresh();
      } catch {
        toast.error("Failed to deactivate group");
      }
    });
  }

  async function handleSyncReminders(group: Group) {
    try {
      const response = await sendGroupReminders(group.id);
      toast.success(`Sent reminders to ${response.sent} student(s)`);
    } catch {
      toast.error("Failed to send Telegram reminders");
    }
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
        <EmptyState title="No groups yet" description="Create your first group to start organizing students." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.id} className={g.telegram_chat_id ? "card border-sky-100 bg-gradient-to-br from-sky-50/40 to-white" : "card"}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-neutral-900">{g.name}</h3>
                  <p className="text-xs text-neutral-500">{g.english_level.replace("_", " ")}</p>
                </div>
                <StatusBadge status={g.is_active ? "active" : "inactive"} />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {g.telegram_chat_id ? (
                  <span className={`telegram-pill ${g.telegram_sync_enabled ? "" : "inactive"}`}>
                    {g.telegram_sync_enabled ? "Telegram synced" : "Telegram paused"}
                  </span>
                ) : (
                  <span className="telegram-pill inactive">Telegram not linked</span>
                )}
              </div>

              {g.schedule && <p className="mt-3 text-sm text-neutral-600">{g.schedule}</p>}
              {g.telegram_chat_id && <p className="mt-2 text-xs text-sky-700">Chat: {g.telegram_chat_id}</p>}
              <p className="mt-2 text-sm text-neutral-500">{g.student_count} students</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="text-sm font-medium text-brand-600 hover:underline"
                  onClick={() => {
                    setEditing(g);
                    setModalOpen(true);
                  }}
                >
                  Edit
                </button>
                {g.telegram_chat_id && (
                  <button className="text-sm font-medium text-sky-700 hover:underline" onClick={() => handleSyncReminders(g)}>
                    Send reminder
                  </button>
                )}
                {g.is_active && (
                  <button className="text-sm font-medium text-neutral-500 hover:underline" onClick={() => handleDeactivate(g)}>
                    Deactivate
                  </button>
                )}
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
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramChatTitle, setTelegramChatTitle] = useState("");
  const [telegramSyncEnabled, setTelegramSyncEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setName(group?.name ?? "");
    setLevel(group?.english_level ?? LEVELS[0]);
    setSchedule(group?.schedule ?? "");
    setTelegramChatId(group?.telegram_chat_id ?? "");
    setTelegramChatTitle(group?.telegram_chat_title ?? "");
    setTelegramSyncEnabled(Boolean(group?.telegram_sync_enabled));
  }, [group, open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {
        name,
        english_level: level,
        schedule,
        telegram_chat_id: telegramChatId || undefined,
        telegram_chat_title: telegramChatTitle || undefined,
        telegram_sync_enabled: telegramSyncEnabled,
      };

      if (group) {
        await updateGroup(group.id, payload);
      } else {
        await createGroup(payload);
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
        <div className="bot-panel">
          <p className="text-sm font-semibold text-sky-700">Telegram automation</p>
          <p className="mt-1 text-xs text-sky-600">Link a course group to a Telegram chat to automate task drops and reminders.</p>
        </div>
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
        <div>
          <label className="label">Telegram chat ID</label>
          <input className="input" value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} placeholder="-1001234567890" />
        </div>
        <div>
          <label className="label">Telegram title</label>
          <input className="input" value={telegramChatTitle} onChange={(e) => setTelegramChatTitle(e.target.value)} placeholder="Elementary A1 group" />
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={telegramSyncEnabled} onChange={(e) => setTelegramSyncEnabled(e.target.checked)} />
          Enable Telegram sync for this group
        </label>
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
