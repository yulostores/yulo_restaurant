import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { detailFor, eventsPage, fakeOwnerSocket, metricsToday, sessionRow, sessionsPage } from "@/test/liveFixtures";

const env = vi.hoisted(() => ({ owner: null, state: "connected" }));
vi.mock("@/lib/socket", async (importOriginal) => ({
  ...(await importOriginal()),
  getOwnerSocket: () => env.owner,
  useOwnerSocketState: () => env.state,
}));
const api = vi.hoisted(() => ({}));
vi.mock("@/api/owner.api", () => ({ ownerApi: api }));

import LiveDashboard from "./LiveDashboard";

const ok = (data) => Promise.resolve({ data: { data } });
const notFound = () => Object.assign(new Error("Route not found"), { status: 404, code: "NOT_FOUND" });

let qc;
const renderDashboard = () => {
  // The hooks retry real failures (not 404s) on their own; no delay between tries here.
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <LiveDashboard restaurantId="r1" />
    </QueryClientProvider>,
  );
};

const rows = () => [
  sessionRow({ id: "s1", displayName: "Meera", ago: 1, pastOrderCount: 3, cart: { itemCount: 3, totalPaise: 56100, items: [{ name: "Paneer Tikka", qty: 2 }] } }),
  sessionRow({ id: "s2", displayName: "Guest", isGuest: true, status: "idle", ago: 6, offerEligible: false, notEligibleReason: "GUEST", cart: { itemCount: 0, totalPaise: 0, items: [] } }),
  sessionRow({ id: "s3", displayName: "Kabir", status: "abandoned", ago: 40, offerEligible: false, notEligibleReason: "SESSION_CLOSED", cart: { itemCount: 1, totalPaise: 25000, items: [{ name: "Naan", qty: 1 }] } }),
];

beforeEach(() => {
  env.owner = fakeOwnerSocket();
  env.state = "connected";
  api.listLiveSessions = vi.fn((_r, { status }) => {
    const statuses = status.split(",");
    return ok(sessionsPage(rows().filter((r) => statuses.includes(r.status)), { live: 2, cartsInProgress: 1, cartsTotalPaise: 56100, abandonedLastHour: 1 }));
  });
  api.getLiveSession = vi.fn((_r, id) => ok(detailFor(rows().find((r) => r.id === id))));
  api.listLiveSessionEvents = vi.fn(() => ok(eventsPage(["e1", "e2"], "1730000000000_6ae0ead2578be8781168d5c0")));
  api.getLiveMetrics = vi.fn(() => ok(metricsToday({ sent: 4, redeemed: 1, conversionRate: 0.25 })));
});
afterEach(() => qc?.clear());

describe("live dashboard", () => {
  it("lists sessions with status words, cart totals and why an offer can't be sent", async () => {
    renderDashboard();
    const list = await screen.findByRole("listbox", { name: "Customers browsing now" });
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(3);

    expect(within(options[0]).getByText("Active")).toBeTruthy();
    expect(within(options[0]).getByText(/Returning · 3 past orders/)).toBeTruthy();
    expect(within(options[0]).getByText(/3 items · ₹561\.00/)).toBeTruthy();
    expect(within(options[1]).getByText("Idle")).toBeTruthy();
    expect(within(options[1]).getByText("Guest — not eligible")).toBeTruthy();
    expect(within(options[2]).getByText("Abandoned")).toBeTruthy();
    expect(within(options[2]).getByText("Customer has left")).toBeTruthy();

    // Header strip from the list summary and today's metrics.
    const strip = screen.getByRole("region", { name: "Live summary" });
    expect(within(strip).getByText("₹561.00")).toBeTruthy();
    expect(within(strip).getByText("4 sent → 1 used")).toBeTruthy();
    expect(within(strip).getByText("25% converted")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Live");
  });

  it("filters: Abandoned asks the API for abandoned; With cart hides empty carts", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("listbox");

    await user.click(screen.getByRole("button", { name: "Abandoned" }));
    await waitFor(() => expect(api.listLiveSessions).toHaveBeenLastCalledWith("r1", { status: "abandoned", limit: 50 }));
    await waitFor(() => expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(1));

    await user.click(screen.getByRole("button", { name: "With cart" }));
    await waitFor(() => {
      const names = within(screen.getByRole("listbox")).getAllByRole("option").map((o) => o.textContent);
      expect(names.some((t) => t.includes("Guest"))).toBe(false);
      expect(names).toHaveLength(2);
    });
  });

  it("relative times tick on the shared 15 s timer", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"], shouldAdvanceTime: true });
    try {
      renderDashboard();
      const list = await screen.findByRole("listbox");
      expect(within(list).getAllByRole("option")[0].textContent).toContain("1 min ago");
      await act(async () => {
        vi.advanceTimersByTime(2 * 60_000 + 15_000);
      });
      expect(within(list).getAllByRole("option")[0].textContent).toContain("3 min ago");
    } finally {
      vi.useRealTimers();
    }
  });

  it("detail: cart and timeline; Load earlier asks for events before the cursor", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole("region", { name: "Cart" });
    expect(screen.getByRole("heading", { name: "Meera" })).toBeTruthy();
    expect(screen.getByText("Event e1")).toBeTruthy();
    expect(api.listLiveSessionEvents).toHaveBeenCalledWith("r1", "s1", { limit: 50 });

    api.listLiveSessionEvents.mockImplementationOnce(() => ok(eventsPage(["e3"], null)));
    await user.click(screen.getByRole("button", { name: "Load earlier" }));
    await screen.findByText("Event e3");
    expect(api.listLiveSessionEvents).toHaveBeenLastCalledWith("r1", "s1", {
      limit: 50,
      before: "1730000000000_6ae0ead2578be8781168d5c0",
    });
    expect(screen.queryByRole("button", { name: "Load earlier" })).toBeNull();
  });

  it("keyboard: arrow keys move through the list and open the visit", async () => {
    const user = userEvent.setup();
    renderDashboard();
    const list = await screen.findByRole("listbox");
    within(list).getAllByRole("option")[0].querySelector("button").focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(api.getLiveSession).toHaveBeenCalledWith("r1", "s2"));
    expect(within(list).getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{End}");
    await waitFor(() => expect(api.getLiveSession).toHaveBeenCalledWith("r1", "s3"));
  });

  it("a socket update moves the row without a refetch", async () => {
    renderDashboard();
    await screen.findByRole("listbox");
    const calls = api.listLiveSessions.mock.calls.length;
    act(() => env.owner.emit("session_updated", sessionRow({ id: "s3", displayName: "Kabir", status: "active", ago: 0 })));
    await waitFor(() => {
      const first = within(screen.getByRole("listbox")).getAllByRole("option")[0];
      expect(first.textContent).toContain("Kabir");
      expect(first.textContent).toContain("Active");
    });
    expect(api.listLiveSessions.mock.calls.length).toBe(calls);
  });
});

