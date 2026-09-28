import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { LoadingRows, StatCard } from "@/components/ui";
import {
  changeUserPassword,
  getMyUnifiedProfile,
  getParentLinkInfo,
  removeMyAvatar,
  unlinkParent,
  updateMyUnifiedProfile,
  uploadMyAvatar,
} from "@/services/lmsService";
import { Check, Copy, ExternalLink, KeyRound, LogOut, QrCode, Send, ShieldCheck, UserCheck } from "lucide-react";
import { getFileUrl } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { ParentLinkInfo, UserProfileOut } from "@/types";

export default function StudentProfilePage() {
  const { logout, updateUser } = useAuth();
  const [profile, setProfile] = useState<UserProfileOut | null>(null);
  const [parentLink, setParentLink] = useState<ParentLinkInfo | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Edit modal state
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [telegram, setTelegram] = useState("");
  const [bio, setBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Password change state
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

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
        setUsername(data.username || "");
        setTelegram(data.telegram_username || data.phone || "");
        setBio(data.bio || "");
      })
      .catch(() => toast.error("Failed to load profile details"))
      .finally(() => setIsLoading(false));

    getParentLinkInfo()
      .then(setParentLink)
      .catch(() => {});
  }

  const copyParentLink = () => {
    if (!parentLink?.telegram_link) return;
    navigator.clipboard.writeText(parentLink.telegram_link);
    setIsCopied(true);
    toast.success("Havola nusxalandi!");
    setTimeout(() => setIsCopied(false), 2500);
  };

  const handleUnlinkParent = async () => {
    if (!window.confirm("Ota-onangiz hisobini Telegram botdan uzmoqchimisiz?")) return;
    setIsUnlinking(true);
    try {
      await unlinkParent();
      toast.success("Ota-ona Telegram boti muvaffaqiyatli uzildi");
      const updated = await getParentLinkInfo();
      setParentLink(updated);
    } catch {
      toast.error("Uzishda xatolik yuz berdi");
    } finally {
      setIsUnlinking(false);
    }
  };

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
        username: username.trim() || undefined,
        telegram_username: telegram.trim(),
        bio: bio.trim(),
      });
      setProfile(updated);
      updateUser({
        username: updated.username,
        full_name: updated.full_name,
        first_name: updated.first_name,
      });
      setIsEditing(false);
      toast.success("Profile updated successfully!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleChangePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!oldPassword) {
      toast.error("Current password is required");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await changeUserPassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      toast.success(res.message || "Password updated successfully!");
      setIsPasswordModalOpen(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail && typeof detail === "string" && (detail.includes("noto'g'ri") || detail.includes("incorrect"))) {
        toast.error("Current password is incorrect");
      } else {
        toast.error(detail ?? "Failed to change password");
      }
    } finally {
      setIsChangingPassword(false);
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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">My Profile</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Personal information and account settings</p>
      </div>

      {/* Main Profile Card */}
      <div className="card space-y-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            {/* Perfectly Circular Avatar Container */}
            <div className="w-24 h-24 rounded-full overflow-hidden shrink-0 border-2 border-indigo-500/20 dark:border-indigo-400/20 shadow-md relative bg-zinc-100 dark:bg-zinc-800">
              {profile.avatar_url ? (
                <img
                  src={getFileUrl(profile.avatar_url)}
                  alt={profile.full_name}
                  className="w-full h-full object-cover rounded-full aspect-square block"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                    const fallback = (e.target as HTMLElement).nextElementSibling;
                    if (fallback) (fallback as HTMLElement).style.display = "flex";
                  }}
                />
              ) : null}
              <div
                style={{ display: profile.avatar_url ? "none" : "flex" }}
                className="w-full h-full rounded-full items-center justify-center font-bold text-xl select-none bg-gradient-to-br from-indigo-500/15 to-brand-500/20 dark:from-indigo-900/40 dark:to-brand-900/40 text-indigo-700 dark:text-indigo-300"
              >
                {initials}
              </div>
            </div>


            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{profile.full_name}</h2>
                <span className="badge bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 capitalize">{profile.role}</span>
              </div>
              <p className="text-sm font-medium text-brand-600 dark:text-brand-400">@{profile.username}</p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                {profile.group_name ? `${profile.group_name} • ${profile.english_level?.replace("_", " ")}` : "No cohort assigned"}
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
                className="btn-secondary text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setFirstName(profile.first_name || "");
                setLastName(profile.last_name || "");
                setUsername(profile.username || "");
                setTelegram(profile.telegram_username || profile.phone || "");
                setBio(profile.bio || "");
                setIsEditing(true);
              }}
              className="btn-primary text-xs"
            >
              Edit Profile
            </button>
          </div>
        </div>

        {/* Bio Section */}
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-4 border border-zinc-200/60 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">ABOUT ME / BIO</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
            {profile.bio || <span className="italic text-zinc-400 dark:text-zinc-500">No bio provided. Click &quot;Edit Profile&quot; to add details about your learning goals.</span>}
          </p>
        </div>

        {/* Profile Details List */}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border-t border-zinc-100 dark:border-zinc-800 pt-2 text-sm">
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-500 dark:text-zinc-400">Username</span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 font-mono">@{profile.username}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-500 dark:text-zinc-400">Telegram / Phone</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{profile.telegram_username || profile.phone || "—"}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-500 dark:text-zinc-400">Assigned Cohort / Group</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{profile.group_name || "—"}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-500 dark:text-zinc-400">English Proficiency Level</span>
            <span className="font-medium capitalize text-zinc-800 dark:text-zinc-200">
              {profile.english_level?.replace("_", " ") || "—"}
            </span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-500 dark:text-zinc-400">Candidate ID</span>
            <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{profile.user_id}</span>
          </div>
        </div>

        {/* Parent Telegram Notifications Card */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <span>👨‍👩‍👧</span>
                  <span>Ota-ona bildirishnomalari (Telegram Bot)</span>
                </p>
                {parentLink?.is_parent_linked ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Ulangan</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    Ulanmagan
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                Har bir topshiriq muddati (deadline) tugashi bilan ota-onangizga dars natijalari va yulduzlaringiz haqida avtomatik hisobot boradi.
              </p>
            </div>

            {parentLink?.is_parent_linked && (
              <button
                type="button"
                onClick={handleUnlinkParent}
                disabled={isUnlinking}
                className="self-start sm:self-auto px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 transition active:scale-95 cursor-pointer"
              >
                {isUnlinking ? "Uzilmoqda..." : "Ajratish (Unlink)"}
              </button>
            )}
          </div>

          {parentLink?.is_parent_linked ? (
            <div className="p-4 rounded-xl bg-emerald-500/[0.06] dark:bg-emerald-500/[0.1] border border-emerald-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 text-xs">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>Biriktirilgan ota-ona: <strong>{parentLink.parent_name || `@${parentLink.parent_telegram_username}` || "Telegram Foydalanuvchi"}</strong></span>
                  {parentLink.parent_telegram_username && (
                    <span className="font-mono text-emerald-700 dark:text-emerald-400 font-normal">
                      (@{parentLink.parent_telegram_username})
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {parentLink.parent_linked_at ? `Ulanilgan sana: ${new Date(parentLink.parent_linked_at).toLocaleDateString()}` : "Avtomatik hisobotlar yoqilgan"}
                  {parentLink.last_parent_digest_sent_at && ` · Oxirgi hisobot: ${new Date(parentLink.last_parent_digest_sent_at).toLocaleDateString()}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyParentLink}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition flex items-center gap-1.5 cursor-pointer"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{isCopied ? "Nusxalandi" : "Ulanish havolasi"}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-800/50 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-indigo-950 dark:text-indigo-200">
                    Ota-onangizni bir marta ulab qo'ying:
                  </p>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl">
                    Ota-onangiz quyidagi havola orqali botga kirib <strong>Start</strong> tugmasini bossa bo'lgani, tizim ularni profilingizga avtomatik biriktiradi.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {parentLink?.telegram_link && (
                    <a
                      href={parentLink.telegram_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-semibold text-xs transition active:scale-95 shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5 fill-current" />
                      <span>Telegram Botga Ulash</span>
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={copyParentLink}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold text-xs border border-zinc-200 dark:border-zinc-700 transition active:scale-95 shadow-2xs cursor-pointer"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{isCopied ? "Nusxalandi!" : "Havolani nusxalash"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowQR((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-semibold text-xs border border-zinc-200 dark:border-zinc-700 transition active:scale-95 shadow-2xs cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5 text-brand-600" />
                    <span>{showQR ? "QR Kodni yopish" : "QR Kod"}</span>
                  </button>
                </div>
              </div>

              {/* Collapsible QR Code */}
              {showQR && parentLink?.telegram_link && (
                <div className="pt-3 border-t border-indigo-200/50 dark:border-indigo-800/40 flex flex-col sm:flex-row items-center gap-4">
                  <div className="p-2 bg-white rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xs shrink-0">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(parentLink.telegram_link)}`}
                      alt="Telegram QR Code"
                      className="w-32 h-32 block"
                    />
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300 space-y-1 text-center sm:text-left">
                    <p className="font-bold text-zinc-800 dark:text-zinc-100">
                      Ota-ona telefoni orqali skanerlang
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Ota-onangiz telefon kamerasi orqali ushbu QR kodni ko'rsatib, to'g'ridan-to'g'ri Telegram botga ulanishlari mumkin.
                    </p>
                    <p className="font-mono text-[10px] text-zinc-400 break-all pt-1 select-all">
                      {parentLink.telegram_link}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Password & Security Card */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Security &amp; Password</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Ensure your account is using a secure password</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOldPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setIsPasswordModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-semibold text-xs transition active:scale-95 border border-amber-300 dark:border-amber-700/60 shadow-xs"
          >
            <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>Change Password</span>
          </button>
        </div>

        {/* Mobile & Quick Sign Out Action */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Sign Out</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Log out of your current session</p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 font-semibold text-xs transition active:scale-95 border border-red-200 dark:border-red-800/60 shadow-xs w-full sm:w-auto"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Real Statistics Cards */}
      <div>
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">My Learning Statistics</h3>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Stars" value={`⭐ ${profile.stats.total_stars ?? 0}`} hint="Earned from homework" />
          <StatCard label="Submissions" value={profile.stats.total_submissions ?? 0} hint="All submitted tasks" />
          <StatCard label="Graded Tasks" value={profile.stats.graded_submissions ?? 0} hint="Evaluated by examiner" />
          <StatCard label="Average Score" value={profile.stats.average_score ? `${profile.stats.average_score}/10` : "—"} hint="Average grade" />
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Edit Profile</h3>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">First Name *</label>
                  <input
                    required
                    className="input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Last Name *</label>
                  <input
                    required
                    className="input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label">Username *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-400 font-mono text-sm">@</span>
                  <input
                    required
                    minLength={3}
                    className="input pl-7 font-mono text-sm"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="username"
                  />
                </div>
              </div>

              <div>
                <label className="label">Telegram Username / Phone</label>
                <input
                  className="input"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@username or +998..."
                />
              </div>

              <div>
                <label className="label">About Me (Bio)</label>
                <textarea
                  rows={4}
                  className="input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Share a brief overview of your English learning goals..."
                  maxLength={2000}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
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

      {/* Change Password Modal */}
      {isPasswordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <span>🔑</span>
                <span>Change Password</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div>
                <label className="label">Current Password *</label>
                <input
                  type="password"
                  required
                  className="input"
                  placeholder="Enter your current password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="label">New Password *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="input"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Confirm New Password *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="input"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="btn-secondary"
                  disabled={isChangingPassword}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isChangingPassword}
                >
                  {isChangingPassword ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


