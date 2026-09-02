import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  LogOut,
  QrCode,
  ReceiptText,
  XCircle,
  UtensilsCrossed,
  PlusCircle,
  BadgePercent,
  Monitor,
  Receipt,
  Store,
  UserRound,
  Users,
  Lock,
  X,
} from "lucide-react";

import RestaurantLogo from "@/components/RestaurantLogo";
import { cn } from "@/lib/utils";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { isAlwaysAllowed } from "@/lib/approval";

const NAV_SECTIONS = [
  {
    title: "Home",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "QR Management",
    items: [
      { to: "/qr", label: "Generate QR Code", icon: QrCode },
    ],
  },
  {
    title: "Orders Management",
    items: [
      { to: "/orders", label: "Manage Orders", icon: ReceiptText },
      { to: "/bill", label: "Bills", icon: Receipt },
      { to: "/cancellations", label: "Cancellations", icon: XCircle },
    ],
  },
  {
    title: "Menu Management",
    items: [
      { to: "/menu-items", label: "Menu Items", icon: UtensilsCrossed },
      { to: "/menu-management", label: "Add Items", icon: PlusCircle },
    ],
  },
  {
    title: "Coupons & Offers",
    items: [
      { to: "/offers", label: "Create Offers", icon: BadgePercent },
    ],
  },
  {
    title: "Live Monitoring",
    items: [
      { to: "/live-monitor", label: "Visitors Analysis", icon: Monitor },
    ],
  },
  {
    title: "Account",
    items: [
      { to: "/staff", label: "Staff Management", icon: Users },
      { to: "/store-settings", label: "Store Settings", icon: Store },
      { to: "/profile", label: "Profile", icon: UserRound },
    ],
  },
];

function isActive(pathname, to) {
  if (to === "/dashboard") return pathname === "/" || pathname === "/dashboard";
  return pathname === to;
}

function NavItem({ icon: Icon, label, active, locked, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      title={locked ? "Unlocks once a Yulo admin approves your restaurant" : undefined}
      aria-disabled={locked || undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-4 py-2 text-left text-sm font-medium text-brand-cream/80 transition-colors",
        locked
          ? "cursor-not-allowed text-brand-cream/35 hover:bg-transparent"
          : "hover:bg-brand-cream/10 hover:text-brand-cream",
        active && !locked && "bg-brand-cream/10 text-brand-cream",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
      <span className="flex-1">{label}</span>
      {locked ? <Lock className="h-3.5 w-3.5 shrink-0" /> : null}
    </button>
  );
}

export default function Sidebar({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout, restaurant, isApproved } = useOwnerAuth();
  // Falls back to the product name only until the owner has a restaurant on file
  // (fresh signup, pre-approval) — otherwise the sidebar carries their own brand.
  const storeName = restaurant?.name || "Yulo Stores";

  async function handleLogout() {
    await logout();
    navigate("/owner/login", { replace: true });
  }

  function handleNav(to) {
    navigate(to);
    onClose?.();
  }

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 flex h-screen w-[280px] shrink-0 flex-col justify-between overflow-y-auto bg-sidebar-gradient shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1)] transition-transform duration-300",
          "lg:sticky lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div>
          <div className="flex items-center justify-between gap-3 px-6 pb-6 pt-6">
            <div className="flex min-w-0 items-center gap-3">
              <RestaurantLogo name={storeName} src={restaurant?.logo} className="h-10 w-10" />
              <span className="truncate text-xl text-brand-cream2">{storeName}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-brand-cream/60 hover:bg-brand-cream/10 hover:text-brand-cream lg:hidden"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {!isApproved ? (
            <div className="mx-4 mb-4 rounded-lg border border-brand-cream/20 bg-brand-cream/10 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-cream/90">
                <Lock className="h-3 w-3" />
                {restaurant ? "Awaiting approval" : "Setup incomplete"}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-brand-cream/60">
                {restaurant
                  ? "A Yulo admin is reviewing your restaurant. These sections unlock as soon as it's approved."
                  : "Add your restaurant in Store Settings to send it for admin review."}
              </p>
            </div>
          ) : null}

          <nav className="flex flex-col gap-4 px-4 pb-6">
            {NAV_SECTIONS.map((section) => (
              <div key={section.title} className="flex flex-col gap-1">
                <p className="px-4 pb-1 text-[10px] uppercase tracking-widest text-brand-cream/40">
                  {section.title}
                </p>
                {section.items.map((item) => (
                  <NavItem
                    key={item.to + item.label}
                    icon={item.icon}
                    label={item.label}
                    active={isActive(pathname, item.to)}
                    // Mirrors ApprovalGate: everything but Store Settings and
                    // Profile stays locked until the restaurant is approved.
                    locked={!isApproved && !isAlwaysAllowed(item.to)}
                    onClick={() => handleNav(item.to)}
                  />
                ))}
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t border-brand-cream/10 p-4">
          <NavItem icon={LogOut} label="Logout" onClick={handleLogout} />
        </div>
      </aside>
    </>
  );
}
