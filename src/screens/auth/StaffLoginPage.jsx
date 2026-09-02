import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ChefHat,
  Delete,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Navigation,
  Search,
  UtensilsCrossed,
  X,
} from "lucide-react";

import { homeRouteForRole, useStaffAuth } from "@/context/StaffAuthContext";
import {
  useGeolocation,
  useRestaurantSuggestions,
} from "@/hooks/staff/useRestaurantPicker";

/* ─────────────────────────────────────────────────────────────────────────
   Staff login (/staff/login)

   Two steps, because a staff code is only unique inside one restaurant
   (server/models/StaffMember.js) — the restaurant has to be settled before the
   credentials mean anything.

     1. Pick the restaurant  — typeahead over GET /api/staff/auth/restaurants,
                                ranked by distance from the device when the
                                browser will share a location.
     2. Staff code + PIN     — exactly the credentials the owner issued in the
                                restaurant portal (/staff). Nothing here is
                                seeded, guessed or hard-coded.
   ───────────────────────────────────────────────────────────────────────── */

// The shared tablet on the pass is the normal case, so the restaurant and the
// last staff code are remembered to save retyping at the start of every shift.
// The PIN is never stored — it is the only secret in the pair.
const LAST_KEY = "yulo_staff_last_login";

function readLast() {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? "null");
  } catch {
    return null;
  }
}

function rememberLast(restaurant, staffCode) {
  try {
    localStorage.setItem(
      LAST_KEY,
      JSON.stringify({
        restaurant: {
          _id: restaurant._id,
          name: restaurant.name,
          logo: restaurant.logo ?? null,
          address: restaurant.address ?? {},
        },
        staffCode,
      }),
    );
  } catch {
    /* private mode — the form just starts empty next time */
  }
}

// Owner-issued codes are W## for waiters and C## for chefs
// (server/controllers/owner/staff.controller.js). Echoing the role back as the
// code is typed catches a chef reaching for the waiter tablet before they have
// spent an attempt on the rate limiter.
function roleFromCode(code) {
  const first = code.trim().charAt(0).toUpperCase();
  if (first === "W") return "waiter";
  if (first === "C") return "chef";
  return null;
}

