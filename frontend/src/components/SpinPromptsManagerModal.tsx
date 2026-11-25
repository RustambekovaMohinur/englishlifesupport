import React, { useState, useEffect, useMemo } from "react";
import {
  Mic,
  PenTool,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Shuffle,
  Sparkles,
  Layers,
  Copy,
  ChevronDown,
  Power,
  RotateCcw,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Spinner, EmptyState, useConfirm } from "@/components/ui";
import {
  listSpinPrompts,
  createSpinPrompt,
  bulkCreateSpinPrompts,
  updateSpinPrompt,
  deleteSpinPrompt,
  seedDefaultSpinPrompts,
  listGroups,
} from "@/services/lmsService";
import { SpinPrompt, Group } from "@/types";

interface SpinPromptsManagerModalProps {
  open: boolean;
  onClose: () => void;
  defaultGroupId?: string;
}

const SPEAKING_CATEGORIES = [
  "IELTS Speaking Part 1 / Everyday",
  "IELTS Speaking Part 2 / Cue Card",
  "IELTS Speaking Part 3 / Discussion",
  "General Conversation",
  "Pronunciation & Fluency",
];

const WRITING_CATEGORIES = [
  "IELTS Writing Task 1 / Report",
  "IELTS Writing Task 2 / Opinion Essay",
  "IELTS Writing Task 2 / Discussion Essay",
  "IELTS Writing Task 2 / Problem & Solution",
  "IELTS Writing Task 2 / Advantages & Disadvantages",
  "Grammar & Composition",
  "Short Paragraph",
];

