// Delivery Partners (/admin/delivery-partners) — GET/PATCH/DELETE
// /api/admin/delivery-partners. Onboarding (POST) is multipart/form-data with
// document uploads; this screen covers the roster, status changes and removal.

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
import {
  useDeliveryPartners,
  useRemoveDeliveryPartner,
  useUpdateDeliveryPartner,
} from "@/hooks/admin/useAdmin";
import AdminLayout, { formatNumber } from "./AdminLayout";

const STATUSES = [
  { value: "",          label: "All" },
  { value: "active",    label: "Active" },
  { value: "busy",      label: "Busy" },
  { value: "inactive",  label: "Inactive" },
  { value: "suspended", label: "Suspended" },
];

const STATUS_VARIANT = {
  active: "ok",
  busy: "warn",
  inactive: "muted",
  suspended: "danger",
};

export default function DeliveryPartners() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage]     = useState(1);
  const [actionError, setActionError] = useState("");

  const params = {
    page,
    limit: 20,
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
  };

  const { data, isLoading, isError, error } = useDeliveryPartners(params);
  const updatePartner = useUpdateDeliveryPartner();
  const removePartner = useRemoveDeliveryPartner();

  const partners = data?.partners ?? [];

  async function changeStatus(partner, nextStatus) {
    setActionError("");
    try {
      await updatePartner.mutateAsync({ id: partner._id, body: { status: nextStatus } });
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function remove(partner) {
    if (!window.confirm(`Permanently remove ${partner.fullName}? This cannot be undone.`)) return;
    setActionError("");
    try {
      await removePartner.mutateAsync(partner._id);
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <AdminLayout
      title="Delivery Partners"
      subtitle="Roster, availability status, and offboarding for platform riders."
    >
      {isError ? <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p> : null}
      {actionError ? <p className="text-sm text-brand-maroon">{actionError}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, email or phone…"
            className="w-72 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s.value || "all"}
              type="button"
              onClick={() => { setStatus(s.value); setPage(1); }}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                status === s.value
                  ? "bg-brand-gradient text-white"
                  : "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">
            {data ? `${formatNumber(data.total)} partners` : "Partners"}
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead className="pl-6">Partner</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Deliveries</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {partners.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="pl-6 font-semibold">{p.fullName ?? "—"}</TableCell>
                    <TableCell>
                      <div className="text-sm">{p.phone ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.email ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.vehicle?.vehicleNumber ?? p.vehicle?.vehicleModel ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatNumber(p.totalDeliveries)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status] ?? "muted"} className="capitalize">
                        {p.status ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-2">
                        <select
                          value={p.status ?? ""}
                          onChange={(e) => changeStatus(p, e.target.value)}
                          disabled={updatePartner.isPending}
                          className="h-9 rounded-lg border border-input bg-white px-2 text-sm capitalize"
                        >
                          {STATUSES.filter((s) => s.value).map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={removePartner.isPending}
                          onClick={() => remove(p)}
                        >
                          Remove
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {partners.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {isLoading ? "Loading…" : "No delivery partners match these filters."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
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
