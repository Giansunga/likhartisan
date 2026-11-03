# Message censorship

English and Filipino/Tagalog dictionary v1 is owned by `server/shared/moderation/`.
The frontend copy and SQL migration are generated from that source; do not edit generated files.
This is balanced dictionary filtering, not semantic moderation or exhaustive slang detection.

## Coverage

- New chat, product questions, review bodies, design buyer notes and shop replies are censored on submission.
- The shared Supabase fetch boundary filters only communication tables and three design-request RPCs. It also censors historical reads without issuing writes. Auth, storage, catalog text, IDs, errors, count/HEAD queries, snapshots, and prices pass through.
- Chat parsers and realtime callbacks filter incoming content; notification feeds and seller request realtime refreshes read through the same boundary.
- Structured product/design cards retain metadata. Only named message/note fields and their `summary` copies are censored.
- LikhAI filters prompts, history, retries, replies, follow-up suggestions, and restored session history. Request failure logs use codes rather than message-bearing errors.
- The migration installs invoker-rights triggers on communication tables. Inserted and changed message fields are censored before persistence. Unchanged historical fields are not rewritten when unrelated fields change. Existing RLS and ownership checks are unchanged.

Matched letters/digits become `*`; punctuation, symbols and line breaks remain. Explicit URLs, email addresses, UUIDs, backtick code, paths, and multi-part technical identifiers are exempt. Names and catalog fields are outside scope. Changing the dictionary requires regression tests for harmless words and regenerate/retest on all runtimes.

After this migration is released, freeze it. For later dictionary versions, bump `version`, assign a new migration/rollback filename in the generator, and retain already-applied migrations.

## Local verification

Run from repository root:

```powershell
node server/scripts/generate-moderation.mjs
node --test server/shared/moderation/moderation.test.mjs
npm.cmd install --prefix tmp/moderation-db --no-save --package-lock=false @electric-sql/pglite
node --test supabase/tests/moderation.test.mjs
npm.cmd --prefix server test
npm.cmd --prefix gallery-app run test -- src/lib/__tests__/messageModeration.test.ts src/lib/__tests__/chatMessages.test.ts src/services/__tests__/likhaiClient.test.ts
npm.cmd --prefix gallery-app run build
```

The PGlite test creates an isolated PostgreSQL database in memory. It tests shared fixtures, direct inserts/updates, structured payloads, untouched history, and rollback. It never reads production credentials or connects to a deployed database. Browser and Node parity tests use the same fixtures; database parity is checked separately.

## Release and rollback

This change only prepares migration `20261103000000_censor_communications.sql` locally. No production migration has been applied.

For a separately authorized release, apply the migration before releasing frontend and API changes. Then verify buyer/seller chat, product questions, reviews, design notes/replies, notifications and LikhAI with two test accounts. Verify signed-out access remains unchanged. No backfill or content upload is required.

The companion script under `supabase/rollback/` removes the triggers and functions. Application filtering remains until the application release is rolled back too. Censored text cannot be recovered; no original-copy store is created. Legacy database records remain original until their message content is edited, and are masked on display.
