// Store Management (/admin/stores) — GET /api/admin/stores plus the approval
// lifecycle transitions. Stores are created by owners applying through the
// owner portal; admins review, approve, suspend, reactivate, or reject them.
// There is no admin "create store" endpoint — onboarding starts owner-side.

import { useState } from "react";
import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAdminStores, useStoreAction } from "@/hooks/admin/useAdmin";
import AdminLayout, { formatNumber } from "./AdminLayout";
import StoreReviewPanel from "./StoreReviewPanel";

const STATUS_TABS = [
  { value: "",          label: "All" },
  { value: "pending",   label: "Pending" },
  { value: "active",    label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "expired",   label: "Expired" },
  { value: "rejected",  label: "Rejected" },
];

const PLANS = ["", "trial", "basic", "standard", "premium"];

const STATUS_VARIANT = {
  active: "ok",
  pending: "warn",
  suspended: "info",
  rejected: "danger",
  expired: "muted",
};

// The API has no "resubmit" endpoint: a rejected owner simply re-saves their
// store settings, which bumps `updatedAt` and nothing else. Comparing it against
// `reviewedAt` is the only signal an admin gets that a rejected application has
// been corrected and is worth a second look (approve accepts any status).
function editedSinceReview(store) {
  if (!store.reviewedAt || !store.updatedAt) return false;
  return new Date(store.updatedAt) > new Date(store.reviewedAt);
}

// Which transitions the server accepts from each approvalStatus (API.md).
// Approve/reject deliberately aren't here: an application is decided in the
// review drawer, where the admin can actually see what the owner submitted.
function actionsFor(status) {
  switch (status) {
    case "active":    return [{ action: "suspend", label: "Suspend" }];
    case "suspended": return [{ action: "reactivate", label: "Reactivate", primary: true }];
    default:          return [];
  }
}

export default function Stores() {
  const [status, setStatus] = useState("");
  const [plan, setPlan]     = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);
  const [actionError, setActionError] = useState("");
  // Store currently open in the review drawer.
  const [reviewingId, setReviewingId] = useState(null);

  const params = {
    page,
    limit: 20,
    ...(status ? { status } : {}),
    ...(plan ? { plan } : {}),
    ...(search ? { search } : {}),
  };

  const { data, isLoading, isError, error } = useAdminStores(params);
  const storeAction = useStoreAction();

  const stores = data?.stores ?? [];
  const counts = data?.statusCounts ?? {};
  const totalCount = Object.values(counts).reduce((a, b) => a + (Number(b) || 0), 0);

  async function run(action, store) {
    setActionError("");
    try {
      await storeAction.mutateAsync({ action, id: store._id });
    } catch (err) {
      setActionError(err.message);
    }
  }

  function changeFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  return (
    <AdminLayout
      title="Store Management"
      subtitle="Review applications, approve stores, and manage their lifecycle."
    >
      {isError ? <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p> : null}
      {actionError ? <p className="text-sm text-brand-maroon">{actionError}</p> : null}

      {/* Applications waiting on a decision. Until an admin approves one, that
          owner's portal is locked to Store Settings and Profile only. */}
      {Number(counts.pending) > 0 && status !== "pending" ? (
        <button
          type="button"
          onClick={() => changeFilter(setStatus, "pending")}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[#F5C99B] bg-[#FFF7ED] px-4 py-3 text-left transition hover:brightness-[0.99]"
        >
          <span className="text-sm">
            <span className="font-semibold">
              {formatNumber(counts.pending)} restaurant
              {Number(counts.pending) === 1 ? "" : "s"} awaiting approval
            </span>
            {" — their owners can't add staff, menu items or QR codes until you decide."}
          </span>
          <span className="shrink-0 text-sm font-semibold text-[#D9480F]">Review →</span>
        </button>
      ) : null}

      {/* Status tabs with live counts */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value || "all"}
            type="button"
            onClick={() => changeFilter(setStatus, tab.value)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
              status === tab.value
                ? "bg-brand-gradient text-white"
                : "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
            )}
          >
            {tab.label}
            <span className="ml-1.5 opacity-70">
              {formatNumber(tab.value ? counts[tab.value] : totalCount)}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-4">
          <h2 className="text-base font-bold">
            {data ? `${formatNumber(data.total)} stores` : "Stores"}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={plan}
              onChange={(e) => changeFilter(setPlan, e.target.value)}
              className="h-10 rounded-lg border border-input bg-white px-3 text-sm capitalize"
            >
              {PLANS.map((p) => (
                <option key={p || "all"} value={p}>{p || "All plans"}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => changeFilter(setSearch, e.target.value)}
                placeholder="Search store name…"
                className="w-56 pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead className="pl-6">Store</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((s) => {
                  const actions = actionsFor(s.approvalStatus);
                  return (
                    <TableRow key={s._id}>
                      <TableCell className="pl-6">
                        <div className="font-semibold">{s.name}</div>
                        {s.approvalStatus === "rejected" && s.rejectionReason ? (
                          <div className="text-xs text-brand-maroon">{s.rejectionReason}</div>
                        ) : null}
                        {s.approvalStatus === "rejected" && editedSinceReview(s) ? (
                          <div className="text-xs font-semibold text-[#D9480F]">
                            Owner has updated their details since the rejection
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{s.ownerId?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{s.ownerId?.email ?? ""}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.address?.city ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.plan === "premium" ? "info" : "muted"} className="capitalize">
                          {s.plan ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={STATUS_VARIANT[s.approvalStatus] ?? "muted"}
                          className="capitalize"
                        >
                          {s.approvalStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant={s.approvalStatus === "pending" ? "default" : "outline"}
                            onClick={() => setReviewingId(s._id)}
                            className={
                              s.approvalStatus === "pending"
                                ? "bg-brand-gradient text-white hover:brightness-105"
                                : ""
                            }
                          >
                            {s.approvalStatus === "pending" ? "Review" : "Details"}
                          </Button>
                          {actions.map((a) => (
                            <Button
                              key={a.action}
                              size="sm"
                              variant={a.primary ? "default" : "outline"}
                              disabled={storeAction.isPending}
                              onClick={() => run(a.action, s)}
                              className={a.primary ? "bg-brand-gradient text-white hover:brightness-105" : ""}
                            >
                              {a.label}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {stores.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {isLoading ? "Loading…" : "No stores match these filters."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {reviewingId ? (
        <StoreReviewPanel storeId={reviewingId} onClose={() => setReviewingId(null)} />
      ) : null}

      {data && data.pages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} of {data.pages}
          </span>
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
