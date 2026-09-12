const te = new TextEncoder();
const td = new TextDecoder();

function normalizeBase64(value: string) {
  const clean = String(value || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  const pad = clean.length % 4;
  return pad ? clean + '='.repeat(4 - pad) : clean;
}

function fromBase64(value: string) {
  const binary = atob(normalizeBase64(value));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function toBase64(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importKey(secret: string) {
  const raw = fromBase64(secret);
  if (raw.byteLength !== 32) throw new Error('APP_ENCRYPTION_KEY must decode to exactly 32 bytes (standard base64 or base64url)');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importKey(secret);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(value));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string, secret: string) {
  const [iv64, data64] = value.split('.');
  if (!iv64 || !data64) throw new Error('Invalid encrypted value');
  const key = await importKey(secret);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv64) }, key, fromBase64(data64));
  return td.decode(decrypted);
}
