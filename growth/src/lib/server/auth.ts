const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function expectedSession(secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode('trendypatike-growth-admin-v1')));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function verifyAdminCookie(value: string | undefined, secret: string | undefined) {
  if (!value || !secret) return false;
  return safeEqual(value, await expectedSession(secret));
}

export async function createAdminCookie(secret: string) {
  return expectedSession(secret);
}

export function verifyPassword(supplied: string, expected: string) {
  return safeEqual(supplied, expected);
}
