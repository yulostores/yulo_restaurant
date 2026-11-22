// The restaurant's exact spot, picked on a map. Customers within the discovery radius of this
// point see the restaurant, so the pin is worth getting right: the owner can jump to the
// address they typed, use the device's location, then click the map or drag the pin to the
// entrance.
//
// Tiles: OpenStreetMap by default (no key). Set VITE_MAP_TILE_URL (+ VITE_MAP_ATTRIBUTION) to
// use another provider, e.g. HERE's raster tiles that the customer app uses.

import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LocateFixed, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ownerApi } from "@/api/owner.api";
import { getCurrentPosition } from "@/hooks/owner/useSettings";
import { cn } from "@/lib/utils";

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const INDIA = [22.5, 79];
const PIN_ZOOM = 17;

// A CSS pin rather than Leaflet's default PNG marker, whose image paths break under Vite.
const pinIcon = L.divIcon({
  className: "",
  html: '<div class="yulo-map-pin"><span></span></div>',
  iconSize: [30, 30],
  // The rotated square's point sits ~6 px below its box (15·√2 − 15).
  iconAnchor: [15, 36],
});

function ClickToPlace({ onPlace }) {
  useMapEvents({ click: (e) => onPlace({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

// Keeps the view on the pin when it is moved from outside the map (search, my location).
function FollowPin({ pin, flyKey }) {
  const map = useMap();
  useEffect(() => {
    if (pin) map.flyTo([pin.lat, pin.lng], Math.max(map.getZoom(), PIN_ZOOM), { duration: 0.6 });
    // Only when a jump was asked for — not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyKey]);
  return null;
}

const round = (n) => Math.round(n * 1e6) / 1e6;

/**
 * @param {{ lat:number, lng:number } | null} value
 * @param {(pin: { lat:number, lng:number, accuracy?:number }) => void} onChange
 * @param {{ street?, city?, state?, pincode? }} [address]  enables "Find address on map"
 */
export default function LocationPicker({ value, onChange, address, invalid, className }) {
  const [flyKey, setFlyKey] = useState(0);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  const place = (pin, { fly = false, note = null } = {}) => {
    onChange({ ...pin, lat: round(pin.lat), lng: round(pin.lng) });
    setMessage(note);
    if (fly) setFlyKey((k) => k + 1);
  };

  async function findAddress() {
    setBusy("address");
    setMessage(null);
    try {
      const { data } = await ownerApi.geocode(
        Object.fromEntries(Object.entries(address ?? {}).filter(([, v]) => String(v ?? "").trim())),
      );
      place(data.data, {
        fly: true,
        note: { tone: "ok", text: "Found your address — now drag the pin onto your entrance." },
      });
    } catch (err) {
      setMessage({ tone: "error", text: err.message ?? "Couldn't find that address" });
    } finally {
      setBusy(null);
    }
  }

  async function useMyLocation() {
    setBusy("gps");
    setMessage(null);
    try {
      const pos = await getCurrentPosition();
      place(pos, {
        fly: true,
        note: {
          tone: "ok",
          text: `Pinned your current location${pos.accuracy ? ` (about ${Math.round(pos.accuracy)} m)` : ""}.`,
        },
      });
    } catch (err) {
      setMessage({ tone: "error", text: err.message });
    } finally {
      setBusy(null);
    }
  }

  const canSearch = !!(address && (String(address.city ?? "").trim() || String(address.pincode ?? "").trim()));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap gap-2">
        {address !== undefined ? (
          <Button type="button" variant="outline" size="sm" onClick={findAddress} disabled={!!busy || !canSearch}>
            <Search />
            {busy === "address" ? "Finding…" : "Find my address on the map"}
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={useMyLocation} disabled={!!busy}>
          <LocateFixed />
          {busy === "gps" ? "Getting your location…" : "Use my current location"}
        </Button>
      </div>

      <div
        className={cn(
          "relative z-0 h-64 overflow-hidden rounded-lg border",
          invalid ? "border-destructive" : "border-input",
        )}
        data-testid="location-map"
      >
        <MapContainer
          center={value ? [value.lat, value.lng] : INDIA}
          zoom={value ? PIN_ZOOM : 4}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
          <ClickToPlace onPlace={(pin) => place(pin)} />
          <FollowPin pin={value} flyKey={flyKey} />
          {value ? (
            <Marker
              position={[value.lat, value.lng]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  place({ lat, lng });
                },
              }}
            />
          ) : null}
        </MapContainer>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {message ? (
          <span className={message.tone === "error" ? "text-destructive" : "text-emerald-700"}>{message.text}</span>
        ) : value ? (
          <>
            Pin at {value.lat.toFixed(6)}, {value.lng.toFixed(6)} — drag it or click the map to adjust.
          </>
        ) : (
          "Click the map where your restaurant is, or use the buttons above."
        )}
      </p>
    </div>
  );
}
