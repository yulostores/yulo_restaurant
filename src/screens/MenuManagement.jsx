// Menu Management — Figma node 186:2680 (Main Content only; sidebar comes from
// the shared DashboardLayout). Built with shadcn form primitives + Tailwind.
// Data from the mock layer: GET /restaurant_owner/menu-management.

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Upload,
} from "lucide-react";

import { useOwnerAuth } from "@/context/OwnerAuthContext";
import {
  useCategories,
  useCreateCategory,
  useCreateMenuItem,
  useMenuItems,
  useToggleMenuItem,
  useUpdateMenuItem,
} from "@/hooks/owner/useMenuItems";
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
import { Switch } from "@/components/ui/switch";
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
import { useObjectUrl } from "@/lib/useObjectUrl";

// A ₹-prefixed number input.
function RupeeInput({ id, value, defaultValue, onChange, className, placeholder }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        ₹
      </span>
      <Input
        id={id}
        inputMode="numeric"
        maxLength={9}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        // Whole rupees only: strip anything that isn't a digit as it is typed.
        onChange={(e) => {
          e.target.value = e.target.value.replace(/\D/g, "");
          onChange?.(e);
        }}
        className={cn("pl-7", className)}
      />
    </div>
  );
}

// A selectable chip (category / sub-category).
function Chip({ label, active, dashed, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition",
        active && "bg-brand-gradient text-white",
        !active && !dashed && "border border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
        dashed && "border border-dashed border-[#D1D5DB] text-muted-foreground hover:bg-muted",
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {label}
    </button>
  );
}

