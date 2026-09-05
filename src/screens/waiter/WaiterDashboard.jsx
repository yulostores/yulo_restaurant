// Waiter home — open table sessions and their orders.
//
// The API models the floor as table SESSIONS: scanning a table QR opens one
// (POST …/waiter/tables/scan), orders are fired against its tableSessionId, and
// the session closes when the bill is marked paid.
//
// The floor now owns the last step of a ticket: PATCH …/waiter/orders/:id/status lets
// this screen mark a round served once it reaches the table, which is reflected straight
// away in the owner portal. Everything before that is still the kitchen's to drive.
//
// The chips across the top select ROUNDS, not tables (FLOOR_FILTERS in ./orderStatus.js):
//
//   All Orders     every open table, all of its rounds
//   Preparing      rounds still with the kitchen — placed, accepted or on the stove
//   Ready To Serve rounds the chef has marked ready: the tray waiting to be carried out
//   Served         rounds already delivered to the table, bill not yet settled
//   Completed      sittings settled today — read from ?scope=completed, since a paid
//                  session has left the open floor entirely
//
// A table appears under a chip only if it has a round in that state, and shows just those
// rounds; its running total and bill button still read the whole sitting.

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
import BillDocument from "@/components/BillDocument";
import QRScannerModal from "@/components/QRScannerModal";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import WaiterLayout, { formatPrice } from "./WaiterLayout";
import { useWaiter } from "./WaiterApp";
import {
  FLOOR_FILTERS,
  SERVE_BLOCKED_HINT,
  billReadiness,
  floorStatus,
  floorStatusLabel,
  isCompletedFilter,
  matchesFloorFilter,
  serveAction,
} from "./orderStatus";

const PAYMENT_METHODS = ["cash", "upi", "card", "online"];

// Keyed by the floor's reading of a ticket, not the kitchen's raw status — see
// ./orderStatus.js for why 'confirmed' never surfaces here.
const STATUS_TONE = {
  preparing:        "bg-brand-orange/10 text-brand-orange",
  prepared:         "bg-emerald-50 text-emerald-600",
  served:           "bg-emerald-50 text-emerald-700",
  out_for_delivery: "bg-[#FFF3E0] text-[#D9480F]",
  delivered:        "bg-[#F3F4F6] text-[#5F5F5F]",
  cancelled:        "bg-red-50 text-brand-maroon",
};

function roundTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
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

// What the chips actually select. A filter keeps a table only if it has a round in that
// state, and the card then shows just those rounds — so "Ready To Serve" is the tray to
// carry out, not the tables that happen to have one. The running total and the bill
// button keep reading the whole sitting, which is what they are about.
function filterSessions(sessions, filter) {
  if (filter === "all") return sessions.map((s) => ({ session: s, orders: s.orders ?? [] }));
  return sessions
    .map((s) => ({ session: s, orders: (s.orders ?? []).filter((o) => matchesFloorFilter(o, filter)) }))
    .filter((row) => row.orders.length > 0);
}

// Said in the waiter's own terms, so an empty list reads as an answer rather than a fault.
const EMPTY_FILTER_COPY = {
  preparing: "Nothing with the kitchen right now.",
  ready:     "Nothing on the pass — no round is waiting to be carried out.",
  served:    "No round has been served yet at any open table.",
  completed: "No table has been settled yet today.",
};

/* ── Bill panel for one session ── */
// Renders the same bill document the owner console and the guest's own phone show
// (components/BillDocument.jsx) — table number, the restaurant's tax details, every round
// ordered and the full charge breakdown — with the floor's settle controls beneath it. The
// waiter and the guest must never be settling against two different readings of one bill.
function BillPanel({ restaurantId, session, onClose }) {
  const sessionId = session._id;
  const { data: bill, isLoading, error: billError } = useSessionBill(restaurantId, sessionId);
  const { mutateAsync: markPaid, isPending } = useMarkPaid(restaurantId);
  const [method, setMethod] = useState("cash");
  const [error, setError] = useState("");

  // The server refuses to raise or settle a bill while a round is still with the kitchen
  // (409 ORDERS_PENDING). The card's button is already inert in that case, so this only
  // fires on a race — a round placed from another device while this panel was open.
  const loadError = billError ? errorMessage(billError) : "";

  async function settle() {
    setError("");
    try {
      await markPaid({ sessionId, paymentMethod: method });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Generate bill</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-muted-foreground">
            Close
          </button>
        </div>

        {error || loadError ? (
          <p className="mb-3 rounded-lg bg-[#FCE9E4] px-3 py-2 text-sm text-brand-maroon">
            {error || loadError}
          </p>
        ) : null}

        {loadError ? null : isLoading || !bill ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Assembling bill…</p>
        ) : (
          <BillDocument
            bill={bill}
            footer={
              bill.payment?.isPaid ? null : (
                <div className="space-y-3">
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
              )
            }
          />
        )}
      </div>
    </div>
  );
}

