import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { MessageSquare, Send, X, Loader2, User as UserIcon, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { AssignmentComment } from "@/types";
import { getAssignmentComments, addAssignmentComment } from "@/services/lmsService";

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
  const [comments, setComments] = useState<AssignmentComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
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
        setComments(data);
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
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const created = await addAssignmentComment(assignmentId, text.trim());
      setComments((prev) => [...prev, created]);
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
      setSending(false);
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
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
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
                      <span className="w-5 h-5 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 flex items-center justify-center text-[10px] font-bold shrink-0">
                        {authorName ? authorName.charAt(0).toUpperCase() : "U"}
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-white truncate">
                        {authorName}
                      </span>
                      {isInstructor && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 border border-brand-300 dark:border-brand-700 shrink-0">
                          <ShieldCheck className="w-3 h-3" /> Instructor
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono shrink-0">
                      {format(new Date(c.created_at), "MMM d, HH:mm")}
                    </span>
                  </div>
                  <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {c.content}
                  </p>
                </div>
              );
            })
          )}
        </div>

        {/* Input Footer */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161B22] shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a question about this task... (Enter to send)"
              rows={2}
              className="flex-1 input text-xs resize-none py-2 leading-relaxed"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="p-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white shadow-xs transition active:scale-95 shrink-0"
              title="Send question"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
