# Admin and seller portal reliability

## Result and verification boundary

Implemented on 2026-11-03. Existing URLs, role rules, and successful workflow contracts are retained. The active seller orders screen now lives in `gallery-app/src/pages/artisan/SellerOrdersPage.tsx`; the old dashboard file retains the route's compatibility export and its unused duplicate panels were removed.

Validation uses isolated local fixtures. There is no separate Supabase test project or development branch, and local database tooling is unavailable. No production data, payment, delivery, database policy, or schema was changed. The browser fixture's access filtering is a simulation, not proof of production row-level security.

## Route and action checklist

All 22 URL routes below were opened at 1440×900 and 390×900; the generated attachments panel has separate component coverage. All 44 fully loaded route checks completed without page exceptions or document-level horizontal overflow. An empty model library/design queue was used in browser checks; existing component tests supply model/design records.

| Portal / route | Actions covered by local tests or browser checks | Evidence |
| --- | --- | --- |
| Admin `/admin` | Initial/failed loads, retry, numeric money, zero prices, stale reads, live refresh | DashboardPage regressions; browser populated dashboard |
| Admin `/admin/orders` | Status/delivery changes, notes, payment and refund flags, cancellation, investigation, return/activity loading, failed/zero-row writes, duplicate confirmation, stale reads | OrdersPage regressions; browser populated list |
| Admin `/admin/products` | Load/filter/sort/pagination, archive/delete confirmation, editor validation, protected drafts, checked save, partial-save reconciliation | ProductListPage, ProductEditorDialog, catalogVariations, adminProducts tests; browser populated catalog |
| Admin `/admin/products/create` | Validation, files, featured artisan, draft creation, lost response, retry without duplicates, complete variation readback, checked activation, failed refresh callback | ProductCreatePage regressions; browser form |
| Admin `/admin/products/create/3d-tools` | Direct tools entry, cancel and portal-specific return paths | ProductCreation tests; browser route |
| Admin `/admin/artisans` | Collection loading, visible retry, checked create/edit/delete, single mutation guard | Browser populated collection; checked mutation paths reviewed; live writes unverified |
| Admin `/admin/models` | Load errors/retry, create/edit/archive/delete, featured-model protection, duplicate submit, stale read | ModelManagePage regressions; browser empty library |
| Admin generated attachments panel | Shop switching, delayed requests, dirty recipe preservation, rejected/null saves, retry and save/read races | AttachmentManagePanel regressions |
| Admin `/admin/models/featured` | Eligible model selection, stage editing, publication failures, failed initial load recovery | Featured3DPage tests; browser empty-library route; live publication unverified |
| Admin `/admin/roles` | Role drawer, protected accounts, manager controls, failed role action then retry, rejected collection queries | RoleAssignationPage tests; browser populated role list; live role mutation unverified |
| Admin `/admin/theme` | Theme/auto-detect controls, rollback and error on failed save, stale read after save | ThemeContext regressions; browser route; live persistence unverified |
| Admin `/admin/analytics` | Filter/date/query behavior and charts | adminAnalytics tests; browser fixture analytics |
| Admin `/admin/activity` | Filter/pagination races, deduplication, retry, export guard and correct filters | ActivityLogPage and export utility regressions; browser empty log |
| Seller `/artisan-dashboard` | Overview collections, visible failure, metrics/date filters and exports | sellerDashboard/export tests; browser populated overview |
| Seller `/artisan-dashboard/orders` | Load/retry, regular/custom updates, missing/rejected response, duplicate clicks, identical shop names with different IDs, all item rows, drawer consistency | SellerOrdersPage regressions; browser outage → Retry recovery |
| Seller `/artisan-dashboard/messages` | Message load/selection races, per-conversation drafts, attachments, primary send vs secondary failures, verified cascade deletion | SellerMessages regressions; browser populated conversation list |
| Seller `/artisan-dashboard/listings` | Status/filter/inventory behavior, duplicate action, failed saves, edit loading, stable draft variation IDs | SellerListings/catalogVariations tests; browser deactivate → reload confirmed inactive |
| Seller `/artisan-dashboard/listings/create` | Shop-scoped product creation and retry | Shared ProductCreatePage regressions; browser form |
| Seller `/artisan-dashboard/listings/create/3d-tools` | Entry/cancel/return paths | ProductCreation tests; browser route |
| Seller `/artisan-dashboard/requests` | Direct links, draft initialization, quote validation, rejected/null RPC, busy cleanup, history retry, stale list/history, primary success vs refresh failure | SellerRequests regressions; browser empty queue |
| Seller `/artisan-dashboard/profile` | Validation/files, rejected/zero-row save, persisted snapshot on remount, typing during refresh/save, confirmed upload reconciliation | ShopProfilePanel regressions; browser profile |
| Seller `/artisan-dashboard/design-vault` | Restore success, rejected/zero-row restore, retry | SellerListings regressions; browser empty vault |
| Seller `/artisan-dashboard/notifications` | Read/delete/all-read scoped writes, identity changes, stale loads, rejected/zero-row mutation | useNotifications regressions; browser mark-read → reload confirmed read |
| Both portal shells | Identity reset, outage vs denied access, retry, route crash recovery, usable navigation, reconnect refresh serialization | AdminLayout, ArtisanContext, PortalRouteBoundary, realtime regressions; browser direct entry/back/forward |

## Defect ledger

Each row records the triggering condition, the original failure mechanism, the intended result, and regression evidence.

