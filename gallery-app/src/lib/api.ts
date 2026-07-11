// Single source of truth for the backend (Render) base URL.
// Vite bakes env vars at build time — redeploy the frontend after changing
// VITE_PAYMONGO_API_URL. A wrong/missing value silently breaks payments, so
// keep this in ONE place.
export const API_BASE = import.meta.env.VITE_PAYMONGO_API_URL || 'http://localhost:3001';