function VegDot({ type }) {
  const veg = type === "veg";
  return (
    <span
      className={cn(
        "grid h-4 w-4 place-items-center rounded-sm border",
        veg ? "border-brand-green" : "border-brand-maroon",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", veg ? "bg-brand-green" : "bg-brand-maroon")} />
    </span>
  );
}

const PREP_TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60];

const DESCRIPTION_MAX = 300;
const ITEM_NAME_MAX = 100;

const EMPTY_ITEM = {
  name: "", description: "", prepTime: 20,
  sellingPrice: "", halfPlatePrice: "",
  packagingCharge: "", availableOnline: true,
  categoryId: "", foodType: "veg",
};

// foodType display label → backend value. A pure-veg restaurant gets VEG only.
const FOOD_TYPE_OPTIONS = [
  { label: "VEG",     value: "veg" },
  { label: "NON-VEG", value: "non_veg" },
];

export default function MenuManagement() {
  const { restaurantId, approvalStatus, isApproved, restaurant } = useOwnerAuth();
  const pureVeg = !!restaurant?.isPureVeg;
  const foodTypes = pureVeg ? FOOD_TYPE_OPTIONS.filter((o) => o.value === "veg") : FOOD_TYPE_OPTIONS;

  const { data: currentItems = [], isLoading } = useMenuItems(restaurantId);
  const { data: categoryList = [] }            = useCategories(restaurantId);
  const createMutation         = useCreateMenuItem(restaurantId);
  const updateMutation         = useUpdateMenuItem(restaurantId);
  const createCategoryMutation = useCreateCategory(restaurantId);
  const toggleMutation         = useToggleMenuItem(restaurantId);

  const [item, setItem] = useState(EMPTY_ITEM);
  const [imageFile, setImageFile]       = useState(null);
  const [imageError, setImageError]     = useState("");
  const [dragging, setDragging]         = useState(false);
  // Preview a freshly picked file, else the saved image of the item being edited.
  const pickedUrl  = useObjectUrl(imageFile);
  const previewUrl = pickedUrl ?? item.image ?? null;
  const [statusMsg, setStatusMsg]       = useState("");
  const [newCatName, setNewCatName]     = useState("");
  const [newCatError, setNewCatError]   = useState("");
  const [showNewCat, setShowNewCat]     = useState(false);
  const [listSearch, setListSearch]     = useState("");
  const [listCategory, setListCategory] = useState("all");
  const [listStatus, setListStatus]     = useState("all");

  const categoryNameById = useMemo(
    () => Object.fromEntries(categoryList.map((c) => [c._id, c.name])),
    [categoryList],
  );

  const visibleItems = useMemo(() => {
    const term = listSearch.trim().toLowerCase();
    return currentItems.filter((mi) => {
      if (listCategory !== "all" && mi.categoryId !== listCategory) return false;
      if (listStatus === "available" && !mi.isAvailable) return false;
      if (listStatus === "unavailable" && mi.isAvailable) return false;
      return !term || (mi.name ?? "").toLowerCase().includes(term);
    });
  }, [currentItems, listSearch, listCategory, listStatus]);

  function pickImage(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return;
    }
    setImageError("");
    setImageFile(file);
  }

  function resetForm() {
    setImageError("");
    setItem(EMPTY_ITEM);
    setImageFile(null);
  }

  // POST/PATCH /menu-items are multipart/form-data.
  async function handleSubmit() {
    setStatusMsg("");
    const name = item.name.trim();
    if (!name || !item.categoryId || !item.sellingPrice) {
      setStatusMsg("Name, category and full plate price are required.");
      return;
    }
    if (name.length > ITEM_NAME_MAX) {
      setStatusMsg(`Item name must be at most ${ITEM_NAME_MAX} characters.`);
      return;
    }
    const full = Number(item.sellingPrice);
    const half = item.halfPlatePrice === "" || item.halfPlatePrice == null ? null : Number(item.halfPlatePrice);
    if (!(full > 0)) {
      setStatusMsg("Full plate price must be a positive amount.");
      return;
    }
    if (half != null && !(half > 0 && half < full)) {
      setStatusMsg("Half plate price must be more than ₹0 and less than the full plate price.");
      return;
    }
    const packaging = item.packagingCharge === "" || item.packagingCharge == null ? 0 : Number(item.packagingCharge);
    if (!(packaging >= 0 && packaging <= 500)) {
      setStatusMsg("Packaging charge must be ₹0 to ₹500.");
      return;
    }
    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", item.description ?? "");
    formData.append("sellingPrice", String(item.sellingPrice));
    // Always sent: an empty value is how removing a half plate (or an old discount, which the
    // form no longer offers) reaches the server on an edit.
    formData.append("halfPlatePrice", half == null ? "" : String(half));
    formData.append("discountedPrice", "");
    formData.append("packagingCharge", String(packaging));
    formData.append("availableOnline", item.availableOnline ? "true" : "false");
    formData.append("categoryId", item.categoryId);
    formData.append("foodType", pureVeg ? "veg" : item.foodType);
    formData.append("prepTime", String(item.prepTime));
    if (imageFile) formData.append("image", imageFile);
    try {
      if (item._id) await updateMutation.mutateAsync({ itemId: item._id, formData });
      else          await createMutation.mutateAsync(formData);
      setStatusMsg(item._id ? "Item updated!" : "Item created!");
      resetForm();
    } catch (err) {
      setStatusMsg(err.message);
    }
  }

  // Load an existing item back into the form for editing.
  function editItem(existing) {
    setImageError("");
    setItem({
      _id:             existing._id,
      image:           existing.image ?? null,
      name:            existing.name ?? "",
      description:     existing.description ?? "",
      prepTime:        existing.prepTime ?? 20,
      // An item saved with an old discounted price keeps charging that price as its full plate.
      sellingPrice:    existing.discountedPrice ?? existing.sellingPrice ?? "",
      halfPlatePrice:  existing.halfPlatePrice ?? "",
      packagingCharge: existing.packagingCharge ? String(existing.packagingCharge) : "",
      availableOnline: existing.availableOnline !== false,
      categoryId:      existing.categoryId ?? "",
      foodType:        existing.foodType ?? "veg",
    });
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // The pencil on a Menu Items card navigates here with the item in router state. Nothing
  // read it, so "edit" always opened a blank Add Item form. Loaded once, then the state is
  // cleared so a reload doesn't pull the item back over later work.
  const location = useLocation();
  const navigate = useNavigate();
  const handedItem = location.state?.item;
  useEffect(() => {
    if (!handedItem) return;
    editItem(handedItem);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handedItem]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <p className="text-muted-foreground">Loading menu management…</p>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div>
        <h1 className="text-2xl font-bold">Menu Management</h1>
        <p className="text-sm text-muted-foreground">
          Create, update and manage restaurant menu items.
        </p>
      </div>

      {approvalStatus && !isApproved ? (
        <div className="rounded-2xl border border-brand-cream bg-[#FFF3E0] px-4 py-3 text-sm text-[#8a4b16]">
          <strong className="capitalize">{approvalStatus}</strong> — categories and menu
          items unlock once a platform admin approves this restaurant.
        </div>
      ) : null}

      {/* Item Information */}
      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">Item Information</h2>
        </CardHeader>
        <CardContent className="space-y-5">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickImage(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "relative flex h-36 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed bg-[#FCFAF7] text-center transition hover:border-brand-orange/50",
              dragging ? "border-brand-orange" : "border-[#E2DFDE]",
            )}
          >
            {previewUrl ? (
              <>
                <img src={previewUrl} alt="Food preview" className="absolute inset-0 h-full w-full object-cover" />
                <span className="absolute bottom-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                  Click or drop to replace
                </span>
              </>
            ) : (
              <>
                <span className="grid h-12 w-12 place-items-center rounded-full bg-[#FFDAD6]/50 text-brand-orange">
                  <ImagePlus className="h-5 w-5" />
                </span>
                <span className="text-sm text-muted-foreground">
                  Upload Food Photo or Drag &amp; Drop
                </span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }}
            />
          </label>
          {imageError && <p className="-mt-3 text-xs text-red-500">{imageError}</p>}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="menu-item-name">Item Name</Label>
              <span className="text-xs text-muted-foreground">{item.name.length}/{ITEM_NAME_MAX}</span>
            </div>
            <Input id="menu-item-name"
              value={item.name}
              maxLength={ITEM_NAME_MAX}
              onChange={(e) => setItem((i) => ({ ...i, name: e.target.value.slice(0, ITEM_NAME_MAX) }))}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="menu-description">Description</Label>
              <span className="text-xs text-muted-foreground">
                {(item.description ?? "").length}/{DESCRIPTION_MAX}
              </span>
            </div>
            <Textarea id="menu-description" value={item.description} maxLength={DESCRIPTION_MAX} onChange={(e) => setItem((i) => ({ ...i, description: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="menu-preparation-time">Preparation Time</Label>
            <Select value={String(item.prepTime)} onValueChange={(v) => setItem((i) => ({ ...i, prepTime: Number(v) }))}>
              <SelectTrigger id="menu-preparation-time" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREP_TIME_OPTIONS.map((o) => (
                  <SelectItem key={o} value={String(o)}>{o} min</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Category & Pricing */}
      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">Category &amp; Pricing</h2>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Category</Label>
            <div className="flex flex-wrap gap-2">
              {categoryList.map((c) => (
                <Chip
                  key={c._id}
                  label={c.name}
                  active={c._id === item.categoryId}
                  onClick={() => setItem((i) => ({ ...i, categoryId: c._id, categoryName: c.name }))}
                />
              ))}
              <Chip label="Add Category" dashed icon={Plus} onClick={() => setShowNewCat((v) => !v)} />
            </div>
            {showNewCat && (
              <form
                className="flex gap-2"
                // Enter in the name box saves too, and a refused name (a duplicate, too long)
                // now says why — the click handler had no catch, so it failed silently.
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newCatName.trim() || createCategoryMutation.isPending) return;
                  setNewCatError("");
                  try {
                    const res = await createCategoryMutation.mutateAsync({ name: newCatName.trim() });
                    const cat = res.data?.data?.category;
                    if (cat) setItem((i) => ({ ...i, categoryId: cat._id, categoryName: cat.name }));
                    setNewCatName("");
                    setShowNewCat(false);
                  } catch (err) {
                    setNewCatError(err.message ?? "Couldn't add the category");
                  }
                }}
              >
                <Input
                  aria-label="New category name"
                  value={newCatName}
                  onChange={(e) => { setNewCatName(e.target.value); setNewCatError(""); }}
                  placeholder="Category name"
                  maxLength={60}
                  className="h-8 text-sm"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!newCatName.trim() || createCategoryMutation.isPending}
                >
                  Save
                </Button>
              </form>
            )}
            {newCatError ? <p role="alert" className="text-xs text-red-600">{newCatError}</p> : null}
            {!item.categoryId && <p className="text-xs text-muted-foreground">Select or create a category</p>}
          </div>

          <div className="space-y-2">
            <Label>Food Type</Label>
            <div className="flex flex-wrap gap-2">
              {foodTypes.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setItem((i) => ({ ...i, foodType: value }))}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                    value === item.foodType
                      ? "border-brand-green bg-[#E8F5EC] text-brand-green"
                      : "border-brand-cream bg-white text-[#5a403e] hover:bg-brand-cream/30",
                  )}
                >
                  <VegDot type={value} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="menu-full-plate-price">Full Plate Price</Label>
              <RupeeInput id="menu-full-plate-price"
                value={item.sellingPrice}
                onChange={(e) => setItem((i) => ({ ...i, sellingPrice: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="menu-half-plate-price">Half Plate Price</Label>
              <RupeeInput id="menu-half-plate-price"
                value={item.halfPlatePrice}
                onChange={(e) => setItem((i) => ({ ...i, halfPlatePrice: e.target.value }))}
                placeholder="Optional"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty if the dish comes in one size. When set, guests choose Half or Full.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="menu-packaging-charge">Packaging Charge</Label>
              <RupeeInput id="menu-packaging-charge"
                value={item.packagingCharge}
                onChange={(e) => setItem((i) => ({ ...i, packagingCharge: e.target.value }))}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Per plate, on delivery and takeaway orders only — never on dine-in.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="menu-available-online">Available Online</Label>
              <div className="flex items-center gap-3 rounded-lg border border-input px-3 py-2">
                <Switch
                  id="menu-available-online"
                  checked={item.availableOnline}
                  onCheckedChange={(on) => setItem((i) => ({ ...i, availableOnline: on }))}
                />
                <span className="text-sm">{item.availableOnline ? "On the delivery app" : "Dine-in only"}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Off: hidden from the delivery app; still on the table QR menu and the waiter app.
              </p>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-3">
        {statusMsg && (
          <span className={`text-sm font-medium ${statusMsg.includes("!") ? "text-brand-green" : "text-red-500"}`}>
            {statusMsg}
          </span>
        )}
        <Button variant="outline" className="px-6" onClick={resetForm} disabled={createMutation.isPending || updateMutation.isPending}>
          Clear
        </Button>
        <Button className="bg-brand-gradient px-6 text-white hover:brightness-105" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
          {createMutation.isPending || updateMutation.isPending
            ? "Saving…"
            : item._id ? "Update Item" : "Create Item"}
        </Button>
      </div>

      {/* Current Menu Items */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold">Current Menu Items</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Search dishes..."
              className="w-56 pl-9"
            />
          </div>
          <Select value={listCategory} onValueChange={setListCategory}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categoryList.map((c) => (
                <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={listStatus} onValueChange={setListStatus}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="unavailable">Unavailable</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map((mi) => (
          <Card key={mi._id} className="overflow-hidden">
            <div className="relative h-36">
              {mi.image ? (
                <img src={mi.image} alt={mi.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground text-xs">No image</div>
              )}
              {mi.foodType && (
                <Badge
                  className={cn(
                    "absolute left-3 top-3",
                    mi.foodType === "veg" ? "bg-[#E8F5EC] text-brand-green" : "bg-[#FCE9E4] text-brand-maroon",
                  )}
                >
                  {mi.foodType.replace("_", " ").toUpperCase()}
                </Badge>
              )}
            </div>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-bold leading-tight">{mi.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {categoryNameById[mi.categoryId] ?? "Uncategorised"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => editItem(mi)}
                  className="shrink-0 text-muted-foreground hover:text-brand-orange"
                  aria-label={`Edit ${mi.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-bold text-brand-red">
                    {mi.halfPlatePrice != null ? `Half ₹${mi.halfPlatePrice} · Full ` : ""}₹{mi.effectivePrice ?? mi.discountedPrice ?? mi.sellingPrice}
                  </span>
                  {mi.packagingCharge ? (
                    <span className="text-[11px] text-muted-foreground">+ ₹{mi.packagingCharge} packing</span>
                  ) : null}
                  {mi.availableOnline === false ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                      Dine-in only
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">{mi.prepTime ? `${mi.prepTime} min` : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[11px] font-bold", mi.isAvailable ? "text-brand-green" : "text-muted-foreground")}>
                    {mi.isAvailable ? "AVAILABLE" : "UNAVAILABLE"}
                  </span>
                  <Switch
                    checked={!!mi.isAvailable}
                    disabled={toggleMutation.isPending}
                    onCheckedChange={() => toggleMutation.mutate(mi._id)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
