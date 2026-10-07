import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
  const appId = platform?.env?.META_APP_ID;
  const version = platform?.env?.META_GRAPH_VERSION || 'v24.0';
  if (!appId) throw error(503, 'META_APP_ID is not configured');

  const state = crypto.randomUUID();
  cookies.set('tp_meta_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  const callback = `${url.origin}/connect/meta/callback`;
  const auth = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  auth.searchParams.set('client_id', appId);
  auth.searchParams.set('redirect_uri', callback);
  auth.searchParams.set('state', state);
  auth.searchParams.set('scope', 'ads_read,business_management');
  auth.searchParams.set('response_type', 'code');
  throw redirect(302, auth.toString());
};
