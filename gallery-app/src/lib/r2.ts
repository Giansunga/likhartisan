import { API_BASE } from './api';
import { supabase } from './supabase';
import { createSessionAccessManager } from './authSession';
const getAccessToken = createSessionAccessManager(supabase.auth, () => undefined);

export async function uploadToR2(file: File, folder: string, scope?: { shopId: string }): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('You must be signed in to upload files.');

  const response = await fetch(`${API_BASE}/api/upload/${scope ? 'product-file' : 'file'}`, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      Authorization: `Bearer ${token}`,
      'X-File-Name': encodeURIComponent(file.name),
      'X-Upload-Folder': folder,
      ...(scope ? { 'X-Shop-Id': scope.shopId } : {}),
    },
    body: file,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || 'Failed to upload file');
  }
  const { publicUrl } = await response.json();
  if (typeof publicUrl !== 'string' || !publicUrl) throw new Error('The uploaded file URL could not be confirmed.');
  return publicUrl;
}

export function getR2PublicUrl(key: string): string {
  return key; // Keys are now full URLs from the backend
}
