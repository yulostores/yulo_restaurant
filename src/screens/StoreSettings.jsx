// Store Settings (/store-settings) — Figma node 151:602. Restaurant profile,
// brand assets, weekly opening hours, delivery logistics, and legal/licensing
// details with a sticky unsaved-changes action bar (PRD §13.1 OWN-01).
//
// Three endpoints back this screen, each with its own record on the Restaurant
// document, so a save fans out to all three:
//   PATCH /owner/:rId/settings           multipart — profile, brand images, compliance
//   PATCH /owner/:rId/settings/hours     { operatingHours: [{ day, isOpen, openTime, closeTime }] }
//   PATCH /owner/:rId/settings/delivery  { radiusKm, baseCharge, freeThreshold, estimatedMinutes }

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ImagePlus, ImageUp, Lock, X } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  buildSettingsFormData,
  useDeliverySettings,
  useHours,
  useSettings,
  useUpdateDelivery,
  useUpdateHours,
  useUpdateSettings,
} from "@/hooks/owner/useSettings";
import { ownerApi } from "@/api/owner.api";
import { catalogApi } from "@/api/catalog.api";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { hhmmToTime, timeToHhmm } from "@/lib/hours";
import { useObjectUrl } from "@/lib/useObjectUrl";

// Indian company classifications. This one genuinely is a fixed list — it comes from
// company law, not from our data — and the server stores it as a free-form string with
// no catalogue endpoint to read it from.
const LEGAL_ENTITY_TYPES = [
  "Sole proprietorship",
  "Partnership",
  "Private Limited",
  "Public Limited",
  "NGO",
  "AOP/BOI",
];

// The order the API's `day` enum uses (models/Restaurant.js), and the order the week is
// rendered in.
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const DEFAULT_OPEN_TIME = 900;   // 09:00
const DEFAULT_CLOSE_TIME = 2200; // 22:00

// Mirrors uploadFields(['logo','banner'], 5) in middleware/upload.js, so an oversized or
// wrong-typed pick fails here instead of costing an upload round trip.
const MAX_BRAND_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const EARLIEST_ESTABLISHED_YEAR = 1800; // Restaurant.establishedYear has `min: 1800`

