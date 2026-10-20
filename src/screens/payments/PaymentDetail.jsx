// Order payment detail (/payments/orders/:orderId, /payments/bills/:billId) — Figma 144:6728
// (online order), 144:5941 (still clearing). What the customer paid, what the restaurant
// receives for it, where the money is on its way to the weekly payout, and the statement it
// landed in.
//
//   GET /owner/:rId/payments/orders/:orderId
//   GET /owner/:rId/payments/bills/:billId
//
// A dine-in bill uses the same page (the frame for it, 144:6858, is a copy of the online one): no
// delivery line, its table and bill number, the service charge; a bill paid at the table shows
// the method and the platform fee as the restaurant's own debit (₹12 + 3.5%). Every line and
// amount is the server's — none is computed here.

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  pdfErrorMessage,
  useOrderPayment,
  usePaymentPdf,
} from "@/hooks/owner/usePayments";
import { useToast } from "@/components/Toaster";
import { errorMessage } from "@/lib/errors";
import {
  dateTime,
  dayLabel,
  orderStatusBadge,
  paymentTypeLabel,
  payoutDay,
  periodLabel,
  rupees,
  shortDay,
} from "@/lib/payments";
import { cn } from "@/lib/utils";
import {
  MoneyLine,
  SectionError,
  StatusBadge,
  Steps,
  YuloMoneyCard,
} from "./parts";
import { ReportIssueCard, ReportIssueDrawer } from "./issues";
import { Badge, Button, Card, CardContent, CardHeader, PayScope } from "./ui";

const COUNTER_METHOD = { cash: "Cash", upi: "UPI", card: "Card" };
const STAGE_ORDER = [
  "awaiting_delivery",
  "clearing",
  "eligible",
  "in_statement",
  "settled",
];

const percentText = (p) =>
  `${Number(p ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;

// Sub-line for a customer-bill line with a base + GST split.
const splitSub = (line) =>
  line.freeDelivery
    ? "Free delivery — the restaurant bears this charge"
    : line.basePaise != null && line.gstPaise
      ? `${rupees(line.basePaise)} + ${rupees(line.gstPaise)} GST`
      : null;

function clearanceSteps(d) {
  const c = d.clearance;
  if (
    c.stage === "counter" ||
    d.paymentType === "dine_in_counter" ||
    d.paymentType === "counter"
  ) {
    const method = COUNTER_METHOD[d.customerBill?.counterMethod] ?? null;
    return [
      {
        key: "paid",
        title: method
          ? `Paid at the restaurant · ${method}`
          : "Paid at the restaurant",
        detail: c.paidAt
          ? dateTime(c.paidAt)
          : "Not through Yulo — the money stays with you",
        done: true,
      },
      {
        key: "statement",
        title: "Platform fee added to the weekly statement",
        detail: d.linkedStatement
          ? periodLabel(d.linkedStatement.period)
          : "In the next weekly statement",
        done: !!d.linkedStatement,
      },
    ];
  }
  const at = STAGE_ORDER.indexOf(c.stage);
  const passed = (stage) => at >= STAGE_ORDER.indexOf(stage);
  return [
    {
      key: "paid",
      title: "Customer payment received",
      detail: c.paidAt
        ? `${dateTime(c.paidAt)}${d.customerBill?.paidAmountPaise != null ? ` · ${rupees(d.customerBill.paidAmountPaise)}` : ""}`
        : null,
      done: !!c.paidAt,
    },
    ...(d.orderType && d.orderType !== "dine_in"
      ? [
          {
            key: "delivered",
            title: "Order completed",
            detail:
              c.stage === "awaiting_delivery" ? "Not delivered yet" : null,
            done: c.stage !== "awaiting_delivery",
          },
        ]
      : []),
    {
      key: "cleared",
      title: "Razorpay payment cleared",
      detail: c.clearsAt
        ? `${shortDay(c.clearsAt)} · T+2 days`
        : "T+2 days after payment",
      done: passed("eligible"),
    },
    {
      key: "eligible",
      title: "Eligible for settlement",
      detail: passed("eligible")
        ? "Refund and cancellation checks passed"
        : "After clearance",
      done: passed("eligible"),
    },
    {
      key: "payout",
      title:
        c.stage === "settled"
          ? "Paid out in the weekly payout"
          : "Weekly bank payout",
      detail: c.scheduledFor
        ? `${payoutDay(c.scheduledFor)}${c.stage === "settled" ? "" : " · Not yet paid"}`
        : passed("in_statement")
          ? "Not scheduled yet"
          : "In the statement of the week it clears",
      done: c.stage === "settled",
    },
  ];
}

export default function PaymentDetail({ kind }) {
  const params = useParams();
  const id = kind === "bill" ? params.billId : params.orderId;
  const { restaurantId } = useOwnerAuth();
  const { data, isLoading, isError, error } = useOrderPayment(
    restaurantId,
    kind,
    id,
  );

  return (
    <DashboardLayout>
      <PayScope className="mx-auto w-full max-w-6xl pb-10">
        <Link
          to="/payments"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Payments
        </Link>
        {isLoading ? (
          <p className="text-muted-foreground">Loading payment details…</p>
        ) : isError ? (
          <SectionError>
            {errorMessage(
              error,
              `Couldn't load this ${kind === "bill" ? "bill" : "order"}. Refresh the page to try again.`,
            )}
          </SectionError>
        ) : (
          <Detail data={data} />
        )}
      </PayScope>
    </DashboardLayout>
  );
}

