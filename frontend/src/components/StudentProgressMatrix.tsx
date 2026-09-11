import React, { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { UserAvatar } from "@/components/common/UserAvatar";
import {
  GroupDetailOut,
  GroupStudentDetail,
  GroupAssignmentHeader,
  AssignmentItemOverview,
} from "@/types";

interface StudentProgressMatrixProps {
  groupDetail: GroupDetailOut;
  onStudentClick?: (studentId: string) => void;
  onCellClick?: (student: GroupStudentDetail, assignment: GroupAssignmentHeader, item?: AssignmentItemOverview) => void;
  isTeacher?: boolean;
}

export const StudentProgressMatrix: React.FC<StudentProgressMatrixProps> = ({
  groupDetail,
  onStudentClick,
  onCellClick,
  isTeacher = false,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);

  // Determine available cycles
  const currentCycle = groupDetail.current_cycle ?? 1;
  const cycleSet = useMemo(() => {
    const set = new Set<number>();
    set.add(currentCycle);
    groupDetail.assignments.forEach((a) => {
      set.add(a.cycle_number ?? 1);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [groupDetail.assignments, currentCycle]);

  const activeCycle = selectedCycle ?? currentCycle;

  // Filter assignments by active cycle
  const cycleAssignments = useMemo(() => {
    return groupDetail.assignments.filter((a) => (a.cycle_number ?? 1) === activeCycle);
  }, [groupDetail.assignments, activeCycle]);

  // Filter students by search query
  const filteredStudents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return groupDetail.students;
    return groupDetail.students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.username && s.username.toLowerCase().includes(q)) ||
        (s.telegram_username && s.telegram_username.toLowerCase().includes(q))
    );
  }, [groupDetail.students, searchQuery]);

  // Helper to pick an intuitive skill icon based on assignment title
  const getAssignmentIcon = (title: string) => {
    const lower = title.toLowerCase();
    if (lower.includes("speak") || lower.includes("shadow") || lower.includes("record") || lower.includes("audio")) {
      return "🎙️";
    }
    if (lower.includes("listen") || lower.includes("hear") || lower.includes("podcast")) {
      return "🎧";
    }
    if (lower.includes("read") || lower.includes("book") || lower.includes("article")) {
      return "📖";
    }
    if (lower.includes("writ") || lower.includes("essay") || lower.includes("grammar") || lower.includes("vocab")) {
      return "✍️";
    }
    return "⚡";
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Top Header Controls matching Reference Image 3 */}
      <div className="bg-white dark:bg-[#161B22] p-4 rounded-2xl border border-[#EAE9E5] dark:border-[#30363D] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-zinc-900 dark:text-white">
              Student progress
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60">
              {groupDetail.name}
            </span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5">
            <span>{cycleAssignments.length} assignments</span>
            <span>·</span>
            <span>{filteredStudents.length} students</span>
            {cycleSet.length > 1 && (
              <>
                <span>·</span>
                <span className="font-semibold text-brand-600 dark:text-brand-400">Cycle {activeCycle}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Cycle filter pills */}
          {cycleSet.length > 1 && (
            <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
              {cycleSet.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedCycle(c)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    activeCycle === c
                      ? "bg-white dark:bg-[#1F2937] text-zinc-900 dark:text-white shadow-xs"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                  }`}
                >
                  Cycle {c} {c === currentCycle && "• Active"}
                </button>
              ))}
            </div>
          )}

          {/* Search bar matching Image 3 */}
          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search candidate..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-850 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
        </div>
      </div>

      {/* Progress Matrix Table with Pinned Left Column and Horizontal Momentum Scroll */}
      <div className="overflow-x-auto rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#111827] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_8px_20px_rgba(0,0,0,0.03)] touch-pan-x">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-black/[0.08] dark:border-white/[0.08] bg-zinc-50/90 dark:bg-[#161B22]/90 backdrop-blur-md text-zinc-600 dark:text-zinc-400">
              {/* Sticky Column 1: Candidate (Matches Image 3) */}
              <th className="sticky left-0 z-20 bg-zinc-50 dark:bg-[#161B22] px-4 py-3.5 font-bold uppercase tracking-wider text-[11px] min-w-[200px] border-r border-black/[0.08] dark:border-white/[0.08] shadow-[3px_0_6px_-2px_rgba(0,0,0,0.08)]">
                Candidate
              </th>

              {/* Assignments Horizontal Columns (Matches Image 3) */}
              {cycleAssignments.length === 0 ? (
                <th className="px-4 py-3 text-zinc-400 italic font-normal text-xs text-center">
                  No assignments found in Cycle {activeCycle}
                </th>
              ) : (
                cycleAssignments.map((a) => (
                  <th
                    key={a.id}
                    className="px-4 py-3.5 text-center min-w-[150px] max-w-[180px] border-l border-black/[0.04] dark:border-white/[0.06]"
                  >
                    <div className="flex items-center justify-center gap-1.5 text-zinc-900 dark:text-white font-bold truncate">
                      <span className="text-sm">{getAssignmentIcon(a.title)}</span>
                      <span className="truncate text-xs" title={a.title}>
                        {a.title}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-normal mt-0.5">
                      Due: {new Date(a.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </div>
                  </th>
                ))
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            {filteredStudents.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(2, cycleAssignments.length + 1)}
                  className="px-4 py-12 text-center text-zinc-400 dark:text-zinc-500 text-xs"
                >
                  No students found matching "{searchQuery}"
                </td>
              </tr>
            ) : (
              filteredStudents.map((st) => (
                <tr
                  key={st.student_id}
                  className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30 transition-colors group"
                >
                  {/* Sticky Pinned Candidate Identity (Matches Image 3) */}
                  <td className="sticky left-0 z-10 bg-white dark:bg-[#111827] px-4 py-3 border-r border-black/[0.08] dark:border-white/[0.08] shadow-[3px_0_6px_-2px_rgba(0,0,0,0.08)] group-hover:bg-zinc-50/90 dark:group-hover:bg-zinc-800/60 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <UserAvatar
                          src={st.avatar_url}
                          name={st.full_name}
                          size="xs"
                        />
                      </div>
                      <div className="min-w-0">
                        <p
                          onClick={() => onStudentClick && onStudentClick(st.student_id)}
                          className={`font-semibold text-zinc-900 dark:text-white truncate text-xs ${
                            onStudentClick
                              ? "hover:text-brand-600 dark:hover:text-brand-400 cursor-pointer underline decoration-dotted"
                              : ""
                          }`}
                          title={st.full_name}
                        >
                          {st.full_name}
                        </p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono truncate">
                          {st.username ? `@${st.username}` : (st.telegram_username ? `@${st.telegram_username.replace("@", "")}` : "Student")}
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* Horizontal Assignment Status Badges (DONE / NOT YET / PENDING) */}
                  {cycleAssignments.map((a) => {
                    const item = st.assignments.find((asg) => asg.assignment_id === a.id);
                    const isDone = item?.has_submission && item.score !== null;
                    const isPending = item?.has_submission && item.score === null;

                    return (
                      <td
                        key={a.id}
                        className={`px-3 py-3 text-center border-l border-black/[0.04] dark:border-white/[0.06] ${
                          isTeacher ? "cursor-pointer hover:bg-brand-50/40 dark:hover:bg-brand-950/20" : ""
                        }`}
                        onClick={() => {
                          if (onCellClick) {
                            onCellClick(st, a, item);
                          }
                        }}
                      >
                        {isDone ? (
                          <span
                            className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300 shadow-2xs"
                            title={`Graded: ${item.score}/10`}
                          >
                            DONE {item.score !== null && item.score !== undefined ? `(${item.score}/10)` : ""}
                          </span>
                        ) : isPending ? (
                          <span
                            className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 shadow-2xs gap-1.5"
                            title="Submitted, awaiting instructor evaluation"
                          >
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                            </span>
                            PENDING
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500 shadow-2xs"
                            title="Not submitted yet"
                          >
                            NOT YET
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Helper Legend / Instructions Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400 px-1 pt-1">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              DONE
            </span>
            <span>Completed & Graded</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
              PENDING
            </span>
            <span>Submitted / In Review</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500">
              NOT YET
            </span>
            <span>Incomplete</span>
          </div>
        </div>

        {isTeacher && (
          <p className="text-[11px] text-zinc-400 italic">
            💡 Tap any cell to review, submit scores, or award stars.
          </p>
        )}
      </div>
    </div>
  );
};
