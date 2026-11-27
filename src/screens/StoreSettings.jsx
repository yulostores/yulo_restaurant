// Store Settings (/store-settings) — Figma node 151:602. Restaurant profile,
// brand assets, weekly opening hours, delivery logistics, and legal/licensing
// details with a sticky unsaved-changes action bar (PRD §13.1 OWN-01).
//
// Four endpoints back this screen. Three of them are writes, each with its own record on
// the Restaurant document, so a save fans out to all three:
//   PATCH /owner/:rId/settings           multipart — profile, brand images, compliance
//   PATCH /owner/:rId/settings/hours     { operatingHours: [{ day, isOpen, openTime, closeTime }] }
//   PATCH /owner/:rId/settings/delivery  { radiusKm, baseCharge, freeThreshold, estimatedMinutes }
//
// The fourth is what the form is *made of*:
//   GET   /owner/settings-requirements   the field contract — see below
//
// Nothing on this screen decides what a field is called, whether it is mandatory, what a
// valid value looks like, what a dropdown offers, or how big a logo may be. All of it
// arrives from that endpoint, served by server/config/storeSettings.config.js — the same
// module PATCH /settings validates against. So the required-field rule is one rule with
// two enforcement points rather than two rules that drift: the form marks a field with a
// `*`, refuses to save without it and says why, and the API answers 400 with per-field
// messages to anyone who tries the same save without the form.
//
// Form state is keyed by those same paths (`address.city`, `settings.panNumber`), which is
// what lets one setter, one validator and one error lookup serve every input here.
//
// Compliance *documents* are the exception: they upload one at a time the moment a file is
// picked (POST /owner/:rId/documents), not on save. A scan is not a form field — holding it
// hostage to the sticky save bar would mean an owner who uploads six files and navigates
// away has uploaded nothing, and each one carries its own review state coming back.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, ImagePlus, ImageUp, Landmark, LocateFixed, Lock, MapPin, MapPinOff, X } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  buildSettingsFormData,
  getCurrentPosition,
  useDeliverySettings,
  useHours,
  useSettings,
  useSettingsRequirements,
  useSetRestaurantLocation,
  useUpdateDelivery,
  useUpdateHours,
  useUpdateSettings,
} from "@/hooks/owner/useSettings";
import { ownerApi } from "@/api/owner.api";
import { catalogApi } from "@/api/catalog.api";
import DashboardLayout from "@/components/DashboardLayout";
import ApprovalNotice from "@/components/ApprovalNotice";
import ComplianceDocuments from "@/components/ComplianceDocuments";
import LocationPicker from "@/components/LocationPicker";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { hhmmToTime, timeToHhmm } from "@/lib/hours";
import { useObjectUrl } from "@/lib/useObjectUrl";
import {
  applyInputRules,
  brandImageError,
  fieldError,
  getByPath,
  indexFields,
  inputId,
  setByPath,
  validateFields,
} from "@/lib/fieldRules";

// Settings that change what guests are charged (or the tax on it). A save that touches any
// of them asks first and lists the before → after; everything else saves straight away.
const formatRupees = (v) => (v === "" || v === null || v === undefined ? "none" : `₹${v}`);
const CHARGE_FIELDS = [
  {
    path: "gstRegistered",
    label: "GST registered",
    format: (v) => (v ? "On — food GST charged on orders" : "Off — no food GST"),
  },
  { path: "settings.gstNumber", label: "GST number", format: (v) => v || "none" },
  { path: "delivery.baseCharge", label: "Delivery base charge", format: formatRupees },
  { path: "delivery.freeThreshold", label: "Free delivery above", format: formatRupees },
];

function chargeChanges(saved, next) {
  if (!saved || !next) return [];
  return CHARGE_FIELDS.flatMap((f) => {
    const before = getByPath(saved, f.path);
    const after = getByPath(next, f.path);
    const same = (before ?? "") === (after ?? "") || String(before ?? "") === String(after ?? "");
    return same ? [] : [{ ...f, before: f.format(before), after: f.format(after) }];
  });
}

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

// The last segment of a field path — `settings.panNumber` lives at `panNumber` inside the
// `settings` sub-object, on the form and on the document alike.
const leaf = (path) => path.split(".").pop();

// The DOM attributes a descriptor implies. Kept here rather than in the descriptor itself
// because they are this client's rendering concern, not part of the contract.
function inputAttrs(field) {
  if (!field) return {};
  const attrs = { id: inputId(field.path) };
  if (field.placeholder) attrs.placeholder = field.placeholder;
  if (["email", "tel", "url", "date", "number"].includes(field.type)) attrs.type = field.type;
  if (field.type === "number") {
    if (field.min !== undefined) attrs.min = String(field.min);
    if (field.max !== undefined) attrs.max = String(field.max);
    if (field.step !== undefined) attrs.step = String(field.step);
  }
  // A digit-filtered field stays a text box with a numeric keypad: <input type="number">
  // ignores maxLength and its spinner walks straight past the ceiling.
  if (field.digitsOnly) {
    if (attrs.type === "number") attrs.type = "text";
    attrs.inputMode = "numeric";
  }
  if (field.maxLength && attrs.type !== "number") attrs.maxLength = field.maxLength;
  return attrs;
}

// `help` comes from the field descriptor the server serves (config/storeSettings.config.js),
// same as the label and the bounds — so a field whose MEANING needs explaining, like the
// delivery radius, carries that explanation from the one place the rule itself lives rather
// than from a sentence hardcoded here that can drift away from it.
function Field({ label, htmlFor, error, required, help, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs uppercase tracking-wide text-brand-red">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-brand-maroon">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-[11px] text-brand-maroon">
          {error}
        </p>
      ) : help ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground">{help}</p>
      ) : null}
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

