const params = new URLSearchParams(window.location.search);
const restaurantId = params.get("restaurantId");
const tableNumber = params.get("tableNumber");

const restaurantNameEl = document.getElementById("restaurantName");
const heroTextEl = document.getElementById("heroText");
const tableBadgeEl = document.getElementById("tableBadge");
const itemCountBadgeEl = document.getElementById("itemCountBadge");
const statusTextEl = document.getElementById("statusText");
const menuStateEl = document.getElementById("menuState");
const menuGridEl = document.getElementById("menuGrid");
const orderStatusEl = document.getElementById("orderStatus");
const emptyCartStateEl = document.getElementById("emptyCartState");
const selectedItemsEl = document.getElementById("selectedItems");
const orderTotalEl = document.getElementById("orderTotal");
const placeOrderButtonEl = document.getElementById("placeOrderButton");

let currentRestaurant = null;
const selectedQuantities = new Map();

const themes = [
  {
    bg: "linear-gradient(135deg, #f8fafc 0%, #fff7ed 48%, #ecfdf5 100%)",
    surface: "rgba(255, 255, 255, 0.92)",
    surfaceStrong: "#ffffff",
    text: "#111827",
    muted: "#64748b",
    accent: "#e4572e",
    accentStrong: "#c2410c",
    accentSoft: "rgba(228, 87, 46, 0.12)",
    border: "rgba(15, 23, 42, 0.1)",
    shadow: "0 20px 55px rgba(15, 23, 42, 0.12)",
  },
  {
    bg: "linear-gradient(135deg, #f7fee7 0%, #f8fafc 46%, #e0f2fe 100%)",
    surface: "rgba(255, 255, 255, 0.92)",
    surfaceStrong: "#ffffff",
    text: "#10241c",
    muted: "#526579",
    accent: "#16805f",
    accentStrong: "#116149",
    accentSoft: "rgba(22, 128, 95, 0.13)",
    border: "rgba(16, 36, 28, 0.1)",
    shadow: "0 20px 55px rgba(20, 73, 56, 0.12)",
  },
  {
    bg: "linear-gradient(135deg, #fff1f2 0%, #f8fafc 45%, #fef9c3 100%)",
    surface: "rgba(255, 255, 255, 0.92)",
    surfaceStrong: "#ffffff",
    text: "#2f1c11",
    muted: "#6b5f55",
    accent: "#d85d2a",
    accentStrong: "#a84316",
    accentSoft: "rgba(216, 93, 42, 0.13)",
    border: "rgba(47, 28, 17, 0.1)",
    shadow: "0 20px 55px rgba(101, 52, 19, 0.12)",
  },
  {
    bg: "linear-gradient(135deg, #eef2ff 0%, #f8fafc 46%, #dcfce7 100%)",
    surface: "rgba(255, 255, 255, 0.92)",
    surfaceStrong: "#ffffff",
    text: "#182033",
    muted: "#5d667a",
    accent: "#3454d1",
    accentStrong: "#243ea7",
    accentSoft: "rgba(52, 84, 209, 0.12)",
    border: "rgba(24, 32, 51, 0.1)",
    shadow: "0 20px 55px rgba(37, 59, 141, 0.12)",
  },
];

const dishImageMatches = [
  { keywords: ["biryani"], src: "hyderabadi-biryani.png" },
  {
    keywords: ["paneer butter", "butter masala"],
    src: "paneer-butter-masala.png",
  },
  { keywords: ["pizza", "margherita"], src: "margherita-pizza.png" },
  { keywords: ["chicken tikka", "tikka"], src: "chicken-tikka.png" },
  { keywords: ["mango", "lassi"], src: "mango-lassi.png" },
  { keywords: ["brownie", "chocolate"], src: "chocolate-brownie.png" },
];

function hashString(input) {
  return Array.from(input).reduce(
    (total, char) => total + char.charCodeAt(0),
    0,
  );
}

function setTheme(restaurant) {
  const key = `${restaurant?.id ?? ""}${restaurant?.name ?? ""}`;
  const theme = themes[hashString(key) % themes.length];

  Object.entries({
    "--bg": theme.bg,
    "--surface": theme.surface,
    "--surface-strong": theme.surfaceStrong,
    "--text": theme.text,
    "--muted": theme.muted,
    "--accent": theme.accent,
    "--accent-strong": theme.accentStrong,
    "--accent-soft": theme.accentSoft,
    "--border": theme.border,
    "--shadow": theme.shadow,
  }).forEach(([property, value]) => {
    document.documentElement.style.setProperty(property, value);
  });
}

