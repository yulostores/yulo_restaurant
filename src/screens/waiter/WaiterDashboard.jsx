// Waiter home — open table sessions and their orders.
//
// The API models the floor as table SESSIONS: scanning a table QR opens one
// (POST …/waiter/tables/scan), orders are fired against its tableSessionId, and
// the session closes when the bill is marked paid.
//
// The floor now owns the last step of a ticket: PATCH …/waiter/orders/:id/status lets
// this screen mark a round served once it reaches the table, which is reflected straight
// away in the owner portal. Everything before that is still the kitchen's to drive.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, ReceiptText, UtensilsCrossed } from "lucide-react";

import { useStaffAuth } from "@/context/StaffAuthContext";
import {
  useMarkPaid,
  useScanTable,
  useSessionBill,
  useUpdateOrderStatus,
  useWaiterSessions,
  useWaiterTables,
} from "@/hooks/staff/useWaiter";
// The public restaurant endpoint needs no auth, so a staff token can read it.
import { useRestaurant } from "@/hooks/customer/useMenu";
import QRScannerModal from "@/components/QRScannerModal";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import WaiterLayout, { formatPrice } from "./WaiterLayout";
import { useWaiter } from "./WaiterApp";

const PAYMENT_METHODS = ["cash", "upi", "card", "online"];

// Statuses a ticket can hold, as the kitchen reports them.
const STATUS_TONE = {
  placed:           "bg-brand-cream/50 text-muted-foreground",
  confirmed:        "bg-[#E7F0FB] text-[#1565C0]",
  preparing:        "bg-brand-orange/10 text-brand-orange",
  ready:            "bg-emerald-50 text-emerald-600",
  served:           "bg-emerald-50 text-emerald-700",
  out_for_delivery: "bg-[#FFF3E0] text-[#D9480F]",
  delivered:        "bg-[#F3F4F6] text-[#5F5F5F]",
  cancelled:        "bg-red-50 text-brand-maroon",
};

// The single next step the floor can take on a round. Nothing is offered once it has
// been served or cancelled — there is no floor action left, and a button that could only
// fail is worse than none.
function nextAction(order) {
  switch (order.status) {
    case "placed":    return { newStatus: "confirmed", label: "Confirm" };
    case "confirmed": return { newStatus: "preparing", label: "Start prep" };
    case "preparing": return { newStatus: "served",    label: "Mark served" };
    case "ready":     return { newStatus: "served",    label: "Mark served" };
    default:          return null;
  }
}

function roundTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const FILTERS = [
  { value: "all",       label: "All Tables" },
  { value: "active",    label: "Food Pending" },
  { value: "ready",     label: "Ready To Serve" },
  { value: "served",    label: "All Served" },
];

function statusLabel(status) {
  return String(status ?? "").replace(/_/g, " ");
}

// Extract the tableId the scan endpoint wants from whatever the QR encodes.
function tableIdFromQr(raw) {
  const value = String(raw ?? "").trim();
  try {
    const url = new URL(value);
    const id = url.searchParams.get("tableId");
    if (id) return id;
  } catch {
    // Not a URL — fall through.
  }
  const match = value.match(/tableId=([A-Za-z0-9]+)/);
  if (match) return match[1];
  // A bare ObjectId is also acceptable.
  return /^[a-f0-9]{24}$/i.test(value) ? value : null;
}

function sessionState(session) {
  const orders = (session.orders ?? []).filter((o) => o.status !== "cancelled");
  if (orders.length === 0) return "active";
  if (orders.some((o) => o.status === "ready")) return "ready";
  // 'served' is the dine-in terminal state the waiter sets; 'delivered' is kept for
  // orders closed out before that state existed.
  if (orders.every((o) => o.status === "served" || o.status === "delivered")) return "served";
  return "active";
}

