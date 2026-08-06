import { API_BASE } from '../lib/api';
import { supabase } from '../lib/supabase';

export async function uploadDesignGLB(glbBuffer: ArrayBuffer): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const response = await fetch(`${API_BASE}/api/designs/upload-model`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) return null;

  const { presignedUrl, publicUrl } = await response.json();

  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    body: glbBuffer,
    headers: {
      'Content-Type': 'model/gltf-binary',
    },
  });

  if (!uploadResponse.ok) return null;

  return publicUrl;
}