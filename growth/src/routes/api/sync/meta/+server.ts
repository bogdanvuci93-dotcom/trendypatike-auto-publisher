import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncMeta } from '$lib/server/sync';

export const POST: RequestHandler = async ({ platform, fetch }) => {
  try {
    const result = await syncMeta(platform?.env ?? {}, fetch, 7);
    return json(result);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : 'Meta sync failed' }, { status: 502 });
  }
};
