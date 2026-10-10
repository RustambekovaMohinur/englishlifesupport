import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { LoadingRows } from "@/components/ui";
import { getMyStudentProfile } from "@/services/lmsService";
import { StudentOut } from "@/types";

export default function StudentProfilePage() {
  const [profile, setProfile] = useState<StudentOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getMyStudentProfile()
      .then(setProfile)
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <LoadingRows rows={4} />;
  if (!profile) return null;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Profile</h1>
        <p className="text-sm text-neutral-500">Your account details</p>
      </div>
      <div className="card space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Full name</span>
          <span className="font-medium text-neutral-800">{profile.full_name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Email</span>
          <span className="font-medium text-neutral-800">{profile.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Phone</span>
          <span className="font-medium text-neutral-800">{profile.phone ?? "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Group</span>
          <span className="font-medium text-neutral-800">{profile.group?.name ?? "Not assigned yet"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">English level</span>
          <span className="font-medium capitalize text-neutral-800">
            {profile.group?.english_level.replace("_", " ") ?? "—"}
          </span>
        </div>
        <div className="flex justify-between items-center gap-3">
          <span className="text-neutral-500">Telegram</span>
          <div className="text-right">
            {profile.telegram_connected ? (
              <>
                <div className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  Connected
                </div>
                <div className="mt-1 text-sm font-medium text-neutral-800">
                  {profile.telegram_username ? `@${profile.telegram_username.replace(/^@/, "")}` : `ID: ${profile.telegram_chat_id}`}
                </div>
              </>
            ) : (
              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                Not connected
              </span>
            )}
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Total stars</span>
          <span className="font-medium text-neutral-800">⭐ {profile.total_stars}</span>
        </div>
      </div>
    </div>
  );
}
