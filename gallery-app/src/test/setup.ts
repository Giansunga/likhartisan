import '@testing-library/jest-dom/vitest';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

if (!globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
}

if (!globalThis.sessionStorage) {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
}

// jsdom does not implement the browser top-layer dialog methods.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
}
