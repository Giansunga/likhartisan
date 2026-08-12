import { API_BASE } from './api';
import { supabase } from './supabase';

export async function uploadToR2(file: File, folder: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You must be signed in to upload files.');

  const response = await fetch(`${API_BASE}/api/upload/file`, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      Authorization: `Bearer ${session.access_token}`,
      'X-File-Name': encodeURIComponent(file.name),
      'X-Upload-Folder': folder,
    },
    body: file,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || 'Failed to upload file');
  }
  const { publicUrl } = await response.json();
  return publicUrl;
}

export function getR2PublicUrl(key: string): string {
  return key; // Keys are now full URLs from the backend
}
