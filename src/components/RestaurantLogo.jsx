// The store's logo as it appears in the app chrome (sidebar header, top bar).
//
// The logo is uploaded on /store-settings, so it is absent for a brand-new owner
// and can change mid-session; Radix swaps in the initial-letter mark whenever the
// image is missing or fails to load, which keeps the circle the same size either
// way and stops the header from shifting.

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export default function RestaurantLogo({ name, src, className }) {
  const letter = (name ?? "").trim().charAt(0).toUpperCase();

  return (
    <Avatar className={cn("h-9 w-9", className)}>
      {src ? <AvatarImage src={src} alt={name ? `${name} logo` : "Store logo"} className="object-contain" /> : null}
      <AvatarFallback className="bg-brand-dark2 text-sm font-semibold text-brand-cream2">
        {letter}
      </AvatarFallback>
    </Avatar>
  );
}
