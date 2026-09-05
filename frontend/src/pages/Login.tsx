import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Logo, Modal } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { AxiosError } from "axios";
import { FaInstagram, FaTelegramPlane } from "react-icons/fa";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotModalOpen, setForgotModalOpen] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const user = await login(username, password);
      navigate(user.role === "teacher" ? "/teacher" : "/student");
    } catch (err) {
      if (err instanceof AxiosError && err.response?.data) {
        const data = err.response.data;
        const errObj = data.error;
        if (errObj && errObj.code) {
          if (errObj.code === "ACCOUNT_PENDING_APPROVAL") {
            toast.error(errObj.message || "Your account is waiting for teacher approval.");
            return;
          }
          if (errObj.code === "ACCOUNT_REJECTED") {
            toast.error(errObj.message || "Your account has been rejected.");
            return;
          }
        }
        const message = data.detail ?? "Invalid username or password";
        toast.error(typeof message === "string" ? message : "Invalid username or password");
      } else {
        toast.error("Something went wrong");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleForgotPassword() {
    setForgotModalOpen(true);
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
        {/* Social media follow section */}
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
            Follow Asadbek Khasanov
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <a
              href={import.meta.env.VITE_INSTAGRAM_URL || "https://instagram.com/teacher_khasanov"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-bold text-pink-700 bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-xl transition shadow-xs"
            >
              <FaInstagram className="text-pink-600 text-base" />
              <span>Follow on Instagram</span>
            </a>
            <a
              href={import.meta.env.VITE_TELEGRAM_URL || "https://t.me/Khasanov_SK"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition shadow-xs"
            >
              <FaTelegramPlane className="text-sky-600 text-base" />
              <span>Join Telegram Channel</span>
            </a>
          </div>
        </div>

        {/* Forgot Password Dialog */}
        <Modal open={forgotModalOpen} onClose={() => setForgotModalOpen(false)} title="Forgot Password?">
          <div className="space-y-4 text-sm text-neutral-600">
            <p>
              To protect student accounts and avoid lost passwords, account passwords are managed directly by your teacher.
            </p>
            <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4">
              <h4 className="font-bold text-brand-900 text-sm">How to reset your password:</h4>
              <p className="mt-1 text-xs text-brand-800 leading-relaxed">
                Please contact your teacher <strong className="text-neutral-900">Asadbek Khasanov</strong> directly on Telegram or in your class. Your teacher will immediately set a new temporary password for your account.
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
  );
}
