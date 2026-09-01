// Support Tickets (/admin/tickets) — GET/PATCH /api/admin/tickets and
// POST /api/admin/tickets/:id/messages. Replying to an open ticket flips it to
// in_progress server-side; resolving or closing stamps resolvedAt.

import { useState } from "react";
import { Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useAddTicketMessage,
  useTicket,
  useTickets,
  useUpdateTicket,
} from "@/hooks/admin/useAdmin";
import AdminLayout, { formatNumber } from "./AdminLayout";

const STATUSES   = ["open", "in_progress", "resolved", "closed"];
const PRIORITIES = ["low", "medium", "high"];
const CATEGORIES = ["billing", "technical", "account", "delivery", "other"];

const STATUS_VARIANT = {
  open: "warn",
  in_progress: "info",
  resolved: "ok",
  closed: "muted",
};

const PRIORITY_VARIANT = { low: "muted", medium: "info", high: "danger" };

function FilterRow({ label, options, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange("")}
        className={cn(
          "rounded-full px-3 py-1 text-xs font-medium transition",
          value === "" ? "bg-brand-gradient text-white" : "border border-brand-cream bg-white text-[#5a403e]",
        )}
      >
        All
      </button>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium capitalize transition",
            value === o ? "bg-brand-gradient text-white" : "border border-brand-cream bg-white text-[#5a403e]",
          )}
        >
          {o.replace("_", " ")}
        </button>
      ))}
    </div>
  );
}

function TicketDetail({ ticketId, onClose }) {
  const { data: ticket, isLoading } = useTicket(ticketId);
  const updateTicket = useUpdateTicket();
  const addMessage   = useAddTicketMessage();
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  if (isLoading || !ticket) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading ticket…</CardContent>
      </Card>
    );
  }

  async function send(event) {
    event.preventDefault();
    if (!reply.trim()) return;
    setError("");
    try {
      await addMessage.mutateAsync({ id: ticket._id, text: reply.trim() });
      setReply("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function patch(body) {
    setError("");
    try {
      await updateTicket.mutateAsync({ id: ticket._id, body });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <h2 className="text-base font-bold">{ticket.subject ?? `Ticket ${ticket._id}`}</h2>
          <p className="text-xs capitalize text-muted-foreground">
            {ticket.category ?? "other"} · opened{" "}
            {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString("en-IN") : "—"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>Close</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-brand-maroon">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm">
            Status
            <select
              value={ticket.status}
              onChange={(e) => patch({ status: e.target.value })}
              className="h-9 rounded-lg border border-input bg-white px-2 text-sm capitalize"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace("_", " ")}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            Priority
            <select
              value={ticket.priority ?? "medium"}
              onChange={(e) => patch({ priority: e.target.value })}
              className="h-9 rounded-lg border border-input bg-white px-2 text-sm capitalize"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border border-brand-cream/60 bg-[#FCFAF7] p-4">
          {(ticket.messages ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages on this ticket yet.</p>
          ) : (
            ticket.messages.map((m, i) => (
              <div
                key={m._id ?? i}
                className={cn(
                  "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                  m.senderType === "admin"
                    ? "ml-auto bg-brand-gradient text-white"
                    : "bg-white border border-brand-cream/70",
                )}
              >
                <p>{m.text}</p>
                <p className={cn(
                  "mt-1 text-[10px]",
                  m.senderType === "admin" ? "text-white/70" : "text-muted-foreground",
                )}>
                  {m.senderType} · {m.sentAt ? new Date(m.sentAt).toLocaleString("en-IN") : ""}
                </p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={send} className="space-y-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply to the requester…"
            rows={3}
          />
          <Button
            type="submit"
            disabled={addMessage.isPending || !reply.trim()}
            className="gap-2 bg-brand-gradient text-white hover:brightness-105"
          >
            <Send className="h-4 w-4" /> {addMessage.isPending ? "Sending…" : "Send reply"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SupportTickets() {
  const [status, setStatus]     = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage]         = useState(1);
  const [openId, setOpenId]     = useState(null);

  const params = {
    page,
    limit: 20,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(category ? { category } : {}),
  };

  const { data, isLoading, isError, error } = useTickets(params);
  const tickets = data?.tickets ?? [];

  return (
    <AdminLayout title="Support Tickets" subtitle="Triage, assign, and respond to platform support requests.">
      {isError ? <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p> : null}

      <div className="space-y-2">
        <FilterRow label="Status"   options={STATUSES}   value={status}   onChange={(v) => { setStatus(v); setPage(1); }} />
        <FilterRow label="Priority" options={PRIORITIES} value={priority} onChange={(v) => { setPriority(v); setPage(1); }} />
        <FilterRow label="Category" options={CATEGORIES} value={category} onChange={(v) => { setCategory(v); setPage(1); }} />
      </div>

      {openId ? <TicketDetail ticketId={openId} onClose={() => setOpenId(null)} /> : null}

      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">
            {data ? `${formatNumber(data.total)} tickets` : "Tickets"}
          </h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {tickets.map((t) => (
            <button
              key={t._id}
              type="button"
              onClick={() => setOpenId(t._id)}
              className={cn(
                "flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition",
                openId === t._id
                  ? "border-brand-orange/50 bg-brand-orange/5"
                  : "border-brand-cream/70 bg-white hover:bg-brand-cream/10",
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{t.subject ?? `Ticket ${t._id}`}</p>
                <p className="text-xs capitalize text-muted-foreground">
                  {t.category ?? "other"}
                  {t.assignedTo?.name ? ` · assigned to ${t.assignedTo.name}` : " · unassigned"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={PRIORITY_VARIANT[t.priority] ?? "muted"} className="capitalize">
                  {t.priority ?? "—"}
                </Badge>
                <Badge variant={STATUS_VARIANT[t.status] ?? "muted"} className="capitalize">
                  {(t.status ?? "").replace("_", " ")}
                </Badge>
              </div>
            </button>
          ))}
          {tickets.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {isLoading ? "Loading…" : "No tickets match these filters."}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {data && data.pages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {data.page} of {data.pages}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </AdminLayout>
  );
}
