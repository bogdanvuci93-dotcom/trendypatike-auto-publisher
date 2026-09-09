import type { PageServerLoad } from './$types';
import { listConnectionStatus } from '$lib/server/connections';

const TRACKER_VERSION = '20260909-2';

export const load: PageServerLoad = async ({ platform, url }) => {
  const env = platform?.env;
  let trackerSessions24h = 0;
  let trackerLastSeenAt = 0;
  if (env?.DB) {
    try {
      const row = await env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(MAX(last_seen_at),0) AS last_seen_at
        FROM sessions
        WHERE last_seen_at >= ?1
      `)
        .bind(Date.now() - 24 * 60 * 60 * 1000)
        .first<{ count: number; last_seen_at: number }>();
      trackerSessions24h = Number(row?.count || 0);
      trackerLastSeenAt = Number(row?.last_seen_at || 0);
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
      scriptUrl: `${url.origin}/tracker.js?v=${TRACKER_VERSION}`,
      sessions24h: trackerSessions24h,
      lastSeenAt: trackerLastSeenAt,
      collectorUrl: `${url.origin}/api/collect?health=1`
    }
  };
};
