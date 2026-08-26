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
  const [fullName, setFullName] = useState("");
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!groupId) {
      toast.error("Please select a group to join");
      return;
    }
    setIsSubmitting(true);
    try {
      await register(username, password, fullName, telegram || undefined, groupId);
      toast.success("Student account created!");
      navigate("/student");
    } catch (err) {
      const message =
        err instanceof AxiosError ? err.response?.data?.detail ?? "Registration failed" : "Something went wrong";
      toast.error(typeof message === "string" ? message : "Please check your details and try again");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="h-14 w-14 text-xl" />
          <h1 className="mt-4 text-xl font-bold text-neutral-900">Create student account</h1>
          <p className="text-sm text-neutral-500">Join English Life learning center</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Full name</label>
            <input required className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" />
          </div>
          <div>
            <label className="label">Username</label>
            <input required className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="student_username" />
          </div>
          <div>
            <label className="label">Telegram contact</label>
            <input className="input" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@telegram_user or +998..." />
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
          </div>
          <div>
            <label className="label">Password</label>
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
