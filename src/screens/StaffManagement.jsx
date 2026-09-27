import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChefHat,
  Copy,
  Pencil,
  Phone,
  Smartphone,
  Trash2,
  UtensilsCrossed,
  UserPlus,
  X,
} from "lucide-react";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { useStaff, useCreateStaff, useRemoveStaff, useUpdateStaff } from "@/hooks/owner/useStaff";
import { errorMessage, isNotApprovedError } from "@/lib/errors";
import { formatPhone, isValidPhone, sanitizePhoneInput, toPhoneDigits } from "@/lib/phone";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// The two roles the API accepts for a staff member (API.md — Create Staff Member).
const ROLES = [
  { value: "waiter", label: "Waiter", hint: "Tables & orders" },
  { value: "chef",   label: "Chef",   hint: "Kitchen display" },
];

const EMPTY_FORM = { name: "", role: "waiter", phone: "", email: "" };

// Staff sign in at /staff/login with this phone number and a one-time code sent to it
// (API.md — Staff Authentication). There is no PIN to hand over any more.
const PHONE_HINT = "They sign in with this number — a one-time code is texted to it.";

function phoneError(err) {
  if (err?.code === "PHONE_TAKEN") return "Another active staff member here already uses this number.";
  return null;
}

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
  // The member just added — shown once so the owner can tell them how to sign in.
  const [issued, setIssued] = useState(null);

  const canManage = isApproved && !!restaurantId;

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setFormError("");
    const phone = toPhoneDigits(form.phone);
    if (!isValidPhone(phone)) {
      setFormError("Enter the staff member's 10-digit mobile number — it's how they sign in.");
      return;
    }
    try {
      const { data } = await createMutation.mutateAsync({
        name:  form.name.trim(),
        role:  form.role,
        phone,
        email: form.email.trim() || undefined,
      });
      setIssued(data.data.staff);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(phoneError(err) ?? errorMessage(err, "Couldn't add this staff member. Please try again."));
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
      setActionError(
        err?.code === "PHONE_TAKEN"
          ? `${member.name}'s number now belongs to another active staff member. Give ${member.name} a new number (Edit) to reactivate them.`
          : errorMessage(err, "Couldn't update this staff member. Please try again."),
      );
    }
  }

  // Resolves on success, throws a user-facing message otherwise (the card shows it).
  async function handleSavePhone(member, phone) {
    try {
      await updateMutation.mutateAsync({ staffId: member._id, phone });
    } catch (err) {
      throw new Error(phoneError(err) ?? errorMessage(err, "Couldn't save this number. Please try again."));
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
        <h1 className="max-w-none text-2xl font-bold">Staff Management</h1>
        <p className="text-sm text-muted-foreground">
          Add chefs and waiters with their mobile number. They sign in at{" "}
          <a href="/staff/login" className="font-semibold text-primary hover:underline">
            /staff/login
          </a>{" "}
          with that number and a one-time code texted to it — no PIN or password to share.
          Each sign-in lasts 24 hours.
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
              <label htmlFor="staff-new-phone" className="text-sm font-medium">Mobile number *</label>
              <PhoneInput
                id="staff-new-phone"
                value={form.phone}
                onChange={(phone) => setForm((prev) => ({ ...prev, phone }))}
                disabled={!canManage}
              />
              <p className="text-[11px] text-muted-foreground">{PHONE_HINT}</p>
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

      {issued && <SignInHandover issued={issued} onDismiss={() => setIssued(null)} />}

      {staff.some((m) => m.isActive && !m.phone) && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Staff now sign in with their phone number instead of a PIN. Members marked{" "}
            <strong>No phone</strong> below can&apos;t sign in until you add their number.
          </p>
        </div>
      )}

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
            onSavePhone={handleSavePhone}
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
            onSavePhone={handleSavePhone}
            updatePending={updateMutation.isPending}
            removePending={removeMutation.isPending}
          />
        </>
      )}
    </DashboardLayout>
  );
}

