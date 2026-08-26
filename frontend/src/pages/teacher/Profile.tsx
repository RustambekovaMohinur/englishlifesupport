import { FormEvent, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/hooks/useAuth";
import { changeTeacherPassword, getMyTeacherProfile, updateTeacherProfile } from "@/services/lmsService";
import { tokenStorage } from "@/services/api";
import { TeacherProfileOut } from "@/types";

export default function TeacherProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<TeacherProfileOut | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Profile Edit state
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPasswordForUsername, setCurrentPasswordForUsername] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Password Change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  function loadProfile() {
    setIsLoading(true);
    getMyTeacherProfile()
      .then((data) => {
        setProfile(data);
        setFullName(data.full_name);
        setUsername(data.email);
        setPhone(data.phone ?? "");
      })
      .catch(() => toast.error("Failed to load teacher profile"))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadProfile();
  }, []);

  const isUsernameChanged = profile ? username.trim().toLowerCase() !== profile.email.toLowerCase() : false;

  async function handleUpdateProfile(e: FormEvent) {
    e.preventDefault();
    if (isUsernameChanged && !currentPasswordForUsername) {
      toast.error("Current password is required to change username");
      return;
    }

    setIsUpdatingProfile(true);
    try {
      const res: any = await updateTeacherProfile({
        full_name: fullName,
        phone: phone || undefined,
        email: username !== profile?.email ? username : undefined,
        current_password: isUsernameChanged ? currentPasswordForUsername : undefined,
      });

      if (res.access_token && res.refresh_token) {
        tokenStorage.setTokens(res.access_token, res.refresh_token);
        toast.success("Profile & Username updated. Re-authenticated with new credentials.");
      } else {
        toast.success("Profile updated successfully");
      }
      setCurrentPasswordForUsername("");
      loadProfile();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to update profile");
    } finally {
      setIsUpdatingProfile(false);
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
    return <div className="p-6 text-neutral-500">Loading profile...</div>;
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Teacher Settings & Profile</h1>
        <p className="text-sm text-neutral-500">Manage account details and security</p>
      </div>

      {/* Account Info Card */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold text-neutral-900 border-b pb-2">Profile Information</h2>
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input
              required
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full Name"
            />
          </div>

          <div>
            <label className="label">Username</label>
            <input
              required
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
            />
          </div>

          {isUsernameChanged && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <p className="text-xs font-semibold text-amber-800">
                Security confirmation: Entering a new username requires your current password.
              </p>
              <label className="label text-amber-900">Current Password</label>
              <input
                required
                type="password"
                className="input"
                value={currentPasswordForUsername}
                onChange={(e) => setCurrentPasswordForUsername(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
          )}

          <div>
            <label className="label">Phone / Contact (Optional)</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 123 45 67"
            />
          </div>

          <div className="flex justify-between items-center text-xs text-neutral-500 pt-2 border-t">
            <span>Role: <strong className="capitalize text-neutral-800">{user?.role}</strong></span>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isUpdatingProfile} className="btn-primary">
              {isUpdatingProfile ? "Saving..." : "Save Profile Changes"}
            </button>
          </div>
        </form>
      </div>

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
