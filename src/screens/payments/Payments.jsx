// Payments (/payments) — Figma 144:7167 (Overview), 144:6523 (Payout history), 144:6432 (no
// payments yet). What the restaurant has earned, what is still clearing, and every weekly
// statement and its bank transfer.
//
//   GET /owner/:rId/payments/overview?statementId&status&page&limit
//   GET /owner/:rId/payments/history?transferStatus&page&limit
//
// Everything is the server's: amounts (paise), statuses and the sentence the restaurant sees for
// a payout (`ownerView`). Yulo schedules and pays — nothing on these screens changes money.
// Razorpay's fee and Yulo's margin are never part of these responses.

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  usePaymentsOverview,
  usePayoutHistory,
  useStatementPdf,
  pdfErrorMessage,
} from "@/hooks/owner/usePayments";
import { useToast } from "@/components/Toaster";
import { errorMessage } from "@/lib/errors";
import {
  ORDER_FILTERS,
  TRANSFER_FILTERS,
  dayLabel,
  payoutDay,
  periodLabel,
  rupees,
  transferBadge,
} from "@/lib/payments";
import { cn } from "@/lib/utils";
import {
  KpiCard,
  OrdersTable,
  PaymentSupportCard,
  PayoutDestinationCard,
  SectionError,
  StatusBadge,
  Steps,
} from "./parts";
import { Button, Card, CardContent, CardHeader, PayScope } from "./ui";

const PAGE_SIZE = 10;
const ALL = "all";

// The Next payout card's sub-line for each state the statement can be in.
function nextPayoutSub(next, reason) {
  if (!next) {
    return reason === "no_open_statement"
      ? "All statements paid"
      : "No eligible earnings yet";
  }
  if (next.eligibility === "on_hold")
    return next.holdLabel ? `On hold · ${next.holdLabel}` : "On hold";
  switch (next.transferStatus) {
    case "scheduled":
      return `Scheduled · ${payoutDay(next.scheduledFor)}`;
    case "processing":
      return "Processing · sent to the bank";
    case "failed":
      return "Failed · retained for payout";
    default:
      return "Not scheduled · date unknown";
  }
}

function Pager({ page, total, limit, onPage }) {
  const pages = Math.max(1, Math.ceil((total ?? 0) / limit));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-[#e3dfd4] px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft /> Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next <ChevronRight />
      </Button>
    </div>
  );
}

