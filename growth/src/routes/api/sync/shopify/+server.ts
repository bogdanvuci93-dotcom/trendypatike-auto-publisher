import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncShopify } from '$lib/server/sync';

export const POST: RequestHandler = async ({ platform, fetch }) => {
  try {
    const result = await syncShopify(platform?.env ?? {}, fetch);
    return json(result);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Shopify sync failed' }, { status: 502 });
  }
};
