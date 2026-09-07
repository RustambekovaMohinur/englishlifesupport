import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { CurrentUser } from "@/types";
import { useAuth } from "@/hooks/useAuth";

interface ApprovalGateProps {
  user: CurrentUser;
}

export default function ApprovalGate({ user }: ApprovalGateProps) {
  const { checkAuth, logout } = useAuth();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(false);

  const displayName = user.first_name || user.username || "Candidate";

  async function handleCheckAgain() {
    setIsChecking(true);
    try {
      const refreshed = await checkAuth();
      if (refreshed && refreshed.approval_status !== "pending") {
        toast.success("Account approved! Welcome aboard.");
        navigate(refreshed.role === "teacher" ? "/teacher" : "/student");
      } else {
        toast("Still waiting for approval. Please check again later.", {
          icon: "⏳",
        });
      }
    } catch {
      toast.error("Could not refresh approval status. Please try again.");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch {
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1117]/90 backdrop-blur-md px-4 py-6">
      <div className="bg-[#161B22] border border-[#30363D] shadow-2xl rounded-2xl max-w-md w-full p-8 text-center text-white space-y-6 animate-in fade-in zoom-in duration-300">
        {/* Minimalist circular pulsing amber badge */}
        <div className="flex justify-center">
          <div className="relative inline-flex items-center justify-center">
            <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full bg-amber-400/20 duration-1000" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 font-bold text-xs tracking-wider uppercase shadow-inner">
              PENDING
            </div>
          </div>
        </div>

        {/* Header & Copy */}
        <div className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-white">
            Waiting for approval
          </h2>
          <p className="text-sm leading-relaxed text-zinc-300 font-normal">
            Hi <span className="font-semibold text-white">{displayName}</span>, your account is waiting for Mr. Asadbek to approve it. This page will unlock automatically once you&apos;re approved.
          </p>
        </div>

        {/* Status Indicator */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-xs text-zinc-400 flex items-center justify-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Examiner desk review in progress</span>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
          <button
            type="button"
            disabled={isChecking}
            onClick={handleCheckAgain}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
          >
            {isChecking ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-white" />
                <span>Checking...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                <span>Check again</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/80 active:scale-[0.98] transition-all border border-zinc-700/60"
          >
            <LogOut className="h-4 w-4" />
            <span>Log out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