// How far this restaurant reaches, and whether it is on the map at all.
//
// Mirrors server/config/delivery.config.js. An owner filling in this form has no other way
// to tell whether their address was actually turned into a map point: the whole form can be
// complete and correct, the store approved and open, and still reach nobody, because the
// geocoder never resolved the address into coordinates. That used to be silent in every
// portal — this is the owner's half of the same answer the admin console now gives.
const DISCOVERY_RADIUS_KM = 25;

// "Use my current location": the geocoder places a restaurant from its address, which can
// land a street or two away. Pressed while standing in the restaurant, this saves the exact
// spot instead — straight away, independent of the rest of the form.
function MapPlacement({ restaurant, restaurantId }) {
  const coordinates = restaurant?.location?.coordinates;
  const [lng, lat] = Array.isArray(coordinates) ? coordinates : [];
  const placed =
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    !(lng === 0 && lat === 0);
  const saved = placed ? { lat, lng } : null;

  const setLocation = useSetRestaurantLocation(restaurantId);
  const [pin, setPin] = useState(saved);
  const [message, setMessage] = useState(null);
  // A pin moved on the map but not saved yet.
  const moved = !!pin && (!saved || pin.lat !== saved.lat || pin.lng !== saved.lng);

  async function savePin() {
    setMessage(null);
    try {
      await setLocation.mutateAsync(pin);
      setMessage({ tone: "ok", text: "Location saved." });
    } catch (err) {
      setMessage({ tone: "error", text: err.message ?? "Couldn't save the location" });
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-3",
        placed ? "border-brand-line bg-muted/30" : "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="mb-2 flex items-start gap-2">
        {placed ? (
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
        ) : (
          <MapPinOff className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        )}
        <p className={cn("text-[11px] leading-relaxed", placed ? "text-muted-foreground" : "text-destructive")}>
          {placed ? (
            <>
              <span className="font-semibold text-foreground">You are on the map.</span> Customers
              within {DISCOVERY_RADIUS_KM} km of this pin see your restaurant, closest first. Your
              delivery radius (under Delivery) decides how far you actually deliver.
            </>
          ) : (
            <>
              <span className="font-semibold">Not placed on the map yet.</span> Customers cannot
              find you until you place the pin below and save it.
            </>
          )}
        </p>
      </div>
      <LocationPicker value={pin} onChange={setPin} address={restaurant?.address ?? {}} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={savePin} disabled={!moved || setLocation.isPending}>
          {setLocation.isPending ? "Saving…" : "Save this location"}
        </Button>
        {moved ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setPin(saved)}>
            Undo
          </Button>
        ) : null}
        {message ? (
          <span className={cn("text-[11px]", message.tone === "error" ? "text-destructive" : "text-emerald-700")}>
            {message.text}
          </span>
        ) : moved ? (
          <span className="text-[11px] text-brand-orange">Pin moved — save to apply it.</span>
        ) : null}
      </div>
    </div>
  );
}

// Pure veg or veg & non-veg. In a pure-veg restaurant nothing non-veg is offered anywhere: the
// menu form only has VEG, and the server refuses a non-veg dish (or the switch, while one is
// still on the menu).
const VEG_CHOICES = [
  { value: true, label: "Pure-veg", hint: "Only vegetarian dishes" },
  { value: false, label: "Veg/Non-veg", hint: "Both on the menu" },
];

function VegChoice({ value, onChange, disabled, invalid }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2", invalid && "rounded-lg ring-1 ring-destructive")}>
      {VEG_CHOICES.map((c) => (
        <button
          key={String(c.value)}
          type="button"
          disabled={disabled}
          aria-pressed={value === c.value}
          onClick={() => onChange(c.value)}
          className={cn(
            "rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-60",
            value === c.value
              ? "border-brand-green bg-[#E8F5EC] text-brand-green"
              : "border-input bg-background hover:bg-muted/40",
          )}
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span
              className={cn(
                "inline-flex h-4 w-4 items-center justify-center rounded-sm border",
                c.value ? "border-green-600" : "border-brand-maroon",
              )}
            >
              <span className={cn("h-2 w-2 rounded-full", c.value ? "bg-green-600" : "bg-brand-maroon")} />
            </span>
            {c.label}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{c.hint}</span>
        </button>
      ))}
    </div>
  );
}