export const SpinPromptsManagerModal: React.FC<SpinPromptsManagerModalProps> = ({
  open,
  onClose,
  defaultGroupId,
}) => {
  const { confirm, ConfirmDialog } = useConfirm();
  const [activeTab, setActiveTab] = useState<"speaking" | "writing">("speaking");
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(defaultGroupId || "");
  const [prompts, setPrompts] = useState<SpinPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Single Add / Edit State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<SpinPrompt | null>(null);
  const [formText, setFormText] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk Add State
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkLines, setBulkLines] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // Load Groups
  useEffect(() => {
    if (open) {
      listGroups()
        .then((gList) => setGroups(Array.isArray(gList) ? gList : []))
        .catch(() => {});
    }
  }, [open]);

  // Load Prompts for active tab & group
  const loadPrompts = async () => {
    setIsLoading(true);
    try {
      const data = await listSpinPrompts({
        prompt_type: activeTab,
        group_id: selectedGroupId || undefined,
        active_only: false, // Teacher sees all (active & inactive)
        fallback: false, // Show exact database records for this scope
      });
      setPrompts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to load spin prompts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadPrompts();
    }
  }, [open, activeTab, selectedGroupId]);

  const activeCount = useMemo(() => prompts.filter((p) => p.is_active).length, [prompts]);

  // Toggle active status
  const handleToggleActive = async (p: SpinPrompt) => {
    try {
      const updated = await updateSpinPrompt(p.id, { is_active: !p.is_active });
      setPrompts((prev) => prev.map((item) => (item.id === p.id ? updated : item)));
      toast.success(updated.is_active ? "Prompt activated" : "Prompt disabled");
    } catch {
      toast.error("Failed to update prompt status");
    }
  };

  // Delete Prompt
  const handleDelete = (p: SpinPrompt) => {
    confirm(`Are you sure you want to delete this ${activeTab} prompt? This cannot be undone.`, async () => {
      try {
        await deleteSpinPrompt(p.id);
        setPrompts((prev) => prev.filter((item) => item.id !== p.id));
        toast.success("Prompt deleted successfully");
      } catch {
        toast.error("Failed to delete prompt");
      }
    });
  };

  // Save Single Prompt (Create or Edit)
  const handleSaveSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formText.trim()) {
      toast.error("Please enter a question or topic prompt");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingPrompt) {
        const updated = await updateSpinPrompt(editingPrompt.id, {
          text: formText.trim(),
          category: formCategory.trim() || null,
        });
        setPrompts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        toast.success("Prompt updated successfully!");
      } else {
        const created = await createSpinPrompt({
          prompt_type: activeTab,
          text: formText.trim(),
          category: formCategory.trim() || (activeTab === "speaking" ? "IELTS Speaking Part 2" : "IELTS Writing Task 2"),
          group_id: selectedGroupId || null,
        });
        setPrompts((prev) => [created, ...prev]);
        toast.success("New prompt created!");
      }
      setIsFormOpen(false);
      setEditingPrompt(null);
      setFormText("");
      setFormCategory("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save prompt");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Bulk Create
  const handleSaveBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkLines.trim()) {
      toast.error("Please paste at least one line of text");
      return;
    }

    setIsBulkSubmitting(true);
    try {
      const createdItems = await bulkCreateSpinPrompts({
        prompt_type: activeTab,
        lines: bulkLines,
        category: bulkCategory.trim() || undefined,
        group_id: selectedGroupId || null,
      });
      setPrompts((prev) => [...createdItems, ...prev]);
      toast.success(`Successfully added ${createdItems.length} new ${activeTab} prompts! 🚀`);
      setIsBulkOpen(false);
      setBulkLines("");
      setBulkCategory("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to process bulk prompts");
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  // Seed High-Yield Defaults
  const handleSeedDefaults = () => {
    confirm(
      `This will pre-fill high-yield standard IELTS Speaking Questions & Writing Topics ${
        selectedGroupId ? "for the selected cohort" : "for all shared cohorts"
      }. Continue?`,
      async () => {
        setIsLoading(true);
        try {
          const res = await seedDefaultSpinPrompts({ group_id: selectedGroupId || undefined });
          toast.success(res.message || "Prompts seeded successfully! ✨");
          await loadPrompts();
        } catch (err: any) {
          toast.error(err?.response?.data?.detail ?? "Failed to seed prompts");
        } finally {
          setIsLoading(false);
        }
      }
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="🎡 Speaking & Writing Spin Prompts Manager" maxWidth="sm:max-w-4xl">
      <div className="space-y-5 -mt-1 text-zinc-900 dark:text-zinc-100">
        {/* Cohort Scoping & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 bg-zinc-50 dark:bg-zinc-900/80 rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              Scope Prompts:
            </span>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="select text-xs py-1.5 px-3 rounded-xl border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-medium"
            >
              <option value="">🌐 All Cohorts (Global Shared Defaults)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  👥 {g.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSeedDefaults}
            className="btn-secondary text-xs py-1.5 px-3 rounded-xl flex items-center justify-center gap-1.5 text-amber-700 dark:text-amber-400 hover:border-amber-300 dark:hover:border-amber-700 transition"
            title="Pre-fill 10 standard IELTS speaking questions and writing topics"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Seed Standard IELTS Prompts</span>
          </button>
        </div>

        {/* Two Completely Separate Tabs (Speaking Questions vs Writing Topics) */}
        <div className="grid grid-cols-2 p-1.5 bg-zinc-100 dark:bg-zinc-900/90 rounded-2xl border border-zinc-200 dark:border-zinc-800 gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab("speaking");
              setIsFormOpen(false);
              setIsBulkOpen(false);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs ${
              activeTab === "speaking"
                ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-md border border-emerald-500/20"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>1. Speaking Questions</span>
            <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono">
              {activeTab === "speaking" ? prompts.length : ""}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("writing");
              setIsFormOpen(false);
              setIsBulkOpen(false);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs ${
              activeTab === "writing"
                ? "bg-white dark:bg-zinc-800 text-violet-600 dark:text-violet-400 shadow-md border border-violet-500/20"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>2. Writing Topics</span>
            <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 font-mono">
              {activeTab === "writing" ? prompts.length : ""}
            </span>
          </button>
        </div>

        {/* Action Header Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Showing <strong className="text-zinc-900 dark:text-white">{prompts.length}</strong> {activeTab} prompts (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{activeCount} active in wheel</span>)
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsBulkOpen(true);
                setIsFormOpen(false);
              }}
              className="btn-secondary text-xs py-1.5 px-3 rounded-xl flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5 text-indigo-500" />
              <span>Bulk Paste Multiple</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingPrompt(null);
                setFormText("");
                setFormCategory(activeTab === "speaking" ? SPEAKING_CATEGORIES[1] : WRITING_CATEGORIES[1]);
                setIsFormOpen(true);
                setIsBulkOpen(false);
              }}
              className="btn-primary text-xs py-1.5 px-3.5 rounded-xl flex items-center gap-1.5 font-bold shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Single Prompt</span>
            </button>
          </div>
        </div>

        {/* Bulk Paste Sub-Form */}
        {isBulkOpen && (
          <form
            onSubmit={handleSaveBulk}
            className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-2xl border border-indigo-200 dark:border-indigo-800/80 space-y-3 animate-in fade-in duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-indigo-500" />
                <span>Bulk Import {activeTab === "speaking" ? "Speaking Questions" : "Writing Topics"}</span>
              </span>
              <button
                type="button"
                onClick={() => setIsBulkOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Paste multiple prompts below (one prompt per line). Numbering like <code>1.</code>, <code>2)</code>, or bullets will be automatically cleaned up.
            </p>

            <textarea
              rows={5}
              required
              value={bulkLines}
              onChange={(e) => setBulkLines(e.target.value)}
              placeholder={
                activeTab === "speaking"
                  ? "1. Describe a memorable trip you took with family\n2. Talk about a teacher who inspired you\n3. What are the benefits of online learning?"
                  : "1. Should university education be free for everyone?\n2. Discuss the advantages and disadvantages of remote work.\n3. How can cities reduce traffic congestion?"
              }
              className="input text-xs font-mono resize-y w-full leading-relaxed p-3 bg-white dark:bg-zinc-900"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500">Assign Category (Optional):</label>
                <select
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                  className="select text-xs py-1 px-2.5 rounded-lg border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                >
                  <option value="">Default category</option>
                  {(activeTab === "speaking" ? SPEAKING_CATEGORIES : WRITING_CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkOpen(false)}
                  className="btn-secondary text-xs py-1.5 px-3 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBulkSubmitting}
                  className="btn-primary text-xs py-1.5 px-4 rounded-xl font-bold flex items-center gap-1.5"
                >
                  {isBulkSubmitting ? <Spinner className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save Bulk Prompts</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Single Add / Edit Sub-Form */}
        {isFormOpen && (
          <form
            onSubmit={handleSaveSingle}
            className="p-4 bg-zinc-50 dark:bg-zinc-900/80 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3 animate-in fade-in duration-200"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-200">
                {editingPrompt ? "Edit Prompt" : `New ${activeTab === "speaking" ? "Speaking Question" : "Writing Topic"}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingPrompt(null);
                }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="label text-xs">Prompt / Question Text *</label>
              <textarea
                rows={3}
                required
                value={formText}
                onChange={(e) => setFormText(e.target.value)}
                placeholder={
                  activeTab === "speaking"
                    ? "e.g. Describe a time when you received constructive advice. Who gave it and how did you act upon it?"
                    : "e.g. In many countries, fast food consumption has increased dramatically. What are the causes and what measures can be taken?"
                }
                className="input text-xs resize-y w-full leading-relaxed p-3 bg-white dark:bg-zinc-900"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500">Category Tag:</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="select text-xs py-1 px-2.5 rounded-lg border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                >
                  {(activeTab === "speaking" ? SPEAKING_CATEGORIES : WRITING_CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingPrompt(null);
                  }}
                  className="btn-secondary text-xs py-1.5 px-3 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary text-xs py-1.5 px-4 rounded-xl font-bold flex items-center gap-1.5"
                >
                  {isSubmitting ? <Spinner className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{editingPrompt ? "Update Prompt" : "Save Prompt"}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Prompts List */}
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center space-y-2">
            <Spinner className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            <p className="text-xs text-zinc-500">Loading {activeTab} prompts...</p>
          </div>
        ) : prompts.length === 0 ? (
          <div className="p-8 text-center bg-zinc-50/50 dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="text-3xl">🎡</div>
            <p className="text-sm font-bold text-zinc-900 dark:text-white">
              No custom {activeTab} prompts found for this cohort
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              Students will automatically use the high-yield built-in {activeTab} prompts until you configure custom ones.
            </p>
            <div className="pt-2 flex justify-center gap-2">
              <button
                type="button"
                onClick={handleSeedDefaults}
                className="btn-primary text-xs py-2 px-4 rounded-xl font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Seed Standard IELTS {activeTab === "speaking" ? "Speaking" : "Writing"} Prompts</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {prompts.map((p, idx) => (
              <div
                key={p.id}
                className={`p-3 sm:p-3.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                  p.is_active
                    ? "bg-white dark:bg-zinc-900 border-zinc-200/90 dark:border-zinc-800 hover:border-indigo-400 shadow-2xs"
                    : "bg-zinc-50/60 dark:bg-zinc-900/30 border-zinc-200/50 dark:border-zinc-800/50 opacity-60"
                }`}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11px] font-bold text-zinc-400 dark:text-zinc-500">
                      #{idx + 1}
                    </span>
                    {p.category && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                        {p.category}
                      </span>
                    )}
                    {p.group_id && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        Cohort Scoped
                      </span>
                    )}
                    {!p.is_active && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold uppercase bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400">
                        Disabled
                      </span>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed">
                    {p.text}
                  </p>
                </div>

                {/* Item Actions */}
                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(p)}
                    className={`p-1.5 rounded-lg transition ${
                      p.is_active
                        ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    }`}
                    title={p.is_active ? "Disable prompt" : "Enable prompt"}
                  >
                    <Power className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingPrompt(p);
                      setFormText(p.text);
                      setFormCategory(p.category || "");
                      setIsFormOpen(true);
                      setIsBulkOpen(false);
                    }}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    title="Edit prompt text"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                    title="Delete prompt"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
          <span>Prompts configured here are served in real-time to student spin wheels.</span>
          <button type="button" onClick={onClose} className="btn-secondary text-xs px-4 py-2 rounded-xl">
            Close Manager
          </button>
        </div>
      </div>
      <ConfirmDialog />
    </Modal>
  );
};