function FilterSelect({ value, onChange, options, allLabel, className }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "pay-figure h-[38px] w-auto min-w-[150px] gap-2 rounded-full border-[#14594a] bg-white px-5 text-[14px] font-semibold text-[#14594a] shadow-none",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function Overview({
  data,
  statementId,
  onStatement,
  status,
  onStatus,
  page,
  onPage,
  restaurantName,
}) {
  const statementOptions = data.statements.map((s) => ({
    value: String(s.statementId),
    label: periodLabel(s.period),
  }));
  const viewStatementId =
    data.selectedStatementId ?? data.nextPayout?.statementId ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <FilterSelect
          value={statementId ?? ALL}
          onChange={(v) => onStatement(v === ALL ? null : v)}
          options={statementOptions}
          allLabel={periodLabel({
            start: data.period?.start,
            end: data.period?.end,
          })}
        />
        {viewStatementId ? (
          <Button asChild className="h-[38px] px-6">
            <Link to={`/payments/statements/${viewStatementId}`}>
              View statement &amp; payout
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          tone="accent"
          label="Next payout"
          value={rupees(data.nextPayout?.netPaise ?? 0)}
          sub={nextPayoutSub(data.nextPayout, data.nextPayoutReason)}
        />
        <KpiCard
          label="Still clearing"
          value={rupees(data.stillClearing.amountPaise)}
          sub={`Razorpay T+2 · ${data.stillClearing.orderCount} ${data.stillClearing.orderCount === 1 ? "order" : "orders"}`}
        />
        <KpiCard
          tone="yulo"
          label={
            data.selectedStatementId
              ? "Yulo money in this period"
              : "Yulo money this week"
          }
          value={rupees(data.yuloMoney.amountPaise)}
          sub="Customer-paid · outside payout"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>Recent orders</h2>
            <FilterSelect
              value={status ?? ALL}
              onChange={(v) => onStatus(v === ALL ? null : v)}
              options={ORDER_FILTERS}
              allLabel="Status: All"
            />
          </div>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <OrdersTable
                rows={data.recentOrders.rows}
                empty={
                  status
                    ? "No orders with this status."
                    : "No payment records yet."
                }
              />
              <Pager
                page={page}
                total={data.recentOrders.total}
                limit={PAGE_SIZE}
                onPage={onPage}
              />
            </CardContent>
          </Card>
          <p className="text-[12px] leading-4 text-[#6f766f]">
            Open an order for its bill, deductions and linked statement.
            Clearing amounts are expected settlements.
          </p>
        </div>
        <div className="space-y-5">
          <PayoutDestinationCard
            destination={data.payoutDestination}
            restaurantName={restaurantName}
          />
          <PaymentSupportCard />
        </div>
      </div>
    </div>
  );
}

// ── Payout history ────────────────────────────────────────────────────────────

function History({ restaurantId, restaurantName, destination, statements }) {
  const toast = useToast();
  const [transferStatus, setTransferStatus] = useState(null);
  // A statement period from the picker narrows the archive to that week (from / to).
  const [periodId, setPeriodId] = useState(null);
  const [page, setPage] = useState(1);
  const period = statements?.find(
    (s) => String(s.statementId) === periodId,
  )?.period;
  const { data, isLoading, isError, error } = usePayoutHistory(restaurantId, {
    transferStatus,
    from: period?.start,
    to: period?.end,
    page,
    limit: PAGE_SIZE,
  });
  const pdf = useStatementPdf(restaurantId);
  async function downloadPdf(statementId) {
    try {
      await pdf.mutateAsync(statementId);
    } catch (err) {
      toast.error(pdfErrorMessage(err));
    }
  }

  if (isLoading)
    return <p className="text-muted-foreground">Loading payout history…</p>;
  if (isError) {
    return (
      <SectionError>
        {errorMessage(
          error,
          "Couldn't load the payout history. Refresh to try again.",
        )}
      </SectionError>
    );
  }

  const upcoming = data.kpis.upcomingEligible;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <FilterSelect
          value={periodId ?? ALL}
          onChange={(v) => {
            setPeriodId(v === ALL ? null : v);
            setPage(1);
          }}
          options={(statements ?? []).map((s) => ({
            value: String(s.statementId),
            label: periodLabel(s.period),
          }))}
          allLabel="All periods"
        />
        <FilterSelect
          value={transferStatus ?? ALL}
          onChange={(v) => {
            setTransferStatus(v === ALL ? null : v);
            setPage(1);
          }}
          options={TRANSFER_FILTERS}
          allLabel="Status: All"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          tone="accent"
          label="Total paid"
          value={rupees(data.kpis.totalPaidPaise)}
        />
        <KpiCard
          label="Upcoming eligible statement"
          value={rupees(upcoming?.netPaise ?? 0)}
          sub={
            upcoming
              ? upcoming.scheduledFor
                ? `Scheduled · ${payoutDay(upcoming.scheduledFor)}`
                : "Not scheduled yet"
              : "Nothing waiting"
          }
        />
        <KpiCard
          label="Available statements"
          value={String(data.kpis.availableStatements)}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <h2>Payout history and statement archive</h2>
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {data.rows.length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">
                  {transferStatus
                    ? "No statements with this status."
                    : "No statements yet."}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Statement period</TableHead>
                      <TableHead>Transfer date</TableHead>
                      <TableHead>Net payout</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Downloads</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row) => (
                      <TableRow
                        key={row.statementId}
                        className="border-[#e3dfd4]"
                      >
                        <TableCell className="font-mono text-[12px]">
                          {periodLabel(row.period)}
                        </TableCell>
                        <TableCell>
                          {row.transferDate ? dayLabel(row.transferDate) : "—"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {rupees(row.netPayoutPaise)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge badge={transferBadge(row)} />
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/payments/statements/${row.statementId}`}
                            className="text-[14px] text-[#14594a] hover:underline"
                          >
                            View Details
                          </Link>
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => downloadPdf(row.statementId)}
                            disabled={pdf.isPending}
                            className="text-[14px] text-[#14594a] hover:underline disabled:opacity-50"
                          >
                            PDF ↓
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <Pager
                page={page}
                total={data.total}
                limit={PAGE_SIZE}
                onPage={setPage}
              />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <PayoutDestinationCard
            destination={destination}
            restaurantName={restaurantName}
          />
          <PaymentSupportCard />
        </div>
      </div>
    </div>
  );
}

// ── No payments yet ───────────────────────────────────────────────────────────

function EmptyState({ destination, restaurantName }) {
  const hasAccount = destination && destination.status !== "not_added";
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label="Next payout"
          value={rupees(0)}
          sub="No eligible earnings yet"
        />
        <KpiCard
          label="Still clearing"
          value={rupees(0)}
          sub="0 orders awaiting clearance"
        />
        <KpiCard
          tone="yulo"
          label="Yulo money"
          value={rupees(0)}
          sub="No customer-paid fees yet"
        />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-3">
                <span className="grid h-14 w-14 place-items-center rounded-[16px] bg-[#e0efea] text-[#14594a]">
                  <FileText className="h-6 w-6" />
                </span>
                <h2>Your payments start with your first order</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild className="h-10 px-5">
                  <Link to="/orders">Go to orders</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/menu-items">Review menu</Link>
                </Button>
              </div>
              <div>
                <p className="text-sm font-semibold">
                  No statements or payout date yet
                </p>
                <p className="text-xs text-muted-foreground">
                  Your first eligible earnings will create a weekly statement.
                  Confirm your bank destination before that first payout.
                </p>
              </div>
              <Button asChild variant="outline">
                <Link to="/payments/settings">
                  {hasAccount
                    ? "Confirm bank account"
                    : "Add your bank account"}
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <h2>Recent orders</h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">No payment records yet</p>
              <p className="text-xs text-muted-foreground">
                Paid orders and expected settlements will appear here once you
                receive your first online payment.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <h2>Payout history</h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">
                No statements or completed payouts
              </p>
              <p className="text-xs text-muted-foreground">
                There is no scheduled payout for this account yet.
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <h2>Your first payout</h2>
            </CardHeader>
            <CardContent>
              <Steps
                steps={[
                  {
                    title: hasAccount
                      ? "Confirm bank destination"
                      : "Add your bank account",
                    detail: hasAccount
                      ? `Review account ending ${destination.last4}`
                      : "Where your weekly payouts go",
                    done: destination?.status === "verified",
                  },
                  {
                    title: "Receive a paid online order",
                    detail: "Payment appears in Overview",
                  },
                  {
                    title: "Clearance, then eligibility",
                    detail: "Razorpay T+2 and checks",
                  },
                  {
                    title: "Weekly bank payout",
                    detail: "Statement shows the scheduled date",
                  },
                ]}
              />
            </CardContent>
          </Card>
          <PayoutDestinationCard
            destination={destination}
            restaurantName={restaurantName}
          />
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Payments() {
  const { restaurantId, restaurant } = useOwnerAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "history" ? "history" : "overview";
  const statementId = searchParams.get("statementId");
  const [status, setStatus] = useState(null);
  const [page, setPage] = useState(1);

  const overview = usePaymentsOverview(restaurantId, {
    statementId,
    status,
    page,
    limit: PAGE_SIZE,
  });
  const data = overview.data;
  const restaurantName = restaurant?.name;

  function setTab(next) {
    const params = new URLSearchParams(searchParams);
    if (next === "history") params.set("tab", "history");
    else params.delete("tab");
    setSearchParams(params);
  }
  function setStatement(id) {
    const params = new URLSearchParams(searchParams);
    if (id) params.set("statementId", id);
    else params.delete("statementId");
    setSearchParams(params);
    setPage(1);
  }

  return (
    <DashboardLayout>
      <PayScope className="mx-auto w-full max-w-6xl pb-10">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">Payments</h1>
          <Button asChild variant="outline" className="h-[38px]">
            <Link to="/payments/settings">Bank &amp; payout settings</Link>
          </Button>
        </div>

        {overview.isLoading ? (
          <p className="text-muted-foreground">Loading payments…</p>
        ) : overview.isError ? (
          <SectionError>
            {errorMessage(
              overview.error,
              "Couldn't load your payments. Refresh the page to try again.",
            )}
          </SectionError>
        ) : data.isEmpty ? (
          <EmptyState
            destination={data.payoutDestination}
            restaurantName={restaurantName}
          />
        ) : (
          <>
            <div
              className="mb-6 flex gap-7 border-b border-[#e3dfd4]"
              role="tablist"
            >
              {[
                { key: "overview", label: "Overview" },
                { key: "history", label: "Payout history" },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "-mb-px border-b-2 pb-3 text-[14px] font-medium leading-5",
                    tab === t.key
                      ? "border-[#14594a] text-[#14594a]"
                      : "border-transparent text-[#596059] hover:text-[#1a1d1b]",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {tab === "history" ? (
              <History
                restaurantId={restaurantId}
                restaurantName={restaurantName}
                destination={data.payoutDestination}
                statements={data.statements}
              />
            ) : (
              <Overview
                data={data}
                statementId={statementId}
                onStatement={setStatement}
                status={status}
                onStatus={(s) => {
                  setStatus(s);
                  setPage(1);
                }}
                page={page}
                onPage={setPage}
                restaurantName={restaurantName}
              />
            )}
          </>
        )}
      </PayScope>
    </DashboardLayout>
  );
}