| Severity | Trigger / original evidence | Repair / expected result | Regression proof |
| --- | --- | --- | --- |
| P1 | Admin update returned no row or error while handlers changed local state/showed success | Require the saved row; reconcile list/detail; preserve failed confirmation | OrdersPage and ModelManagePage |
| P1 | Identity changed while previous shop/admin access remained cached | Remount identity-owned state immediately; revoke cached shop on denied recheck | AdminLayout and ArtisanContext |
| P1 | Product persisted before variant failure; retry inserted a second active product | Stable operation and variation IDs; unpublished draft until full readback and checked activation | ProductCreatePage lost-response/activation tests reproduced failures before repair |
| P1 | Message insert succeeded but preview request threw; draft appeared unsent | Commit primary success immediately; secondary errors explicitly say not to resend | SellerMessages |
| P1 | Message rows deleted before a parent conversation deletion failed | Delete only the checked parent, relying on existing database cascade | SellerMessages |
| P1 | Delayed shop A attachment settings populated shop B; dirty settings lost during save/refresh | Shop/request identity guards, per-recipe dirty tracking, checked saves | AttachmentManagePanel |
| P1 | Draft entered while profile refresh/save was in flight was overwritten or an already-confirmed image uploaded again | Versioned refreshes and field/media reconciliation | ShopProfilePanel |
| P2 | Order/list/history/query promises rejected or returned errors | Visible error/retry and guarded finally cleanup; retain last known data/draft | Portal component regressions |
| P2 | Old filters, pagination, refreshes or reconnect callbacks completed after newer data | Request generations, mutation locks, serialized refresh worker | ActivityLogPage, OrdersPage, SellerOrdersPage, usePortalRealtimeRefresh |
| P2 | Notification mutations optimistically succeeded despite rejection/zero rows or identity changes | Confirm scoped rows, serialize mutations, hide previous identity immediately | useNotifications |
| P2 | Variation insert succeeded before a later step failed; retry created duplicates or removed new draft persisted | Stable client IDs, scoped duplicate-key reconciliation, complete/removal readback | catalogVariations, ProductListPage; SellerListings reconciliation reviewed |
| P2 | Editor remained writable during save, then closed and lost newer input | Disable editable fieldsets while saving; preserve dirty fields on background product updates | ProductEditorDialog |
| P2 | Theme save failed after local preview or older theme read arrived after successful save | Roll back and display failure; sequence reads against saves | ThemeContext |
| P2 | Backend request used an expired token, or an uncertain write was automatically replayed | Reuse session manager; retry rejected reads once; never automatically replay writes | portalRequest and existing authSession tests |
| P2 | Route render exception blanked the portal | Route boundary retains navigation, reports exception through Sentry and offers retry | PortalRouteBoundary |

## Validation commands and artifacts

From `gallery-app`:

```powershell
npm run build
npm test -- --maxWorkers=4 --reporter=json --outputFile=output/portal-reliability/frontend-final.json
npm exec eslint -- src/components/admin src/components/artisan src/pages/admin src/pages/artisan src/realtime
```

From `server`: `npm test` — 114 tests passed.

Frontend production build passed. The final frontend run passed all 809 tests across 140 files (131 more test cases than the initial 678-test baseline). Full frontend run and final lint details are recorded in `gallery-app/output/portal-reliability/`. Portal files and new shared reliability helpers are lint-clean. Whole-project lint decreased from 171 errors / 16 warnings to 53 errors / 5 warnings; remaining findings are outside the portal directories and were not broadly rewritten. Existing Vite configuration, bundle-size, and test-environment warnings remain.

Browser screenshots and generated route-check scripts are in `output/playwright/`. Browser fixture installation is reusable through `gallery-app/scripts/portal-browser-fixtures.js` with `playwright-cli run-code --filename`; start Vite with fixture-only environment variables:

```powershell
$env:VITE_SUPABASE_URL='https://portal-fixtures.supabase.co'
$env:VITE_SUPABASE_ANON_KEY='fixture-anon-key'
$env:VITE_PAYMONGO_API_URL='http://127.0.0.1:5188'
$env:VITE_SENTRY_DSN=''
npm run dev -- --host 127.0.0.1 --port 5188 --strictPort
```

The fixture intercepts non-local requests and supplies an administrator, two sellers, buyer, products, regular/custom orders, messages and notifications. No valid production credentials are used. The mock session defaults to admin; set localStorage `portal-fixture-role` to `seller`, `seller2`, or `buyer` and reload to switch. Do not run the production build concurrently with the Vite fixture server on Windows: the dev watcher can encounter locked generated image files.

## Remaining verification / limitations

- No SQL/database suite, real RLS denial, real storage replacement, or fresh/upgraded database compatibility test was run: no isolated database is available. No migrations were introduced.
- Browser fixtures prove frontend behavior and mocked persistence only. Verify the same flows with separate test accounts against an isolated database before production rollout, including cross-shop reads/writes and buyer/admin/seller consistency.
- Message unread increments still use the existing client read/modify/write path. Simultaneous sends can lose an unread increment; resolving this requires an atomic database operation and database verification. Message-send primary-success handling is fixed independently.
- Product creation retries are resumable within a mounted form. Reloading during an incomplete creation leaves a hidden draft; durable draft recovery is not added. Catalog editing still uses multiple checked operations, not a database transaction; partial completion is disclosed and stable draft IDs make retries safe.
- Real 3D rendering/device coverage, payment, courier, storage delivery, privileged role changes and featured publication require connected service verification. No production deployment was performed.
