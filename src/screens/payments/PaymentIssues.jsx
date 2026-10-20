// Payment issues (/payments/issues and /payments/issues/:ticketId) — the restaurant's tickets
// about payouts, orders and bills, behind "Open support tickets" on Payments. The list has no
// Figma frame (portal table style); a ticket opens the same tracking panel as the report
// drawer (Figma 144:5747).
//
//   GET /owner/:rId/payment-issues?status&page&limit   → { tickets, total, page, pages, counts }
//   GET /owner/:rId/payment-issues/:ticketId

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
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
  usePaymentIssue,
  usePaymentIssues,
} from "@/hooks/owner/usePaymentIssues";
import { errorMessage } from "@/lib/errors";
import {
  TICKET_FILTERS,
  issueTypeLabel,
  ticketStatusBadge,
} from "@/lib/paymentIssues";
import { dayLabel, periodLabel, rupees, shortDay } from "@/lib/payments";
import { cn } from "@/lib/utils";
import { SectionError } from "./parts";
import { TicketPanel } from "./issues";
import { Badge, Button, Card, CardContent, CardHeader, PayScope } from "./ui";

const PAGE_SIZE = 20;

function linkedLabel(record) {
  if (!record) return "—";
  if (record.kind === "payout") return `Payout · ${periodLabel(record.period)}`;
  return `${record.kind === "bill" ? "Bill" : "Order"} ${record.displayNo ?? ""} · ${shortDay(record.date)}`;
}

export function PaymentIssuesList() {
  const { restaurantId } = useOwnerAuth();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, isFetching } = usePaymentIssues(
    restaurantId,
    {
      status,
      page,
      limit: PAGE_SIZE,
    },
  );
  const counts = data?.counts ?? {};
  const totalAll = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);

  function pick(next) {
    setStatus(next);
    setPage(1);
  }

  return (
    <DashboardLayout>
      <PayScope className="mx-auto w-full max-w-6xl pb-10">
        <Link
          to="/payments"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Payments
        </Link>
        <h1 className="text-2xl font-bold">Payment issues</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Issues you reported about payouts, orders and bills. A ticket never
          changes a payout — Yulo support reviews it and replies here.
        </p>

        <div
          className="mb-4 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Status"
        >
          {[{ value: "", label: "All" }, ...TICKET_FILTERS].map((f) => {
            const count = f.value ? (counts[f.value] ?? 0) : totalAll;
            const active = status === f.value;
            return (
              <button
                key={f.value || "all"}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => pick(f.value)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm",
                  active
                    ? "border-[#14594a] bg-[#14594a] text-white"
                    : "border-[#e3dfd4] bg-white hover:bg-[#efece4]",
                )}
              >
                {f.label} · {count}
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <h2 className="text-base font-bold">Your tickets</h2>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                Loading payment issues…
              </p>
            ) : isError ? (
              <div className="px-5 py-4">
                <SectionError>
                  {errorMessage(
                    error,
                    "Couldn't load your payment issues. Refresh the page to try again.",
                  )}
                </SectionError>
              </div>
            ) : data.tickets.length === 0 ? (
              <div className="px-5 py-8 text-sm">
                <p className="font-medium">
                  {status
                    ? "No tickets with this status"
                    : "No payment issues yet"}
                </p>
                <p className="text-muted-foreground">
                  Report one from a statement or an order&apos;s payment page if
                  something looks wrong.
                </p>
              </div>
            ) : (
              <Table className={cn(isFetching && "opacity-70")}>
                <TableHeader>
                  <TableRow className="bg-[#efece4]">
                    <TableHead>Ticket</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Linked record</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Raised</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tickets.map((t) => {
                    const badge = ticketStatusBadge(t.status);
                    return (
                      <TableRow key={t._id} className="border-[#e3dfd4]">
                        <TableCell className="font-mono text-xs">
                          {t.ticketNumber}
                        </TableCell>
                        <TableCell>{issueTypeLabel(t.issueType)}</TableCell>
                        <TableCell>{linkedLabel(t.linkedRecord)}</TableCell>
                        <TableCell className="text-right">
                          {t.linkedRecord?.amountPaise != null
                            ? rupees(t.linkedRecord.amountPaise)
                            : "—"}
                        </TableCell>
                        <TableCell>{dayLabel(t.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          {t.status === "awaiting_restaurant" ? (
                            <p className="mt-1 text-[11px] text-[#b3421e]">
                              Yulo needs your reply
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Link
                            to={`/payments/issues/${t._id}`}
                            className="text-sm font-medium text-[#14594a] hover:underline"
                          >
                            View ticket
                          </Link>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {data && data.pages > 1 ? (
              <div className="flex items-center justify-end gap-2 px-5 py-3 text-sm">
                <span className="text-muted-foreground">
                  Page {data.page} of {data.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight />
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </PayScope>
    </DashboardLayout>
  );
}

export function PaymentIssueDetail() {
  const { ticketId } = useParams();
  const { restaurantId } = useOwnerAuth();
  const {
    data: ticket,
    isLoading,
    isError,
    error,
  } = usePaymentIssue(restaurantId, ticketId);

  return (
    <DashboardLayout>
      <PayScope className="mx-auto w-full max-w-3xl pb-10">
        <Link
          to="/payments/issues"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Payment issues
        </Link>
        <h1 className="mb-5 text-2xl font-bold">
          {ticket ? (
            <>
              Ticket{" "}
              <span className="whitespace-nowrap">{ticket.ticketNumber}</span>
            </>
          ) : (
            "Payment issue"
          )}
        </h1>
        {isLoading ? (
          <p className="text-muted-foreground">Loading the ticket…</p>
        ) : isError ? (
          <SectionError>
            {errorMessage(
              error,
              "Couldn't load this ticket. Refresh the page to try again.",
            )}
          </SectionError>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <TicketPanel ticket={ticket} />
            </CardContent>
          </Card>
        )}
      </PayScope>
    </DashboardLayout>
  );
}
