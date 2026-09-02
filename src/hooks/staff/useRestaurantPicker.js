import { useCallback, useEffect, useState } from "react";
import { authApi } from "@/api/auth.api";

// The restaurant picker on the staff login screen.
//
// Two hooks, kept apart because they fail independently: location can be denied
// while search works fine, and the screen has to stay usable in that case.

const GEO_KEY = "yulo_staff_geo";
// A staff member logs in from the restaurant they work at, so yesterday's fix is
// still the right one this morning. Reusing it means the very first keystroke of
// the day is already distance-ranked instead of waiting on the GPS prompt.
const GEO_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function readCachedCoords() {
  try {
    const raw = JSON.parse(localStorage.getItem(GEO_KEY) ?? "null");
    if (!raw || Date.now() - raw.at > GEO_MAX_AGE_MS) return null;
    return { lat: raw.lat, lng: raw.lng };
  } catch {
    return null;
  }
}

/**
 * Browser geolocation, asked for once on mount.
 *
 * status: "unsupported" | "locating" | "ready" | "denied" | "unavailable"
 * A denial is not an error path — it only means suggestions fall back to
 * name ranking instead of distance ranking.
 */
export function useGeolocation() {
  const [coords, setCoords] = useState(readCachedCoords);
  const [status, setStatus] = useState(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return "unsupported";
    return readCachedCoords() ? "ready" : "locating";
  });

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("unsupported");
      return;
    }
    setStatus((s) => (s === "ready" ? s : "locating"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(next);
        setStatus("ready");
        try {
          localStorage.setItem(GEO_KEY, JSON.stringify({ ...next, at: Date.now() }));
        } catch {
          /* private mode — in-memory coords are enough for this session */
        }
      },
      (err) => {
        // PERMISSION_DENIED is a decision, everything else (timeout, no fix) is a
        // condition that may pass — the UI words them differently.
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      // A rough fix is plenty for "which of these branches is nearest", and asking
      // for a precise one costs battery and seconds indoors, where staff are.
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  return { coords, status, retry: locate };
}

const DEBOUNCE_MS = 220;
// One character is the point of the feature: a staff member types "t" and their own
// restaurant is already at the top because the server ranks by distance.
const MIN_QUERY = 1;

/**
 * Debounced, abortable restaurant typeahead.
 *
 * Every keystroke aborts the request in flight, so a slow reply for "tan" can never
 * land after the fast reply for "tandoor" and repopulate the list with stale rows.
 */
export function useRestaurantSuggestions(query, coords) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nearby, setNearby] = useState(false);

  useEffect(() => {
    const term = query.trim();

    if (term.length < MIN_QUERY) {
      setResults([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();

    const timer = setTimeout(() => {
      authApi
        .staffRestaurantSearch({
          q: term,
          lat: coords?.lat,
          lng: coords?.lng,
          signal: controller.signal,
        })
        .then(({ data }) => {
          setResults(data.data.restaurants ?? []);
          setNearby(Boolean(data.data.nearby));
          setLoading(false);
        })
        .catch((err) => {
          // An abort is this hook superseding itself, not a failure to report.
          if (controller.signal.aborted || err.code === "ERR_CANCELED") return;
          setError(err);
          setResults([]);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, coords?.lat, coords?.lng]);

  return { results, loading, error, nearby, minQuery: MIN_QUERY };
}
