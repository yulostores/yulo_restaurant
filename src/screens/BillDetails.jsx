// Bills (/bill) — GET /api/owner/:rId/bills and /bills/:billId.
//
// A bill belongs to a table SESSION (a whole sitting), not to a single order, so it
// batches every round the table ordered. The list is filterable by status, type and free
// text over the receipt number and table; opening one shows the full receipt — the same
// document the waiter settles against and the guest pays from (components/BillDocument.jsx).
//
// Arriving with ?orderId= resolves that order to the bill it landed on
// (GET /api/owner/:rId/orders/:orderId/bill), which is how the Manage Orders screen opens
// the bill for a given order.

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Printer, Receipt, Search } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { useBill, useBillForOrder, useBills } from "@/hooks/owner/useBills";
import BillDocument from "@/components/BillDocument";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatMoney, humanize } from "@/lib/bill";
import { cn } from "@/lib/utils";

// ── Single bill ──────────────────────────────────────────────────────
function BillView({ bill, isLoading, isError, error, onBack }) {
  const [historyOpen, setHistoryOpen] = useState(false);

  if (isError) {
    return <p className="text-sm text-brand-maroon">Failed to load bill: {error.message}</p>;
  }
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading bill…</p>;
  }
  if (!bill) {
    return (
      <>
        <BackLink onBack={onBack} />
        <p className="text-sm text-muted-foreground">
          This order has not been billed yet. A dine-in bill is raised when the table&apos;s
          bill is first opened, and settled when the guest pays.
        </p>
      </>
    );
  }

  return (
    <>
      <BackLink onBack={onBack} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bill {bill.billNumber ?? bill.reference}</h1>
          <p className="text-sm text-muted-foreground">
            {[
              bill.tableNumber ? `Table ${bill.tableNumber}` : humanize(bill.type),
              bill.restaurant?.name,
              bill.payment?.paidAt
                ? `paid ${formatDateTime(bill.payment.paidAt)}`
                : `raised ${formatDateTime(bill.createdAt)}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Badge variant={bill.payment?.isPaid ? "ok" : "warn"} className="capitalize">
            {bill.status}
          </Badge>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <Receipt className="h-4 w-4" />
            {historyOpen ? "Hide details" : "View details"}
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <BillDocument
            bill={bill}
            historyOpen={historyOpen}
            onToggleHistory={setHistoryOpen}
          />
        </CardContent>
      </Card>
    </>
  );
}

function BackLink({ onBack }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-[#24190f] print:hidden"
    >
      <ArrowLeft className="h-4 w-4" /> Back to all bills
    </button>
  );
}

// ── Bill list ────────────────────────────────────────────────────────
const STATUSES = [
  { value: "",     label: "All" },
  { value: "open", label: "Open" },
  { value: "paid", label: "Paid" },
];

const TYPES = [
  { value: "",         label: "All types" },
  { value: "dine_in",  label: "Dine in" },
  { value: "delivery", label: "Delivery" },
  { value: "takeaway", label: "Takeaway" },
];

// The bill opened by ?billId=, or the one an ?orderId= resolves to. Kept as its own
// component so each hook runs only for the mode actually in use.
function BillRoute({ restaurantId, billId, orderId, onBack }) {
  const byId = useBill(restaurantId, billId);
  const byOrder = useBillForOrder(restaurantId, orderId);
  const source = billId ? byId : byOrder;

  return (
    <BillView
      bill={source.data ?? null}
      isLoading={source.isLoading}
      isError={source.isError}
      error={source.error}
      onBack={onBack}
    />
  );
}

export default function BillDetails() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { restaurantId } = useOwnerAuth();

  const billId = searchParams.get("billId");
  const orderId = searchParams.get("orderId");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");

  const { data: bills = [], isLoading, isError, error } = useBills(restaurantId, {
    limit: 50,
    ...(status && { status }),
    ...(type && { type }),
    ...(query.trim() && { q: query.trim() }),
  });

  if (!restaurantId) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">No restaurant is linked to this account yet.</p>
      </DashboardLayout>
    );
  }

  if (billId || orderId) {
    return (
      <DashboardLayout>
        <BillRoute
          restaurantId={restaurantId}
          billId={billId}
          orderId={orderId}
          onBack={() => setSearchParams({})}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <button
        type="button"
        onClick={() => navigate("/orders")}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-[#24190f]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Manage Orders
      </button>

      <div>
        <h1 className="text-2xl font-bold">Bills</h1>
        <p className="text-sm text-muted-foreground">
          Every receipt this restaurant has issued — the table it was raised for, its tax and
          discount breakdown, and the rounds behind it.
        </p>
      </div>

      {isError ? <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s.value || "all"}
              type="button"
              onClick={() => setStatus(s.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                status === s.value
                  ? "bg-brand-gradient text-white"
                  : "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.value || "all-types"}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                type === t.value
                  ? "border-brand-orange bg-brand-orange/10 text-brand-orange"
                  : "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
                "border",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bill no. or table"
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">{bills.length} bills</h2>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead className="pl-6">Bill no.</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Raised</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="pr-6 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((b) => (
                  <TableRow
                    key={b._id}
                    className="cursor-pointer"
                    onClick={() => setSearchParams({ billId: b._id })}
                  >
                    <TableCell className="pl-6">
                      <span className="flex items-center gap-2 font-semibold">
                        <Receipt className="h-4 w-4 shrink-0 text-brand-orange" />
                        {b.billNumber ?? b.reference}
                      </span>
                    </TableCell>
                    <TableCell>
                      {b.tableNumber ? (
                        <span className="font-medium">Table {b.tableNumber}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{humanize(b.type)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(b.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.status === "paid" ? "ok" : "warn"} className="capitalize">
                        {b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {b.payment?.method ?? "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-bold">
                      {formatMoney(b.charges?.grandTotal)}
                    </TableCell>
                  </TableRow>
                ))}
                {bills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      {isLoading ? "Loading bills…" : "No bills match these filters."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