/* ── One table session ── */
// `orders` is what this filter selected, which can be a subset of the sitting's rounds;
// `session` stays whole, because the total and the bill are about the sitting.
// `settled` marks a closed sitting — nothing on it can move, so it carries no controls.
function SessionCard({
  session, tableLabel, orders, settled = false, onAddItems, onViewBill, onAdvance, pendingOrderId,
}) {
  const allRounds = session.orders ?? [];
  const hidden = allRounds.length - orders.length;
  // The bill is the last step of the sitting, not a mid-meal peek: until every round has
  // been carried to the table the total can still move, so the button stays inert and says
  // what is holding it. The server refuses the same call (409 ORDERS_PENDING) — this is the
  // courtesy, not the enforcement.
  const bill = billReadiness(session);

  return (
    <div className="overflow-hidden rounded-2xl border border-brand-cream/60 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-cream/40 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="rounded-lg bg-[#FFF0E6] px-3 py-1.5 text-sm font-bold text-brand-orange">
            {tableLabel}
          </span>
          <span className="rounded-full bg-brand-orange/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-brand-orange">
            {hidden > 0
              ? `${orders.length} of ${allRounds.length} rounds`
              : `${session.batchCount ?? allRounds.length} rounds`}
          </span>
          {settled ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
              Paid
            </span>
          ) : null}
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
          orders.map((o) => {
            const action = serveAction(o);
            return (
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
                      STATUS_TONE[floorStatus(o.status)] ?? "bg-brand-cream/50 text-muted-foreground",
                    )}
                  >
                    {floorStatusLabel(o.status)}
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
                {action && !settled ? (
                  <button
                    type="button"
                    disabled={!action.enabled || pendingOrderId === o._id}
                    title={action.enabled ? undefined : SERVE_BLOCKED_HINT}
                    onClick={() => onAdvance(o, action.newStatus)}
                    className={cn(
                      "mt-2.5 w-full rounded-lg py-2 text-xs font-bold transition",
                      !action.enabled
                        ? "cursor-not-allowed bg-brand-cream/50 text-muted-foreground"
                        : pendingOrderId === o._id
                          ? "bg-brand-orange/60 text-white"
                          : "bg-brand-gradient text-white hover:brightness-105",
                    )}
                  >
                    {pendingOrderId === o._id ? "Updating…" : action.label}
                  </button>
                ) : null}
                {o.specialInstructions ? (
                  <p className="mt-2 text-xs italic text-muted-foreground">
                    “{o.specialInstructions}”
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-brand-cream/40 px-5 py-3">
        {settled ? (
          <p className="text-center text-xs text-muted-foreground">
            Settled{session.payment?.method ? ` by ${session.payment.method}` : ""}
            {roundTime(session.payment?.paidAt ?? session.closedAt)
              ? ` at ${roundTime(session.payment?.paidAt ?? session.closedAt)}`
              : ""}
            {session.payment?.total != null ? ` · ${formatPrice(session.payment.total)}` : ""}
          </p>
        ) : (
          <>
          <div className="flex gap-2">
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
              disabled={!bill.ready}
              title={bill.ready ? undefined : bill.reason}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition",
                bill.ready
                  ? "bg-brand-gradient text-white hover:brightness-105"
                  : "cursor-not-allowed bg-brand-cream/60 text-muted-foreground",
              )}
            >
              <ReceiptText className="h-4 w-4" /> Generate bill
            </button>
          </div>
          {bill.ready ? null : (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {bill.reason} — the bill can be generated once every round is served.
            </p>
          )}
          </>
        )}
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

  // Two reads of one endpoint: the live floor, always polled, and — only while the
  // Completed chip is selected — the sittings settled since midnight, which the open-floor
  // query can't contain because a settled sitting is closed.
  const completedView = isCompletedFilter(filter);
  const { data: openSessions = [], isLoading, error: sessionsErr } = useWaiterSessions(restaurantId);
  const {
    data: doneSessions = [],
    isLoading: loadingDone,
    error: doneErr,
  } = useWaiterSessions(restaurantId, "completed", { enabled: completedView });

  const sessions = completedView ? doneSessions : openSessions;
  const { data: tables = [] } = useWaiterTables(restaurantId);
  const { data: restaurant } = useRestaurant(restaurantId);
  const { mutateAsync: scanTable, isPending: scanning } = useScanTable(restaurantId);

  const error = actionError || sessionsErr?.message || (completedView ? doneErr?.message : "") || "";

  // Sessions reference a tableId; resolve the human identifier from the roster.
  const tableLabelById = useMemo(
    () => Object.fromEntries(tables.map((t) => [t._id, t.identifier])),
    [tables],
  );

  // A settled sitting is shown whole — its rounds are all served, so there is nothing to
  // narrow to.
  const visible = useMemo(
    () => filterSessions(sessions, completedView ? "all" : filter),
    [sessions, filter, completedView],
  );

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
          {FLOOR_FILTERS.map((f) => (
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
          {visible.map(({ session, orders }) => (
            <SessionCard
              key={session._id}
              session={session}
              orders={orders}
              settled={completedView}
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
              {(completedView ? loadingDone : isLoading)
                ? "Loading tables…"
                : !completedView && openSessions.length === 0
                  ? "No open tables. Scan a table QR to seat a guest."
                  : EMPTY_FILTER_COPY[filter] ?? "Nothing to show here."}
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
