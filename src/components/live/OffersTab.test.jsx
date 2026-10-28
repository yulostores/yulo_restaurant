import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ToastProvider } from "@/components/Toaster";
import { fakeOwnerSocket, metricsToday } from "@/test/liveFixtures";
import offersList from "@/test/fixtures/live/owner-offers-list.json";

const env = vi.hoisted(() => ({ owner: null }));
vi.mock("@/lib/socket", async (importOriginal) => ({
  ...(await importOriginal()),
  getOwnerSocket: () => env.owner,
  useOwnerSocketState: () => "connected",
}));
const api = vi.hoisted(() => ({}));
vi.mock("@/api/owner.api", () => ({ ownerApi: api }));

import OffersTab, { FUNNEL_DEFINITIONS, rangeError } from "./OffersTab";
import RevokeOfferButton from "./RevokeOfferButton";
import { useLiveSocket } from "@/hooks/owner/useLiveSessions";

const ok = (data) => Promise.resolve({ data: { data } });
const template = offersList.data.offers[0];
const offer = (id, overrides = {}) => ({
  ...template,
  id,
  title: `Offer ${id}`,
  customerName: "Meera",
  sentAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 25 * 60_000).toISOString(),
  status: "sent",
  orderId: null,
  orderTotalPaise: null,
  redeemedAt: null,
  ...overrides,
});

let qc;
const wrap = (ui) => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
};

// The offers tab plus the socket hook, as the page mounts them.
function TabWithSocket() {
  useLiveSocket("r1", { owner: env.owner });
  return <OffersTab restaurantId="r1" />;
}

beforeEach(() => {
  env.owner = fakeOwnerSocket();
  api.listLiveOffers = vi.fn((_r, { page }) =>
    ok({
      offers: page === 1 ? [offer("o1"), offer("o2", { status: "redeemed", orderId: "6ae0ead2578be8781168d5ab", orderTotalPaise: 44600 })] : [offer("o3", { status: "expired" })],
      from: "2026-09-29",
      to: "2026-10-28",
      page,
      limit: 20,
      hasMore: page === 1,
    }),
  );
  api.getLiveMetrics = vi.fn((_r, range) =>
    ok(
      {
        today: metricsToday({ range: "today", sent: 2, delivered: 2, viewed: 1, applied: 1, redeemed: 1, conversionRate: 0.5, revenuePaise: 44600, discountPaise: 7500 }),
        "7d": metricsToday({ range: "7d", sent: 10, delivered: 9, viewed: 8, applied: 5, redeemed: 4, conversionRate: 0.4, revenuePaise: 180000, discountPaise: 30000 }),
        "30d": metricsToday({ range: "30d", sent: 40, delivered: 35, viewed: 30, applied: 20, redeemed: 12, conversionRate: 0.3, revenuePaise: 600000, discountPaise: 90000 }),
      }[range],
    ),
  );
  api.revokeLiveOffer = vi.fn(() => ok({ offer: offer("o1", { status: "revoked" }) }));
});
afterEach(() => qc?.clear());

