// Offers & Coupons (/offers) — Figma node 149:7. Create coupon/automatic offers
// with a full discount configuration, a live coupon preview, and a managed list
// of active/scheduled/expired offers (PRD §17).

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, ImagePlus, Pencil, Trash2, X } from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  useDiscounts,
  useCreateDiscount,
  useUpdateDiscount,
  useDeleteDiscount,
  usePublishDiscount,
} from "@/hooks/owner/useDiscounts";
import { useMenuItems } from "@/hooks/owner/useMenuItems";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const DISCOUNT_TYPES = [
  { value: "percentage",  label: "Percentage" },
  { value: "flat_amount", label: "Flat Amount" },
  { value: "free_item",   label: "Free Item" },
  { value: "tablewise",   label: "Tablewise offer" },
];

const APPLICABLE = [
  { value: "dine_in",  label: "Dine-in" },
  { value: "delivery", label: "Delivery" },
  { value: "both",     label: "Both" },
];

// The API models exactly two states: draft and active.
const STATUS_VARIANT = { active: "ok", draft: "muted" };

const EMPTY = {
  name: "",
  // `image` is the File waiting to be uploaded; `imageUrl` the Cloudinary URL already
  // stored on the offer. A pending File wins in the preview.
  image: null,
  imageUrl: "",
  type: "coupon",
  code: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  discountName: "",
  item: "",
  minOrder: "",
  itemApplicability: "entire_menu",
  tableNumbers: "",
  applicableFor: "dine_in",
  validFrom: "",
  validTo: "",
};

function discountLabel(offer) {
  if (offer.discountType === "percentage")  return `${offer.discountValue}% Off`;
  if (offer.discountType === "flat_amount") return `₹${offer.discountValue} Off`;
  if (offer.discountType === "free_item") return "Free Item";
  return "Tableware";
}

function validityLabel(offer) {
  if (!offer.validFrom && !offer.validTo) return "—";
  const fmt = (v) =>
    v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—";
  return `${fmt(offer.validFrom)} – ${fmt(offer.validTo)}`;
}

const FIELD_LABELS = {
  offerName:              "Offer name",
  code:                   "Coupon code",
  percentage:             "Discount (%)",
  flatAmount:             "Discount amount",
  freeItemId:             "Free item",
  applicableTableNumbers: "Table numbers",
  minimumOrderValue:      "Minimum order value",
  startDate:              "Start date",
  endDate:                "End date",
};

// A rejected body comes back as a generic "Invalid discount data" message with the real
// reason in `details.fieldErrors` (zod's flatten). Showing only the message left the
// screen silent while the network tab showed a 400.
function describeApiError(err) {
  const parts = Object.entries(err?.details?.fieldErrors ?? {})
    .filter(([, messages]) => messages?.length)
    .map(([field, messages]) => `${FIELD_LABELS[field] ?? field}: ${messages[0]}`);
  if (parts.length) return parts.join(" · ");

  const formErrors = err?.details?.formErrors;
  if (formErrors?.length) return formErrors[0];
  return err?.message ?? "Something went wrong";
}

// ISO timestamp → the YYYY-MM-DD an <input type="date"> expects, in local time. Slicing
// the ISO string instead lands a day early anywhere ahead of UTC: an offer starting
// midnight IST is stored as 18:30Z the previous day.
function toDateInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Toggle chip used for offer type, discount type, and applicable-for.
function Pill({ active, onClick, children, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-sm font-medium transition",
        active
          ? "bg-brand-gradient text-white"
          : "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
        className,
      )}
    >
      {children}
    </button>
  );
}

// The endpoint accepts JPEG/PNG/WebP up to 2MB (middleware/upload.js on the server).
// Checking here too turns a rejected 400 into an inline message before the round trip.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function imageProblem(file) {
  if (!IMAGE_TYPES.includes(file.type)) return "Offer image must be a PNG, JPG or WebP";
  if (file.size > MAX_IMAGE_BYTES) return "Offer image must be under 2MB";
  return "";
}

