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
import PanelSwitcher from "./components/PanelSwitcher";
import OwnerLoginPage from "./screens/auth/OwnerLoginPage";
import StaffLoginPage from "./screens/auth/StaffLoginPage";
import OwnerRoute from "./components/OwnerRoute";
import StaffRoute from "./components/StaffRoute";
import AdminRoute from "./components/AdminRoute";

export default function App() {
  return (
    <>
      <PanelSwitcher />
      <Routes>
        {/* ── Auth routes (public) ─────────────────────────────────────── */}
        <Route path="/owner/login" element={<OwnerLoginPage />} />
        <Route path="/staff/login" element={<StaffLoginPage />} />
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* ── Owner portal (protected) ─────────────────────────────────── */}
        <Route path="/" element={<OwnerRoute><OwnerDashboard /></OwnerRoute>} />
        <Route path="/dashboard" element={<OwnerRoute><OwnerDashboard /></OwnerRoute>} />
        <Route path="/menu-management" element={<OwnerRoute><MenuManagement /></OwnerRoute>} />
        <Route path="/qr" element={<OwnerRoute><QrManagement /></OwnerRoute>} />
        <Route path="/offers" element={<OwnerRoute><Offers /></OwnerRoute>} />
        <Route path="/orders" element={<OwnerRoute><ManageOrders /></OwnerRoute>} />
        <Route path="/bill" element={<OwnerRoute><BillDetails /></OwnerRoute>} />
        <Route path="/cancellations" element={<OwnerRoute><Cancellations /></OwnerRoute>} />
        <Route path="/menu-items" element={<OwnerRoute><MenuItems /></OwnerRoute>} />
        <Route path="/live-monitor" element={<OwnerRoute><LiveMonitor /></OwnerRoute>} />
        <Route path="/store-settings" element={<OwnerRoute><StoreSettings /></OwnerRoute>} />
        <Route path="/staff" element={<OwnerRoute><StaffManagement /></OwnerRoute>} />
        <Route path="/profile" element={<OwnerRoute><Profile /></OwnerRoute>} />

        {/* ── Customer QR ordering app (public — OTP guards internally) ── */}
        <Route path="/order/*" element={<CustomerApp />} />

        {/* ── Staff portals (protected by role) ────────────────────────── */}
        <Route path="/chef" element={<StaffRoute role="chef"><ChefDashboard /></StaffRoute>} />
        <Route path="/waiter/*" element={<StaffRoute role="waiter"><WaiterApp /></StaffRoute>} />

        {/* ── Manager portal ────────────────────────────────────────────── */}
        {/* The backend has no `manager` role — these screens run on the owner
            session and read the owner-scoped endpoints. See API-GAPS.md. */}
        <Route path="/manager" element={<OwnerRoute><ManagerDashboard /></OwnerRoute>} />
        <Route path="/manager/dashboard" element={<OwnerRoute><ManagerDashboard /></OwnerRoute>} />
        <Route path="/manager/orders" element={<OwnerRoute><ManagerOrders /></OwnerRoute>} />
        <Route path="/manager/live" element={<OwnerRoute><ManagerLiveMonitoring /></OwnerRoute>} />
        <Route path="/manager/requests" element={<OwnerRoute><ManagerRequests /></OwnerRoute>} />
        <Route path="/manager/tables" element={<OwnerRoute><ManagerTables /></OwnerRoute>} />

        {/* ── Platform Admin portal ─────────────────────────────────────── */}
        <Route path="/admin/*" element={<AdminRoute><AdminApp /></AdminRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
