# Auto-Ping Setup for Render Free Tier

## 1. Deploy to Render
1. Go to https://dashboard.render.com
2. Click **New** → **Web Service**
3. Connect GitHub: `Giansunga/likhartisan`
4. Settings:
   - **Name:** likhartisan
   - **Root Directory:** `server`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free

5. Add Environment Variables:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_KEY=your_service_key
   PAYMONGO_SECRET_KEY=your_paymongo_key
   LALAMOVE_API_KEY=your_lalamove_key
   LALAMOVE_API_SECRET=your_lalamove_secret
   GROQ_API_KEY=your_groq_key
   AI_GATEWAY_API_KEY=your_vercel_ai_gateway_key
   AI_SEARCH_MODEL=alibaba/qwen3.5-flash
   AI_GALLERY_SEARCH_ENABLED=false
   GOOGLE_MAPS_API_KEY=your_maps_key
   FRONTEND_URL=your_vercel_url
   PORT=3001
   ```

## 2. Set Up Auto-Ping
After deployment, Render gives you a URL like:
`https://likhartisan.onrender.com`

### Option A: cron-job.org (Free)
1. Go to https://cron-job.org
2. Sign up (free)
3. Create new cron job:
   - **URL:** `https://likhartisan.onrender.com/health`
   - **Schedule:** Every 10 minutes
   - **Method:** GET

### Option B: UptimeRobot (Free)
1. Go to https://uptimerobot.com
2. Sign up (free)
3. Add monitor:
   - **Type:** HTTP(s)
   - **URL:** `https://likhartisan.onrender.com/health`
   - **Interval:** 5 minutes

### Option C: GitHub Actions (Free)
Create `.github/workflows/ping.yml`:
```yaml
name: Keep Alive
on:
  schedule:
    - cron: '*/10 * * * *'  # Every 10 minutes
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Health Endpoint
        run: curl https://likhartisan.onrender.com/health
```

## 3. Update Frontend
Update `gallery-app/.env`:
```
VITE_PAYMONGO_API_URL=https://likhartisan.onrender.com
VITE_AI_GALLERY_SEARCH_ENABLED=false
```

## 4. Update Vercel
Add environment variable in Vercel dashboard:
```
VITE_PAYMONGO_API_URL=https://likhartisan.onrender.com
VITE_AI_GALLERY_SEARCH_ENABLED=false
```
> **Important:** the variable MUST be named `VITE_PAYMONGO_API_URL` — that is
> the exact name the frontend reads (see `CheckoutSuccessPage.tsx`,
> `CheckoutPage.tsx`, etc.). If it's missing or misnamed, the app silently
> falls back to `http://localhost:3001` and every payment shows
> "Verification Pending". Vite bakes env vars at build time, so **redeploy the
> frontend** after changing it.

## 5. Roll Out Gallery AI Search

1. Apply `gallery-app/supabase/add-gallery-ai-search.sql` in Supabase. It queues every existing product and leaves keyword search available while embeddings are pending.
2. From the repository root, deploy the private worker with `supabase functions deploy gallery-embed`.
3. Configure Supabase Cron to POST `{ "mode": "batch", "limit": 20 }` to the function every minute with the service-role bearer token. Overlapping runs atomically claim work, and failed rows retry up to five times.
4. Keep both feature flags false until this query returns no missing active products:
   ```sql
   SELECT count(*) AS active_products_without_ready_embedding
   FROM products p
   LEFT JOIN product_search_index i ON i.product_id = p.id
   WHERE p.status = 'active'
     AND (i.product_id IS NULL OR i.embedding_status <> 'ready');
   ```
5. In the Vercel AI Gateway dashboard, disable automatic top-up. The Gateway is used only for multilingual query parsing; Supabase `gte-small` supplies embeddings.
6. Enable `AI_GALLERY_SEARCH_ENABLED=true` on the Render staging service and `VITE_AI_GALLERY_SEARCH_ENABLED=true` in the staging frontend, then redeploy both.
7. Run `GALLERY_SEARCH_BASE_URL=https://your-staging-api npm run test:relevance` from `server`. Acceptance is at least 80% of the 20 labeled English/Filipino fixtures with no inactive or price-violating result.
8. After failure-mode checks, repeat the flag rollout in production. The existing gallery remains available if either flag is turned off.

Monitor `gallery_search_events` for fallback rate, zero-result rate, and latency. Also monitor `product_search_index` for failed rows, Vercel Gateway credit usage, and Supabase Edge Function invocations. Do not place either the service-role key or Gateway key in the frontend.
