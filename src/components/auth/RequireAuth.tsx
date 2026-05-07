import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/components/auth/AuthProvider";

export function RequireAuth() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
