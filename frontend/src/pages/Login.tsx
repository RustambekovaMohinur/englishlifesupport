import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { Logo, Modal, ThemeToggle } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { AxiosError } from "axios";
import { FaInstagram, FaTelegramPlane } from "react-icons/fa";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const user = await login(username, password);
      navigate(user.role === "teacher" ? "/teacher" : "/student");
    } catch (err) {
      if (err instanceof AxiosError) {
        if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
          const msg = "Connection timed out. Please check your internet connection and try again.";
          setErrorMessage(msg);
          toast.error(msg);
          return;
        }
        if (err.response?.data) {
          const data = err.response.data;
          const errObj = data.error;
          if (errObj && errObj.code) {
            if (errObj.code === "ACCOUNT_PENDING_APPROVAL") {
              const msg = errObj.message || "Your account is waiting for teacher approval.";
              setErrorMessage(msg);
              toast.error(msg);
              return;
            }
            if (errObj.code === "ACCOUNT_REJECTED") {
              const msg = errObj.message || "Your account has been rejected.";
              setErrorMessage(msg);
              toast.error(msg);
              return;
            }
          }
          const message = data.detail ?? "Invalid username or password";
          const finalMsg = typeof message === "string" ? message : "Invalid username or password";
          setErrorMessage(finalMsg);
          toast.error(finalMsg);
          return;
        }
      }
      const genericMsg = "Something went wrong. Please check your connection and try again.";
      setErrorMessage(genericMsg);
      toast.error(genericMsg);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleForgotPassword() {
    setForgotModalOpen(true);
  }

  return (
    <div className="flex min-h-screen bg-[#FBFBFA] dark:bg-[#0B0F19] text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Left Brand Showcase Panel (Desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-950 p-12 lg:flex border-r border-black/[0.08] dark:border-white/[0.08]">
        {/* Ambient Mesh Halos */}
        <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl pointer-events-none" />
        <div className="absolute -right-20 -bottom-20 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo className="h-10 w-10 text-base" />
            <div>
              <p className="text-sm font-bold tracking-tight text-white">Asadbek Khasanov</p>
              <p className="text-xs text-indigo-300 font-medium">Learning Center · Candidate & Examiner Desk</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Hero Copy & Value Proposition */}
        <div className="relative z-10 space-y-8 my-auto max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300 backdrop-blur-md">
            <span>✨ Commercial LMS Platform 2.0</span>
          </div>
          <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Rigorous English language mastery with continuous evaluation.
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Experience structured curriculum delivery, multi-block homework assessments, instant voice feedback, and transparent gamified milestones.
          </p>

          <div className="grid grid-cols-1 gap-3.5 pt-2">
            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-md">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 font-bold text-sm">
                🎯
              </span>
              <div>
                <p className="text-xs font-bold text-white">Sequential Task Progression</p>
                <p className="text-[11px] text-slate-400">Strict prerequisite cycles with cycle progression & monthly free-pass safeguards.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-md">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 font-bold text-sm">
                ⭐
              </span>
              <div>
                <p className="text-xs font-bold text-white">Reward Economy & Daily Streaks</p>
                <p className="text-[11px] text-slate-400">Real-time Star ledger, weekly group leaderboards, and XP leveling milestones.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-md">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 font-bold text-sm">
                🎙️
              </span>
              <div>
                <p className="text-xs font-bold text-white">Voice & Notebook Feedback</p>
                <p className="text-[11px] text-slate-400">Direct audio recordings, inline error marking, and personalized teacher guidance.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Quote */}
        <div className="relative z-10 border-t border-white/10 pt-6">
          <p className="text-xs italic text-slate-400">
            &ldquo;Consistency transforms talent into fluency.&rdquo;
          </p>
          <p className="text-[11px] font-semibold text-slate-300 mt-1">— Asadbek Khasanov, Head Instructor</p>
        </div>
      </div>

      {/* Right Side Auth Container */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm space-y-6">
          {/* Mobile Header Bar */}
          <div className="flex items-center justify-between lg:hidden mb-2">
            <div className="flex items-center gap-2.5">
              <Logo className="h-8 w-8 text-sm" />
              <div>
                <p className="text-xs font-bold text-zinc-900 dark:text-white">Asadbek Khasanov</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Learning Center</p>
              </div>
            </div>
            <ThemeToggle />
          </div>

          <div className="space-y-1.5 text-center lg:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Sign in to your account</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Enter your credentials to access your Candidate or Examiner Desk.
            </p>
          </div>

          {/* Explicit Error Alert Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs text-rose-800 dark:text-rose-200 shadow-xs"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Authentication Notice</p>
                <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-200 font-bold ml-1"
                aria-label="Dismiss error"
              >
                ✕
              </button>
            </div>
          )}

          {/* Form Card */}
          <form
            onSubmit={handleSubmit}
            className="card p-6 space-y-4 border border-[#EAE9E5] dark:border-[#30363D] bg-white dark:bg-[#161B22] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.03)]"
          >
            <div>
              <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Username or Email
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                className="input text-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username or email address"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline focus:outline-none"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className="input text-sm pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 font-semibold text-sm transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Sign in</span>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
            New student?{" "}
            <Link to="/register" className="font-semibold text-brand-600 dark:text-brand-400 hover:underline">
              Create an account
            </Link>
          </p>

          {/* Social Follow Links */}
          <div className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/60 dark:bg-[#161B22]/60 p-4 text-center backdrop-blur-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2.5">
              Connect with Instructor
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <a
                href={import.meta.env.VITE_INSTAGRAM_URL || "https://instagram.com/teacher_khasanov"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/40 hover:bg-pink-100 dark:hover:bg-pink-900/60 border border-pink-200 dark:border-pink-850 rounded-xl transition shadow-xs"
              >
                <FaInstagram className="text-pink-600 dark:text-pink-400 text-sm" />
                <span>Instagram</span>
              </a>
              <a
                href={import.meta.env.VITE_TELEGRAM_URL || "https://t.me/Khasanov_SK"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200 dark:border-sky-850 rounded-xl transition shadow-xs"
              >
                <FaTelegramPlane className="text-sky-600 dark:text-sky-400 text-sm" />
                <span>Telegram</span>
              </a>
            </div>
          </div>

          {/* Forgot Password Modal */}
          <Modal open={forgotModalOpen} onClose={() => setForgotModalOpen(false)} title="Forgot Password?">
            <div className="space-y-4 text-sm text-zinc-600 dark:text-zinc-300">
              <p className="text-xs leading-relaxed">
                To protect student accounts and avoid unauthorized access, account credentials and password resets are managed directly by your teacher.
              </p>
              <div className="rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/70 dark:bg-brand-950/30 p-4">
                <h4 className="font-bold text-brand-900 dark:text-brand-200 text-xs">How to reset your password:</h4>
                <p className="mt-1 text-xs text-brand-800 dark:text-brand-300 leading-relaxed">
                  Please contact your teacher <strong className="text-zinc-900 dark:text-white">Asadbek Khasanov</strong> directly on Telegram. Your teacher will verify your identity and immediately provide a new temporary password.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2">
                <a
                  href={import.meta.env.VITE_TELEGRAM_URL || "https://t.me/Khasanov_SK"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition shadow-xs"
                >
                  <FaTelegramPlane />
                  <span>Contact on Telegram (@Khasanov_SK)</span>
                </a>
                <button
                  type="button"
                  className="btn-secondary text-xs w-full sm:w-auto"
                  onClick={() => setForgotModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    </div>
  );
}
