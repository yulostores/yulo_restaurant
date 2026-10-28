// The owner portal's one Socket.IO connection (live customer activity — see API.md § Live
// Activity & Personal Offers → Sockets). Screens never open their own socket: they subscribe
// to events here and read the connection state through useOwnerSocketState().
//
// On every (re)connect the socket joins its restaurant's owner room with a fresh access token
// (`join_restaurant`, acknowledged). Access tokens last 15 minutes (JWT_ACCESS_EXPIRES), so the
// token's own `exp` is read and one that runs out within a minute is refreshed first. A refused
// join is retried with backoff — 2 s doubling to 60 s, with jitter — after refreshing the token;
// FORBIDDEN (not this owner's restaurant) stops for good. The server disconnects a refused
// socket, and Socket.IO never reconnects on its own after that, so the retry reconnects it.

import { useSyncExternalStore } from "react";
import { io } from "socket.io-client";

import { SOCKET_URL } from "@/api/config";
import { getAccessToken, onSessionEnded, refreshSession } from "@/api/client";

export const SOCKET_STATES = Object.freeze({
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  OFFLINE: "offline",
});

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;
const REFRESH_BEFORE_EXPIRY_MS = 60_000;

/** Milliseconds until a JWT's `exp`, or 0 when it can't be read. Never verifies — only reads. */
export function msUntilExpiry(token, now = Date.now()) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === "number" ? exp * 1000 - now : 0;
  } catch {
    return 0;
  }
}

/** The wait before retry number `attempt` (0-based): 2 s doubling to 60 s, ±20 % jitter. */
export function retryDelay(attempt, random = Math.random) {
  const base = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** attempt);
  return Math.round(base * (0.8 + 0.4 * random()));
}

/**
 * The connection, with everything it touches injectable for tests: `connect` (socket.io's
 * `io`), the token reader / refresher, timers and randomness.
 */
export function createOwnerSocket({
  connect = io,
  url = SOCKET_URL,
  getToken = () => getAccessToken("owner"),
  refresh = () => refreshSession("owner"),
  random = Math.random,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  let socket = null;
  let restaurantId = null;
  let state = SOCKET_STATES.OFFLINE;
  let attempt = 0;
  let retryTimer = null;
  let forbidden = false;
  const stateListeners = new Set();
  const handlers = new Map(); // event → Set(handler), re-attached to every new socket

  const setState = (next) => {
    if (next === state) return;
    state = next;
    for (const listener of stateListeners) listener(state);
  };

  const freshToken = async () => {
    const token = getToken();
    if (token && msUntilExpiry(token, now()) > REFRESH_BEFORE_EXPIRY_MS) return token;
    try {
      return await refresh();
    } catch {
      return getToken();
    }
  };

  const cancelRetry = () => {
    if (retryTimer !== null) clearTimer(retryTimer);
    retryTimer = null;
  };

  const scheduleRetry = () => {
    if (forbidden || !restaurantId || retryTimer !== null) return;
    setState(SOCKET_STATES.RECONNECTING);
    const delay = retryDelay(attempt, random);
    attempt += 1;
    retryTimer = setTimer(() => {
      retryTimer = null;
      if (!socket || !restaurantId) return;
      if (socket.connected) join();
      else socket.connect();
    }, delay);
  };

  const join = async () => {
    const forRestaurant = restaurantId;
    if (!socket?.connected || !forRestaurant) return;
    const token = await freshToken();
    if (!token) return scheduleRetry();
    socket.emit("join_restaurant", { restaurantId: forRestaurant, token }, (ack) => {
      if (forRestaurant !== restaurantId) return; // switched restaurant meanwhile
      if (ack?.ok) {
        attempt = 0;
        setState(SOCKET_STATES.CONNECTED);
        return;
      }
      if (ack?.code === "FORBIDDEN") {
        forbidden = true;
        cancelRetry();
        setState(SOCKET_STATES.OFFLINE);
        return;
      }
      // UNAUTHORIZED (or no answer): a new token, then try again after the backoff.
      refresh().catch(() => {});
      scheduleRetry();
    });
  };

  const open = () => {
    socket = connect(url || undefined, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      withCredentials: true,
    });
    socket.on("connect", () => {
      cancelRetry();
      join();
    });
    socket.on("disconnect", (reason) => {
      if (!restaurantId) return setState(SOCKET_STATES.OFFLINE);
      // The server closed it (a refused join): Socket.IO won't reconnect by itself.
      if (reason === "io server disconnect") scheduleRetry();
      else setState(SOCKET_STATES.RECONNECTING);
    });
    socket.io?.on?.("reconnect_attempt", () => setState(SOCKET_STATES.RECONNECTING));
    for (const [event, set] of handlers) for (const handler of set) socket.on(event, handler);
    socket.connect();
  };

  const close = () => {
    cancelRetry();
    if (socket) {
      socket.removeAllListeners?.();
      socket.disconnect();
    }
    socket = null;
    setState(SOCKET_STATES.OFFLINE);
  };

  return {
    /** Join this restaurant's room (rejoins on every reconnect); null disconnects. */
    setRestaurant(next) {
      const id = next ? String(next) : null;
      if (id === restaurantId && (socket || !id)) return;
      close();
      restaurantId = id;
      attempt = 0;
      forbidden = false;
      if (id) {
        setState(SOCKET_STATES.RECONNECTING);
        open();
      }
    },
    /** Sign-out: leave and stay disconnected. */
    disconnect() {
      restaurantId = null;
      close();
    },
    /** Subscribe to a server event; returns the unsubscribe function. */
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(handler);
      socket?.on(event, handler);
      return () => {
        handlers.get(event)?.delete(handler);
        socket?.off(event, handler);
      };
    },
    getState: () => state,
    subscribe(listener) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
  };
}

// The portal's shared instance, created on first use.
let shared = null;
export function getOwnerSocket() {
  if (!shared) {
    shared = createOwnerSocket();
    // The owner's session ended (refresh cookie rejected): nothing may stay joined.
    onSessionEnded("owner", () => shared.disconnect());
  }
  return shared;
}

/** "connected" | "reconnecting" | "offline", re-rendering on change. */
export function useOwnerSocketState(owner = getOwnerSocket()) {
  return useSyncExternalStore(owner.subscribe, owner.getState, owner.getState);
}
