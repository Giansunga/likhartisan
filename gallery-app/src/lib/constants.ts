// UI-only admin emails (NOT a security mechanism — role checks enforced server-side via RLS/user_roles)
// Set via VITE_ADMIN_EMAILS env var (comma-separated) to avoid hardcoding
export const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || 'giansunga396@gmail.com,deang.elaizah0505@gmail.com,samuellelucas20@gmail.com,ailamavelyn.naguit@gmail.com').split(',').map((e: string) => e.trim());

// UI hint only. The matching permission is enforced by the assign/remove
// super-admin RPCs in Supabase.
export const SUPER_ADMIN_MANAGER_EMAILS = ['giansunga396@gmail.com'];

// UI-only shop emails (NOT a security mechanism — role checks enforced server-side)
export const SHOP_EMAILS = (import.meta.env.VITE_SHOP_EMAILS || 'regalapottery@gmail.com').split(',').map((e: string) => e.trim());

// Privacy-preserving seller-facing fallback for accounts without a saved name.
export const FALLBACK_BUYER_NAME = 'Customer';
