// The rider's pickup OTP. Staff read it to the rider at handover; the rider enters it in their
// app to confirm they have the food. The server includes it (order.deliveryAssignment.pickupOtp)
// only while a rider is assigned and hasn't picked up yet — before that there is no rider to
// give it to, after that it has been used — so a null code simply renders nothing.

import { Bike } from "lucide-react";

import { cn } from "@/lib/utils";

export const pickupOtpOf = (order) =>
  order?.deliveryAssignment?.pickupOtp ?? null;

const riderLine = (partner) =>
  [partner?.name, partner?.vehicleNumber].filter(Boolean).join(" · ");

/**
 * `compact` — a one-line badge for a table row or a ticket; otherwise a full card with the
 * rider and the handover instruction (order detail).
 */
export default function RiderPickupOtp({ order, compact = false, className }) {
  const otp = pickupOtpOf(order);
  if (!otp) return null;
  const partner = order.deliveryAssignment?.partner;

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-[#E7F0FB] px-2.5 py-1 text-[11px] font-bold text-[#1565C0]",
          className,
        )}
        title="Rider pickup OTP — give this code to the rider at handover"
      >
        <Bike className="h-3.5 w-3.5" />
        Pickup OTP <span className="font-mono tracking-[0.2em]">{otp}</span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-[#BBD4F1] bg-[#E7F0FB] px-4 py-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#1565C0]">
            Rider pickup OTP
          </p>
          <p className="text-xs text-[#1f3b5c]">
            Give this code to the rider at handover
            {riderLine(partner) ? ` — ${riderLine(partner)}` : ""}.
          </p>
        </div>
        <p
          className="font-mono text-3xl font-bold tracking-[0.3em] text-[#0d2f57]"
          aria-label={`Rider pickup OTP ${otp.split("").join(" ")}`}
          data-testid="rider-pickup-otp"
        >
          {otp}
        </p>
      </div>
    </div>
  );
}