function Detail({ data: d }) {
  const [reporting, setReporting] = useState(false);
  const { restaurantId } = useOwnerAuth();
  const toast = useToast();
  const pdf = usePaymentPdf(restaurantId);
  async function downloadPdf() {
    try {
      await pdf.mutateAsync({ kind: d.kind, id: d.id });
    } catch (err) {
      toast.error(pdfErrorMessage(err));
    }
  }
  const status = orderStatusBadge(d.status);
  const counter =
    d.paymentType === "dine_in_counter" || d.paymentType === "counter";
  const pending =
    d.restaurantSettlement.projected ||
    d.clearance.stage === "awaiting_delivery" ||
    d.clearance.stage === "clearing";
  const title =
    d.kind === "bill"
      ? `Bill ${d.displayNo ?? ""}${d.tableNumber ? ` · Table ${d.tableNumber}` : ""}`
      : `Order ${d.displayNo ?? ""}`;
  const received = d.restaurantSettlement.receivedPaise;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 style={{ fontSize: 22, lineHeight: "28px" }}>{title}</h1>
        <Button
          variant="outline"
          onClick={downloadPdf}
          disabled={pdf.isPending}
        >
          {pdf.isPending ? <Loader2 className="animate-spin" /> : <Download />}
          Download order statement
        </Button>
      </div>

      {/* Hero — pending money is blue (#e3ecf8) with the notice inside, as in 144:5941 */}
      <div
        className={cn(
          "rounded-[20px] px-6 py-5",
          pending && !counter ? "bg-[#e3ecf8]" : "bg-[#e0efea]",
        )}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-[12px] font-medium uppercase leading-4 tracking-[0.02em] text-[#1a1d1b]">
              {pending
                ? "Expected restaurant settlement"
                : "Restaurant settlement"}
            </p>
            <p
              className={cn(
                "pay-figure mt-1 text-[24px] font-semibold leading-8",
                (received ?? 0) < 0 ? "text-[#b3421e]" : "text-[#14594a]",
              )}
            >
              {received == null ? "—" : rupees(received)}
            </p>
          </div>
          <div>
            <p className="text-[12px] leading-4 text-[#596059]">
              Settlement eligibility
            </p>
            <StatusBadge badge={status} />
          </div>
          <div>
            <p className="text-[12px] leading-4 text-[#596059]">
              Date &amp; time
            </p>
            <p className="mt-2 text-[14px] font-medium">{dateTime(d.date)}</p>
          </div>
          <div>
            <p className="text-[12px] leading-4 text-[#596059]">Payment type</p>
            <p className="mt-2 text-[14px] font-medium">
              {paymentTypeLabel(d.paymentType, d.customerBill?.counterMethod)}
            </p>
          </div>
        </div>
        {pending && !counter ? (
          <p className="mt-4 text-[14px] leading-5 text-[#596059]">
            Clearance and eligibility are not confirmed. No weekly statement or
            bank payout date is assigned.
          </p>
        ) : null}
      </div>
      {d.refund ? (
        <div className="rounded-xl border border-[#e3dfd4] bg-[#efece4] px-5 py-3 text-sm">
          <p className="font-semibold">
            Refunded to the customer
            {d.refund.amountPaise != null
              ? ` · ${rupees(d.refund.amountPaise)}`
              : ""}
          </p>
          <p className="text-muted-foreground">
            {d.refund.reason ? `${d.refund.reason}. ` : ""}
            {d.refund.processedAt
              ? `Refund completed ${dayLabel(d.refund.processedAt)}.`
              : d.refund.initiatedAt
                ? `Refund started ${dayLabel(d.refund.initiatedAt)}.`
                : ""}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-1">
              <h2>Customer bill</h2>
            </CardHeader>
            <CardContent>
              {d.customerBill.paidAtTable ? (
                <p className="py-2 text-sm text-muted-foreground">
                  The guest paid this bill at the table
                  {COUNTER_METHOD[d.customerBill.counterMethod]
                    ? ` by ${COUNTER_METHOD[d.customerBill.counterMethod]}`
                    : ""}{" "}
                  — the money went straight to you, not through Yulo.
                </p>
              ) : null}
              {d.customerBill.lines.map((line) => (
                <MoneyLine
                  key={line.key}
                  label={line.label}
                  sub={splitSub(line)}
                  amountPaise={line.amountPaise}
                />
              ))}
              {d.customerBill.paidAmountPaise != null ? (
                <MoneyLine
                  label="Paid Amount"
                  amountPaise={d.customerBill.paidAmountPaise}
                  strong
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <h2>Restaurant settlement</h2>
            </CardHeader>
            <CardContent>
              {d.restaurantSettlement.lines.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  No settlement for this order.
                </p>
              ) : (
                d.restaurantSettlement.lines.map((line) => (
                  <MoneyLine
                    key={line.key}
                    label={line.label}
                    sub={
                      line.key === "settlementFee"
                        ? `${percentText(line.percent)} of ${rupees(line.onAmountPaise)} · ${rupees(line.basePaise)} + ${rupees(line.gstPaise)} GST`
                        : line.key === "freeDelivery"
                          ? "The delivery charge the restaurant bears for free delivery"
                          : null
                    }
                    amountPaise={line.amountPaise}
                    negativeRed
                  />
                ))
              )}
              <MoneyLine
                label={pending ? "Expected Amount" : "Received Amount"}
                amountPaise={received}
                strong
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="text-sm font-semibold">
                Other fee categories ·{" "}
                {d.otherFeeCategories.every((c) => !c.amountPaise)
                  ? "all ₹0.00"
                  : "see below"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {d.otherFeeCategories
                  .map((c) => `${c.label} ${rupees(c.amountPaise)}`)
                  .join(" · ")}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <h2>{counter ? "Payment" : "Clearance & eligibility"}</h2>
            </CardHeader>
            <CardContent>
              <Steps steps={clearanceSteps(d)} />
              {pending && !counter ? (
                <ReportIssueCard
                  className="mt-4"
                  onReport={() => setReporting(true)}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <h2>Linked weekly statement</h2>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.linkedStatement ? (
                <>
                  <p className="text-sm font-medium">
                    {periodLabel(d.linkedStatement.period)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This {d.kind === "bill" ? "bill" : "order"} contributes{" "}
                    {rupees(d.linkedStatement.contributionPaise)} to the{" "}
                    {rupees(d.linkedStatement.netPayoutPaise)} net payout.
                  </p>
                  {d.ownerView ? (
                    <Badge variant="outline" className="mr-2">
                      {d.ownerView.status}
                    </Badge>
                  ) : null}
                  <Link
                    to={`/payments/statements/${d.linkedStatement.statementId}`}
                    className="inline-block text-sm font-medium text-[#14594a] hover:underline"
                  >
                    View statement &amp; payout
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {d.status === "refunded"
                    ? "Not in a statement — the payment was refunded."
                    : "Not in a statement yet. It joins the statement of the week it clears in."}
                </p>
              )}
            </CardContent>
          </Card>

          {pending && !counter ? (
            <Card>
              <CardContent className="space-y-3 pt-5">
                <h2>Expected, not confirmed</h2>
                <Badge variant="info">Pending</Badge>
                <p className="text-[14px] leading-5 text-[#596059]">
                  The {received == null ? "" : `${rupees(received)} `}settlement
                  is an expected amount. Payment clearance and settlement
                  eligibility must be confirmed before it can join a weekly
                  payout.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {d.yuloMoneyPaise ? (
            <YuloMoneyCard amountPaise={d.yuloMoneyPaise} />
          ) : null}
          {pending && !counter ? null : (
            <ReportIssueCard onReport={() => setReporting(true)} />
          )}
        </div>
      </div>
      {reporting ? (
        <ReportIssueDrawer
          link={d.kind === "bill" ? { billId: d.id } : { orderId: d.id }}
          context={{
            title: `${title} · ${shortDay(d.date)}`,
            badge: status,
            amountPaise: received,
            lines: [
              d.linkedStatement
                ? `In the statement for ${periodLabel(d.linkedStatement.period)}`
                : "Not in a weekly statement yet",
            ],
            link: d.linkedStatement
              ? {
                  to: `/payments/statements/${d.linkedStatement.statementId}`,
                  label: "View payout detail",
                }
              : null,
          }}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </div>
  );
}
