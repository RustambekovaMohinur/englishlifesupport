import { FC, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  BookOpen,
  Heart,
  Lock,
  MessageSquare,
  Plus,
  Share2,
  Trash2,
  UserCheck,
  Users,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";

import { EmptyState, LoadingRows } from "@/components/ui";
import { UserAvatar } from "@/components/common/UserAvatar";
import { PremiumBadge } from "@/components/PremiumBadge";
import {
  createPublicNote,
  createStudyGroup,
  deletePublicNote,
  getMyPremiumStatus,
  joinStudyGroup,
  leaveStudyGroup,
  listPublicNotes,
  listStudyGroups,
  toggleNoteLike,
} from "@/services/lmsService";
import {
  PremiumStatusOut,
  PublicNoteCreate,
  PublicNoteOut,
  StudyGroupCreate,
  StudyGroupOut,
} from "@/types";

const CATEGORIES = [
  { id: "all", label: "All Topics" },
  { id: "grammar", label: "Grammar" },
  { id: "vocabulary", label: "Vocabulary" },
  { id: "exam_prep", label: "IELTS / Exam" },
  { id: "writing", label: "Writing Tips" },
  { id: "general", label: "General" },
];

export default function SocialHubPage() {
  const [activeTab, setActiveTab] = useState<"notes" | "groups">("notes");
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatusOut | null>(null);

  // Notes state
  const [notes, setNotes] = useState<PublicNoteOut[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteForm, setNoteForm] = useState<PublicNoteCreate>({
    title: "",
    content: "",
    category: "general",
  });
  const [submittingNote, setSubmittingNote] = useState(false);

  // Groups state
  const [groups, setGroups] = useState<StudyGroupOut[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [groupForm, setGroupForm] = useState<StudyGroupCreate>({
    name: "",
    description: "",
    topic: "IELTS / Speaking Club",
    max_members: 8,
  });
  const [submittingGroup, setSubmittingGroup] = useState(false);

  useEffect(() => {
    getMyPremiumStatus()
      .then(setPremiumStatus)
      .catch(() => {});
  }, []);

  const loadNotes = async () => {
    setLoadingNotes(true);
    try {
      const data = await listPublicNotes(
        selectedCategory !== "all" ? { category: selectedCategory } : undefined
      );
      setNotes(data);
    } catch {
      toast.error("Failed to load community notes");
    } finally {
      setLoadingNotes(false);
    }
  };

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const data = await listStudyGroups();
      setGroups(data);
    } catch {
      toast.error("Failed to load study groups");
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    if (activeTab === "notes") {
      loadNotes();
    } else {
      loadGroups();
    }
  }, [activeTab, selectedCategory]);

  // Note actions
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteForm.title.trim() || !noteForm.content.trim()) {
      toast.error("Please fill in both title and content.");
      return;
    }
    setSubmittingNote(true);
    try {
      const newNote = await createPublicNote(noteForm);
      setNotes((prev) => [newNote, ...prev]);
      setIsNoteModalOpen(false);
      setNoteForm({ title: "", content: "", category: "general" });
      toast.success("Study note published to community! 🚀");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to publish note");
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleToggleLike = async (noteId: string) => {
    try {
      const res = await toggleNoteLike(noteId);
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId
            ? { ...n, has_liked: res.liked, likes_count: res.likes_count }
            : n
        )
      );
    } catch {
      toast.error("Failed to update like");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm("Are you sure you want to delete this note?")) return;
    try {
      await deletePublicNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      toast.success("Note deleted");
    } catch {
      toast.error("Failed to delete note");
    }
  };

  // Group actions
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name.trim()) {
      toast.error("Group name is required");
      return;
    }
    setSubmittingGroup(true);
    try {
      const newGroup = await createStudyGroup(groupForm);
      setGroups((prev) => [newGroup, ...prev]);
      setIsGroupModalOpen(false);
      setGroupForm({
        name: "",
        description: "",
        topic: "IELTS / Speaking Club",
        max_members: 8,
      });
      toast.success("Study group created! 🎉");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to create group");
    } finally {
      setSubmittingGroup(false);
    }
  };

  const handleJoinGroup = async (groupId?: string, inviteCode?: string) => {
    try {
      const res = await joinStudyGroup({
        group_id: groupId,
        invite_code: inviteCode,
      });
      toast.success(res.message);
      setInviteCodeInput("");
      loadGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to join group");
    }
  };

  const handleLeaveGroup = async (groupId: string) => {
    if (!window.confirm("Leave this study group?")) return;
    try {
      const res = await leaveStudyGroup(groupId);
      toast.success(res.message);
      loadGroups();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to leave group");
    }
  };

  const canWriteNotes = Boolean(premiumStatus?.can_write_notes);
  const canCreateGroups = Boolean(premiumStatus?.can_create_groups);

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
            <span>🌐</span>
            <span>Social & Community Ecosystem</span>
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Exchange revision notes (Zametka) and collaborate in student study groups.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex rounded-xl bg-zinc-100 dark:bg-zinc-800/80 p-1 self-start sm:self-auto border border-black/[0.05] dark:border-white/[0.05]">
          <button
            onClick={() => setActiveTab("notes")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === "notes"
                ? "bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <BookOpen size={14} />
            <span>Public Notes</span>
          </button>
          <button
            onClick={() => setActiveTab("groups")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              activeTab === "groups"
                ? "bg-white dark:bg-zinc-900 text-purple-600 dark:text-purple-400 shadow-xs"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Users size={14} />
            <span>Study Groups</span>
          </button>
        </div>
      </div>

      {/* ─── TAB 1: PUBLIC NOTES ────────────────────────────────────────── */}
      {activeTab === "notes" && (
        <div className="space-y-6">
          {/* Action Row & Category Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                    selectedCategory === cat.id
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {canWriteNotes ? (
              <button
                onClick={() => setIsNoteModalOpen(true)}
                className="btn-primary text-xs py-2 self-start sm:self-auto cursor-pointer"
              >
                <Plus size={14} />
                <span>Write Study Note</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
                <Lock size={12} />
                <span>Posting notes requires Standard (⭐ 19k) plan</span>
              </div>
            )}
          </div>

          {/* Notes List */}
          {loadingNotes ? (
            <LoadingRows rows={3} />
          ) : notes.length === 0 ? (
            <EmptyState
              title="No public notes yet"
              description="Be the first premium student to share revision notes with the community!"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {notes.map((note) => {
                const isAuthor = premiumStatus?.student_id === note.author.id;
                return (
                  <div
                    key={note.id}
                    className="card flex flex-col justify-between hover:border-blue-500/30 transition-all duration-200 group"
                  >
                    <div className="space-y-3">
                      {/* Author Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar
                            src={note.author.avatar_url}
                            name={note.author.full_name}
                            size="sm"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                {note.author.full_name}
                              </span>
                              <PremiumBadge
                                plan={note.author.premium_plan}
                                custom_badge={note.author.custom_badge}
                              />
                            </div>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              {format(new Date(note.created_at), "MMM d, yyyy")}
                            </span>
                          </div>
                        </div>

                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40">
                          {note.category}
                        </span>
                      </div>

                      {/* Content */}
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-white mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                          {note.title}
                        </h3>
                        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                          {note.content}
                        </p>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                      <button
                        onClick={() => handleToggleLike(note.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition active:scale-95 ${
                          note.has_liked
                            ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 font-semibold"
                            : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <Heart
                          size={14}
                          className={note.has_liked ? "fill-rose-500 text-rose-500" : ""}
                        />
                        <span>{note.likes_count}</span>
                      </button>

                      {isAuthor && (
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 text-zinc-400 hover:text-rose-500 transition"
                          title="Delete note"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: STUDY GROUPS ────────────────────────────────────────── */}
      {activeTab === "groups" && (
        <div className="space-y-6">
          {/* Group Header & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Enter invite code..."
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                maxLength={8}
                className="input text-xs py-2 w-44 uppercase font-mono"
              />
              <button
                onClick={() => handleJoinGroup(undefined, inviteCodeInput)}
                disabled={!inviteCodeInput.trim()}
                className="btn-secondary text-xs py-2"
              >
                Join with Code
              </button>
            </div>

            {canCreateGroups ? (
              <button
                onClick={() => setIsGroupModalOpen(true)}
                className="btn-primary text-xs py-2 self-start sm:self-auto cursor-pointer"
              >
                <Plus size={14} />
                <span>Create Study Group</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400 text-xs">
                <Sparkles size={13} />
                <span>Creating study groups requires Pro VIP (👑 29k) plan</span>
              </div>
            )}
          </div>

          {/* Groups Grid */}
          {loadingGroups ? (
            <LoadingRows rows={3} />
          ) : groups.length === 0 ? (
            <EmptyState
              title="No active study groups"
              description="Pro VIP students can create custom study groups for collaborative learning!"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="card flex flex-col justify-between hover:border-purple-500/30 transition-all duration-200"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900/40">
                          {group.topic}
                        </span>
                        <h3 className="text-base font-bold text-zinc-900 dark:text-white mt-1.5">
                          {group.name}
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-zinc-400 font-semibold">
                        {group.member_count}/{group.max_members} 👥
                      </span>
                    </div>

                    <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed min-h-[38px]">
                      {group.description || "No description provided."}
                    </p>

                    {/* Creator info */}
                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
                      <span>Created by:</span>
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {group.creator.full_name}
                      </span>
                      <PremiumBadge
                        plan={group.creator.premium_plan}
                        custom_badge={group.creator.custom_badge}
                      />
                    </div>

                    {/* Member Avatars */}
                    {group.members.length > 0 && (
                      <div className="flex items-center gap-1 pt-1">
                        {group.members.slice(0, 5).map((m) => (
                          <div key={m.student_id} title={m.full_name}>
                            <UserAvatar src={m.avatar_url} name={m.full_name} size="xs" />
                          </div>
                        ))}
                        {group.members.length > 5 && (
                          <span className="text-[10px] text-zinc-400 font-bold ml-1">
                            +{group.members.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] text-zinc-400">
                      Code: <b className="text-zinc-700 dark:text-zinc-300">{group.invite_code}</b>
                    </span>

                    {group.is_member ? (
                      <button
                        onClick={() => handleLeaveGroup(group.id)}
                        className="text-xs text-rose-500 hover:text-rose-600 font-medium transition cursor-pointer"
                      >
                        Leave Group
                      </button>
                    ) : (
                      <button
                        onClick={() => handleJoinGroup(group.id)}
                        disabled={group.member_count >= group.max_members}
                        className="btn-primary text-xs py-1.5 px-3 cursor-pointer disabled:opacity-50"
                      >
                        {group.member_count >= group.max_members ? "Full" : "Join"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL: CREATE PUBLIC NOTE ──────────────────────────────────── */}
      {isNoteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="card w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <span>✍️</span>
              <span>Post Community Revision Note</span>
            </h2>

            <form onSubmit={handleCreateNote} className="space-y-3">
              <div>
                <label className="label">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Conditionals summary with examples"
                  value={noteForm.title}
                  onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="label">Category</label>
                <select
                  value={noteForm.category}
                  onChange={(e) => setNoteForm({ ...noteForm, category: e.target.value })}
                  className="input text-sm"
                >
                  <option value="grammar">Grammar</option>
                  <option value="vocabulary">Vocabulary</option>
                  <option value="exam_prep">IELTS / Exam Prep</option>
                  <option value="writing">Writing Tips</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div>
                <label className="label">Content / Rules / Notes</label>
                <textarea
                  required
                  rows={6}
                  placeholder="Share grammar formulas, collocations, mnemonics, or test-taking advice..."
                  value={noteForm.content}
                  onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
                  className="input text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNoteModalOpen(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingNote}
                  className="btn-primary text-xs"
                >
                  {submittingNote ? "Publishing..." : "Publish Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: CREATE STUDY GROUP ─────────────────────────────────── */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="card w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
              <span>👑</span>
              <span>Create Custom Study Group</span>
            </h2>

            <form onSubmit={handleCreateGroup} className="space-y-3">
              <div>
                <label className="label">Group Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Band 7.5 IELTS Speaking Squad"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="label">Topic / Focus</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IELTS / Pronunciation / Daily Practice"
                  value={groupForm.topic}
                  onChange={(e) => setGroupForm({ ...groupForm, topic: e.target.value })}
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="label">Description & Meeting Goals</label>
                <textarea
                  rows={3}
                  placeholder="What will group members practice together?"
                  value={groupForm.description}
                  onChange={(e) =>
                    setGroupForm({ ...groupForm, description: e.target.value })
                  }
                  className="input text-sm"
                />
              </div>

              <div>
                <label className="label">Max Members (2 - 50)</label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={groupForm.max_members}
                  onChange={(e) =>
                    setGroupForm({ ...groupForm, max_members: Number(e.target.value) })
                  }
                  className="input text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingGroup}
                  className="btn-primary text-xs"
                >
                  {submittingGroup ? "Creating..." : "Create Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