function formatPrice(price) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

function normalizeImageSrc(src) {
  if (!src) {
    return "";
  }

  if (window.location.protocol === "file:" && src.startsWith("/menu/")) {
    return `../public${src}`;
  }

  return src;
}

function getMenuAssetSrc(filename) {
  return window.location.protocol === "file:"
    ? `../public/menu/${filename}`
    : `/menu/${filename}`;
}

document.documentElement.style.setProperty(
  "--hero-image",
  `url("${getMenuAssetSrc("hyderabadi-biryani.png")}")`,
);

function getDishImage(item) {
  const explicitImage = item.image || item.imageUrl || item.photo;

  if (explicitImage) {
    return normalizeImageSrc(explicitImage);
  }

  const title = String(item.title ?? item.name ?? "").toLowerCase();
  const match = dishImageMatches.find(({ keywords }) =>
    keywords.some((keyword) => title.includes(keyword)),
  );

  return match ? getMenuAssetSrc(match.src) : "";
}

function getDishInitials(title) {
  const words = String(title || "Menu Item")
    .trim()
    .split(/\s+/)
    .slice(0, 2);

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("") || "MI";
}

function setError(message) {
  restaurantNameEl.textContent = "Menu unavailable";
  heroTextEl.textContent = message;
  statusTextEl.textContent = "Unable to load menu";
  menuStateEl.textContent = message;
  menuGridEl.classList.add("hidden");
  orderStatusEl.textContent = "Ordering unavailable";
  placeOrderButtonEl.disabled = true;
}

function getRecipes() {
  return Array.isArray(currentRestaurant?.recipies)
    ? currentRestaurant.recipies
    : [];
}

function getSelectedItems() {
  return getRecipes()
    .map((item) => ({
      ...item,
      quantity: selectedQuantities.get(item.id) ?? 0,
    }))
    .filter((item) => item.quantity > 0);
}

function updateCart() {
  const selectedItems = getSelectedItems();
  const total = selectedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  orderTotalEl.textContent = formatPrice(total);
  placeOrderButtonEl.disabled = selectedItems.length === 0;

  if (selectedItems.length === 0) {
    emptyCartStateEl.classList.remove("hidden");
    selectedItemsEl.classList.add("hidden");
    orderStatusEl.textContent = "Select dishes to continue";
    selectedItemsEl.innerHTML = "";
    return;
  }

  emptyCartStateEl.classList.add("hidden");
  selectedItemsEl.classList.remove("hidden");
  orderStatusEl.textContent = tableNumber
    ? `Ordering for table ${tableNumber}`
    : "Ready to place order";

  selectedItemsEl.innerHTML = selectedItems
    .map(
      (item) => `
        <article class="selected-item">
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${item.quantity} x ${formatPrice(item.price)}</p>
          </div>
          <strong>${formatPrice(item.price * item.quantity)}</strong>
        </article>
      `,
    )
    .join("");
}

function bindImageFallbacks() {
  menuGridEl.querySelectorAll(".dish-image").forEach((image) => {
    image.addEventListener("error", () => {
      image.closest(".dish-media")?.classList.add("is-empty");
      image.remove();
    });
  });
}

function updateQuantity(recipeId, nextQuantity) {
  if (nextQuantity <= 0) {
    selectedQuantities.delete(recipeId);
  } else {
    selectedQuantities.set(recipeId, nextQuantity);
  }

  const recipe = getRecipes().find((item) => item.id === recipeId);
  const quantityValueEl = document.querySelector(
    `[data-quantity-for="${recipeId}"]`,
  );

  if (quantityValueEl) {
    quantityValueEl.textContent = selectedQuantities.get(recipeId) ?? 0;
  }

  if (recipe) {
    updateCart();
  }
}

function bindQuantityControls() {
  menuGridEl.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const recipeId = button.dataset.recipeId;
      const action = button.dataset.action;
      const currentQuantity = selectedQuantities.get(recipeId) ?? 0;

      updateQuantity(
        recipeId,
        action === "increase" ? currentQuantity + 1 : currentQuantity - 1,
      );
    });
  });
}

