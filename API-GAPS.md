# API Gaps

Everything the frontend needs that **API.md does not document**. The app now
calls only documented endpoints; each gap below is either rendered as an explicit
"not available yet" state, worked around with a documented endpoint, or is a
mismatch the backend should confirm.

Legend for status:
- **Blocked** — the feature cannot work at all; the UI states this plainly.
- **Worked around** — shipped using a different documented endpoint; less than ideal.
- **Verify** — the frontend assumes something the doc leaves ambiguous.

---

## 1. Blocked — no endpoint exists

### 1.1 Customer assistance requests (call waiter / water / bill / cleaning)
Designed into the customer app, the waiter portal and the manager portal.
There is no assistance-request resource of any kind.

```
POST   /api/restaurants/:id/requests          { type, note, tableId }
GET    /api/restaurants/:id/requests          — the guest's own requests
GET    /api/staff/:restaurantId/requests      — staff queue
PATCH  /api/staff/:restaurantId/requests/:id  { status: open|acknowledged|resolved }
```

Rendered as an unavailable state in:
[src/screens/shared/RequestsBoard.jsx](src/screens/shared/RequestsBoard.jsx),
[src/screens/customer/CustomerHelp.jsx](src/screens/customer/CustomerHelp.jsx).

---

### 1.2 Customer-facing offers
Discounts exist only under the owner-scoped `/api/owner/:restaurantId/discounts`
routes, which require a `restaurant_owner` token. A guest cannot list a
restaurant's active offers, and `POST /api/orders` accepts **no coupon field**,
so a code can never be redeemed.

```
GET  /api/restaurants/:id/discounts     — public, active only
POST /api/orders                        — accept a `couponCode` field
```

Rendered as an unavailable state in
[src/screens/customer/Offers.jsx](src/screens/customer/Offers.jsx).

---

### 1.3 Password change
`PATCH /api/users/me` documents only `name` and `phone`, and no route in the
backend changes a password. `hashPassword`/`verifyPassword` already exist in
`services/auth.service.js`, so this is a controller + route away.

```
PATCH /api/users/me/password        { currentPassword, newPassword }
```

Not surfaced in [src/screens/Profile.jsx](src/screens/Profile.jsx) at all — the
screen used to render the endpoint list to the owner, which leaked internal API
detail into a customer-facing UI.

**Owner profile photo is no longer a gap.** `PATCH /api/users/me` now also accepts
`multipart/form-data` with an optional `avatar` file (max 2 MB, JPEG/PNG/WebP), uploads it
to Cloudinary under `yulostores/avatars/<userId>` and stores the URL on
`user.profilePicture`, deleting the previous photo after the write succeeds. Surfaced in
[src/screens/Profile.jsx](src/screens/Profile.jsx). The restaurant's own name and logo are
shown there read-only, linking to Store Settings, which owns that record.

**Notification preferences are not a gap.** The backend ships them at
`GET`/`PATCH /api/users/me/preferences` with a `notifications: { pushEnabled,
categories[] }` body (see `server/routes/user.routes.js`). The frontend simply
doesn't call them yet — that's unbuilt UI, not a missing endpoint.

---

### 1.4 Customer dine-in ordering — **the biggest one**
`POST /api/orders` requires `type: "delivery"` and a `deliveryAddress`; the doc
states plainly that "Customer orders are always delivery". But the whole product
is built around a guest scanning a **table** QR and ordering from their phone.

Right now a guest who scans a table QR can browse the menu but must hand the
order to a waiter. Either:

```
POST /api/orders   — accept { type: "dine_in", tableId | tableSessionId }
                     and make deliveryAddress conditional
```

…or document that QR self-ordering is intentionally waiter-mediated.

Handled in [src/screens/customer/Cart.jsx](src/screens/customer/Cart.jsx): the
cart places a **delivery** order against a saved address, and shows an explicit
notice when the session came from a table QR.

---

### 1.5 Order → bill lookup
Bills belong to a `tableSessionId`. There is no way to go from an order id to its
bill, so "view the bill for this order" cannot be built.

```
GET /api/owner/:restaurantId/orders/:orderId/bill
```

Worked around in [src/screens/BillDetails.jsx](src/screens/BillDetails.jsx),
which lists bills and opens one by `?billId=`.

---

### 1.6 Restaurant search by name — ~~gap~~ **closed**
Staff need to find their restaurant by name at sign-in, and
`GET /api/restaurants` only ever offered `lat`/`lng`/`radius`/`cuisine`/`page`/
`limit`. The old login screen pulled one page of restaurants and filtered
client-side, which silently broke past the first 50 stores.

