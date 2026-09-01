// Customers (/admin/customers) — GET /api/admin/customers.
// The endpoint returns customer accounts only; owners, admins and restaurant
// staff are not listed by any documented admin endpoint.

import { useState } from "react";
import { Search } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useAdminCustomers, useSetCustomerStatus } from "@/hooks/admin/useAdmin";
import AdminLayout, { formatNumber, initials } from "./AdminLayout";

const STATUSES = [
  { value: "",         label: "All" },
  { value: "active",   label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default function AdminCustomers() {
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

  const { data, isLoading, isError, error } = useAdminCustomers(params);
  const setStatusMutation = useSetCustomerStatus();

  const customers = data?.customers ?? [];

  async function toggle(customer) {
    setActionError("");
    try {
      await setStatusMutation.mutateAsync({ id: customer._id, isActive: !customer.isActive });
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <AdminLayout
      title="Customers"
      subtitle="Search platform customers and activate or deactivate their accounts."
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
        <div className="flex gap-1.5">
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
            {data ? `${formatNumber(data.total)} customers` : "Customers"}
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead className="pl-6">Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((u) => (
                  <TableRow key={u._id}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-brand-gradient text-[11px] font-semibold text-white">
                            {initials(u.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-semibold">{u.name ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{u.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? "ok" : "danger"}>
                        {u.isActive ? "active" : "inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <Switch
                        checked={!!u.isActive}
                        disabled={setStatusMutation.isPending}
                        onCheckedChange={() => toggle(u)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {isLoading ? "Loading…" : "No customers match these filters."}
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