// `Number(x) || fallback` would turn a deliberate 0 — free delivery, no minimum radius —
// back into the default, so test for a finite number instead of truthiness.
function toNumber(value, fallback) {
  if (value === "" || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// A Date column comes back from Mongo as an ISO string; <input type="date"> wants YYYY-MM-DD.
function toDateInput(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

function Field({ label, htmlFor, error, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs uppercase tracking-wide text-brand-red">
        {label}
      </Label>
      {children}
      {error ? <p className="text-[11px] text-brand-maroon">{error}</p> : null}
    </div>
  );
}

function LockedField({ label, value }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "flex h-9 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm",
          value ? "font-medium text-gray-600" : "text-gray-400",
        )}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function LockBadge() {
  return (
    <span className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
      <Lock className="h-2.5 w-2.5" />
      Locked
    </span>
  );
}

function LegalEntitySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const display = value || "Select type";

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <span className="font-medium uppercase tracking-wide">{display}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-brand-cream/70 bg-white shadow-lg">
          {LEGAL_ENTITY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="option"
              aria-selected={value === type}
              onClick={() => { onChange(type); setOpen(false); }}
              className={cn(
                "flex w-full items-center px-4 py-2.5 text-sm hover:bg-brand-cream/30",
                value === type && "font-semibold text-brand-orange",
              )}
            >
              {type}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// `cuisineTypes` is a free-form string array on the Restaurant document — that is what
// lets an owner describe a kitchen the platform hasn't seen before. A fixed dropdown could
// neither display a value outside its own list nor keep more than one, so it silently
// rewrote a three-cuisine restaurant down to whichever single entry it happened to show.
//
// GET /api/cuisines supplies the vocabulary other restaurants already use, so the field
// suggests rather than restricts: the datalist offers known cuisines with native filtering
// and keyboard handling, and anything typed is still accepted. Snapping a typed entry to
// the known spelling is what keeps the vocabulary from fragmenting — "north indian" is
// stored the way the rest of the platform spells it rather than becoming a second cuisine.
function CuisineEditor({ value, onChange }) {
  const [draft, setDraft] = useState("");

  // Suggestions are a nicety, not a dependency: a failed or empty fetch just means an
  // ordinary free-text field, so there is no error state to render here.
  const { data: known = [] } = useQuery({
    queryKey: ["cuisines"],
    queryFn: () => catalogApi.listCuisines().then((r) => r.data.data.cuisines ?? []),
    staleTime: 60 * 60_000,
  });

  function add() {
    const typed = draft.trim();
    setDraft("");
    if (!typed) return;
    const folded = typed.toLowerCase();
    // Prefer the platform-wide spelling over whatever case the owner typed.
    const next = known.find((c) => c.name.toLowerCase() === folded)?.name ?? typed;
    if (value.some((c) => c.toLowerCase() === folded)) return;
    onChange([...value, next]);
  }

  // Don't suggest what's already on the chip row.
  const suggestions = known.filter(
    (c) => !value.some((picked) => picked.toLowerCase() === c.name.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((cuisine) => (
            <span
              key={cuisine}
              className="flex items-center gap-1 rounded-full bg-brand-cream/50 px-2.5 py-1 text-xs font-medium text-brand-red"
            >
              {cuisine}
              <button
                type="button"
                onClick={() => onChange(value.filter((c) => c !== cuisine))}
                aria-label={`Remove ${cuisine}`}
                className="text-brand-red/60 hover:text-brand-red"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        id="settings-cuisine"
        list="cuisine-suggestions"
        autoComplete="off"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={value.length ? "Add another…" : "e.g. North Indian"}
      />
      <datalist id="cuisine-suggestions">
        {suggestions.map((c) => (
          <option key={c.name} value={c.name} />
        ))}
      </datalist>
    </div>
  );
}

// Shared logo/banner picker: validates against the server's own limits, previews the
// pick, and lets it be cleared again before saving.
function BrandImagePicker({ label, file, currentUrl, onPick, onError, hint, fit, icon: Icon }) {
  const preview = useObjectUrl(file);
  const src = preview ?? currentUrl ?? null;

  function handlePick(e) {
    const picked = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after a rejection
    if (!picked) return;
    if (!ALLOWED_IMAGE_TYPES.includes(picked.type)) {
      onError(`${label} must be a JPEG, PNG or WebP`);
      return;
    }
    if (picked.size > MAX_BRAND_BYTES) {
      onError(`${label} must be under 5 MB`);
      return;
    }
    onError(null);
    onPick(picked);
  }

  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-brand-red">{label}</Label>
      <label className="mt-1.5 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed border-[#E2DFDE] bg-[#FCFAF7] text-muted-foreground hover:border-brand-orange/50">
        {src ? (
          <img src={src} alt={`${label} preview`} className={cn("h-full w-full", fit)} />
        ) : (
          <>
            <Icon className="h-5 w-5" />
            <span className="text-xs">{hint}</span>
          </>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handlePick}
        />
      </label>
      {file ? (
        <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{file.name} — uploads on save</span>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="shrink-0 text-brand-maroon hover:underline"
          >
            Remove
          </button>
        </p>
      ) : null}
    </div>
  );
}

// Flattens the three server records into the single shape the form edits.
function seedForm({ restaurant, hours, delivery }) {
  const hoursMap = Object.fromEntries(
    (hours.length ? hours : restaurant.operatingHours ?? []).map((h) => [h.day, h]),
  );
  return {
    name: restaurant.name ?? "",
    description: restaurant.description ?? "",
    cuisineTypes: restaurant.cuisineTypes ?? [],
    // Every address part the settings PATCH accepts, so the city/state/pincode captured at
    // onboarding stay editable — they feed the geocode that puts the restaurant on the map.
    address: {
      street: restaurant.address?.street ?? "",
      city: restaurant.address?.city ?? "",
      state: restaurant.address?.state ?? "",
      pincode: restaurant.address?.pincode ?? "",
    },
    email: restaurant.email ?? "",
    phone: restaurant.phone ?? "",
    website: restaurant.website ?? "",
    establishedYear: restaurant.establishedYear != null ? String(restaurant.establishedYear) : "",
    hours: DAYS.map((day) => ({
      day,
      isOpen: hoursMap[day]?.isOpen ?? true,
      open: hhmmToTime(hoursMap[day]?.openTime ?? DEFAULT_OPEN_TIME),
      close: hhmmToTime(hoursMap[day]?.closeTime ?? DEFAULT_CLOSE_TIME),
    })),
    delivery: {
      radiusKm: String(delivery?.radiusKm ?? restaurant.delivery?.radiusKm ?? ""),
      baseCharge: String(delivery?.baseCharge ?? restaurant.delivery?.baseCharge ?? ""),
      freeThreshold: String(delivery?.freeThreshold ?? restaurant.delivery?.freeThreshold ?? ""),
      estimatedMinutes: String(
        delivery?.estimatedMinutes ?? restaurant.delivery?.estimatedMinutes ?? "",
      ),
    },
    business: {
      legalEntityType: restaurant.settings?.legalEntityType ?? "",
      ownerName: restaurant.settings?.ownerName ?? "",
      panNumber: restaurant.settings?.panNumber ?? "",
    },
    licenses: {
      gstNumber: restaurant.settings?.gstNumber ?? "",
      fssai: restaurant.settings?.healthPermitId ?? "",
      fssaiExpiry: toDateInput(restaurant.settings?.licenseExpiry),
      tradeLicense: restaurant.settings?.registrationNo ?? "",
      tradeLicenseExpiry: toDateInput(restaurant.settings?.tradeLicenseExpiry),
    },
  };
}

// Everything that must hold before a save is attempted, keyed by the field it belongs to.
function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = "Restaurant name is required";

  if (form.establishedYear) {
    const year = Number(form.establishedYear);
    const thisYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < EARLIEST_ESTABLISHED_YEAR || year > thisYear) {
      errors.establishedYear = `Enter a year between ${EARLIEST_ESTABLISHED_YEAR} and ${thisYear}`;
    }
  }
  if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) {
    errors.email = "Enter a valid email address";
  }

  for (const [key, label] of [
    ["radiusKm", "Radius"],
    ["baseCharge", "Base charge"],
    ["freeThreshold", "Free threshold"],
    ["estimatedMinutes", "Estimated time"],
  ]) {
    const raw = form.delivery[key];
    if (raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) errors[key] = `${label} must be zero or more`;
  }

  // An open day with a blank time would otherwise post 00:00, silently marking the
  // restaurant open from midnight.
  if (form.hours.some((h) => h.isOpen && (!h.open || !h.close))) {
    errors.hours = "Set an opening and closing time for every open day";
  }
  return errors;
}

export default function StoreSettings() {
  const navigate = useNavigate();
  const { restaurantId, fetchRestaurants, updateRestaurant } = useOwnerAuth();
  const { data: serverSettings, isLoading, isError } = useSettings(restaurantId);
  // Hours and delivery config have their own endpoints.
  const { data: serverHours = [] } = useHours(restaurantId);
  const { data: serverDelivery } = useDeliverySettings(restaurantId);
  const updateMutation = useUpdateSettings(restaurantId);
  const updateHoursMutation = useUpdateHours(restaurantId);
  const updateDeliveryMutation = useUpdateDelivery(restaurantId);

  const [form, setForm] = useState(null);
  const [original, setOriginal] = useState(null);
  // { tone: "ok" | "error", text }
  const [status, setStatus] = useState(null);
  // Signature of the server payload the form was last seeded from.
  const seededRef = useRef(undefined);
  // Optional brand images uploaded with the next save (PATCH /settings).
  const [logoFile, setLogoFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);

  // create-restaurant form (used when restaurantId is null)
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [newRestaurant, setNewRestaurant] = useState({
    name: "", street: "", city: "", state: "", pincode: "",
  });

  const dirty =
    !!logoFile || !!bannerFile || (!!form && !!original && JSON.stringify(form) !== original);

  // Seed form state from the server records, and re-seed whenever the server's answer
  // changes — most importantly right after a save, so the form shows what was actually
  // persisted. Seeding only once meant the inputs kept displaying whatever was typed
  // regardless of what the server accepted, which hid every dropped field until a reload.
  //
  // Guarded on `dirty` so a background refetch never overwrites edits in progress: the
  // form yields to the server only when there is nothing unsaved to lose.
  useEffect(() => {
    if (!serverSettings) return;
    const signature = JSON.stringify([serverSettings, serverHours, serverDelivery]);
    if (seededRef.current === signature) return;
    if (seededRef.current !== undefined && dirty) return;
    seededRef.current = signature;
    const seeded = seedForm({
      restaurant: serverSettings,
      hours: serverHours,
      delivery: serverDelivery,
    });
    setForm(seeded);
    setOriginal(JSON.stringify(seeded));
  }, [serverSettings, serverHours, serverDelivery, dirty]);

  const errors = useMemo(() => (form ? validate(form) : {}), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setIn = (key, patch) => setForm((f) => ({ ...f, [key]: { ...f[key], ...patch } }));
  const setHour = (day, patch) =>
    setForm((f) => ({
      ...f,
      hours: f.hours.map((h) => (h.day === day ? { ...h, ...patch } : h)),
    }));

  const saving =
    updateMutation.isPending || updateHoursMutation.isPending || updateDeliveryMutation.isPending;

  async function save() {
    if (hasErrors) {
      setStatus({ tone: "error", text: "Fix the highlighted fields before saving" });
      return;
    }
    setStatus(null);

    // Each PATCH is its own record; name the step so a partial failure says which one
    // rather than leaving the owner guessing what did and didn't persist.
    let step = "profile";
    try {
      // PATCH /settings is multipart/form-data so a logo or banner file can ride along
      // with the JSON fields.
      const { data } = await updateMutation.mutateAsync(
        buildSettingsFormData({
          name: form.name.trim(),
          description: form.description,
          cuisineTypes: form.cuisineTypes,
          address: form.address,
          email: form.email.trim(),
          phone: form.phone.trim(),
          website: form.website.trim(),
          establishedYear: form.establishedYear,
          ...(logoFile ? { logo: logoFile } : {}),
          ...(bannerFile ? { banner: bannerFile } : {}),
          // Empty string, not undefined: `undefined` is dropped from the payload and the
          // server skips absent keys, so clearing a field would never take.
          settings: {
            legalEntityType: form.business.legalEntityType,
            ownerName: form.business.ownerName,
            panNumber: form.business.panNumber,
            gstNumber: form.licenses.gstNumber,
            healthPermitId: form.licenses.fssai,
            licenseExpiry: form.licenses.fssaiExpiry,
            registrationNo: form.licenses.tradeLicense,
            tradeLicenseExpiry: form.licenses.tradeLicenseExpiry,
          },
        }),
      );

      step = "opening hours";
      await updateHoursMutation.mutateAsync(
        form.hours.map((h) => ({
          day: h.day,
          isOpen: h.isOpen,
          openTime: timeToHhmm(h.open) ?? DEFAULT_OPEN_TIME,
          closeTime: timeToHhmm(h.close) ?? DEFAULT_CLOSE_TIME,
        })),
      );

      step = "delivery";
      await updateDeliveryMutation.mutateAsync({
        radiusKm: toNumber(form.delivery.radiusKm, undefined),
        baseCharge: toNumber(form.delivery.baseCharge, undefined),
        // Cleared on purpose when left blank — the endpoint replaces the whole delivery
        // object, so an omitted key removes the threshold rather than keeping the old one.
        freeThreshold: toNumber(form.delivery.freeThreshold, undefined),
        estimatedMinutes: toNumber(form.delivery.estimatedMinutes, undefined),
      });

      // The top bar and /profile read the restaurant from the auth context, which is
      // otherwise only refreshed at login — a rename or a new logo would show stale there.
      const saved = data.data?.restaurant;
      if (saved) updateRestaurant(saved);

      setOriginal(JSON.stringify(form));
      setLogoFile(null);
      setBannerFile(null);
      setStatus({ tone: "ok", text: "All changes saved" });
    } catch (err) {
      setStatus({ tone: "error", text: `Couldn't save ${step}: ${err.message ?? "request failed"}` });
    }
  }

  function discard() {
    setForm(JSON.parse(original));
    setLogoFile(null);
    setBannerFile(null);
    setStatus(null);
  }

  // ── No restaurant yet: show create form ──────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    const { name, street, city, state, pincode } = newRestaurant;
    if (!name.trim() || !street.trim() || !city.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      // No coordinates sent: the server geocodes this address into the GeoJSON point
      // that powers "restaurants near me" (services/geocode.service.js), and answers
      // 400 ADDRESS_NOT_FOUND if the address can't be placed on the map.
      await ownerApi.createRestaurant({
        name: name.trim(),
        address: {
          street: street.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
        },
      });
      await fetchRestaurants();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setCreateError(err.message ?? "Failed to create restaurant");
    } finally {
      setCreating(false);
    }
  }

  if (!restaurantId) {
    const setNew = (patch) => setNewRestaurant((r) => ({ ...r, ...patch }));
    const canSubmit =
      newRestaurant.name.trim() && newRestaurant.street.trim() && newRestaurant.city.trim();

    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <Card className="w-full max-w-md">
            <CardHeader className="pb-4">
              <h2 className="text-lg font-bold">Add Your Restaurant</h2>
              <p className="text-sm text-muted-foreground">
                Submit your restaurant profile for platform review.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <Field label="Restaurant Name *" htmlFor="new-name">
                  <Input
                    id="new-name"
                    value={newRestaurant.name}
                    onChange={(e) => setNew({ name: e.target.value })}
                    placeholder="Your restaurant name"
                    required
                  />
                </Field>
                <Field label="Street *" htmlFor="new-street">
                  <Input
                    id="new-street"
                    value={newRestaurant.street}
                    onChange={(e) => setNew({ street: e.target.value })}
                    placeholder="12 Main Road"
                    required
                  />
                </Field>
                <Field label="City *" htmlFor="new-city">
                  <Input
                    id="new-city"
                    value={newRestaurant.city}
                    onChange={(e) => setNew({ city: e.target.value })}
                    placeholder="Delhi"
                    required
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="State" htmlFor="new-state">
                    <Input
                      id="new-state"
                      value={newRestaurant.state}
                      onChange={(e) => setNew({ state: e.target.value })}
                      placeholder="Delhi"
                    />
                  </Field>
                  <Field label="Pincode" htmlFor="new-pincode">
                    <Input
                      id="new-pincode"
                      value={newRestaurant.pincode}
                      onChange={(e) => setNew({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                      placeholder="110001"
                      inputMode="numeric"
                    />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  We place your restaurant on the map from this address, so customers
                  nearby can find you — add the state and pincode for a more accurate
                  match. Your restaurant is submitted for admin review; menu and staff
                  management unlock once it&apos;s approved.
                </p>
                {createError && (
                  <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{createError}</p>
                )}
                <Button
                  type="submit"
                  disabled={creating || !canSubmit}
                  className="w-full bg-brand-gradient text-white hover:brightness-105"
                >
                  {creating ? "Submitting…" : "Submit for review"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (isError) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Failed to load store settings.</p>
      </DashboardLayout>
    );
  }
  if (isLoading || !form) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Loading store settings…</p>
      </DashboardLayout>
    );
  }

  // Compliance details are captured once and then read-only: they identify the legal
  // entity behind the store, and a change after the fact is an admin-reviewed event, not
  // a self-service edit. Keyed off what the *server* holds, so the lock closes only after
  // a value has actually persisted.
  const saved = serverSettings?.settings ?? {};
  const businessLocked = !!(saved.legalEntityType || saved.ownerName || saved.panNumber);
  const licensesLocked = !!(saved.gstNumber || saved.healthPermitId || saved.registrationNo);

  return (
    <DashboardLayout>
      <div className="pb-20">
        <div className="mb-5">
          <h1 className="text-2xl font-bold">Store Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your restaurant profile, hours, delivery, and compliance details.
          </p>
        </div>

        {/* Restaurant info + brand assets */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
          <Card>
            <CardHeader className="pb-4">
              <h2 className="text-base font-bold">Restaurant Information</h2>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Restaurant Name" htmlFor="settings-name" error={errors.name}>
                <Input
                  id="settings-name"
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  aria-invalid={!!errors.name}
                />
              </Field>
              <Field label="Cuisine Types" htmlFor="settings-cuisine">
                <CuisineEditor
                  value={form.cuisineTypes}
                  onChange={(cuisineTypes) => set({ cuisineTypes })}
                />
              </Field>
              <Field label="Email Address" htmlFor="settings-email" error={errors.email}>
                <Input
                  id="settings-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set({ email: e.target.value })}
                  aria-invalid={!!errors.email}
                />
              </Field>
              <Field label="Phone Number" htmlFor="settings-phone">
                <Input
                  id="settings-phone"
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                />
              </Field>
              <Field label="Website" htmlFor="settings-website">
                <Input
                  id="settings-website"
                  type="url"
                  value={form.website}
                  onChange={(e) => set({ website: e.target.value })}
                  placeholder="https://example.com"
                />
              </Field>
              <Field
                label="Established Year"
                htmlFor="settings-year"
                error={errors.establishedYear}
              >
                <Input
                  id="settings-year"
                  value={form.establishedYear}
                  onChange={(e) => set({ establishedYear: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  inputMode="numeric"
                  placeholder="1998"
                  aria-invalid={!!errors.establishedYear}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description" htmlFor="settings-description">
                  <Input
                    id="settings-description"
                    value={form.description}
                    onChange={(e) => set({ description: e.target.value })}
                    placeholder="What your restaurant is known for"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Street" htmlFor="settings-street">
                  <Input
                    id="settings-street"
                    value={form.address.street}
                    onChange={(e) => setIn("address", { street: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="City" htmlFor="settings-city">
                <Input
                  id="settings-city"
                  value={form.address.city}
                  onChange={(e) => setIn("address", { city: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="State" htmlFor="settings-state">
                  <Input
                    id="settings-state"
                    value={form.address.state}
                    onChange={(e) => setIn("address", { state: e.target.value })}
                  />
                </Field>
                <Field label="Pincode" htmlFor="settings-pincode">
                  <Input
                    id="settings-pincode"
                    value={form.address.pincode}
                    onChange={(e) => setIn("address", { pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                    inputMode="numeric"
                  />
                </Field>
              </div>
              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                Changing the address re-places your restaurant on the map, so customers
                searching nearby find you at the new location.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <h2 className="text-base font-bold">Brand Assets</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <BrandImagePicker
                label="Store Logo"
                icon={ImageUp}
                hint="Upload image (max 5 MB)"
                fit="object-contain"
                file={logoFile}
                currentUrl={serverSettings?.logo}
                onPick={setLogoFile}
                onError={(text) => setStatus(text ? { tone: "error", text } : null)}
              />
              <BrandImagePicker
                label="Banner Image"
                icon={ImagePlus}
                hint="1920×1080 recommended"
                fit="object-cover"
                file={bannerFile}
                currentUrl={serverSettings?.bannerImage}
                onPick={setBannerFile}
                onError={(text) => setStatus(text ? { tone: "error", text } : null)}
              />
            </CardContent>
          </Card>
        </div>

        {/* Opening hours */}
        <Card className="mt-5">
          <CardHeader className="pb-4">
            <h2 className="text-base font-bold">Opening Hours</h2>
            {errors.hours ? (
              <p className="text-[11px] text-brand-maroon">{errors.hours}</p>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr] border-b border-brand-cream/60 px-6 py-3 text-xs uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Day</span>
              <span>Status</span>
              <span>Opening Time</span>
              <span>Closing Time</span>
            </div>
            {form.hours.map((h) => (
              <div
                key={h.day}
                className={cn(
                  "flex flex-col gap-2 border-b border-brand-cream/40 px-4 py-3 last:border-0 sm:grid sm:grid-cols-[1.2fr_1fr_1fr_1fr] sm:items-center sm:px-6",
                  !h.isOpen && "opacity-60",
                )}
              >
                <span className="text-sm font-medium capitalize">{h.day}</span>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={h.isOpen}
                    onCheckedChange={(isOpen) => setHour(h.day, { isOpen })}
                    aria-label={`${h.day} open`}
                  />
                  <span className={h.isOpen ? "text-brand-green" : "text-muted-foreground"}>
                    {h.isOpen ? "Open" : "Closed"}
                  </span>
                </label>
                <Input
                  type="time"
                  value={h.open}
                  disabled={!h.isOpen}
                  onChange={(e) => setHour(h.day, { open: e.target.value })}
                  aria-label={`${h.day} opening time`}
                  className="h-8 w-full sm:w-32"
                />
                <Input
                  type="time"
                  value={h.close}
                  disabled={!h.isOpen}
                  onChange={(e) => setHour(h.day, { close: e.target.value })}
                  aria-label={`${h.day} closing time`}
                  className="h-8 w-full sm:w-32"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Delivery logistics */}
        <Card className="mt-5">
          <CardHeader className="pb-4">
            <h2 className="text-base font-bold">Delivery Logistics</h2>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Radius (km)" htmlFor="delivery-radius" error={errors.radiusKm}>
              <Input
                id="delivery-radius"
                type="number"
                min="0"
                step="0.5"
                value={form.delivery.radiusKm}
                onChange={(e) => setIn("delivery", { radiusKm: e.target.value })}
                aria-invalid={!!errors.radiusKm}
              />
            </Field>
            <Field label="Base Charge (₹)" htmlFor="delivery-charge" error={errors.baseCharge}>
              <Input
                id="delivery-charge"
                type="number"
                min="0"
                value={form.delivery.baseCharge}
                onChange={(e) => setIn("delivery", { baseCharge: e.target.value })}
                aria-invalid={!!errors.baseCharge}
              />
            </Field>
            <Field
              label="Free Delivery Above (₹)"
              htmlFor="delivery-threshold"
              error={errors.freeThreshold}
            >
              <Input
                id="delivery-threshold"
                type="number"
                min="0"
                value={form.delivery.freeThreshold}
                onChange={(e) => setIn("delivery", { freeThreshold: e.target.value })}
                placeholder="Leave blank for none"
                aria-invalid={!!errors.freeThreshold}
              />
            </Field>
            <Field
              label="Estimated Time (min)"
              htmlFor="delivery-eta"
              error={errors.estimatedMinutes}
            >
              <Input
                id="delivery-eta"
                type="number"
                min="0"
                value={form.delivery.estimatedMinutes}
                onChange={(e) => setIn("delivery", { estimatedMinutes: e.target.value })}
                aria-invalid={!!errors.estimatedMinutes}
              />
            </Field>
          </CardContent>
        </Card>

        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Business Details */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
              <h2 className="text-base font-bold">Business Details</h2>
              {businessLocked && <LockBadge />}
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {businessLocked ? (
                <>
                  <LockedField label="Legal Entity Type" value={form.business.legalEntityType} />
                  <LockedField label="Owner Name" value={form.business.ownerName} />
                  <div className="sm:col-span-2">
                    <LockedField label="Tax Identifier (PAN)" value={form.business.panNumber} />
                  </div>
                </>
              ) : (
                <>
                  <Field label="Legal Entity Type">
                    <LegalEntitySelect
                      value={form.business.legalEntityType}
                      onChange={(legalEntityType) => setIn("business", { legalEntityType })}
                    />
                  </Field>
                  <Field label="Owner Name" htmlFor="business-owner">
                    <Input
                      id="business-owner"
                      value={form.business.ownerName}
                      onChange={(e) => setIn("business", { ownerName: e.target.value })}
                      placeholder="Full name"
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Tax Identifier (PAN)" htmlFor="business-pan">
                      <Input
                        id="business-pan"
                        value={form.business.panNumber}
                        onChange={(e) => setIn("business", { panNumber: e.target.value.toUpperCase() })}
                        placeholder="ABCDE1234F"
                        className="uppercase tracking-widest"
                      />
                    </Field>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Licenses & Tax */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
              <h2 className="text-base font-bold">Licenses &amp; Tax</h2>
              {licensesLocked && <LockBadge />}
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {licensesLocked ? (
                <>
                  <div className="sm:col-span-2">
                    <LockedField label="GST Number" value={form.licenses.gstNumber} />
                  </div>
                  <LockedField label="FSSAI License No." value={form.licenses.fssai} />
                  <LockedField label="FSSAI Expiry Date" value={form.licenses.fssaiExpiry} />
                  <LockedField label="Trade License No." value={form.licenses.tradeLicense} />
                  <LockedField label="Trade License Expiry" value={form.licenses.tradeLicenseExpiry} />
                </>
              ) : (
                <>
                  <div className="sm:col-span-2">
                    <Field label="GST Number" htmlFor="license-gst">
                      <Input
                        id="license-gst"
                        value={form.licenses.gstNumber}
                        onChange={(e) => setIn("licenses", { gstNumber: e.target.value.toUpperCase() })}
                        placeholder="27AACR1234F1Z1"
                        className="uppercase tracking-widest"
                      />
                    </Field>
                  </div>
                  <Field label="FSSAI License No." htmlFor="license-fssai">
                    <Input
                      id="license-fssai"
                      value={form.licenses.fssai}
                      onChange={(e) => setIn("licenses", { fssai: e.target.value })}
                      placeholder="H-992-B"
                    />
                  </Field>
                  <Field label="FSSAI Expiry Date" htmlFor="license-fssai-expiry">
                    <Input
                      id="license-fssai-expiry"
                      type="date"
                      value={form.licenses.fssaiExpiry}
                      onChange={(e) => setIn("licenses", { fssaiExpiry: e.target.value })}
                    />
                  </Field>
                  <Field label="Trade License No." htmlFor="license-trade">
                    <Input
                      id="license-trade"
                      value={form.licenses.tradeLicense}
                      onChange={(e) => setIn("licenses", { tradeLicense: e.target.value })}
                      placeholder="REG-9912002"
                    />
                  </Field>
                  <Field label="Trade License Expiry" htmlFor="license-trade-expiry">
                    <Input
                      id="license-trade-expiry"
                      type="date"
                      value={form.licenses.tradeLicenseExpiry}
                      onChange={(e) => setIn("licenses", { tradeLicenseExpiry: e.target.value })}
                    />
                  </Field>
                  <p className="text-[11px] text-muted-foreground sm:col-span-2">
                    These identify the legal entity behind your store. Once saved they can
                    only be changed by platform support.
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-brand-cream/60 bg-[#FAFAF8]/95 px-4 py-3.5 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-7 lg:px-7">
        <span
          className={cn(
            "text-sm",
            status?.tone === "error" && "text-brand-maroon",
            status?.tone === "ok" && "text-brand-green",
            !status && dirty && "text-brand-orange",
            !status && !dirty && "text-muted-foreground",
          )}
        >
          {status ? status.text : dirty ? "● You have unsaved changes" : "All changes saved"}
        </span>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={discard} disabled={!dirty || saving}>
            Discard Changes
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={!dirty || saving || hasErrors}
            className="bg-brand-gradient px-6 text-white hover:brightness-105"
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