// Blob URL for a freshly picked File, revoked when it is replaced or the screen unmounts.
function useObjectUrl(file) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) {
      setUrl("");
      return undefined;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

// Click-or-drop picker for the offer artwork. `preview` is whatever should be shown right
// now — the pending file's blob URL, or the stored Cloudinary URL.
function ImageDropzone({ preview, hasFile, onSelect, onClear, onError }) {
  const [dragging, setDragging] = useState(false);

  function accept(file) {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) {
      onError(problem);
      return;
    }
    onError("");
    onSelect(file);
  }

  if (preview) {
    return (
      <div className="relative h-28 overflow-hidden rounded-xl border border-brand-cream">
        <img src={preview} alt="Offer artwork" className="h-full w-full object-cover" />
        <div className="absolute right-2 top-2 flex gap-2">
          <label className="cursor-pointer rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-[#5a403e] hover:bg-white">
            Replace
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                accept(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {hasFile ? (
            <button
              type="button"
              onClick={() => { onError(""); onClear(); }}
              className="grid h-7 w-7 place-items-center rounded-full bg-white/90 text-[#5a403e] hover:bg-white"
              aria-label="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        accept(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        "flex h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-[#FCFAF7] text-center text-muted-foreground hover:border-brand-orange/50",
        dragging ? "border-brand-orange bg-brand-orange/5" : "border-[#E2DFDE]",
      )}
    >
      <ImagePlus className="h-5 w-5" />
      <span className="text-sm">Click to upload or drag and drop</span>
      <span className="text-xs">PNG, JPG up to 2MB</span>
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function RupeeInput({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        ₹
      </span>
      <Input value={value} onChange={onChange} placeholder={placeholder} className="pl-7" />
    </div>
  );
}

export default function Offers() {
  const { restaurantId } = useOwnerAuth();
  const { data: offers = [], isLoading } = useDiscounts(restaurantId);
  const { data: menuItems = [] }         = useMenuItems(restaurantId);
  const items = menuItems;

  const createMutation  = useCreateDiscount(restaurantId);
  const updateMutation  = useUpdateDiscount(restaurantId);
  const deleteMutation  = useDeleteDiscount(restaurantId);
  const publishMutation = usePublishDiscount(restaurantId);

  const [form, setForm]               = useState(EMPTY);
  const [search, setSearch]           = useState("");
  const [error, setError]             = useState("");
  const [editingOffer, setEditingOffer] = useState(null);
  const [editForm, setEditForm]       = useState(null);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Blob previews for the pending files, created once here and shared with the dropzone
  // and the live preview so a File is never turned into two object URLs.
  const formImagePreview = useObjectUrl(form.image);
  const editImagePreview = useObjectUrl(editForm?.image ?? null);

  // The form already speaks the API's vocabulary, so this is a straight map
  // onto the discriminated-union body documented for POST /discounts.
  function toPayload(f) {
    const payload = {
      offerName:          f.name,
      type:               f.discountType,
      code:               f.code || undefined,
      applicableTo:       f.applicableFor,
      minimumOrderValue:  f.minOrder ? Number(f.minOrder) : 0,
      // Both dates arrive from <input type="date"> as bare YYYY-MM-DD, i.e. midnight. Sent
      // as-is the offer expired the instant its last day began, and a single-day offer was
      // rejected outright — the server requires endDate > startDate.
      startDate:          new Date(`${f.validFrom}T00:00:00`).toISOString(),
      endDate:            new Date(`${f.validTo}T23:59:59.999`).toISOString(),
    };

    if (payload.type === "percentage")  payload.percentage  = Number(f.discountValue);
    if (payload.type === "flat_amount") payload.flatAmount  = Number(f.discountValue);
    if (payload.type === "free_item")   payload.freeItemId  = f.item;
    if (payload.type === "tablewise") {
      payload.flatAmount = Number(f.discountValue);
      payload.applicableTableNumbers = f.tableNumbers
        ? f.tableNumbers.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    }
    return payload;
  }

  // The endpoint takes multipart/form-data when artwork rides along, so the payload is
  // flattened: arrays go over JSON-encoded (the server parses them back) and the file is
  // appended as the `image` part. Without a file it stays a plain JSON body.
  function toBody(f) {
    const payload = toPayload(f);
    if (!(f.image instanceof File)) return payload;

    const fd = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) continue;
      if (typeof value === "object") fd.append(key, JSON.stringify(value));
      else fd.append(key, String(value));
    }
    fd.append("image", f.image);
    return fd;
  }

  // Drafts live on the server: POST /discounts always creates status "draft",
  // and PATCH …/publish promotes it to "active".
  const drafts = useMemo(() => offers.filter((o) => o.status === "draft"), [offers]);

  // Mirrors the server's schema (controllers/owner/discount.controller.js) so an
  // incomplete form is answered here instead of coming back as a bare 400.
  function validate(f) {
    if (!f.name.trim()) return "Add an offer name";
    if (f.type === "coupon" && !f.code.trim()) return "Add a coupon code";

    const raw = String(f.discountValue ?? "").trim();
    const value = Number(raw);
    if (f.discountType === "percentage") {
      if (!raw) return "Enter a discount percentage";
      if (!Number.isFinite(value) || value < 1 || value > 100)
        return "Discount must be between 1% and 100%";
    }
    if (f.discountType === "flat_amount" || f.discountType === "tablewise") {
      if (!raw) return "Enter a discount amount";
      if (!Number.isFinite(value) || value <= 0) return "Discount amount must be more than ₹0";
    }
    if (f.discountType === "free_item" && !f.item) return "Pick the free item";
    if (f.discountType === "tablewise" && !f.tableNumbers.trim())
      return "List at least one table number";

    if (!f.validFrom || !f.validTo) return "Start date and end date are required";
    if (f.validTo < f.validFrom) return "End date cannot be before the start date";
    return "";
  }

  async function saveDraft() {
    const problem = validate(form);
    if (problem) { setError(problem); return; }
    setError("");
    try {
      await createMutation.mutateAsync(toBody(form));
      setForm(EMPTY);
    } catch (err) {
      setError(describeApiError(err));
    }
  }

  // Load a server draft back into the composer for editing.
  function loadDraft(draft) {
    setEditingOffer(draft);
    setEditForm(fromOffer(draft));
  }

  async function deleteDraft(draftId) {
    setError("");
    try {
      await deleteMutation.mutateAsync(draftId);
    } catch (err) {
      setError(describeApiError(err));
    }
  }

  async function publishDraft(draft) {
    setError("");
    try {
      await publishMutation.mutateAsync(draft._id);
    } catch (err) {
      setError(describeApiError(err));
    }
  }

  // Create then immediately publish, so "Publish" goes live in one action.
  async function publish() {
    const problem = validate(form);
    if (problem) { setError(problem); return; }
    setError("");
    try {
      const res = await createMutation.mutateAsync(toBody(form));
      const created = res.data?.data?.discount;
      if (created?._id) await publishMutation.mutateAsync(created._id);
      setForm(EMPTY);
    } catch (err) {
      setError(describeApiError(err));
    }
  }

  // Server discount → composer form shape.
  function fromOffer(offer) {
    return {
      ...EMPTY,
      name:          offer.offerName ?? "",
      code:          offer.code ?? "",
      imageUrl:      offer.image ?? "",
      type:          offer.code ? "coupon" : "auto",
      discountType:  offer.type ?? "percentage",
      discountValue: String(offer.percentage ?? offer.flatAmount ?? ""),
      item:          offer.freeItemId ?? "",
      minOrder:      offer.minimumOrderValue ? String(offer.minimumOrderValue) : "",
      applicableFor: offer.applicableTo ?? "both",
      tableNumbers:  (offer.applicableTableNumbers ?? []).join(", "),
      validFrom:     toDateInput(offer.startDate),
      validTo:       toDateInput(offer.endDate),
    };
  }

  function startEdit(offer) {
    setEditForm(fromOffer(offer));
    setEditingOffer(offer);
  }

  function cancelEdit() {
    setEditingOffer(null);
    setEditForm(null);
  }

  async function saveEdit() {
    const problem = validate(editForm);
    if (problem) { setError(problem); return; }
    setError("");
    try {
      await updateMutation.mutateAsync({ dId: editingOffer._id, body: toBody(editForm) });
      cancelEdit();
    } catch (err) {
      setError(describeApiError(err));
    }
  }

  async function deleteOffer(id) {
    await deleteMutation.mutateAsync(id);
    cancelEdit();
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  // The drafts panel already lists drafts — this table shows published offers.
  const visible = useMemo(
    () =>
      offers.filter(
        (o) =>
          o.status !== "draft" &&
          (o.offerName ?? "").toLowerCase().includes(search.toLowerCase()),
      ),
    [offers, search],
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Loading offers…</p>
      </DashboardLayout>
    );
  }

  /* ── Edit view ── */
  if (editingOffer && editForm) {
    const setEF = (patch) => setEditForm((f) => ({ ...f, ...patch }));
    return (
      <DashboardLayout>
        <button
          type="button"
          onClick={cancelEdit}
          className="flex items-center gap-1.5 text-sm font-medium text-brand-orange hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Program Overview
        </button>

        <div>
          <h1 className="text-2xl font-bold">Edit coupons and offers</h1>
          <p className="text-sm text-muted-foreground">
            Configure rewards and visit requirements for this specific milestone.
          </p>
        </div>

        {error ? <p className="text-sm text-brand-maroon">{error}</p> : null}

        <Card>
          <CardContent className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-2">
            {/* Offer Name — full width */}
            <div className="col-span-full space-y-1.5">
              <label className="text-sm font-medium text-[#24190f]">Offer Name</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEF({ name: e.target.value })}
                placeholder="Welcome Drink"
              />
            </div>

            {/* Reward Type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#24190f]">Reward Type</label>
              <Select value={editForm.discountType} onValueChange={(v) => setEF({ discountType: v })}>
                <SelectTrigger className="focus:ring-0 focus:ring-offset-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCOUNT_TYPES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Minimum Order Value */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#24190f]">Minimum Order Value</label>
              <RupeeInput
                value={editForm.minOrder}
                onChange={(e) => setEF({ minOrder: e.target.value })}
                placeholder="300"
              />
            </div>

            {/* Start Date */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#24190f]">Start Date</label>
              <Input
                type="date"
                value={editForm.validFrom}
                onChange={(e) => setEF({ validFrom: e.target.value })}
              />
            </div>

            {/* End Date */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#24190f]">End Date</label>
              <Input
                type="date"
                value={editForm.validTo}
                onChange={(e) => setEF({ validTo: e.target.value })}
              />
            </div>

            {/* Offer Image — full width */}
            <div className="col-span-full space-y-1.5">
              <label className="text-sm font-medium text-[#24190f]">Offer Image</label>
              <ImageDropzone
                preview={editImagePreview || editForm.imageUrl}
                hasFile={!!editForm.image}
                onSelect={(file) => setEF({ image: file })}
                onClear={() => setEF({ image: null })}
                onError={setError}
              />
            </div>

            {/* Description — full width */}
            <div className="col-span-full space-y-1.5">
              <label className="text-sm font-medium text-[#24190f]">Description</label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEF({ description: e.target.value })}
                rows={4}
                placeholder="Describe the offer for your customers…"
              />
            </div>
          </CardContent>
        </Card>

        {/* Footer actions */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => deleteOffer(editingOffer._id ?? editingOffer.id)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-maroon"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={cancelEdit} className="focus-visible:ring-0">
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={saving}
              className="bg-brand-gradient px-6 text-white hover:brightness-105"
            >
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold">Offers &amp; Coupons</h1>
        <p className="text-sm text-muted-foreground">
          Create promotions, reward loyal customers, and increase repeat purchases.
        </p>
      </div>

      {error ? <p className="text-sm text-brand-maroon">{error}</p> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
        {/* Builder */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-4">
              <h2 className="text-base font-bold">Create Offer / Coupon</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Offer Type</Label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "coupon", title: "Coupon", note: "Requires code at checkout" },
                    { value: "automatic", title: "Automatic", note: "Applies to all eligible orders" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => set({ type: opt.value })}
                      className={cn(
                        "rounded-xl border p-3 text-left transition",
                        form.type === opt.value
                          ? "border-brand-orange bg-brand-orange/5"
                          : "border-brand-cream bg-white hover:bg-brand-cream/20",
                      )}
                    >
                      <p className="text-sm font-bold">{opt.title}</p>
                      <p className="text-xs text-muted-foreground">{opt.note}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Offer Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Summer Sundae Special"
                />
              </div>

              {form.type === "coupon" ? (
                <div className="space-y-1.5">
                  <Label>Coupon Code</Label>
                  <div className="relative">
                    <Input
                      value={form.code}
                      onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                      placeholder="ICECREAMFREE"
                      className="pr-10 font-mono tracking-wide"
                    />
                    <Copy className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label>Offer Image</Label>
                <ImageDropzone
                  preview={formImagePreview || form.imageUrl}
                  hasFile={!!form.image}
                  onSelect={(file) => set({ image: file })}
                  onClear={() => set({ image: null })}
                  onError={setError}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => set({ description: e.target.value })}
                  placeholder="Enjoy our signature gourmet sundae on the house with any ₹300 purchase."
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <h2 className="text-base font-bold">Discount Configuration</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Discount Type</Label>
                <div className="flex flex-wrap gap-2">
                  {DISCOUNT_TYPES.map((d) => (
                    <Pill key={d.value} active={form.discountType === d.value} onClick={() => set({ discountType: d.value })}>
                      {d.label}
                    </Pill>
                  ))}
                </div>
              </div>

              {/* Percentage */}
              {form.discountType === "percentage" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Discount (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={form.discountValue}
                      onChange={(e) => set({ discountValue: e.target.value })}
                      placeholder="20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Minimum Order Value</Label>
                    <RupeeInput
                      value={form.minOrder}
                      onChange={(e) => set({ minOrder: e.target.value })}
                      placeholder="300"
                    />
                  </div>
                </div>
              )}

              {/* Flat Amount */}
              {form.discountType === "flat_amount" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Offer Name</Label>
                    <Input
                      value={form.discountName}
                      onChange={(e) => set({ discountName: e.target.value })}
                      placeholder="₹ 100 OFF Weekend Deal"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Discount amount</Label>
                    <RupeeInput
                      value={form.discountValue}
                      onChange={(e) => set({ discountValue: e.target.value })}
                      placeholder="100"
                    />
                  </div>
                  <div className="col-span-full space-y-1.5">
                    <Label>Item Applicability</Label>
                    <Select
                      value={form.itemApplicability}
                      onValueChange={(v) => set({ itemApplicability: v })}
                    >
                      <SelectTrigger className="focus:ring-0 focus:ring-offset-0">
                        <SelectValue placeholder="Select applicability" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entire_menu">Entire Menu</SelectItem>
                        <SelectItem value="categories">Categories</SelectItem>
                        <SelectItem value="specific_items">Specific Items</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Free Item */}
              {form.discountType === "free_item" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Select Item</Label>
                    <Input
                      value={form.item}
                      onChange={(e) => set({ item: e.target.value })}
                      placeholder="Gourmet Sundae"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Minimum Order Value</Label>
                    <RupeeInput
                      value={form.minOrder}
                      onChange={(e) => set({ minOrder: e.target.value })}
                      placeholder="30"
                    />
                  </div>
                </div>
              )}

              {/* Tablewise offer */}
              {form.discountType === "tablewise" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Offer Name</Label>
                    <Input
                      value={form.discountName}
                      onChange={(e) => set({ discountName: e.target.value })}
                      placeholder="₹ 100 OFF Weekend Deal"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Discount amount</Label>
                    <RupeeInput
                      value={form.discountValue}
                      onChange={(e) => set({ discountValue: e.target.value })}
                      placeholder="100"
                    />
                  </div>
                  <div className="col-span-full space-y-1.5">
                    <Label>Table Number(s)</Label>
                    <Input
                      value={form.tableNumbers}
                      onChange={(e) => set({ tableNumbers: e.target.value })}
                      placeholder="EX: 4, 5, 6, 7"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label>Validity</Label>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Start Date</Label>
                    <Input
                      type="date"
                      value={form.validFrom}
                      onChange={(e) => set({ validFrom: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">End Date</Label>
                    <Input
                      type="date"
                      value={form.validTo}
                      onChange={(e) => set({ validTo: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Applicable For</Label>
                <div className="flex flex-wrap gap-2">
                  {APPLICABLE.map((a) => (
                    <Pill key={a.value} active={form.applicableFor === a.value} onClick={() => set({ applicableFor: a.value })}>
                      {a.label}
                    </Pill>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setForm(EMPTY)}
                  className="border-transparent bg-transparent text-[#5A403E] hover:bg-transparent hover:text-[#5A403E] focus-visible:ring-0"
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  onClick={saveDraft}
                  className="border-[#EFE7DD] bg-white text-[#24190F] hover:bg-white hover:text-[#24190F] focus-visible:ring-0"
                >
                  Save Draft
                </Button>
                <Button
                  onClick={publish}
                  disabled={saving}
                  className="bg-brand-gradient px-6 text-white hover:brightness-105"
                >
                  {saving ? "Publishing…" : "Publish Offer"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live preview */}
        <div>
          <Card className="sticky top-6 overflow-hidden">
            <CardHeader className="pb-3">
              <h2 className="text-base font-bold">Live Preview</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Real-time form preview */}
              <div className="overflow-hidden rounded-2xl border border-dashed border-brand-orange/50">
                {formImagePreview || form.imageUrl ? (
                  <img
                    src={formImagePreview || form.imageUrl}
                    alt="Offer artwork"
                    className="h-32 w-full object-cover"
                  />
                ) : (
                  <div className="grid h-32 place-items-center bg-gradient-to-br from-brand-saffron to-brand-red text-white">
                    <ImagePlus className="h-7 w-7 opacity-80" />
                  </div>
                )}
                <div className="space-y-2 p-4">
                  <p className="text-lg font-extrabold uppercase text-brand-red">
                    {form.name || "Your offer title"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {form.description || "Offer description appears here for customers."}
                  </p>
                  <div className="flex items-center justify-between border-t border-dashed border-brand-cream pt-2.5">
                    <span className="font-mono text-sm font-bold tracking-wider text-brand-orange">
                      {form.type === "coupon" ? form.code || "CODE" : "AUTO-APPLIED"}
                    </span>
                    {form.minOrder ? (
                      <span className="text-xs text-muted-foreground">Min. order ₹{form.minOrder}</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <p className="text-center text-xs text-muted-foreground">
                {discountLabel({ discountType: form.discountType, discountValue: form.discountValue || 0 })} ·{" "}
                {APPLICABLE.find((a) => a.value === form.applicableFor)?.label}
              </p>

              {/* Saved drafts */}
              {drafts.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-brand-cream/70" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Saved Drafts ({drafts.length})
                    </span>
                    <div className="h-px flex-1 bg-brand-cream/70" />
                  </div>
                  {drafts.map((draft) => (
                    <div
                      key={draft._id}
                      className="overflow-hidden rounded-xl border border-brand-cream bg-white"
                    >
                      <div className="flex items-start justify-between gap-2 px-3.5 pt-3.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#24190f]">{draft.offerName}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {discountLabel({
                              discountType: draft.type,
                              discountValue: draft.percentage ?? draft.flatAmount ?? 0,
                            })}
                            {draft.code ? (
                              <span className="ml-2 font-mono font-semibold text-brand-orange">{draft.code}</span>
                            ) : null}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600">
                          Draft
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 divide-x divide-brand-cream/60 border-t border-brand-cream/60">
                        <button
                          type="button"
                          onClick={() => loadDraft(draft)}
                          className="py-2.5 text-xs font-medium text-muted-foreground transition hover:bg-brand-cream/20 hover:text-[#24190f]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => publishDraft(draft)}
                          disabled={saving}
                          className="py-2.5 text-xs font-medium text-brand-orange transition hover:bg-brand-orange/5 disabled:opacity-50"
                        >
                          Publish
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteDraft(draft._id)}
                          className="py-2.5 text-xs font-medium text-muted-foreground transition hover:bg-red-50 hover:text-red-500"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground/60">
                  Saved drafts will appear here
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Active offers */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <h2 className="text-base font-bold">Active Offers</h2>
            <p className="text-xs text-muted-foreground">Manage and track your ongoing restaurant promotions.</p>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search offers..."
            className="w-56"
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-brand-cream/60">
                <TableHead className="pl-6">Offer Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((offer) => (
                <TableRow key={offer._id ?? offer.id}>
                  <TableCell className="pl-6">
                    <span className="font-semibold">{offer.offerName}</span>
                    {offer.code ? (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{offer.code}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="capitalize text-muted-foreground">{offer.type}</TableCell>
                  <TableCell className="font-medium">{discountLabel(offer)}</TableCell>
                  <TableCell className="text-muted-foreground">{validityLabel(offer)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[offer.status] ?? "muted"} className="uppercase">
                      {offer.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-6">
                    <div className="flex items-center justify-end gap-3">
                      <button type="button" onClick={() => startEdit(offer)} className="text-muted-foreground hover:text-brand-orange" aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteOffer(offer._id ?? offer.id)}
                        className="text-muted-foreground hover:text-brand-maroon"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No offers found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
