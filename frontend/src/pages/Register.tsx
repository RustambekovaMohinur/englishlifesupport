import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { AxiosError } from "axios";
import { Logo } from "@/components/ui";
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
  const [groupId, setGroupId] = useState("");
  const [groups, setGroups] = useState<GroupPublic[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchPublicGroups()
      .then((data) => {
        setGroups(data);
        if (data.length > 0) setGroupId(data[0].id);
      })
      .catch(() => toast.error("Failed to load available groups"))
      .finally(() => setIsLoadingGroups(false));
  }, []);

  const [isSubmittedPending, setIsSubmittedPending] = useState(false);

  const selectedGroup = groups.find((g) => g.id === groupId);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!groupId) {
      toast.error("Please select a group to join");
      return;
    }
    if (!/^[A-Za-z0-9_]{3,30}$/.test(username.trim())) {
      toast.error("Username must be 3-30 characters (letters, numbers, underscores only)");
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First name and Last name are required");
      return;
    }
    if (!telegram.trim()) {
      toast.error("Telegram username is required");
      return;
    }

    setIsSubmitting(true);
    try {
      await register(username.trim(), password, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        telegram: telegram.trim(),
        groupId,
      });
      setIsSubmittedPending(true);
      toast.success("Request sent to your teacher!");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail) && detail[0]?.msg
          ? detail[0].msg
          : "Registration failed. Please check your details.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmittedPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
        <div className="w-full max-w-md card text-center space-y-4 p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl text-amber-600">
            ⏳
          </div>
          <h2 className="text-xl font-bold text-neutral-900">Registration Submitted</h2>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
            Status: 🟡 Pending approval
          </div>
          <p className="text-sm text-neutral-700 font-medium">
            Registration submitted. Your teacher needs to approve your account before you can access English Life.
          </p>
          <div className="rounded-xl bg-neutral-50 p-4 text-xs text-neutral-600 border border-neutral-200 text-left space-y-1">
            <p>
              Selected Group: <span className="font-semibold text-neutral-900">{selectedGroup?.name}</span>
            </p>
            <p>
              Level: <span className="font-semibold text-brand-600 capitalize">{selectedGroup?.english_level.replace("_", " ")}</span>
            </p>
            <p className="pt-1 text-neutral-500 text-[11px]">
              Once your teacher approves your registration, you can sign in to view your dashboard, tasks, and start earning stars and lightning.
            </p>
          </div>
          <Link to="/login" className="btn-primary inline-block w-full text-center">
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="h-14 w-14 text-xl" />
          <h1 className="mt-4 text-xl font-bold text-neutral-900">Create student account</h1>
          <p className="text-sm text-neutral-500">Join Asadbek Khasanov learning center</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Username *</label>
            <input
              required
              minLength={3}
              maxLength={30}
              pattern="^[A-Za-z0-9_]{3,30}$"
              title="3-30 characters: letters, numbers, and underscores only"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. student_alex"
            />
            <p className="mt-1 text-xs text-neutral-400">3–30 chars, letters, numbers, and underscore</p>
          </div>

          <div>
            <label className="label">Telegram username *</label>
            <input
              required
              className="input"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="@telegram_username"
            />
            <p className="mt-1 text-xs text-neutral-400">With or without @ symbol</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name *</label>
              <input
                required
                className="input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
              />
            </div>
            <div>
              <label className="label">Last name *</label>
              <input
                required
                className="input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="label">Password *</label>
            <input
              type="password"
              required
              minLength={8}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 chars, letter + number"
            />
          </div>

          <div>
            <label className="label">Select Group *</label>
            <select
              required
              disabled={isLoadingGroups || groups.length === 0}
              className="input"
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
              <div className="mt-2 rounded-md bg-brand-50 border border-brand-200 px-3 py-2 text-xs flex items-center justify-between">
                <span className="text-neutral-600">Assigned English Level:</span>
                <span className="font-semibold text-brand-700 capitalize">
                  {selectedGroup.english_level.replace("_", " ")}
                </span>
              </div>
            )}
          </div>

          <button type="submit" disabled={isSubmitting || !groupId} className="btn-primary w-full">
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
