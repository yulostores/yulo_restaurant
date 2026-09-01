// Menu Management — Figma node 186:2680 (Main Content only; sidebar comes from
// the shared DashboardLayout). Built with shadcn form primitives + Tailwind.
// Data from the mock layer: GET /restaurant_owner/menu-management.

import { useMemo, useState } from "react";
import {
  ImagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
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

// A ₹-prefixed number input.
function RupeeInput({ value, defaultValue, onChange, className }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        ₹
      </span>
      <Input value={value} defaultValue={defaultValue} onChange={onChange} className={cn("pl-7", className)} />
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

const EMPTY_ITEM = {
  name: "", description: "", prepTime: 20,
  sellingPrice: "", discountedPrice: "",
  categoryId: "", foodType: "veg",
};

// foodType display label → backend value
const FOOD_TYPE_OPTIONS = [
  { label: "VEG",     value: "veg" },
  { label: "NON-VEG", value: "non_veg" },
  { label: "EGG",     value: "egg" },
];

export default function MenuManagement() {
  const { restaurantId, approvalStatus, isApproved } = useOwnerAuth();

  const { data: currentItems = [], isLoading } = useMenuItems(restaurantId);
  const { data: categoryList = [] }            = useCategories(restaurantId);
  const createMutation         = useCreateMenuItem(restaurantId);
  const updateMutation         = useUpdateMenuItem(restaurantId);
  const createCategoryMutation = useCreateCategory(restaurantId);
  const toggleMutation         = useToggleMenuItem(restaurantId);

  const [item, setItem] = useState(EMPTY_ITEM);
  const [ingredients, setIngredients]   = useState([]);
  const [newIngredient, setNewIngredient] = useState("");
  const [imageFile, setImageFile]       = useState(null);
  const [statusMsg, setStatusMsg]       = useState("");
  const [newCatName, setNewCatName]     = useState("");
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

  function addIngredient() {
    const value = newIngredient.trim();
    if (!value) return;
    setIngredients((list) => (list.includes(value) ? list : [...list, value]));
    setNewIngredient("");
  }

  function removeIngredient(value) {
    setIngredients((list) => list.filter((i) => i !== value));
  }

  function resetForm() {
    setItem(EMPTY_ITEM);
    setIngredients([]);
    setNewIngredient("");
    setImageFile(null);
  }

  // POST/PATCH /menu-items are multipart/form-data. `ingredients` goes over the
  // wire as a JSON array string, per the documented field list.
  async function handleSubmit() {
    setStatusMsg("");
    if (!item.name || !item.categoryId || !item.sellingPrice) {
      setStatusMsg("Name, category and price are required.");
      return;
    }
    const formData = new FormData();
    formData.append("name", item.name);
    formData.append("description", item.description ?? "");
    formData.append("sellingPrice", String(item.sellingPrice));
    if (item.discountedPrice) formData.append("discountedPrice", String(item.discountedPrice));
    formData.append("categoryId", item.categoryId);
    formData.append("foodType", item.foodType);
    formData.append("prepTime", String(item.prepTime));
    formData.append("ingredients", JSON.stringify(ingredients));
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
    setItem({
      _id:             existing._id,
      name:            existing.name ?? "",
      description:     existing.description ?? "",
      prepTime:        existing.prepTime ?? 20,
      sellingPrice:    existing.sellingPrice ?? "",
      discountedPrice: existing.discountedPrice ?? "",
      categoryId:      existing.categoryId ?? "",
      foodType:        existing.foodType ?? "veg",
    });
    setIngredients(existing.ingredients ?? []);
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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
          <label className="flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#E2DFDE] bg-[#FCFAF7] text-center transition hover:border-brand-orange/50">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#FFDAD6]/50 text-brand-orange">
              <ImagePlus className="h-5 w-5" />
            </span>
            <span className="text-sm text-muted-foreground">
              Upload Food Photo or Drag &amp; Drop
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
          </label>

          <div className="space-y-1.5">
            <Label>Item Name</Label>
            <Input value={item.name} onChange={(e) => setItem((i) => ({ ...i, name: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Description</Label>
              <span className="text-xs text-muted-foreground">
                {(item.description ?? "").length}/{DESCRIPTION_MAX}
              </span>
            </div>
            <Textarea value={item.description} maxLength={DESCRIPTION_MAX} onChange={(e) => setItem((i) => ({ ...i, description: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <Label>Preparation Time</Label>
            <Select value={String(item.prepTime)} onValueChange={(v) => setItem((i) => ({ ...i, prepTime: Number(v) }))}>
              <SelectTrigger className="w-full">
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
              <Chip label="+ Add Category" dashed icon={Plus} onClick={() => setShowNewCat((v) => !v)} />
            </div>
            {showNewCat && (
              <div className="flex gap-2">
                <Input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Category name"
                  className="h-8 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={!newCatName.trim() || createCategoryMutation.isPending}
                  onClick={async () => {
                    const res = await createCategoryMutation.mutateAsync({ name: newCatName.trim() });
                    const cat = res.data?.data?.category;
                    if (cat) setItem((i) => ({ ...i, categoryId: cat._id, categoryName: cat.name }));
                    setNewCatName("");
                    setShowNewCat(false);
                  }}
                >
                  Save
                </Button>
              </div>
            )}
            {!item.categoryId && <p className="text-xs text-muted-foreground">Select or create a category</p>}
          </div>

          <div className="space-y-2">
            <Label>Food Type</Label>
            <div className="flex flex-wrap gap-2">
              {FOOD_TYPE_OPTIONS.map(({ label, value }) => (
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
              <Label>Selling Price (MRP)</Label>
              <RupeeInput
                value={item.sellingPrice}
                onChange={(e) => setItem((i) => ({ ...i, sellingPrice: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Discounted Price</Label>
              <RupeeInput
                value={item.discountedPrice}
                onChange={(e) => setItem((i) => ({ ...i, discountedPrice: e.target.value }))}
                placeholder="Optional"
              />
              <p className="text-xs text-muted-foreground">
                When set, guests are charged this instead of the MRP.
              </p>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Ingredients — the API stores a simple string list per item. */}
      <Card>
        <CardHeader className="pb-4">
          <h2 className="text-base font-bold">Ingredients</h2>
          <p className="text-xs text-muted-foreground">
            Shown to guests on the item page. Saved with the item.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {ingredients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ingredients listed yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ingredients.map((ing) => (
                <span
                  key={ing}
                  className="flex items-center gap-1.5 rounded-full bg-brand-cream/40 px-3 py-1.5 text-sm capitalize text-[#5a403e]"
                >
                  {ing}
                  <button
                    type="button"
                    onClick={() => removeIngredient(ing)}
                    className="text-muted-foreground hover:text-brand-maroon"
                    aria-label={`Remove ${ing}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={newIngredient}
              onChange={(e) => setNewIngredient(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addIngredient(); }
              }}
              placeholder="e.g. Basmati Rice"
              className="max-w-xs"
            />
            <Button
              type="button"
              onClick={addIngredient}
              className="bg-brand-orange text-white hover:bg-brand-orange/90"
            >
              Add
            </Button>
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
                  <span className="font-bold text-brand-red">₹{mi.effectivePrice ?? mi.discountedPrice ?? mi.sellingPrice}</span>
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
