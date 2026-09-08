import type { PageServerLoad } from './$types';
import { listConnectionStatus } from '$lib/server/connections';

export const load: PageServerLoad = async ({ platform, url }) => {
  const env = platform?.env;
  return {
    connections: await listConnectionStatus(env?.DB),
    connected: url.searchParams.get('connected'),
    configured: {
      db: Boolean(env?.DB),
      encryption: Boolean(env?.APP_ENCRYPTION_KEY),
      shopify: Boolean(env?.SHOPIFY_CLIENT_ID && env?.SHOPIFY_CLIENT_SECRET),
      meta: Boolean(env?.META_APP_ID && env?.META_APP_SECRET)
    }
  };
};
