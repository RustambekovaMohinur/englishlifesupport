import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Mic,
  PenTool,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Sparkles,
  Layers,
  Upload,
  Power,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Modal, Spinner, useConfirm } from "@/components/ui";
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

  // Add Mode: "single" vs "bulk"
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");

  // Single Add / Edit State
  const [editingPrompt, setEditingPrompt] = useState<SpinPrompt | null>(null);
  const [formText, setFormText] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Bulk Add State
  const [bulkLines, setBulkLines] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  const topFormRef = useRef<HTMLDivElement | null>(null);

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

  // Reset form category when switching tabs
  useEffect(() => {
    if (!editingPrompt) {
      setFormCategory(activeTab === "speaking" ? SPEAKING_CATEGORIES[1] : WRITING_CATEGORIES[1]);
      setBulkCategory(activeTab === "speaking" ? SPEAKING_CATEGORIES[1] : WRITING_CATEGORIES[1]);
    }
  }, [activeTab, editingPrompt]);

  const activeCount = useMemo(() => prompts.filter((p) => p.is_active).length, [prompts]);

  // Toggle active status
  const handleToggleActive = async (p: SpinPrompt) => {
    try {
      const updated = await updateSpinPrompt(p.id, { is_active: !p.is_active });
      setPrompts((prev) => prev.map((item) => (item.id === p.id ? updated : item)));
      toast.success(updated.is_active ? "Prompt activated for student wheels" : "Prompt disabled");
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
        if (editingPrompt?.id === p.id) {
          setEditingPrompt(null);
          setFormText("");
        }
      } catch {
        toast.error("Failed to delete prompt");
      }
    });
  };

  // Save Single Prompt (Create or Edit)
  const handleSaveSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = formText.trim();
    if (!cleanText) {
      toast.error("Please enter a question or topic prompt");
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingPrompt) {
        const updated = await updateSpinPrompt(editingPrompt.id, {
          text: cleanText,
          category: formCategory.trim() || null,
        });
        setPrompts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        toast.success("Prompt updated successfully! ✨");
        setEditingPrompt(null);
        setFormText("");
      } else {
        const created = await createSpinPrompt({
          prompt_type: activeTab,
          text: cleanText,
          category: formCategory.trim() || (activeTab === "speaking" ? SPEAKING_CATEGORIES[1] : WRITING_CATEGORIES[1]),
          group_id: selectedGroupId || null,
        });
        setPrompts((prev) => [created, ...prev]);
        toast.success(`New ${activeTab} prompt saved to database! 🎯`);
        setFormText("");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save prompt");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Bulk Create Prompts
  const handleSaveBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkLines.trim()) {
      toast.error("Please paste at least one line of prompt text");
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
      toast.success(`Successfully saved ${createdItems.length} new ${activeTab} prompts! 🚀`);
      setBulkLines("");
      setAddMode("single");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save bulk prompts");
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

  const handleStartEdit = (p: SpinPrompt) => {
    setEditingPrompt(p);
    setFormText(p.text);
    setFormCategory(p.category || (activeTab === "speaking" ? SPEAKING_CATEGORIES[1] : WRITING_CATEGORIES[1]));
    setAddMode("single");
    topFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Modal open={open} onClose={onClose} title="🎡 Speaking & Writing Spin Prompts Manager" maxWidth="sm:max-w-4xl">
      <div className="space-y-4 -mt-1 text-zinc-900 dark:text-zinc-100">
        {/* Cohort Scoping & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 sm:p-3.5 bg-zinc-50 dark:bg-zinc-900/80 rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-4 h-4 text-purple-500 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              Scope:
            </span>
            <select
              value={selectedGroupId}
              onChange={(e) => {
                setSelectedGroupId(e.target.value);
                setEditingPrompt(null);
              }}
              className="select text-xs py-1.5 px-3 rounded-xl border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 font-medium"
            >
              <option value="">🌐 All Cohorts (Global Shared Prompts)</option>
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
            className="btn-secondary text-xs py-1.5 px-3 rounded-xl flex items-center justify-center gap-1.5 text-amber-700 dark:text-amber-400 hover:border-amber-300 dark:hover:border-amber-700 transition active:scale-95 cursor-pointer shrink-0"
            title="Pre-fill 10 standard IELTS speaking questions and writing topics"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Seed Standard IELTS Prompts</span>
          </button>
        </div>

        {/* Two Dedicated Tabs: 1. Speaking Questions vs 2. Writing Topics */}
        <div className="grid grid-cols-2 p-1.5 bg-zinc-100 dark:bg-zinc-900/90 rounded-2xl border border-zinc-200 dark:border-zinc-800 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab("speaking");
              setEditingPrompt(null);
              setFormText("");
            }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs cursor-pointer ${
              activeTab === "speaking"
                ? "bg-white dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 shadow-md border border-emerald-500/20"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span>1. Speaking Questions</span>
            <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-mono">
              {activeTab === "speaking" ? prompts.length : ""}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("writing");
              setEditingPrompt(null);
              setFormText("");
            }}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs cursor-pointer ${
              activeTab === "writing"
                ? "bg-white dark:bg-zinc-800 text-purple-600 dark:text-purple-400 shadow-md border border-purple-500/20"
                : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            }`}
          >
            <PenTool className="w-4 h-4 shrink-0" />
            <span>2. Writing Topics</span>
            <span className="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-mono">
              {activeTab === "writing" ? prompts.length : ""}
            </span>
          </button>
        </div>

        {/* Dedicated Always-Visible Add Prompt Card (Desktop & Mobile) */}
        <div
          ref={topFormRef}
          className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-zinc-900/90 border-2 border-purple-500/30 dark:border-purple-500/40 shadow-sm space-y-3"
        >
          {/* Header Row: Title + Single/Bulk Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg">
                {activeTab === "speaking" ? "🎙️" : "✍️"}
              </span>
              <span className="text-xs sm:text-sm font-extrabold text-zinc-900 dark:text-white">
                {editingPrompt
                  ? `Edit ${activeTab === "speaking" ? "Speaking Question" : "Writing Topic"}`
                  : `Add New ${activeTab === "speaking" ? "Speaking Question" : "Writing Topic"}`}
              </span>
              {editingPrompt && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400">
                  Editing #{editingPrompt.order_index + 1}
                </span>
              )}
            </div>

            {/* Mode Selector: Single vs Bulk */}
            {!editingPrompt && (
              <div className="inline-flex p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setAddMode("single")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                    addMode === "single"
                      ? "bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <Plus className="w-3 h-3 inline mr-1" />
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => setAddMode("bulk")}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                    addMode === "bulk"
                      ? "bg-white dark:bg-zinc-700 text-purple-600 dark:text-purple-300 shadow-2xs"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <Upload className="w-3 h-3 inline mr-1" />
                  Bulk Paste
                </button>
              </div>
            )}
          </div>

          {/* SINGLE PROMPT FORM */}
          {addMode === "single" && (
            <form onSubmit={handleSaveSingle} className="space-y-3">
              <div>
                <textarea
                  rows={2}
                  required
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  placeholder={
                    activeTab === "speaking"
                      ? "Type speaking question (e.g. Describe an ambition that you have had for a long time. What is it and how do you plan to achieve it?)"
                      : "Type writing topic (e.g. Some people believe that unpaid community service should be mandatory in high school programs. To what extent do you agree?)"
                  }
                  className="input text-xs sm:text-sm resize-y w-full leading-relaxed p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border-zinc-200 dark:border-zinc-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />
              </div>

              {/* Form Controls Row: Category Dropdown + Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-0.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 shrink-0">
                    Category:
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="select text-xs py-1.5 px-3 rounded-xl border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 w-full sm:w-auto font-medium"
                  >
                    {(activeTab === "speaking" ? SPEAKING_CATEGORIES : WRITING_CATEGORIES).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 justify-end">
                  {editingPrompt && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPrompt(null);
                        setFormText("");
                      }}
                      className="btn-secondary text-xs py-2 px-3.5 rounded-xl cursor-pointer"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm bg-purple-600 hover:bg-purple-700 active:scale-95 text-white shadow-md shadow-purple-600/30 flex items-center justify-center gap-2 transition cursor-pointer min-h-[42px]"
                  >
                    {isSubmitting ? (
                      <Spinner className="w-4 h-4" />
                    ) : editingPrompt ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span>
                      {editingPrompt ? "✓ Update Prompt" : `+ Save ${activeTab === "speaking" ? "Question" : "Topic"}`}
                    </span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* BULK PASTE FORM */}
          {addMode === "bulk" && (
            <form onSubmit={handleSaveBulk} className="space-y-3">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Paste multiple prompts below (one prompt per line). Numbering like <code>1.</code>, <code>2)</code>, or bullets will be cleaned automatically.
              </p>

              <textarea
                rows={4}
                required
                value={bulkLines}
                onChange={(e) => setBulkLines(e.target.value)}
                placeholder={
                  activeTab === "speaking"
                    ? "1. Describe a memorable trip you took with family\n2. Talk about a teacher who inspired you\n3. What are the benefits of online learning?"
                    : "1. Should university education be free for everyone?\n2. Discuss the advantages and disadvantages of remote work.\n3. How can cities reduce traffic congestion?"
                }
                className="input text-xs font-mono resize-y w-full leading-relaxed p-3 bg-zinc-50 dark:bg-zinc-800/60 rounded-xl border-zinc-200 dark:border-zinc-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              />

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-0.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 shrink-0">
                    Category:
                  </label>
                  <select
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    className="select text-xs py-1.5 px-3 rounded-xl border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 w-full sm:w-auto font-medium"
                  >
                    {(activeTab === "speaking" ? SPEAKING_CATEGORIES : WRITING_CATEGORIES).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkLines("");
                      setAddMode("single");
                    }}
                    className="btn-secondary text-xs py-2 px-3.5 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isBulkSubmitting}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-extrabold text-xs sm:text-sm bg-purple-600 hover:bg-purple-700 active:scale-95 text-white shadow-md shadow-purple-600/30 flex items-center justify-center gap-2 transition cursor-pointer min-h-[42px]"
                  >
                    {isBulkSubmitting ? <Spinner className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                    <span>💾 Save All Prompts</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Existing Prompts List Header Strip */}
        <div className="flex items-center justify-between px-1 pt-1">
          <div className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
            Saved Prompts in Database:{" "}
            <span className="text-zinc-900 dark:text-white font-mono text-sm">{prompts.length}</span> (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{activeCount} active</span>)
          </div>

          <button
            type="button"
            onClick={loadPrompts}
            className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
            title="Refresh prompt list from database"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Refresh</span>
          </button>
        </div>

        {/* Prompts Scrollable List */}
        {isLoading ? (
          <div className="py-10 flex flex-col items-center justify-center space-y-2">
            <Spinner className="w-7 h-7 text-purple-600 dark:text-purple-400" />
            <p className="text-xs text-zinc-500">Loading {activeTab} prompts...</p>
          </div>
        ) : prompts.length === 0 ? (
          <div className="p-6 sm:p-8 text-center bg-zinc-50/50 dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="text-3xl">🎡</div>
            <p className="text-sm font-bold text-zinc-900 dark:text-white">
              No custom {activeTab} prompts added yet for this scope
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              Add your first prompt above or seed standard IELTS prompts. Students automatically spin from these saved questions during homework and practice.
            </p>
            <div className="pt-1 flex justify-center gap-2">
              <button
                type="button"
                onClick={handleSeedDefaults}
                className="btn-primary text-xs py-2 px-4 rounded-xl font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Seed Standard IELTS {activeTab === "speaking" ? "Speaking" : "Writing"} Prompts</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 max-h-[36vh] sm:max-h-[42vh] overflow-y-auto pr-1">
            {prompts.map((p, idx) => (
              <div
                key={p.id}
                className={`p-3 sm:p-3.5 rounded-xl border transition flex items-start justify-between gap-3 ${
                  p.is_active
                    ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-purple-400 shadow-2xs"
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
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
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
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      p.is_active
                        ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    }`}
                    title={p.is_active ? "Disable prompt from wheel" : "Enable prompt for wheel"}
                  >
                    <Power className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStartEdit(p)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                    title="Edit prompt text"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
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
          <span>All saved prompts are synchronized with student spin practice and homework wheels.</span>
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs px-4 py-2 rounded-xl cursor-pointer"
          >
            Done / Close
          </button>
        </div>
      </div>
      <ConfirmDialog />
    </Modal>
  );
};
