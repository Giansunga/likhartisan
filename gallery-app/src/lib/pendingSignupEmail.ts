const KEY = 'likhartisan:pending-signup-email';

export function savePendingSignupEmail(email: string) {
  sessionStorage.setItem(KEY, email.trim());
}

export function getPendingSignupEmail() {
  return sessionStorage.getItem(KEY) ?? '';
}

export function clearPendingSignupEmail() {
  sessionStorage.removeItem(KEY);
}