describe("offers table", () => {
  it("lists offers with customer, discount, status, countdown and order; pages", async () => {
    const user = userEvent.setup();
    wrap(<OffersTab restaurantId="r1" />);
    const rows = await screen.findAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText("Meera")).toBeTruthy();
    expect(within(rows[1]).getByText("15% off (up to ₹100)")).toBeTruthy();
    expect(within(rows[1]).getByText("Sent")).toBeTruthy();
    expect(within(rows[1]).getByText(/^in 2\d min$/)).toBeTruthy();
    expect(within(rows[2]).getByText("Used")).toBeTruthy();
    expect(within(rows[2]).getByText("#68D5AB · ₹446")).toBeTruthy();
    expect(within(rows[2]).queryByRole("button", { name: /Revoke/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(api.listLiveOffers).toHaveBeenLastCalledWith("r1", expect.objectContaining({ page: 2 })));
    await screen.findByText("Offer o3");
    expect(screen.getByRole("button", { name: "Next" }).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(api.listLiveOffers).toHaveBeenLastCalledWith("r1", expect.objectContaining({ page: 1 })));
  });

  it("date range: applied from page 1; more than 90 days or reversed is refused", async () => {
    const user = userEvent.setup();
    wrap(<OffersTab restaurantId="r1" />);
    await screen.findAllByRole("row");
    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");

    await user.clear(from);
    await user.type(from, "2026-06-01");
    expect(screen.getByText("Choose at most 90 days.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show" }).disabled).toBe(true);

    await user.clear(from);
    await user.type(from, "2026-10-01");
    await user.clear(to);
    await user.type(to, "2026-10-15");
    await user.click(screen.getByRole("button", { name: "Show" }));
    await waitFor(() =>
      expect(api.listLiveOffers).toHaveBeenLastCalledWith("r1", { from: "2026-10-01", to: "2026-10-15", page: 1, limit: 20 }),
    );
    expect(rangeError({ from: "2026-10-15", to: "2026-10-01" })).toMatch(/on or before/);
    expect(rangeError({ from: "2026-08-01", to: "2026-10-29" })).toBeNull();
  });

  it("status chips move live with offer_updated", async () => {
    wrap(<TabWithSocket />);
    const rows = await screen.findAllByRole("row");
    expect(within(rows[1]).getByText("Sent")).toBeTruthy();
    act(() => env.owner.emit("offer_updated", { offerId: "o1", sessionId: "s1", offerStatus: "viewed", at: new Date().toISOString() }));
    await waitFor(() => expect(within(screen.getAllByRole("row")[1]).getByText("Viewed")).toBeTruthy());
  });
});

describe("funnel", () => {
  it("renders each range from the metrics", async () => {
    const user = userEvent.setup();
    wrap(<OffersTab restaurantId="r1" />);
    const today = await screen.findByTestId("funnel-today");
    expect(within(today).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["2Sent", "2Delivered", "1Viewed", "1In cart", "1Used"]);
    expect(today.textContent).toContain("50% converted · revenue ₹446 · discount given ₹75");

    await user.click(screen.getByRole("button", { name: "7 days" }));
    const week = await screen.findByTestId("funnel-7d");
    expect(week.textContent).toContain("40% converted · revenue ₹1,800 · discount given ₹300");
    await user.click(screen.getByRole("button", { name: "30 days" }));
    const month = await screen.findByTestId("funnel-30d");
    expect(within(month).getAllByRole("listitem")[0].textContent).toBe("40Sent");

    await user.click(screen.getByRole("button", { name: "How these are counted" }));
    expect(screen.getByRole("note").textContent).toBe(FUNNEL_DEFINITIONS);
  });
});

describe("revoke", () => {
  const renderButton = (status = "sent") => wrap(<RevokeOfferButton restaurantId="r1" offer={offer("o1", { status })} customerName="Meera" />);

  it("requires confirmation; cancel revokes nothing", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: "Revoke Offer o1" }));
    const dialog = screen.getByRole("alertdialog", { name: 'Revoke "Offer o1"?' });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.revokeLiveOffer).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Revoke Offer o1" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Revoke offer" }));
    expect(api.revokeLiveOffer).toHaveBeenCalledTimes(1);
    expect(api.revokeLiveOffer).toHaveBeenCalledWith("r1", "o1");
    expect(await screen.findByText('Offer "Offer o1" revoked')).toBeTruthy();
  });

  it("OFFER_NOT_REVOCABLE is said in words", async () => {
    const user = userEvent.setup();
    api.revokeLiveOffer = vi.fn(() => Promise.reject(Object.assign(new Error("x"), { code: "OFFER_NOT_REVOCABLE", status: 409 })));
    renderButton("applied");
    await user.click(screen.getByRole("button", { name: "Revoke Offer o1" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Revoke offer" }));
    expect((await screen.findByRole("alert")).textContent).toContain("This offer is already being used or has ended.");
  });

  it("a closed offer has no revoke button", () => {
    renderButton("redeemed");
    expect(screen.queryByRole("button", { name: /Revoke/ })).toBeNull();
  });
});
