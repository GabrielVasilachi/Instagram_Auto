import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function cloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  );
}

export async function uploadToCloudinary(filePath, post) {
  if (!cloudinaryConfigured())
    throw new Error('Configurează Cloudinary pentru a publica materiale pe Instagram.');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'silent-forward';
  const publicId = post.id;
  const signatureText = `folder=${folder}&overwrite=true&public_id=${publicId}&timestamp=${timestamp}&unique_filename=false${process.env.CLOUDINARY_API_SECRET}`;
  const signature = createHash('sha1').update(signatureText).digest('hex');
  const body = new FormData();
  body.set('file', new Blob([await readFile(filePath)]), path.basename(filePath));
  body.set('api_key', process.env.CLOUDINARY_API_KEY);
  body.set('timestamp', String(timestamp));
  body.set('folder', folder);
  body.set('public_id', publicId);
  body.set('overwrite', 'true');
  body.set('unique_filename', 'false');
  body.set('signature', signature);
  const resourceType = post.format === 'reel' ? 'video' : 'image';
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
    { method: 'POST', body },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Încărcarea materialului a eșuat.');
  return result.secure_url;
}
