import { Navigate, Outlet } from "react-router-dom";
import { tokenStorage } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";

export default function AdminProtectedRoute() {
  const { user, isLoading } = useAuth();
  const isAdminAuth =
    localStorage.getItem("el_admin_auth") === "true" ||
    user?.username === "admin2010" ||
    user?.role === "admin";
  const adminToken = localStorage.getItem("el_admin_token") || tokenStorage.getAccess();

  if (isLoading) return null;
  if (!isAdminAuth || !adminToken) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
