import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  changeTeacherPassword,
  getMyUnifiedProfile,
  removeMyAvatar,
  updateMyUnifiedProfile,
  uploadMyAvatar,
} from "@/services/lmsService";
import { getFileUrl } from "@/services/api";
import { LoadingRows, StatCard } from "@/components/ui";
import { UserProfileOut } from "@/types";

export default function TeacherProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfileOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [telegram, setTelegram] = useState("");
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Photo upload state
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password Change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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
      .catch(() => toast.error("Failed to load teacher profile"))
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

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      toast.error("Password must contain uppercase, lowercase, number, and special character");
      return;
    }

    setIsChangingPassword(true);
    try {
      await changeTeacherPassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      toast.success("Password changed successfully!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to change password");
    } finally {
      setIsChangingPassword(false);
    }
  }

  if (isLoading) {
    return <LoadingRows rows={6} />;
  }
  if (!profile) return null;

  const initials = `${profile.first_name?.[0] || profile.full_name?.[0] || "T"}${
    profile.last_name?.[0] || ""
  }`.toUpperCase();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Teacher Profile & Settings</h1>
        <p className="text-sm text-neutral-500">Manage your profile, public bio, and platform settings</p>
      </div>

      {/* Main Profile Card */}
      <div className="card space-y-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="relative">
              {profile.avatar_url ? (
                <img
                  src={getFileUrl(profile.avatar_url)}
                  alt={profile.full_name}
                  className="h-24 w-24 rounded-full border-2 border-brand-100 object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white shadow-sm">
                  {initials}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-neutral-900">{profile.full_name}</h2>
                <span className="badge bg-purple-50 text-purple-700 capitalize">{profile.role}</span>
              </div>
              <p className="text-sm font-medium text-brand-600">@{profile.username}</p>
              <p className="mt-1 text-xs text-neutral-400">{profile.email}</p>
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
            {profile.bio || <span className="italic text-neutral-400">No bio added yet. Click &quot;Edit Profile&quot; to add a teacher bio.</span>}
          </p>
        </div>

        {/* Profile Details List */}
        <div className="divide-y divide-neutral-100 border-t border-neutral-100 pt-2 text-sm">
          <div className="flex justify-between py-2.5">
            <span className="text-neutral-500">Username</span>
            <span className="font-semibold text-neutral-800">{profile.username}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-neutral-500">Email</span>
            <span className="font-medium text-neutral-800">{profile.email}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-neutral-500">Telegram / Contact</span>
            <span className="font-medium text-neutral-800">{profile.telegram_username || "—"}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-neutral-500">Role</span>
            <span className="font-medium capitalize text-neutral-800">{profile.role}</span>
          </div>
        </div>
      </div>

      {/* Real Statistics Cards */}
      <div>
        <h3 className="text-lg font-bold text-neutral-900">Teaching Platform Statistics</h3>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Students" value={profile.stats.total_students ?? 0} hint="Enrolled students" />
          <StatCard label="Active Groups" value={profile.stats.total_groups ?? 0} hint="Classes in progress" />
          <StatCard label="Published Tasks" value={profile.stats.total_assignments ?? 0} hint="Assignments created" />
          <StatCard label="Pending Grading" value={profile.stats.pending_submissions ?? 0} hint="Awaiting evaluation" />
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
                <label className="label">Telegram Username / Contact</label>
                <input
                  className="input"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@username or phone"
                />
              </div>

              <div>
                <label className="label">Bio / About Me</label>
                <textarea
                  rows={4}
                  className="input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell students about your qualifications and teaching philosophy..."
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

      {/* Password Change Card */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-neutral-900 border-b pb-2">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input
              required
              type="password"
              className="input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
            />
          </div>

          <div>
            <label className="label">New Password</label>
            <input
              required
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars, A-Z, a-z, 0-9, special)"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Must include at least 8 characters, 1 uppercase, 1 lowercase, 1 digit, and 1 special character.
            </p>
          </div>

          <div>
            <label className="label">Confirm New Password</label>
            <input
              required
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isChangingPassword} className="btn-primary">
              {isChangingPassword ? "Updating Password..." : "Update Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
