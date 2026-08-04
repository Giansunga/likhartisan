import { API_BASE } from './api';
import { supabase } from './supabase';

export async function uploadToR2(file: File, folder: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('You must be signed in to upload files.');

  const response = await fetch(`${API_BASE}/api/upload/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ filename: file.name, folder, size: file.size, contentType: file.type }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || 'Failed to get upload URL');
  }

  const { presignedUrl, publicUrl } = await response.json();

  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload file');
  }

  return publicUrl;
}

export function getR2PublicUrl(key: string): string {
  return key; // Keys are now full URLs from the backend
}
