import { API_BASE } from './api';
import { portalRequest } from './portalRequest';

export async function purchaseApi<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  return portalRequest<T>(`${API_BASE}/api/orders${path}`, { ...init, signal });
}

export function downloadPurchaseReceipt(orderId:string,signal?:AbortSignal):Promise<Blob> {
  return portalRequest<Blob>(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}/receipt`, {signal}, undefined, 'pdf');
}
