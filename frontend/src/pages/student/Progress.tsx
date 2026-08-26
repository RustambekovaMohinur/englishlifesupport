import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { LoadingRows, StatCard } from "@/components/ui";
import { getStudentDashboard } from "@/services/lmsService";
import { StudentDashboard } from "@/types";

export default function StudentProgressPage() {
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getStudentDashboard()
      .then(setData)
      .catch(() => toast.error("Failed to load progress"))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <LoadingRows rows={4} />;
  if (!data) return null;

  const completionRate = data.total_assignments > 0 ? Math.round((data.completed_assignments / data.total_assignments) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">My Progress</h1>
        <p className="text-sm text-neutral-500">Track your stars and completion over time</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Total Stars" value={`⭐ ${data.total_stars}`} />
        <StatCard label="Average Score" value={data.average_score ?? "—"} hint="out of 10" />
        <StatCard label="Completion Rate" value={`${completionRate}%`} />
      </div>

      <div className="card">
        <h2 className="mb-3 text-base font-semibold text-neutral-900">Assignment Completion</h2>
        <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${completionRate}%` }} />
        </div>
        <p className="mt-2 text-sm text-neutral-500">
          {data.completed_assignments} of {data.total_assignments} assignments completed
        </p>
      </div>
    </div>
  );
}
