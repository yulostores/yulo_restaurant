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
import { ChevronDown, ImagePlus, ImageUp, Lock, X } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  buildSettingsFormData,
  useDeliverySettings,
  useHours,
  useSettings,
  useSettingsRequirements,
  useUpdateDelivery,
  useUpdateHours,
  useUpdateSettings,
} from "@/hooks/owner/useSettings";
import { ownerApi } from "@/api/owner.api";
import { catalogApi } from "@/api/catalog.api";
import DashboardLayout from "@/components/DashboardLayout";
import ApprovalNotice from "@/components/ApprovalNotice";
import ComplianceDocuments from "@/components/ComplianceDocuments";
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
  indexFields,
  inputId,
  setByPath,
  validateFields,
} from "@/lib/fieldRules";

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

function Field({ label, htmlFor, error, required, children }) {
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
function CuisineEditor({ field, value, onChange }) {
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
  const compliance = [...spec.section("business"), ...spec.section("licenses")];

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
    settings: Object.fromEntries(
      compliance.map((f) => {
        const key = leaf(f.path);
        const raw = restaurant.settings?.[key];
        return [key, f.type === "date" ? toDateInput(raw) : raw ?? ""];
      }),
    ),
  };
}

export default function StoreSettings() {
  const { restaurantId, fetchRestaurants, updateRestaurant } = useOwnerAuth();
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

  // create-restaurant form (used when restaurantId is null)
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSubmitted, setCreateSubmitted] = useState(false);
  const [newRestaurant, setNewRestaurant] = useState({ name: "", address: {} });

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
    setForm(seeded);
    setOriginal(JSON.stringify(seeded));
  }, [serverSettings, serverHours, serverDelivery, requirements, spec, dirty]);

  // Every rule in the contract, run against the object that is about to be sent — so what
  // is validated is exactly what is saved.
  const errors = useMemo(() => {
    if (!form || !requirements) return {};
    const found = validateFields(spec.all, form);
    // An open day with a blank time would otherwise post 00:00, silently marking the
    // restaurant open from midnight. Hours are a table, not a field, so this one rule
    // can't be expressed as a per-field descriptor.
    if (form.hours.some((h) => h.isOpen && (!h.open || !h.close))) {
      found.hours = requirements.hours.incompleteMessage;
    }
    return found;
  }, [form, requirements, spec]);

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
          settings: form.settings,
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
    setCreating(true);
    setCreateError("");
    try {
      // No coordinates sent: the server geocodes this address into the GeoJSON point
      // that powers "restaurants near me" (services/geocode.service.js), and answers
      // 400 ADDRESS_NOT_FOUND if the address can't be placed on the map.
      await ownerApi.createRestaurant({
        name: newRestaurant.name.trim(),
        address: Object.fromEntries(
          Object.entries(newRestaurant.address).map(([k, v]) => [k, v.trim()]),
        ),
      });
      // Deliberately stays on this screen: the restaurant is created with
      // approvalStatus "pending", so /dashboard is locked (ApprovalGate) until
      // an admin approves it. Refreshing the context swaps this form for the
      // full settings form plus the "under review" notice.
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
        <div className="mx-auto w-full max-w-md py-10">
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
                <p className="text-xs text-muted-foreground">
                  We place your restaurant on the map from this address, so customers
                  nearby can find you — the state and pincode are what make that match
                  accurate. Your restaurant goes to the Yulo admin team for review the
                  moment you submit — you can keep editing these details while you wait.
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
  const renderSection = (name, { locked = false } = {}) =>
    spec.section(name).map((field) => (
      <div key={field.path} className={cn(field.wide && "sm:col-span-2")}>
        {locked ? (
          <LockedField label={field.label} value={form.settings[leaf(field.path)]} />
        ) : (
          <Field
            label={field.label}
            htmlFor={inputId(field.path)}
            required={field.required}
            error={errorFor(field.path)}
          >
            {field.type === "select" ? (
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
              <Field {...bind("website")}>{renderInput(profile("website"))}</Field>
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
          {status ? status.text : dirty ? "● You have unsaved changes" : "All changes saved"}
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
    </DashboardLayout>
  );
}
