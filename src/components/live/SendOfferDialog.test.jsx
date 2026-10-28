import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ToastProvider } from "@/components/Toaster";
import { OFFER_ERROR_TEXT } from "@/lib/offerRules";
import { detailFor, eventsPage, fakeOwnerSocket, metricsToday, sessionRow, sessionsPage } from "@/test/liveFixtures";
import created from "@/test/fixtures/live/owner-offer-created.json";

const env = vi.hoisted(() => ({ owner: null }));
vi.mock("@/lib/socket", async (importOriginal) => ({
  ...(await importOriginal()),
  getOwnerSocket: () => env.owner,
  useOwnerSocketState: () => "connected",
}));
const api = vi.hoisted(() => ({}));
vi.mock("@/api/owner.api", () => ({ ownerApi: api }));
vi.mock("@/hooks/owner/useMenuItems", () => ({
  useMenuItems: () => ({ data: [{ _id: "m1", name: "Paneer Tikka" }, { _id: "m2", name: "Butter Naan" }] }),
}));

import SendOfferDialog from "./SendOfferDialog";
import LiveDashboard from "./LiveDashboard";

const ok = (data) => Promise.resolve({ data: { data } });
const apiError = (code, status = 409) => Object.assign(new Error(`server says ${code}`), { code, status });

let qc;
const wrap = (ui) => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
};
const aarav = (overrides = {}) => sessionRow({ id: "s1", displayName: "Aarav", ...overrides });

const fill = async (user, { title = "A treat for you", value = "15" } = {}) => {
  await user.type(screen.getByLabelText("Title"), title);
  await user.type(screen.getByLabelText("Discount (%)"), value);
};

beforeEach(() => {
  env.owner = fakeOwnerSocket();
  api.sendLiveOffer = vi.fn((_r, body) =>
    body.preview ? ok({ wouldSavePaise: 9600, cartTotalPaise: 64000, eligibleSubtotalPaise: 64000 }) : ok(created.data),
  );
});
afterEach(() => {
  vi.useRealTimers();
  qc?.clear();
});

describe("Send offer button", () => {
  it.each([
    ["GUEST", "Guest — not eligible"],
    ["OPTED_OUT", "Customer turned off activity sharing"],
    ["OFFER_OPEN", "Already has an active offer"],
    ["DAILY_LIMIT", "Daily limit reached (3 per day)"],
    ["SESSION_CLOSED", "Customer has left"],
  ])("is disabled for %s and says why", async (reason, text) => {
    const row = aarav({ offerEligible: false, notEligibleReason: reason });
    api.listLiveSessions = vi.fn(() => ok(sessionsPage([row])));
    api.getLiveSession = vi.fn(() => ok(detailFor(row)));
    api.listLiveSessionEvents = vi.fn(() => ok(eventsPage(["e1"])));
    api.getLiveMetrics = vi.fn(() => ok(metricsToday()));
    wrap(<LiveDashboard restaurantId="r1" />);
    const button = await screen.findByRole("button", { name: /Send offer/ });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe("why-s1");
    expect(document.getElementById("why-s1").textContent).toBe(text);
  });

  it("is enabled for an eligible customer and opens the dialog", async () => {
    const user = userEvent.setup();
    const row = aarav();
    api.listLiveSessions = vi.fn(() => ok(sessionsPage([row])));
    api.getLiveSession = vi.fn(() => ok(detailFor(row)));
    api.listLiveSessionEvents = vi.fn(() => ok(eventsPage(["e1"])));
    api.getLiveMetrics = vi.fn(() => ok(metricsToday()));
    wrap(<LiveDashboard restaurantId="r1" />);
    await user.click(await screen.findByRole("button", { name: /Send offer/ }));
    expect(screen.getByRole("dialog", { name: /Send an offer to Aarav/ })).toBeTruthy();
  });
});

