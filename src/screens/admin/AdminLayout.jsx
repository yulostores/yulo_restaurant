// Platform Admin shell — dark platform sidebar + top bar, used across /admin/*.
// Navigation mirrors the documented admin surface (API.md § Admin): stores,
// customers, delivery partners, support tickets, reports.

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Bike,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  ShieldCheck,
  Store,
  Users,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/stores", label: "Stores", icon: Store },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/delivery-partners", label: "Delivery Partners", icon: Bike },
  { to: "/admin/tickets", label: "Support Tickets", icon: LifeBuoy },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
];

export function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(Number(value) || 0);
}

export function initials(name) {
  if (!name) return "AD";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function AdminLayout({ children, title, subtitle, action }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { admin, logout } = useAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (item) => (item.exact ? pathname === item.to : pathname.startsWith(item.to));

  function handleNav(to) {
    navigate(to);
    setSidebarOpen(false);
  }

  async function handleLogout() {
    await logout();
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-brand-page font-sans text-[#24190f]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 flex h-screen w-[260px] shrink-0 flex-col bg-sidebar-gradient transition-transform duration-300",
          "lg:sticky lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-6 pb-8 pt-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-gradient text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="font-bold text-brand-cream2">Yulo Admin</p>
              <p className="text-[11px] text-brand-cream/50">Platform Console</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-lg text-brand-cream/60 hover:bg-brand-cream/10 hover:text-brand-cream lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.to}
                type="button"
                onClick={() => handleNav(item.to)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm font-medium transition-colors",
                  isActive(item)
                    ? "bg-brand-gradient text-white"
                    : "text-brand-cream hover:bg-brand-cream/10",
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-brand-cream/10 p-3">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-brand-cream hover:bg-brand-cream/10"
          >
            <LogOut className="h-[18px] w-[18px]" /> Logout
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-5 p-4 pb-12 sm:p-6 lg:px-7">
        <header className="flex items-center justify-between rounded-2xl border border-brand-cream/60 bg-[#FAFAF8] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:px-5 sm:py-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((o) => !o)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-brand-cream/70 text-[#5a403e] hover:bg-[#f5ede4] lg:hidden"
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-lg font-bold text-brand-red sm:text-xl">Platform Console</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3.5">
            <button
              type="button"
              className="relative grid h-9 w-9 place-items-center rounded-lg border border-brand-cream/60 bg-white text-[#5f5f5f]"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
            </button>
            <Avatar>
              <AvatarFallback className="bg-brand-gradient text-xs font-semibold text-white">
                {initials(admin?.name)}
              </AvatarFallback>
            </Avatar>
            <div className="hidden flex-col leading-tight sm:flex">
              <span className="text-sm font-semibold">{admin?.name ?? "Admin"}</span>
              <span className="text-xs capitalize text-muted-foreground">
                {admin?.role ?? "admin"}
              </span>
            </div>
          </div>
        </header>

        {(title || action) && (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {title ? <h1 className="text-2xl font-bold">{title}</h1> : null}
              {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {action}
          </div>
        )}

        {children}
      </main>
    </div>
  );
}
