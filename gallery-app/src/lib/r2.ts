import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${import.meta.env.VITE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: import.meta.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadToR2(file: File, folder: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'bin';
  const key = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  await r2.send(new PutObjectCommand({
    Bucket: import.meta.env.VITE_R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: file.type || 'application/octet-stream',
  }));

  return `${import.meta.env.VITE_R2_PUBLIC_URL}/${key}`;
}

export function getR2PublicUrl(key: string): string {
  return `${import.meta.env.VITE_R2_PUBLIC_URL}/${key}`;
}
