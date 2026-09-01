// Bills (/bill) — GET /api/owner/:rId/bills and /bills/:billId.
//
// Bills belong to a table session, not to a single order, and the API has no
// order→bill lookup, so this screen lists the restaurant's bills and opens one
// by ?billId=. Payment is closed out by the waiter (mark-paid); the owner view
// is read-only. See API-GAPS.md.

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Download, Printer, Receipt } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { useBill, useBills } from "@/hooks/owner/useBills";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

function formatPrice(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ── Single bill ──────────────────────────────────────────────────────
function BillView({ restaurantId, billId, onBack }) {
  const { data: bill, isLoading, isError, error } = useBill(restaurantId, billId);

  if (isError) {
    return <p className="text-sm text-brand-maroon">Failed to load bill: {error.message}</p>;
  }
  if (isLoading || !bill) {
    return <p className="text-sm text-muted-foreground">Loading bill…</p>;
  }

  const paid = bill.status === "paid";

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-[#24190f]"
      >
        <ArrowLeft className="h-4 w-4" /> Back to all bills
      </button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Bill #{String(bill._id).slice(-6).toUpperCase()}
          </h1>
          <p className="text-sm text-muted-foreground">
            Session {String(bill.tableSessionId ?? "").slice(-6).toUpperCase() || "—"}
            {bill.paidAt ? ` · paid ${formatDateTime(bill.paidAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={paid ? "ok" : "warn"} className="capitalize">{bill.status}</Badge>
          <Button variant="outline" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button variant="outline" className="gap-2" disabled title="No PDF endpoint in the API">
            <Download className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-base font-bold">Items</h2>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-brand-cream/60">
                <TableHead className="pl-6">Item</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="pr-6 text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(bill.items ?? []).map((item, i) => (
                <TableRow key={`${item.name}-${i}`}>
                  <TableCell className="pl-6 font-medium">{item.name}</TableCell>
                  <TableCell className="text-brand-orange">{item.quantity}×</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatPrice(item.unitPrice)}
                  </TableCell>
                  <TableCell className="pr-6 text-right font-semibold">
                    {formatPrice(item.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
              {(bill.items ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    This bill has no line items.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-base font-bold">Payment summary</h2>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatPrice(bill.subtotal)}</span>
          </div>
          {bill.discountAmount ? (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span className="font-medium text-brand-green">
                −{formatPrice(bill.discountAmount)}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Tax{bill.taxRate ? ` (${Math.round(bill.taxRate * 100)}%)` : ""}
            </span>
            <span className="font-medium">{formatPrice(bill.taxAmount)}</span>
          </div>
          <div className="flex justify-between border-t border-brand-cream/70 pt-2.5 text-base">
            <span className="font-bold">Grand total</span>
            <span className="font-bold text-brand-red">{formatPrice(bill.grandTotal)}</span>
          </div>
          {bill.paymentMethod ? (
            <p className="pt-1 text-xs capitalize text-muted-foreground">
              Paid by {bill.paymentMethod}
            </p>
          ) : (
            <p className="pt-1 text-xs text-muted-foreground">
              Still open — the waiter closes this bill when the guest pays.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ── Bill list ────────────────────────────────────────────────────────
const STATUSES = [
  { value: "",     label: "All" },
  { value: "open", label: "Open" },
  { value: "paid", label: "Paid" },
];

export default function BillDetails() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { restaurantId } = useOwnerAuth();

  const billId = searchParams.get("billId");
  const [status, setStatus] = useState("");

  const { data: bills = [], isLoading, isError, error } = useBills(
    restaurantId,
    status ? { status, limit: 50 } : { limit: 50 },
  );

  if (!restaurantId) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">No restaurant is linked to this account yet.</p>
      </DashboardLayout>
    );
  }

  if (billId) {
    return (
      <DashboardLayout>
        <BillView
          restaurantId={restaurantId}
          billId={billId}
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
          Table-session bills, with their tax and discount breakdown.
        </p>
      </div>

      {isError ? <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p> : null}

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

      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">{bills.length} bills</h2>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead className="pl-6">Bill</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid</TableHead>
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
                        #{String(b._id).slice(-6).toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.status === "paid" ? "ok" : "warn"} className="capitalize">
                        {b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(b.paidAt)}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {b.paymentMethod ?? "—"}
                    </TableCell>
                    <TableCell className="pr-6 text-right font-bold">
                      {formatPrice(b.grandTotal)}
                    </TableCell>
                  </TableRow>
                ))}
                {bills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {isLoading ? "Loading bills…" : "No bills yet."}
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
