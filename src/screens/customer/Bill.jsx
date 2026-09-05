// The guest's own bill (/order/bill) — GET /api/restaurants/:id/tables/:tableId/bill.
//
// The table is taken from the QR session the app already holds, so the bill is always the
// one for the table the guest is actually sitting at, and it states that table number
// plainly at the top. Everything else on it — the restaurant's GSTIN and FSSAI licence,
// each round that was ordered, the tax and service-charge breakdown, the total — comes
// from the same API payload the waiter settles against and the owner later files, so the
// person paying is reading the identical document (components/BillDocument.jsx).

import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import BillDocument from "@/components/BillDocument";
import { useTableBill } from "@/hooks/customer/useTableBill";
import CustomerLayout from "./CustomerLayout";
import { useCustomer } from "./CustomerApp";

export default function CustomerBill() {
  const navigate = useNavigate();
  const { session } = useCustomer();
  const { restaurantId, tableId } = session;

  const { data: bill, isLoading, isError, error, refetch, isFetching } = useTableBill(
    restaurantId,
    tableId,
  );

  // No table in the session means the app was opened without scanning a QR — there is no
  // "your bill" to show, because there is no table it could belong to.
  if (!restaurantId || !tableId) {
    return (
      <CustomerLayout title="Your bill" showNav activeNav="Menu">
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Scan the QR code on your table to see its bill.
          </p>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout title="Your bill" showNav activeNav="Bill">
      <div className="space-y-4 px-4 py-4">
        {isError ? (
          <p className="rounded-xl bg-[#FCE9E4] px-3 py-2.5 text-sm text-brand-maroon">
            {error.message}
          </p>
        ) : null}

        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading your bill…</p>
        ) : bill ? (
          <>
            <BillDocument bill={bill} />
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-cream bg-white py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {isFetching ? "Refreshing…" : "Refresh"}
              </button>
              {!bill.payment?.isPaid ? (
                <button
                  type="button"
                  onClick={() => navigate("/order/help")}
                  className="w-full rounded-xl bg-brand-gradient py-3 text-sm font-bold text-white"
                >
                  Ask for the bill
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="py-10 text-center">
            <p className="text-sm font-semibold">Nothing on your bill yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              It fills in as your order is placed.
            </p>
            <button
              type="button"
              onClick={() => navigate("/order/menu")}
              className="mt-4 rounded-xl bg-brand-gradient px-5 py-2.5 text-sm font-bold text-white"
            >
              Browse the menu
            </button>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
