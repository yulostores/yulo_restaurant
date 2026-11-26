// Paid any day — the restaurant's side of it (replaces the weekly "Next payout"):
//
//   BalanceCards       what Yulo owes the restaurant now, how much of it is still clearing,
//                      and what it has been paid this month
//   DailyReport        day by day for one day or a range: earned, deducted, paid, owed at day end,
//                      with an Excel download
//   PaymentsReceived   every payment Yulo made to the restaurant, with its UTR
//
// GET /owner/:rId/payments/{balance, received, daily} (services/restaurantPayouts.service.js).
// Read-only — Yulo pays; nothing here changes money.

import { useState } from "react";
import { Download } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/Toaster";
import { ownerApi } from "@/api/owner.api";
import { useDailyReport, usePaymentBalance, usePaymentsReceived } from "@/hooks/owner/usePayments";
import { errorMessage } from "@/lib/errors";
import { rupees } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { KpiCard, SectionError } from "./parts";
import { Badge, Button, Card, CardContent } from "./ui";

const DAY_MS = 86_400_000;
const istDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const shift = (iso, days) => istDay(new Date(new Date(`${iso}T12:00:00+05:30`).getTime() + days * DAY_MS));
const dayText = (iso) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T12:00:00+05:30`));
const dateTimeText = (d) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d));

function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BalanceCards({ restaurantId }) {
  const { data, isLoading, isError, error } = usePaymentBalance(restaurantId);
  if (isError) return <SectionError>{errorMessage(error, "Couldn't load your balance.")}</SectionError>;
  const last = data?.lastPayment;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <KpiCard
        tone="accent"
        label="Balance owed to you"
        value={isLoading ? "…" : rupees(data?.balancePaise ?? 0)}
        sub={last ? `Last paid ${rupees(last.amountPaise)} on ${dateTimeText(last.paidAt)}` : "Yulo pays this to your bank account"}
      />
      <KpiCard
        label="Still clearing"
        value={isLoading ? "…" : rupees(data?.clearingPaise ?? 0)}
        sub="Part of your balance · Razorpay T+2"
      />
      <KpiCard
        tone="yulo"
        label="Paid to you this month"
        value={isLoading ? "…" : rupees(data?.paidThisMonthPaise ?? 0)}
        sub={`${data?.paymentsThisMonth ?? 0} ${data?.paymentsThisMonth === 1 ? "payment" : "payments"}`}
      />
    </div>
  );
}

function presets(today) {
  return [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: shift(today, -1), to: shift(today, -1) },
    { label: "Last 7 days", from: shift(today, -6), to: today },
    { label: "This month", from: `${today.slice(0, 8)}01`, to: today },
  ];
}

function RangePicker({ from, to, onChange, children }) {
  const today = istDay(new Date());
  const active = presets(today).find((p) => p.from === from && p.to === to);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-1.5">
        {presets(today).map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.from, p.to)}
            className={cn(
              "pay-figure h-[38px] rounded-full border px-4 text-[14px] font-semibold",
              active?.label === p.label ? "border-[#14594a] bg-[#e0efea] text-[#14594a]" : "border-[#e3dfd4] bg-white text-[#596059]",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="space-y-1 text-[12px] font-semibold text-[#596059]">
        From
        <Input type="date" value={from} max={today} onChange={(e) => onChange(e.target.value, to < e.target.value ? e.target.value : to)} className="w-40" />
      </label>
      <label className="space-y-1 text-[12px] font-semibold text-[#596059]">
        To
        <Input type="date" value={to} min={from} max={today} onChange={(e) => onChange(from, e.target.value)} className="w-40" />
      </label>
      {children}
    </div>
  );
}

export function DailyReport({ restaurantId }) {
  const toast = useToast();
  const today = istDay(new Date());
  const [from, setFrom] = useState(shift(today, -6));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const { data, isLoading, isError, error } = useDailyReport(restaurantId, { from, to });
  const t = data?.totals;

  async function download() {
    setBusy(true);
    try {
      const { blob, filename } = await ownerApi.downloadDailyReport(restaurantId, { from, to });
      saveFile(blob, filename ?? `payouts-${from}-to-${to}.xlsx`);
      toast.success("Report downloaded");
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't download the report."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <RangePicker
        from={from}
        to={to}
        onChange={(f, t2) => {
          setFrom(f);
          setTo(t2);
        }}
      >
        <Button type="button" variant="outline" onClick={download} disabled={busy}>
          <Download className="h-4 w-4" /> {busy ? "Preparing…" : "Download Excel"}
        </Button>
      </RangePicker>

      {isError ? <SectionError>{errorMessage(error, "Couldn't load the report.")}</SectionError> : null}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Net earned" value={rupees(t?.netEarnedPaise ?? 0)} sub={`${t?.entries ?? 0} orders & bills`} />
        <KpiCard label="Paid to you" value={rupees(t?.paidPaise ?? 0)} sub={`${t?.payments ?? 0} payments`} />
        <KpiCard label="Owed at the start" value={rupees(data?.openingBalancePaise ?? 0)} sub={dayText(from)} />
        <KpiCard tone="accent" label="Owed at the end" value={rupees(data?.closingBalancePaise ?? 0)} sub={dayText(to)} />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Orders & bills</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Adjustments</TableHead>
                  <TableHead className="text-right">Net earned</TableHead>
                  <TableHead className="text-right">Paid to you</TableHead>
                  <TableHead className="text-right">Owed at day end</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.days ?? []).map((d) => (
                  <TableRow key={d.date}>
                    <TableCell className="whitespace-nowrap font-medium">{dayText(d.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.entries}</TableCell>
                    <TableCell className="text-right tabular-nums">{rupees(d.earningsPaise)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{d.deductionsPaise ? `−${rupees(d.deductionsPaise)}` : rupees(0)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{rupees(d.adjustmentsPaise)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{rupees(d.netEarnedPaise)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", d.paidPaise && "font-semibold text-[#1a6e43]")}>{rupees(d.paidPaise)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{rupees(d.closingBalancePaise)}</TableCell>
                  </TableRow>
                ))}
                {!data?.days?.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{isLoading ? "Loading…" : "No days in this range."}</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <p className="text-[12px] leading-4 text-[#6f766f]">
        Earnings are your share of orders and dine-in bills on the day they were recorded. Deductions are platform fees on bills paid at your counter and fees on refunded payments. Dates are in India time.
      </p>
    </div>
  );
}

export function PaymentsReceived({ restaurantId }) {
  const today = istDay(new Date());
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error } = usePaymentsReceived(restaurantId, { from, to, page, limit: 20 });

  return (
    <div className="space-y-5">
      <RangePicker
        from={from}
        to={to}
        onChange={(f, t2) => {
          setFrom(f);
          setTo(t2);
          setPage(1);
        }}
      >
        <p className="pb-2 text-[14px] text-[#596059]">
          {data?.totals?.count ?? 0} payments · <strong className="text-[#1a1d1b]">{rupees(data?.totals?.amountPaise ?? 0)}</strong>
        </p>
      </RangePicker>
      {isError ? <SectionError>{errorMessage(error, "Couldn't load your payments.")}</SectionError> : null}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Paid on</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>UTR / reference</TableHead>
                  <TableHead>To account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.payments ?? []).map((p) => (
                  <TableRow key={p._id}>
                    <TableCell>
                      <span className="mr-2 font-mono text-[12px]">{p.paymentNumber}</span>
                      <Badge variant={p.kind === "full" ? "ok" : "muted"}>{p.kind === "full" ? "Full balance" : "Part"}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{dateTimeText(p.paidAt)}</TableCell>
                    <TableCell>{p.modeLabel}</TableCell>
                    <TableCell className="font-mono text-[13px]">{p.reference}</TableCell>
                    <TableCell className="text-muted-foreground">{p.beneficiary?.accountNumberLast4 ? `•••• ${p.beneficiary.accountNumberLast4}` : "—"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{rupees(p.amountPaise)}</TableCell>
                  </TableRow>
                ))}
                {!data?.payments?.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">{isLoading ? "Loading…" : "No payments in this range."}</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          {(data?.pages ?? 0) > 1 ? (
            <div className="flex items-center justify-end gap-2 border-t border-[#e3dfd4] px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Page {page} of {data.pages}
              </span>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
