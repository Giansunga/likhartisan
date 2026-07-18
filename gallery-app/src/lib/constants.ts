// UI-only admin emails (NOT a security mechanism — role checks enforced server-side via RLS/user_roles)
// Set via VITE_ADMIN_EMAILS env var (comma-separated) to avoid hardcoding
export const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || 'giansunga396@gmail.com,deang.elaizah0505@gmail.com,samuellelucas20@gmail.com').split(',').map((e: string) => e.trim());

// UI-only shop emails (NOT a security mechanism — role checks enforced server-side)
export const SHOP_EMAILS = (import.meta.env.VITE_SHOP_EMAILS || 'regalapottery@gmail.com').split(',').map((e: string) => e.trim());

// Shared fallback name for unnamed buyers — used as both display text AND comparison sentinel
export const FALLBACK_BUYER_NAME = 'Buyer';
