import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Everything the frontend calls lives under /api (see API.md), plus the
// /partner auth routes and the /health probe. Point the proxy at your backend,
// or set VITE_API_BASE to skip the proxy entirely.
const BACKEND = process.env.VITE_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": BACKEND,
      "/partner": BACKEND,
      "/health": BACKEND,
      // Socket.IO for live stats / order events.
      "/socket.io": { target: BACKEND, ws: true },
    },
  },
  preview: {
    rewrites: [
      {
        source: "/(.*)",
        destination: "/index.html",
      },
    ],
  },
});
