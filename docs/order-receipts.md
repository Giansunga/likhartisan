# Payment receipts

Receipts are LikhArtisan purchase records, not tax invoices. The title, logo, table, totals, rounding note, and footer are rendered by `server/services/orderReceiptService.js` using PDFKit and the bundled Source Sans 3 font. The font is from Adobe's Source Sans release (`https://github.com/adobe-fonts/source-sans/tree/release/TTF`) and retains its OFL license in `server/assets/receipts/`.

## Behavior

- `20261103001000_order_receipts.sql` creates immutable receipt snapshots and an AFTER trigger on order insertion/payment-status updates. Capture happens in the payment update's transaction, not in a background task. Duplicate events and concurrent downloads reuse the same order-keyed record.
- Existing paid orders are captured on the first download, using their saved order data. Paid dates are omitted when unknown. Refunded orders retain already-issued receipts; legacy refunded orders need a recorded verification timestamp before a new receipt can be issued.
- Authenticated `GET /api/orders/:orderId/receipt` checks order ownership, checks receipt ownership, and renders an existing snapshot or captures an eligible legacy order. A non-owner receives 404, a guest 401, and an unpaid order 409. Responses use `application/pdf`, attachment disposition, and `private, no-store`.
- The purchase API exposes `receiptAvailable`. Product/profile edits and refunds do not rewrite issued snapshots. PDF files are generated in memory and never published to a bucket.
- Receipt values come from the order, including buyer details, line variants, shop names, totals and reference. No current catalog price or profile is consulted. Inconsistent totals are rejected rather than silently adjusted. Custom orders use the approved subtotal and explicitly explain unit rounding.
- Purchase history provides download controls in cards and details. The existing token-refresh path supports PDF responses, duplicate clicks are prevented, in-flight requests abort on account change/unmount, and browser URLs are released after download.

## Local checks

```powershell
npm.cmd --prefix server test
npm.cmd --prefix gallery-app run test -- src/lib/portalRequest.test.ts src/components/purchases/PurchasePanel.test.tsx
npm.cmd --prefix gallery-app run build
npm.cmd install --prefix tmp/moderation-db --no-save --package-lock=false @electric-sql/pglite
node --test supabase/tests/orderReceipts.test.mjs
```

The PGlite test uses an isolated schema and synthetic accounts. It exercises paid capture, duplicate/concurrent requests, immutable snapshots, refunds, row-level ownership, denied client writes/RPC access, and rollback. It does not connect to production.

Sample regular/custom/multipage PDFs were generated locally under `output/pdf/receipt-*.pdf`, rendered to PNGs, and visually checked. These generated samples and temporary rendering tools are ignored by Git. Purchase-history desktop/mobile smoke checks use synthetic local orders; HTTP route tests exercise the real renderer and authentication gate.

## Separately authorized rollout

The receipt migration was applied to LikhArtisan2026 on November 3, 2026 to repair downloads after the application was released before its required schema. The reported paid order was successfully captured and rendered as a PDF using the receipt service. For other environments, apply the migration before deploying the API and frontend. Verify a test payment, the downloadable receipt, a repeated verification callback, and buyer isolation. Existing orders are not bulk-backfilled.

Rollback requires removing the frontend/API feature first. Export `order_receipts` if the issued snapshots must be retained, then apply the companion rollback under `supabase/rollback/`. Dropping snapshots loses their frozen historical values; regenerating later can only use whatever remains on the saved orders.
