// The Payments & Payouts screens' own building blocks, drawn to the Figma owner frames
// (144:7167 … 144:5747). Same props as the portal's shared shadcn components (Card, Badge,
// Button), so the payment screens import these instead — and only the payment screens change
// look. Styles that can't be props live in pay-scope.css, under the `.pay-scope` root.

import * as React from "react";

import { Button as BaseButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import "./pay-scope.css";

export const PAY = {
  accent: "#14594a",
  tint: "#e0efea",
  border: "#e3dfd4",
  sunken: "#efece4",
  text: "#1a1d1b",
  text2: "#596059",
  text3: "#6f766f",
  danger: "#b3421e",
  dangerTint: "#fbe7df",
  info: "#2d5da8",
  infoTint: "#e3ecf8",
  yulo: "#6b4700",
  yuloTint: "#fcf1d4",
};

// The root of every payment screen (and of a modal portalled outside it).
export function PayScope({ className, ...props }) {
  return <div className={cn("pay-scope", className)} {...props} />;
}

// ── Card: white, 1px #e3dfd4, radius 12 (Figma side and content cards) ───────────────────────
export const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-[12px] border border-[#e3dfd4] bg-white text-[#1a1d1b]",
      className,
    )}
    {...props}
  />
));
Card.displayName = "PayCard";

export const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1 px-5 pb-0 pt-5", className)}
    {...props}
  />
));
CardHeader.displayName = "PayCardHeader";

export const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-3", className)} {...props} />
));
CardContent.displayName = "PayCardContent";

// ── Badge: h28 pill, 14px Plus Jakarta semibold ──────────────────────────────────────────────
const BADGE = {
  ok: "bg-[#e1f2e8] text-[#1a6e43]",
  info: "bg-[#e3ecf8] text-[#2d5da8]",
  warn: "bg-[#fcf1d4] text-[#6b4700]",
  danger: "bg-[#fbe7df] text-[#b3421e]",
  muted: "bg-[#efece4] text-[#596059]",
  outline: "border border-[#e3dfd4] bg-white text-[#596059]",
  default: "bg-[#e0efea] text-[#0e4237]",
};

export function Badge({ className, variant = "default", ...props }) {
  return (
    <div
      className={cn(
        "pay-figure inline-flex h-7 items-center justify-center whitespace-nowrap rounded-full px-3 text-[14px] font-semibold leading-[1.3]",
        BADGE[variant] ?? BADGE.default,
        className,
      )}
      {...props}
    />
  );
}

// ── Button: Figma pills — primary solid #14594a h48, secondary white with #14594a border h40,
// ghost #14594a text. Accepts the shadcn variant names the screens already use.
const BUTTON = {
  default: "h-12 bg-[#14594a] px-6 text-white shadow-none hover:bg-[#0e4237]",
  outline:
    "h-10 border border-[#14594a] bg-white px-5 text-[#14594a] shadow-none hover:bg-[#e0efea] hover:text-[#14594a]",
  secondary:
    "h-10 border border-[#14594a] bg-white px-5 text-[#14594a] shadow-none hover:bg-[#e0efea] hover:text-[#14594a]",
  ghost:
    "h-10 px-3 text-[#14594a] shadow-none hover:bg-[#e0efea] hover:text-[#14594a]",
  link: "h-auto px-0 text-[#14594a] underline-offset-4 hover:underline",
  destructive:
    "h-10 border border-[#b3421e] bg-white px-5 text-[#b3421e] shadow-none hover:bg-[#fbe7df]",
};

export const Button = React.forwardRef(
  ({ className, variant = "default", size, ...props }, ref) => (
    <BaseButton
      ref={ref}
      variant={variant === "default" ? "default" : "ghost"}
      className={cn(
        "pay-figure rounded-full text-[14px] font-semibold leading-[1.3]",
        BUTTON[variant] ?? BUTTON.default,
        size === "sm" && "h-9 px-4",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "PayButton";
