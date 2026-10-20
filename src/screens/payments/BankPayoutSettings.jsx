// Bank & payout settings (/payments/settings) — Figma 144:6637 ("Consolidated payments flow —
// Bank & payout settings"). Where the restaurant's weekly payouts are sent, and how money
// gets there.
//
//   GET /owner/:rId/payout-account     the account, masked, with any change request
//   PUT /owner/:rId/payout-account     add / change it (BankAccountForm)
//   GET /owner/:rId/payments/settings  the next scheduled payout (approved restaurants only)
//
// The frame draws the verified state only. Not added, pending verification, rejected and the
// change-request states follow the same card in the portal's style. Only the last four
// digits are ever shown, and bank / IFSC stay masked on this page as the design asks.
//
// Reachable before approval (lib/approval.js): the account can be added while the
// application is under review. The payout schedule waits for approval.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Landmark } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import BankAccountForm from "@/components/BankAccountForm";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  usePaymentSettings,
  usePayoutAccount,
} from "@/hooks/owner/usePayoutAccount";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardContent, CardHeader, PayScope } from "./ui";

const ACCOUNT_STATUS = {
  not_added: { label: "Not added", variant: "muted" },
  pending_verification: { label: "Pending verification", variant: "warn" },
  verified: { label: "Verified", variant: "ok" },
  rejected: { label: "Rejected", variant: "danger" },
};

const CHANGE_STATUS = {
  in_review: { label: "Change requested · in review", variant: "info" },
  awaiting_restaurant: {
    label: "Yulo needs more information",
    variant: "warn",
  },
  rejected: { label: "Change rejected", variant: "danger" },
};

const MONEY_STEPS = [
  { title: "Customer pays online", detail: "Collected through Razorpay" },
  { title: "Payment clears · T+2", detail: "Individual payment clearance" },
  { title: "Settlement eligibility", detail: "Refund and cancellation checks" },
  { title: "Weekly bank payout", detail: "Sent to your verified destination" },
];

const masked = (last4) => (last4 ? `•••• •••• ${last4}` : "—");

const rupees = (paise) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format((Number(paise) || 0) / 100);

// "Mon 12 Oct 2026" — payout dates are calendar days in IST, the settlement time zone. Built
// from parts: toLocaleDateString puts its own commas in ("Mon, 12 Oct, 2026").
function payoutDay(value) {
  if (!value) return "—";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

const shortDate = (value) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });

// "28 Sep–4 Oct 2026"
function periodLabel(period) {
  if (!period?.start || !period?.end) return "";
  const year = new Date(period.end).toLocaleDateString("en-IN", {
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
  return `${shortDate(period.start)}–${shortDate(period.end)} ${year}`;
}

function DetailRow({ label, sub, value, className }) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div>
        <p className="text-sm">{label}</p>
        {sub ? (
          <p className="text-[11px] text-muted-foreground">{sub}</p>
        ) : null}
      </div>
      {value != null ? <p className="text-sm font-medium">{value}</p> : null}
    </div>
  );
}

