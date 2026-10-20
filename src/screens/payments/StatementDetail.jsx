// Statement & payout detail (/payments/statements/:statementId) — Figma 144:6079 (Paid) and
// 144:6245 (Failed). One weekly statement: what the restaurant is paid, how it adds up, where it
// is in the bank transfer, and the orders in it.
//
//   GET /owner/:rId/payments/statements/:statementId
//   GET /owner/:rId/settlements/:statementId/export   (CSV)
//
// Only Paid and Failed are drawn; the other states (not scheduled, scheduled, processing, on
// hold, carried forward) use the same layout with the server's own sentence for the state
// (`ownerView.message`). The hold's internal note is staff-only and never in this response.

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/components/Toaster";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  useExportStatementCsv,
  usePaymentStatement,
  usePaymentsOverview,
  useStatementPdf,
  pdfErrorMessage,
} from "@/hooks/owner/usePayments";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { errorMessage } from "@/lib/errors";
import {
  dayLabel,
  payoutDay,
  periodLabel,
  rupees,
  transferBadge,
} from "@/lib/payments";
import { cn } from "@/lib/utils";
import {
  MoneyLine,
  OrdersTable,
  PayoutDestinationCard,
  SectionError,
  StatusBadge,
  Steps,
  YuloMoneyCard,
} from "./parts";
import { ReportIssueCard, ReportIssueDrawer } from "./issues";
import { Button, Card, CardContent, CardHeader, PayScope } from "./ui";

