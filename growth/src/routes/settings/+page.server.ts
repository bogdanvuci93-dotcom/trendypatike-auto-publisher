import type { PageServerLoad } from './$types';
import { listConnectionStatus } from '$lib/server/connections';

export const load: PageServerLoad = async ({ platform, url }) => {
  const env = platform?.env;
  let trackerSessions24h = 0;
  if (env?.DB) {
    try {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM sessions WHERE last_seen_at >= ?1`)
        .bind(Date.now() - 24 * 60 * 60 * 1000)
        .first<{ count: number }>();
      trackerSessions24h = Number(row?.count || 0);
    } catch {}
  }

  return {
    connections: await listConnectionStatus(env?.DB),
    connected: url.searchParams.get('connected'),
    configured: {
      db: Boolean(env?.DB),
      encryption: Boolean(env?.APP_ENCRYPTION_KEY),
      shopify: Boolean(env?.SHOPIFY_CLIENT_ID && env?.SHOPIFY_CLIENT_SECRET),
      meta: Boolean(env?.META_APP_ID && env?.META_APP_SECRET)
    },
    tracker: {
      scriptUrl: `${url.origin}/tracker.js`,
      sessions24h: trackerSessions24h
    }
  };
};
