---
name: vercel-deploy
description: Vercel deployment and configuration for LikhArtisan
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: vercel
---

## What I do
- Guide Vercel deployment for React frontend
- Configure environment variables
- Set up serverless functions for Express backend
- Handle domain and redirect配置

## When to use me
Use this when deploying or configuring Vercel.

## Project structure
```
likhartisan/
├── gallery-app/      # React frontend (Vercel)
├── server/           # Express backend (separate deployment)
└── vercel.json       # Vercel configuration
```

## Frontend deployment
```json
// vercel.json
{
  "buildCommand": "cd gallery-app && npm run build",
  "outputDirectory": "gallery-app/dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## Environment variables
Set in Vercel dashboard:
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anon key
- `VITE_GOOGLE_MAPS_API_KEY` - Google Maps key
- `VITE_PAYMONGO_API_URL` - PayMongo API URL

## Backend options
1. **Vercel Serverless** - Convert Express to serverless functions
2. **Railway/Render** - Deploy server separately
3. **Supabase Edge Functions** - For small functions

## Deploy commands
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod

# Deploy preview
vercel
```

## Domain setup
1. Add domain in Vercel dashboard
2. Update DNS records
3. Configure redirects in vercel.json
4. Update Supabase auth redirect URLs
