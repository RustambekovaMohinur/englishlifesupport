import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import {
  MessageSquare,
  Send,
  X,
  Loader2,
  ShieldCheck,
  Heart,
  Edit2,
  Trash2,
  Check,
} from "lucide-react";
import toast from "react-hot-toast";
import { AssignmentComment } from "@/types";
import { useAuth } from "@/hooks/useAuth";
import {
  getAssignmentComments,
  addAssignmentComment,
  updateAssignmentComment,
  deleteAssignmentComment,
  toggleLikeAssignmentComment,
} from "@/services/lmsService";
import { UserAvatar } from "@/components/common/UserAvatar";

interface Props {
  assignmentId: string;
  assignmentTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onCommentAdded?: () => void;
}

export function AssignmentDiscussionDrawer({
  assignmentId,
  assignmentTitle,
  isOpen,
  onClose,
  onCommentAdded,
}: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<AssignmentComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete & like loading states
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && assignmentId) {
      loadComments();
    }
  }, [isOpen, assignmentId]);

  function loadComments() {
    setLoading(true);
    getAssignmentComments(assignmentId)
      .then((data) => {
        // Enforce in-state deduplication
        const unique = Array.from(new Map(data.map((c) => [c.id, c])).values());
        setComments(unique);
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 100);
      })
      .catch(() => toast.error("Failed to load questions"))
      .finally(() => setLoading(false));
  }

  async function handleSend() {
    const clean = text.trim();
    if (!clean || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await addAssignmentComment(assignmentId, clean);
      setComments((prev) => {
        // Enforce strict uniqueness in state
        const next = [...prev.filter((c) => c.id !== created.id), created];
        return Array.from(new Map(next.map((c) => [c.id, c])).values());
      });
      setText("");
      if (onCommentAdded) onCommentAdded();
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 50);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Could not post question");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveEdit(commentId: string) {
    const clean = editText.trim();
    if (!clean || savingEdit) return;

    setSavingEdit(true);
    try {
      const updated = await updateAssignmentComment(assignmentId, commentId, clean);
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      setEditingCommentId(null);
      setEditText("");
      toast.success("Comment updated");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Could not update comment");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm("Are you sure you want to delete this comment?")) return;

    setDeletingId(commentId);
    try {
      await deleteAssignmentComment(assignmentId, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast.success("Comment deleted");
      if (onCommentAdded) onCommentAdded();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Could not delete comment");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleToggleLike(commentId: string) {
    if (likingId) return;

    setLikingId(commentId);
    try {
      const updated = await toggleLikeAssignmentComment(assignmentId, commentId);
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Could not like comment");
    } finally {
      setLikingId(null);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative z-10 flex flex-col w-full max-w-md bg-white dark:bg-[#161B22] border-l border-zinc-200 dark:border-zinc-800 shadow-2xl h-full animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
              <h3 className="font-bold text-sm text-zinc-900 dark:text-white truncate">
                Task Q&A Discussion
              </h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
              {assignmentTitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition active:scale-95"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Feed */}
        <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2">
              <div className="w-12 h-12 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto text-xl">
                💬
              </div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                No questions yet
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xs mx-auto">
                Have a question about this assignment or instructions? Ask here and your instructor or classmates will respond!
              </p>
            </div>
          ) : (
            comments.map((c) => {
              const isInstructor = c.user_role === "teacher";
              const authorName = c.user_name || c.user_full_name || "User";
              const isAuthor = user?.id === c.user_id;
              const isTeacher = user?.role === "teacher";
              const canDelete = isAuthor || isTeacher;
              const isEditing = editingCommentId === c.id;

              return (
                <div
                  key={c.id}
                  className={`p-3 rounded-xl border text-xs transition-all ${
                    isInstructor
                      ? "bg-brand-50/60 dark:bg-brand-950/30 border-brand-200 dark:border-brand-800/60"
                      : "bg-zinc-50 dark:bg-zinc-850 border-zinc-200/80 dark:border-zinc-800"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <UserAvatar
                        src={c.avatar_url || c.user_avatar_url}
                        name={authorName}
                        size="xs"
                      />
                      <span className="font-semibold text-zinc-900 dark:text-white truncate">
                        {authorName}
                      </span>
                      {isInstructor && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 border border-brand-300 dark:border-brand-700 shrink-0">
                          <ShieldCheck className="w-3 h-3" /> Instructor
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {c.updated_at && (
                        <span className="text-[10px] text-zinc-400 italic">
                          (edited)
                        </span>
                      )}
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                        {format(new Date(c.created_at), "MMM d, HH:mm")}
                      </span>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2 mt-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                        className="input text-xs w-full py-1.5 resize-none bg-white dark:bg-zinc-900"
                      />
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCommentId(null);
                            setEditText("");
                          }}
                          className="px-2 py-1 rounded text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(c.id)}
                          disabled={!editText.trim() || savingEdit}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-brand-600 hover:bg-brand-500 text-white text-[11px] font-semibold disabled:opacity-50 transition active:scale-95"
                        >
                          {savingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                      {c.content}
                    </p>
                  )}

                  {/* Comment Action Toolbar: Like, Edit, Delete */}
                  {!isEditing && (
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-black/[0.04] dark:border-white/[0.04]">
                      <button
                        type="button"
                        onClick={() => handleToggleLike(c.id)}
                        disabled={likingId === c.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition active:scale-95 ${
                          c.is_liked_by_me
                            ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50"
                            : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        }`}
                        title={c.is_liked_by_me ? "Unlike" : "Like"}
                      >
                        <Heart
                          className={`w-3 h-3 transition-colors ${
                            c.is_liked_by_me ? "fill-rose-500 text-rose-500" : ""
                          }`}
                        />
                        <span>{(c.likes ?? 0) > 0 ? c.likes : "Like"}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        {isAuthor && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommentId(c.id);
                              setEditText(c.content);
                            }}
                            className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded transition active:scale-95"
                            title="Edit your comment"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id)}
                            disabled={deletingId === c.id}
                            className="p-1 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition active:scale-95 disabled:opacity-50"
                            title="Delete comment"
                          >
                            {deletingId === c.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Input Footer with Debounce & Disabled State */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161B22] shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              disabled={isSubmitting}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!isSubmitting) {
                    handleSend();
                  }
                }
              }}
              placeholder={
                isSubmitting
                  ? "Posting question..."
                  : "Ask a question about this task... (Enter to send)"
              }
              rows={2}
              className="flex-1 input text-xs resize-none py-2 leading-relaxed disabled:opacity-60 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || isSubmitting}
              className="p-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white shadow-xs transition active:scale-95 shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center"
              title="Send question"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
