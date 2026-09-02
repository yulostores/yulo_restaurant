// Hard lock on the owner portal until a Yulo admin approves the restaurant.
//
// Wraps every owner-facing route (App.jsx). Three outcomes:
//   • no restaurant on file  → bounce to /store-settings, the only place to apply
//   • approvalStatus !== active → render the locked screen instead of the page
//   • active                 → render the page
//
// /store-settings and /profile are exempt (lib/approval.js) so an owner can
// submit and correct their application while they wait.

import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Clock, Lock, RefreshCw } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import ApprovalNotice from "@/components/ApprovalNotice";
import { Button } from "@/components/ui/button";
import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { approvalCopy, isAlwaysAllowed } from "@/lib/approval";
import { errorMessage } from "@/lib/errors";

const LOCKED_FEATURES = [
  "Add chefs and waiters",
  "Build categories and menu items",
  "Generate table QR codes",
  "Create coupons and offers",
  "Take and manage orders",
  "Bills, cancellations and live monitoring",
];

function LockedScreen() {
  const navigate = useNavigate();
  const { approvalStatus, restaurant, refreshRestaurant, refreshing } = useOwnerAuth();
  const copy = approvalCopy(approvalStatus);

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-2xl py-6">
        <ApprovalNotice />

        <div className="mt-5 rounded-2xl border border-brand-cream bg-white p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-brand-orange/10 text-brand-orange">
            {approvalStatus === "pending" ? (
              <Clock className="h-7 w-7" />
            ) : (
              <Lock className="h-7 w-7" />
            )}
          </span>

          <h2 className="mt-4 text-xl font-bold">{copy.title}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{copy.body}</p>

          {restaurant?.rejectionReason ? (
            <p className="mx-auto mt-4 max-w-md rounded-lg bg-red-50 px-4 py-3 text-left text-sm text-brand-maroon">
              <span className="font-semibold">Reason from the admin: </span>
              {restaurant.rejectionReason}
            </p>
          ) : null}

          <div className="mx-auto mt-6 max-w-md text-left">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Unlocks on approval
            </p>
            <ul className="space-y-1.5">
              {LOCKED_FEATURES.map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-2 rounded-lg bg-[#FCFAF7] px-3 py-2 text-sm text-[#5a403e]"
                >
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2.5">
            <Button
              onClick={() => navigate("/store-settings")}
              className="bg-brand-gradient text-white hover:brightness-105"
            >
              {copy.cta}
            </Button>
            <Button variant="outline" disabled={refreshing} onClick={() => refreshRestaurant()}>
              <RefreshCw className={refreshing ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
              {refreshing ? "Checking…" : "Check approval status"}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

// GET /owner/restaurants failed and there is no cached copy to fall back on.
// Guessing here is not safe in either direction — assuming "no restaurant" dumps
// an approved owner on the application form, assuming "approved" unlocks a portal
// whose every call will fail — so ask for a retry.
function LoadFailed() {
  const { refreshRestaurant, refreshing, restaurantsError } = useOwnerAuth();

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-md py-20 text-center">
        <h2 className="text-lg font-bold">Couldn&apos;t load your restaurant</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {errorMessage(restaurantsError, "The request didn't go through.")}
        </p>
        <Button
          className="mt-5 bg-brand-gradient text-white hover:brightness-105"
          disabled={refreshing}
          onClick={() => refreshRestaurant().catch(() => {})}
        >
          <RefreshCw className={refreshing ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
          {refreshing ? "Retrying…" : "Try again"}
        </Button>
      </div>
    </DashboardLayout>
  );
}

export default function ApprovalGate({ children }) {
  const { restaurantId, isApproved, loading, restaurantsLoaded, restaurantsError } =
    useOwnerAuth();
  const { pathname } = useLocation();

  // Wait for the first GET /owner/restaurants before deciding — otherwise a page
  // refresh flashes the locked screen at an approved owner.
  if (loading || !restaurantsLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-gray-400">Loading…</span>
      </div>
    );
  }

  // A load failure with nothing cached is not "no restaurant".
  if (restaurantsError && !restaurantId) return <LoadFailed />;

  if (isAlwaysAllowed(pathname)) return children;

  // No restaurant yet: the application form is the only thing to do.
  if (!restaurantId) return <Navigate to="/store-settings" replace />;

  if (!isApproved) return <LockedScreen />;

  return children;
}