describe("offer dialog", () => {
  it("blocks invalid values inline and never sends them", async () => {
    const user = userEvent.setup();
    wrap(<SendOfferDialog restaurantId="r1" session={aarav()} onClose={() => {}} />);
    await user.type(screen.getByLabelText("Discount (%)"), "51");
    expect(screen.getByText("Between 1% and 50%.")).toBeTruthy();
    await user.clear(screen.getByLabelText("Maximum discount (₹)"));
    expect(screen.getByText("A maximum discount is required.")).toBeTruthy();
    await user.type(screen.getByLabelText("Title"), "x".repeat(41));
    expect(screen.getByText("At most 40 characters.")).toBeTruthy();
    expect(screen.getByText("41/40")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Review & send" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.sendLiveOffer).not.toHaveBeenCalled();
    expect(screen.getByTestId("offer-preview").textContent).toBe("Fill in the offer to see what they'd save.");
  });

  it("an eligibility change while open disables sending and says why", async () => {
    const view = wrap(<SendOfferDialog restaurantId="r1" session={aarav()} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Review & send" }).disabled).toBe(false);
    view.rerender(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <SendOfferDialog restaurantId="r1" session={aarav({ offerEligible: false, notEligibleReason: "SESSION_CLOSED" })} onClose={() => {}} />
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole("alert").textContent).toContain("Customer has left");
    expect(screen.getByRole("button", { name: "Review & send" }).disabled).toBe(true);
  });
});

describe("preview", () => {
  it("is debounced 400 ms, sent with the form values, and shows the server's figure", async () => {
    vi.useFakeTimers();
    wrap(<SendOfferDialog restaurantId="r1" session={aarav()} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A treat" } });
    fireEvent.change(screen.getByLabelText("Discount (%)"), { target: { value: "15" } });
    await act(async () => vi.advanceTimersByTime(399));
    expect(api.sendLiveOffer).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTime(1));
    expect(api.sendLiveOffer).toHaveBeenCalledTimes(1);
    expect(api.sendLiveOffer).toHaveBeenCalledWith("r1", {
      sessionId: "s1",
      title: "A treat",
      type: "percentage",
      percentage: 15,
      maxDiscountAmount: 100,
      expiresInMinutes: 30,
      preview: true,
    });
    await act(async () => {});
    expect(screen.getByTestId("offer-preview").textContent).toBe("On their ₹640 cart: ₹96 off");
  });

  it("ignores a response that arrives after a newer one", async () => {
    vi.useFakeTimers();
    const pending = [];
    api.sendLiveOffer = vi.fn(() => new Promise((resolve) => pending.push(resolve)));
    wrap(<SendOfferDialog restaurantId="r1" session={aarav()} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "A treat" } });
    fireEvent.change(screen.getByLabelText("Discount (%)"), { target: { value: "10" } });
    await act(async () => vi.advanceTimersByTime(400));
    fireEvent.change(screen.getByLabelText("Discount (%)"), { target: { value: "20" } });
    await act(async () => vi.advanceTimersByTime(400));
    expect(pending).toHaveLength(2);

    await act(async () => pending[1]({ data: { data: { wouldSavePaise: 10000, cartTotalPaise: 64000, eligibleSubtotalPaise: 64000 } } }));
    await act(async () => pending[0]({ data: { data: { wouldSavePaise: 6400, cartTotalPaise: 64000, eligibleSubtotalPaise: 64000 } } }));
    expect(screen.getByTestId("offer-preview").textContent).toBe("On their ₹640 cart: ₹100 off");
  });

  it("says a preview issue in words", async () => {
    api.sendLiveOffer = vi.fn(() => ok({ wouldSavePaise: 0, cartTotalPaise: 0, eligibleSubtotalPaise: 0, issue: "NO_CART" }));
    const user = userEvent.setup();
    wrap(<SendOfferDialog restaurantId="r1" session={aarav()} onClose={() => {}} />);
    await fill(user);
    await waitFor(() => expect(screen.getByTestId("offer-preview").textContent).toBe("No items in cart yet"));
  });
});

describe("sending", () => {
  const sends = () => api.sendLiveOffer.mock.calls.filter(([, body]) => !body.preview);

  it("sends only after confirming — once, even on a double click — then closes with a toast", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let finish;
    api.sendLiveOffer = vi.fn((_r, body) =>
      body.preview ? ok({ wouldSavePaise: 9600, cartTotalPaise: 64000, eligibleSubtotalPaise: 64000 }) : new Promise((r) => (finish = r)),
    );
    wrap(<SendOfferDialog restaurantId="r1" session={aarav()} onClose={onClose} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Review & send" }));
    const confirm = screen.getByRole("alertdialog", { name: "Send 15% off (up to ₹100) to Aarav, valid 30 minutes?" });
    expect(sends()).toHaveLength(0);

    const button = within(confirm).getByRole("button", { name: "Send offer" });
    await user.dblClick(button);
    expect(sends()).toHaveLength(1);
    expect(sends()[0][1]).not.toHaveProperty("preview");
    await act(async () => finish({ data: { data: created.data } }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.getByText("Offer sent to Aarav")).toBeTruthy();
  });

  it("cancel sends nothing", async () => {
    const user = userEvent.setup();
    wrap(<SendOfferDialog restaurantId="r1" session={aarav()} onClose={() => {}} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Review & send" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(sends()).toHaveLength(0);
  });

  it.each(Object.entries(OFFER_ERROR_TEXT).filter(([code]) => !["OFFER_NOT_REVOCABLE", "OFFER_NOT_FOUND"].includes(code)))(
    "shows %s in plain words",
    async (code, text) => {
      api.sendLiveOffer = vi.fn((_r, body) =>
        body.preview ? ok({ wouldSavePaise: 1, cartTotalPaise: 1, eligibleSubtotalPaise: 1 }) : Promise.reject(apiError(code)),
      );
      const user = userEvent.setup();
      const onClose = vi.fn();
      wrap(<SendOfferDialog restaurantId="r1" session={aarav()} onClose={onClose} />);
      await fill(user);
      await user.click(screen.getByRole("button", { name: "Review & send" }));
      await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Send offer" }));
      await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(text));
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it("after OFFER_ALREADY_ACTIVE the session is refreshed", async () => {
    api.sendLiveOffer = vi.fn((_r, body) =>
      body.preview ? ok({ wouldSavePaise: 1, cartTotalPaise: 1, eligibleSubtotalPaise: 1 }) : Promise.reject(apiError("OFFER_ALREADY_ACTIVE")),
    );
    const user = userEvent.setup();
    wrap(<SendOfferDialog restaurantId="r1" session={aarav()} onClose={() => {}} />);
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Review & send" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Send offer" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["live", "r1", "session"] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["live", "r1", "sessions"] });
  });
});
