const KEY = 'lk_shopping_auth_return';
export function shoppingDestination(): string | null { const path = sessionStorage.getItem(KEY); return path && /^(\/cart|\/checkout|\/product\/[^/?#]+)$/.test(path) ? path : null; }
export function clearShoppingDestination() { sessionStorage.removeItem(KEY); }
export function requestShoppingSignIn(path: string) { sessionStorage.setItem(KEY, path); window.dispatchEvent(new CustomEvent('open-auth', { detail: { view: 'signin' } })); }