function StaffSection({ icon, title, members, emptyText, onToggle, onRemove, onSavePhone, updatePending, removePending }) {
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
              onSavePhone={onSavePhone}
              updatePending={updatePending}
              removePending={removePending}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// "+91" prefix + the number as typed. The text is kept exactly as entered (no
// auto-formatting, which would fight the caret) and the 10 digits are read from it with
// toPhoneDigits when it's saved.
function PhoneInput({ id, value, onChange, disabled, autoFocus }) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-border focus-within:border-primary">
      <span className="flex items-center border-r border-border bg-muted px-2.5 text-sm text-muted-foreground">+91</span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(sanitizePhoneInput(e.target.value))}
        placeholder="9876543210"
        required
        disabled={disabled}
        className="min-w-0 flex-1 px-3 py-2 text-sm tracking-wider outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}

function StaffCard({ member, onToggle, onRemove, onSavePhone, updatePending, removePending }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  function startEdit() {
    setDraft(member.phone ?? "");
    setEditError("");
    setEditing(true);
  }

  async function save(e) {
    e.preventDefault();
    const phone = toPhoneDigits(draft);
    if (!isValidPhone(phone)) {
      setEditError("Enter a 10-digit mobile number.");
      return;
    }
    if (phone === member.phone) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      await onSavePhone(member, phone);
      setEditing(false);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate font-semibold">{member.name}</p>
          {member.email && (
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          )}
          {!editing &&
            (member.phone ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="tracking-wide">+91 {formatPhone(member.phone)}</span>
                <button
                  type="button"
                  onClick={startEdit}
                  title="Change phone number"
                  aria-label={`Change ${member.name}'s phone number`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </p>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
              >
                <AlertTriangle className="h-3 w-3" /> No phone — add one so they can sign in
              </button>
            ))}
          {/* Short display id (W01, C02) — handy for rosters; not a login credential any more. */}
          {member.staffCode && <CopyableCode value={member.staffCode} />}
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
            aria-label={`Remove ${member.name}`}
            className="flex items-center justify-center rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      {editing && (
        <form onSubmit={save} className="mt-3 space-y-2 border-t border-border pt-3">
          <label htmlFor={`staff-phone-${member._id}`} className="text-xs font-medium">
            Mobile number
          </label>
          <PhoneInput
            id={`staff-phone-${member._id}`}
            value={draft}
            onChange={setDraft}
            disabled={saving}
            autoFocus
          />
          {member.phone && (
            <p className="text-[11px] text-muted-foreground">
              Saving a new number signs {member.name} out on every device straight away.
            </p>
          )}
          {editError && <p className="text-xs text-red-600">{editError}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="rounded-lg border border-border px-3 py-1 text-xs hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// Clipboard writes need a secure context and can be blocked outright; the code is
// still selectable text either way, so a failure just leaves the button idle.
function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* no clipboard permission — the owner can select the text manually */
    }
  };
  return { copied, copy };
}

function CopyableCode({ value }) {
  const { copied, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      title="Copy staff code"
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 font-mono text-xs font-semibold tracking-widest transition hover:bg-brand-cream2"
    >
      {value}
      {copied ? (
        <Check className="h-3 w-3 text-brand-green" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
}

// Shown once, straight after a staff member is created: how they sign in. Nothing on
// it is secret — the phone itself is the credential.
function SignInHandover({ issued, onDismiss }) {
  const { copied, copy } = useCopy();
  const loginUrl = `${window.location.origin}/staff/login`;
  const message =
    `Hi ${issued.name}, you've been added as ${issued.role === "chef" ? "a chef" : "a waiter"}. ` +
    `Sign in at ${loginUrl} with your number ${formatPhone(issued.phone)} — we'll text you a code.`;

  return (
    <div className="rounded-2xl border border-brand-green/30 bg-[#F1F8F2] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-green/15">
            <Smartphone className="h-4 w-4 text-brand-green" />
          </span>
          <div>
            <p className="text-sm font-bold text-[#1B5E20]">
              {issued.name} can now sign in
            </p>
            <p className="mt-0.5 text-xs text-[#3f6b42]">
              At /staff/login with +91 {formatPhone(issued.phone)} — a one-time code is texted
              to that number. Nothing else to hand over.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-[#3f6b42] transition hover:bg-brand-green/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => copy(message)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-brand-green/30 px-3 py-2 text-xs font-semibold text-[#1B5E20] transition hover:bg-brand-green/10"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy sign-in instructions"}
        </button>
      </div>
    </div>
  );
}
