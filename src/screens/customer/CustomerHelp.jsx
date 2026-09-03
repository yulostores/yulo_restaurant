// Customer assistance requests (call waiter, need water, need the bill, …), raised
// against the table the guest scanned. POST/GET /api/restaurants/:id/requests.

import { useState } from "react";
import { Bell, CheckCircle2, Clock3, GlassWater, HelpCircle, ReceiptText, Send } from "lucide-react";

import { useCreateRequest, useMyRequests } from "@/hooks/customer/useRequests";
import { errorMessage } from "@/lib/errors";
import CustomerLayout from "./CustomerLayout";
import { useCustomer } from "./CustomerApp";

const TYPES = [
  { value: "call_waiter", label: "Call Waiter", icon: Bell },
  { value: "water",       label: "Water",       icon: GlassWater },
  { value: "bill",        label: "Bill",        icon: ReceiptText },
  { value: "other",       label: "Other",       icon: HelpCircle },
];

const STATUS_META = {
  pending:      { label: "Pending",      className: "bg-[#FFF3E0] text-[#8a4b16]" },
  acknowledged: { label: "On the way",   className: "bg-[#EEF4FB] text-[#1565C0]" },
  resolved:     { label: "Resolved",     className: "bg-[#E8F5EC] text-brand-green" },
};

function timeAgo(value) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export default function CustomerHelp() {
  const { session } = useCustomer();
  const { tableId, restaurantId } = session;

  const { data: requests = [], isLoading } = useMyRequests(restaurantId, tableId);
  const createRequest = useCreateRequest(restaurantId);

  const [type, setType] = useState(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  if (!tableId) {
    return (
      <CustomerLayout title="Help" showNav activeNav="Help">
        <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
          <Bell className="h-8 w-8 text-brand-orange" />
          <p className="font-bold">Scan your table's QR to ask for help</p>
          <p className="text-sm text-muted-foreground">
            Assistance requests go straight to the waiters covering your table.
          </p>
        </div>
      </CustomerLayout>
    );
  }

  async function raise(selectedType) {
    setType(selectedType);
    setError("");
    setSent(false);
    try {
      await createRequest.mutateAsync({ type: selectedType, note: note.trim(), tableId });
      setSent(true);
      setNote("");
    } catch (err) {
      setError(errorMessage(err, "Couldn't send that. Please try again."));
    } finally {
      setType(null);
    }
  }

  return (
    <CustomerLayout title="Help" showNav activeNav="Help">
      <div className="space-y-5 px-4 py-5">
        <div>
          <h1 className="text-lg font-bold text-[#24190f]">Need something?</h1>
          <p className="text-sm text-muted-foreground">
            Tap a request below — it goes straight to your waiter.
          </p>
        </div>

        {sent ? (
          <p className="rounded-xl bg-[#E8F5EC] px-3.5 py-2.5 text-sm font-medium text-brand-green">
            Sent! Your waiter has been notified.
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl bg-[#FCE9E4] px-3.5 py-2.5 text-sm text-brand-maroon">{error}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const busy = createRequest.isPending && type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                disabled={createRequest.isPending}
                onClick={() => raise(t.value)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-brand-cream bg-white py-5 text-sm font-bold text-[#24190f] transition hover:border-brand-orange/40 hover:bg-brand-cream/20 disabled:opacity-60"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-orange/10 text-brand-orange">
                  <Icon className="h-5 w-5" />
                </span>
                {busy ? "Sending…" : t.label}
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">
            Add a note (optional)
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. table 12, extra napkins"
            maxLength={280}
            className="w-full rounded-xl border border-brand-cream bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-orange"
          />
        </div>

        {requests.length > 0 ? (
          <div className="space-y-2.5">
            <h2 className="text-sm font-bold text-[#24190f]">Your requests</h2>
            {requests.map((r) => {
              const t = TYPES.find((x) => x.value === r.type) ?? TYPES.at(-1);
              const status = STATUS_META[r.status] ?? STATUS_META.pending;
              const Icon = t.icon;
              return (
                <div
                  key={r._id}
                  className="flex items-center gap-3 rounded-2xl border border-brand-cream/70 bg-white p-3.5"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-orange/10 text-brand-orange">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[#24190f]">{t.label}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="h-3 w-3" /> {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.className}`}
                  >
                    {r.status === "resolved" ? <CheckCircle2 className="h-3 w-3" /> : null}
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        ) : !isLoading ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Send className="h-3.5 w-3.5" /> Nothing sent yet this visit.
          </p>
        ) : null}
      </div>
    </CustomerLayout>
  );
}