function renderRestaurant(restaurant) {
  currentRestaurant = restaurant;
  setTheme(restaurant);

  const recipes = getRecipes();

  restaurantNameEl.textContent = restaurant.name;
  heroTextEl.textContent = `${recipes.length} handpicked dishes currently listed for this restaurant.`;
  statusTextEl.textContent = "Freshly loaded from the restaurant record";
  itemCountBadgeEl.textContent = `${recipes.length} item${recipes.length === 1 ? "" : "s"}`;

  if (tableNumber) {
    tableBadgeEl.textContent = `Table ${tableNumber}`;
    tableBadgeEl.classList.remove("hidden");
  }

  if (recipes.length === 0) {
    menuStateEl.textContent = "No dishes added yet for this restaurant.";
    menuGridEl.classList.add("hidden");
    updateCart();
    return;
  }

  menuStateEl.classList.add("hidden");
  menuGridEl.classList.remove("hidden");
  menuGridEl.innerHTML = recipes
    .map((item, index) => {
      const ingredients =
        item.ingredients?.length > 0
          ? item.ingredients.join(" / ")
          : "Ingredients will be updated soon";
      const imageSrc = getDishImage(item);
      const itemTitle = escapeHtml(item.title);
      const recipeId = escapeHtml(item.id);

      return `
        <article class="dish-card" style="animation-delay: ${index * 80}ms">
          <div class="dish-media${imageSrc ? "" : " is-empty"}">
            ${
              imageSrc
                ? `<img class="dish-image" src="${escapeHtml(imageSrc)}" alt="${itemTitle}" loading="lazy" />`
                : ""
            }
            <span class="dish-initials">${escapeHtml(getDishInitials(item.title))}</span>
          </div>
          <div class="dish-body">
            <div class="dish-head">
              <div>
                <h3 class="dish-title">${itemTitle}</h3>
                <p class="ingredients">${escapeHtml(ingredients)}</p>
              </div>
              <span class="price-pill">${formatPrice(item.price)}</span>
            </div>
            <div class="quantity-row">
              <p class="price-note">Prepared for dine-in ordering.</p>
              <div class="quantity-controls">
                <button class="quantity-button" type="button" aria-label="Decrease ${itemTitle}" data-action="decrease" data-recipe-id="${recipeId}">-</button>
                <span class="quantity-value" data-quantity-for="${recipeId}">0</span>
                <button class="quantity-button" type="button" aria-label="Increase ${itemTitle}" data-action="increase" data-recipe-id="${recipeId}">+</button>
              </div>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  bindQuantityControls();
  bindImageFallbacks();
  updateCart();
}

async function placeOrder() {
  const selectedItems = getSelectedItems();

  if (!currentRestaurant || selectedItems.length === 0) {
    return;
  }

  placeOrderButtonEl.disabled = true;
  orderStatusEl.textContent = "Submitting order...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        restaurantId: currentRestaurant.id,
        tableNumber,
        items: selectedItems.map((item) => ({
          recipeId: item.id,
          quantity: item.quantity,
        })),
      }),
    });

    const payload = await response.json();

    if (!response.ok || payload?.status !== "success") {
      throw new Error(payload?.message || "Unable to place order.");
    }

    selectedQuantities.clear();
    menuGridEl
      .querySelectorAll("[data-quantity-for]")
      .forEach((element) => (element.textContent = "0"));
    updateCart();
    orderStatusEl.textContent = `Order placed at ${new Date(
      payload.data.order.time,
    ).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch (error) {
    orderStatusEl.textContent = error.message;
    placeOrderButtonEl.disabled = false;
    return;
  }

  placeOrderButtonEl.disabled = false;
}

async function loadMenu() {
  if (!restaurantId) {
    setError("Missing restaurantId in the menu URL.");
    return;
  }

  try {
    const response = await fetch(`/api/restaurants/${restaurantId}/menu`);
    const payload = await response.json();

    if (
      !response.ok ||
      payload?.status !== "success" ||
      !payload?.data?.restaurant
    ) {
      throw new Error(
        payload?.message || "Restaurant menu could not be loaded.",
      );
    }

    renderRestaurant(payload.data.restaurant);
  } catch (error) {
    setError(error.message);
  }
}

placeOrderButtonEl.addEventListener("click", placeOrder);

loadMenu();
