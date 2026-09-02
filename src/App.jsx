// Route table for every portal. All data comes from the real backend via
// src/api/*.api.js — see API.md for the endpoint contract.

import { Navigate, Route, Routes } from "react-router-dom";

import OwnerDashboard from "./screens/OwnerDashboard";
import MenuManagement from "./screens/MenuManagement";
import QrManagement from "./screens/QrManagement";
import Offers from "./screens/Offers";
import LiveMonitor from "./screens/LiveMonitor";
import ManageOrders from "./screens/ManageOrders";
import Cancellations from "./screens/Cancellations";
import MenuItems from "./screens/MenuItems";
import StoreSettings from "./screens/StoreSettings";
import BillDetails from "./screens/BillDetails";
import Profile from "./screens/Profile";
import StaffManagement from "./screens/StaffManagement";
import ChefDashboard from "./screens/ChefDashboard";
import ManagerDashboard from "./screens/manager/ManagerDashboard";
import ManagerLiveMonitoring from "./screens/manager/ManagerLiveMonitoring";
import ManagerOrders from "./screens/manager/ManagerOrders";
import ManagerRequests from "./screens/manager/ManagerRequests";
import ManagerTables from "./screens/manager/ManagerTables";
import CustomerApp from "./screens/customer/CustomerApp";
import WaiterApp from "./screens/waiter/WaiterApp";
import AdminApp from "./screens/admin/AdminApp";
import AdminLogin from "./screens/admin/AdminLogin";
import OwnerLoginPage from "./screens/auth/OwnerLoginPage";
import StaffLoginPage from "./screens/auth/StaffLoginPage";
import OwnerRoute from "./components/OwnerRoute";
import ApprovalGate from "./components/ApprovalGate";
import StaffRoute from "./components/StaffRoute";
import AdminRoute from "./components/AdminRoute";

export default function App() {
  return (
    <Routes>
      {/* ── Auth routes (public) ─────────────────────────────────────── */}
      <Route path="/owner/login" element={<OwnerLoginPage />} />
      <Route path="/staff/login" element={<StaffLoginPage />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* ── Owner portal (protected) ───────────────────────────────────
          OwnerRoute checks the session; ApprovalGate then locks everything
          except /store-settings and /profile until an admin sets the
          restaurant's approvalStatus to "active" (see lib/approval.js). */}
      <Route path="/" element={<OwnerRoute><ApprovalGate><OwnerDashboard /></ApprovalGate></OwnerRoute>} />
      <Route path="/dashboard" element={<OwnerRoute><ApprovalGate><OwnerDashboard /></ApprovalGate></OwnerRoute>} />
      <Route path="/menu-management" element={<OwnerRoute><ApprovalGate><MenuManagement /></ApprovalGate></OwnerRoute>} />
      <Route path="/qr" element={<OwnerRoute><ApprovalGate><QrManagement /></ApprovalGate></OwnerRoute>} />
      <Route path="/offers" element={<OwnerRoute><ApprovalGate><Offers /></ApprovalGate></OwnerRoute>} />
      <Route path="/orders" element={<OwnerRoute><ApprovalGate><ManageOrders /></ApprovalGate></OwnerRoute>} />
      <Route path="/bill" element={<OwnerRoute><ApprovalGate><BillDetails /></ApprovalGate></OwnerRoute>} />
      <Route path="/cancellations" element={<OwnerRoute><ApprovalGate><Cancellations /></ApprovalGate></OwnerRoute>} />
      <Route path="/menu-items" element={<OwnerRoute><ApprovalGate><MenuItems /></ApprovalGate></OwnerRoute>} />
      <Route path="/live-monitor" element={<OwnerRoute><ApprovalGate><LiveMonitor /></ApprovalGate></OwnerRoute>} />
      <Route path="/store-settings" element={<OwnerRoute><ApprovalGate><StoreSettings /></ApprovalGate></OwnerRoute>} />
      <Route path="/staff" element={<OwnerRoute><ApprovalGate><StaffManagement /></ApprovalGate></OwnerRoute>} />
      <Route path="/profile" element={<OwnerRoute><ApprovalGate><Profile /></ApprovalGate></OwnerRoute>} />

      {/* ── Customer QR ordering app (public — OTP guards internally) ── */}
      <Route path="/order/*" element={<CustomerApp />} />

      {/* ── Staff portals (protected by role) ────────────────────────── */}
      <Route path="/chef" element={<StaffRoute role="chef"><ChefDashboard /></StaffRoute>} />
      <Route path="/waiter/*" element={<StaffRoute role="waiter"><WaiterApp /></StaffRoute>} />

      {/* ── Manager portal ────────────────────────────────────────────── */}
      {/* The backend has no `manager` role — these screens run on the owner
          session and read the owner-scoped endpoints. See API-GAPS.md. */}
      <Route path="/manager" element={<OwnerRoute><ApprovalGate><ManagerDashboard /></ApprovalGate></OwnerRoute>} />
      <Route path="/manager/dashboard" element={<OwnerRoute><ApprovalGate><ManagerDashboard /></ApprovalGate></OwnerRoute>} />
      <Route path="/manager/orders" element={<OwnerRoute><ApprovalGate><ManagerOrders /></ApprovalGate></OwnerRoute>} />
      <Route path="/manager/live" element={<OwnerRoute><ApprovalGate><ManagerLiveMonitoring /></ApprovalGate></OwnerRoute>} />
      <Route path="/manager/requests" element={<OwnerRoute><ApprovalGate><ManagerRequests /></ApprovalGate></OwnerRoute>} />
      <Route path="/manager/tables" element={<OwnerRoute><ApprovalGate><ManagerTables /></ApprovalGate></OwnerRoute>} />

      {/* ── Platform Admin portal ─────────────────────────────────────── */}
      <Route path="/admin/*" element={<AdminRoute><AdminApp /></AdminRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