describe("states", () => {
  it("empty", async () => {
    api.listLiveSessions = vi.fn(() => ok(sessionsPage([])));
    renderDashboard();
    expect(await screen.findByText("No customers browsing right now.")).toBeTruthy();
  });

  it("loading", () => {
    api.listLiveSessions = vi.fn(() => new Promise(() => {}));
    renderDashboard();
    expect(screen.getByLabelText("Loading customers")).toBeTruthy();
  });

  it("error, with a retry that works", async () => {
    const user = userEvent.setup();
    api.listLiveSessions = vi.fn().mockRejectedValue(Object.assign(new Error("Network down"), { status: 500 }));
    renderDashboard();
    expect(await screen.findByText(/Couldn't load live customers: Network down/)).toBeTruthy();
    api.listLiveSessions.mockImplementation(() => ok(sessionsPage([sessionRow({ id: "s1" })])));
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("listbox")).toBeTruthy();
  });

  it("feature not enabled (404)", async () => {
    api.listLiveSessions = vi.fn(() => Promise.reject(notFound()));
    api.getLiveMetrics = vi.fn(() => Promise.reject(notFound()));
    renderDashboard();
    expect(await screen.findByText("Live customer activity isn't switched on yet")).toBeTruthy();
    expect(api.listLiveSessions).toHaveBeenCalledTimes(1);
  });

  it("reconnecting shows in the header", async () => {
    env.state = "reconnecting";
    renderDashboard();
    await screen.findByRole("listbox");
    expect(screen.getByRole("status").textContent).toContain("Reconnecting");
  });
});

describe("layout edge cases", () => {
  it("a very long name truncates, a ₹0 cart reads 'Empty cart', and a 50-line cart renders every line", async () => {
    const long = "Venkataramanasubramanian".repeat(3);
    const row = sessionRow({ id: "s1", displayName: long, cart: { itemCount: 0, totalPaise: 0, items: [] } });
    const lines = Array.from({ length: 50 }, (_, i) => ({ menuItemId: `m${i}`, name: `Dish number ${i} with a long name`, qty: 1, unitPricePaise: 12345 }));
    api.listLiveSessions = vi.fn(() => ok(sessionsPage([row], { live: 1, cartsInProgress: 0, cartsTotalPaise: 0 })));
    api.getLiveSession = vi.fn(() => ok({ ...detailFor(row), cart: { items: lines, totalPaise: 617250, updatedAt: row.lastActivityAt } }));
    renderDashboard();

    const option = within(await screen.findByRole("listbox")).getAllByRole("option")[0];
    const name = within(option).getByText(long);
    expect(name.className).toContain("truncate");
    expect(option.textContent).toContain("Empty cart");
    expect(within(screen.getByRole("region", { name: "Live summary" })).getByText("₹0.00")).toBeTruthy();

    const cart = await screen.findByRole("region", { name: "Cart" });
    expect(within(cart).getAllByRole("row")).toHaveLength(52); // header + 50 lines + total
    expect(within(cart).getByText("₹6,172.50")).toBeTruthy();
  });
});
