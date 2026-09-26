import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const SHOP_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
  const shop = (url.searchParams.get('shop') || '').trim().toLowerCase();
  const clientId = platform?.env?.SHOPIFY_CLIENT_ID;
  if (!clientId) throw error(503, 'SHOPIFY_CLIENT_ID is not configured');
  if (!SHOP_RE.test(shop)) throw error(400, 'Use the shop domain, for example trendypatike.myshopify.com');

  const state = crypto.randomUUID();
  cookies.set('tp_shopify_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  cookies.set('tp_shopify_shop', shop, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });

  const callback = `${url.origin}/connect/shopify/callback`;
  const auth = new URL(`https://${shop}/admin/oauth/authorize`);
  auth.searchParams.set('client_id', clientId);
  auth.searchParams.set('scope', 'read_orders,read_products,read_inventory');
  auth.searchParams.set('redirect_uri', callback);
  auth.searchParams.set('state', state);

  throw redirect(302, auth.toString());
};
