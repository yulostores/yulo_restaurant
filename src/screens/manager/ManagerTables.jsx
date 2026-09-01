// Manager · Table Operations (/manager/tables) — GET/POST/PATCH/DELETE
// /api/owner/:rId/tables. Runs on the owner session (no manager role exists).
//
// Note: the tables API models `identifier`, `capacity`, `isActive` and the QR
// state. Floor status (available/occupied/cleaning) and waiter assignment are
// NOT part of the documented schema — see API-GAPS.md.

import { useState } from "react";
import { Plus, QrCode, Trash2 } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  useCreateTable,
  useDeleteTable,
  useGenerateQR,
  useTables,
  useUpdateTable,
} from "@/hooks/owner/useTables";

const EMPTY = { identifier: "", capacity: "" };

export default function ManagerTables() {
  const { restaurantId } = useOwnerAuth();

  const { data: tables = [], isLoading, isError, error } = useTables(restaurantId);
  const createTable = useCreateTable(restaurantId);
  const updateTable = useUpdateTable(restaurantId);
  const deleteTable = useDeleteTable(restaurantId);
  const generateQR  = useGenerateQR(restaurantId);

  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [actionError, setActionError] = useState("");

  async function add(event) {
    event.preventDefault();
    setActionError("");
    try {
      await createTable.mutateAsync({
        identifier: form.identifier.trim(),
        capacity: Number(form.capacity) || undefined,
      });
      setForm(EMPTY);
      setShowForm(false);
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function toggleActive(table) {
    setActionError("");
    try {
      await updateTable.mutateAsync({
        tableId: table._id,
        body: { isActive: !table.isActive },
      });
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function remove(table) {
    if (!window.confirm(`Delete table ${table.identifier}?`)) return;
    setActionError("");
    try {
      await deleteTable.mutateAsync(table._id);
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function makeQR(table) {
    setActionError("");
    try {
      await generateQR.mutateAsync(table._id);
    } catch (err) {
      setActionError(err.message);
    }
  }

  if (!restaurantId) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">No restaurant is linked to this account yet.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Table Operations</h1>
          <p className="text-sm text-muted-foreground">
            Manage the floor plan, table capacity, and QR codes.
          </p>
        </div>
        <Button
          onClick={() => setShowForm((v) => !v)}
          className="gap-2 bg-brand-gradient text-white hover:brightness-105"
        >
          <Plus className="h-4 w-4" /> Add Table
        </Button>
      </div>

      {isError ? <p className="text-sm text-brand-maroon">Failed to load: {error.message}</p> : null}
      {actionError ? <p className="text-sm text-brand-maroon">{actionError}</p> : null}

      {showForm ? (
        <Card>
          <CardHeader className="pb-3">
            <h2 className="text-base font-bold">Add Table</h2>
          </CardHeader>
          <CardContent>
            <form className="flex flex-wrap items-end gap-4" onSubmit={add}>
              <div className="space-y-1.5">
                <Label>Identifier</Label>
                <Input
                  value={form.identifier}
                  onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
                  placeholder="T1"
                  className="w-32"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Capacity</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
                  placeholder="4"
                  className="w-28"
                />
              </div>
              <Button
                type="submit"
                disabled={createTable.isPending}
                className="bg-brand-orange text-white hover:bg-brand-orange/90"
              >
                {createTable.isPending ? "Creating…" : "Create"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">{tables.length} tables</h2>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-brand-cream/60">
                  <TableHead className="pl-6">Table</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>QR</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((t) => (
                  <TableRow key={t._id}>
                    <TableCell className="pl-6 font-semibold">{t.identifier}</TableCell>
                    <TableCell className="text-muted-foreground">{t.capacity ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.qrCode?.status === "active" ? "ok" : "muted"}>
                        {t.qrCode?.status ?? "none"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={!!t.isActive}
                        disabled={updateTable.isPending}
                        onCheckedChange={() => toggleActive(t)}
                      />
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={generateQR.isPending}
                          onClick={() => makeQR(t)}
                        >
                          <QrCode className="h-3.5 w-3.5" /> QR
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deleteTable.isPending}
                          onClick={() => remove(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {tables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {isLoading ? "Loading…" : "No tables yet. Add one to get started."}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
