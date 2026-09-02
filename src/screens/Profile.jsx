// Owner account (/profile) — GET/PATCH /api/users/me, which serves both
// customers and restaurant owners.
//
// Scope is deliberately the *person*, not the business: name, phone and avatar.
// The restaurant's own name and logo are shown read-only here with a link to
// /store-settings, so it stays obvious which screen owns which record and two
// forms never write the same fields.
//
// The PATCH body carries `name`, `phone` and an optional `avatar` file, so email
// and role are shown read-only. Password change has no endpoint yet and
// notification preferences live on a separate resource; neither is surfaced here.
// Tracked in API-GAPS.md rather than described on screen — owners shouldn't read
// API specs.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Store } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { approvalBadge } from "@/lib/approval";
import { useSettings } from "@/hooks/owner/useSettings";
import { userApi, buildProfileFormData } from "@/api/user.api";
import DashboardLayout from "@/components/DashboardLayout";
import ApprovalNotice from "@/components/ApprovalNotice";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PROFILE_KEY = ["user-profile"];

// Mirrors middleware/upload.js on the server, so an oversized or wrong-typed
// pick fails instantly here instead of costing a round trip.
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

// The server validates `name` with zod `.min(2)`; check it here so a too-short name
// is a message under the field rather than a 400 with a flattened zod error.
const MIN_NAME_LENGTH = 2;

