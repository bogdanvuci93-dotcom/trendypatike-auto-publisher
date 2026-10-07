import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncShopify } from '$lib/server/sync';

export const POST: RequestHandler = async ({ platform, fetch, url }) => {
  try {
    const fast = url.searchParams.get('fast') === '1';
    const result = await syncShopify(platform?.env ?? {}, fetch, fast ? 2 : 31, fast ? 20000 : 0);
    return json(result);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Shopify sync failed' }, { status: 502 });
  }
};
