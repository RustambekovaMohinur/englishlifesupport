import { useAuth } from "@/hooks/useAuth";

export default function TeacherProfilePage() {
  const { user } = useAuth();
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Profile</h1>
        <p className="text-sm text-neutral-500">Your account details</p>
      </div>
      <div className="card space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Email</span>
          <span className="font-medium text-neutral-800">{user?.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Role</span>
          <span className="font-medium capitalize text-neutral-800">{user?.role}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-500">Status</span>
          <span className="font-medium text-neutral-800">{user?.is_active ? "Active" : "Inactive"}</span>
        </div>
      </div>
    </div>
  );
}
