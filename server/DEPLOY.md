# Auto-Ping Setup for Render Free Tier

## 1. Deploy to Render
1. Go to https://dashboard.render.com
2. Click **New** → **Web Service**
3. Connect GitHub: `Giansunga/likhartisan`
4. Settings:
   - **Name:** likhartisan-api
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
   GOOGLE_MAPS_API_KEY=your_maps_key
   FRONTEND_URL=your_vercel_url
   PORT=3001
   ```

## 2. Set Up Auto-Ping
After deployment, Render gives you a URL like:
`https://likhartisan-api.onrender.com`

### Option A: cron-job.org (Free)
1. Go to https://cron-job.org
2. Sign up (free)
3. Create new cron job:
   - **URL:** `https://likhartisan-api.onrender.com/health`
   - **Schedule:** Every 10 minutes
   - **Method:** GET

### Option B: UptimeRobot (Free)
1. Go to https://uptimerobot.com
2. Sign up (free)
3. Add monitor:
   - **Type:** HTTP(s)
   - **URL:** `https://likhartisan-api.onrender.com/health`
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
        run: curl https://likhartisan-api.onrender.com/health
```

## 3. Update Frontend
Update `gallery-app/.env`:
```
VITE_API_URL=https://likhartisan-api.onrender.com
```

## 4. Update Vercel
Add environment variable in Vercel dashboard:
```
VITE_API_URL=https://likhartisan-api.onrender.com
```
