import { Navigate, Outlet } from "react-router-dom";
import { tokenStorage } from "@/services/api";

export default function AdminProtectedRoute() {
  const isAdminAuth = localStorage.getItem("el_admin_auth") === "true";
  const adminToken = localStorage.getItem("el_admin_token") || tokenStorage.getAccess();

  if (!isAdminAuth || !adminToken) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
