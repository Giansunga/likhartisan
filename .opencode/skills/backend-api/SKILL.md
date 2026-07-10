---
name: backend-api
description: Express backend API patterns for LikhArtisan
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: express
---

## What I do
- Guide Express.js backend development
- Handle PayMongo, Lalamove, Groq AI integrations
- Manage Supabase service role operations
- Implement webhook signature verification

## When to use me
Use this when creating or modifying backend routes/services.

## Tech stack
- Express.js on port 3001
- Supabase service role for DB operations
- PayMongo for payments
- Lalamove for shipping
- Groq for AI chatbot

## Route pattern
```js
const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

router.post('/endpoint', async (req, res) => {
  try {
    // Validate input
    const { field } = req.body;
    if (!field) return res.status(400).json({ error: 'Missing field' });
    
    // Supabase query
    const { data, error } = await supabase
      .from('table')
      .select('*')
      .eq('column', field);
    
    if (error) throw error;
    res.json({ data });
  } catch (err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```

## Environment variables
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Service role key (never expose to client)
- `PAYMONGO_SECRET_KEY` - PayMongo secret
- `LALAMOVE_API_KEY` - Lalamove API key
- `GROQ_API_KEY` - Groq AI key
- `GOOGLE_MAPS_API_KEY` - Google Maps key

## Security
- Verify PayMongo webhook signatures with HMAC-SHA256
- Use service role only on server (never in frontend)
- Validate all inputs before Supabase queries
- Return generic error messages to client
