import { API_BASE } from './api';
import { portalRequest } from './portalRequest';

export async function purchaseApi<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  return portalRequest<T>(`${API_BASE}/api/orders${path}`, { ...init, signal });
}
