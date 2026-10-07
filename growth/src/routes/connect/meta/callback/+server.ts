import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveConnection } from '$lib/server/connections';

export const GET: RequestHandler = async ({ url, cookies, platform, fetch }) => {
  const env = platform?.env;
  const db = env?.DB;
  const appId = env?.META_APP_ID;
  const appSecret = env?.META_APP_SECRET;
  const encryptionKey = env?.APP_ENCRYPTION_KEY;
  const version = env?.META_GRAPH_VERSION || 'v24.0';
  if (!db || !appId || !appSecret || !encryptionKey) throw error(503, 'Meta connection backend is not configured');

  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  if (!state || state !== cookies.get('tp_meta_state') || !code) throw error(400, 'Invalid Meta OAuth callback');

  const callback = `${url.origin}/connect/meta/callback`;
  const tokenUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
  tokenUrl.searchParams.set('client_id', appId);
  tokenUrl.searchParams.set('client_secret', appSecret);
  tokenUrl.searchParams.set('redirect_uri', callback);
  tokenUrl.searchParams.set('code', code);

  const response = await fetch(tokenUrl);
  if (!response.ok) throw error(502, 'Meta token exchange failed');
  const token = await response.json() as { access_token: string; token_type?: string; expires_in?: number };

  const meUrl = new URL(`https://graph.facebook.com/${version}/me`);
  meUrl.searchParams.set('fields', 'id,name');
  meUrl.searchParams.set('access_token', token.access_token);
  const me = await fetch(meUrl).then((r) => r.ok ? r.json() : null) as { id?: string; name?: string } | null;

  await saveConnection({
    db,
    encryptionKey,
    provider: 'meta',
    accessToken: token.access_token,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    scopes: 'ads_read,business_management',
    accountId: me?.id ?? null,
    accountName: me?.name ?? 'Meta',
    metadata: { tokenType: token.token_type ?? null, graphVersion: version }
  });

  cookies.delete('tp_meta_state', { path: '/' });
  throw redirect(302, '/settings?connected=meta');
};
