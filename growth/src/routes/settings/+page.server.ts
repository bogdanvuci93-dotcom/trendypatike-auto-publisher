import type { PageServerLoad } from './$types';
import { listConnectionStatus } from '$lib/server/connections';

const TRACKER_VERSION = '20260909-4';

export const load: PageServerLoad = async ({ platform, url }) => {
  const env = platform?.env;
  let trackerSessions24h = 0;
  let trackerLastSeenAt = 0;
  let syncState: Record<string,{lastSuccessAt:number;lastAttemptAt:number;lastError:string;result:Record<string,unknown>}> = {};

  if (env?.DB) {
    try {
      const row = await env.DB.prepare(`
        SELECT COUNT(*) AS count, COALESCE(MAX(last_seen_at),0) AS last_seen_at
        FROM sessions
        WHERE last_seen_at >= ?1
      `).bind(Date.now() - 24 * 60 * 60 * 1000).first<{ count: number; last_seen_at: number }>();
      trackerSessions24h = Number(row?.count || 0);
      trackerLastSeenAt = Number(row?.last_seen_at || 0);
    } catch {}

    try {
      const result = await env.DB.prepare(`SELECT provider,last_success_at,last_attempt_at,last_error,result_json FROM sync_state`).all();
      for (const row of result.results as any[]) {
        let parsed: Record<string,unknown> = {};
        try { parsed = JSON.parse(String(row.result_json || '{}')); } catch {}
        syncState[String(row.provider)] = {
          lastSuccessAt: Number(row.last_success_at || 0),
          lastAttemptAt: Number(row.last_attempt_at || 0),
          lastError: String(row.last_error || ''),
          result: parsed
        };
      }
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
    autosync: { intervalMinutes: 15, state: syncState },
    tracker: {
      scriptUrl: `${url.origin}/tracker.js?v=${TRACKER_VERSION}`,
      sessions24h: trackerSessions24h,
      lastSeenAt: trackerLastSeenAt,
      collectorUrl: `${url.origin}/api/collect?health=1`
    }
  };
};
