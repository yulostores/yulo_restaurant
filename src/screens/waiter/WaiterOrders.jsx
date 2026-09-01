// Waiter · Active Orders — GET /api/staff/:rId/waiter/sessions, grouped by table.
//
// Read-only on status: the API routes order transitions through the chef KDS
// endpoints (role: chef), so a waiter token cannot mark a ticket served.
// See API-GAPS.md.

import { useMemo } from "react";

import { useStaffAuth } from "@/context/StaffAuthContext";
import { useWaiterSessions, useWaiterTables } from "@/hooks/staff/useWaiter";
import { cn } from "@/lib/utils";
import WaiterLayout, { WaiterPageHeader, formatPrice } from "./WaiterLayout";

const STATUS_TONE = {
  placed:           "bg-[#F3F4F6] text-[#5F5F5F]",
  confirmed:        "bg-[#E7F0FB] text-[#1565C0]",
  preparing:        "bg-[#FFF3E0] text-[#D9480F]",
  ready:            "bg-[#E8F5EC] text-brand-green",
  out_for_delivery: "bg-[#FFF3E0] text-[#D9480F]",
  delivered:        "bg-[#F3F4F6] text-[#5F5F5F]",
  cancelled:        "bg-[#FCE9E4] text-brand-maroon",
};

// The furthest-behind ticket sets the table's headline status.
const STATUS_RANK = ["placed", "confirmed", "preparing", "ready", "delivered"];

function tableStatus(orders = []) {
  const live = orders.filter((o) => o.status !== "cancelled");
  if (live.length === 0) return "placed";
  return live.reduce((worst, o) => {
    const a = STATUS_RANK.indexOf(worst);
    const b = STATUS_RANK.indexOf(o.status);
    return b >= 0 && b < a ? o.status : worst;
  }, "delivered");
}

export default function WaiterOrders() {
  const { staff } = useStaffAuth();
  const restaurantId = staff?.restaurantId;

  const { data: sessions = [], isLoading, isError, error } = useWaiterSessions(restaurantId);
  const { data: tables = [] } = useWaiterTables(restaurantId);

  const tableLabelById = useMemo(
    () => Object.fromEntries(tables.map((t) => [t._id, t.identifier])),
    [tables],
  );

  const rows = useMemo(
    () =>
      sessions.map((s) => {
        const orders = s.orders ?? [];
        const allItems = orders.flatMap((o) => o.items ?? []);
        return {
          id: s._id,
          label: tableLabelById[s.tableId] ?? "Table",
          status: tableStatus(orders),
          summary: allItems
            .slice(0, 4)
            .map((i) => `${i.quantity}× ${i.name}`)
            .join(", "),
          extra: Math.max(0, allItems.length - 4),
          batches: s.batchCount ?? orders.length,
          total: s.runningTotal ?? 0,
        };
      }),
    [sessions, tableLabelById],
  );

  return (
    <WaiterLayout>
      <WaiterPageHeader
        title="Active Orders"
        subtitle="Live tickets per table. The kitchen moves them through their statuses."
      />

      <div className="px-4 py-5 sm:px-5">
        {isError ? (
          <p className="mb-4 text-sm text-brand-maroon">Failed to load orders: {error.message}</p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isLoading ? (
            <p className="col-span-2 text-sm text-muted-foreground">Loading orders…</p>
          ) : rows.length === 0 ? (
            <div className="col-span-2 rounded-2xl border border-brand-cream/60 bg-white py-14 text-center text-sm text-muted-foreground">
              No open tables right now.
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border border-brand-cream/60 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">Table {row.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-bold capitalize",
                      STATUS_TONE[row.status] ?? "bg-[#F3F4F6] text-[#5F5F5F]",
                    )}
                  >
                    {row.status.replace(/_/g, " ")}
                  </span>
                </div>

                <p className="mt-2 text-sm text-muted-foreground">
                  {row.summary || "No items yet"}
                  {row.extra > 0 ? ` +${row.extra} more` : ""}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-brand-cream/60 pt-3">
                  <span className="text-xs text-muted-foreground">
                    {row.batches} {row.batches === 1 ? "batch" : "batches"}
                  </span>
                  <span className="font-bold text-brand-red">{formatPrice(row.total)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </WaiterLayout>
  );
}