/* ── Bill panel for one session ── */
function BillPanel({ restaurantId, session, onClose }) {
  const sessionId = session._id;
  const { data: bill, isLoading } = useSessionBill(restaurantId, sessionId);
  const { mutateAsync: markPaid, isPending } = useMarkPaid(restaurantId);
  const [method, setMethod] = useState("cash");
  const [error, setError] = useState("");

  async function settle() {
    setError("");
    try {
      await markPaid({ sessionId, paymentMethod: method });
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Bill</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-muted-foreground">
            Close
          </button>
        </div>

        {error ? (
          <p className="mb-3 rounded-lg bg-[#FCE9E4] px-3 py-2 text-sm text-brand-maroon">{error}</p>
        ) : null}

        {isLoading || !bill ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Assembling bill…</p>
        ) : (
          <>
            <div className="mb-4 space-y-1.5">
              {(bill.items ?? []).map((item, i) => (
                <div key={`${item.name}-${i}`} className="flex justify-between text-sm">
                  <span>{item.quantity} × {item.name}</span>
                  <span className="font-medium">{formatPrice(item.subtotal)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 border-t border-brand-cream/60 pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(bill.subtotal)}</span>
              </div>
              {bill.discountAmount ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="text-brand-green">−{formatPrice(bill.discountAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Tax{bill.taxRate ? ` (${Math.round(bill.taxRate * 100)}%)` : ""}
                </span>
                <span>{formatPrice(bill.taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-brand-cream/60 pt-2 text-base font-bold">
                <span>Total</span>
                <span className="text-brand-red">{formatPrice(bill.grandTotal)}</span>
              </div>
            </div>

            {bill.status === "paid" ? (
              <p className="mt-4 rounded-xl bg-emerald-50 py-3 text-center text-sm font-bold text-emerald-700">
                Paid by {bill.paymentMethod}
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-xs font-bold uppercase transition",
                        method === m
                          ? "bg-brand-gradient text-white"
                          : "border border-brand-cream bg-white text-[#5a403e]",
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={settle}
                  disabled={isPending}
                  className="w-full rounded-xl bg-brand-gradient py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {isPending ? "Closing…" : "Mark as paid"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── One table session ── */
function SessionCard({ session, tableLabel, onAddItems, onViewBill, onAdvance, pendingOrderId }) {
  const orders = session.orders ?? [];

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-cream/60 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-cream/40 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-[#FFF0E6] px-3 py-1.5 text-sm font-bold text-brand-orange">
            {tableLabel}
          </span>
          <span className="rounded-full bg-brand-orange/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-brand-orange">
            {session.batchCount ?? orders.length} rounds
          </span>
        </div>
        <span className="text-sm font-bold text-brand-red">
          {formatPrice(session.runningTotal)}
        </span>
      </div>

      <div className="space-y-3 px-5 py-4">
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Table is open with no orders yet.
          </p>
        ) : (
          orders.map((o) => (
            <div key={o._id} className="rounded-xl border border-brand-cream/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  Round {o.round ?? o.batchNumber ?? "—"}
                  {roundTime(o.createdAt) ? " · " + roundTime(o.createdAt) : ""}
                  {" · #" + String(o._id).slice(-5).toUpperCase()}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase",
                    STATUS_TONE[o.status] ?? "bg-brand-cream/50 text-muted-foreground",
                  )}
                >
                  {statusLabel(o.status)}
                </span>
              </div>
              <div className="space-y-1">
                {(o.items ?? []).map((item, i) => (
                  <p key={item.menuItemId ?? i} className="text-sm text-[#5a403e]">
                    {item.quantity} × {item.name}
                  </p>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Taken by{" "}
                {o.staff?.name ??
                  (o.placedBy === "guest" ? "the guest (table QR)" : "the customer app")}
              </p>
              {nextAction(o) ? (
                <button
                  type="button"
                  disabled={pendingOrderId === o._id}
                  onClick={() => onAdvance(o, nextAction(o).newStatus)}
                  className={cn(
                    "mt-2.5 w-full rounded-lg py-2 text-xs font-bold text-white transition",
                    pendingOrderId === o._id
                      ? "bg-brand-orange/60"
                      : "bg-brand-gradient hover:brightness-105",
                  )}
                >
                  {pendingOrderId === o._id ? "Updating…" : nextAction(o).label}
                </button>
              ) : null}
              {o.specialInstructions ? (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  “{o.specialInstructions}”
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2 border-t border-brand-cream/40 px-5 py-3">
        <button
          type="button"
          onClick={onAddItems}
          className="flex-1 rounded-xl border border-brand-cream bg-white py-2.5 text-sm font-bold text-[#24190f] hover:bg-brand-cream/20"
        >
          Add items
        </button>
        <button
          type="button"
          onClick={onViewBill}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-gradient py-2.5 text-sm font-bold text-white hover:brightness-105"
        >
          <ReceiptText className="h-4 w-4" /> Bill
        </button>
      </div>
    </div>
  );
}

/* ── Main ── */
export default function WaiterDashboard() {
  const navigate = useNavigate();
  const { staff } = useStaffAuth();
  const restaurantId = staff?.restaurantId;
  const { activeTable, setActiveTable } = useWaiter();

  const [filter, setFilter] = useState("all");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const advance = useUpdateOrderStatus(restaurantId);

  async function handleAdvance(order, newStatus) {
    setStatusError(null);
    setPendingOrderId(order._id);
    try {
      await advance.mutateAsync({ orderId: order._id, newStatus });
    } catch (err) {
      setStatusError(err?.message ?? "Could not update this round — please try again.");
    } finally {
      setPendingOrderId(null);
    }
  }
  const [billSession, setBillSession] = useState(null);
  const [actionError, setActionError] = useState("");

  const { data: sessions = [], isLoading, error: sessionsErr } = useWaiterSessions(restaurantId);
  const { data: tables = [] } = useWaiterTables(restaurantId);
  const { data: restaurant } = useRestaurant(restaurantId);
  const { mutateAsync: scanTable, isPending: scanning } = useScanTable(restaurantId);

  const error = actionError || sessionsErr?.message || "";

  // Sessions reference a tableId; resolve the human identifier from the roster.
  const tableLabelById = useMemo(
    () => Object.fromEntries(tables.map((t) => [t._id, t.identifier])),
    [tables],
  );

  const visible = useMemo(() => {
    if (filter === "all") return sessions;
    return sessions.filter((s) => sessionState(s) === filter);
  }, [sessions, filter]);

  async function handleQRScan(raw) {
    setActionError("");
    const tableId = tableIdFromQr(raw);
    if (!tableId) {
      setActionError("That QR code doesn't carry a table id.");
      return;
    }
    try {
      const { data } = await scanTable(tableId);
      const { table, session } = data.data;
      setActiveTable({
        sessionId: session._id,
        tableId: table._id,
        identifier: table.identifier,
      });
    } catch (err) {
      setActionError(err.message);
    }
  }

  function openTableForOrdering(session) {
    setActiveTable({
      sessionId: session._id,
      tableId: session.tableId,
      identifier: tableLabelById[session.tableId] ?? "Table",
    });
    navigate("/waiter/menu");
  }

  return (
    <WaiterLayout>
      {/* Topbar */}
      <header className="sticky top-0 z-30 border-b border-brand-cream/60 bg-[#FAFAF8] px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold text-brand-red">{restaurant?.name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Waiter Dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-brand-gradient text-xs font-bold text-white">
                {(staff?.name ?? "W").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="hidden flex-col leading-tight sm:flex">
              <span className="text-sm font-semibold">{staff?.name ?? "Waiter"}</span>
              <span className="text-[10px] capitalize text-muted-foreground">
                {staff?.role ?? "waiter"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Active table bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-cream/50 bg-[#FAFAF8] px-4 py-2.5 sm:px-6">
        <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <UtensilsCrossed className="h-4 w-4 shrink-0" />
          {activeTable
            ? `Table ${activeTable.identifier}`
            : "No table selected — scan a QR to open one"}
        </span>
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          disabled={scanning}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-gradient px-3 py-2 text-sm font-bold text-white hover:brightness-105 disabled:opacity-60 sm:px-3.5"
        >
          <QrCode className="h-4 w-4" /> {scanning ? "Opening…" : "Scan QR"}
        </button>
      </div>

      <div className="mx-auto max-w-[860px] px-4 py-5 sm:px-5">
        {error ? (
          <p className="mb-4 rounded-xl bg-[#FCE9E4] px-4 py-2.5 text-sm text-brand-maroon">
            {error}
          </p>
        ) : null}

        {/* Filters */}
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                filter === f.value
                  ? "bg-brand-gradient text-white"
                  : "border border-brand-cream bg-white text-[#5a403e]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {statusError ? (
          <p className="mb-3 text-sm text-brand-maroon">{statusError}</p>
        ) : null}

        {/* Sessions */}
        <div className="space-y-4">
          {visible.map((session) => (
            <SessionCard
              key={session._id}
              session={session}
              tableLabel={
                session.tableNumber
                  ? "Table " + session.tableNumber
                  : tableLabelById[session.tableId] ?? "Table"
              }
              onAddItems={() => openTableForOrdering(session)}
              onViewBill={() => setBillSession(session)}
              onAdvance={handleAdvance}
              pendingOrderId={pendingOrderId}
            />
          ))}
          {visible.length === 0 ? (
            <div className="rounded-2xl border border-brand-cream/60 bg-white py-12 text-center text-sm text-muted-foreground">
              {isLoading
                ? "Loading tables…"
                : sessions.length === 0
                  ? "No open tables. Scan a table QR to seat a guest."
                  : "No tables match this filter."}
            </div>
          ) : null}
        </div>
      </div>

      {scannerOpen ? (
        <QRScannerModal onClose={() => setScannerOpen(false)} onScan={handleQRScan} />
      ) : null}

      {billSession ? (
        <BillPanel
          restaurantId={restaurantId}
          session={billSession}
          onClose={() => setBillSession(null)}
        />
      ) : null}
    </WaiterLayout>
  );
}