Now served by a purpose-built endpoint:

```
GET /api/staff/auth/restaurants?q=<name>&lat=<lat>&lng=<lng>
```

Public, capped at 8 rows, and narrowly projected (name, logo, city, cuisines).
With coordinates the name match runs inside a `$geoNear` stage, so suggestions
come back nearest-first with a `distanceKm` on each row — one typed character is
usually enough to surface the branch the staff member is standing in. Without
coordinates it falls back to prefix-then-alphabetical ranking. Used by
[src/hooks/staff/useRestaurantPicker.js](src/hooks/staff/useRestaurantPicker.js).

---

### 1.7 Admin: platform activity log
API.md says every admin action is written to an activity log but that it is
"not exposed via its own endpoint yet". The Activity Logs screen was removed.

```
GET /api/admin/activity?page=&limit=
```

---

### 1.8 Admin: order and offer monitoring, QR oversight, system settings
Four admin screens were removed because nothing backs them:

```
GET   /api/admin/orders                 — cross-restaurant order monitoring
GET   /api/admin/offers                 — cross-restaurant offer monitoring
PATCH /api/admin/offers/:id             — force-disable an offer
GET   /api/admin/qr                     — platform-wide QR oversight
GET   /api/admin/settings               — OTP length, notification toggles
PATCH /api/admin/settings
```

Note `GET /api/admin/settings` also blocks making the customer OTP length
configurable — the frontend currently hardcodes 6 digits to match the documented
verify endpoint.

---

### 1.9 Admin: staff and roles
No admin endpoint lists restaurant staff or platform roles.
`GET /api/admin/customers` returns customers only — owners, admins and staff are
invisible to the admin console.

```
GET /api/admin/users?role=              — all users, not just customers
GET /api/admin/roles                    — roles and their permission sets
```

---

### 1.10 Menu add-ons / extras
The menu-management design has an "Add-ons & Extras" builder. Menu items have no
add-on or modifier concept in the API. The section was removed.

```
GET/POST/PATCH/DELETE /api/owner/:restaurantId/menu-items/:itemId/addons
```

---

### 1.11 Ingredient cost / inventory
The ingredients editor was designed with quantity, unit and cost per ingredient
for food-cost maths. The API stores `ingredients` as a **plain string array**.
The editor is now a simple tag list.

```
— an inventory resource with { name, quantity, unit, cost } would be needed
```

---

### 1.12 Cancellation reasons and refunds
The cancellations screen can only list orders with `status: "cancelled"`. There
is no cancellation reason, requester, approval flow or refund record.

```
GET /api/owner/:restaurantId/cancellations   — with reason, requestedBy, refundStatus
```

---

## 2. Blocked — no `manager` role

The backend has three account roles (`customer`, `restaurant_owner`, `admin`)
plus two staff roles (`waiter`, `chef`). **There is no manager role, no manager
login, and no `/manager/*` endpoints.**

The manager portal at `/manager/*` therefore runs on the **owner session** and
reads owner-scoped endpoints. Consequences:

| Manager screen | Backed by | Limitation |
|---|---|---|
| Dashboard | `/owner/:rId/dashboard`, `/owner/:rId/orders` | Kitchen queue derived from the order list; the chef KDS needs a staff token |
| Live Monitoring | `/owner/:rId/live-monitor/*` | — |
| Orders | `/owner/:rId/orders`, `/orders/by-table` | Read-only on status (see 3.1) |
| Tables | `/owner/:rId/tables` | No order-independent floor status (see 2.1) |
| Requests | — | Blocked (see 1.1) |

To make this a real portal:

```
POST /api/manager/auth/login
GET  /api/manager/:restaurantId/...      — or extend staff roles with "manager"
```

### 2.1 Table floor state — *narrowed*
The tables API models `identifier`, `capacity`, `isActive` and the QR state, with
no persistent floor status or staffing field.

Orders themselves no longer have this gap: every order carries its `tableId`,
`tableNumber`, `staffId`/`placedBy` and `statusHistory`, and
`GET /api/owner/:restaurantId/orders/by-table` returns tables with their open
sitting, its assigned waiter, its rounds and a derived headline status. That covers
"which table is waiting on what, and who is looking after it".

What is still missing is table state independent of orders — `cleaning`,
`available`, a reservation hold — and an explicit waiter-to-table assignment that
survives when no session is open:

```
PATCH /api/owner/:restaurantId/tables/:tableId
      { status: available|occupied|cleaning, assignedWaiterId }
```

### 2.2 Kitchen alerts
"Chef reports an item unavailable → manager decides the customer-facing action"
has no endpoint. A chef can only toggle an item through the owner's menu routes,
which they have no token for.

