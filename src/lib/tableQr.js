// Reads a scanned table QR code for the waiter's "Scan QR".
//
// Table QRs have been printed in two formats (yulo_backend services/qr.service.js), and
// both are still on tables:
//
//   current:  https://<menu host>/?r=<restaurantId>&t=<tableId>
//   older:    https://<menu host>/menu?restaurantId=<restaurantId>&tableId=<tableId>
//
// A bare table id is accepted too (typed or from a test sticker). Ids are Mongo ObjectIds,
// so anything else is rejected here rather than sent to the server. They come back
// lower-cased — hex is case-insensitive, and the caller compares the restaurant id as text.

const OBJECT_ID = /^[a-f0-9]{24}$/i;

function readParams(value) {
  try {
    // The base only matters for a relative link ("/?r=…&t=…"); an absolute one ignores it.
    return new URL(value, "https://qr.invalid").searchParams;
  } catch {
    return null;
  }
}

/**
 * @returns {{ tableId: string, restaurantId: string | null } | null}
 *   null when the code carries no usable table id.
 */
export function parseTableQr(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  if (OBJECT_ID.test(value)) return { tableId: value.toLowerCase(), restaurantId: null };

  const params = readParams(value);
  if (!params) return null;

  const tableId = (params.get("t") ?? params.get("tableId") ?? "").trim();
  if (!OBJECT_ID.test(tableId)) return null;

  const restaurantId = (params.get("r") ?? params.get("restaurantId") ?? "").trim();
  return {
    tableId: tableId.toLowerCase(),
    restaurantId: OBJECT_ID.test(restaurantId) ? restaurantId.toLowerCase() : null,
  };
}
