// Revoke a personal offer that is still open (sent → applied). Always confirmed; the server
// refuses an offer already being used on an order (OFFER_NOT_REVOCABLE), which is said in words.

import { useRef, useState } from "react";
import { Ban } from "lucide-react";

import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useRevokeOffer } from "@/hooks/owner/useLiveSessions";
import { offerErrorText } from "@/lib/offerRules";

export const OPEN_OFFER_STATUSES = ["sent", "delivered", "viewed", "applied"];

export default function RevokeOfferButton({ restaurantId, offer, customerName }) {
  const toast = useToast();
  const revoke = useRevokeOffer(restaurantId);
  const [open, setOpen] = useState(false);
  const busy = useRef(false);

  if (!OPEN_OFFER_STATUSES.includes(offer.status)) return null;

  const confirm = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await revoke.mutateAsync(offer.id);
      toast.success(`Offer "${offer.title}" revoked`);
    } catch (err) {
      toast.error(offerErrorText(err));
    } finally {
      busy.current = false;
      setOpen(false);
    }
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Revoke ${offer.title}`}>
        <Ban /> Revoke
      </Button>
      <ConfirmDialog
        open={open}
        tone="danger"
        title={`Revoke "${offer.title}"?`}
        description={`${customerName ? `${customerName} can` : "The customer can"} no longer use it. This can't be undone.`}
        confirmLabel="Revoke offer"
        pendingLabel="Revoking…"
        pending={revoke.isPending}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
