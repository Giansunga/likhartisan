# Public media gateway

`likhartisan-assets` reads the existing `likhartisan-2026` R2 bucket through a Worker binding. It does not use `r2.dev`, change DNS, modify objects, or run on the payments/chat backend.

The Vercel application proxies `/media/*` to `https://likhartisan-assets.likhartisan-assets.workers.dev/*`. Public browser requests remain on the website origin. There is no arbitrary URL proxy.

## Development and checks

- `npm ci` then `npm test` in this directory.
- `npm run dev` uses local R2 emulation; it does not read/write the live bucket. Seed local fixtures when needed.
- In `gallery-app/.env.local`, set `ASSET_GATEWAY_ORIGIN=http://127.0.0.1:8787` for local fixtures, or the deployed Worker origin for read-only live public media. This variable is server-side Vite configuration, not a credential.
- `VITE_ASSET_DELIVERY_MODE=gateway` is the frontend default. `direct` is an explicit rollback setting and requires a frontend rebuild. Source URLs in the database/cart/designs remain unchanged.
- After one transient failure, the shared frontend downloader recovers owned public R2 models in requests of at most 1 MB. It resumes received bytes only with a strong ETag, validates every Content-Range, and discards old bytes if the server returns a full replacement. Recovery stops on another failure; chunks do not each receive automatic retries. A 25 MB recovery can use up to 25 range requests, so include that extra traffic in Worker/R2 usage monitoring. Normal successful downloads still use one request.
- `npm run deploy` deploys only the Worker. Cloudflare sign-in is stored using Wrangler's OS keychain integration; never put tokens in this repository.

## HTTP contract

Only GET and HEAD are allowed. `/r2/<key>` permits `products/`, `models/`, and `Landing Page Video/`. `/storage/products/<key>` fetches only the fixed Supabase public bucket's `shop/`, `artisans/`, `avatars/`, and `reviews/` prefixes. Chat, signed links, unrelated origins, arbitrary query strings, traversal paths, and write methods are excluded.

Responses stream and support ETags, modification dates, single byte ranges and If-Range. Missing objects return 404, invalid ranges 416, failed preconditions 412, upstream redirects 502, and unavailable origins 503. Errors and partial responses use no-store. Only timestamped unique R2 keys receive immutable caching; replaceable media use short revalidation. Objects larger than the CDN's cache ceiling can still stream uncached. No compression variants are selected or changed.

## Release gate

1. Run gateway tests, frontend tests, affected-file lint, and the production build.
2. Smoke-check the Worker against known public photo/model/video keys, including ranges and failures. Verify GLB MIME type and byte integrity.
3. Deploy a Vercel preview to the existing linked project; do not change the website's DNS.
   The preview build needs the existing public `VITE_SUPABASE_URL`, anonymous `VITE_SUPABASE_ANON_KEY`, HTTPS `VITE_PAYMONGO_API_URL`, and Maps browser key. Production-only settings do not automatically apply to previews. Pass these public build settings separately; never include a service-role key, R2 credentials, or local environment files in an export.
4. Open `/asset-check` on real iOS Safari and Android Chrome. Run Website delivery with VPN **off** on Smart, DITO, Globe, Converge and affected PLDT/other Wi-Fi; compare Original storage and VPN-on outcomes. These diagnostics bypass the browser media cache and report whether a small model request also failed, the last loading stage, received byte count, and HTTP status when available. Save only the sanitized copied results outside source control. A public test file passing does not prove every product or every carrier connection works.
5. Verify gallery, product normal/Studio viewers, Freeform and previews, shop/artisan photos, portal previews and video. A local build or VPN-only pass is not carrier acceptance.
6. Promote production only after the real-network checks pass. Retain the previous Vercel deployment for immediate rollback. Never treat a Git push as deployment proof.

Monitor Cloudflare Worker requests/errors/quota and Vercel transfer/cache metrics; use the existing plans only. No paid upgrade is automatic. Do not add chat/private media to shared caches. Frontend deployment exports exclude this folder, screenshots, local env files, logs and credentials.

## Platform limits

Cloudflare [streams responses without a response-body size cap](https://developers.cloudflare.com/workers/platform/limits/); this Worker never buffers whole assets. Vercel's [external proxy timeout is 120 seconds](https://vercel.com/docs/limits#proxied-request-timeout), so origin response delays remain subject to that limit. Vercel documents [10 MB non-streaming and 20 MB streaming Function cache limits](https://vercel.com/docs/caching/cdn-cache#limits); these are Function limits, not a promise that every external rewrite will cache a 25 MB model. Oversize responses must still stream correctly when uncached. Keep the 25 MB streaming regression test and verify video byte ranges on the deployed preview. External rewrite caching is explicitly enabled and honors the Worker's per-response headers.
