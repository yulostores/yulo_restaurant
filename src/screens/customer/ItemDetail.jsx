// Item detail — the item is looked up in the restaurant menu returned by
// GET /api/restaurants/:id/menu (there is no single-menu-item public endpoint).

import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Minus, Plus } from "lucide-react";

import { flattenMenu, useRestaurantMenu } from "@/hooks/customer/useMenu";
import CustomerLayout, { FoodThumb, VegDot, formatPrice } from "./CustomerLayout";
import { useCustomer } from "./CustomerApp";

export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, addToCart } = useCustomer();

  const { data: menu = [], isLoading, isError, error } = useRestaurantMenu(session.restaurantId);

  const [quantity, setQuantity] = useState(1);
  const [instructions, setInstructions] = useState("");

  const item = useMemo(
    () => flattenMenu(menu).find((i) => String(i._id) === String(id)) ?? null,
    [menu, id],
  );

  if (isError) {
    return (
      <CustomerLayout title="Dish" showBack>
        <p className="px-5 py-10 text-center text-sm text-brand-maroon">
          Couldn&apos;t load this dish: {error.message}
        </p>
      </CustomerLayout>
    );
  }

  if (isLoading) {
    return (
      <CustomerLayout title="Dish" showBack>
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Loading…</p>
      </CustomerLayout>
    );
  }

  if (!item) {
    return (
      <CustomerLayout title="Dish" showBack>
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          This dish is no longer on the menu.
        </p>
      </CustomerLayout>
    );
  }

  const unitPrice = item.effectivePrice ?? item.sellingPrice ?? 0;
  const unavailable = item.isAvailable === false;

  function add() {
    addToCart(item, quantity, instructions.trim());
    navigate("/order/menu");
  }

  const footer = (
    <button
      type="button"
      onClick={add}
      disabled={unavailable}
      className="flex w-full items-center justify-between rounded-xl bg-brand-gradient px-4 py-3.5 text-white transition hover:brightness-105 disabled:opacity-50"
    >
      <span className="text-sm font-semibold">
        {unavailable ? "Currently unavailable" : "Add to cart"}
      </span>
      <span className="text-base font-bold">{formatPrice(unitPrice * quantity)}</span>
    </button>
  );

  return (
    <CustomerLayout title={item.name} showBack footer={footer}>
      <FoodThumb src={item.image} alt={item.name} className="h-56 w-full" />

      <div className="space-y-5 px-5 py-5">
        <div>
          <div className="flex items-center gap-2">
            <VegDot type={item.foodType} />
            <h2 className="text-xl font-bold">{item.name}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.categoryName}
            {item.subCategoryName ? ` · ${item.subCategoryName}` : ""}
            {item.prepTime ? ` · ${item.prepTime} min prep` : ""}
          </p>
        </div>

        {item.description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
        ) : null}

        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-brand-red">{formatPrice(unitPrice)}</span>
          {item.discountedPrice && item.discountedPrice < item.sellingPrice ? (
            <span className="text-sm text-muted-foreground line-through">
              {formatPrice(item.sellingPrice)}
            </span>
          ) : null}
        </div>

        {item.ingredients?.length ? (
          <div>
            <p className="mb-2 text-sm font-bold">Ingredients</p>
            <div className="flex flex-wrap gap-1.5">
              {item.ingredients.map((ing) => (
                <span
                  key={ing}
                  className="rounded-full bg-brand-cream/40 px-3 py-1 text-xs capitalize text-[#5a403e]"
                >
                  {ing}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-sm font-bold">Quantity</p>
          <div className="flex w-fit items-center gap-4 rounded-xl border border-brand-cream bg-white px-3 py-2">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="grid h-7 w-7 place-items-center rounded-lg bg-brand-cream/40 text-[#5a403e]"
              aria-label="Decrease quantity"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center font-bold">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="grid h-7 w-7 place-items-center rounded-lg bg-brand-cream/40 text-[#5a403e]"
              aria-label="Increase quantity"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-bold">Special instructions</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Less spicy, no onions"
            rows={3}
            className="w-full resize-none rounded-xl border border-brand-cream bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-orange"
          />
        </div>
      </div>
    </CustomerLayout>
  );
}
