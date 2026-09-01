// Central config for the data layer.
//
// The app talks to the real backend only — there is no mock/fixture path.
// See API.md for the full endpoint contract.
//
//   .env / .env.local:
//     VITE_API_BASE=            -> blank uses the Vite dev proxy (vite.config.js)
//     VITE_API_BASE=https://api.example.com

export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// Socket.IO origin. Defaults to API_BASE, falling back to the page origin so the
// dev proxy handles it.
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ?? API_BASE ?? "";
