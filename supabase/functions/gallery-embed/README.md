# Gallery embedding worker

Deploy with JWT verification enabled:

```powershell
supabase functions deploy gallery-embed
```

The Express server invokes this function with the Supabase service-role token for query embeddings. The function uses Supabase's built-in `gte-small` model, so it does not need a third-party model key.
Create a Supabase Cron HTTP job that invokes the same function every minute with:

```json
{ "mode": "batch", "limit": 20 }
```

Use `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`. The worker atomically claims up to 20 records, retries failed embeddings up to five times, and reclaims a processing row if an invocation is interrupted for more than ten minutes. Do not expose the service-role key to the browser.
