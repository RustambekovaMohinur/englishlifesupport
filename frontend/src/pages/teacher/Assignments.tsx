import { FormEvent, useEffect, useState } from "react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { EmptyState, LoadingRows, useConfirm, FileDownloadButton } from "@/components/ui";
import { createAssignment, deleteAssignment, listAssignments, listGroups } from "@/services/lmsService";
import { AssignmentOut, Group } from "@/types";

export type TaskType = "reading" | "writing" | "dictation" | "vocabulary" | "book";
export type SubType = "text" | "link" | "image" | "file" | "csv";

export interface TaskBlock {
  id: string;
  type: TaskType;
  subType: SubType;
  content: string;
  bookLink?: string;
  unit?: string;
  pages?: string;
  file?: File | null;
}

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentOut[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  // Builder state
  const [groupId, setGroupId] = useState("");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [tasks, setTasks] = useState<TaskBlock[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    listGroups(false).then((data) => {
      setGroups(data);
      if (data.length > 0) setGroupId(data[0].id);
    }).catch(() => {});
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
      } catch (err: any) {
        toast.error(err?.response?.data?.detail ?? "Failed to delete assignment");
      }
    });
  }

  function handleAddTask() {
    const newTask: TaskBlock = {
      id: Math.random().toString(36).substring(2, 9),
      type: "reading",
      subType: "text",
      content: "",
    };
    setTasks([...tasks, newTask]);
  }

  function handleUpdateTask(id: string, updates: Partial<TaskBlock>) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, ...updates };
        // Reset subType if type changed
        if (updates.type && updates.type !== t.type) {
          if (updates.type === "dictation") updated.subType = "file";
          else if (updates.type === "book") updated.subType = "link";
          else updated.subType = "text";
          updated.content = "";
          updated.bookLink = "";
          updated.unit = "";
          updated.pages = "";
          updated.file = null;
        }
        return updated;
      })
    );
  }

  function handleRemoveTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  async function handleCreateAssignment(e: FormEvent) {
    e.preventDefault();
    if (!groupId) {
      toast.error("Please select a group");
      return;
    }
    if (!title.trim()) {
      toast.error("Please enter assignment title");
      return;
    }
    if (!deadline) {
      toast.error("Please set a deadline");
      return;
    }

    // Find any attached files
    let primaryFile: File | null = null;
    let vocabFile: File | null = null;

    for (const task of tasks) {
      if (task.file) {
        if (task.file.size > 10 * 1024 * 1024) {
          toast.error(`File "${task.file.name}" exceeds 10 MB limit`);
          return;
        }
        if (task.type === "vocabulary" && task.subType === "csv") {
          vocabFile = task.file;
        } else if (!primaryFile) {
          primaryFile = task.file;
        }
      }
    }

    setIsSaving(true);
    try {
      const taskDataForJson = tasks.map((t) => ({
        id: t.id,
        type: t.type,
        subType: t.subType,
        content: t.content,
        bookLink: t.bookLink,
        unit: t.unit,
        pages: t.pages,
        fileName: t.file?.name ?? null,
      }));

      const descriptionPayload = JSON.stringify(taskDataForJson);

      const formData = new FormData();
      formData.append("group_id", groupId);
      formData.append("title", title.trim());
      formData.append("description", descriptionPayload);
      formData.append("deadline", new Date(deadline).toISOString());
      formData.append("status", "published");
      if (primaryFile) formData.append("file", primaryFile);
      if (vocabFile) formData.append("vocab_file", vocabFile);

      await createAssignment(formData);
      toast.success("Assignment created successfully!");
      setTitle("");
      setDeadline("");
      setTasks([]);
      setShowBuilder(false);
      refresh();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const errorMsg = typeof detail === "string" ? detail : (Array.isArray(detail) ? detail.map((d: any) => d.msg).join(", ") : "Failed to create assignment");
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Assignments</h1>
          <p className="text-sm text-neutral-500">Create, manage, and assign homework</p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            if (!showBuilder && groups.length > 0 && !groupId) {
              setGroupId(groups[0].id);
            }
            setShowBuilder(!showBuilder);
          }}
        >
          {showBuilder ? "Close Builder" : "+ New Assignment"}
        </button>
      </div>

      {/* Inline Assignment Builder */}
      {showBuilder && (
        <form onSubmit={handleCreateAssignment} className="card space-y-5 border-2 border-brand-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <h2 className="text-lg font-bold text-neutral-900">Create Assignment</h2>
            <button
              type="button"
              onClick={() => setShowBuilder(false)}
              className="text-xs font-medium text-neutral-400 hover:text-neutral-600"
            >
              ✕ Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="label">Assignment Title *</label>
              <input
                required
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Unit 4 Reading & Vocabulary"
              />
            </div>

            <div>
              <label className="label">Group *</label>
              <select
                required
                className="input"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="" disabled>Select group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.english_level.replace("_", " ")})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Deadline *</label>
              <input
                required
                type="datetime-local"
                className="input"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          {/* Homework Tasks Section */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between border-t border-neutral-100 pt-4">
              <div>
                <h3 className="text-base font-semibold text-neutral-900">Homework Tasks</h3>
                <p className="text-xs text-neutral-500">Add tasks for reading, writing, dictation, vocabulary, or book exercises</p>
              </div>
              <button
                type="button"
                onClick={handleAddTask}
                className="btn-secondary text-xs font-medium"
              >
                + Add Task
              </button>
            </div>

            {tasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">
                No tasks added yet. Click <strong>+ Add Task</strong> above to add tasks.
              </div>
            ) : (
              <div className="space-y-4">
                {tasks.map((task, idx) => (
                  <div key={task.id} className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                          {idx + 1}
                        </span>
                        <select
                          className="input py-1 text-xs font-semibold uppercase tracking-wider max-w-[160px]"
                          value={task.type}
                          onChange={(e) => handleUpdateTask(task.id, { type: e.target.value as TaskType })}
                        >
                          <option value="reading">Reading</option>
                          <option value="writing">Writing</option>
                          <option value="dictation">Dictation</option>
                          <option value="vocabulary">Vocabulary</option>
                          <option value="book">Book</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveTask(task.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-800"
                      >
                        ✕ Remove
                      </button>
                    </div>

                    {/* SubType & Content for Reading / Writing */}
                    {(task.type === "reading" || task.type === "writing") && (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          {(["text", "link", "image", "file"] as SubType[]).map((sub) => (
                            <button
                              key={sub}
                              type="button"
                              onClick={() => handleUpdateTask(task.id, { subType: sub, content: "", file: null })}
                              className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition ${
                                task.subType === sub
                                  ? "bg-brand-500 text-white"
                                  : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100"
                              }`}
                            >
                              {sub}
                            </button>
                          ))}
                        </div>

                        {task.subType === "text" && (
                          <textarea
                            rows={3}
                            className="input"
                            value={task.content}
                            onChange={(e) => handleUpdateTask(task.id, { content: e.target.value })}
                            placeholder={task.type === "reading" ? "Enter reading passage, instructions, or text..." : "Enter writing prompt, topic, or instructions..."}
                          />
                        )}

                        {task.subType === "link" && (
                          <input
                            type="url"
                            className="input"
                            value={task.content}
                            onChange={(e) => handleUpdateTask(task.id, { content: e.target.value })}
                            placeholder="https://example.com/article"
                          />
                        )}

                        {task.subType === "image" && (
                          <div>
                            <input
                              type="file"
                              accept="image/*"
                              className="input text-xs"
                              onChange={(e) => handleUpdateTask(task.id, { file: e.target.files?.[0] ?? null })}
                            />
                            <p className="mt-1 text-xs text-neutral-400">JPG, PNG, WEBP image (max 10MB)</p>
                          </div>
                        )}

                        {task.subType === "file" && (
                          <div>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                              className="input text-xs"
                              onChange={(e) => handleUpdateTask(task.id, { file: e.target.files?.[0] ?? null })}
                            />
                            <p className="mt-1 text-xs text-neutral-400">PDF, DOC, DOCX, XLS, PPT (max 10MB)</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dictation */}
                    {task.type === "dictation" && (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateTask(task.id, { subType: "file", content: "", file: null })}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                              task.subType === "file"
                                ? "bg-brand-500 text-white"
                                : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100"
                            }`}
                          >
                            Audio file
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateTask(task.id, { subType: "link", content: "", file: null })}
                            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                              task.subType === "link"
                                ? "bg-brand-500 text-white"
                                : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100"
                            }`}
                          >
                            Link
                          </button>
                        </div>

                        {task.subType === "file" && (
                          <div>
                            <input
                              type="file"
                              accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                              className="input text-xs"
                              onChange={(e) => handleUpdateTask(task.id, { file: e.target.files?.[0] ?? null })}
                            />
                            <p className="mt-1 text-xs text-neutral-400">Audio file: MP3, WAV, M4A, OGG, WEBM (max 10MB)</p>
                          </div>
                        )}

                        {task.subType === "link" && (
                          <input
                            type="url"
                            className="input"
                            value={task.content}
                            onChange={(e) => handleUpdateTask(task.id, { content: e.target.value })}
                            placeholder="https://... (Audio link or listening resource)"
                          />
                        )}
                      </div>
                    )}

                    {/* Vocabulary */}
                    {task.type === "vocabulary" && (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {(["text", "link", "image", "file", "csv"] as SubType[]).map((sub) => (
                            <button
                              key={sub}
                              type="button"
                              onClick={() => handleUpdateTask(task.id, { subType: sub, content: "", file: null })}
                              className={`rounded-lg px-2.5 py-1 text-xs font-medium uppercase transition ${
                                task.subType === sub
                                  ? "bg-brand-500 text-white"
                                  : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100"
                              }`}
                            >
                              {sub}
                            </button>
                          ))}
                        </div>

                        {task.subType === "text" && (
                          <textarea
                            rows={3}
                            className="input"
                            value={task.content}
                            onChange={(e) => handleUpdateTask(task.id, { content: e.target.value })}
                            placeholder="Type vocabulary words (e.g. apple - olma, opportunity - imkoniyat)..."
                          />
                        )}

                        {task.subType === "link" && (
                          <input
                            type="url"
                            className="input"
                            value={task.content}
                            onChange={(e) => handleUpdateTask(task.id, { content: e.target.value })}
                            placeholder="https://quizlet.com/... or vocabulary link"
                          />
                        )}

                        {task.subType === "image" && (
                          <div>
                            <input
                              type="file"
                              accept="image/*"
                              className="input text-xs"
                              onChange={(e) => handleUpdateTask(task.id, { file: e.target.files?.[0] ?? null })}
                            />
                            <p className="mt-1 text-xs text-neutral-400">Vocabulary chart image (max 10MB)</p>
                          </div>
                        )}

                        {task.subType === "file" && (
                          <div>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.txt"
                              className="input text-xs"
                              onChange={(e) => handleUpdateTask(task.id, { file: e.target.files?.[0] ?? null })}
                            />
                            <p className="mt-1 text-xs text-neutral-400">Vocabulary document (max 10MB)</p>
                          </div>
                        )}

                        {task.subType === "csv" && (
                          <div>
                            <input
                              type="file"
                              accept=".csv"
                              className="input text-xs"
                              onChange={(e) => handleUpdateTask(task.id, { file: e.target.files?.[0] ?? null })}
                            />
                            <p className="mt-1 text-xs text-neutral-400">CSV format: <code>word,translation</code> per line</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Book */}
                    {task.type === "book" && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="sm:col-span-1">
                          <label className="label">Book Link / Resource</label>
                          <input
                            type="url"
                            className="input"
                            value={task.bookLink ?? ""}
                            onChange={(e) => handleUpdateTask(task.id, { bookLink: e.target.value })}
                            placeholder="https://..."
                          />
                        </div>
                        <div>
                          <label className="label">Unit</label>
                          <input
                            className="input"
                            value={task.unit ?? ""}
                            onChange={(e) => handleUpdateTask(task.id, { unit: e.target.value })}
                            placeholder="e.g. 25"
                          />
                        </div>
                        <div>
                          <label className="label">Pages</label>
                          <input
                            className="input"
                            value={task.pages ?? ""}
                            onChange={(e) => handleUpdateTask(task.id, { pages: e.target.value })}
                            placeholder="e.g. 120–125"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-neutral-100 pt-4">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowBuilder(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary"
            >
              {isSaving ? "Saving Assignment..." : "Save Assignment"}
            </button>
          </div>
        </form>
      )}

      {/* Assignment List */}
      <div className="flex items-center gap-3">
        <select
          className="input max-w-[220px]"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
        >
          <option value="">All active groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <LoadingRows rows={5} />
      ) : assignments.length === 0 ? (
        <EmptyState title="No assignments yet" description="Click '+ New Assignment' above to create homework." />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <div key={a.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-neutral-900">{a.title}</p>
                </div>
                <p className="text-sm text-neutral-500">
                  {a.group_name} · Due {format(new Date(a.deadline), "MMM d, yyyy HH:mm")} · {a.submission_count} submissions
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 pt-1">
                  {a.file_url && (
                    <FileDownloadButton
                      url={a.file_url}
                      filename={a.file_original_name}
                      className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
                    >
                      📎 Attached File ({a.file_original_name})
                    </FileDownloadButton>
                  )}
                  {a.vocab_words && a.vocab_words.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-medium">
                      📖 {a.vocab_words.length} Vocabulary Words
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                <button
                  type="button"
                  className="text-sm font-medium text-red-600 hover:underline"
                  onClick={() => handleDelete(a)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog />
    </div>
  );
}
