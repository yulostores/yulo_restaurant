// Pieces the Payments & Payouts screens share (Figma owner frames 144:7167, 144:6523, 144:6079):
// the KPI card, the orders table, the payout-destination card, the Yulo-money card.

import { Link } from "react-router-dom";
import { CreditCard } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  customerPaidText,
  orderStatusBadge,
  paymentDetailPath,
  paymentTypeLabel,
  rupees,
  shortDay,
} from "@/lib/payments";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardContent, CardHeader } from "./ui";

// Figma StatCard (component 3:74 / 3:78): radius 20, soft shadow, no border, a 56px icon tile,
// 14px label, 36px Plus Jakarta figure, 14px note. `tone`: default | accent (the figure in
// #14594a — "Next payout") | yulo (the Yulo-money card).
export function KpiCard({ label, value, sub, tone = "default", action }) {
  const yulo = tone === "yulo";
  return (
    <div
      className={cn(
        "pay-figure flex flex-col gap-4 rounded-[20px] p-6 shadow-[0_4px_6px_rgba(26,26,26,0.06),0_1px_1px_rgba(26,26,26,0.04)]",
        yulo ? "bg-[#fcf1d4] text-[#6b4700]" : "bg-white",
      )}
    >
      <span
        className={cn(
          "grid h-14 w-14 place-items-center rounded-[16px]",
          yulo ? "bg-white text-[#6b4700]" : "bg-[#e0efea] text-[#14594a]",
        )}
      >
        <CreditCard className="h-5 w-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p
          className={cn(
            "text-[14px] font-medium leading-[1.4]",
            !yulo && "text-[#596059]",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "text-[36px] font-bold leading-[1.2] tracking-[-0.36px]",
            yulo ? "" : tone === "accent" ? "text-[#14594a]" : "text-[#1a1d1b]",
          )}
        >
          {value}
        </p>
        {sub ? (
          <p
            className={cn(
              "text-[14px] leading-[1.4]",
              !yulo && "text-[#6f766f]",
            )}
          >
            {sub}
          </p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function StatusBadge({ badge }) {
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

// Order no. | Date | Payment Type | Customer paid | You receive | Status | Details
export function OrdersTable({ rows, empty = "No orders yet." }) {
  if (!rows?.length) {
    return <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order no.</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Payment Type</TableHead>
          <TableHead>Customer paid</TableHead>
          <TableHead>You receive</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Details</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.kind}-${row.id}`} className="border-[#e3dfd4]">
            <TableCell className="font-mono text-[12px]">
              {row.displayNo ?? "—"}
            </TableCell>
            <TableCell>{shortDay(row.date)}</TableCell>
            <TableCell>
              {paymentTypeLabel(row.paymentType, row.counterMethod)}
            </TableCell>
            <TableCell>{customerPaidText(row)}</TableCell>
            <TableCell
              className={cn(
                "font-medium",
                (row.youReceivePaise ?? 0) < 0 && "text-[#b3421e]",
              )}
            >
              {row.youReceivePaise == null ? "—" : rupees(row.youReceivePaise)}
            </TableCell>
            <TableCell>
              <StatusBadge badge={orderStatusBadge(row.status)} />
            </TableCell>
            <TableCell>
              <Link
                to={paymentDetailPath(row)}
                className="text-[14px] text-[#14594a] hover:underline"
              >
                View Details
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const DESTINATION_STATUS = {
  not_added: { label: "Not added", variant: "muted" },
  pending_verification: { label: "Pending verification", variant: "warn" },
  verified: { label: "Verified", variant: "ok" },
  rejected: { label: "Rejected", variant: "danger" },
};

// `destination` is the overview's payoutDestination ({ last4, status, holderName, hasPendingChange }).
export function PayoutDestinationCard({ destination, restaurantName }) {
  const status =
    DESTINATION_STATUS[destination?.status] ?? DESTINATION_STATUS.not_added;
  const added = destination && destination.status !== "not_added";
  return (
    <Card>
      <CardHeader className="pb-2">
        <h2>Payout destination</h2>
      </CardHeader>
      <CardContent className="space-y-2">
        {added ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-lg font-semibold">•••• {destination.last4}</p>
              <Link
                to="/payments/settings"
                className="text-sm font-medium text-[#14594a] hover:underline"
              >
                Manage
              </Link>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
            {destination.hasPendingChange ? (
              <p className="text-xs text-muted-foreground">
                A change of account is being reviewed — payouts keep going here
                meanwhile.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Weekly payout{restaurantName ? ` · ${restaurantName}` : ""}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Add the bank account your weekly payouts should go to.
            </p>
            <Link
              to="/payments/settings"
              className="text-sm font-medium text-[#14594a] hover:underline"
            >
              Add bank account
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// "Payment support" (Figma 144:7167) — the way into the restaurant's payment issues.
export function PaymentSupportCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <h2>Payment support</h2>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Track a reported issue without leaving Payments.
        </p>
        <Button asChild variant="outline">
          <Link to="/payments/issues">Open support tickets</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function YuloMoneyCard({ amountPaise }) {
  return (
    <div className="rounded-[20px] bg-[#fcf1d4] p-5">
      <p className="text-[16px] font-semibold text-[#6b4700]">
        Yulo money · {rupees(amountPaise)}
      </p>
      <p className="mt-2 text-[12px] leading-4 text-[#6b4700]">
        Customer-paid platform and delivery charges. Outside your restaurant
        payout, not an extra deduction.
      </p>
    </div>
  );
}

// A label / value line inside a card ("Price incl GST ₹315.00"), with an optional sub-line.
export function MoneyLine({
  label,
  sub,
  amountPaise,
  value,
  strong,
  negativeRed,
}) {
  const shown = value ?? (amountPaise == null ? "—" : rupees(amountPaise));
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 border-b border-[#e3dfd4] py-3 last:border-0",
        strong && "border-0 pt-4",
      )}
    >
      <div>
        <p className={cn("text-sm", strong && "text-base font-semibold")}>
          {label}
        </p>
        {sub ? (
          <p className="text-[11px] text-muted-foreground">{sub}</p>
        ) : null}
      </div>
      <div
        className={cn(
          "text-sm font-medium",
          strong && "text-[24px] font-semibold text-[#14594a]",
          negativeRed && (amountPaise ?? 0) < 0 && "text-[#b3421e]",
        )}
      >
        {shown}
      </div>
    </div>
  );
}

// A vertical list of steps with done / not-done dots (payout timeline, clearance steps).
export function Steps({ steps }) {
  return (
    <ol>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={step.key ?? step.title} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                  step.tone === "danger"
                    ? "bg-[#b3421e]"
                    : step.done
                      ? "bg-[#14594a]"
                      : "border border-[#6f766f] bg-white",
                )}
              />
              {!last ? <span className="w-px flex-1 bg-[#e3dfd4]" /> : null}
            </div>
            <div className={last ? "pb-0" : "pb-4"}>
              <p
                className={cn(
                  "text-sm font-semibold",
                  !step.done && "text-muted-foreground",
                )}
              >
                {step.title}
              </p>
              {step.detail ? (
                <p className="text-xs text-muted-foreground">{step.detail}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function SectionError({ children }) {
  return (
    <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-[#b3421e]">
      {children}
    </p>
  );
}
