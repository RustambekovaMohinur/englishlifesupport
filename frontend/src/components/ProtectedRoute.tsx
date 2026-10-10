import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Spinner } from "@/components/ui";
import { UserRole } from "@/types";

export default function ProtectedRoute({ allowedRole }: { allowedRole: UserRole }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Role enforcement is cosmetic on the frontend only - the backend
  // independently verifies the role on every request via require_teacher /
  // require_student, so a manipulated frontend route can never grant real access.
  if (user.role !== allowedRole) {
    return <Navigate to={user.role === "teacher" ? "/teacher" : "/student"} replace />;
  }

  return <Outlet />;
}
