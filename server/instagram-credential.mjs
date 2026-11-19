import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

function encryptionKey(secret) {
  if (!secret) throw new Error('SESSION_SECRET lipsește.');
  return Buffer.from(hkdfSync('sha256', secret, '', 'silent-forward/instagram-credential/v1', 32));
}

export function sealInstagramCredential(token, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function unseal(ciphertext, secret) {
  const [iv, tag, payload] = ciphertext.split('.').map((part) => Buffer.from(part, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(payload), cipher.final()]).toString('utf8');
}

const bucket = 'instagram-publisher-config';
const objectPath = 'credential.v1';
let cached;
let pending;

async function fetchProductionCredential() {
  const { supabase } = await import('./supabase.mjs');
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error && !/not found|does not exist/i.test(error.message)) {
    throw new Error('Setarea Instagram nu a putut fi citită.');
  }
  const token = data
    ? unseal(await data.text(), process.env.SESSION_SECRET)
    : process.env.INSTAGRAM_ACCESS_TOKEN;
  cached = { token, until: Date.now() + 60_000 };
  return token;
}

export function getInstagramCredential() {
  if (!process.env.VERCEL) return Promise.resolve(process.env.INSTAGRAM_ACCESS_TOKEN);
  if (cached && cached.until > Date.now()) return Promise.resolve(cached.token);
  pending ??= fetchProductionCredential().finally(() => { pending = undefined; });
  return pending;
}

export async function configureProductionInstagram(token) {
  const { supabase } = await import('./supabase.mjs');
  const credential = sealInstagramCredential(token, process.env.SESSION_SECRET);
  const { error } = await supabase.storage.from(bucket).upload(objectPath, Buffer.from(credential), {
    contentType: 'application/octet-stream',
    upsert: true,
    cacheControl: '0',
  });
  if (error) throw new Error('Setarea Instagram nu a putut fi salvată.');
  cached = { token, until: Date.now() + 60_000 };
}