function DestinationCard({ account, onUpdate }) {
  const status = ACCOUNT_STATUS[account.status] ?? ACCOUNT_STATUS.not_added;
  const change = account.pendingChange;
  const changeStatus = change ? CHANGE_STATUS[change.status] : null;

  if (account.status === "not_added") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <h2>Destination bank account</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-dashed border-[#e3dfd4] bg-[#efece4] px-4 py-4">
            <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-[#14594a]" />
            <div>
              <p className="text-sm font-semibold">No bank account yet</p>
              <p className="text-xs text-muted-foreground">
                Add the account your weekly payouts should go to. Yulo verifies
                it against a cancelled cheque or statement before the first
                payout.
              </p>
            </div>
          </div>
          <Button type="button" onClick={onUpdate} className="h-10 px-5">
            Add bank account
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <h2>Destination bank account</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xl font-semibold tracking-wide">
            {masked(account.accountNumberLast4)}
          </p>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        {account.status === "rejected" && account.rejectionReason ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-[#b3421e]">
            <span className="font-semibold">Reason from Yulo: </span>
            {account.rejectionReason}
          </p>
        ) : null}
        {account.status === "pending_verification" ? (
          <p className="rounded-lg bg-[#FFF7ED] px-4 py-3 text-sm text-[#9A3412]">
            Yulo is checking this account against your proof document. Payouts
            start once it&apos;s verified.
          </p>
        ) : null}

        <div>
          <p className="text-[11px] text-muted-foreground">Account holder</p>
          <p className="text-sm font-medium">
            {account.accountHolderName ?? "—"}
          </p>
        </div>
        <DetailRow
          label="Bank & IFSC"
          sub="Full banking details are protected"
          value="Masked"
          className="border-b border-[#e3dfd4] pb-4"
        />

        {/* A change request — the verified account above keeps receiving payouts meanwhile. */}
        {change && changeStatus ? (
          <div
            className={cn(
              "space-y-2 rounded-lg border px-4 py-3",
              change.status === "rejected"
                ? "border-red-200 bg-red-50"
                : "border-[#e3dfd4] bg-[#efece4]",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                Requested change · {masked(change.accountNumberLast4)}
              </p>
              <Badge variant={changeStatus.variant}>{changeStatus.label}</Badge>
            </div>
            {change.status === "awaiting_restaurant" && change.infoRequest ? (
              <p className="text-sm">
                <span className="font-semibold">
                  Yulo asked for information:{" "}
                </span>
                {change.infoRequest.message}
              </p>
            ) : null}
            {change.status === "rejected" && change.rejectionReason ? (
              <p className="text-sm text-[#b3421e]">
                <span className="font-semibold">Change rejected: </span>
                {change.rejectionReason}
              </p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              {change.status === "rejected"
                ? "Your verified account stays your payout destination. You can request a change again."
                : `Requested ${payoutDay(change.requestedAt)}. Payouts keep going to the account ending ${account.accountNumberLast4} until Yulo verifies the new one.`}
            </p>
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {account.status === "verified"
            ? "Confirm your details before requesting a change to Yulo Stores."
            : "Check your details before saving — Yulo reviews every change."}
        </p>
        <Button type="button" variant="outline" onClick={onUpdate}>
          {change?.status === "awaiting_restaurant"
            ? "Update your request"
            : account.status === "verified"
              ? "Update bank account"
              : "Edit bank account"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PayoutScheduleCard({ isApproved, settings, loading, error }) {
  const next = settings?.nextScheduledPayout ?? null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <h2>Weekly payout schedule</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <DetailRow
          label="Bank payout frequency"
          value="Weekly"
          className="border-b border-[#e3dfd4] pb-3"
        />
        <p className="text-sm text-muted-foreground">
          Eligible earnings are included in a weekly payout. Review the
          statement for the scheduled date and the amount to be sent.
        </p>
        {!isApproved ? (
          <div className="rounded-lg bg-[#efece4] px-4 py-3 text-sm text-muted-foreground">
            Payouts start once your restaurant is approved.
          </div>
        ) : loading ? (
          <div className="rounded-lg bg-[#efece4] px-4 py-3 text-sm text-muted-foreground">
            Loading the payout schedule…
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-[#b3421e]">
            {errorMessage(
              error,
              "Couldn't load the payout schedule. Refresh the page to try again.",
            )}
          </div>
        ) : next ? (
          <div className="rounded-[12px] bg-[#e0efea] px-4 py-3">
            <p className="text-[14px] font-semibold text-[#14594a]">
              Next scheduled payout · {payoutDay(next.scheduledFor)}
            </p>
            <p className="mt-1 text-[14px] text-[#0e4237]">
              {rupees(next.netPaise)} for {periodLabel(next.period)}
              {next.destinationLast4
                ? `, to the account ending ${next.destinationLast4}`
                : ""}
              .
            </p>
            <Link
              to={`/payments/statements/${next.statementId}`}
              className="mt-2 inline-block text-sm font-medium text-[#14594a] hover:underline"
            >
              View statement &amp; payout
            </Link>
          </div>
        ) : (
          <div className="rounded-lg bg-[#efece4] px-4 py-3">
            <p className="text-sm font-semibold">Not scheduled yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The date appears here as soon as Yulo schedules your next weekly
              payout.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BankPayoutSettings() {
  const { restaurantId, isApproved } = useOwnerAuth();
  const [formOpen, setFormOpen] = useState(false);
  const {
    data: account,
    isLoading,
    isError,
    error,
  } = usePayoutAccount(restaurantId);
  const paymentSettings = usePaymentSettings(restaurantId, {
    enabled: isApproved,
  });

  return (
    <DashboardLayout>
      <PayScope className="mx-auto w-full max-w-6xl pb-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">Bank &amp; payout settings</h1>
            <p className="text-sm text-muted-foreground">
              Manage the destination for your weekly restaurant payouts.
            </p>
          </div>
          {/* Before approval the Payments pages are locked, so this goes back to Store Settings. */}
          <Button asChild variant="outline">
            <Link to={isApproved ? "/payments" : "/store-settings"}>
              {isApproved ? "Back to payments" : "Back to store settings"}
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading your bank account…</p>
        ) : isError ? (
          <p className="text-[#b3421e]">
            {errorMessage(
              error,
              "Couldn't load your bank account. Refresh the page to try again.",
            )}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.75fr_1fr]">
            <div className="space-y-5">
              <DestinationCard
                account={account}
                onUpdate={() => setFormOpen(true)}
              />
              <PayoutScheduleCard
                isApproved={isApproved}
                settings={paymentSettings.data}
                loading={paymentSettings.isLoading}
                error={paymentSettings.isError ? paymentSettings.error : null}
              />
              <Card>
                <CardHeader className="pb-2">
                  <h2>T+2 clearance is not a bank payout</h2>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Razorpay clears individual payments in two days. After
                    eligibility checks, amounts are grouped into a weekly bank
                    payout; clearance alone does not confirm a bank transfer.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <h2>How your money reaches you</h2>
                </CardHeader>
                <CardContent>
                  <ol>
                    {MONEY_STEPS.map((step, i) => {
                      const last = i === MONEY_STEPS.length - 1;
                      return (
                        <li key={step.title} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[#14594a]" />
                            {!last ? (
                              <span className="w-px flex-1 bg-[#e3dfd4]" />
                            ) : null}
                          </div>
                          <div className={last ? "pb-0" : "pb-4"}>
                            <p className="text-sm font-semibold">
                              {step.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {step.detail}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </CardContent>
              </Card>
              <div className="rounded-[20px] bg-[#fcf1d4] p-5">
                <h2 className="text-[#6b4700]">Yulo money is separate</h2>
                <p className="mt-2 text-sm text-[#6b4700]">
                  Customer-paid platform and delivery charges go directly to
                  Yulo, not to your bank account as restaurant earnings.
                </p>
              </div>
            </div>
          </div>
        )}
      </PayScope>

      <BankAccountForm
        open={formOpen}
        restaurantId={restaurantId}
        account={account}
        onClose={() => setFormOpen(false)}
      />
    </DashboardLayout>
  );
}