function initials(name = "") {
  if (!name) return "—";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function Profile() {
  const { user, restaurant: cachedRestaurant, restaurantId, updateUser } = useOwnerAuth();
  const qc = useQueryClient();

  // The context copy is restored from localStorage and only refreshed at login, so a logo
  // changed in Store Settings would show stale here. useSettings shares its react-query
  // cache with that screen, which invalidates on save — the context copy is just the
  // instant first paint while the fetch is in flight.
  const { data: freshRestaurant } = useSettings(restaurantId);
  const restaurant = freshRestaurant ?? cachedRestaurant;

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => userApi.getMe().then((r) => r.data.data.user),
    staleTime: 5 * 60_000,
  });

  const [form, setForm] = useState({ name: "", phone: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  // { tone: "ok" | "error", text } — a tone rather than matching on the copy, so the
  // styling can't silently break when a message is reworded.
  const [status, setStatus] = useState(null);

  // Seed the editable fields from the server record.
  useEffect(() => {
    if (!profile) return;
    setForm({ name: profile.name ?? "", phone: profile.phone ?? "" });
  }, [profile]);

  // Object URLs are held in state rather than created inline in render: this form
  // re-renders on every keystroke, and a fresh URL per render would leak one blob
  // each time. Revoked when the pick changes or the screen unmounts.
  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(null);
      return;
    }
    const url = URL.createObjectURL(avatarFile);
    setAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const nameError =
    form.name.trim().length >= MIN_NAME_LENGTH ? "" : "Name must be at least 2 characters";

  const dirty = useMemo(() => {
    if (avatarFile) return true;
    if (!profile) return false;
    return form.name !== (profile.name ?? "") || form.phone !== (profile.phone ?? "");
  }, [avatarFile, form, profile]);

  const updateMutation = useMutation({
    mutationFn: (body) =>
      // Multipart only when there is actually a file to carry. The server drops
      // empty strings from a multipart body (they'd otherwise trip the `name`
      // minimum), which also means a cleared field can never be saved that way —
      // JSON keeps "remove my phone number" working.
      body instanceof FormData ? userApi.updateMeMultipart(body) : userApi.updateMe(body),
    onSuccess: ({ data }) => {
      const saved = data.data.user;
      qc.setQueryData(PROFILE_KEY, saved);
      // Keep the top bar's cached name/photo in step; it is otherwise only refreshed
      // at login.
      updateUser({
        name: saved.name,
        phone: saved.phone,
        profilePicture: saved.profilePicture,
      });
      setAvatarFile(null); // the server URL takes over from the local preview
      setStatus({ tone: "ok", text: "Profile saved" });
    },
    onError: (err) => setStatus({ tone: "error", text: err.message ?? "Save failed" }),
  });

  function handleAvatarPick(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after a rejection
    if (!file) return;

    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setAvatarFile(null);
      setStatus({ tone: "error", text: "Photo must be a JPEG, PNG or WebP" });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarFile(null);
      setStatus({ tone: "error", text: "Photo must be under 2 MB" });
      return;
    }
    setStatus(null);
    setAvatarFile(file);
  }

  function handleSave(e) {
    e.preventDefault();
    if (nameError) {
      setStatus({ tone: "error", text: nameError });
      return;
    }
    setStatus(null);
    const patch = { name: form.name.trim(), phone: form.phone.trim() };
    updateMutation.mutate(
      avatarFile ? buildProfileFormData({ ...patch, avatar: avatarFile }) : patch,
    );
  }

  const account = profile ?? user;
  const avatarSrc = avatarPreview ?? profile?.profilePicture ?? undefined;

  if (isLoading) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Loading profile…</p>
      </DashboardLayout>
    );
  }
  if (isError && !profile) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Failed to load your profile.</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Locked states explain themselves here; an approved one confirms itself. */}
      <ApprovalNotice className="mb-5" />
      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Profile</h1>
            <p className="text-sm text-muted-foreground">
              Manage your account details.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {status ? (
              <span
                className={
                  status.tone === "ok"
                    ? "text-sm text-brand-green"
                    : "text-sm text-brand-maroon"
                }
              >
                {status.text}
              </span>
            ) : null}
            <Button
              type="submit"
              disabled={!dirty || !!nameError || updateMutation.isPending}
              className="bg-brand-gradient text-white hover:brightness-105"
            >
              {updateMutation.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Identity card — the avatar is the whole clickable target */}
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <label className="group relative cursor-pointer" title="Change photo">
              <Avatar className="h-16 w-16">
                {avatarSrc ? <AvatarImage src={avatarSrc} alt={form.name || "Profile photo"} /> : null}
                <AvatarFallback className="bg-brand-gradient text-lg font-semibold text-white">
                  {initials(form.name)}
                </AvatarFallback>
              </Avatar>
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <ImageUp className="h-5 w-5 text-white" />
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarPick}
              />
            </label>
            <div>
              <h2 className="text-lg font-bold">{form.name || "—"}</h2>
              <p className="text-sm capitalize text-muted-foreground">
                {(account?.role ?? "").replace("_", " ") || "—"}
                {account?.createdAt
                  ? ` · joined ${new Date(account.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`
                  : ""}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {avatarFile
                  ? `${avatarFile.name} — uploads on save`
                  : "JPEG, PNG or WebP · max 2 MB"}
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
              <Label htmlFor="profile-name">Full Name</Label>
              <Input
                id="profile-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                aria-invalid={!!nameError}
              />
              {nameError ? (
                <p className="text-[11px] text-brand-maroon">{nameError}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">Email</Label>
              {/* The profile endpoint doesn't accept an email change. */}
              <Input id="profile-email" value={account?.email ?? ""} disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-role">Role</Label>
              <Input
                id="profile-role"
                value={(account?.role ?? "").replace("_", " ")}
                disabled
                className="capitalize"
              />
            </div>
          </CardContent>
        </Card>

        {/* Restaurant — read-only. Editing lives on /store-settings, which owns
            the Restaurant record and its brand assets. */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
            <h2 className="text-base font-bold">Restaurant</h2>
            <Button asChild variant="outline" size="sm" className="border-brand-orange/40 text-brand-orange">
              <Link to="/store-settings">Manage in Store Settings</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {restaurant ? (
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#E2DFDE] bg-[#FCFAF7]">
                  {restaurant.logo ? (
                    <img src={restaurant.logo} alt={`${restaurant.name} logo`} className="h-full w-full object-contain" />
                  ) : (
                    <Store className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-bold">{restaurant.name || "—"}</p>
                  {/* The approval state as a chip rather than grey lowercase body
                      text, which read as a category label, not a verdict. */}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge variant={approvalBadge(restaurant.approvalStatus).variant}>
                      {approvalBadge(restaurant.approvalStatus).label}
                    </Badge>
                    {restaurant.address?.city ? (
                      <span className="text-sm text-muted-foreground">
                        {restaurant.address.city}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No restaurant yet — set one up in Store Settings.
              </p>
            )}
          </CardContent>
        </Card>
      </form>
    </DashboardLayout>
  );
}
