import React, { useState, useEffect } from "react";
import {
  BookOpen,
  Plus,
  Trash2,
  Sparkles,
  Layers,
  Volume2,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Eye,
  AlertCircle,
  X,
  FileText,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  listWordlistSets,
  createWordlistSet,
  deleteWordlistSet,
  getWordlistSet,
  previewBulkWords,
  listGroups,
} from "@/services/lmsService";
import { api } from "@/services/api";
import {
  Group,
  WordlistSetBrief,
  WordlistSetDetail,
  WordDetailPreview,
} from "@/types";
import { FlashcardDeck } from "@/components/FlashcardDeck";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { EmptyState, LoadingRows, Modal, useConfirm } from "@/components/ui";

export default function TeacherWordlistsPage() {
  const [sets, setSets] = useState<WordlistSetBrief[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoadingSets, setIsLoadingSets] = useState(true);

  // Bulk import creation form state
  const [title, setTitle] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [rawWordsInput, setRawWordsInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previews, setPreviews] = useState<WordDetailPreview[]>([]);
  const [activeTab, setActiveTab] = useState<"manage" | "create">("manage");

  // Flashcards preview modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [activeSetDetail, setActiveSetDetail] = useState<WordlistSetDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const { confirm, ConfirmDialog } = useConfirm();

  useEffect(() => {
    loadSets();
    listGroups().then(setGroups).catch(() => {});
  }, []);

  const loadSets = () => {
    setIsLoadingSets(true);
    listWordlistSets()
      .then(setSets)
      .catch((err) => {
        toast.error(err?.response?.data?.detail ?? "Failed to load wordlists");
      })
      .finally(() => setIsLoadingSets(false));
  };

  const sanitizeVocabularyInput = (raw: string): string[] => {
    const lines = raw.split(/\r?\n/);
    const validLines: string[] = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      // Filter out git logs, commit hashes, code blocks, diffs, terminal outputs
      if (
        /^commit\s+[a-f0-9]{7,40}/i.test(line) ||
        /^Author:\s+/i.test(line) ||
        /^Date:\s+/i.test(line) ||
        /^Merge:\s+/i.test(line) ||
        /^diff\s+--git/i.test(line) ||
        /^index\s+[a-f0-9]+/i.test(line) ||
        /^[+-]{3}\s+/i.test(line) ||
        /^@@\s+-\d+/i.test(line) ||
        line.startsWith("```") ||
        line.startsWith("#") ||
        /^(fatal|error|warning):/i.test(line)
      ) {
        continue;
      }

      // Strip bullet points, leading numbers, markdown list indicators: "1. word - translation" -> "word - translation"
      const cleaned = line.replace(/^(\d+[\.\)]|\*|-|\+)\s+/, "").trim();
      if (!cleaned) continue;

      // Filter code statements or shell commands
      if (
        /^(import|export|const|let|var|function|class|def|curl|git|npm|pnpm|yarn|docker)\b/.test(cleaned) ||
        cleaned.includes("http://") ||
        cleaned.includes("https://")
      ) {
        continue;
      }

      // If comma-separated words on single line without bilingual delimiter, extract words
      if (!cleaned.includes("-") && !cleaned.includes("=") && !cleaned.includes(":") && cleaned.includes(",")) {
        const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          if (/^[a-zA-Z\s'-]+$/.test(p) && p.length < 50) {
            validLines.push(p);
          }
        }
        continue;
      }

      validLines.push(cleaned);
    }

    return validLines;
  };

  const handleGenerateBulk = async () => {
    const sanitizedWords = sanitizeVocabularyInput(rawWordsInput);

    if (sanitizedWords.length === 0) {
      toast.error(
        "No valid vocabulary words found. Please enter words in 'word - translation' format or one word per line."
      );
      return;
    }

    if (sanitizedWords.length > 50) {
      toast.error("Maximum 50 words per bulk import batch.");
      return;
    }

    setIsGenerating(true);
    try {
      // Axios client baseURL is "/api" (or "https://.../api"), so "/wordlists/preview-bulk" resolves to "/api/wordlists/preview-bulk"
      const res = await api.post<WordDetailPreview[]>("/wordlists/preview-bulk", {
        words: sanitizedWords,
      });
      const results = res.data;
      setPreviews(results);
      toast.success(`Successfully analyzed ${results.length} words!`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to query dictionary definitions.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddBlankRow = () => {
    setPreviews((prev) => [
      ...prev,
      {
        word: "",
        part_of_speech: "noun",
        phonetic: "",
        definition: "",
        example: "",
        audio_us_url: null,
        audio_gb_url: null,
      },
    ]);
  };

  const handleUpdatePreview = (
    index: number,
    field: keyof WordDetailPreview,
    val: string
  ) => {
    setPreviews((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleRemovePreview = (index: number) => {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveSet = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title for this vocabulary set.");
      return;
    }
    if (previews.length === 0) {
      toast.error("Please generate or add vocabulary items before saving.");
      return;
    }

    setIsSaving(true);
    try {
      await createWordlistSet({
        title: title.trim(),
        group_id: selectedGroupId || null,
        items: previews.map((item, idx) => ({
          word: item.word,
          part_of_speech: item.part_of_speech || null,
          phonetic: item.phonetic || null,
          definition: item.definition || null,
          example: item.example || null,
          audio_us_url: item.audio_us_url || null,
          audio_gb_url: item.audio_gb_url || null,
          order_index: idx,
        })),
      });

      toast.success("Vocabulary set created successfully!");
      // Reset form
      setTitle("");
      setRawWordsInput("");
      setPreviews([]);
      setActiveTab("manage");
      loadSets();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to save vocabulary set.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (setId: string, setTitle: string) => {
    confirm(
      `Are you sure you want to permanently delete "${setTitle}" and all its flashcards?`,
      async () => {
        try {
          await deleteWordlistSet(setId);
          toast.success("Wordlist deleted.");
          setSets((prev) => prev.filter((s) => s.id !== setId));
        } catch (err: any) {
          toast.error(err?.response?.data?.detail ?? "Failed to delete wordlist.");
        }
      }
    );
  };

  const handleOpenDeck = async (setId: string) => {
    setIsLoadingDetail(true);
    setPreviewModalOpen(true);
    try {
      const detail = await getWordlistSet(setId);
      setActiveSetDetail(detail);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to load flashcard deck.");
      setPreviewModalOpen(false);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  return (
    <ErrorBoundary>
      <ConfirmDialog />
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2.5">
              <span>Vocabulary & Wordlists</span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950/50 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                Flashcards Engine
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              Bulk-generate definitions, pronunciations, and interactive flashcard decks for your students.
            </p>
          </div>

          <div className="flex items-center gap-2 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/60 shrink-0 select-none">
            <button
              type="button"
              onClick={() => setActiveTab("manage")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "manage"
                  ? "bg-white dark:bg-[#111827] text-brand-600 dark:text-brand-400 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Manage Sets ({sets.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("create")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "create"
                  ? "bg-white dark:bg-[#111827] text-brand-600 dark:text-brand-400 shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>Bulk Create</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: MANAGE WORDLIST SETS */}
        {/* ========================================================================= */}
        {activeTab === "manage" && (
          <div className="space-y-4">
            {isLoadingSets ? (
              <div className="card p-6">
                <LoadingRows rows={5} />
              </div>
            ) : sets.length === 0 ? (
              <EmptyState
                title="No wordlist sets created yet"
                description="Import your first batch of vocabulary words with automated dictionary definitions and interactive flashcards."
                action={
                  <button
                    type="button"
                    onClick={() => setActiveTab("create")}
                    className="btn-primary"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Wordlist</span>
                  </button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sets.map((s) => (
                  <div
                    key={s.id}
                    className="card hover:shadow-md hover:border-brand-300 dark:hover:border-brand-700 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-600 dark:text-brand-400 shrink-0">
                            <BookOpen className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-zinc-900 dark:text-white text-sm truncate" title={s.title}>
                              {s.title}
                            </h3>
                            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                              {s.group_name || "All Cohorts (Global)"}
                            </span>
                          </div>
                        </div>

                        <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                          {s.word_count} words
                        </span>
                      </div>

                      <p className="text-[11px] text-zinc-400 mt-3">
                        Created: {new Date(s.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-zinc-100 dark:border-zinc-800">
                      <button
                        type="button"
                        onClick={() => handleOpenDeck(s.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:hover:bg-brand-900/60 text-brand-700 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800/60 transition"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Practice Deck</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(s.id, s.title)}
                        className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/40 transition"
                        title="Delete Wordlist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: BULK IMPORT & GENERATE */}
        {/* ========================================================================= */}
        {activeTab === "create" && (
          <div className="space-y-6">
            {/* Input Form Card */}
            <div className="card space-y-4">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold text-sm border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Bulk Wordlist Generator</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Wordlist Title *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Unit 4 - Environment & Science"
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Target Cohort (Optional)</label>
                  <select
                    value={selectedGroupId}
                    onChange={(e) => setSelectedGroupId(e.target.value)}
                    className="input"
                  >
                    <option value="">All Cohorts (Global Access)</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.english_level})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">
                  Vocabulary Words (one per line or comma-separated, max 50)
                </label>
                <textarea
                  rows={6}
                  value={rawWordsInput}
                  onChange={(e) => setRawWordsInput(e.target.value)}
                  placeholder={`drama - sahna asari\nconserve - asramoq, tejamoq\nreluctant - istaksiz, ikkilanuvchi\nsubtle\nambiguous`}
                  className="input font-mono text-xs"
                />
                <p className="text-[11px] text-zinc-400 mt-1">
                  Supports plain words (<code>drama</code>) or custom bilingual translations (<code>drama - sahna asari</code> or <code>conserve = asramoq</code>).
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-zinc-400">
                  Definitions, phonetic transcriptions, and audio links will be automatically resolved.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddBlankRow}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Row</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGenerateBulk}
                    disabled={isGenerating || !rawWordsInput.trim()}
                    className="btn-primary"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Resolving Dictionary...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>⚡ Generate Wordlist</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Editable Preview Table */}
            {previews.length > 0 && (
              <div className="card space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                      Generated Vocabulary Preview ({previews.length} words)
                    </h3>
                    <p className="text-xs text-zinc-400">
                      You can modify definitions, parts of speech, or examples before saving.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddBlankRow}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Row</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveSet}
                      disabled={isSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>💾 Save & Publish Wordlist</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-thin">
                  <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/50">
                        <th className="py-2.5 px-3 font-semibold w-12 text-center">#</th>
                        <th className="py-2.5 px-3 font-semibold w-36">Word</th>
                        <th className="py-2.5 px-3 font-semibold w-24">POS</th>
                        <th className="py-2.5 px-3 font-semibold">Definition</th>
                        <th className="py-2.5 px-3 font-semibold">Example</th>
                        <th className="py-2.5 px-3 font-semibold w-24 text-center">Audio</th>
                        <th className="py-2.5 px-3 font-semibold w-12 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {previews.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                          <td className="py-2 px-3 text-center text-zinc-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 font-bold text-zinc-900 dark:text-white">
                            <input
                              type="text"
                              value={item.word}
                              onChange={(e) => handleUpdatePreview(idx, "word", e.target.value)}
                              className="w-full bg-transparent border-b border-transparent focus:border-brand-500 outline-none text-xs font-bold"
                            />
                            {item.phonetic && (
                              <span className="text-[10px] text-zinc-400 font-mono block">
                                {item.phonetic}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={item.part_of_speech || ""}
                              onChange={(e) => handleUpdatePreview(idx, "part_of_speech", e.target.value)}
                              className="w-full bg-zinc-50 dark:bg-zinc-800/60 rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 text-xs text-center"
                            >
                              <option value="">-</option>
                              <option value="noun">noun (n)</option>
                              <option value="verb">verb (v)</option>
                              <option value="adjective">adjective (adj)</option>
                              <option value="adverb">adverb (adv)</option>
                              <option value="phrase">phrase</option>
                              {item.part_of_speech &&
                                !["", "noun", "verb", "adjective", "adverb", "phrase"].includes(item.part_of_speech) && (
                                  <option value={item.part_of_speech}>{item.part_of_speech}</option>
                                )}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <textarea
                              rows={2}
                              value={item.definition}
                              onChange={(e) => handleUpdatePreview(idx, "definition", e.target.value)}
                              placeholder="Definition..."
                              className="w-full bg-zinc-50 dark:bg-zinc-800/60 rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 text-xs resize-y"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <textarea
                              rows={2}
                              value={item.example}
                              onChange={(e) => handleUpdatePreview(idx, "example", e.target.value)}
                              placeholder="Example sentence..."
                              className="w-full bg-zinc-50 dark:bg-zinc-800/60 rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 text-xs italic resize-y"
                            />
                          </td>
                          <td className="py-2 px-3 text-center">
                            <div className="inline-flex items-center gap-1">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                  item.audio_us_url
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold"
                                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                                }`}
                                title={item.audio_us_url ? "US Audio Available" : "Web Speech Synthesis Fallback"}
                              >
                                US
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                  item.audio_gb_url
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 font-bold"
                                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
                                }`}
                                title={item.audio_gb_url ? "GB Audio Available" : "Web Speech Synthesis Fallback"}
                              >
                                GB
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemovePreview(idx)}
                              className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                              title="Remove item"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleSaveSet}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition active:scale-95 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving Wordlist...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>💾 Save & Publish Wordlist</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Practice Flashcard Modal */}
        <Modal
          open={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          title={activeSetDetail?.title ?? "Flashcard Practice"}
        >
          <div className="py-2">
            {isLoadingDetail ? (
              <div className="p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-brand-600 mx-auto" />
                <p className="text-xs text-zinc-400 mt-2">Loading flashcards...</p>
              </div>
            ) : activeSetDetail ? (
              <FlashcardDeck
                items={activeSetDetail.items}
                title={activeSetDetail.title}
                onClose={() => setPreviewModalOpen(false)}
              />
            ) : null}
          </div>
        </Modal>
      </div>
    </ErrorBoundary>
  );
}
