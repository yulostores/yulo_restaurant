import { Navigate, useLocation } from "react-router-dom";
import { homeRouteForRole, useStaffAuth } from "@/context/StaffAuthContext";

// role: "waiter" | "chef" | undefined (any staff)
export default function StaffRoute({ children, role }) {
  const { isAuthenticated, ready, staff } = useStaffAuth();
  const location = useLocation();

  // A stored token is still being validated against the server. Redirecting now
  // would sign out every waiter who simply refreshed the page mid-shift.
  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#14100C]">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#F2A65A]" />
          <p className="text-sm text-white/40">Restoring your shift…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/staff/login" replace state={{ from: location.pathname }} />;
  }

  if (role && staff?.role !== role) {
    // Authenticated but wrong role — send them to their own portal.
    return <Navigate to={homeRouteForRole(staff?.role)} replace />;
  }

  return children;
}