function formatDistance(km) {
  if (km == null) return null;
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function addressLine(address) {
  return [address?.street, address?.city].filter(Boolean).join(", ") || null;
}

// The server's messages are already written for staff; these only cover the
// cases where the raw wording would leave someone stuck on the screen.
function loginErrorMessage(err) {
  switch (err?.code) {
    case "INVALID_CREDENTIALS":
      return "That staff code and PIN don't match. Check them with your manager.";
    case "RATE_LIMITED":
      return "Too many attempts. Wait a minute before trying again.";
    case "VALIDATION_ERROR":
      return "Enter your staff code and a 4–8 digit PIN.";
    default:
      if (err?.status === undefined)
        return "Can't reach the server. Check the connection and try again.";
      return err?.message ?? "Login failed. Please try again.";
  }
}

/* ── Brand mark ───────────────────────────────────────────────────────── */

function Wordmark({ className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className="grid h-8 w-8 place-items-center rounded-[10px] shadow-lg shadow-black/40"
        style={{ background: "linear-gradient(135deg, #A4161A, #D9480F)" }}
      >
        <UtensilsCrossed className="h-4 w-4 text-white" strokeWidth={2.5} />
      </div>
      <span className="text-[17px] font-bold tracking-tight text-white">Yulo Stores</span>
    </div>
  );
}

/* ── Restaurant avatar ────────────────────────────────────────────────── */

function RestaurantMark({ restaurant, size = 40 }) {
  const [broken, setBroken] = useState(false);
  const initials = (restaurant.name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  if (restaurant.logo && !broken) {
    return (
      <img
        src={restaurant.logo}
        alt=""
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-xl object-cover ring-1 ring-white/10"
      />
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #A4161A, #D9480F)",
      }}
      className="grid shrink-0 place-items-center rounded-xl text-[13px] font-bold text-white"
    >
      {initials}
    </span>
  );
}

/* ── Location status chip ─────────────────────────────────────────────── */

function LocationChip({ status, nearby, onRetry }) {
  const map = {
    locating: { text: "Finding restaurants near you…", tone: "muted", spin: true },
    ready: {
      text: nearby ? "Sorted by distance from you" : "Location ready",
      tone: "ok",
    },
    denied: { text: "Location off — searching by name", tone: "muted", action: "Enable" },
    unavailable: { text: "Couldn't get your location", tone: "muted", action: "Retry" },
    unsupported: { text: "Searching by name", tone: "muted" },
  };
  const s = map[status] ?? map.unsupported;

  return (
    <div className="mt-2.5 flex items-center gap-1.5 text-[11px]">
      {s.spin ? (
        <Loader2 className="h-3 w-3 animate-spin text-[#8a6f5a]" />
      ) : (
        <Navigation
          className={`h-3 w-3 ${s.tone === "ok" ? "text-[#F2A65A]" : "text-[#6b503b]"}`}
          fill={s.tone === "ok" ? "currentColor" : "none"}
        />
      )}
      <span className={s.tone === "ok" ? "text-[#F2A65A]" : "text-[#8a6f5a]"}>{s.text}</span>
      {s.action && (
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold text-[#F2A65A] underline-offset-2 hover:underline"
        >
          {s.action}
        </button>
      )}
    </div>
  );
}

/* ── Step 1 — restaurant combobox ─────────────────────────────────────── */

function RestaurantStep({ onSelect, remembered, onForgetRemembered }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const { coords, status: geoStatus, retry } = useGeolocation();
  const { results, loading, error, nearby, minQuery } = useRestaurantSuggestions(query, coords);

  const inputRef = useRef(null);
  const listRef = useRef(null);
  const wrapRef = useRef(null);
  const listboxId = "staff-restaurant-listbox";

  // Reset the highlight whenever the underlying list changes, or Enter would fire
  // on whichever row happens to sit at the previous index.
  useEffect(() => setActive(0), [results]);

  // Click-away closes the dropdown but keeps the typed query.
  useEffect(() => {
    function onPointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Keep the highlighted row inside the scroll box while arrowing through it.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const showList = open && query.trim().length >= minQuery;

  function handleKeyDown(e) {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (results[active]) {
        e.preventDefault();
        onSelect(results[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div>
      <label
        htmlFor="staff-restaurant"
        className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a6f5a]"
      >
        Your restaurant
      </label>

      <div ref={wrapRef} className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#6b503b]" />
        <input
          id="staff-restaurant"
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Start typing the name…"
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && results[active] ? `staff-restaurant-opt-${results[active]._id}` : undefined
          }
          className="w-full rounded-2xl border border-[#3A2515] bg-[#150E07] py-[15px] pl-12 pr-11 text-[15px] text-white placeholder-[#6b503b] outline-none transition focus:border-[#D9480F] focus:ring-4 focus:ring-[#D9480F]/15"
        />

        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-3.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-[#6b503b] transition hover:bg-white/5 hover:text-[#F2A65A]"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        )}

        {showList && (
          <div
            className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-[#3A2515] bg-[#221609] shadow-2xl shadow-black/60"
            role="presentation"
          >
            <ul
              id={listboxId}
              ref={listRef}
              role="listbox"
              aria-label="Restaurant suggestions"
              className="max-h-[min(46vh,320px)] overflow-y-auto overscroll-contain"
            >
              {results.map((r, i) => {
                const distance = formatDistance(r.distanceKm);
                const line = addressLine(r.address);
                return (
                  <li key={r._id} role="none">
                    <button
                      id={`staff-restaurant-opt-${r._id}`}
                      role="option"
                      aria-selected={i === active}
                      data-active={i === active}
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => onSelect(r)}
                      className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition ${
                        i === active ? "bg-[#33210f]" : "hover:bg-[#2b1c0d]"
                      }`}
                    >
                      <RestaurantMark restaurant={r} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-white">
                          {r.name}
                        </span>
                        {line && (
                          <span className="mt-0.5 block truncate text-[12px] text-[#8a6f5a]">
                            {line}
                          </span>
                        )}
                      </span>
                      {distance && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#F2A65A]/10 px-2 py-1 text-[11px] font-semibold text-[#F2A65A]">
                          <MapPin className="h-3 w-3" />
                          {distance}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}

              {!loading && !error && results.length === 0 && (
                <li className="px-4 py-6 text-center" role="none">
                  <p className="text-[13px] text-[#8a6f5a]">
                    No approved restaurant matches “{query.trim()}”.
                  </p>
                  <p className="mt-1 text-[12px] text-[#6b503b]">
                    Ask your manager to confirm the store name.
                  </p>
                </li>
              )}

              {loading && results.length === 0 && (
                <li className="flex items-center gap-2.5 px-4 py-5 text-[13px] text-[#8a6f5a]" role="none">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching…
                </li>
              )}

              {error && (
                <li className="px-4 py-5 text-[13px] text-red-300" role="none">
                  Couldn&apos;t load restaurants. Check your connection.
                </li>
              )}
            </ul>

            {nearby && results.length > 0 && (
              <p className="border-t border-[#3A2515] bg-[#1b1108] px-4 py-2 text-[11px] text-[#6b503b]">
                Nearest first, based on your location
              </p>
            )}
          </div>
        )}
      </div>

      <LocationChip status={geoStatus} nearby={nearby} onRetry={retry} />

      {remembered && !query && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6b503b]">
            Last used
          </p>
          <div className="flex items-center gap-3 rounded-2xl border border-[#3A2515] bg-[#1b1108] p-2.5">
            <RestaurantMark restaurant={remembered.restaurant} size={36} />
            <button
              type="button"
              onClick={() => onSelect(remembered.restaurant, remembered.staffCode)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-[14px] font-semibold text-white">
                {remembered.restaurant.name}
              </span>
              <span className="block truncate text-[12px] text-[#8a6f5a]">
                Continue as {remembered.staffCode}
              </span>
            </button>
            <button
              type="button"
              aria-label="Forget this restaurant"
              onClick={onForgetRemembered}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#6b503b] transition hover:bg-white/5 hover:text-[#F2A65A]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── PIN keypad (touch devices) ───────────────────────────────────────── */

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

function Keypad({ onDigit, onBackspace, disabled }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="PIN keypad">
      {KEYPAD.map((key, i) =>
        key === "" ? (
          <span key={i} />
        ) : (
          <button
            key={i}
            type="button"
            disabled={disabled}
            aria-label={key === "del" ? "Delete last digit" : key}
            onClick={() => (key === "del" ? onBackspace() : onDigit(key))}
            className="grid h-12 place-items-center rounded-xl border border-[#3A2515] bg-[#1b1108] text-[17px] font-semibold text-white transition active:scale-95 active:bg-[#33210f] disabled:opacity-40"
          >
            {key === "del" ? <Delete className="h-4 w-4 text-[#8a6f5a]" /> : key}
          </button>
        ),
      )}
    </div>
  );
}

// A physical keyboard makes the on-screen keypad noise; a tablet on the pass
// makes it the fastest way in. Decided once, from the pointer type.
function useCoarsePointer() {
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(pointer: coarse)");
    if (!mq) return undefined;
    const onChange = (e) => setCoarse(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return coarse;
}

/* ── Step 2 — credentials ─────────────────────────────────────────────── */

const PIN_MAX = 8;

function CredentialsStep({
  restaurant,
  staffCode,
  setStaffCode,
  pin,
  setPin,
  onBack,
  onSubmit,
  loading,
  error,
}) {
  const [reveal, setReveal] = useState(false);
  const coarse = useCoarsePointer();
  const codeRef = useRef(null);
  const pinRef = useRef(null);

  useEffect(() => {
    // Land on whichever field is still empty — a remembered code means the
    // returning waiter only has to enter the PIN.
    (staffCode ? pinRef : codeRef).current?.focus();
    // Only on mount: refocusing on every keystroke would fight the caret.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const role = roleFromCode(staffCode);
  const canSubmit = staffCode.trim().length >= 2 && pin.length >= 4 && !loading;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      {/* Selected restaurant */}
      <div className="flex items-center gap-3 rounded-2xl border border-[#3A2515] bg-[#1b1108] p-3">
        <RestaurantMark restaurant={restaurant} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-white">{restaurant.name}</p>
          {addressLine(restaurant.address) && (
            <p className="truncate text-[12px] text-[#8a6f5a]">{addressLine(restaurant.address)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#F2A65A] transition hover:bg-white/5"
        >
          Change
        </button>
      </div>

      {/* Staff code */}
      <div>
        <label
          htmlFor="staff-code"
          className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a6f5a]"
        >
          Staff code
          {role && (
            <span className="flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-[#F2A65A]">
              {role === "chef" ? (
                <ChefHat className="h-3 w-3" />
              ) : (
                <UtensilsCrossed className="h-3 w-3" />
              )}
              {role === "chef" ? "Chef" : "Waiter"}
            </span>
          )}
        </label>
        <input
          id="staff-code"
          ref={codeRef}
          value={staffCode}
          onChange={(e) => setStaffCode(e.target.value.replace(/\s+/g, "").toUpperCase().slice(0, 10))}
          placeholder="W01"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="w-full rounded-2xl border border-[#3A2515] bg-[#150E07] px-4 py-[15px] font-mono text-[16px] tracking-[0.2em] text-white placeholder-[#4a3524] outline-none transition focus:border-[#D9480F] focus:ring-4 focus:ring-[#D9480F]/15"
        />
        <p className="mt-1.5 text-[11px] text-[#6b503b]">
          Issued by your manager in the restaurant portal.
        </p>
      </div>

      {/* PIN */}
      <div>
        <label
          htmlFor="staff-pin"
          className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8a6f5a]"
        >
          PIN
        </label>
        <div className="relative">
          <input
            id="staff-pin"
            ref={pinRef}
            type={reveal ? "text" : "password"}
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_MAX))}
            placeholder="••••"
            className="w-full rounded-2xl border border-[#3A2515] bg-[#150E07] px-4 py-[15px] pr-12 text-center text-[20px] tracking-[0.55em] text-white placeholder-[#4a3524] outline-none transition focus:border-[#D9480F] focus:ring-4 focus:ring-[#D9480F]/15"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={reveal ? "Hide PIN" : "Show PIN"}
            onClick={() => setReveal((v) => !v)}
            className="absolute right-3.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[#6b503b] transition hover:bg-white/5 hover:text-[#8a6f5a]"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {coarse && (
          <div className="mt-3">
            <Keypad
              disabled={loading}
              onDigit={(d) => setPin((p) => (p.length >= PIN_MAX ? p : p + d))}
              onBackspace={() => setPin((p) => p.slice(0, -1))}
            />
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-[13px] leading-relaxed text-red-300">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-[15px] text-[15px] font-bold text-white shadow-lg shadow-[#A4161A]/20 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        style={{ background: "linear-gradient(90deg, #A4161A 0%, #D9480F 100%)" }}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Starting your shift…" : "Start shift"}
      </button>
    </form>
  );
}

const HIGHLIGHTS = [
  {
    icon: ChefHat,
    title: "Chefs",
    body: "Live kitchen display, ticket queue and prep status.",
    tint: "#D9480F",
  },
  {
    icon: UtensilsCrossed,
    title: "Waiters",
    body: "Table sessions, order taking and bill settlement.",
    tint: "#2E7D32",
  },
];

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function StaffLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, staff, ready } = useStaffAuth();

  const [remembered, setRemembered] = useState(readLast);
  const [restaurant, setRestaurant] = useState(null);
  const [staffCode, setStaffCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Where to land after a successful sign in: back to the screen that bounced
  // them here, as long as it belongs to their role.
  const from = location.state?.from;

  // Already signed in (a bookmarked /staff/login, or a second tab) — the form
  // would only be a dead end.
  useEffect(() => {
    if (ready && staff) navigate(homeRouteForRole(staff.role), { replace: true });
  }, [ready, staff, navigate]);

  function selectRestaurant(next, presetCode) {
    setRestaurant(next);
    setStaffCode(presetCode ?? "");
    setPin("");
    setError("");
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      const profile = await login({ restaurantId: restaurant._id, staffCode, pin });
      rememberLast(restaurant, profile.staffCode);
      const home = homeRouteForRole(profile.role);
      const target = from && from.startsWith(home) ? from : home;
      navigate(target, { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
      setPin("");
      setLoading(false);
    }
  }

  const step = restaurant ? 2 : 1;

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#140D06] font-sans">
      {/* Ambient warmth — decorative, never intercepts a tap. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-[420px] w-[420px] rounded-full opacity-30 blur-[110px]"
        style={{ background: "radial-gradient(circle, #A4161A 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-32 h-[460px] w-[460px] rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle, #D9480F 0%, transparent 70%)" }}
      />

      <div className="relative flex min-h-[100dvh] flex-col lg:flex-row">
        {/* ── Brand panel (desktop) ── */}
        <aside className="hidden w-[46%] max-w-[560px] flex-col justify-between border-r border-white/5 bg-gradient-to-b from-[#231809]/80 to-[#160E06]/80 p-12 backdrop-blur-sm lg:flex">
          <Wordmark />

          <div>
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#F2A65A]">
              Staff Portal
            </p>
            <h2 className="text-[34px] font-bold leading-[1.2] text-white">
              Ready for
              <br />
              <span className="text-[#F2A65A]">your shift?</span>
            </h2>
            <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-white/40">
              Sign in with the staff code and PIN your restaurant issued you. Your workspace
              opens straight to the floor you work.
            </p>

            <div className="mt-9 space-y-3">
              {HIGHLIGHTS.map(({ icon: Icon, title, body, tint }) => (
                <div
                  key={title}
                  className="flex items-start gap-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5"
                >
                  <span
                    className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                    style={{ background: `${tint}26` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: tint === "#2E7D32" ? "#7BC47F" : "#F2A65A" }} />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-white">{title}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-white/35">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-white/20">© 2025 Yulo Stores</p>
        </aside>

        {/* ── Form panel ── */}
        <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[400px]">
            <Wordmark className="mb-8 justify-center lg:hidden" />

            <div className="mb-6">
              <div className="mb-3 flex items-center gap-2.5">
                {step === 2 && (
                  <button
                    type="button"
                    onClick={() => selectRestaurant(null)}
                    aria-label="Back to restaurant search"
                    className="grid h-8 w-8 place-items-center rounded-full border border-[#3A2515] text-[#8a6f5a] transition hover:bg-white/5 hover:text-white"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                <div className="flex items-center gap-1.5" aria-hidden>
                  <span
                    className={`h-1 rounded-full transition-all ${
                      step === 1 ? "w-6 bg-[#F2A65A]" : "w-3 bg-[#3A2515]"
                    }`}
                  />
                  <span
                    className={`h-1 rounded-full transition-all ${
                      step === 2 ? "w-6 bg-[#F2A65A]" : "w-3 bg-[#3A2515]"
                    }`}
                  />
                </div>
              </div>

              <h1 className="text-[26px] font-bold leading-tight text-white">
                {step === 1 ? "Staff login" : "Welcome back"}
              </h1>
              <p className="mt-1.5 text-[13.5px] text-[#8a6f5a]">
                {step === 1
                  ? "Find your restaurant to get started."
                  : "Enter the staff code and PIN your manager gave you."}
              </p>
            </div>

            <div className="rounded-3xl border border-[#3A2515] bg-[#20150B]/90 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-7">
              {step === 1 ? (
                <RestaurantStep
                  onSelect={selectRestaurant}
                  remembered={remembered}
                  onForgetRemembered={() => {
                    localStorage.removeItem(LAST_KEY);
                    setRemembered(null);
                  }}
                />
              ) : (
                <CredentialsStep
                  restaurant={restaurant}
                  staffCode={staffCode}
                  setStaffCode={setStaffCode}
                  pin={pin}
                  setPin={setPin}
                  onBack={() => selectRestaurant(null)}
                  onSubmit={handleSubmit}
                  loading={loading}
                  error={error}
                />
              )}
            </div>

            <p className="mt-6 text-center text-[12px] text-[#6b503b]">
              Restaurant owner?{" "}
              <a
                href="/owner/login"
                className="font-semibold text-[#F2A65A] underline-offset-2 hover:underline"
              >
                Owner portal →
              </a>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
