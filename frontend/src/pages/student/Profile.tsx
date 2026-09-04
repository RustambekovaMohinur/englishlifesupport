import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { LoadingRows, StatCard } from "@/components/ui";
import {
  getMyUnifiedProfile,
  removeMyAvatar,
  updateMyUnifiedProfile,
  uploadMyAvatar,
} from "@/services/lmsService";
import { getFileUrl } from "@/services/api";
import { UserProfileOut } from "@/types";

export default function StudentProfilePage() {
  const [profile, setProfile] = useState<UserProfileOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Edit modal state
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [telegram, setTelegram] = useState("");
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Photo upload state
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadProfile() {
    setIsLoading(true);
    getMyUnifiedProfile()
      .then((data) => {
        setProfile(data);
        setFirstName(data.first_name || "");
        setLastName(data.last_name || "");
        setTelegram(data.telegram_username || data.phone || "");
        setBio(data.bio || "");
      })
      .catch(() => toast.error("Failed to load profile"))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function handlePhotoSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (JPG, PNG, WEBP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile photo must be smaller than 5MB");
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const updated = await uploadMyAvatar(file);
      setProfile(updated);
      toast.success("Profile photo updated!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to upload profile photo");
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemovePhoto() {
    if (!window.confirm("Are you sure you want to remove your profile photo?")) return;
    setIsUploadingPhoto(true);
    try {
      const updated = await removeMyAvatar();
      setProfile(updated);
      toast.success("Profile photo removed");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to remove profile photo");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("First name and last name are required");
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateMyUnifiedProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        telegram_username: telegram.trim(),
        bio: bio.trim(),
      });
      setProfile(updated);
      setIsEditing(false);
      toast.success("Profile updated successfully!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <LoadingRows rows={6} />;
  if (!profile) return null;

  const initials = `${profile.first_name?.[0] || profile.full_name?.[0] || "S"}${
    profile.last_name?.[0] || ""
  }`.toUpperCase();

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">My Profile</h1>
        <p className="text-sm text-neutral-500">Manage your personal information and profile settings</p>
      </div>

      {/* Main Profile Card */}
      <div className="card space-y-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            {/* Avatar container */}
            <div className="relative">
              {profile.avatar_url ? (
                <img
                  src={getFileUrl(profile.avatar_url)}
                  alt={profile.full_name}
                  className="h-24 w-24 rounded-full border-2 border-brand-100 object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-500 text-2xl font-bold text-white shadow-sm">
                  {initials}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-neutral-900">{profile.full_name}</h2>
                <span className="badge bg-emerald-50 text-emerald-700 capitalize">{profile.role}</span>
              </div>
              <p className="text-sm font-medium text-brand-600">@{profile.username}</p>
              <p className="mt-1 text-xs text-neutral-400">
                {profile.group_name ? `${profile.group_name} • ${profile.english_level?.replace("_", " ")}` : "No group assigned"}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoSelected}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhoto}
              className="btn-secondary text-xs"
            >
              {isUploadingPhoto ? "Uploading..." : profile.avatar_url ? "Change Photo" : "Upload Photo"}
            </button>
            {profile.avatar_url && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={isUploadingPhoto}
                className="btn-secondary text-xs text-red-600 hover:bg-red-50"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="btn-primary text-xs"
            >
              Edit Profile
            </button>
          </div>
        </div>

        {/* Bio Section */}
        <div className="rounded-xl bg-neutral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">About Me / Bio</p>
          <p className="mt-1 text-sm text-neutral-700 whitespace-pre-wrap">
            {profile.bio || <span className="italic text-neutral-400">No bio added yet. Click &quot;Edit Profile&quot; to add a bio.</span>}
          </p>
        </div>

        {/* Profile Details List */}
        <div className="divide-y divide-neutral-100 border-t border-neutral-100 pt-2 text-sm">
          <div className="flex justify-between py-2.5">
            <span className="text-neutral-500">Username</span>
            <span className="font-semibold text-neutral-800">{profile.username}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-neutral-500">Telegram Username</span>
            <span className="font-medium text-neutral-800">{profile.telegram_username || "—"}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-neutral-500">Assigned Group</span>
            <span className="font-medium text-neutral-800">{profile.group_name || "—"}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-neutral-500">English Level</span>
            <span className="font-medium capitalize text-neutral-800">
              {profile.english_level?.replace("_", " ") || "—"}
            </span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-neutral-500">System ID</span>
            <span className="font-mono text-xs text-neutral-400">{profile.user_id}</span>
          </div>
        </div>
      </div>

      {/* Real Statistics Cards */}
      <div>
        <h3 className="text-lg font-bold text-neutral-900">My Learning Statistics</h3>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Stars" value={`⭐ ${profile.stats.total_stars ?? 0}`} hint="Earned from homework" />
          <StatCard label="Submissions" value={profile.stats.total_submissions ?? 0} hint="All submitted tasks" />
          <StatCard label="Graded Tasks" value={profile.stats.graded_submissions ?? 0} hint="Teacher evaluated" />
          <StatCard label="Avg Score" value={profile.stats.average_score ? `${profile.stats.average_score}/10` : "—"} hint="Average grade" />
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-lg font-bold text-neutral-900">Edit Profile</h3>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">First name *</label>
                  <input
                    required
                    className="input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Last name *</label>
                  <input
                    required
                    className="input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label">Telegram Username</label>
                <input
                  className="input"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@username"
                />
              </div>

              <div>
                <label className="label">Bio / About Me</label>
                <textarea
                  rows={4}
                  className="input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Share a few words about your English learning goals..."
                  maxLength={2000}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="btn-secondary"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
