import { useSyncExternalStore } from 'react';
export type PopupKind = 'success' | 'error' | 'info' | 'confirm';
export interface PopupRequest { id: number; kind: PopupKind; message: string; title: string; confirmLabel?: string; danger?: boolean; resolve?: (accepted: boolean) => void }
let serial = 0;
let requests: PopupRequest[] = [];
let slots: number[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function usePopupRequests() { return useSyncExternalStore(subscribe, () => requests); }
export function usePopupSlot() { return useSyncExternalStore(subscribe, () => slots[0]); }
export function registerPopupSlot(id: number) { slots = [...slots, id]; emit(); return () => { slots = slots.filter(slot => slot !== id); emit(); }; }
export function nextPopupId() { return ++serial; }
export function dismissPopup(id: number, accepted = false) { const item = requests.find(item => item.id === id); requests = requests.filter(item => item.id !== id); emit(); item?.resolve?.(accepted); }
export function notify(kind: Exclude<PopupKind, 'confirm'>, message: string) {
  if (requests.some(item => item.kind === kind && item.message === message)) return;
  requests = [...requests, { id: nextPopupId(), kind, message, title: kind === 'success' ? 'Success' : kind === 'error' ? 'Something went wrong' : 'Please note' }]; emit();
}
export const toast = { success: (message: string) => notify('success', message), error: (message: string) => notify('error', message), info: (message: string) => notify('info', message) };
export function confirmAction(message: string, options: { title?: string; confirmLabel?: string; danger?: boolean } = {}) {
  return new Promise<boolean>(resolve => { requests = [...requests, { id: nextPopupId(), kind: 'confirm', message, title: options.title ?? 'Confirm action', confirmLabel: options.confirmLabel ?? (/delete this design/i.test(message) ? 'Delete design' : /delete this conversation/i.test(message) ? 'Delete conversation' : /delete this artisan/i.test(message) ? 'Delete artisan' : /delete this model/i.test(message) ? 'Delete model' : /recommendation/i.test(message) ? 'Reset history' : /reset/i.test(message) ? 'Reset design' : /switch shop/i.test(message) ? 'Switch shop' : /replace/i.test(message) ? 'Replace design' : /archive/i.test(message) ? 'Archive model' : /activate/i.test(message) ? 'Activate model' : 'Continue'), danger: options.danger ?? /delete|reset|replace/i.test(message), resolve }]; emit(); });
}