```
POST  /api/staff/:restaurantId/kitchen/alerts   { menuItemId, reason }
GET   /api/staff/:restaurantId/kitchen/alerts
PATCH /api/staff/:restaurantId/kitchen/alerts/:id
```

---

## 3. Worked around — permission mismatches

### 3.1 Nobody but a chef can move an order — *narrowed*
`PATCH /api/staff/:restaurantId/kitchen/orders/:orderId/status` requires role
`chef`. The waiter half of this is now solved:

- **Waiters can mark an order served.** `PATCH
  /api/staff/:restaurantId/waiter/orders/:orderId/status` accepts `confirmed`,
  `preparing`, `ready` and `served` on a waiter token, enforcing the same
  transition table as the KDS. `served` is the dine-in terminal state — the food
  reaching the table — and is recorded on the order's `statusHistory` against the
  waiter's name, so the owner portal shows who marked it and when.
- **Owners and managers still cannot intervene** on a stuck ticket. Both order
  screens remain read-only on status.

```
— add an owner-scoped status override
```

### 3.2 Payment status is session-level only
Orders carry no payment state; a bill is closed with the waiter's
`mark-paid` call. So per-order "Bill Requested" / "Paid" filters (in the original
designs) cannot exist. Order filters now use the documented order lifecycle.

### 3.3 Staff cannot read their own restaurant's profile — *narrowed*
Staff screens need the restaurant name for the header, but
`/api/owner/:rId/settings` needs an owner token.

`POST /api/staff/auth/login` and `GET /api/staff/auth/me` now return
`restaurantName` and `restaurantLogo` alongside the staff member, which covers
every header on the staff screens. Anything richer (address, hours, contact)
still has no staff-scoped read:

```
GET /api/staff/:restaurantId/restaurant
```

---

## 4. Verify — ambiguous or unconfirmed in the doc

| # | Assumption the frontend makes | Where |
|---|---|---|
| 4.1 | ~~`GET /api/owner/:rId/settings` returns `{ restaurant: {...} }`.~~ **Confirmed** against `controllers/owner/settings.controller.js` — `getSettings` sends `{ restaurant: req.restaurant }`. | [useSettings.js](src/hooks/owner/useSettings.js) |
| 4.2 | ~~`GET /api/owner/:rId/settings/hours` returns `{ operatingHours: [...] }`.~~ **Confirmed** — `getHours` sends `{ operatingHours: req.restaurant.operatingHours }`, and `GET .../settings/delivery` sends `{ delivery }`. | [useSettings.js](src/hooks/owner/useSettings.js) |
| 4.3 | `GET /api/owner/:rId/bills/:billId` returns `{ bill }`. The doc says only "Response 200". | [useBills.js](src/hooks/owner/useBills.js) |
| 4.4 | `GET /api/owner/:rId/orders/:orderId` returns `{ order }`. | [useOrders.js](src/hooks/owner/useOrders.js) |
| 4.5 | `POST /api/owner/:rId/discounts` returns `{ discount }` with an `_id` — the Offers screen creates then immediately publishes. | [Offers.jsx](src/screens/Offers.jsx) |
| 4.6 | Menu items carry `categoryId` as a raw ObjectId, not a populated object, so category names are resolved from `GET /categories`. | [MenuItems.jsx](src/screens/MenuItems.jsx), [MenuManagement.jsx](src/screens/MenuManagement.jsx) |
| 4.7 | The restaurant record exposes `avgRating` / `totalRatings` on the settings payload (used for the dashboard rating card). | [OwnerDashboard.jsx](src/screens/OwnerDashboard.jsx) |
| 4.8 | ~~Restaurant `logo` and `coverImage` are the field names returned after a settings upload.~~ **Resolved** — the fields are `logo` and `bannerImage`; the screen was reading `coverImage`, which the settings PATCH never writes, so a saved banner never rendered back. `Restaurant` also has an unused `coverImage` column, which is why nothing errored. | [StoreSettings.jsx](src/screens/StoreSettings.jsx) |
| 4.9 | The dashboard KPI payload has no rating or live-table count — those are read from the live-monitor and restaurant records instead. Confirm that's intended. | [OwnerDashboard.jsx](src/screens/OwnerDashboard.jsx) |
| 4.10 | ~~`openingHours` on the public restaurant record is `{ monday: { open, close } }` (string times), while the owner hours API uses `[{ day, isOpen, openTime, closeTime }]` with HHMM integers.~~ **Resolved — there is only one shape.** `GET /api/restaurants/:id` returns the raw Restaurant document, so the field is `operatingHours` (the HHMM array); no `openingHours` and no `isOpen` exist anywhere in the backend. The QR landing screen was reading both, so its opening-hours line never rendered and its Open/Closed badge always said "Open now". Both now derive from `operatingHours` via [src/lib/hours.js](src/lib/hours.js), shared with Store Settings. | [QrLanding.jsx](src/screens/customer/QrLanding.jsx), [StoreSettings.jsx](src/screens/StoreSettings.jsx) |
| 4.12 | `cuisineTypes` is a free-form `[String]` with no catalogue endpoint — seeded data uses "Biryani", "Hyderabadi", "Dosa", "Tandoor" and others. Store Settings edits it as a tag list rather than a fixed dropdown; a `GET /api/cuisines` would let the UI suggest known values. | [StoreSettings.jsx](src/screens/StoreSettings.jsx) |
| 4.13 | Compliance fields (`settings.legalEntityType`, `ownerName`, `panNumber`, `gstNumber`, `healthPermitId`, `registrationNo`) are locked in the UI once saved, but the server still accepts changes to them on `PATCH /settings`. If the lock is a real business rule it belongs in the controller, not only the screen. | [StoreSettings.jsx](src/screens/StoreSettings.jsx) |
| 4.11 | Socket.IO is not yet consumed anywhere; all live data is polled. Wiring `new_order`, `order_status_updated`, `live_stats` and `targeted_offer` would remove most polling. | — |

