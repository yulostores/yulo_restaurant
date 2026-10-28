import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SOCKET_STATES, createOwnerSocket, msUntilExpiry, retryDelay } from "./socket";

// A JWT-shaped token whose `exp` is `secondsFromNow` away (unsigned — only read, never verified).
const token = (secondsFromNow, tag = "t") => {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow, tag }));
  return `h.${payload}.s`;
};

// Stand-in for a socket.io-client socket: records emits, lets the test fire server events.
function fakeIo() {
  const sockets = [];
  const connect = vi.fn(() => {
    const handlers = new Map();
    const socket = {
      connected: false,
      emit: vi.fn(),
      on: (event, fn) => {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event).add(fn);
      },
      off: (event, fn) => handlers.get(event)?.delete(fn),
      removeAllListeners: () => handlers.clear(),
      connect: vi.fn(() => {
        socket.connected = true;
        socket.fire("connect");
      }),
      disconnect: vi.fn(() => {
        socket.connected = false;
      }),
      fire: (event, ...args) => [...(handlers.get(event) ?? [])].forEach((fn) => fn(...args)),
      // The last join's ack callback.
      ackLast: (reply) => socket.emit.mock.calls.at(-1)[2](reply),
      // The server refusing and closing the socket.
      serverClose: () => {
        socket.connected = false;
        socket.fire("disconnect", "io server disconnect");
      },
    };
    sockets.push(socket);
    return socket;
  });
  return { connect, sockets };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

describe("owner socket", () => {
  let io;
  let refresh;
  let current;
  let owner;

  beforeEach(() => {
    vi.useFakeTimers();
    io = fakeIo();
    current = token(600, "fresh");
    refresh = vi.fn(async () => {
      current = token(900, "refreshed");
      return current;
    });
    owner = createOwnerSocket({ connect: io.connect, url: "http://api", getToken: () => current, refresh, random: () => 0.5 });
  });
  afterEach(() => vi.useRealTimers());

  it("joins its restaurant's room with the current token on connect", async () => {
    owner.setRestaurant("r1");
    await settle();
    const [socket] = io.sockets;
    expect(io.connect).toHaveBeenCalledWith("http://api", expect.objectContaining({ transports: ["websocket"] }));
    expect(socket.emit).toHaveBeenCalledWith("join_restaurant", { restaurantId: "r1", token: current }, expect.any(Function));
    expect(refresh).not.toHaveBeenCalled();
    expect(owner.getState()).toBe(SOCKET_STATES.RECONNECTING);
    socket.ackLast({ ok: true });
    expect(owner.getState()).toBe(SOCKET_STATES.CONNECTED);
  });

  it("rejoins the room on every reconnect, with the then-current token", async () => {
    owner.setRestaurant("r1");
    await settle();
    const [socket] = io.sockets;
    socket.ackLast({ ok: true });

    // A dropped connection that socket.io re-establishes on its own.
    socket.connected = false;
    socket.fire("disconnect", "transport close");
    expect(owner.getState()).toBe(SOCKET_STATES.RECONNECTING);
    current = token(600, "rotated");
    socket.connected = true;
    socket.fire("connect");
    await settle();
    expect(socket.emit).toHaveBeenCalledTimes(2);
    expect(socket.emit.mock.calls[1][1]).toEqual({ restaurantId: "r1", token: current });
    socket.ackLast({ ok: true });
    expect(owner.getState()).toBe(SOCKET_STATES.CONNECTED);
  });

  it("refreshes a token that is about to expire before joining", async () => {
    current = token(30, "expiring");
    owner.setRestaurant("r1");
    await settle();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(io.sockets[0].emit.mock.calls[0][1].token).toBe(current);
    expect(JSON.parse(atob(current.split(".")[1])).tag).toBe("refreshed");
  });

  it("a refused join refreshes the token and retries with backoff: 2 s, then 4 s", async () => {
    owner.setRestaurant("r1");
    await settle();
    const [socket] = io.sockets;

    socket.ackLast({ ok: false, code: "UNAUTHORIZED" });
    socket.serverClose();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(owner.getState()).toBe(SOCKET_STATES.RECONNECTING);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.connect).toHaveBeenCalledTimes(2);
    expect(socket.emit).toHaveBeenCalledTimes(2);

    socket.ackLast({ ok: false, code: "UNAUTHORIZED" });
    socket.serverClose();
    await vi.advanceTimersByTimeAsync(3_999);
    expect(socket.connect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.connect).toHaveBeenCalledTimes(3);

    socket.ackLast({ ok: true });
    expect(owner.getState()).toBe(SOCKET_STATES.CONNECTED);
  });

  it("FORBIDDEN stops retrying", async () => {
    owner.setRestaurant("r1");
    await settle();
    const [socket] = io.sockets;
    socket.ackLast({ ok: false, code: "FORBIDDEN" });
    socket.serverClose();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(owner.getState()).toBe(SOCKET_STATES.OFFLINE);
  });

  it("switching restaurant rejoins the new room; disconnect leaves for good", async () => {
    owner.setRestaurant("r1");
    await settle();
    io.sockets[0].ackLast({ ok: true });

    owner.setRestaurant("r2");
    await settle();
    expect(io.sockets[0].disconnect).toHaveBeenCalled();
    expect(io.sockets[1].emit).toHaveBeenCalledWith("join_restaurant", expect.objectContaining({ restaurantId: "r2" }), expect.any(Function));

    owner.disconnect();
    expect(io.sockets[1].disconnect).toHaveBeenCalled();
    expect(owner.getState()).toBe(SOCKET_STATES.OFFLINE);
  });

  it("event handlers survive a reconnect onto a new socket", async () => {
    const seen = vi.fn();
    owner.on("session_updated", seen);
    owner.setRestaurant("r1");
    await settle();
    owner.setRestaurant("r2");
    await settle();
    io.sockets[1].fire("session_updated", { id: "s1" });
    expect(seen).toHaveBeenCalledWith({ id: "s1" });
  });
});

describe("helpers", () => {
  it("retryDelay doubles from 2 s, caps at 60 s, and jitters ±20 %", () => {
    expect(retryDelay(0, () => 0.5)).toBe(2_000);
    expect(retryDelay(1, () => 0.5)).toBe(4_000);
    expect(retryDelay(10, () => 0.5)).toBe(60_000);
    expect(retryDelay(0, () => 0)).toBe(1_600);
    expect(retryDelay(0, () => 1)).toBe(2_400);
  });

  it("msUntilExpiry reads a token's exp, and 0 for garbage", () => {
    expect(msUntilExpiry(token(120), Date.now())).toBeGreaterThan(110_000);
    expect(msUntilExpiry("not-a-jwt")).toBe(0);
  });
});
