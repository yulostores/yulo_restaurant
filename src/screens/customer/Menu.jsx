// Customer menu — GET /api/restaurants/:id/menu. The API returns a category
// tree; categories and food-type filters are derived from it, never hardcoded.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, ShoppingBag } from "lucide-react";

import { cn } from "@/lib/utils";
import { flattenMenu, useRestaurantMenu } from "@/hooks/customer/useMenu";
import CustomerLayout, { FoodThumb, VegDot, formatPrice } from "./CustomerLayout";
import { useCustomer } from "./CustomerApp";

// foodType values the API documents for a menu item.
const FOOD_FILTERS = [
  { value: "all",     label: "All" },
  { value: "veg",     label: "Veg" },
  { value: "non_veg", label: "Non-veg" },
  { value: "egg",     label: "Egg" },
];

export default function Menu() {
  const navigate = useNavigate();
  const { session, addToCart, cartCount, cartTotal } = useCustomer();

  const { data: menu = [], isLoading, isError, error } = useRestaurantMenu(session.restaurantId);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [foodFilter, setFoodFilter] = useState("all");

  const items = useMemo(() => flattenMenu(menu), [menu]);

  const categories = useMemo(
    () => ["All", ...menu.map((c) => c.name).filter(Boolean)],
    [menu],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (activeCategory !== "All" && item.categoryName !== activeCategory) return false;
      if (foodFilter !== "all" && item.foodType !== foodFilter) return false;
      if (!term) return true;
      return (
        item.name?.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term)
      );
    });
  }, [items, activeCategory, foodFilter, search]);

  if (!session.restaurantId) {
    return (
      <CustomerLayout title="Menu" showNav activeNav="Menu">
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          Scan a table QR code to open a restaurant menu.
        </p>
      </CustomerLayout>
    );
  }

  const footer = cartCount > 0 ? (
    <button
      type="button"
      onClick={() => navigate("/order/cart")}
      className="flex w-full items-center justify-between rounded-xl bg-brand-gradient px-4 py-3.5 text-white transition hover:brightness-105"
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <ShoppingBag className="h-4 w-4" />
        {cartCount} {cartCount === 1 ? "item" : "items"}
      </span>
      <span className="text-base font-bold">{formatPrice(cartTotal)}</span>
    </button>
  ) : null;

  return (
    <CustomerLayout title="Menu" showNav activeNav="Menu" footer={footer}>
      <div className="space-y-4 px-4 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dishes…"
            className="w-full rounded-xl border border-brand-cream bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-orange"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FOOD_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFoodFilter(f.value)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                foodFilter === f.value
                  ? "bg-brand-gradient text-white"
                  : "border border-brand-cream bg-white text-[#5a403e]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {categories.length > 1 ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCategory(c)}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
                  activeCategory === c
                    ? "bg-brand-orange/10 text-brand-orange"
                    : "border border-brand-cream bg-white text-[#5a403e]",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="px-4 pb-6">
        {isError ? (
          <p className="py-10 text-center text-sm text-brand-maroon">
            Couldn&apos;t load the menu: {error.message}
          </p>
        ) : isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading menu…</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {items.length === 0 ? "This restaurant hasn't published a menu yet." : "No dishes match your filters."}
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((item) => (
              <article
                key={item._id}
                className="flex gap-3 rounded-2xl border border-brand-cream/70 bg-white p-3"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/order/item/${item._id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <VegDot type={item.foodType} />
                    <h3 className="truncate font-bold">{item.name}</h3>
                  </div>
                  {item.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="font-bold text-brand-red">
                      {formatPrice(item.effectivePrice ?? item.sellingPrice)}
                    </span>
                    {item.discountedPrice && item.discountedPrice < item.sellingPrice ? (
                      <span className="text-xs text-muted-foreground line-through">
                        {formatPrice(item.sellingPrice)}
                      </span>
                    ) : null}
                    {item.prepTime ? (
                      <span className="text-xs text-muted-foreground">· {item.prepTime} min</span>
                    ) : null}
                  </div>
                </button>

                <div className="relative shrink-0">
                  <FoodThumb
                    src={item.image}
                    alt={item.name}
                    className="h-24 w-24 rounded-xl"
                  />
                  {item.isAvailable === false ? (
                    <span className="absolute inset-0 grid place-items-center rounded-xl bg-black/55 text-[11px] font-bold text-white">
                      Unavailable
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addToCart(item, 1)}
                      className="absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-bold text-white shadow-md"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
