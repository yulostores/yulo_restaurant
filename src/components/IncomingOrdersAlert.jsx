// The "orders waiting for you" strip shown on every owner screen, plus the chime.
//
// An order that sits unanswered is cancelled automatically by the server after a few
// minutes, so the owner must hear about it wherever they are in the portal — not only on
// the Incoming Orders page. This rides on the same polled query as that page and the
// sidebar badge (react-query de-duplicates them into one request).
//
// Rendered by DashboardLayout, which every owner screen mounts afresh, so the "have we
// already chimed for this order" memory lives at module scope: navigating between screens
// must not re-announce orders the owner has already been told about.

import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BellRing } from "lucide-react";

import { useOwnerAuthSafe } from "@/context/OwnerAuthContext";
import { usePendingOrders } from "@/hooks/owner/useOrderApproval";
import { installAudioUnlock, playNewOrderChime } from "@/lib/orderAlert";
import { minutesSince } from "@/components/OrderDetailsDialog";

const INBOX_PATH = "/incoming-orders";

// Order ids already announced this page-load, and which restaurant that set belongs to.
// Orders already waiting when the portal (re)loads are chimed once too — a tablet that
// restarted mid-service must not sit silent on orders that will auto-cancel. Keyed to the
// restaurant so signing in as another owner starts afresh.
const announced = new Set();
let baselineFor = null;

export default function IncomingOrdersAlert() {
  const ctx = useOwnerAuthSafe();
  const restaurantId = ctx?.restaurantId;
  const enabled = Boolean(ctx?.isApproved);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const originalTitle = useRef(typeof document !== "undefined" ? document.title : "");

  const { data } = usePendingOrders(restaurantId, { enabled });

  useEffect(() => {
    if (enabled) installAudioUnlock();
  }, [enabled]);
  const orders = data?.orders ?? [];
  const count = data?.count ?? orders.length;

  // Chime once per newly-arrived order.
  useEffect(() => {
    if (!data || !restaurantId) return;
    const ids = (data.orders ?? []).map((o) => String(o._id));
    if (baselineFor !== restaurantId) {
      announced.clear();
      baselineFor = restaurantId;
    }
    const fresh = ids.filter((id) => !announced.has(id));
    ids.forEach((id) => announced.add(id));
    if (fresh.length > 0) playNewOrderChime();
  }, [data, restaurantId]);

  // "(2) Yulo" in the browser tab, so a waiting order is visible even from another tab.
  useEffect(() => {
    const base = originalTitle.current.replace(/^\(\d+\)\s*/, "");
    document.title = count > 0 ? `(${count}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [count]);

  if (!enabled || count === 0 || pathname === INBOX_PATH) return null;

  const oldest = orders[0];
  const waited = minutesSince(oldest?.createdAt);

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-maroon/30 bg-[#FCE9E4] px-4 py-3"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-brand-maroon">
        <BellRing className="h-4 w-4 animate-pulse" />
        {count === 1 ? "1 new order is" : `${count} new orders are`} waiting for you to accept
        {oldest ? (
          <span className="font-normal text-brand-maroon/80">
            · oldest {waited === 0 ? "just now" : `${waited}m ago`}
          </span>
        ) : null}
      </p>
      <button
        type="button"
        onClick={() => navigate(INBOX_PATH)}
        className="rounded-lg bg-brand-maroon px-4 py-1.5 text-sm font-bold text-white hover:brightness-110"
      >
        Review now
      </button>
    </div>
  );
}
