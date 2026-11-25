import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";

export default function BillingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/student/profile", { replace: true });
  }, [navigate]);

  return (
    <div className="max-w-2xl mx-auto py-16 text-center space-y-5">
      <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center text-3xl shadow-sm">
        ✨
      </div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center justify-center gap-2">
        <span>All Features Are 100% Free!</span>
      </h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
        All profile themes, custom emoji stickers, comprehensive AI evaluations, and collaborative study tools are unlocked for all students.
      </p>
      <div>
        <button
          type="button"
          onClick={() => navigate("/student/profile")}
          className="btn-primary text-xs py-2.5 px-5 rounded-xl font-bold inline-flex items-center gap-2 cursor-pointer shadow-sm"
        >
          <span>Go to My Profile</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
