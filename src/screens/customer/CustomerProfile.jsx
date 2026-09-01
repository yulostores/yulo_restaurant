// Customer account — GET/PATCH /api/users/me, address book
// (POST/DELETE /api/users/me/addresses) and order history (GET /api/orders).

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, MapPin, Plus, Trash2, UserRound } from "lucide-react";

import {
  useAddAddress,
  useCustomerOrders,
  useRemoveAddress,
  useUpdateProfile,
  useUserProfile,
} from "@/hooks/customer/useCustomerOrders";
import CustomerLayout, { formatPrice } from "./CustomerLayout";
import { useCustomer } from "./CustomerApp";

const EMPTY_ADDRESS = { label: "", street: "", city: "", state: "", pincode: "" };

const inputClass =
  "w-full rounded-xl border border-brand-cream bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-orange";

export default function CustomerProfile() {
  const navigate = useNavigate();
  const { auth } = useCustomer();

  const { data: profile, isLoading } = useUserProfile();
  const { data: orders = [], isLoading: ordersLoading } = useCustomerOrders({ limit: 10 });
  const updateProfile = useUpdateProfile();
  const addAddress    = useAddAddress();
  const removeAddress = useRemoveAddress();

  const [name, setName]   = useState("");
  const [phone, setPhone] = useState("");
  const [showAddress, setShowAddress] = useState(false);
  const [address, setAddress] = useState(EMPTY_ADDRESS);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Seed the editable fields once the profile lands.
  useEffect(() => {
    if (!profile) return;
    setName(profile.name ?? "");
    setPhone(profile.phone ?? "");
  }, [profile]);

  async function saveProfile(event) {
    event.preventDefault();
    setError("");
    setSaved(false);
    try {
      await updateProfile.mutateAsync({ name, phone });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitAddress(event) {
    event.preventDefault();
    setError("");
    try {
      await addAddress.mutateAsync(address);
      setAddress(EMPTY_ADDRESS);
      setShowAddress(false);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteAddress(addrId) {
    setError("");
    try {
      await removeAddress.mutateAsync(addrId);
    } catch (err) {
      setError(err.message);
    }
  }

  async function signOut() {
    await auth.logout();
    navigate("/order", { replace: true });
  }

  if (isLoading) {
    return (
      <CustomerLayout title="Account" showNav activeNav="Account">
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</p>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout title="Account" showNav activeNav="Account">
      <div className="space-y-4 px-4 py-4">
        {error ? (
          <p className="rounded-lg bg-[#FCE9E4] px-3 py-2 text-sm text-brand-maroon">{error}</p>
        ) : null}

        {/* Identity */}
        <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-brand-gradient text-white">
              <UserRound className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold">{profile?.name ?? "Guest"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {profile?.email ?? profile?.phone ?? ""}
              </p>
            </div>
          </div>

          <form onSubmit={saveProfile} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            </div>
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="w-full rounded-xl bg-brand-gradient py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {updateProfile.isPending ? "Saving…" : saved ? "Saved" : "Save changes"}
            </button>
          </form>
        </section>

        {/* Addresses */}
        <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">Saved addresses</p>
            <button
              type="button"
              onClick={() => setShowAddress((v) => !v)}
              className="flex items-center gap-1 text-xs font-bold text-brand-orange"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>

          {showAddress ? (
            <form onSubmit={submitAddress} className="mb-3 space-y-2 rounded-xl bg-[#FCFAF7] p-3">
              <input
                value={address.label}
                onChange={(e) => setAddress((a) => ({ ...a, label: e.target.value }))}
                placeholder="Label (Home, Office…)"
                className={inputClass}
              />
              <input
                value={address.street}
                onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
                placeholder="Street"
                className={inputClass}
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={address.city}
                  onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                  placeholder="City"
                  className={inputClass}
                  required
                />
                <input
                  value={address.state}
                  onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))}
                  placeholder="State"
                  className={inputClass}
                />
              </div>
              <input
                value={address.pincode}
                onChange={(e) => setAddress((a) => ({ ...a, pincode: e.target.value }))}
                placeholder="Pincode"
                className={inputClass}
                required
              />
              <button
                type="submit"
                disabled={addAddress.isPending}
                className="w-full rounded-xl bg-brand-orange py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {addAddress.isPending ? "Adding…" : "Add address"}
              </button>
            </form>
          ) : null}

          {(profile?.savedAddresses ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
          ) : (
            <div className="space-y-2">
              {profile.savedAddresses.map((a) => (
                <div
                  key={a._id}
                  className="flex items-start gap-2.5 rounded-xl border border-brand-cream/60 p-3"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                  <div className="min-w-0 flex-1 text-sm">
                    {a.label ? <p className="font-semibold capitalize">{a.label}</p> : null}
                    <p className="text-muted-foreground">
                      {[a.street, a.city, a.state, a.pincode].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteAddress(a._id)}
                    className="shrink-0 text-brand-maroon"
                    aria-label="Remove address"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Order history */}
        <section className="rounded-2xl border border-brand-cream/70 bg-white p-4">
          <p className="mb-3 text-sm font-bold">Recent orders</p>
          {ordersLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven&apos;t ordered yet.</p>
          ) : (
            orders.map((o) => (
              <button
                key={o._id}
                type="button"
                onClick={() => navigate(`/order/status/${o._id}`)}
                className="flex w-full items-center justify-between border-b border-[#F6EFE9] py-2.5 text-left last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    #{String(o._id).slice(-6).toUpperCase()}
                  </p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {(o.status ?? "").replace(/_/g, " ")}
                    {o.createdAt
                      ? ` · ${new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                      : ""}
                  </p>
                </div>
                <span className="shrink-0 font-bold text-brand-red">
                  {formatPrice(o.subtotal)}
                </span>
              </button>
            ))
          )}
        </section>

        <button
          type="button"
          onClick={signOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-cream bg-white py-3 text-sm font-bold text-brand-maroon"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </CustomerLayout>
  );
}
