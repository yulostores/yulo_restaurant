// Owner account (/profile) — GET/PATCH /api/users/me, which serves both
// customers and restaurant owners.
//
// The documented PATCH body carries `name` and `phone` only: there is no
// password-change endpoint and no notification-preferences resource, so those
// panels state the gap rather than pretending to save. See API-GAPS.md.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { userApi } from "@/api/user.api";
import DashboardLayout from "@/components/DashboardLayout";
import FeatureUnavailable from "@/components/FeatureUnavailable";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function initials(name = "") {
  if (!name) return "—";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function Profile() {
  const { user } = useOwnerAuth();
  const qc = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["user-profile"],
    queryFn: () => userApi.getMe().then((r) => r.data.data.user),
    staleTime: 5 * 60_000,
  });

  const [form, setForm] = useState({ name: "", phone: "" });
  const [statusMsg, setStatusMsg] = useState("");

  // Seed the editable fields from the server record.
  useEffect(() => {
    if (!profile) return;
    setForm({ name: profile.name ?? "", phone: profile.phone ?? "" });
  }, [profile]);

  const updateMutation = useMutation({
    mutationFn: (body) => userApi.updateMe(body),
    onSuccess: ({ data }) => {
      qc.setQueryData(["user-profile"], data.data.user);
      setStatusMsg("Profile saved");
    },
    onError: (err) => setStatusMsg(err.message ?? "Save failed"),
  });

  function handleSave(e) {
    e.preventDefault();
    setStatusMsg("");
    updateMutation.mutate({ name: form.name, phone: form.phone });
  }

  const account = profile ?? user;

  if (isLoading && !profile) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Loading profile…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Profile</h1>
            <p className="text-sm text-muted-foreground">
              Manage your account details.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {statusMsg ? (
              <span
                className={
                  statusMsg === "Profile saved"
                    ? "text-sm text-brand-green"
                    : "text-sm text-brand-maroon"
                }
              >
                {statusMsg}
              </span>
            ) : null}
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="bg-brand-gradient text-white hover:brightness-105"
            >
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Identity card */}
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-brand-gradient text-lg font-semibold text-white">
                {initials(form.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-lg font-bold">{form.name || "—"}</h2>
              <p className="text-sm capitalize text-muted-foreground">
                {(account?.role ?? "").replace("_", " ") || "—"}
                {account?.createdAt
                  ? ` · joined ${new Date(account.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`
                  : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Account details */}
        <Card>
          <CardHeader className="pb-4">
            <h2 className="text-base font-bold">Account Details</h2>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              {/* The profile endpoint doesn't accept an email change. */}
              <Input value={account?.email ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Input value={(account?.role ?? "").replace("_", " ")} disabled className="capitalize" />
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Password + notifications have no endpoints in the current API. */}
      <FeatureUnavailable
        title="Password and notification settings aren't available yet"
        note="Changing your password or choosing which alerts you receive both need endpoints the API doesn't expose."
        needs={[
          "PATCH /api/users/me/password       { currentPassword, newPassword }",
          "GET   /api/users/me/notifications",
          "PATCH /api/users/me/notifications  { newOrders, cancellations, … }",
        ]}
      />
    </DashboardLayout>
  );
}
