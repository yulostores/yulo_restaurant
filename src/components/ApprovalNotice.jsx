// The approval status strip. Shown on every screen an unapproved owner can still
// reach (/store-settings, /profile) and at the top of the locked screen — and, once
// the restaurant is active, as a one-line "Approved" confirmation instead. It used
// to render nothing at all in that state, which left an approved owner with no
// indication anywhere that the review had actually gone their way.
//
// Pass `quiet` on screens where the approved case is noise (the confirmation is
// already carried by something else nearby) to keep the old render-nothing
// behaviour for active restaurants.

import { AlertTriangle, CheckCircle2, Clock, Lock } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import { approvalCopy } from "@/lib/approval";
import { cn } from "@/lib/utils";

const TONE = {
  warn:   { wrap: "border-[#F5C99B] bg-[#FFF7ED]", icon: "text-[#D9480F]" },
  danger: { wrap: "border-red-200 bg-red-50",      icon: "text-brand-maroon" },
  info:   { wrap: "border-blue-200 bg-blue-50",    icon: "text-blue-700" },
  muted:  { wrap: "border-gray-200 bg-gray-50",    icon: "text-gray-500" },
};

export default function ApprovalNotice({ className, quiet = false }) {
  const { isApproved, approvalStatus, restaurant } = useOwnerAuth();
  const copy = approvalCopy(approvalStatus);

  // Approved: a single line, not the full explainer block the locked states need.
  if (isApproved) {
    if (quiet) return null;
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border border-[#BFE3CB] bg-[#F1F9F3] px-4 py-2.5",
          className,
        )}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 text-[#2E7D32]" />
        <p className="text-sm font-semibold text-[#2E7D32]">
          {copy.title}
          <span className="ml-2 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            {copy.badge}
          </span>
        </p>
      </div>
    );
  }

  const tone = TONE[copy.tone] ?? TONE.warn;
  const Icon = approvalStatus === "pending" ? Clock : approvalStatus ? Lock : AlertTriangle;

  return (
    <div className={cn("rounded-xl border px-4 py-3.5", tone.wrap, className)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone.icon)} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {copy.title}
            <span className="ml-2 rounded-full border border-current/20 bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              {copy.badge}
            </span>
          </p>
          <p className="mt-1 text-sm text-[#5a403e]">{copy.body}</p>
          {restaurant?.rejectionReason ? (
            <p className="mt-2 text-sm text-brand-maroon">
              <span className="font-semibold">Reason from the admin: </span>
              {restaurant.rejectionReason}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
