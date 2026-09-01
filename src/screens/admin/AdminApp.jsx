// Platform Admin portal (/admin/*). Routes mirror the documented admin surface
// in API.md — stores, customers, delivery partners, tickets, reports.

import { Navigate, Route, Routes } from "react-router-dom";

import AdminDashboard from "./AdminDashboard";
import Stores from "./Stores";
import AdminCustomers from "./AdminCustomers";
import DeliveryPartners from "./DeliveryPartners";
import SupportTickets from "./SupportTickets";
import AdminReports from "./AdminReports";

export default function AdminApp() {
  return (
    <Routes>
      <Route index element={<AdminDashboard />} />
      <Route path="stores" element={<Stores />} />
      <Route path="customers" element={<AdminCustomers />} />
      <Route path="delivery-partners" element={<DeliveryPartners />} />
      <Route path="tickets" element={<SupportTickets />} />
      <Route path="reports" element={<AdminReports />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