---

## 5. Contract corrections already applied to the frontend

These were mismatches between the old frontend and API.md, now fixed:

| Was | Now |
|---|---|
| `POST /auth/signup` with `role: "restaurant_owner"` | `POST /owner/auth/signup` |
| `POST /auth/login` for owners | `POST /owner/auth/login` |
| `POST /auth/signup` with `role: "customer"` | `POST /auth/signup` (no role field) |
| Staff login sent `{ restaurantId, pin }`, and read `{ staff, staffToken }` the server never sent | `{ restaurantId, staffCode, pin }` → `{ staffToken, staff }`; the code is required because a `staffCode` is unique only within one restaurant |
| Kitchen status sent `{ newStatus }` | `{ currentStatus, newStatus }` + 409 retry |
| Kitchen board read `{ preparing, ready, completed }` | `{ placed, confirmed, preparing, ready }` |
| Waiter scan sent `{ qrPayload }` | `{ qrToken }` (the tableId from the QR URL) |
| Waiter order sent `{ tableId, items }` | `{ tableSessionId, items, specialInstructions }` |
| Customer order sent `{ tableNumber, orderType, couponCode, items:[{menuItem}] }` | `{ restaurantId, type, items:[{menuItemId}], deliveryAddress }` |
| Discount types `percent` / `flat` / `tableware` | `percentage` / `flat_amount` / `tablewise` |
| Discount statuses `active` / `scheduled` / `expired` | `draft` / `active` |
| Offer drafts kept in React state | Server drafts via `status: "draft"` + `/publish` |
| Operating hours as minutes-from-midnight | HHMM integers (900 = 09:00) |
| Menu item create as JSON | `multipart/form-data` with an `image` file |
| Settings update as JSON | `multipart/form-data` with `logo` / `banner` |
| Client-side 5% tax and hardcoded coupons in the cart | Server-computed totals only |
| No `Idempotency-Key` on order creation | Sent on both customer and waiter order POSTs |
| Cuisine picked from a hardcoded 6-item dropdown, saving only `cuisineTypes[0]` | Tag editor over the whole `cuisineTypes` array |
| Store Settings edited only `address.street` | All of street / city / state / pincode, which the PATCH already accepted |
| `Number(x) || default` on delivery fields turned a deliberate `0` back into 5 km / 30 min | `toNumber` keeps a finite `0` |
| `PATCH /settings/hours` and `/settings/delivery` accepted any JSON | zod-validated on the route (HHMM range, duplicate days, non-negative numbers) |
| Profile always PATCHed `multipart/form-data` | JSON unless an avatar is attached — the server drops empty strings from a multipart body, so clearing a phone number never saved |
| `err.response.data.message` in screens | The Axios interceptor already unwraps to `err.message` |

---

## 6. Removed

The mock backend (`src/mocks/`), the mock request router (`src/api/index.js`,
`src/api/http.js`), the `VITE_USE_MOCKS` flag, the legacy `/legacy/*` portal tree
inside `App.jsx`, the standalone `qrClient/` mini-app, and the fixture menu
images in `public/menu/` have all been deleted. Menu photography now comes from
the `image` URL on each menu item.
