import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveConnection } from '$lib/server/connections';

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function validHmac(url: URL, secret: string) {
  const supplied = url.searchParams.get('hmac') || '';
  const pairs = [...url.searchParams.entries()]
    .filter(([key]) => key !== 'hmac' && key !== 'signature')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(pairs)));
  if (supplied.length !== digest.length) return false;
  let mismatch = 0;
  for (let i = 0; i < digest.length; i++) mismatch |= supplied.charCodeAt(i) ^ digest.charCodeAt(i);
  return mismatch === 0;
}

export const GET: RequestHandler = async ({ url, cookies, platform, fetch }) => {
  const env = platform?.env;
  const db = env?.DB;
  const clientId = env?.SHOPIFY_CLIENT_ID;
  const clientSecret = env?.SHOPIFY_CLIENT_SECRET;
  const encryptionKey = env?.APP_ENCRYPTION_KEY;
  if (!db || !clientId || !clientSecret || !encryptionKey) throw error(503, 'Shopify connection backend is not configured');

  const state = url.searchParams.get('state') || '';
  const shop = url.searchParams.get('shop') || '';
  const code = url.searchParams.get('code') || '';
  if (!state || state !== cookies.get('tp_shopify_state')) throw error(400, 'Invalid Shopify state');
  if (shop !== cookies.get('tp_shopify_shop')) throw error(400, 'Shop domain mismatch');
  if (!code || !(await validHmac(url, clientSecret))) throw error(400, 'Invalid Shopify callback');

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
  });
  if (!response.ok) throw error(502, 'Shopify token exchange failed');
  const token = await response.json() as { access_token: string; scope?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number };

  await saveConnection({
    db,
    encryptionKey,
    provider: 'shopify',
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    scopes: token.scope ?? null,
    accountId: shop,
    accountName: shop,
    metadata: { shop }
  });

  cookies.delete('tp_shopify_state', { path: '/' });
  cookies.delete('tp_shopify_shop', { path: '/' });
  throw redirect(302, '/settings?connected=shopify');
};
