import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Logo } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { AxiosError } from "axios";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const user = await login(username, password);
      navigate(user.role === "teacher" ? "/teacher" : "/student");
    } catch (err) {
      const message =
        err instanceof AxiosError ? err.response?.data?.detail ?? "Login failed" : "Something went wrong";
      toast.error(typeof message === "string" ? message : "Invalid username or password");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleForgotPassword() {
    toast("Password recovery via Telegram will be available soon.", { icon: "ℹ️" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Logo className="h-14 w-14 text-xl" />
          <h1 className="mt-4 text-xl font-bold text-neutral-900">Asadbek Khasanov</h1>
          <p className="text-sm text-neutral-500">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label">Username or Email</label>
            <input
              type="text"
              required
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username or email"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label">Password</label>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-neutral-500">
          New student?{" "}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
