// Waiter portal (/waiter/*). A light staff portal with shared "active table
// session + running order" state so the waiter can build an order on the Menu
// screen and fire it from the Dashboard.
//
// Orders are placed against a tableSessionId (POST /api/staff/:rId/waiter/orders),
// which is opened by scanning the table QR — so the active table is always a
// real session from the server, never a placeholder.

import { createContext, useContext, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import WaiterDashboard from "./WaiterDashboard";
import WaiterMenu from "./WaiterMenu";
import WaiterOrders from "./WaiterOrders";
import WaiterRequests from "./WaiterRequests";
import WaiterSettings from "./WaiterSettings";

const WaiterContext = createContext(null);

export function useWaiter() {
  const ctx = useContext(WaiterContext);
  if (!ctx) throw new Error("useWaiter must be used within WaiterApp");
  return ctx;
}

export default function WaiterApp() {
  // { sessionId, tableId, identifier } — null until a table is scanned/picked.
  const [activeTable, setActiveTable] = useState(null);
  const [cart, setCart] = useState([]);

  const api = useMemo(() => {
    // `item` is a menu item from the API: _id, name, effectivePrice, foodType.
    function addToCart(item, quantity = 1) {
      setCart((current) => {
        const existing = current.find((line) => line.menuItemId === item._id);
        if (existing) {
          return current.map((line) =>
            line.menuItemId === item._id
              ? { ...line, quantity: line.quantity + quantity }
              : line,
          );
        }
        return [
          ...current,
          {
            menuItemId: item._id,
            name: item.name,
            price: item.effectivePrice ?? item.discountedPrice ?? item.sellingPrice ?? 0,
            foodType: item.foodType,
            quantity,
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

    function clearCart() {
      setCart([]);
    }

    return { addToCart, setQuantity, clearCart };
  }, []);

  const value = {
    activeTable,
    setActiveTable,
    cart,
    cartCount: cart.reduce((sum, l) => sum + l.quantity, 0),
    subtotal: cart.reduce((sum, l) => sum + l.price * l.quantity, 0),
    ...api,
  };

  return (
    <WaiterContext.Provider value={value}>
      <Routes>
        <Route index element={<WaiterDashboard />} />
        <Route path="menu" element={<WaiterMenu />} />
        <Route path="orders" element={<WaiterOrders />} />
        <Route path="requests" element={<WaiterRequests />} />
        <Route path="settings" element={<WaiterSettings />} />
        <Route path="*" element={<Navigate to="/waiter" replace />} />
      </Routes>
    </WaiterContext.Provider>
  );
}
