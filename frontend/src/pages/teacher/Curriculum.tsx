import { useState, useEffect } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  Calendar,
  Plus,
  Trash2,
  Edit2,
  Clock,
  Sparkles,
  Layers,
  CheckCircle2,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import {
  listCurriculumTemplates,
  createCurriculumTemplate,
  updateCurriculumTemplate,
  deleteCurriculumTemplate,
  applyCurriculumTemplate,
  listGroups,
} from "@/services/lmsService";
import { CurriculumTemplate, Group } from "@/types";
import { Spinner } from "@/components/ui";

interface LessonDraft {
  title: string;
  description: string;
  day_offset: number;
  deadline_offset_days: number;
}

export default function Curriculum() {
  const [templates, setTemplates] = useState<CurriculumTemplate[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit Template Modal
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [englishLevel, setEnglishLevel] = useState("intermediate");
  const [description, setDescription] = useState("");
  const [lessons, setLessons] = useState<LessonDraft[]>([
    { title: "Lesson 1: Introduction & Diagnostic", description: "", day_offset: 1, deadline_offset_days: 1 },
    { title: "Lesson 2: Core Grammar & Usage", description: "", day_offset: 3, deadline_offset_days: 1 },
    { title: "Lesson 3: Vocabulary & Active Speaking", description: "", day_offset: 5, deadline_offset_days: 1 },
  ]);
  const [saving, setSaving] = useState(false);

  // Apply to Group Modal
  const [applyModalTemplate, setApplyModalTemplate] = useState<CurriculumTemplate | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupStartDate, setGroupStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [tpls, grps] = await Promise.all([listCurriculumTemplates(), listGroups()]);
      setTemplates(tpls);
      setGroups(grps);
    } catch {
      toast.error("Failed to load curriculum templates");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenCreate() {
    setEditingTemplateId(null);
    setTitle("Intermediate Curriculum");
    setEnglishLevel("intermediate");
    setDescription("Master intermediate schedule with relative offsets (Day 1, Day 3, Day 5).");
    setLessons([
      { title: "Lesson 1: Present Perfect vs Past Simple", description: "Review and speaking practice", day_offset: 1, deadline_offset_days: 1 },
      { title: "Lesson 2: Conditionals & Hypotheticals", description: "First and second conditional drills", day_offset: 3, deadline_offset_days: 1 },
      { title: "Lesson 3: Advanced Phrasal Verbs & Vocabulary", description: "Idiomatic expressions & voice submission", day_offset: 5, deadline_offset_days: 1 },
    ]);
    setIsEditorOpen(true);
  }

  function handleOpenEdit(tpl: CurriculumTemplate) {
    setEditingTemplateId(tpl.id);
    setTitle(tpl.title);
    setEnglishLevel(tpl.english_level || "intermediate");
    setDescription(tpl.description || "");
    setLessons(
      tpl.items.map((i) => ({
        title: i.title,
        description: i.description || "",
        day_offset: i.day_offset,
        deadline_offset_days: i.deadline_offset_days || 1,
      }))
    );
    setIsEditorOpen(true);
  }

  function handleAddLesson() {
    const nextOffset = lessons.length > 0 ? Math.max(...lessons.map((l) => l.day_offset)) + 2 : 1;
    setLessons([
      ...lessons,
      {
        title: `Lesson ${lessons.length + 1}: Key Topic`,
        description: "",
        day_offset: nextOffset,
        deadline_offset_days: 1,
      },
    ]);
  }

  function handleRemoveLesson(index: number) {
    setLessons(lessons.filter((_, idx) => idx !== index));
  }

  function handleLessonChange(index: number, field: keyof LessonDraft, value: any) {
    const updated = [...lessons];
    updated[index] = { ...updated[index], [field]: value };
    setLessons(updated);
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a curriculum title");
      return;
    }
    if (lessons.length === 0) {
      toast.error("Please add at least one lesson");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        english_level: englishLevel,
        items: lessons.map((l, idx) => ({
          title: l.title.trim(),
          description: l.description.trim() || undefined,
          day_offset: Number(l.day_offset),
          deadline_offset_days: Number(l.deadline_offset_days) || 1,
          order_index: idx,
        })),
      };

      if (editingTemplateId) {
        await updateCurriculumTemplate(editingTemplateId, payload);
        toast.success("Curriculum template updated!");
      } else {
        await createCurriculumTemplate(payload);
        toast.success("Curriculum template created!");
      }
      setIsEditorOpen(false);
      loadData();
    } catch {
      toast.error("Failed to save curriculum template");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm("Are you sure you want to delete this curriculum template?")) return;
    try {
      await deleteCurriculumTemplate(id);
      toast.success("Template deleted");
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch {
      toast.error("Failed to delete template");
    }
  }

  function handleOpenApply(tpl: CurriculumTemplate) {
    setApplyModalTemplate(tpl);
    const firstGroup = groups[0]?.id || "";
    setSelectedGroupId(firstGroup);
    setGroupStartDate(format(new Date(), "yyyy-MM-dd"));
  }

  async function handleApplyToGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!applyModalTemplate || !selectedGroupId) {
      toast.error("Please select a group");
      return;
    }

    setApplying(true);
    try {
      const res = await applyCurriculumTemplate(
        applyModalTemplate.id,
        selectedGroupId,
        new Date(groupStartDate).toISOString()
      );
      toast.success(res.message || "Curriculum mapped successfully!");
      setApplyModalTemplate(null);
      loadData();
    } catch {
      toast.error("Failed to apply curriculum to group");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            <span>Curriculum Release Schedule</span>
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Create reusable master templates with relative day offsets (e.g. Day 1, Day 3, Day 5). When a group assigns a start date, lesson unlocking dates map automatically.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="btn-primary flex items-center gap-2 self-start sm:self-auto py-2.5 px-4 text-sm font-semibold rounded-xl"
        >
          <Plus className="w-4 h-4" />
          <span>Create Curriculum Template</span>
        </button>
      </div>

      {/* Templates List */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Spinner className="w-8 h-8 text-indigo-600" />
          <p className="text-sm text-zinc-500">Loading curriculum templates...</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111827] space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto text-2xl">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">No Curriculum Templates Yet</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto mt-1">
              Create your first master curriculum (e.g. "Intermediate Curriculum" with Day 1, Day 3, Day 5 schedule) to streamline lesson release.
            </p>
          </div>
          <button onClick={handleOpenCreate} className="btn-primary text-sm py-2 px-4 rounded-xl">
            Create Template Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-[#111827] p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                      {tpl.english_level || "Master"}
                    </span>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white truncate mt-0.5">
                      {tpl.title}
                    </h3>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 shrink-0">
                    {tpl.items.length} lessons
                  </span>
                </div>

                {tpl.description && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                    {tpl.description}
                  </p>
                )}

                {/* Lesson Schedule Offset Previews */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono block">
                    Schedule Preview
                  </span>
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {tpl.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-xs p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800"
                      >
                        <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate pr-2">
                          {item.title}
                        </span>
                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 shrink-0">
                          Day {item.day_offset}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleOpenApply(tpl)}
                  className="btn-primary text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 font-semibold"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Apply to Group</span>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(tpl)}
                    className="p-1.5 text-zinc-500 hover:text-indigo-600 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    title="Edit Template"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(tpl.id)}
                    className="p-1.5 text-zinc-500 hover:text-rose-600 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                    title="Delete Template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Create / Edit Template */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#111827] border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <span>{editingTemplateId ? "Edit Curriculum Template" : "New Curriculum Template"}</span>
              </h2>
              <button onClick={() => setIsEditorOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs">Curriculum Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Intermediate Curriculum"
                    className="input text-sm"
                  />
                </div>
                <div>
                  <label className="label text-xs">Target Level</label>
                  <select
                    value={englishLevel}
                    onChange={(e) => setEnglishLevel(e.target.value)}
                    className="input text-sm"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="elementary">Elementary</option>
                    <option value="pre_intermediate">Pre-Intermediate</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="upper_intermediate">Upper-Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label text-xs">Description (Optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Standard 3-month course schedule"
                  className="input text-sm"
                />
              </div>

              {/* Lessons with Relative Offsets */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                    Lessons Schedule (Relative Day Offsets)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddLesson}
                    className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Lesson</span>
                  </button>
                </div>

                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {lessons.map((lesson, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-col sm:flex-row items-start sm:items-center gap-2.5"
                    >
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-semibold text-zinc-500">Day</span>
                        <input
                          type="number"
                          min={0}
                          value={lesson.day_offset}
                          onChange={(e) => handleLessonChange(idx, "day_offset", Number(e.target.value))}
                          className="w-16 input text-xs font-mono font-bold text-center py-1"
                          title="Relative offset days from start date"
                        />
                      </div>
                      <input
                        type="text"
                        required
                        value={lesson.title}
                        onChange={(e) => handleLessonChange(idx, "title", e.target.value)}
                        placeholder="Lesson title"
                        className="flex-1 input text-xs py-1"
                      />
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-zinc-400">+1d due</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveLesson(idx)}
                          className="text-zinc-400 hover:text-rose-600 p-1"
                          title="Remove Lesson"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="btn-secondary text-xs px-4 py-2 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary text-xs px-5 py-2 rounded-xl font-bold flex items-center gap-1.5"
                >
                  {saving ? <Spinner className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Save Template</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Apply to Group */}
      {applyModalTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#111827] border border-zinc-200 dark:border-zinc-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h2 className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <span>Apply "{applyModalTemplate.title}" to Group</span>
              </h2>
              <button onClick={() => setApplyModalTemplate(null)} className="text-zinc-400 hover:text-zinc-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleApplyToGroup} className="space-y-4">
              <div>
                <label className="label text-xs">Target Group *</label>
                <select
                  required
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  className="input text-sm"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.english_level})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label text-xs">Group Start Date *</label>
                <input
                  type="date"
                  required
                  value={groupStartDate}
                  onChange={(e) => setGroupStartDate(e.target.value)}
                  className="input text-sm font-mono"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Lessons will unlock automatically according to: <code>start_date + day_offset</code>.
                </p>
              </div>

              {/* Offset calculation preview */}
              <div className="rounded-xl border border-indigo-200/60 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 space-y-1.5 text-xs">
                <span className="font-bold text-indigo-900 dark:text-indigo-300 block">
                  Calculated Release Preview:
                </span>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {applyModalTemplate.items.map((item) => {
                    const unlock = new Date(groupStartDate);
                    unlock.setDate(unlock.getDate() + item.day_offset);
                    return (
                      <div key={item.id} className="flex items-center justify-between text-zinc-700 dark:text-zinc-300">
                        <span className="truncate pr-2">
                          Day {item.day_offset}: {item.title}
                        </span>
                        <span className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 shrink-0 font-bold">
                          {format(unlock, "MMM d, yyyy")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setApplyModalTemplate(null)}
                  className="btn-secondary text-xs px-4 py-2 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={applying}
                  className="btn-primary text-xs px-5 py-2 rounded-xl font-bold flex items-center gap-1.5"
                >
                  {applying ? <Spinner className="w-3.5 h-3.5" /> : <ArrowRight className="w-4 h-4" />}
                  <span>Map & Release Lessons</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
