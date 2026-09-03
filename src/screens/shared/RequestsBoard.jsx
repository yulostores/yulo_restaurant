// Shared staff view of customer assistance requests (call waiter, need water,
// need bill, …), used by the Waiter and Manager portals.
//
// Presentational only — the data source differs by portal (staff token vs owner
// session), so each caller wires its own hooks (useStaffRequests/useOwnerRequests)
// and passes the result down. See WaiterRequests.jsx / ManagerRequests.jsx.

import { useState } from "react";
import { Bell, CheckCircle2, Clock3, GlassWater, HelpCircle, ReceiptText } from "lucide-react";

import { cn } from "@/lib/utils";

const TYPE_META = {
  call_waiter: { label: "Call Waiter", icon: Bell },
  water:       { label: "Water",       icon: GlassWater },
  bill:        { label: "Bill",        icon: ReceiptText },
  other:       { label: "Other",       icon: HelpCircle },
};

const STATUS_META = {
  pending:      { label: "Pending",      className: "bg-[#FFF3E0] text-[#8a4b16] border-[#F5C99B]" },
  acknowledged: { label: "Acknowledged", className: "bg-[#EEF4FB] text-[#1565C0] border-[#cddcf0]" },
  resolved:     { label: "Resolved",     className: "bg-[#E8F5EC] text-brand-green border-[#BFE3CB]" },
};

const FILTERS = [
  { value: "",             label: "All" },
  { value: "pending",      label: "Pending" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved",     label: "Resolved" },
];

function timeAgo(value) {
  if (!value) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function RequestCard({ request, onAcknowledge, onResolve, busy }) {
  const type = TYPE_META[request.type] ?? TYPE_META.other;
  const Icon = type.icon;
  const status = STATUS_META[request.status] ?? STATUS_META.pending;
  const tableLabel = request.tableId?.identifier
    ? `Table ${request.tableId.identifier}`
    : "Table";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl border bg-white p-4",
        request.status === "pending" ? "border-brand-orange/40" : "border-brand-cream/70",
      )}
    >
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-orange/10 text-brand-orange">
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-[#24190f]">{type.label}</p>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              status.className,
            )}
          >
            {status.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {tableLabel} · <Clock3 className="-mt-0.5 inline h-3 w-3" /> {timeAgo(request.createdAt)}
        </p>
        {request.note ? (
          <p className="mt-1.5 rounded-lg bg-brand-cream/30 px-2.5 py-1.5 text-xs text-[#5a403e]">
            “{request.note}”
          </p>
        ) : null}
      </div>

      {request.status !== "resolved" ? (
        <div className="flex shrink-0 flex-col gap-1.5">
          {request.status === "pending" ? (
            <button
              type="button"
              disabled={busy}
              onClick={onAcknowledge}
              className="rounded-full border border-brand-cream bg-white px-3 py-1.5 text-xs font-bold text-[#5a403e] transition hover:bg-brand-cream/30 disabled:opacity-50"
            >
              Acknowledge
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onResolve}
            className="flex items-center justify-center gap-1 rounded-full bg-brand-gradient px-3 py-1.5 text-xs font-bold text-white transition hover:brightness-105 disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function RequestsBoard({ requests = [], isLoading, isError, onAcknowledge, onResolve, busyId }) {
  const [filter, setFilter] = useState("");

  const filtered = filter ? requests.filter((r) => r.status === filter) : requests;
  const pendingCount = requests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                filter === f.value
                  ? "bg-brand-gradient text-white"
                  : "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {pendingCount > 0 ? (
          <span className="rounded-full bg-[#FCE9E4] px-3 py-1 text-xs font-bold text-brand-maroon">
            {pendingCount} pending
          </span>
        ) : null}
      </div>

      {isError ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-brand-maroon">
          Couldn't load requests. Try refreshing.
        </p>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-cream bg-white py-14 text-center text-sm text-muted-foreground">
          {requests.length === 0 ? "No requests yet." : "No requests match this filter."}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => (
            <RequestCard
              key={r._id}
              request={r}
              busy={busyId === r._id}
              onAcknowledge={() => onAcknowledge?.(r._id)}
              onResolve={() => onResolve?.(r._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
