import React, { useState } from "react";
import {
  Sparkles,
  Award,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Volume2,
  FileText,
  Lightbulb,
  Check,
} from "lucide-react";
import { SubmissionAIFeedbackOut } from "@/types";
import { Spinner } from "@/components/ui";

interface AIFeedbackCardProps {
  feedback?: SubmissionAIFeedbackOut | null;
  submissionId: string;
  isTeacher?: boolean;
  onRetry?: () => void;
  isRetrying?: boolean;
  onApplyToGrade?: (score: number, stars: number, feedback: string) => void;
  className?: string;
}

function getBandColor(band?: number | null) {
  if (!band) return "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
  if (band >= 7.5) return "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
  if (band >= 6.0) return "bg-indigo-50 text-indigo-700 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800";
  if (band >= 5.0) return "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
  return "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800";
}

function getCEFRLevel(band?: number | null): string {
  if (!band) return "Evaluating...";
  if (band >= 8.5) return "C2 · Mastery";
  if (band >= 7.0) return "C1 · Effective Operational Proficiency";
  if (band >= 5.5) return "B2 · Vantage / Upper Intermediate";
  if (band >= 4.0) return "B1 · Threshold / Intermediate";
  return "A2 · Waystage / Elementary";
}

function formatCriteriaName(key: string): string {
  const map: Record<string, string> = {
    task_achievement: "Task Achievement / Response",
    coherence_cohesion: "Coherence & Cohesion",
    lexical_resource: "Lexical Resource (Vocabulary)",
    grammatical_range: "Grammar & Accuracy",
    fluency_coherence: "Fluency & Coherence",
    pronunciation: "Pronunciation & Intonation",
  };
  return map[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const AIFeedbackCard: React.FC<AIFeedbackCardProps> = ({
  feedback,
  submissionId: _submissionId,
  isTeacher = false,
  onRetry,
  isRetrying = false,
  onApplyToGrade,
  className = "",
}) => {
  const [showTranscript, setShowTranscript] = useState(false);
  const [showCorrections, setShowCorrections] = useState(true);

  if (!feedback) {
    return null;
  }

  // Pending State
  if (feedback.status === "pending") {
    return (
      <div
        className={`p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-blue-50/60 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-blue-950/30 border border-indigo-200/80 dark:border-indigo-800/60 shadow-xs space-y-3 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300 font-semibold text-xs uppercase tracking-wider">
            <Sparkles className="w-4 h-4 animate-spin text-indigo-500" />
            <span>AI Automated Examiner</span>
          </div>
          <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-100/70 dark:bg-indigo-900/50 px-2 py-0.5 rounded-full animate-pulse">
            Analyzing submission...
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Spinner className="w-5 h-5 text-indigo-600 shrink-0" />
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Evaluating {feedback.assignment_type === "speaking" ? "spoken audio & pronunciation" : "written grammar & coherence"} against Cambridge & IELTS rubrics.
          </p>
        </div>
      </div>
    );
  }

  // Failed State
  if (feedback.status === "failed") {
    return (
      <div
        className={`p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 space-y-2.5 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-semibold text-xs">
            <AlertCircle className="w-4 h-4" />
            <span>AI Evaluation Notice</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/60 dark:hover:bg-rose-800/80 text-rose-800 dark:text-rose-200 transition"
            >
              <RefreshCw className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`} />
              <span>Retry</span>
            </button>
          )}
        </div>
        <p className="text-xs text-rose-600 dark:text-rose-300">
          {feedback.error_message || "Could not automatically generate evaluation for this submission."}
        </p>
      </div>
    );
  }

  const isSpeaking = feedback.assignment_type === "speaking";
  const criteria = feedback.criteria_scores || {};
  const strengths = feedback.strengths || [];
  const improvements = feedback.areas_for_improvement || [];
  const corrections = feedback.detailed_corrections || [];

  return (
    <section
      className={`rounded-2xl border border-indigo-200/90 dark:border-indigo-800/60 bg-white dark:bg-[#131B2E] shadow-sm overflow-hidden transition-all ${className}`}
    >
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-blue-500/10 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-blue-950/40 px-4 sm:px-5 py-3.5 border-b border-indigo-100 dark:border-indigo-900/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                AI Examiner Report
              </h4>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {isSpeaking ? "Speaking & Audio" : "Writing & Composition"}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              IELTS / CEFR Benchmark Assessment
            </p>
          </div>
        </div>

        {/* Score Pills */}
        <div className="flex items-center gap-2 shrink-0">
          {feedback.band_score !== null && feedback.band_score !== undefined && (
            <div
              className={`px-3 py-1 rounded-xl border text-xs font-bold flex items-center gap-1.5 shadow-2xs ${getBandColor(
                feedback.band_score
              )}`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Band {feedback.band_score.toFixed(1)}</span>
            </div>
          )}
          {feedback.scaled_score_10 !== null && feedback.scaled_score_10 !== undefined && (
            <div className="px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 text-xs font-mono font-bold">
              {feedback.scaled_score_10.toFixed(1)} / 10
            </div>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-5">
        {/* CEFR Level Summary */}
        <div className="flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800">
          <span className="font-medium">Estimated Proficiency Tier:</span>
          <span className="font-bold text-indigo-600 dark:text-indigo-400">
            {getCEFRLevel(feedback.band_score)}
          </span>
        </div>

        {/* Overall Feedback Summary */}
        {feedback.overall_feedback && (
          <div className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed bg-indigo-50/40 dark:bg-indigo-950/20 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
            <span className="font-bold text-indigo-900 dark:text-indigo-300 block mb-1">
              Examiner Overview:
            </span>
            {feedback.overall_feedback}
          </div>
        )}

        {/* Criteria Breakdown Bars */}
        {Object.keys(criteria).length > 0 && (
          <div className="space-y-2.5">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Criteria Breakdown (1.0 – 9.0)
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {Object.entries(criteria).map(([key, rawVal]) => {
                const val = typeof rawVal === "number" ? rawVal : Number(rawVal) || 0;
                const pct = Math.min(100, Math.max(0, (val / 9.0) * 100));
                return (
                  <div
                    key={key}
                    className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300 truncate">
                        {formatCriteriaName(key)}
                      </span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0 ml-2">
                        {val.toFixed(1)}
                      </span>
                    </div>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Audio Transcription (Speaking Only) */}
        {isSpeaking && feedback.transcription && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowTranscript((prev) => !prev)}
              className="w-full flex items-center justify-between p-3 bg-zinc-50/70 dark:bg-zinc-900/50 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-850 transition"
            >
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>Audio Transcription</span>
              </span>
              {showTranscript ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showTranscript && (
              <div className="p-3 bg-white dark:bg-zinc-950/40 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed border-t border-zinc-200 dark:border-zinc-800 italic font-serif">
                "{feedback.transcription}"
              </div>
            )}
          </div>
        )}

        {/* Strengths & Improvements Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* Strengths */}
          {strengths.length > 0 && (
            <div className="p-3.5 rounded-xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 space-y-2">
              <h6 className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 uppercase tracking-wider">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>What Went Well</span>
              </h6>
              <ul className="space-y-1.5">
                {strengths.map((str, idx) => (
                  <li key={idx} className="text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-1.5">
                    <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Areas for Improvement */}
          {improvements.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 space-y-2">
              <h6 className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Lightbulb className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Areas to Improve</span>
              </h6>
              <ul className="space-y-1.5">
                {improvements.map((imp, idx) => (
                  <li key={idx} className="text-xs text-amber-900 dark:text-amber-200 flex items-start gap-1.5">
                    <span className="text-amber-500 font-bold shrink-0">→</span>
                    <span>{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Detailed Corrections */}
        {corrections.length > 0 && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCorrections((prev) => !prev)}
              className="w-full flex items-center justify-between p-3 bg-zinc-50/70 dark:bg-zinc-900/50 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-850 transition"
            >
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-500" />
                <span>Line-by-Line Corrections ({corrections.length})</span>
              </span>
              {showCorrections ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showCorrections && (
              <div className="p-3 bg-white dark:bg-zinc-950/40 space-y-2.5 border-t border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-850">
                {corrections.map((c, idx) => (
                  <div key={idx} className="pt-2 first:pt-0 space-y-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="line-through text-rose-600 dark:text-rose-400 font-mono bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded">
                        {c.original}
                      </span>
                      <span className="text-zinc-400">→</span>
                      <span className="text-emerald-700 dark:text-emerald-300 font-semibold font-mono bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                        {c.correction}
                      </span>
                    </div>
                    {c.explanation && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 pl-1">
                        💡 {c.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Teacher Action: Apply to Grade */}
        {isTeacher && onApplyToGrade && (
          <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Examiner shortcut: Auto-populate grade & feedback fields.
            </span>
            <button
              type="button"
              onClick={() => {
                const rawScore = feedback.scaled_score_10 ?? (feedback.band_score ? Math.round((feedback.band_score / 9.0) * 10) : 8);
                const scoreInt = Math.max(0, Math.min(10, Math.round(rawScore)));
                const stars = scoreInt; // 1:1 star mapping for grade
                const fbText = feedback.overall_feedback || "Good effort. Review the AI corrections and recommendations.";
                onApplyToGrade(scoreInt, stars, fbText);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition active:scale-95 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Apply to Grade & Feedback</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
export default AIFeedbackCard;
