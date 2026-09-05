// Customer QR ordering app (/order/*). Self-contained mobile-first flow with
// its own nested routes and shared session + cart state (persisted so the OTP
// redirect and page refreshes keep context).
//
// Session context comes from the scanned QR URL, which the backend mints as
//   …/menu?restaurantId=<id>&tableId=<id>
// so `restaurantId` is always read from the URL — never defaulted to a literal.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useSearchParams } from "react-router-dom";

import { useCustomerAuth } from "@/context/CustomerAuthContext";

import QrLanding from "./QrLanding";
import CustomerLogin from "./CustomerLogin";
import OtpVerify from "./OtpVerify";
import Menu from "./Menu";
import ItemDetail from "./ItemDetail";
import Cart from "./Cart";
import Confirmation from "./Confirmation";
import OrderStatus from "./OrderStatus";
import CustomerBill from "./Bill";
import Offers from "./Offers";
import CustomerHelp from "./CustomerHelp";
import CustomerProfile from "./CustomerProfile";

const SESSION_KEY = "yulo_customer_session";
const CART_KEY = "yulo_customer_cart";

const EMPTY_SESSION = {
  restaurantId: null,
  tableId: null,
  verified: false,
  phone: "",
};

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

const CustomerContext = createContext(null);

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error("useCustomer must be used within CustomerApp");
  return ctx;
}

export default function CustomerApp() {
  const [params] = useSearchParams();
  const [session, setSession] = useState(() => readJson(SESSION_KEY, EMPTY_SESSION));
  const [cart, setCart] = useState(() => {
    try {
      const raw = window.localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Capture QR context from the URL as soon as it appears, so it survives the
  // login/OTP redirects. Switching restaurants clears the cart.
  const urlRestaurantId = params.get("restaurantId");
  const urlTableId = params.get("tableId");

  useEffect(() => {
    if (!urlRestaurantId && !urlTableId) return;
    setSession((current) => {
      const switched = urlRestaurantId && current.restaurantId && current.restaurantId !== urlRestaurantId;
      if (switched) setCart([]);
      return {
        ...current,
        restaurantId: urlRestaurantId ?? current.restaurantId,
        tableId: urlTableId ?? current.tableId,
      };
    });
  }, [urlRestaurantId, urlTableId]);

  useEffect(() => {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const api = useMemo(() => {
    // `item` is a menu item straight off the API: _id, name, effectivePrice, …
    function addToCart(item, quantity = 1, specialInstructions = "") {
      setCart((current) => {
        const existing = current.find((line) => line.menuItemId === item._id);
        if (existing) {
          return current.map((line) =>
            line.menuItemId === item._id
              ? {
                  ...line,
                  quantity: line.quantity + quantity,
                  specialInstructions: specialInstructions || line.specialInstructions,
                }
              : line,
          );
        }
        return [
          ...current,
          {
            menuItemId: item._id,
            name: item.name,
            price: item.effectivePrice ?? item.discountedPrice ?? item.sellingPrice ?? 0,
            image: item.image ?? null,
            foodType: item.foodType,
            quantity,
            specialInstructions,
          },
        ];
      });
    }

    function setQuantity(menuItemId, quantity) {
      setCart((current) =>
        quantity <= 0
          ? current.filter((line) => line.menuItemId !== menuItemId)
          : current.map((line) =>
              line.menuItemId === menuItemId ? { ...line, quantity } : line,
            ),
      );
    }

    function removeFromCart(menuItemId) {
      setCart((current) => current.filter((line) => line.menuItemId !== menuItemId));
    }

    function clearCart() {
      setCart([]);
    }

    return { addToCart, setQuantity, removeFromCart, clearCart };
  }, []);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const cartTotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);

  const auth = useCustomerAuth();

  const value = {
    session,
    setSession,
    cart,
    cartCount,
    cartTotal,
    auth,
    ...api,
  };

  return (
    <CustomerContext.Provider value={value}>
      <Routes>
        <Route index element={<QrLanding />} />
        <Route path="login" element={<CustomerLogin />} />
        <Route path="otp" element={<OtpVerify />} />
        <Route path="menu" element={<Guard><Menu /></Guard>} />
        <Route path="item/:id" element={<Guard><ItemDetail /></Guard>} />
        <Route path="cart" element={<Guard><Cart /></Guard>} />
        <Route path="confirmation/:orderId" element={<Guard><Confirmation /></Guard>} />
        <Route path="status/:orderId" element={<Guard><OrderStatus /></Guard>} />
        <Route path="bill" element={<Guard><CustomerBill /></Guard>} />
        <Route path="offers" element={<Guard><Offers /></Guard>} />
        <Route path="help" element={<Guard><CustomerHelp /></Guard>} />
        <Route path="profile" element={<Guard><CustomerProfile /></Guard>} />
        <Route path="*" element={<Navigate to="/order" replace />} />
      </Routes>
    </CustomerContext.Provider>
  );
}

// Redirect unauthenticated customers to login, preserving the destination.
function Guard({ children }) {
  const { auth } = useCustomer();
  const location = useLocation();
  if (!auth.isAuthenticated) {
    return <Navigate to="/order/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
