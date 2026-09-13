import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { LoadingRows, StatCard } from "@/components/ui";
import {
  changeUserPassword,
  getMyUnifiedProfile,
  removeMyAvatar,
  updateMyUnifiedProfile,
  uploadMyAvatar,
} from "@/services/lmsService";
import { KeyRound, LogOut } from "lucide-react";
import { getFileUrl } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { UserProfileOut } from "@/types";

export default function StudentProfilePage() {
  const { logout } = useAuth();
  const [profile, setProfile] = useState<UserProfileOut | null>(null);
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
      .catch(() => toast.error("Profil ma'lumotlarini yuklab bo'lmadi"))
      .finally(() => setIsLoading(false));
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function handlePhotoSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Iltimos, rasm fayli yuklang (JPG, PNG, WEBP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Rasm hajmi 5MB dan kichik bo'lishi lozim");
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const updated = await uploadMyAvatar(file);
      setProfile(updated);
      toast.success("Profil rasmi yangilandi!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Profil rasmini yuklashda xatolik");
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemovePhoto() {
    if (!window.confirm("Profil rasmini o'chirishni tasdiqlaysizmi?")) return;
    setIsUploadingPhoto(true);
    try {
      const updated = await removeMyAvatar();
      setProfile(updated);
      toast.success("Profil rasmi o'chirildi");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Profil rasmini o'chirishda xatolik");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast.error("Ism va familiya kiritilishi shart");
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
      setIsEditing(false);
      toast.success("Profil muvaffaqiyatli saqlandi!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Profilni yangilashda xatolik");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleChangePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!oldPassword) {
      toast.error("Eski parolni kiriting");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Yangi parol kamida 6 belgidan iborat bo'lishi kerak");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Yangi parollar mos kelmadi");
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await changeUserPassword({
        old_password: oldPassword,
        new_password: newPassword,
      });
      toast.success(res.message || "Parol muvaffaqiyatli yangilandi!");
      setIsPasswordModalOpen(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Parolni o'zgartirishda xatolik yuz berdi");
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
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Mening profilim</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Shaxsiy ma&apos;lumotlar va hisob sozlamalari</p>
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
                  className="h-24 w-24 rounded-full border-2 border-brand-100 dark:border-brand-800 object-cover shadow-sm"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-500 text-2xl font-bold text-white shadow-sm">
                  {initials}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{profile.full_name}</h2>
                <span className="badge bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 capitalize">{profile.role}</span>
              </div>
              <p className="text-sm font-medium text-brand-600 dark:text-brand-400">@{profile.username}</p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                {profile.group_name ? `${profile.group_name} • ${profile.english_level?.replace("_", " ")}` : "Guruh biriktirilmagan"}
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
              {isUploadingPhoto ? "Yuklanmoqda..." : profile.avatar_url ? "Rasmni almashtirish" : "Rasm yuklash"}
            </button>
            {profile.avatar_url && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={isUploadingPhoto}
                className="btn-secondary text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                O&apos;chirish
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
              Profilni tahrirlash
            </button>
          </div>
        </div>

        {/* Bio Section */}
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900 p-4 border border-zinc-200/60 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Men haqimda / Bio</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
            {profile.bio || <span className="italic text-zinc-400 dark:text-zinc-500">Bio yozilmagan. O&apos;zingiz haqida ma&apos;lumot qo&apos;shish uchun &quot;Profilni tahrirlash&quot; tugmasini bosing.</span>}
          </p>
        </div>

        {/* Profile Details List */}
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800 border-t border-zinc-100 dark:border-zinc-800 pt-2 text-sm">
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-500 dark:text-zinc-400">Foydalanuvchi nomi (Username)</span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 font-mono">@{profile.username}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-500 dark:text-zinc-400">Telegram / Telefon</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{profile.telegram_username || profile.phone || "—"}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-500 dark:text-zinc-400">Biriktirilgan guruh</span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">{profile.group_name || "—"}</span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-500 dark:text-zinc-400">Ingliz tili darajasi</span>
            <span className="font-medium capitalize text-zinc-800 dark:text-zinc-200">
              {profile.english_level?.replace("_", " ") || "—"}
            </span>
          </div>
          <div className="flex justify-between py-2.5">
            <span className="text-zinc-500 dark:text-zinc-400">ID raqam</span>
            <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">{profile.user_id}</span>
          </div>
        </div>

        {/* Password & Security Card */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Xavfsizlik va Parol</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Hisobingiz xavfsizligini ta&apos;minlash uchun parolingizni yangilab turing</p>
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
            <span>Parolni o&apos;zgartirish</span>
          </button>
        </div>

        {/* Mobile & Quick Sign Out Action */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Tizimdan chiqish</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Joriy hisobdan xavfsiz chiqish</p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 font-semibold text-xs transition active:scale-95 border border-red-200 dark:border-red-800/60 shadow-xs w-full sm:w-auto"
          >
            <LogOut className="w-4 h-4" />
            <span>Tizimdan chiqish (Log Out)</span>
          </button>
        </div>
      </div>

      {/* Real Statistics Cards */}
      <div>
        <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Mening o&apos;rganish statistikam</h3>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Jami Yulduzlar" value={`⭐ ${profile.stats.total_stars ?? 0}`} hint="Topshiriqlardan yig'ilgan" />
          <StatCard label="Yuborilgan vazifalar" value={profile.stats.total_submissions ?? 0} hint="Jami topshirilgan" />
          <StatCard label="Baholanganlar" value={profile.stats.graded_submissions ?? 0} hint="O'qituvchi tekshirgan" />
          <StatCard label="O'rtacha Ball" value={profile.stats.average_score ? `${profile.stats.average_score}/10` : "—"} hint="O'rtacha natija" />
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Profilni tahrirlash</h3>
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
                  <label className="label">Ism *</label>
                  <input
                    required
                    className="input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Familiya *</label>
                  <input
                    required
                    className="input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="label">Foydalanuvchi nomi (Username) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-400 font-mono text-sm">@</span>
                  <input
                    required
                    minLength={3}
                    className="input pl-7 font-mono text-sm"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="foydalanuvchi_nomi"
                  />
                </div>
              </div>

              <div>
                <label className="label">Telegram Username / Telefon</label>
                <input
                  className="input"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@username yoki +998..."
                />
              </div>

              <div>
                <label className="label">Men haqimda (Bio)</label>
                <textarea
                  rows={4}
                  className="input"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Ingliz tili o'rganish maqsadlaringiz haqida qisqacha..."
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
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSaving}
                >
                  {isSaving ? "Saqlanmoqda..." : "O'zgarishlarni saqlash"}
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
                <span>Parolni o&apos;zgartirish</span>
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
                <label className="label">Eski parol *</label>
                <input
                  type="password"
                  required
                  className="input"
                  placeholder="Amaldagi parolingizni kiriting"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Yangi parol *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="input"
                  placeholder="Kamida 6 ta belgi"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Yangi parolni tasdiqlang *</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  className="input"
                  placeholder="Yangi parolni qayta kiriting"
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
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isChangingPassword}
                >
                  {isChangingPassword ? "Yangilanmoqda..." : "Parolni yangilash"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

