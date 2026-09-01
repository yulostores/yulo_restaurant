// Waiter menu — GET /api/staff/:rId/waiter/menu, then
// POST /api/staff/:rId/waiter/orders against the active table session.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Send, UtensilsCrossed } from "lucide-react";

import { useStaffAuth } from "@/context/StaffAuthContext";
import { useCreateOrder, useWaiterMenu } from "@/hooks/staff/useWaiter";
import { useRestaurant } from "@/hooks/customer/useMenu";
import { cn } from "@/lib/utils";
import WaiterLayout, { formatPrice } from "./WaiterLayout";
import { useWaiter } from "./WaiterApp";

/* ── Flatten the category tree, tagging each item with its category ── */
function flattenMenu(categories = []) {
  const items = [];
  for (const cat of categories) {
    const catName = cat.name ?? "";
    for (const item of cat.items ?? []) items.push({ ...item, category: catName });
    for (const sub of cat.subCategories ?? []) {
      for (const item of sub.items ?? []) items.push({ ...item, category: catName });
    }
  }
  return items;
}

// The server's foodType vocabulary.
function priceOf(item) {
  return item.effectivePrice ?? item.discountedPrice ?? item.sellingPrice ?? 0;
}

/* ── food-type dot ── */
function FoodDot({ type }) {
  const t = (type ?? "").toLowerCase();
  if (t === "veg")
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-green-600">
        <span className="h-2 w-2 rounded-full bg-green-600" />
      </span>
    );
  if (t === "egg")
    return (
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-yellow-500">
        <span className="h-2 w-2 rounded-full bg-yellow-400" />
      </span>
    );
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-brand-maroon">
      <span className="h-2 w-2 rounded-full bg-brand-maroon" />
    </span>
  );
}

/* ── Food type filter row ── */
const FOOD_FILTERS = [
  { key: "all",     label: "All",     icon: <span className="h-2 w-2 rounded-full bg-white" /> },
  { key: "veg",     label: "Veg",     icon: <span className="h-2 w-2 rounded-full bg-green-500" /> },
  { key: "non_veg", label: "Non Veg", icon: <span className="h-2 w-2 rounded-full bg-brand-maroon" /> },
  { key: "egg",     label: "Egg",     icon: <span className="h-2 w-2 rounded-full bg-yellow-400" /> },
];

function matchesFoodFilter(item, key) {
  if (key === "all") return true;
  return item.foodType === key;
}

function itemTags(item) {
  const tags = [];
  const t = (item.foodType ?? "").toLowerCase();
  if (t === "veg")     tags.push("Veg");
  if (t === "non_veg") tags.push("Non Veg");
  if (t === "egg")     tags.push("Egg");
  if (item.prepTime)   tags.push(`${item.prepTime} min`);
  return tags.slice(0, 3);
}

