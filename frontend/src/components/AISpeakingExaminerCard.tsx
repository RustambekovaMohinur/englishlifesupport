import React, { useState, useMemo } from "react";
import {
  Mic,
  Volume2,
  Sparkles,
  Award,
  Clock,
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Copy,
  Check,
  FileText,
  Lightbulb,
  CheckCheck,
} from "lucide-react";
import toast from "react-hot-toast";
import { AuthenticatedAudio } from "./ui";
import { evaluateSubmissionSpeakingAI, approveSpeakingGrade } from "../services/lmsService";
import type { SubmissionOut, AISpeakingEvaluation } from "../types";

interface AISpeakingExaminerCardProps {
  submission: SubmissionOut;
  onSubmissionUpdated?: (updated: SubmissionOut) => void;
  onPreFillGrade?: (score: number, feedback: string) => void;
  onApproveSuccess?: (updated: SubmissionOut) => void;
  className?: string;
}

export function AISpeakingExaminerCard({
  submission,
  onSubmissionUpdated,
  onPreFillGrade,
  onApproveSuccess,
  className = "",
}: AISpeakingExaminerCardProps) {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"transcript" | "grammar" | "pronunciation">("transcript");

  // Determine if submission is an audio recording
  const isAudio = Boolean(
    (submission.file_original_name && /\.(mp3|wav|m4a|aac|ogg|webm)$/i.test(submission.file_original_name)) ||
    (submission.file_url && /\.(mp3|wav|m4a|aac|ogg|webm)(\?.*)?$/i.test(submission.file_url)) ||
    submission.audio_transcript ||
    submission.speaking_metrics_json ||
    submission.ai_speaking_evaluation_json
  );

  const evalData: AISpeakingEvaluation | null = useMemo(() => {
    if (submission.ai_speaking_evaluation_json) {
      try {
        return JSON.parse(submission.ai_speaking_evaluation_json);
      } catch {
        // Continue to fallback
      }
    }
    if (submission.audio_transcript || submission.speaking_metrics_json) {
      let metrics: any = {};
      if (submission.speaking_metrics_json) {
        try {
          metrics = JSON.parse(submission.speaking_metrics_json);
        } catch {}
      }
      return {
        transcript: submission.audio_transcript || "",
        words_count: metrics.words_count || 0,
        duration_seconds: metrics.duration_seconds || 0,
        wpm: metrics.wpm || 0,
        fluency_status: metrics.fluency_status || "Evaluated",
        suggested_score: metrics.suggested_score || 80,
        band: metrics.band || "6.5",
        cefr: metrics.cefr || "B2",
        pronunciation_and_vocab_tips: [],
        grammar_corrections: [],
        summary: "Speaking evaluation loaded.",
      };
    }
    return null;
  }, [submission.ai_speaking_evaluation_json, submission.audio_transcript, submission.speaking_metrics_json]);

  if (!isAudio) {
    return null;
  }

  const handleCopyTranscript = () => {
    if (!evalData?.transcript) return;
    navigator.clipboard.writeText(evalData.transcript);
    setIsCopied(true);
    toast.success("Transcript copied!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleRunEvaluation = async () => {
    setIsEvaluating(true);
    try {
      const updated = await evaluateSubmissionSpeakingAI(submission.id);
      toast.success("AI Speaking Examiner analysis complete! 🎙️✨");
      if (onSubmissionUpdated) {
        onSubmissionUpdated(updated);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to run AI Speaking evaluation");
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const updated = await approveSpeakingGrade(submission.id);
      toast.success("Speaking grade and feedback approved! 🚀⭐");
      if (onSubmissionUpdated) {
        onSubmissionUpdated(updated);
      }
      if (onApproveSuccess) {
        onApproveSuccess(updated);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to approve grade");
    } finally {
      setIsApproving(false);
    }
  };

  const handlePreFill = () => {
    if (!evalData || !onPreFillGrade) return;
    const scoreVal = Math.max(0, Math.min(10, Math.round(evalData.suggested_score / 10)));
    const feedbackText = `🎙️ [AI Speaking Examiner - Band ${evalData.band} (${evalData.suggested_score}/100, ${evalData.wpm} WPM - ${evalData.fluency_status})]\n${evalData.summary}${
      evalData.pronunciation_and_vocab_tips?.length
        ? `\n\nPronunciation & vocabulary recommendations:\n${evalData.pronunciation_and_vocab_tips.map((t) => `• ${t}`).join("\n")}`
        : ""
    }`;
    onPreFillGrade(scoreVal, feedbackText);
    toast.success("Score and feedback applied to grading form!");
  };

  // Helper formatting for duration (mm:ss)
  const formatDuration = (sec: number) => {
    const s = Math.round(sec || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? "0" : ""}${rem}`;
  };

  // Fluency speed badge color
  const getWpmColorClass = (wpm: number) => {
    if (wpm >= 110 && wpm <= 155) {
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    }
    if (wpm > 155) {
      return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
    }
    return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  };

  return (
    <div
      className={`rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/50 via-white to-purple-50/40 dark:from-[#13172c] dark:via-[#0f1422] dark:to-[#17152b] p-4 sm:p-5 space-y-4 shadow-xs overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-indigo-100 dark:border-indigo-900/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Mic className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center gap-2 flex-wrap">
              <span>AI Speaking Examiner</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Speech-to-Text & Fluency
              </span>
            </h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              Audio transcription, speech rate (WPM), and IELTS speaking rubrics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {evalData && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-800 text-xs font-bold font-mono shadow-2xs">
              <Award className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>
                Band {evalData.band} ({evalData.suggested_score}/100)
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={handleRunEvaluation}
            disabled={isEvaluating}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isEvaluating ? "animate-spin" : ""}`} />
            <span>
              {isEvaluating
                ? "Analyzing..."
                : evalData
                ? "Re-analyze"
                : "🎙️ Run AI Analysis"}
            </span>
          </button>
        </div>
      </div>

      {/* Audio Player Container */}
      <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
          <span className="flex items-center gap-1.5 font-bold">
            <Volume2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Student Audio Recording</span>
          </span>
          {submission.file_original_name && (
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono truncate max-w-[200px]">
              {submission.file_original_name}
            </span>
          )}
        </div>
        {submission.file_url ? (
          <AuthenticatedAudio url={submission.file_url} className="w-full" />
        ) : (
          <p className="text-xs text-zinc-500 italic">Audio file URL not found.</p>
        )}
      </div>

      {evalData ? (
        <div className="space-y-4 pt-1">
          {/* 1-Click Teacher Action Bar */}
          <div className="p-3.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-950/40 border border-indigo-500/30 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 block">
                ✨ 1-Click Approval: {Math.round(evalData.suggested_score / 10)}/10 pts (+
                {Math.round(evalData.suggested_score / 10)} ⭐)
              </span>
              <span className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
                Apply suggested score, Band {evalData.band}, and evaluation report directly in one click.
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onPreFillGrade && (
                <button
                  type="button"
                  onClick={handlePreFill}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 transition active:scale-95 shadow-2xs cursor-pointer"
                >
                  📝 Fill in Form
                </button>
              )}
              <button
                type="button"
                onClick={handleApprove}
                disabled={isApproving}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition active:scale-95 shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isApproving ? "Saving..." : "Approve Speaking Grade (1-Click)"}</span>
              </button>
            </div>
          </div>

          {/* Fluency Metric Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Clock className="w-3 h-3 text-indigo-500" /> Duration
              </span>
              <p className="text-sm font-bold font-mono text-zinc-900 dark:text-white">
                {formatDuration(evalData.duration_seconds)} ({evalData.duration_seconds}s)
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <FileText className="w-3 h-3 text-purple-500" /> Word Count
              </span>
              <p className="text-sm font-bold font-mono text-zinc-900 dark:text-white">
                {evalData.words_count} words
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Activity className="w-3 h-3 text-emerald-500" /> Speech Rate (WPM)
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold font-mono text-zinc-900 dark:text-white">
                  {evalData.wpm} WPM
                </span>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${getWpmColorClass(
                    evalData.wpm
                  )}`}
                  title="Benchmark: 110-150 WPM"
                >
                  {evalData.wpm >= 110 && evalData.wpm <= 155 ? "Normal" : evalData.wpm > 155 ? "Fast" : "Slow"}
                </span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                <Award className="w-3 h-3 text-amber-500" /> Fluency Level
              </span>
              <p className="text-xs font-bold text-zinc-900 dark:text-white truncate" title={evalData.fluency_status}>
                {evalData.fluency_status}
              </p>
            </div>
          </div>

          {/* Tab Navigation for Detailed Examiner Views */}
          <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800 pt-1">
            <button
              type="button"
              onClick={() => setActiveTab("transcript")}
              className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition border-b-2 cursor-pointer ${
                activeTab === "transcript"
                  ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 bg-white dark:bg-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              📝 Transcript (STT)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("grammar")}
              className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition border-b-2 cursor-pointer ${
                activeTab === "grammar"
                  ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 bg-white dark:bg-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              🔍 Grammar ({evalData.grammar_corrections?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("pronunciation")}
              className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition border-b-2 cursor-pointer ${
                activeTab === "pronunciation"
                  ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400 bg-white dark:bg-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              💡 Pronunciation & Lexis ({evalData.pronunciation_and_vocab_tips?.length || 0})
            </button>
          </div>

          {/* Active Tab Content */}
          {activeTab === "transcript" && (
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Speech-to-Text Transcript</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyTranscript}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{isCopied ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <div className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-100 dark:border-zinc-800 text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-text font-serif">
                {evalData.transcript ? (
                  `"${evalData.transcript}"`
                ) : (
                  <span className="text-zinc-400 italic">No transcript available.</span>
                )}
              </div>
              {evalData.summary && (
                <div className="pt-2 text-[11px] text-zinc-600 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Expert Evaluation:</strong> {evalData.summary}
                  </span>
                </div>
              )}
            </div>
          )}

          {activeTab === "grammar" && (
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900">
              <div className="px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200/80 dark:border-zinc-800">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  <span>Spoken Grammar Corrections & Feedback</span>
                </span>
              </div>
              {evalData.grammar_corrections && evalData.grammar_corrections.length > 0 ? (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-56 overflow-y-auto">
                  {evalData.grammar_corrections.map((corr, idx) => (
                    <div key={idx} className="p-3 text-xs space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="line-through text-rose-600 dark:text-rose-400 font-mono font-medium">
                          "{corr.spoken}"
                        </span>
                        <span className="text-zinc-400">→</span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                          "{corr.corrected}"
                        </span>
                      </div>
                      {corr.explanation && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {corr.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-xs text-zinc-500 italic text-center">
                  No major grammatical errors detected in speech. 👍
                </div>
              )}
            </div>
          )}

          {activeTab === "pronunciation" && (
            <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900">
              <div className="px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200/80 dark:border-zinc-800">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                  <span>Pronunciation, intonation, and lexical recommendations</span>
                </span>
              </div>
              {evalData.pronunciation_and_vocab_tips && evalData.pronunciation_and_vocab_tips.length > 0 ? (
                <div className="p-3 space-y-2">
                  {evalData.pronunciation_and_vocab_tips.map((tip, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <CheckCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-xs text-zinc-500 italic text-center">
                  No specific pronunciation notes provided.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Empty / Call to Action state */
        <div className="p-4 rounded-xl bg-white dark:bg-zinc-900 border border-dashed border-indigo-300 dark:border-indigo-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5 text-center sm:text-left">
            <span className="font-bold text-zinc-900 dark:text-white block">
              Audio has not been evaluated by AI Speaking Examiner yet
            </span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Start automated speech-to-text transcription, fluency calculation (WPM), and IELTS Speaking rubric evaluation.
            </span>
          </div>
          <button
            type="button"
            onClick={handleRunEvaluation}
            disabled={isEvaluating}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition active:scale-95 shadow-xs flex items-center gap-1.5 shrink-0 disabled:opacity-50 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isEvaluating ? "Analyzing..." : "Run AI Analysis"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
