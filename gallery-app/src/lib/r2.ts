import { API_BASE } from './api';

export async function uploadToR2(file: File, folder: string): Promise<string> {
  // Step 1: Get presigned URL from backend
  const response = await fetch(`${API_BASE}/api/upload/presign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, folder }),
  });

  if (!response.ok) {
    throw new Error('Failed to get upload URL');
  }

  const { presignedUrl, publicUrl } = await response.json();

  // Step 2: Upload directly to R2 using presigned URL
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
