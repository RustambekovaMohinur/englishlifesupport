import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { Logo, ThemeToggle } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { fetchPublicGroups, GroupPublic } from "@/services/authService";

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [telegram, setTelegram] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [groups, setGroups] = useState<GroupPublic[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmittedPending, setIsSubmittedPending] = useState(false);

  useEffect(() => {
    fetchPublicGroups()
      .then((data) => {
        setGroups(data);
        if (data.length > 0) setGroupId(data[0].id);
      })
      .catch(() => toast.error("Failed to load available groups"))
      .finally(() => setIsLoadingGroups(false));
  }, []);

  const selectedGroup = groups.find((g) => g.id === groupId);

  function handleTelegramChange(val: string) {
    // Keep user's input, ensure format is clean
    setTelegram(val);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!groupId) {
      const msg = "Please select an assigned group to join.";
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }
    if (!/^[A-Za-z0-9_]{3,30}$/.test(username.trim())) {
      const msg = "Username must be 3-30 characters (letters, numbers, underscores only).";
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      const msg = "First name and Last name are required.";
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }
    const cleanTelegram = telegram.trim();
    if (!cleanTelegram) {
      const msg = "Telegram username is required for teacher communications.";
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }

    // Sanitize telegram username to ensure leading @ format
    const formattedTelegram = cleanTelegram.startsWith("@") ? cleanTelegram : `@${cleanTelegram}`;

    setIsSubmitting(true);
    try {
      await register(username.trim(), password, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        telegram: formattedTelegram,
        groupId,
      });
      setIsSubmittedPending(true);
      toast.success("Registration request sent to your teacher!");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail) && detail[0]?.msg
          ? detail[0].msg
          : "Registration failed. Please check your details.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmittedPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBFBFA] dark:bg-[#0B0F19] px-4 py-12 transition-colors">
        <div className="w-full max-w-md card text-center space-y-5 p-8 border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#161B22] shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-3xl">
            ⏳
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white tracking-tight">Registration Submitted</h2>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold">
              Status: 🟡 Pending Teacher Approval
            </div>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            Your registration has been submitted. Your instructor <strong className="text-zinc-900 dark:text-white">Asadbek Khasanov</strong> must approve your enrollment before you can access the Candidate Portal.
          </p>
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/60 p-4 text-xs text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 text-left space-y-1.5">
            <p className="flex justify-between">
              <span>Selected Group:</span>
              <span className="font-semibold text-zinc-900 dark:text-white">{selectedGroup?.name}</span>
            </p>
            <p className="flex justify-between">
              <span>Assigned Level:</span>
              <span className="font-semibold text-brand-600 dark:text-brand-400 capitalize">
                {selectedGroup?.english_level.replace("_", " ")}
              </span>
            </p>
            <p className="flex justify-between">
              <span>Telegram:</span>
              <span className="font-semibold text-zinc-900 dark:text-white">{telegram.startsWith("@") ? telegram : `@${telegram}`}</span>
            </p>
            <p className="pt-2 text-zinc-500 text-[11px] leading-normal border-t border-zinc-200/60 dark:border-zinc-800/60">
              Once approved, you can sign in to view your homework assignments, submit voice responses, and participate in weekly group leaderboards.
            </p>
          </div>
          <Link to="/login" className="btn-primary inline-block w-full text-center py-2.5 font-semibold text-sm">
            Return to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#FBFBFA] dark:bg-[#0B0F19] text-zinc-900 dark:text-zinc-100 transition-colors">
      {/* Left Brand Showcase Panel (Desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-950 p-12 lg:flex border-r border-black/[0.08] dark:border-white/[0.08]">
        <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl pointer-events-none" />
        <div className="absolute -right-20 -bottom-20 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl pointer-events-none" />

        {/* Top Header */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo className="h-10 w-10 text-base" />
            <div>
              <p className="text-sm font-bold tracking-tight text-white">Asadbek Khasanov</p>
              <p className="text-xs text-indigo-300 font-medium">Candidate Enrollment</p>
            </div>
          </div>
          <ThemeToggle />
        </div>

        {/* Hero Copy */}
        <div className="relative z-10 space-y-6 my-auto max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-500/10 px-3.5 py-1 text-xs font-semibold text-indigo-300 backdrop-blur-md">
            <span>🎓 Start Your Learning Journey</span>
          </div>
          <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Join an active cohort with structured progression.
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Create your student account to access homework assignments, practice vocabulary, submit recordings, and build daily learning streaks.
          </p>

          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-md">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 font-bold text-xs">
                1
              </span>
              <p className="text-xs text-slate-300">Submit your registration details and select your class group.</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-md">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 font-bold text-xs">
                2
              </span>
              <p className="text-xs text-slate-300">Instructor verifies and approves your placement in the group.</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-md">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 font-bold text-xs">
                3
              </span>
              <p className="text-xs text-slate-300">Access your tasks, earn Stars, and climb the weekly leaderboard.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 border-t border-white/10 pt-6">
          <p className="text-xs text-slate-400">
            Already enrolled?{" "}
            <Link to="/login" className="font-semibold text-indigo-300 hover:text-white underline">
              Sign in to your Candidate Desk
            </Link>
          </p>
        </div>
      </div>

      {/* Right Side Registration Form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:px-16 overflow-y-auto">
        <div className="mx-auto w-full max-w-md space-y-6">
          {/* Mobile Header Bar */}
          <div className="flex items-center justify-between lg:hidden mb-2">
            <div className="flex items-center gap-2.5">
              <Logo className="h-8 w-8 text-sm" />
              <div>
                <p className="text-xs font-bold text-zinc-900 dark:text-white">Asadbek Khasanov</p>
                <p className="text-[10px] text-zinc-500 dark:text-zinc-400">Student Registration</p>
              </div>
            </div>
            <ThemeToggle />
          </div>

          <div className="space-y-1.5 text-center lg:text-left">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">Create student account</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Complete your profile to request enrollment in a class group.
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
                <p className="font-semibold">Registration Notice</p>
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

          <form
            onSubmit={handleSubmit}
            className="card p-6 space-y-4 border border-[#EAE9E5] dark:border-[#30363D] bg-white dark:bg-[#161B22] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.03)]"
          >
            <div>
              <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Username *
              </label>
              <input
                required
                minLength={3}
                maxLength={30}
                pattern="^[A-Za-z0-9_]{3,30}$"
                title="3-30 characters: letters, numbers, and underscores only"
                className="input text-sm"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. alex_student"
                disabled={isSubmitting}
              />
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                3–30 characters, letters, numbers, and underscores only
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  First name *
                </label>
                <input
                  required
                  className="input text-sm"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="John"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Last name *
                </label>
                <input
                  required
                  className="input text-sm"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div>
              <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Telegram username *
              </label>
              <div className="relative">
                <input
                  required
                  className="input text-sm"
                  value={telegram}
                  onChange={(e) => handleTelegramChange(e.target.value)}
                  placeholder="@telegram_username"
                  disabled={isSubmitting}
                />
              </div>
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Used by your teacher to contact you and verify account recovery
              </p>
            </div>

            <div>
              <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  className="input text-sm pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters (letters & numbers)"
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
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                At least 8 characters with a letter and a number
              </p>
            </div>

            <div>
              <label className="label text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Select Class Group *
              </label>
              <select
                required
                disabled={isLoadingGroups || groups.length === 0 || isSubmitting}
                className="input text-sm"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                {isLoadingGroups ? (
                  <option value="">Loading groups...</option>
                ) : groups.length === 0 ? (
                  <option value="">No active groups available</option>
                ) : (
                  groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.english_level.replace("_", " ")})
                    </option>
                  ))
                )}
              </select>
              {selectedGroup && (
                <div className="mt-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-850 px-3 py-2 text-xs flex items-center justify-between">
                  <span className="text-zinc-600 dark:text-zinc-400">Curriculum Level:</span>
                  <span className="font-bold text-indigo-700 dark:text-indigo-300 capitalize">
                    {selectedGroup.english_level.replace("_", " ")}
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !groupId || isLoadingGroups}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 font-semibold text-sm transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Submitting enrollment...</span>
                </>
              ) : (
                <span>Create student account</span>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-brand-600 dark:text-brand-400 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
