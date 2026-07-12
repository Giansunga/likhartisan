# Fix: Footer Flash on Place Order (pre-PayMongo redirect)

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Eliminate the one-frame footer flash that occurs after "Place Order" but before the user is redirected to PayMongo.

**Architecture:** Single-file fix in `CheckoutPage.tsx`. The flash is caused by `clearCart()` firing a cart-update event that empties `items`, which trips the early `return null` (line 478) and unmounts the page, exposing the `<Footer/>` in `<Layout>` for one frame before the full-page `window.location.href` navigation. The cart is already cleared on success in `CheckoutSuccessPage.tsx:88`, so the pre-redirect clear is redundant and is the cause.

**Tech Stack:** React 18, Vite, `@react-google-maps/api` (only relevant for context, not changed), React Router.

---

## Diagnosis (verified by reading code)

- `store.ts:29` `clearCart()` → `setCart([])` → `emitCartUpdate()` → `window.dispatchEvent(new CustomEvent('lk_cart_update'))`.
- `CheckoutPage.tsx` subscribes to that event (via `onCartUpdate`) and sets local `items` to `[]`.
- `CheckoutPage.tsx:478` `if (items.length === 0) return null;` → component unmounts.
- `Layout.tsx:72` renders `<Footer/>` whenever the page content is empty → footer flashes for one frame.
- `CheckoutPage.tsx:467` `clearCart();` runs **before** `window.location.href = data.checkoutUrl;` (line 470) → the flash happens in that gap.
- `CheckoutSuccessPage.tsx:88` already calls `clearCart()` on success, so the pre-redirect clear is redundant.

---

## Task 1: Remove redundant pre-redirect cart clear

**Objective:** Prevent the page from unmounting (and the footer from flashing) before navigation.

**Files:**
- Modify: `gallery-app/src/pages/CheckoutPage.tsx:467` (inside `handlePlaceOrder`)

**Step 1: Read the current block (lines 467-470)**
```js
      clearCart();
      localStorage.setItem('likhartisan_checkout_session_id', data.sessionId);
      sessionStorage.setItem('likhartisan_checkout_session_id', data.sessionId);
      window.location.href = data.checkoutUrl;
```

**Step 2: Replace with (remove `clearCart()` from here)**
```js
      // NOTE: do NOT clearCart() here. Clearing fires a cart-update event that
      // empties `items`, which trips `if (items.length === 0) return null`
      // (line 478) and unmounts this page for one frame — flashing the <Footer/>.
      // The cart is cleared on success in CheckoutSuccessPage.tsx instead.
      localStorage.setItem('likhartisan_checkout_session_id', data.sessionId);
      sessionStorage.setItem('likhartisan_checkout_session_id', data.sessionId);
      window.location.href = data.checkoutUrl;
```

**Step 3: Verify build compiles**
Run: `cd gallery-app && npm run build`
Expected: build succeeds (exit 0), no new TS errors.

**Step 4: Commit**
```bash
git add gallery-app/src/pages/CheckoutPage.tsx
git commit -m "fix: remove pre-redirect clearCart to stop footer flash on Place Order"
```

---

## Task 2: Hardening (optional but recommended) — guard the empty return

**Objective:** Make the `return null` safe even if `items` is empty during the placing/redirect window, so no future change can re-introduce the flash.

**Files:**
- Modify: `gallery-app/src/pages/CheckoutPage.tsx:478`

**Step 1: Read current line**
```js
  if (items.length === 0) return null;
```

**Step 2: Replace with (keep rendering while placing/redirecting)**
```js
  // Keep the page mounted while a redirect to PayMongo is in flight, otherwise
  // the layout's <Footer/> flashes for one frame. The empty-cart view is still
  // reachable from CartPage, so this only affects the placing window.
  if (items.length === 0 && !placing) return null;
```

**Step 3: Verify build**
Run: `cd gallery-app && npm run build`
Expected: build succeeds.

**Step 4: Commit**
```bash
git add gallery-app/src/pages/CheckoutPage.tsx
git commit -m "fix: keep CheckoutPage mounted during redirect to avoid footer flash"
```

---

## Validation

**Manual (primary — the bug is visual):**
1. `cd gallery-app && npm run dev` (or test on the deployed site).
2. Add an item to cart → go to Checkout → fill address → select delivery → Place Order.
3. Observe: the page should navigate straight to PayMongo **with no footer flash** beforehand.
4. Pay via QR Ph test mode → return to success page → confirm "Payment Successful!" and cart is empty (proves `clearCart()` still happens on success via `CheckoutSuccessPage.tsx:88`).

**Build check (every task):** `cd gallery-app && npm run build` exits 0.

**Regression check:** Place an order, then abandon (close tab at PayMongo) → cart is still populated (acceptable trade-off; cart clears on successful completion). Confirm this is acceptable; if not, move `clearCart()` to fire in `CheckoutSuccessPage` only (already there) and accept the abandoned-cart behavior.

---

## Risks / Tradeoffs

- **Abandoned cart:** removing the pre-redirect `clearCart()` means if a user reaches PayMongo but abandons (closes tab), their cart stays full. This is standard e-commerce behavior and the success page still clears it. Low risk.
- **`placing` guard:** Task 2's `!placing` guard is belt-and-suspenders; if `clearCart()` is ever called elsewhere mid-flow it prevents the flash. Safe.

## Open questions

- None blocking. If you want abandoned carts to also clear, we'd add a PayMongo webhook for `checkout_session.expired` — out of scope here.