// Saved straight away (PATCH /owner/:rId/restaurant), like the map pin.
function VegSetting({ restaurant, restaurantId, onSaved }) {
  const [value, setValue] = useState(!!restaurant?.isPureVeg);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function change(next) {
    if (next === value) return;
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await ownerApi.updateRestaurant(restaurantId, { isPureVeg: next });
      setValue(next);
      onSaved?.(data.data?.restaurant);
      setMessage({ tone: "ok", text: next ? "Saved — your restaurant is Pure-veg." : "Saved — Veg/Non-veg." });
    } catch (err) {
      setMessage({ tone: "error", text: err.message ?? "Couldn't save" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <VegChoice value={value} onChange={change} disabled={busy} />
      {message ? (
        <p className={cn("text-[11px]", message.tone === "error" ? "text-destructive" : "text-emerald-700")}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

// Options and the empty-state caption both come from the field descriptor, so the list of
// legal entity types lives in one place on the server and nowhere here.
function SelectField({ field, value, onChange, invalid }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const display = value || field.placeholder || "Select";

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
        id={inputId(field.path)}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring",
          invalid && "border-brand-maroon",
        )}
      >
        <span className={cn("font-medium uppercase tracking-wide", !value && "text-muted-foreground")}>
          {display}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-brand-cream/70 bg-white shadow-lg">
          {(field.options ?? []).map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              onClick={() => { onChange(option); setOpen(false); }}
              className={cn(
                "flex w-full items-center px-4 py-2.5 text-sm hover:bg-brand-cream/30",
                value === option && "font-semibold text-brand-orange",
              )}
            >
              {option}
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
// A partnership's partners: one row per name, up to field.maxItems (4). Empty rows stay on
// screen while typing but are never sent — the form value is the filled-in names only.
function PartnerNamesEditor({ field, value, onChange, invalid }) {
  const max = field.maxItems ?? 4;
  const [rows, setRows] = useState(() => (value?.length ? value : [""]));
  const update = (next) => {
    setRows(next);
    onChange(next.map((n) => n.trim()).filter(Boolean));
  };
  return (
    <div className="space-y-2">
      {rows.map((name, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            id={i === 0 ? inputId(field.path) : undefined}
            value={name}
            maxLength={field.itemMaxLength}
            placeholder={`Partner ${i + 1} full name`}
            aria-label={`Partner ${i + 1} name`}
            aria-invalid={invalid || undefined}
            onChange={(e) => update(rows.map((r, j) => (j === i ? e.target.value : r)))}
          />
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => update(rows.filter((_, j) => j !== i))}
              className="rounded-md p-2 text-muted-foreground hover:bg-gray-100"
              aria-label={`Remove partner ${i + 1}`}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ))}
      {rows.length < max ? (
        <button
          type="button"
          onClick={() => update([...rows, ""])}
          className="text-sm font-semibold text-brand-orange hover:underline"
        >
          + Add partner
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">Up to {max} partners.</p>
      )}
    </div>
  );
}

function CuisineEditor({ field, value, onChange }) {
  const [draft, setDraft] = useState("");

  // Suggestions are a nicety, not a dependency: a failed or empty fetch just means an
  // ordinary free-text field, so there is no error state to render here.
  const { data: known = [] } = useQuery({
    queryKey: ["cuisines"],
    queryFn: () => catalogApi.listCuisines().then((r) => r.data.data.cuisines ?? []),
    staleTime: 60 * 60_000,
  });

  // A typed comma makes a chip (onKeyDown), but a pasted "North Indian, Biryani" never
  // types one — it used to become a single cuisine named "North Indian, Biryani" that no
  // cuisine filter matches. So the draft is split on commas here as well.
  function add() {
    const entries = draft.split(",").map((s) => s.trim()).filter(Boolean);
    setDraft("");
    const next = [...value];
    for (const typed of entries) {
      const folded = typed.toLowerCase();
      if (next.some((c) => c.toLowerCase() === folded)) continue;
      // Prefer the platform-wide spelling over whatever case the owner typed.
      next.push(known.find((c) => c.name.toLowerCase() === folded)?.name ?? typed);
    }
    if (next.length !== value.length) onChange(next);
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
        id={inputId(field.path)}
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

// Shared logo/banner picker: validates against the server's own limits — which the server
// itself reports (requirements.brandImage) — previews the pick, and lets it be cleared
// again before saving.
function BrandImagePicker({ field, limits, file, currentUrl, onPick, onError, fit, icon: Icon }) {
  const preview = useObjectUrl(file);
  const src = preview ?? currentUrl ?? null;

  function handlePick(e) {
    const picked = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked after a rejection
    if (!picked) return;
    const problem = brandImageError(limits, picked);
    if (problem) {
      onError(`${field.label}: ${problem}`);
      return;
    }
    onError(null);
    onPick(picked);
  }

  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-brand-red">{field.label}</Label>
      <label className="mt-1.5 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border-2 border-dashed border-[#E2DFDE] bg-[#FCFAF7] text-muted-foreground hover:border-brand-orange/50">
        {src ? (
          <img src={src} alt={`${field.label} preview`} className={cn("h-full w-full", fit)} />
        ) : (
          <>
            <Icon className="h-5 w-5" />
            <span className="text-xs">{field.hint}</span>
          </>
        )}
        <input
          type="file"
          accept={limits?.accept}
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

// Flattens the three server records into the single shape the form edits — which is the
// shape the API expects, addressed by the same paths the field spec uses.
function seedForm({ restaurant, hours, delivery, spec, hoursConfig }) {
  const hoursMap = Object.fromEntries(
    (hours.length ? hours : restaurant.operatingHours ?? []).map((h) => [h.day, h]),
  );
  const compliance = [...spec.section("business"), ...spec.section("licenses"), ...spec.section("billing")];

  return {
    name: restaurant.name ?? "",
    description: restaurant.description ?? "",
    cuisineTypes: restaurant.cuisineTypes ?? [],
    // Every address part the settings PATCH accepts, so the city/state/pincode captured at
    // onboarding stay editable — they feed the geocode that puts the restaurant on the map.
    address: Object.fromEntries(
      spec.section("profile")
        .filter((f) => f.path.startsWith("address."))
        .map((f) => [leaf(f.path), restaurant.address?.[leaf(f.path)] ?? ""]),
    ),
    email: restaurant.email ?? "",
    phone: restaurant.phone ?? "",
    website: restaurant.website ?? "",
    establishedYear: restaurant.establishedYear != null ? String(restaurant.establishedYear) : "",
    hours: hoursConfig.days.map((day) => ({
      day,
      isOpen: hoursMap[day]?.isOpen ?? true,
      open: hhmmToTime(hoursMap[day]?.openTime ?? hoursConfig.defaultOpenTime),
      close: hhmmToTime(hoursMap[day]?.closeTime ?? hoursConfig.defaultCloseTime),
    })),
    delivery: Object.fromEntries(
      spec.section("delivery").map((f) => {
        const key = leaf(f.path);
        const value = delivery?.[key] ?? restaurant.delivery?.[key];
        return [key, value == null ? "" : String(value)];
      }),
    ),
    // Whether food GST is charged on this restaurant's orders — the "tax" section's toggle.
    gstRegistered: restaurant.gstRegistered === true,
    settings: Object.fromEntries(
      compliance.map((f) => {
        const key = leaf(f.path);
        const raw = restaurant.settings?.[key];
        if (f.type === "tags") return [key, Array.isArray(raw) ? raw : []];
        return [key, f.type === "date" ? toDateInput(raw) : f.type === "number" ? (raw == null ? "" : String(raw)) : raw ?? ""];
      }),
    ),
  };
}

export default function StoreSettings() {
  const { restaurantId, fetchRestaurants, updateRestaurant, user } = useOwnerAuth();
  const {
    data: requirements,
    isLoading: reqLoading,
    isError: reqError,
  } = useSettingsRequirements();
  const { data: serverSettings, isLoading, isError } = useSettings(restaurantId);
  // Hours and delivery config have their own endpoints.
  const { data: serverHours = [] } = useHours(restaurantId);
  const { data: serverDelivery } = useDeliverySettings(restaurantId);
  const updateMutation = useUpdateSettings(restaurantId);
  const updateHoursMutation = useUpdateHours(restaurantId);
  const updateDeliveryMutation = useUpdateDelivery(restaurantId);

  const spec = useMemo(() => indexFields(requirements?.fields ?? []), [requirements]);

  const [form, setForm] = useState(null);
  const [original, setOriginal] = useState(null);
  // { tone: "ok" | "error", text }
  const [status, setStatus] = useState(null);
  // Which fields the owner has actually been through, and whether a save has been
  // attempted. A brand-new restaurant is missing every mandatory detail by definition —
  // painting all ten red before it has been touched reads as a broken screen rather than
  // as guidance — so a message appears once its own field has been edited, and every
  // outstanding one appears the moment Save is pressed.
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  // Field errors the API answered with (400 VALIDATION_ERROR → details.fieldErrors),
  // keyed by the same paths. They matter even when the client thought the form was fine:
  // the server is the authority, and its reasons belong on the fields they concern.
  const [serverFieldErrors, setServerFieldErrors] = useState({});
  // Signature of the server payload the form was last seeded from.
  const seededRef = useRef(undefined);
  // Optional brand images uploaded with the next save (PATCH /settings).
  const [logoFile, setLogoFile] = useState(null);
  const [bannerFile, setBannerFile] = useState(null);
  // Charge/tax changes awaiting the owner's confirm before the save goes out.
  const [pendingCharges, setPendingCharges] = useState(null);

  // create-restaurant form (used when restaurantId is null)
  const [creating, setCreating] = useState(false);
  // The map pin on the create form — { lat, lng } or null. Required: it is how the
  // restaurant's coordinates are captured.
  const createDraftKey = `create:${user?._id ?? "owner"}`;
  const settingsDraftKey = `settings:${restaurantId}`;
  const [createDraft] = useState(() => loadDraft(createDraftKey));
  const [newPin, setNewPin] = useState(() => createDraft?.pin ?? null);
  const [createError, setCreateError] = useState("");
  const [createSubmitted, setCreateSubmitted] = useState(false);
  const [newRestaurant, setNewRestaurant] = useState(
    () => createDraft?.restaurant ?? { name: "", address: {} },
  );
  // "Draft saved" feedback for the auto-save, on both forms.
  const [draftNote, setDraftNote] = useState(!restaurantId && createDraft ? "Restored your saved draft" : "");

  // Auto-save the create form as it is typed (debounced), so nothing is lost before submit.
  useEffect(() => {
    if (restaurantId) return undefined;
    const empty = !newPin && !newRestaurant.name && !Object.values(newRestaurant.address ?? {}).some(Boolean);
    if (empty) return undefined;
    const t = setTimeout(() => {
      if (saveDraft(createDraftKey, { restaurant: newRestaurant, pin: newPin })) {
        setDraftNote(`Draft saved ${new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [restaurantId, newRestaurant, newPin, createDraftKey]);

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
    if (!serverSettings || !requirements) return;
    const signature = JSON.stringify([serverSettings, serverHours, serverDelivery]);
    if (seededRef.current === signature) return;
    if (seededRef.current !== undefined && dirty) return;
    seededRef.current = signature;
    const seeded = seedForm({
      restaurant: serverSettings,
      hours: serverHours,
      delivery: serverDelivery,
      spec,
      hoursConfig: requirements.hours,
    });
    const base = JSON.stringify(seeded);
    setOriginal(base);
    // Auto-saved edits from an earlier visit — restored only onto the same server state they
    // were made against, so a draft never resurrects values the server has since changed.
    const draft = loadDraft(settingsDraftKey);
    if (draft?.base === base && draft.form && JSON.stringify(draft.form) !== base) {
      setForm(draft.form);
      setStatus({ tone: "ok", text: "Restored your unsaved changes — press Save to apply them" });
    } else {
      if (draft) clearDraft(settingsDraftKey);
      setForm(seeded);
    }
  }, [serverSettings, serverHours, serverDelivery, requirements, spec, dirty, settingsDraftKey]);

  // Auto-save edits in progress (debounced) so a refresh or a detour loses nothing. The
  // brand images can't be kept this way — a picked file has to be picked again.
  useEffect(() => {
    if (!form || !original) return undefined;
    const t = setTimeout(() => {
      if (JSON.stringify(form) === original) clearDraft(settingsDraftKey);
      else if (saveDraft(settingsDraftKey, { base: original, form })) {
        setDraftNote(`Draft auto-saved ${new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [form, original, settingsDraftKey]);

  // Every rule in the contract, run against the object that is about to be sent — so what
  // is validated is exactly what is saved.
  const errors = useMemo(() => {
    if (!form || !requirements) return {};
    const found = validateFields(spec.all, form);
    // As on the server (validateStoreSettingsChanges): a field this save changes gets its
    // full rules, one it leaves alone only blocks when it is required and blank. A value saved
    // in an older format — a GSTIN, a legal entity type, a website — never stops an owner
    // fixing their phone number; it is checked the moment it is edited. The GST number also
    // counts as changed when the "GST registered" toggle that tightens it is flipped.
    const saved = original ? JSON.parse(original) : null;
    if (saved) {
      const same = (path) =>
        JSON.stringify(getByPath(saved, path) ?? "") === JSON.stringify(getByPath(form, path) ?? "");
      for (const field of spec.all) {
        const condition = field.requiredWhen;
        if (!same(field.path) || (condition && !same(condition.path))) continue;
        const value = getByPath(form, field.path);
        const blank = value === undefined || value === null || String(value).trim() === "" || (Array.isArray(value) && !value.length);
        const message = field.required && blank ? fieldError(field, value) : null;
        if (message) found[field.path] = message;
        else delete found[field.path];
      }
    }
    // An open day with a blank time would otherwise post 00:00, silently marking the
    // restaurant open from midnight. Hours are a table, not a field, so this one rule
    // can't be expressed as a per-field descriptor.
    if (form.hours.some((h) => h.isOpen && (!h.open || !h.close))) {
      found.hours = requirements.hours.incompleteMessage;
    }
    return found;
  }, [form, original, requirements, spec]);

  const hasErrors = Object.keys(errors).length > 0;

  // A message is shown once its field has been touched or a save has been attempted; one
  // the server sent back is shown regardless, since it can only exist after an attempt.
  const errorFor = (path) =>
    (submitted || touched[path] ? errors[path] : undefined) ?? serverFieldErrors[path];

  const setField = (path, value) => {
    setForm((f) => setByPath(f, path, value));
    setTouched((t) => (t[path] ? t : { ...t, [path]: true }));
    // The server's verdict was about the value that has just changed.
    setServerFieldErrors((e) => (path in e ? { ...e, [path]: undefined } : e));
  };
  const onInput = (field) => (e) => setField(field.path, applyInputRules(field, e.target.value));

  const setHour = (day, patch) => {
    setForm((f) => ({
      ...f,
      hours: f.hours.map((h) => (h.day === day ? { ...h, ...patch } : h)),
    }));
    setTouched((t) => (t.hours ? t : { ...t, hours: true }));
  };

  // Send the owner to the first thing standing between them and a save, in the order the
  // fields are laid out — a message under a control three cards down is otherwise easy to
  // miss on a screen this long.
  function focusFirstInvalid(paths) {
    const first = spec.all.map((f) => f.path).find((path) => paths[path]);
    const el = first ? document.getElementById(inputId(first)) : null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    }
  }

  const saving =
    updateMutation.isPending || updateHoursMutation.isPending || updateDeliveryMutation.isPending;

  async function save() {
    setSubmitted(true);
    setServerFieldErrors({});

    if (hasErrors) {
      const count = Object.keys(errors).length;
      setStatus({
        tone: "error",
        text: `${count} ${count === 1 ? "field needs" : "fields need"} attention before this can be saved`,
      });
      focusFirstInvalid(errors);
      return;
    }
    setStatus(null);

    const changes = chargeChanges(JSON.parse(original), form);
    if (changes.length > 0) {
      setPendingCharges(changes);
      return;
    }
    await persist();
  }

  async function confirmCharges() {
    try {
      await persist();
    } finally {
      setPendingCharges(null);
    }
  }

  async function persist() {
    const gstNumberChanged =
      (JSON.parse(original).settings?.gstNumber ?? "") !== (form.settings?.gstNumber ?? "");

    // Each PATCH is its own record; name the step so a partial failure says which one
    // rather than leaving the owner guessing what did and didn't persist.
    let step = "profile";
    try {
      // PATCH /settings is multipart/form-data so a logo or banner file can ride along
      // with the JSON fields.
      //
      // Empty string, not undefined, for anything the owner cleared: `undefined` is
      // dropped from the payload and the server skips absent keys, so clearing an
      // optional field would never take.
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
          // The GST number rides along only when it changed: the server applies the GSTIN
          // rules to any save that carries it, and an unchanged older-format number must not
          // block an unrelated edit (the settings merge keeps the stored one).
          settings: gstNumberChanged
            ? form.settings
            : Object.fromEntries(Object.entries(form.settings).filter(([key]) => key !== "gstNumber")),
          // Only when it changed: setting it records the owner's decision (and stamps it so the
          // GST backfill never overrides it), which an unrelated save shouldn't do.
          ...(form.gstRegistered !== JSON.parse(original).gstRegistered
            ? { gstRegistered: form.gstRegistered }
            : {}),
          ...(logoFile ? { logo: logoFile } : {}),
          ...(bannerFile ? { banner: bannerFile } : {}),
        }),
      );

      step = "opening hours";
      await updateHoursMutation.mutateAsync(
        form.hours.map((h) => ({
          day: h.day,
          isOpen: h.isOpen,
          openTime: timeToHhmm(h.open) ?? requirements.hours.defaultOpenTime,
          closeTime: timeToHhmm(h.close) ?? requirements.hours.defaultCloseTime,
        })),
      );

      step = "delivery";
      await updateDeliveryMutation.mutateAsync(
        Object.fromEntries(
          // Cleared on purpose when left blank — the endpoint replaces the whole delivery
          // object, so an omitted key removes the value rather than keeping the old one.
          Object.entries(form.delivery).map(([key, value]) => [key, toNumber(value, undefined)]),
        ),
      );

      // The top bar and /profile read the restaurant from the auth context, which is
      // otherwise only refreshed at login — a rename or a new logo would show stale there.
      const saved = data.data?.restaurant;
      if (saved) updateRestaurant(saved);

      setOriginal(JSON.stringify(form));
      clearDraft(settingsDraftKey);
      setDraftNote("");
      setLogoFile(null);
      setBannerFile(null);
      setSubmitted(false);
      setStatus({ tone: "ok", text: "All changes saved" });
    } catch (err) {
      // A 400 from the required-field gate names the fields it refused — put each message
      // where the owner can act on it rather than only in the status bar.
      const fieldErrors = err.details?.fieldErrors;
      if (fieldErrors && Object.keys(fieldErrors).length > 0) {
        setServerFieldErrors(fieldErrors);
        setStatus({ tone: "error", text: err.message ?? "Some required details are missing" });
        focusFirstInvalid(fieldErrors);
        return;
      }
      setStatus({ tone: "error", text: `Couldn't save ${step}: ${err.message ?? "request failed"}` });
    }
  }

  function discard() {
    clearDraft(settingsDraftKey);
    setDraftNote("");
    setForm(JSON.parse(original));
    setLogoFile(null);
    setBannerFile(null);
    setTouched({});
    setSubmitted(false);
    setServerFieldErrors({});
    setStatus(null);
  }

  // ── No restaurant yet: show create form ──────────────────────────
  const createFields = spec.onCreate();
  const createErrors = validateFields(createFields, newRestaurant);

  async function handleCreate(e) {
    e.preventDefault();
    setCreateSubmitted(true);
    if (Object.keys(createErrors).length > 0) {
      setCreateError("");
      focusFirstInvalid(createErrors);
      return;
    }
    if (typeof newRestaurant.isPureVeg !== "boolean") {
      setCreateError("Choose whether your restaurant is Pure-veg or Veg/Non-veg.");
      return;
    }
    if (!newPin) {
      setCreateError("Place your restaurant on the map — it is how customers nearby find you.");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      // The pin the owner placed on the map is the GeoJSON point that powers "restaurants
      // near me". (The API still geocodes the address when a caller sends no point.)
      await ownerApi.createRestaurant({
        location: { type: "Point", coordinates: [newPin.lng, newPin.lat] },
        name: newRestaurant.name.trim(),
        isPureVeg: newRestaurant.isPureVeg,
        address: Object.fromEntries(
          Object.entries(newRestaurant.address).map(([k, v]) => [k, v.trim()]),
        ),
      });
      // Deliberately stays on this screen: the restaurant is created with
      // approvalStatus "pending", so /dashboard is locked (ApprovalGate) until
      // an admin approves it. Refreshing the context swaps this form for the
      // full settings form plus the "under review" notice.
      clearDraft(createDraftKey);
      await fetchRestaurants();
    } catch (err) {
      setCreateError(err.message ?? "Failed to create restaurant");
    } finally {
      setCreating(false);
    }
  }

  // The field contract is what this screen is built from, so there is nothing meaningful
  // to render — and nothing safe to save — until it has arrived.
  if (reqError) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">
          Failed to load the store settings form. Refresh the page to try again.
        </p>
      </DashboardLayout>
    );
  }
  if (reqLoading || !requirements) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Loading store settings…</p>
      </DashboardLayout>
    );
  }

  if (!restaurantId) {
    const setNew = (path, value) => {
      setNewRestaurant((r) => setByPath(r, path, value));
      setCreateError("");
    };

    return (
      <DashboardLayout>
        <div className="mx-auto w-full max-w-xl py-10">
          <ApprovalNotice className="mb-5" />
          <Card className="w-full">
            <CardHeader className="pb-4">
              <h2 className="text-lg font-bold">Add Your Restaurant</h2>
              <p className="text-sm text-muted-foreground">
                This is step one. Submitting these details sends your restaurant to the
                Yulo admin team for review — the rest of the portal (staff, menu, QR
                codes, offers, orders) unlocks only once they approve it.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} noValidate className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {createFields.map((field) => (
                    <div key={field.path} className={cn(field.createWide && "col-span-2")}>
                      <Field
                        label={field.label}
                        htmlFor={inputId(field.path)}
                        required={field.required}
                        error={createSubmitted ? createErrors[field.path] : undefined}
                      >
                        <Input
                          {...inputAttrs(field)}
                          value={(field.path.includes(".")
                            ? newRestaurant.address?.[leaf(field.path)]
                            : newRestaurant[field.path]) ?? ""}
                          onChange={(e) => setNew(field.path, applyInputRules(field, e.target.value))}
                          aria-invalid={createSubmitted && !!createErrors[field.path]}
                        />
                      </Field>
                    </div>
                  ))}
                </div>
                <Field
                  label="Food served"
                  required
                  error={createSubmitted && typeof newRestaurant.isPureVeg !== "boolean" ? "Choose Pure-veg or Veg/Non-veg" : undefined}
                >
                  <VegChoice
                    value={newRestaurant.isPureVeg}
                    onChange={(v) => setNew("isPureVeg", v)}
                    invalid={createSubmitted && typeof newRestaurant.isPureVeg !== "boolean"}
                  />
                </Field>
                <Field
                  label="Restaurant location on map"
                  required
                  error={createSubmitted && !newPin ? "Place the pin on your restaurant" : undefined}
                >
                  <LocationPicker
                    value={newPin}
                    onChange={(pin) => {
                      setNewPin(pin);
                      setCreateError("");
                    }}
                    address={newRestaurant.address}
                    invalid={createSubmitted && !newPin}
                  />
                </Field>
                <p className="text-xs text-muted-foreground">
                  Your restaurant goes to the Yulo admin team for review the moment you
                  submit — you can keep editing these details while you wait.
                  {draftNote ? <span className="ml-1 text-emerald-700">· {draftNote}</span> : null}
                </p>
                {createError && (
                  <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">{createError}</p>
                )}
                <Button
                  type="submit"
                  disabled={creating}
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
  // a value has actually persisted — which, now that all three are mandatory, means the
  // first successful save is what closes it.
  const savedSettings = serverSettings?.settings ?? {};
  const sectionLocked = (name) =>
    spec.section(name).some((f) => !!savedSettings[leaf(f.path)]);
  const businessLocked = sectionLocked("business");
  const licensesLocked = sectionLocked("licenses");

  const profile = (path) => spec.get(path);
  const bind = (path) => ({
    label: profile(path)?.label ?? "",
    required: !!profile(path)?.required,
    htmlFor: inputId(path),
    error: errorFor(path),
    help: profile(path)?.help,
  });

  // One text/date/number input, wired to the descriptor that describes it. A path the
  // server didn't describe renders nothing rather than crashing the screen.
  const renderInput = (field) =>
    !field ? null : (
    <Input
      {...inputAttrs(field)}
      value={
        field.path.startsWith("settings.")
          ? form.settings[leaf(field.path)]
          : field.path.startsWith("delivery.")
            ? form.delivery[leaf(field.path)]
            : field.path.startsWith("address.")
              ? form.address[leaf(field.path)]
              : form[field.path]
      }
      onChange={onInput(field)}
      onBlur={() => setTouched((t) => ({ ...t, [field.path]: true }))}
      aria-invalid={!!errorFor(field.path)}
      className={cn(field.transform === "uppercase" && "uppercase tracking-widest")}
    />
    );

  // A card of descriptors — Business Details, Licenses & Tax, Delivery Logistics — laid
  // out from the contract rather than from a hand-written list that has to be kept in
  // step with it.
  // A locked section still lets the GST number be filled in when it was never saved and the
  // restaurant has just said it is GST-registered — otherwise the toggle could never be
  // turned on for a store whose other licence details are already on file.
  const fieldLocked = (field, locked) =>
    locked &&
    !(field.path === "settings.gstNumber" && form.gstRegistered && !savedSettings.gstNumber) &&
    // A partnership saved before partner names existed can still add them, once.
    !(field.path === "settings.partnerNames" && !(savedSettings.partnerNames ?? []).length);
  // A field shown only while another holds a value (partner names → a partnership).
  const fieldShown = (field) => !field.showWhen || getByPath(form, field.showWhen.path) === field.showWhen.equals;
  const renderSection = (name, { locked = false } = {}) =>
    spec.section(name).filter(fieldShown).map((field) => (
      <div key={field.path} className={cn(field.wide && "sm:col-span-2")}>
        {fieldLocked(field, locked) ? (
          <LockedField
            label={field.label}
            value={
              Array.isArray(form.settings[leaf(field.path)])
                ? form.settings[leaf(field.path)].join(", ")
                : form.settings[leaf(field.path)]
            }
          />
        ) : (
          <Field
            label={field.label}
            htmlFor={inputId(field.path)}
            required={field.required}
            error={errorFor(field.path)}
            help={field.help}
          >
            {field.path === "settings.partnerNames" ? (
              <PartnerNamesEditor
                field={field}
                value={form.settings.partnerNames}
                onChange={(names) => setField(field.path, names)}
                invalid={!!errorFor(field.path)}
              />
            ) : field.type === "select" ? (
              <SelectField
                field={field}
                value={form.settings[leaf(field.path)]}
                onChange={(value) => setField(field.path, value)}
                invalid={!!errorFor(field.path)}
              />
            ) : (
              renderInput(field)
            )}
          </Field>
        )}
      </div>
    ));

  const brandLimits = requirements.brandImage;

  return (
    <DashboardLayout>
      <div className="pb-20">
        <div className="mb-5">
          <h1 className="text-2xl font-bold">Store Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your restaurant profile, hours, delivery, and compliance details.
            Fields marked <span className="font-semibold text-brand-maroon">*</span> are
            required — changes can&apos;t be saved until each one holds a valid value.
          </p>
        </div>

        {/* Locked states explain themselves here; an approved one confirms itself. */}
        <ApprovalNotice className="mb-5" />

        {/* Restaurant info + brand assets */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.7fr_1fr]">
          <Card>
            <CardHeader className="pb-4">
              <h2 className="text-base font-bold">Restaurant Information</h2>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field {...bind("name")}>{renderInput(profile("name"))}</Field>
              <Field {...bind("cuisineTypes")}>
                <CuisineEditor
                  field={profile("cuisineTypes")}
                  value={form.cuisineTypes}
                  onChange={(cuisineTypes) => setField("cuisineTypes", cuisineTypes)}
                />
              </Field>
              <Field {...bind("email")}>{renderInput(profile("email"))}</Field>
              <Field {...bind("phone")}>{renderInput(profile("phone"))}</Field>
              <Field {...bind("establishedYear")}>{renderInput(profile("establishedYear"))}</Field>
              <div className="sm:col-span-2">
                <Field {...bind("description")}>{renderInput(profile("description"))}</Field>
              </div>
              <div className="sm:col-span-2">
                <Field {...bind("address.street")}>{renderInput(profile("address.street"))}</Field>
              </div>
              <Field {...bind("address.city")}>{renderInput(profile("address.city"))}</Field>
              <div className="grid grid-cols-2 gap-4">
                <Field {...bind("address.state")}>{renderInput(profile("address.state"))}</Field>
                <Field {...bind("address.pincode")}>{renderInput(profile("address.pincode"))}</Field>
              </div>
              <p className="text-[11px] text-muted-foreground sm:col-span-2">
                Changing the address re-places your restaurant on the map, so customers
                searching nearby find you at the new location. A pin saved with "Use my
                current location" stays until the address itself changes.
              </p>
              <div className="sm:col-span-2">
                <MapPlacement restaurant={serverSettings} restaurantId={restaurantId} />
              </div>
              <div className="sm:col-span-2">
                <Field label="Food served">
                  <VegSetting
                    restaurant={serverSettings}
                    restaurantId={restaurantId}
                    onSaved={(saved) => saved && updateRestaurant(saved)}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <h2 className="text-base font-bold">Brand Assets</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <BrandImagePicker
                field={profile("logo")}
                limits={brandLimits}
                icon={ImageUp}
                fit="object-contain"
                file={logoFile}
                currentUrl={serverSettings?.logo}
                onPick={setLogoFile}
                onError={(text) => setStatus(text ? { tone: "error", text } : null)}
              />
              <BrandImagePicker
                field={profile("bannerImage")}
                limits={brandLimits}
                icon={ImagePlus}
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
            {errorFor("hours") ? (
              <p role="alert" className="text-[11px] text-brand-maroon">
                {errorFor("hours")}
              </p>
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
            {spec.section("delivery").map((field) => (
              <Field
                key={field.path}
                label={field.label}
                htmlFor={inputId(field.path)}
                required={field.required}
                error={errorFor(field.path)}
                help={field.help}
              >
                {renderInput(field)}
              </Field>
            ))}
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
              {renderSection("business", { locked: businessLocked })}
              {!businessLocked && (
                <p className="text-[11px] text-muted-foreground sm:col-span-2">
                  Required. These name the legal entity your store trades as, and admin
                  reviews your application against them. Once saved they can only be
                  changed by platform support.
                </p>
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
              {spec.section("tax").map((field) => (
                <div
                  key={field.path}
                  className="flex items-start justify-between gap-4 rounded-lg border border-brand-cream/80 bg-brand-page px-4 py-3 sm:col-span-2"
                >
                  <div>
                    <Label htmlFor={inputId(field.path)} className="text-sm font-semibold">
                      {field.label}
                    </Label>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{field.help}</p>
                    <p
                      className={cn(
                        "mt-1.5 text-xs font-medium",
                        form.gstRegistered ? "text-brand-green" : "text-muted-foreground",
                      )}
                    >
                      {form.gstRegistered
                        ? "Food GST is charged on your orders."
                        : "No food GST is charged on your orders."}
                    </p>
                  </div>
                  <Switch
                    id={inputId(field.path)}
                    checked={!!form.gstRegistered}
                    onCheckedChange={(on) => setField(field.path, on)}
                    aria-label={field.label}
                  />
                </div>
              ))}
              {renderSection("licenses", { locked: licensesLocked })}
              {!licensesLocked && (
                <p className="text-[11px] text-muted-foreground sm:col-span-2">
                  These identify the legal entity behind your store. Once saved they can
                  only be changed by platform support.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {spec.section("billing").length > 0 ? (
          <Card className="mt-5">
            <CardHeader className="pb-4">
              <h2 className="text-base font-bold">Dine-in Billing</h2>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">{renderSection("billing")}</CardContent>
          </Card>
        ) : null}

        {/* The payout bank account has its own page — it isn't part of this form's save. */}
        <Link
          to="/payments/settings"
          className="mt-5 flex items-center gap-3 rounded-xl border border-brand-cream bg-white px-5 py-4 transition-colors hover:bg-brand-page"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-orange/10 text-brand-orange">
            <Landmark className="h-5 w-5" />
          </span>
          <span className="flex-1">
            <span className="block text-sm font-bold">Bank &amp; payout settings</span>
            <span className="block text-xs text-muted-foreground">
              The account your weekly payouts are sent to, and your payout schedule.
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>

        {/* The scans behind the numbers above — uploaded individually, reviewed individually. */}
        <ComplianceDocuments restaurantId={restaurantId} className="mt-5" />
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
          {status ? status.text : dirty ? `● You have unsaved changes${draftNote ? ` · ${draftNote.toLowerCase()}` : ""}` : "All changes saved"}
        </span>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={discard} disabled={!dirty || saving}>
            Discard Changes
          </Button>
          {/* Left enabled while the form is invalid on purpose: a disabled button explains
              nothing, and the point of the required-field rule is that pressing Save is
              what tells the owner which details are still missing. */}
          <Button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="bg-brand-gradient px-6 text-white hover:brightness-105"
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={!!pendingCharges}
        title="Change what customers are charged?"
        confirmLabel="Save changes"
        pendingLabel="Saving…"
        pending={saving}
        onConfirm={confirmCharges}
        onCancel={() => setPendingCharges(null)}
      >
        <ul className="space-y-1">
          {(pendingCharges ?? []).map((c) => (
            <li key={c.path}>
              <span className="font-semibold text-foreground">{c.label}:</span> {c.before} →{" "}
              <span className="font-semibold text-foreground">{c.after}</span>
            </li>
          ))}
        </ul>
        <p>
          Orders placed after you save are charged with these settings. Check the amounts
          before you confirm.
        </p>
      </ConfirmDialog>
    </DashboardLayout>
  );
}