// The hero's colour and sentence follow the payout's state (Figma 144:6079 Paid — accent tint;
// 144:6245 Failed — #fbe7df with the values and the sentence in #b3421e). States the frames don't
// draw: on hold reads like failed (money held), scheduled / processing / not scheduled like
// pending (#e3ecf8) — each with the server's own sentence.
function heroState(statement, ownerView) {
  const status = ownerView?.status;
  if (status === "Paid") {
    return {
      tint: "bg-[#e0efea]",
      tone: "text-[#14594a]",
      sentence: `Payout completed — ${rupees(statement.netPayoutPaise)} paid to the bank account ending ${statement.destinationLast4 ?? "—"} on ${dayLabel(statement.transfer?.paidAt)}.`,
    };
  }
  if (status === "Failed") {
    return {
      tint: "bg-[#fbe7df]",
      tone: "text-[#b3421e]",
      sentence: `${statement.transfer?.lastFailure?.label ?? "The destination account could not accept the credit"}. ${rupees(statement.netPayoutPaise)} remains unpaid and retained for payout; this is not an additional fee.`,
    };
  }
  if (status === "On hold") {
    return {
      tint: "bg-[#fbe7df]",
      tone: "text-[#b3421e]",
      sentence: [
        ownerView?.message,
        statement.holdLabel ? `Reason: ${statement.holdLabel}.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  return {
    tint: "bg-[#e3ecf8]",
    tone: "text-[#2d5da8]",
    sentence: ownerView?.message ?? null,
  };
}

// The server's timeline steps → Steps rows.
function timelineSteps(timeline) {
  return timeline.map((step) => {
    let detail = null;
    if (step.key === "scheduled" && step.date) detail = payoutDay(step.date);
    else if (step.key === "failed")
      detail = [
        step.reasonLabel !== step.label ? step.reasonLabel : null,
        step.at ? dayLabel(step.at) : null,
      ]
        .filter(Boolean)
        .join(" · ");
    else if (step.key === "eligible")
      detail = step.done
        ? "Cleared payments and adjustments"
        : "Paused while held";
    else if (step.at) detail = dayLabel(step.at);
    else if (!step.done)
      detail = step.key === "paid" ? "Not completed" : "Not yet";
    return {
      key: step.key,
      title: step.label,
      detail,
      done: step.done,
      tone: step.key === "failed" ? "danger" : undefined,
    };
  });
}

export default function StatementDetail() {
  const { statementId } = useParams();
  const { restaurantId, restaurant } = useOwnerAuth();
  const toast = useToast();
  const { data, isLoading, isError, error } = usePaymentStatement(
    restaurantId,
    statementId,
  );
  // For the payout-destination card (status, change requests).
  const overview = usePaymentsOverview(restaurantId, { limit: 1 });
  const navigate = useNavigate();
  const exportCsv = useExportStatementCsv(restaurantId);
  const pdf = useStatementPdf(restaurantId);

  async function downloadPdf() {
    try {
      await pdf.mutateAsync(statementId);
    } catch (err) {
      toast.error(pdfErrorMessage(err));
    }
  }

  async function downloadCsv() {
    try {
      await exportCsv.mutateAsync({
        statementId,
        filename: `yulo-statement-${dayLabel(data.statement.period?.start).replace(/ /g, "-")}.csv`,
      });
    } catch (err) {
      toast.error(err, "Couldn't download the statement. Please try again.");
    }
  }

  return (
    <DashboardLayout>
      <PayScope className="mx-auto w-full max-w-6xl pb-10">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Link
              to="/payments?tab=history"
              className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Payments
            </Link>
            <h1 className="text-2xl font-bold">
              Statement &amp; payout detail
            </h1>
            {data ? (
              <p className="text-sm text-muted-foreground">
                {periodLabel(data.statement.period)}
              </p>
            ) : null}
          </div>
          {overview.data?.statements?.length ? (
            <Select
              value={statementId}
              onValueChange={(id) => navigate(`/payments/statements/${id}`)}
            >
              <SelectTrigger className="pay-figure h-[38px] w-auto min-w-[180px] gap-2 rounded-full border-[#14594a] bg-white px-5 text-[14px] font-semibold text-[#14594a] shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {overview.data.statements.map((s) => (
                  <SelectItem key={s.statementId} value={String(s.statementId)}>
                    {periodLabel(s.period)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading the statement…</p>
        ) : isError ? (
          <SectionError>
            {errorMessage(
              error,
              "Couldn't load this statement. Refresh the page to try again.",
            )}
          </SectionError>
        ) : (
          <Statement
            data={data}
            restaurantName={restaurant?.name}
            destination={overview.data?.payoutDestination}
            downloads={
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  onClick={downloadPdf}
                  disabled={pdf.isPending}
                >
                  {pdf.isPending ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  Download PDF
                </Button>
                {data.hasEntries ? (
                  <Button
                    variant="ghost"
                    onClick={downloadCsv}
                    disabled={exportCsv.isPending}
                  >
                    Download CSV
                  </Button>
                ) : null}
              </div>
            }
          />
        )}
      </PayScope>
    </DashboardLayout>
  );
}

function Statement({ data, restaurantName, destination, downloads }) {
  const [reporting, setReporting] = useState(false);
  const {
    statement,
    ownerView,
    calculation,
    otherFeeCategories,
    orders,
    timeline,
    hasEntries,
  } = data;
  const badge = transferBadge({
    ownerView,
    transferStatus: statement.transfer?.status,
    eligibility: statement.eligibility,
  });
  const otherTotal = otherFeeCategories.reduce(
    (n, c) => n + (c.amountPaise ?? 0),
    0,
  );
  const hero = heroState(statement, ownerView);
  const failed = ownerView?.status === "Failed";
  const transferLine =
    statement.transfer?.status === "paid"
      ? `Paid · ${dayLabel(statement.transfer.paidAt)}`
      : statement.transfer?.status === "scheduled"
        ? `Scheduled · ${payoutDay(statement.transfer.scheduledFor)}`
        : badge.label;

  return (
    <div className="space-y-5">
      {/* Hero — its tint and sentence follow the state */}
      <div className={cn("rounded-[20px] px-6 py-5", hero.tint)}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.4fr_1fr_1.3fr_0.8fr]">
          <div>
            <p className="text-[12px] font-medium uppercase leading-4 tracking-[0.02em] text-[#1a1d1b]">
              Net restaurant payout
            </p>
            <p
              className={cn(
                "pay-figure mt-1 text-[24px] font-semibold leading-8",
                statement.netPayoutPaise < 0
                  ? "text-[#b3421e]"
                  : "text-[#14594a]",
              )}
            >
              {rupees(statement.netPayoutPaise)}
            </p>
          </div>
          <div>
            <p className="text-[12px] leading-4 text-[#596059]">
              Settlement eligibility
            </p>
            <p
              className={cn(
                "mt-2 text-[14px] font-medium",
                statement.eligibility === "on_hold" && "text-[#b3421e]",
              )}
            >
              {statement.eligibility === "on_hold" ? "On hold" : "Eligible"}
            </p>
          </div>
          <div>
            <p className="text-[12px] leading-4 text-[#596059]">
              Bank-transfer status
            </p>
            <p className={cn("mt-2 text-[14px] font-medium", hero.tone)}>
              {ownerView?.status === "Failed"
                ? "Failed · Retained for payout"
                : transferLine}
            </p>
          </div>
          <div>
            <p className="text-[12px] leading-4 text-[#596059]">Destination</p>
            <p className="mt-2 text-[14px] font-medium">
              {statement.destinationLast4
                ? `•••• ${statement.destinationLast4}`
                : "—"}
            </p>
          </div>
        </div>
        {hero.sentence ? (
          <p
            className={cn(
              "mt-4 text-[14px] leading-5",
              ownerView?.status === "Paid"
                ? "text-[#14594a]"
                : "text-[#596059]",
              (ownerView?.status === "Failed" ||
                ownerView?.status === "On hold") &&
                "text-[#1a1d1b]",
            )}
          >
            {hero.sentence}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-1">
              <h2>Statement summary · {periodLabel(statement.period)}</h2>
            </CardHeader>
            <CardContent>
              <MoneyLine
                label="Statement period"
                value={periodLabel(statement.period)}
              />
              <MoneyLine label="Restaurant" value={restaurantName ?? "—"} />
              <MoneyLine
                label="Bank-transfer status"
                value={<StatusBadge badge={badge} />}
              />
              <MoneyLine
                label="Transfer date"
                value={
                  statement.transferDate
                    ? dayLabel(statement.transferDate)
                    : "—"
                }
              />
              {statement.bankReference ? (
                <MoneyLine
                  label="Bank reference"
                  value={
                    <span className="font-mono text-[12px]">
                      {statement.bankReference}
                    </span>
                  }
                />
              ) : null}
              <MoneyLine
                label="Net restaurant payout"
                amountPaise={statement.netPayoutPaise}
                strong
              />
              {failed ? (
                <p className="pb-3 text-[14px] leading-5 text-[#596059]">
                  Check that the account is active and can receive transfers.
                  Request a bank update if the details are incorrect.
                </p>
              ) : null}
              {downloads}
              {failed ? (
                <p className="mt-3 text-[12px] leading-4 text-[#596059]">
                  Retry timing is not available. A new attempt will appear when
                  confirmed; no retry date is guaranteed.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <h2>How this is calculated</h2>
            </CardHeader>
            <CardContent>
              {hasEntries ? (
                <>
                  {calculation.lines.map((line) => (
                    <MoneyLine
                      key={line.key}
                      label={line.label}
                      amountPaise={line.amountPaise}
                      negativeRed
                    />
                  ))}
                  {otherTotal === 0 ? (
                    <MoneyLine
                      label="Other fee categories · all ₹0.00"
                      sub="Restaurant platform · Ads · Other deductions / penalties"
                      value="₹0.00"
                    />
                  ) : (
                    otherFeeCategories
                      .filter((c) => c.amountPaise)
                      .map((c) => (
                        <MoneyLine
                          key={c.key}
                          label={c.label}
                          amountPaise={-c.amountPaise}
                          negativeRed
                        />
                      ))
                  )}
                </>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Order breakdown unavailable
                  </span>{" "}
                  — the per-order figures for this week weren&apos;t recorded.
                  The net payout below is the amount on the statement.
                </p>
              )}
              <MoneyLine
                label="Net payout"
                amountPaise={calculation.netPayoutPaise}
                strong
              />
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h2>Orders in this statement</h2>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <OrdersTable
                  rows={orders}
                  empty="No orders in this statement."
                />
              </CardContent>
            </Card>
            <p className="text-[12px] leading-4 text-[#596059]">
              Free delivery is the delivery charge your restaurant bore.
              Settlement fees are on food orders; dine-in dues on orders paid at
              the table; the refund adjustment is the payment fee kept on a
              refunded order.
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <h2>Payout timeline</h2>
            </CardHeader>
            <CardContent>
              <Steps steps={timelineSteps(timeline)} />
              {failed ? (
                <ReportIssueCard
                  className="mt-4"
                  onReport={() => setReporting(true)}
                />
              ) : null}
            </CardContent>
          </Card>
          <PayoutDestinationCard
            destination={destination}
            restaurantName={restaurantName}
          />
          <YuloMoneyCard amountPaise={data.yuloMoneyPaise} />
          {failed ? null : (
            <ReportIssueCard onReport={() => setReporting(true)} />
          )}
        </div>
      </div>
      {reporting ? (
        <ReportIssueDrawer
          link={{ settlementId: statement.statementId }}
          defaultType={
            statement.transfer?.status === "paid"
              ? "payout_not_received"
              : undefined
          }
          context={{
            title: `Payout · ${periodLabel(statement.period)}`,
            badge,
            amountPaise: statement.netPayoutPaise,
            lines: [
              [
                statement.transfer?.status === "paid"
                  ? `Paid ${dayLabel(statement.transfer.paidAt)}`
                  : null,
                statement.destinationLast4
                  ? `Bank ending ${statement.destinationLast4}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
            ],
            reference: statement.bankReference
              ? `Bank reference ${statement.bankReference}`
              : null,
            link: {
              to: `/payments/statements/${statement.statementId}`,
              label: "View payout detail",
            },
          }}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </div>
  );
}