/* ── Single item card ── */
function ItemCard({ item, inCart, onAdd, onRemove }) {
  const tags = itemTags(item);
  return (
    <div
      className={cn(
        "flex gap-3 rounded-2xl border border-white bg-white p-3.5 shadow-sm transition",
        item.isAvailable === false && "opacity-60",
        item.isAvailable !== false && "hover:shadow-md",
      )}
    >
      <div className="relative h-[90px] w-[90px] shrink-0 overflow-hidden rounded-xl bg-brand-cream/40">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            className="h-full w-full object-cover"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">🍽</div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5">
            <FoodDot type={item.foodType} />
            <p className="truncate text-sm font-bold text-[#24190f]">{item.name}</p>
          </div>
          <p className="mb-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {item.description}
          </p>
          {tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-brand-cream bg-brand-cream/30 px-2 py-0.5 text-[10px] font-medium text-[#5a403e]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-[#24190f]">{formatPrice(priceOf(item))}</p>
          {item.isAvailable !== false ? (
            inCart > 0 ? (
              <div className="flex items-center gap-0 overflow-hidden rounded-full bg-brand-gradient">
                <button
                  type="button"
                  onClick={() => onRemove(item._id)}
                  className="px-3 py-1.5 text-lg font-bold leading-none text-white transition hover:bg-white/10 active:scale-95"
                >
                  −
                </button>
                <span className="min-w-[20px] text-center text-sm font-bold text-white">
                  {inCart}
                </span>
                <button
                  type="button"
                  onClick={() => onAdd(item)}
                  className="px-3 py-1.5 text-lg font-bold leading-none text-white transition hover:bg-white/10 active:scale-95"
                >
                  +
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onAdd(item)}
                className="rounded-full bg-brand-gradient px-4 py-1.5 text-sm font-bold text-white transition hover:brightness-105 active:scale-95"
              >
                + Add
              </button>
            )
          ) : (
            <span className="rounded-full bg-[#F3F4F6] px-3 py-1.5 text-xs font-bold text-muted-foreground">
              Unavailable
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function MenuSection({ title, items, cart, onAdd, onRemove }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="shrink-0 text-lg font-bold text-[#24190f]">{title}</h2>
        <div className="h-px flex-1 bg-brand-cream/60" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <ItemCard
            key={item._id}
            item={item}
            inCart={cart.find((c) => c.menuItemId === item._id)?.quantity ?? 0}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Main ── */
export default function WaiterMenu() {
  const navigate = useNavigate();
  const { activeTable, cart, cartCount, subtotal, addToCart, setQuantity, clearCart } = useWaiter();
  const { staff } = useStaffAuth();
  const restaurantId = staff?.restaurantId;

  const { data: menu = [], isLoading, isError } = useWaiterMenu(restaurantId);
  // Public endpoint — readable with a staff token.
  const { data: restaurant } = useRestaurant(restaurantId);
  const { mutateAsync: createOrder, isPending: placing } = useCreateOrder(restaurantId);

  const [search, setSearch]                 = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [foodFilter, setFoodFilter]         = useState("all");
  const [showSearch, setShowSearch]         = useState(false);
  const [orderError, setOrderError]         = useState("");
  const [note, setNote]                     = useState("");

  const categoryNames = useMemo(
    () => menu.map((c) => c.name).filter(Boolean),
    [menu],
  );
  const allItems = useMemo(() => flattenMenu(menu), [menu]);

  function removeOne(menuItemId) {
    const line = cart.find((c) => c.menuItemId === menuItemId);
    if (line) setQuantity(menuItemId, line.quantity - 1);
  }

  // Select the first category once the menu lands.
  useEffect(() => {
    if (!activeCategory && categoryNames.length > 0) setActiveCategory(categoryNames[0]);
  }, [categoryNames, activeCategory]);

  async function placeOrder() {
    if (!activeTable?.sessionId) {
      setOrderError("Scan a table QR first — orders are placed against an open session.");
      return;
    }
    setOrderError("");
    try {
      await createOrder({
        tableSessionId: activeTable.sessionId,
        items: cart.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
        })),
        ...(note.trim() ? { specialInstructions: note.trim() } : {}),
      });
      clearCart();
      setNote("");
      navigate("/waiter");
    } catch (err) {
      setOrderError(err.message);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allItems.filter((item) => {
      const inCategory    = !activeCategory || item.category === activeCategory;
      const matchesType   = matchesFoodFilter(item, foodFilter);
      const matchesSearch = !term || item.name.toLowerCase().includes(term) || item.description.toLowerCase().includes(term);
      return inCategory && matchesType && matchesSearch;
    });
  }, [allItems, activeCategory, foodFilter, search]);

  if (isError) {
    return (
      <WaiterLayout>
        <p className="px-5 py-5 text-sm text-muted-foreground">Failed to load menu.</p>
      </WaiterLayout>
    );
  }

  return (
    <WaiterLayout>
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-[#FAFAF8]">
        <div className="flex items-center justify-between border-b border-brand-cream/60 px-4 py-3 sm:px-5">
          <div>
            <p className="text-lg font-bold text-brand-red">
              {restaurant?.name ?? "Menu"}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <UtensilsCrossed className="h-3 w-3" />
              {activeTable ? `Table ${activeTable.identifier}` : "No table selected"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowSearch((v) => !v)}
              className="rounded-full p-2 text-muted-foreground hover:bg-brand-cream/40 hover:text-[#24190f]"
            >
              <Search className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-full bg-brand-cream/50 text-muted-foreground hover:bg-brand-cream"
            >
              <UserRound className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search bar (toggle) */}
        {showSearch && (
          <div className="border-b border-brand-cream/60 px-4 py-2.5 sm:px-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search dishes…"
                className="w-full rounded-full border border-brand-cream/80 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-brand-orange"
              />
            </div>
          </div>
        )}

        {/* Food type filter */}
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FOOD_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFoodFilter(f.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition",
                foodFilter === f.key
                  ? "border-brand-maroon bg-brand-maroon text-white"
                  : "border-brand-cream/70 bg-white text-[#5a403e] hover:border-brand-maroon/30",
              )}
            >
              {f.icon}
              {f.label}
            </button>
          ))}
        </div>

        {/* Category tabs */}
        {categoryNames.length > 0 && (
          <div className="flex gap-5 overflow-x-auto border-b border-brand-cream/60 px-4 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {categoryNames.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "shrink-0 border-b-2 pb-2.5 pt-1 text-sm font-medium transition-colors",
                  activeCategory === cat
                    ? "border-brand-orange font-bold text-brand-orange"
                    : "border-transparent text-muted-foreground hover:text-[#24190f]",
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── Content ── */}
      <div className={cn("space-y-7 px-4 py-5 sm:px-5", cartCount > 0 && "pb-24")}>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-brand-cream/60 bg-white py-14 text-center text-sm text-muted-foreground">
            {allItems.length === 0 ? "No menu published yet." : "No items match this filter."}
          </div>
        ) : (
          <MenuSection
            title={activeCategory || "Menu"}
            items={filtered}
            cart={cart}
            onAdd={addToCart}
            onRemove={removeOne}
          />
        )}
      </div>

      {/* ── Floating order bar ── */}
      {cartCount > 0 && (
        <div className="fixed bottom-[64px] left-0 right-0 z-40 space-y-2 px-4 pb-2">
          {orderError ? (
            <p className="rounded-xl bg-[#FCE9E4] px-4 py-2 text-sm text-brand-maroon shadow">
              {orderError}
            </p>
          ) : null}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for the kitchen (optional)"
            className="w-full rounded-xl border border-brand-cream bg-white px-3 py-2 text-sm outline-none focus:border-brand-orange"
          />
          <div className="flex items-center justify-between rounded-2xl bg-brand-gradient px-5 py-3.5 shadow-lg">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/80">
                {cartCount} item{cartCount === 1 ? "" : "s"}
                {activeTable ? ` · Table ${activeTable.identifier}` : ""}
              </p>
              <p className="text-lg font-bold text-white">{formatPrice(subtotal)}</p>
            </div>
            <button
              type="button"
              onClick={placeOrder}
              disabled={placing}
              className="flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-white/30 disabled:opacity-60"
            >
              {placing ? "Sending…" : "Send to kitchen"} <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </WaiterLayout>
  );
}
