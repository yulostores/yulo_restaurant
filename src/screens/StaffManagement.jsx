import { useState } from "react";
import { ChefHat, Trash2, UtensilsCrossed, UserPlus } from "lucide-react";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { useStaff, useCreateStaff, useRemoveStaff, useUpdateStaff } from "@/hooks/owner/useStaff";
import { errorMessage, isNotApprovedError } from "@/lib/errors";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// The two roles the API accepts for a staff member (API.md — Create Staff Member).
const ROLES = [
  { value: "waiter", label: "Waiter", hint: "Tables & orders" },
  { value: "chef",   label: "Chef",   hint: "Kitchen display" },
];

const PIN_MIN = 4;
const PIN_MAX = 8;

const EMPTY_FORM = { name: "", role: "waiter", pin: "", email: "" };

// What the owner sees while the restaurant isn't `active` yet — the staff routes
// stay locked until then, so say it in their terms instead of showing a 403.
const STATUS_NOTICE = {
  pending:   "Your restaurant is still under review. You can add chefs and waiters as soon as it's approved.",
  rejected:  "Your restaurant wasn't approved, so staff accounts can't be created yet. Update your store details and resubmit for review.",
  suspended: "This restaurant is suspended. Staff accounts are locked until it's reactivated.",
  expired:   "This restaurant's listing has expired. Renew it to manage staff again.",
};

function RoleBadge({ role }) {
  return (
    <Badge variant={role === "chef" ? "warn" : "info"}>
      {role === "chef" ? "Chef" : "Waiter"}
    </Badge>
  );
}

export default function StaffManagement() {
  const { restaurantId, approvalStatus, isApproved } = useOwnerAuth();

  // Don't even fire the request before approval — it would only 403.
  const { data: staff = [], isLoading, isError, error } = useStaff(restaurantId, {
    enabled: isApproved,
  });
  const createMutation = useCreateStaff(restaurantId);
  const removeMutation = useRemoveStaff(restaurantId);
  const updateMutation = useUpdateStaff(restaurantId);

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");

  const canManage = isApproved && !!restaurantId;

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setFormError("");
    if (form.pin.length < PIN_MIN) {
      setFormError(`PIN must be at least ${PIN_MIN} digits`);
      return;
    }
    try {
      await createMutation.mutateAsync({
        name:  form.name.trim(),
        role:  form.role,
        pin:   form.pin,
        email: form.email.trim() || undefined,
      });
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(errorMessage(err, "Couldn't add this staff member. Please try again."));
    }
  }

  async function handleToggleActive(member) {
    setActionError("");
    try {
      await updateMutation.mutateAsync({
        staffId:  member._id,
        isActive: !member.isActive,
      });
    } catch (err) {
      setActionError(errorMessage(err, "Couldn't update this staff member. Please try again."));
    }
  }

  async function handleRemove(staffId) {
    if (!window.confirm("Deactivate this staff member? They will no longer be able to sign in.")) return;
    setActionError("");
    try {
      await removeMutation.mutateAsync(staffId);
    } catch (err) {
      setActionError(errorMessage(err, "Couldn't remove this staff member. Please try again."));
    }
  }

  const chefs   = staff.filter((s) => s.role === "chef");
  const waiters = staff.filter((s) => s.role === "waiter");

  // The lock notice already explains a 403 — don't repeat it as a red banner.
  const listError = isError && !isNotApprovedError(error)
    ? errorMessage(error, "Couldn't load your staff list. Please refresh and try again.")
    : "";

  const statusNotice = !isApproved
    ? (STATUS_NOTICE[approvalStatus] ?? STATUS_NOTICE.pending)
    : "";

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold">Staff Management</h1>
        <p className="text-sm text-muted-foreground">
          Add chefs and waiters. They sign in with their own PIN — no email or password needed.
        </p>
      </div>

      {!restaurantId ? (
        <div className="rounded-2xl border border-brand-cream bg-[#FFF3E0] px-4 py-3 text-sm text-[#8a4b16]">
          Set up your restaurant in Store Settings first — staff are added per restaurant.
        </div>
      ) : statusNotice ? (
        <div className="rounded-2xl border border-brand-cream bg-[#FFF3E0] px-4 py-3 text-sm text-[#8a4b16]">
          {statusNotice}
        </div>
      ) : null}

      {listError ? (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{listError}</p>
      ) : null}

      {/* Add Staff Form */}
      <Card>
        <CardHeader className="pb-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <UserPlus className="h-4 w-4" /> New Staff Member
          </h2>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleAdd}
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 ${canManage ? "" : "opacity-60"}`}
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Name *</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Full name"
                required
                disabled={!canManage}
                className="rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:cursor-not-allowed"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Role *</label>
              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                disabled={!canManage}
                className="rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:cursor-not-allowed"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.hint}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">PIN * ({PIN_MIN}–{PIN_MAX} digits)</label>
              <input
                name="pin"
                type="password"
                value={form.pin}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    pin: e.target.value.replace(/\D/g, "").slice(0, PIN_MAX),
                  }))
                }
                placeholder="••••"
                inputMode="numeric"
                autoComplete="new-password"
                minLength={PIN_MIN}
                required
                disabled={!canManage}
                className="rounded-xl border border-border px-3 py-2 text-sm tracking-widest outline-none focus:border-primary disabled:cursor-not-allowed"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Email (optional)</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="For your records only"
                disabled={!canManage}
                className="rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-primary disabled:cursor-not-allowed"
              />
            </div>

            {formError && (
              <p className="col-span-full rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
                {formError}
              </p>
            )}

            <div className="col-span-full">
              <Button type="submit" disabled={!canManage || createMutation.isPending}>
                {createMutation.isPending ? "Adding…" : "Add staff member"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {actionError ? (
        <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{actionError}</p>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : (
        <>
          <StaffSection
            icon={<ChefHat className="h-4 w-4" />}
            title="Chefs"
            members={chefs}
            emptyText={canManage ? "No chefs added yet." : "Chefs you add will appear here."}
            onToggle={handleToggleActive}
            onRemove={handleRemove}
            updatePending={updateMutation.isPending}
            removePending={removeMutation.isPending}
          />

          <StaffSection
            icon={<UtensilsCrossed className="h-4 w-4" />}
            title="Waiters"
            members={waiters}
            emptyText={canManage ? "No waiters added yet." : "Waiters you add will appear here."}
            onToggle={handleToggleActive}
            onRemove={handleRemove}
            updatePending={updateMutation.isPending}
            removePending={removeMutation.isPending}
          />
        </>
      )}
    </DashboardLayout>
  );
}

function StaffSection({ icon, title, members, emptyText, onToggle, onRemove, updatePending, removePending }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        {icon} {title} ({members.length})
      </h2>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((s) => (
            <StaffCard
              key={s._id}
              member={s}
              onToggle={onToggle}
              onRemove={onRemove}
              updatePending={updatePending}
              removePending={removePending}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StaffCard({ member, onToggle, onRemove, updatePending, removePending }) {
  return (
    <div className="flex items-start justify-between rounded-2xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-semibold">{member.name}</p>
        {member.email && (
          <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <RoleBadge role={member.role} />
          <Badge variant={member.isActive ? "ok" : "muted"}>
            {member.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      </div>
      <div className="ml-3 flex shrink-0 flex-col gap-2">
        <button
          onClick={() => onToggle(member)}
          disabled={updatePending}
          className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
        >
          {member.isActive ? "Deactivate" : "Activate"}
        </button>
        <button
          onClick={() => onRemove(member._id)}
          disabled={removePending}
          title="Remove staff member"
          className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
